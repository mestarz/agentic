package passes

import (
	"context"
	"time"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
)

type SystemPromptPass struct {}

func NewSystemPromptPass() *SystemPromptPass {
	return &SystemPromptPass{}
}

func (p *SystemPromptPass) Name() string {
	return "SystemPromptPass"
}

func (p *SystemPromptPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	sysMsg := domain.Message{
		Role:      domain.RoleSystem,
		Content:   "ContextFabric Engine. Time: " + time.Now().Format("15:04:05"),
		Timestamp: time.Now(),
	}
	
	// 插入到头部
	data.Messages = append([]domain.Message{sysMsg}, data.Messages...)
	
	return nil
}