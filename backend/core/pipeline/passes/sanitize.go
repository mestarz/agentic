package passes

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	"log"
)

// SanitizePass 负责在会话处理完成后触发记忆清洗与录入。
// 这是一个“观察者”类型的 Pass，它不修改上下文内容，只负责异步提取事实。
type SanitizePass struct {
	memorySvc interface {
		Ingest(ctx context.Context, sessionID string, messages []domain.Message, modelID string, sanitizationModel string) error
	}
}

func NewSanitizePass(svc interface {
	Ingest(ctx context.Context, sessionID string, messages []domain.Message, modelID string, sanitizationModel string) error
}) *SanitizePass {
	return &SanitizePass{memorySvc: svc}
}

func (p *SanitizePass) Name() string {
	return "Sanitizer"
}

func (p *SanitizePass) Description() string {
	return "提取对话事实并存入暂存区"
}

func (p *SanitizePass) Run(ctx context.Context, data *pipeline.ContextData) error {
	log.Printf("[SanitizerPass] Flagging session %s for background ingest", data.SessionID)
	// 在 Pipeline 运行过程中，我们只标记需要进行记忆录入
	// 实际触发在消息真正持久化之后
	data.Meta["needs_ingest"] = true
	return nil
}
