package context

import (
	"context-fabric/backend/internal/domain"
	"github.com/pkoukk/tiktoken-go"
)

type Tokenizer struct {
	encoding *tiktoken.Tiktoken
}

func NewTokenizer() (*Tokenizer, error) {
	// 默认使用 cl100k_base (GPT-4 / DeepSeek 常用编码)
	tkm, err := tiktoken.GetEncoding("cl100k_base")
	if err != nil {
		return nil, err
	}
	return &Tokenizer{encoding: tkm}, nil
}

// CountTokens 计算单条文本的 Token 数
func (t *Tokenizer) CountTokens(text string) int {
	return len(t.encoding.Encode(text, nil, nil))
}

// CountMessagesTokens 计算整个消息列表的 Token 数 (包含角色开销)
func (t *Tokenizer) CountMessagesTokens(messages []domain.Message) int {
	tokens := 0
	for _, m := range messages {
		// 每条消息的基础开销 (角色、分隔符等) 约 4 tokens
		tokens += 4
		tokens += t.CountTokens(m.Content)
		tokens += t.CountTokens(m.Role)
	}
	// 整个对话最后还有约 3 tokens 的结束符开销
	tokens += 3
	return tokens
}
