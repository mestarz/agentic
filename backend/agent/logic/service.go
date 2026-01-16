package logic

import (
	"bytes"
	"context"
	"context-fabric/backend/agent/domain"
	"context-fabric/backend/agent/llm"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type CoreClient struct {
	url    string
	client *http.Client
}

func NewCoreClient(u string) *CoreClient { return &CoreClient{url: u, client: &http.Client{}} }
func (c *CoreClient) GetContext(ctx context.Context, id, query string, cfg domain.LLMConfig) ([]domain.Message, error) {
	data, _ := json.Marshal(map[string]interface{}{"session_id": id, "query": query, "config": cfg})
	resp, _ := c.client.Post(c.url+"/api/v1/context", "application/json", bytes.NewBuffer(data))
	defer resp.Body.Close()
	var res struct {
		Messages []domain.Message `json:"messages"`
	}
	json.NewDecoder(resp.Body).Decode(&res)
	return res.Messages, nil
}
func (c *CoreClient) Append(ctx context.Context, id string, msg domain.Message) map[string]interface{} {
	data, _ := json.Marshal(map[string]interface{}{"session_id": id, "message": msg})
	resp, err := c.client.Post(c.url+"/api/v1/messages", "application/json", bytes.NewBuffer(data))
	if err != nil { return nil }
	defer resp.Body.Close()
	var meta map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&meta)
	return meta
}

type AgentService struct{ cc *CoreClient }

func NewAgentService(cc *CoreClient) *AgentService { return &AgentService{cc: cc} }
type SSEResponse struct {
	Type    string                 `json:"type"` // "chunk", "meta", "trace"
	Content string                 `json:"content"`
	Meta    map[string]interface{} `json:"meta,omitempty"`
	Trace   *domain.TraceEvent     `json:"trace,omitempty"`
}

func (s *AgentService) Chat(ctx context.Context, id, query string, agentCfg, coreCfg domain.LLMConfig, out chan<- string) {
	payload, _ := s.cc.GetContext(ctx, id, query, coreCfg)
	var collectedTraces []domain.TraceEvent
	
	send := func(resp SSEResponse) {
		if resp.Type == "trace" && resp.Trace != nil {
			collectedTraces = append(collectedTraces, *resp.Trace)
		}
		data, _ := json.Marshal(resp)
		out <- string(data)
	}

	trace := func(source, target, action string, data ...interface{}) {
		var d interface{}
		if len(data) > 0 { d = data[0] }
		send(SSEResponse{
			Type: "trace",
			Trace: &domain.TraceEvent{
				Source: source, Target: target, Action: action, Data: d, Timestamp: time.Now(),
			},
		})
	}

	// Trace: Frontend -> Agent (Request received)
	trace("Frontend", "Agent", "Receive Query", query)

	// Trace: Agent -> Core (Get Context)
	trace("Agent", "Core", "Get Optimized Context", coreCfg)
	
	// Trace: Core -> Agent (Context Received)
	trace("Core", "Agent", "Return Payload", map[string]interface{}{"msg_count": len(payload)})

	// Send initial meta
	if len(payload) > 0 && payload[len(payload)-1].Meta != nil {
		send(SSEResponse{Type: "meta", Meta: payload[len(payload)-1].Meta})
	}

	lp := llm.NewProvider(agentCfg)
	internal := make(chan string)
	var full strings.Builder

	save := func() {
		if full.Len() > 0 {
			// Trace: Agent -> Core (Save Assistant Message)
			trace("Agent", "Core", "Append Assistant Message")
			meta := s.cc.Append(context.Background(), id, domain.Message{
				Role:      "assistant",
				Content:   full.String(),
				Timestamp: time.Now(),
				Traces:    collectedTraces,
			})
			if meta != nil {
				send(SSEResponse{Type: "meta", Meta: meta})
				// Trace: Core -> Agent (Meta updated)
				trace("Core", "Agent", "Updated Stats", meta)
			}
		}
	}

	// Trace: Agent -> LLM (Start Stream)
	trace("Agent", "LLM", "Start Streaming", agentCfg.Model)

	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				trace("Frontend", "Agent", "Interrupt Detected")
				save()
				return 
			case c, ok := <-internal:
				if !ok {
					save()
					return
				}
				full.WriteString(c)
				send(SSEResponse{Type: "chunk", Content: c})
			}
		}
	}()
	lp.ChatStream(ctx, payload, internal)
}
