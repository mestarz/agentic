package chat

import (
	"context"
	"strings"
	"time"

	"context-fabric/backend/internal/domain"
	"context-fabric/backend/internal/infrastructure/llm"
	"context-fabric/backend/internal/service/history"
)

type Orchestrator struct {
	historyService *history.Service
	contextEngine  domain.ContextEngine
}

func NewOrchestrator(hs *history.Service, ce domain.ContextEngine) *Orchestrator {
	return &Orchestrator{
		historyService: hs,
		contextEngine:  ce,
	}
}

func (o *Orchestrator) Chat(ctx context.Context, sessionID, appID, query string, llmCfg domain.LLMConfig) (string, error) {
	lp, err := llm.NewLLMProvider(llmCfg)
	if err != nil { return "", err }
	
	o.historyService.GetOrCreateSession(ctx, sessionID, appID)
	o.historyService.Append(ctx, sessionID, domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()})

	payload, err := o.contextEngine.BuildPayload(ctx, sessionID, query, llmCfg)
	if err != nil { return "", err }

	reply, err := lp.Chat(ctx, payload)
	if err != nil { return "", err }

	// 存入带有 Meta 的回复
	var contextMeta map[string]interface{}
	if len(payload) > 0 {
		contextMeta = payload[len(payload)-1].Meta
	}

	o.historyService.Append(ctx, sessionID, domain.Message{
		Role:      domain.RoleAssistant,
		Content:   reply,
		Timestamp: time.Now(),
		Meta:      contextMeta,
	})
	return reply, nil
}

func (o *Orchestrator) ChatStream(ctx context.Context, sessionID, appID, query string, llmCfg domain.LLMConfig, outChan chan<- string) error {
	lp, err := llm.NewLLMProvider(llmCfg)
	if err != nil { return err }

	o.historyService.GetOrCreateSession(ctx, sessionID, appID)
	o.historyService.Append(ctx, sessionID, domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()})

	payload, err := o.contextEngine.BuildPayload(ctx, sessionID, query, llmCfg)
	if err != nil { return err }

	// 提取 ContextEngine 计算好的统计信息
	var contextMeta map[string]interface{}
	if len(payload) > 0 {
		contextMeta = payload[len(payload)-1].Meta
	}

	internalChan := make(chan string)
	var fullContent strings.Builder

	go func() {
		defer close(outChan)
		for chunk := range internalChan {
			fullContent.WriteString(chunk)
			outChan <- chunk
		}
		// 流结束后，持久化带有 Meta 的助手回复
		o.historyService.Append(ctx, sessionID, domain.Message{
			Role:      domain.RoleAssistant,
			Content:   fullContent.String(),
			Timestamp: time.Now(),
			Meta:      contextMeta,
		})
	}()

	return lp.ChatStream(ctx, payload, internalChan)
}