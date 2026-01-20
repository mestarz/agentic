package passes

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	
	"github.com/pkoukk/tiktoken-go"
)

// TokenLimitPass 负责执行上下文的截断策略。
// 当消息总长度超过模型限制时，它会按照一定的规则保留关键消息。
type TokenLimitPass struct {
	tke      *tiktoken.Tiktoken
	maxTokens int
}

// NewTokenLimitPass 创建一个带有 Token 限制的截断处理器。
func NewTokenLimitPass(maxTokens int) *TokenLimitPass {
	// 初始化 tiktoken 编码器 (针对 cl100k_base 优化)
	tke, _ := tiktoken.GetEncoding("cl100k_base")
	return &TokenLimitPass{
		tke:       tke,
		maxTokens: maxTokens,
	}
}

func (p *TokenLimitPass) Name() string {
	return "TokenLimitPass"
}

func (p *TokenLimitPass) Description() string {
	return "Token 限制与截断"
}

// Run 执行截断逻辑：保留首条系统消息，并从后往前尝试保留最近的历史消息，超出 Token 上限的消息将被跳过。
func (p *TokenLimitPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	// 内部工具函数：计算文本占用的 Token 数
	estimate := func(s string) int {
		if p.tke == nil { return len(s) / 4 }
		tokens := p.tke.Encode(s, nil, nil)
		return len(tokens)
	}

	if len(data.Messages) == 0 {
		return nil
	}

	// 截断策略：始终保留第一条系统消息 (System Message)，
	// 其余消息（用户/助理对话历史）按照时间倒序尝试加入，直到填满配额。
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

	// 从最近的消息开始倒序遍历
	for i := len(otherMsgs) - 1; i >= 0; i-- {
		msg := otherMsgs[i]
		t := estimate(msg.Content)
		
		// 检查是否超出配额
		if currentTokens+t > p.maxTokens {
			// 记录由于截断而被丢弃的消息轨迹
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
		
		// 加入选中列表并更新计数
		selected = append([]domain.Message{msg}, selected...)
		currentTokens += t
	}

	// 重组最终的消息列表
	if hasSysMsg {
		data.Messages = append([]domain.Message{sysMsg}, selected...)
	} else {
		data.Messages = selected
	}
	
	// 更新元数据，反馈给前端统计
	data.Meta["tokens_total"] = currentTokens
	data.Meta["tokens_max"] = p.maxTokens

	return nil
}
