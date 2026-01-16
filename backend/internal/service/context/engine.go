package context

import (
	"context"
	"time"

	"context-fabric/backend/internal/domain"
)

type Engine struct {
	repo      domain.HistoryRepository
	tokenizer *Tokenizer
}

func NewEngine(repo domain.HistoryRepository) *Engine {
	tkm, _ := NewTokenizer()
	return &Engine{
		repo:      repo,
		tokenizer: tkm,
	}
}

func (e *Engine) BuildPayload(ctx context.Context, sessionID string, currentQuery string, llmCfg domain.LLMConfig) ([]domain.Message, error) {
	session, err := e.repo.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	rawMessages := session.Messages
	
	systemMsg := domain.Message{
		Role:    domain.RoleSystem,
		Content: "你是一个由 ContextFabric 驱动的 AI 助手。当前时间: " + time.Now().Format("15:04:05"),
	}

	const maxContextTokens = 4000
	systemTokens := e.tokenizer.CountMessagesTokens([]domain.Message{systemMsg})
	availableTokens := maxContextTokens - systemTokens

	var selectedHistory []domain.Message
	currentTokens := 0

	for i := len(rawMessages) - 1; i >= 0; i-- {
		msg := rawMessages[i]
		msgTokens := e.tokenizer.CountMessagesTokens([]domain.Message{msg})
		
		if currentTokens+msgTokens > availableTokens {
			break
		}
		
		selectedHistory = append([]domain.Message{msg}, selectedHistory...)
		currentTokens += msgTokens
	}

	finalPayload := append([]domain.Message{systemMsg}, selectedHistory...)

	// --- 注入结构化 Token 统计 ---
	if len(finalPayload) > 0 {
		total := e.tokenizer.CountMessagesTokens(finalPayload)
		// 存储为对象，方便前端读取
		finalPayload[len(finalPayload)-1].Meta = map[string]interface{}{
			"tokens_total": total,
			"tokens_max":   maxContextTokens,
			"msg_count":    len(finalPayload),
		}
	}

	return finalPayload, nil
}
