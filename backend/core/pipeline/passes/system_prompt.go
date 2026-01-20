package passes

import (
	"context"
	"time"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
)

// SystemPromptPass 负责在消息列表的起始位置注入预设的系统提示词。
type SystemPromptPass struct {}

// NewSystemPromptPass 创建一个 SystemPromptPass 实例。
func NewSystemPromptPass() *SystemPromptPass {
	return &SystemPromptPass{}
}

func (p *SystemPromptPass) Name() string {
	return "SystemPromptPass"
}

func (p *SystemPromptPass) Description() string {
	return "注入系统提示词"
}

// Run 将包含系统状态和环境信息的提示词消息插入到列表头部。
func (p *SystemPromptPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	// 构建系统消息
	sysMsg := domain.Message{
		Role:      domain.RoleSystem,
		Content:   "你是一个由 ContextFabric 驱动的智能助手。当前系统时间: " + time.Now().Format("15:04:05"),
		Timestamp: time.Now(),
	}
	
	// 确保系统消息处于上下文的最顶层
	data.Messages = append([]domain.Message{sysMsg}, data.Messages...)
	
	return nil
}
