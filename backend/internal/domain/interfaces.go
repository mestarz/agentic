package domain

import (
	"context"
)

// HistoryRepository 存储层契约
type HistoryRepository interface {
	SaveSession(ctx context.Context, session *Session) error
	GetSession(ctx context.Context, id string) (*Session, error)
	ListSessions(ctx context.Context) ([]*SessionSummary, error)
}

// LLMProvider 基础设施层契约
type LLMProvider interface {
	Chat(ctx context.Context, messages []Message) (string, error)
	// ChatStream 流式对话接口
	ChatStream(ctx context.Context, messages []Message, chunkChan chan<- string) error
	Summarize(ctx context.Context, text string) (string, error)
}

// ContextEngine 业务逻辑层契约
type ContextEngine interface {
	BuildPayload(ctx context.Context, sessionID string, currentQuery string, llmCfg LLMConfig) ([]Message, error)
}
