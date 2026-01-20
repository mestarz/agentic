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
	url    string
	client *http.Client
}

func NewCoreServiceClient(u string) *CoreServiceClient {
	return &CoreServiceClient{url: u, client: &http.Client{Timeout: 30 * time.Second}}
}

func (c *CoreServiceClient) GetOptimizedContext(ctx context.Context, id, query string, modelID string) ([]domain.Message, error) {
	data, err := json.Marshal(map[string]interface{}{"session_id": id, "query": query, "model_id": modelID})
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Post(c.url+"/api/v1/context", "application/json", bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var res struct {
		Messages []domain.Message `json:"messages"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	return res.Messages, nil
}

func (c *CoreServiceClient) Append(ctx context.Context, id string, msg domain.Message) map[string]interface{} {
	data, _ := json.Marshal(map[string]interface{}{"session_id": id, "message": msg})

	resp, err := c.client.Post(c.url+"/api/v1/messages", "application/json", bytes.NewBuffer(data))
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var meta map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&meta)
	return meta
}

type LLMGatewayClient struct {
	url    string
	client *http.Client
}

func NewLLMGatewayClient(u string) *LLMGatewayClient {
	return &LLMGatewayClient{url: u, client: &http.Client{}}
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

	req, err := http.NewRequestWithContext(ctx, "POST", l.url+"/v1/chat/completions", bytes.NewBuffer(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

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

type AgentService struct {
	coreSvc    *CoreServiceClient
	llmGateway *LLMGatewayClient
}

func NewAgentService(cc *CoreServiceClient, lg *LLMGatewayClient) *AgentService {
	return &AgentService{coreSvc: cc, llmGateway: lg}
}

type SSEResponse struct {
	Type    string                 `json:"type"` // "chunk", "meta", "trace"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
	Trace   *domain.TraceEvent     `json:"trace,omitempty"`
}

func (s *AgentService) Chat(ctx context.Context, id, query string, agentModelID, coreModelID string, out chan<- string) {
	var collectedTraces []domain.TraceEvent

	send := func(resp SSEResponse) {
		if resp.Type == "trace" && resp.Trace != nil {
			if resp.Trace.Timestamp.IsZero() {
				resp.Trace.Timestamp = time.Now()
			}
			collectedTraces = append(collectedTraces, *resp.Trace)
		}
		data, _ := json.Marshal(resp)
		out <- string(data)
	}

	trace := func(source, target, action string, data ...interface{}) {
		var d interface{}
		if len(data) > 0 {
			d = data[0]
		}
		send(SSEResponse{
			Type: "trace",
			Trace: &domain.TraceEvent{
				Source: source, Target: target, Action: action, Data: d, Timestamp: time.Now(),
			},
		})
	}

	// 1. 先记录起点 Trace
	trace("Frontend", "Agent", "Receive Query", query)
	trace("Agent", "Core", "Get Optimized Context", map[string]interface{}{
		"query": query, 
		"model_id": coreModelID,
		"endpoint": "/api/v1/context",
	})

	// 2. 再执行实际调用
	payload, err := s.coreSvc.GetOptimizedContext(ctx, id, query, coreModelID)
	if err != nil {
		trace("Agent", "Frontend", "Error", err.Error())
		close(out)
		return
	}

	// 提取并转发 Core 内部产生的 Pipeline Traces (仅针对当前请求产生的最新消息)
	if len(payload) > 0 {
		lastMsg := payload[len(payload)-1]
		for _, t := range lastMsg.Traces {
			tCopy := t
			send(SSEResponse{Type: "trace", Trace: &tCopy})
		}
	}

	// 辅助函数：提取纯净的消息内容用于展示
	cleanMessages := func(msgs []domain.Message) []map[string]string {
		res := make([]map[string]string, len(msgs))
		for i, m := range msgs {
			res[i] = map[string]string{
				"role":    m.Role,
				"content": m.Content,
			}
		}
		return res
	}

	trace("Core", "Agent", "Return Payload", map[string]interface{}{
		"context":  cleanMessages(payload),
		"endpoint": "/api/v1/context (Response)",
	})

	if len(payload) > 0 && payload[len(payload)-1].Meta != nil {
		send(SSEResponse{Type: "meta", Meta: payload[len(payload)-1].Meta})
	}

	internal := make(chan GatewayChunk)
	var full strings.Builder

	save := func() {
		if full.Len() > 0 {
			finalContent := full.String()
			trace("Agent", "Core", "Append Assistant Message", map[string]interface{}{
				"content":  finalContent,
				"endpoint": "/api/v1/messages",
			})
			meta := s.coreSvc.Append(context.Background(), id, domain.Message{
				Role:      "assistant",
				Content:   finalContent,
				Timestamp: time.Now(),
				Traces:    collectedTraces,
			})
			if meta != nil {
				send(SSEResponse{Type: "meta", Meta: meta})
				trace("Core", "Agent", "Updated Stats", map[string]interface{}{
					"meta":     meta,
					"endpoint": "/api/v1/messages (Response)",
				})
			}
		}
	}

	trace("Agent", "Gateway", "Start Streaming", map[string]interface{}{
		"model":    agentModelID,
		"prompt":   cleanMessages(payload),
		"endpoint": "/v1/chat/completions",
	})

	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				trace("Frontend", "Agent", "Interrupt Detected")
				save()
				return
			case res, ok := <-internal:
				if !ok {
					save()
					return
				}
				if res.Trace != nil {
					send(SSEResponse{Type: "trace", Trace: res.Trace})
				}
				if res.Content != "" {
					full.WriteString(res.Content)
					send(SSEResponse{Type: "chunk", Content: res.Content})
				}
			}
		}
	}()

	err = s.llmGateway.ChatStream(ctx, agentModelID, payload, internal)
	if err != nil {
		send(SSEResponse{Type: "chunk", Content: "LLM 网关错误: " + err.Error()})
	}
	
	close(internal)
}
