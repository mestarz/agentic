package logic

import (
	"bufio"
	"bytes"
	"context"
	"context-fabric/backend/agent/domain"
	"encoding/json"
	"fmt"
	"io"
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

func (c *CoreServiceClient) GetOptimizedContext(ctx context.Context, sessionID, query, modelID string, ragEnabled bool, ragEmbeddingModel string) ([]domain.Message, error) {
	requestPayload, err := json.Marshal(map[string]interface{}{
		"session_id":          sessionID,
		"query":               query,
		"model_id":            modelID,
		"rag_enabled":         ragEnabled,
		"rag_embedding_model": ragEmbeddingModel,
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

func (s *AgentService) Chat(ctx context.Context, sessionID, query, agentModelID, coreModelID string, ragEnabled bool, ragEmbeddingModel string, out chan<- string) {
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

	emitTrace("Frontend", "Agent", "Receive Query", query)
	emitTrace("Agent", "Core", "Get Optimized Context", map[string]interface{}{
		"query":               query,
		"model_id":            coreModelID,
		"rag_enabled":         ragEnabled,
		"rag_embedding_model": ragEmbeddingModel,
	})

	optimizedMsgs, err := s.coreClient.GetOptimizedContext(ctx, sessionID, query, coreModelID, ragEnabled, ragEmbeddingModel)
	if err != nil {
		emitTrace("Agent", "Frontend", "Error", err.Error())
		close(out)
		return
	}

	if len(optimizedMsgs) > 0 {
		lastMsg := optimizedMsgs[len(optimizedMsgs)-1]
		for _, t := range lastMsg.Traces {
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

	emitTrace("Core", "Agent", "Return Context", summarizeMsgs(optimizedMsgs))

	gatewayChan := make(chan GatewayChunk)
	var fullResponse strings.Builder

	persistAndFinalize := func() {
		if fullResponse.Len() > 0 {
			content := fullResponse.String()
			emitTrace("Agent", "Core", "Append Assistant Message")
			finalMeta := s.coreClient.AppendAssistantMessage(context.Background(), sessionID, domain.Message{
				Role:      domain.RoleAssistant,
				Content:   content,
				Timestamp: time.Now(),
				Traces:    collectedTraces,
			})
			if finalMeta != nil {
				sendEvent(SSEResponse{Type: "meta", Meta: finalMeta})
			}
		}
	}

	emitTrace("Agent", "Gateway", "Start Chat Stream", map[string]interface{}{
		"model": agentModelID,
	})

	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				emitTrace("Agent", "System", "Context Cancelled")
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
		sendEvent(SSEResponse{Type: "chunk", Content: "[Agent Error] " + err.Error()})
	}
	close(gatewayChan)
}
