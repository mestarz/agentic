package logic

import (
	"bufio"
	"bytes"
	"context"
	"context-fabric/backend/agent/domain"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type CoreServiceClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCoreServiceClient(url string) *CoreServiceClient {
	return &CoreServiceClient{
		baseURL:    url,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *CoreServiceClient) GetOptimizedContext(ctx context.Context, sessionID, query, modelID string, ragEnabled bool, ragEmbeddingModel string, sanitizationModel string) ([]domain.Message, error) {
	requestPayload, err := json.Marshal(map[string]interface{}{
		"session_id":            sessionID,
		"query":                 query,
		"model_id":              modelID,
		"rag_enabled":           ragEnabled,
		"rag_embedding_model":   ragEmbeddingModel,
		"sanitization_model_id": sanitizationModel,
	})
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Post(c.baseURL+"/api/v1/context", "application/json", bytes.NewBuffer(requestPayload))
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	var result struct {
		Messages []domain.Message `json:"messages"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode context response: %w", err)
	}
	return result.Messages, nil
}

func (c *CoreServiceClient) AppendAssistantMessage(ctx context.Context, sessionID string, msg domain.Message) map[string]interface{} {
	requestPayload, _ := json.Marshal(map[string]interface{}{
		"session_id": sessionID,
		"message":    msg,
	})

	resp, err := c.httpClient.Post(c.baseURL+"/api/v1/messages", "application/json", bytes.NewBuffer(requestPayload))
	if err != nil {
		return nil
	}
	defer func() { _ = resp.Body.Close() }()

	var responseMeta map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&responseMeta)
	return responseMeta
}

type LLMGatewayClient struct {
	gatewayURL string
	httpClient *http.Client
}

func NewLLMGatewayClient(url string) *LLMGatewayClient {
	return &LLMGatewayClient{gatewayURL: url, httpClient: &http.Client{}}
}

type GatewayChunk struct {
	Content string
	Trace   *domain.TraceEvent
}

func (l *LLMGatewayClient) ChatStream(ctx context.Context, modelID string, msgs []domain.Message, out chan<- GatewayChunk) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"model":    modelID,
		"messages": msgs,
		"stream":   true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", l.gatewayURL+"/v1/chat/completions", bytes.NewBuffer(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("llm gateway returned status: %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}

			var chunk struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
				Trace *domain.TraceEvent `json:"trace"`
			}
			if err := json.NewDecoder(strings.NewReader(data)).Decode(&chunk); err == nil {
				if chunk.Trace != nil {
					out <- GatewayChunk{Trace: chunk.Trace}
				}
				if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
					out <- GatewayChunk{Content: chunk.Choices[0].Delta.Content}
				}
			}
		}
	}
	return nil
}

func (l *LLMGatewayClient) GetEmbeddings(ctx context.Context, modelID string, input string) (map[string]interface{}, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"model": modelID,
		"input": input,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", l.gatewayURL+"/v1/embeddings", bytes.NewBuffer(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("llm gateway error %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode embedding response: %w", err)
	}
	return result, nil
}

type AgentService struct {
	coreClient *CoreServiceClient
	llmGateway *LLMGatewayClient
}

func NewAgentService(cc *CoreServiceClient, lg *LLMGatewayClient) *AgentService {
	return &AgentService{coreClient: cc, llmGateway: lg}
}

type SSEResponse struct {
	Type    string                 `json:"type"` // "chunk", "meta", "trace"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
	Trace   *domain.TraceEvent     `json:"trace,omitempty"`
}

func (s *AgentService) Chat(ctx context.Context, sessionID, query, agentModelID, coreModelID string, ragEnabled bool, ragEmbeddingModel string, sanitizationModel string, out chan<- string) {
	log.Printf("[Agent] Chat Request - Session: %s, Model: %s, RAG: %v", sessionID, agentModelID, ragEnabled)
	start := time.Now()

	var collectedTraces []domain.TraceEvent

	sendEvent := func(response SSEResponse) {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if response.Type == "trace" && response.Trace != nil {
			if response.Trace.Timestamp.IsZero() {
				response.Trace.Timestamp = time.Now()
			}
			collectedTraces = append(collectedTraces, *response.Trace)
		}
		jsonBytes, _ := json.Marshal(response)
		out <- string(jsonBytes)
	}

	emitTrace := func(source, target, action string, data ...interface{}) {
		var d interface{}
		if len(data) > 0 {
			d = data[0]
		}
		sendEvent(SSEResponse{
			Type: "trace",
			Trace: &domain.TraceEvent{
				Source: source, Target: target, Action: action, Data: d, Timestamp: time.Now(),
			},
		})
	}

	emitTrace("Frontend", "Agent", "接收用户指令", query)
	emitTrace("Agent", "Core", "获取优化上下文", map[string]interface{}{
		"query":               query,
		"model_id":            coreModelID,
		"rag_enabled":         ragEnabled,
		"rag_embedding_model": ragEmbeddingModel,
		// 记录清洗模型 ID，便于 Trace 追踪
		"sanitization_model": sanitizationModel,
	})

	optimizedMsgs, err := s.coreClient.GetOptimizedContext(ctx, sessionID, query, coreModelID, ragEnabled, ragEmbeddingModel, sanitizationModel)
	if err != nil {
		log.Printf("[Agent] Core Context Error - Session: %s, Error: %v", sessionID, err)
		emitTrace("Agent", "Frontend", "发生错误", err.Error())
		close(out)
		return
	}

	log.Printf("[Agent] Context Received - Session: %s, MsgCount: %d", sessionID, len(optimizedMsgs))

	if len(optimizedMsgs) > 0 {
		lastMsg := optimizedMsgs[len(optimizedMsgs)-1]
		for _, t := range lastMsg.Traces {
			// 跳过可能重复的 LLM 交互 Trace，这些将由当前的 ChatStream 过程实时产生
			if t.Action == "发送模型请求" || t.Action == "模型推理中" || t.Action == "接收模型响应" || t.Action == "响应接收完成" {
				continue
			}
			tCopy := t
			sendEvent(SSEResponse{Type: "trace", Trace: &tCopy})
		}
		if lastMsg.Meta != nil {
			sendEvent(SSEResponse{Type: "meta", Meta: lastMsg.Meta})
		}
	}

	// 辅助函数用于日志展示
	summarizeMsgs := func(msgs []domain.Message) []map[string]string {
		res := make([]map[string]string, len(msgs))
		for i, m := range msgs {
			res[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		return res
	}

	emitTrace("Core", "Agent", "返回上下文", summarizeMsgs(optimizedMsgs))

	gatewayChan := make(chan GatewayChunk)
	var fullResponse strings.Builder

	persistAndFinalize := func() {
		duration := time.Since(start).Milliseconds()
		if fullResponse.Len() > 0 {
			content := fullResponse.String()
			log.Printf("[Agent] Chat Completed - Session: %s, Duration: %dms, ResponseLen: %d", sessionID, duration, len(content))
			emitTrace("Agent", "Core", "固化助手回复")
			finalMeta := s.coreClient.AppendAssistantMessage(context.Background(), sessionID, domain.Message{
				Role:      domain.RoleAssistant,
				Content:   content,
				Timestamp: time.Now(),
				Traces:    collectedTraces,
			})
			if finalMeta != nil {
				sendEvent(SSEResponse{Type: "meta", Meta: finalMeta})
			}
		} else {
			log.Printf("[Agent] Chat Interrupted/Empty - Session: %s, Duration: %dms", sessionID, duration)
		}
	}

	log.Printf("[Agent] Starting LLM Stream - Session: %s, Model: %s", sessionID, agentModelID)

	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				log.Printf("[Agent] Context Cancelled - Session: %s", sessionID)
				emitTrace("Agent", "System", "上下文已取消")
				persistAndFinalize()
				return
			case chunk, ok := <-gatewayChan:
				if !ok {
					persistAndFinalize()
					return
				}
				if chunk.Trace != nil {
					sendEvent(SSEResponse{Type: "trace", Trace: chunk.Trace})
				}
				if chunk.Content != "" {
					fullResponse.WriteString(chunk.Content)
					sendEvent(SSEResponse{Type: "chunk", Content: chunk.Content})
				}
			}
		}
	}()

	err = s.llmGateway.ChatStream(ctx, agentModelID, optimizedMsgs, gatewayChan)
	if err != nil {
		log.Printf("[Agent] LLM Gateway Error - Session: %s, Error: %v", sessionID, err)
		sendEvent(SSEResponse{Type: "chunk", Content: "[Agent Error] " + err.Error()})
	}
	close(gatewayChan)
}
