package llm

import (
	"context"
	"fmt"
	"time"

	"context-fabric/backend/internal/domain"
)

type MockLLM struct {
	Prefix string
}

func NewMockLLM(prefix string) *MockLLM {
	return &MockLLM{Prefix: prefix}
}

func (m *MockLLM) Chat(ctx context.Context, messages []domain.Message) (string, error) {
	return fmt.Sprintf("[%s] 这是 Mock 回复。", m.Prefix), nil
}

func (m *MockLLM) ChatStream(ctx context.Context, messages []domain.Message, chunkChan chan<- string) error {
	defer close(chunkChan)
	text := fmt.Sprintf("[%s] 这是一段模拟的流式回复内容，用于验证前端打字机效果。", m.Prefix)
	for _, char := range text {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case chunkChan <- string(char):
			time.Sleep(30 * time.Millisecond)
		}
	}
	return nil
}

func (m *MockLLM) Summarize(ctx context.Context, text string) (string, error) {
	return "这是摘要。", nil
}