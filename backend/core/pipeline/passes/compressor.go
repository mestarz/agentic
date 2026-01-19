package passes

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	
	"github.com/pkoukk/tiktoken-go"
)

type TokenLimitPass struct {
	tke      *tiktoken.Tiktoken
	maxTokens int
}

func NewTokenLimitPass(maxTokens int) *TokenLimitPass {
	tke, _ := tiktoken.GetEncoding("cl100k_base")
	return &TokenLimitPass{
		tke:       tke,
		maxTokens: maxTokens,
	}
}

func (p *TokenLimitPass) Name() string {
	return "TokenLimitPass"
}

func (p *TokenLimitPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	estimate := func(s string) int {
		if p.tke == nil { return len(s) / 4 }
		tokens := p.tke.Encode(s, nil, nil)
		return len(tokens)
	}

	if len(data.Messages) == 0 {
		return nil
	}

	// 策略：始终保留第一个 System Message (如果存在)，其余倒序保留
	var sysMsg domain.Message
	hasSysMsg := false
	var otherMsgs []domain.Message
	
	if data.Messages[0].Role == domain.RoleSystem {
		sysMsg = data.Messages[0]
		hasSysMsg = true
		otherMsgs = data.Messages[1:]
	} else {
		otherMsgs = data.Messages
	}

	currentTokens := 0
	if hasSysMsg {
		currentTokens = estimate(sysMsg.Content)
	}
	
	var selected []domain.Message

	// 倒序遍历 History
	for i := len(otherMsgs) - 1; i >= 0; i-- {
		msg := otherMsgs[i]
		t := estimate(msg.Content)
		// 如果单条消息就超过上限，且不是系统消息，我们可能需要强行截断它(这里简化为丢弃)
		// 或者如果加上这条消息超过总上限，则丢弃
		if currentTokens+t > p.maxTokens {
			// 触发截断 Trace
			data.Traces = append(data.Traces, map[string]interface{}{
				"source": "TokenLimitPass",
				"target": "Messages",
				"action": "Truncate",
				"data": map[string]interface{}{
					"dropped_msg_index": i,
					"msg_length": t,
				},
			})
			continue
		}
		selected = append([]domain.Message{msg}, selected...)
		currentTokens += t
	}

	// 重组：System + Selected History
	if hasSysMsg {
		data.Messages = append([]domain.Message{sysMsg}, selected...)
	} else {
		data.Messages = selected
	}
	
	// 写入 Meta
	data.Meta["tokens_total"] = currentTokens
	data.Meta["tokens_max"] = p.maxTokens

	return nil
}