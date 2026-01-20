package pipeline

import (
	"context"
	"context-fabric/backend/core/domain"
)

// ContextData 在 Pipeline 中流转的数据上下文
// 它充当所有 Pass 的共享黑板
type ContextData struct {
	SessionID string
	Messages  []domain.Message
	
	// Meta 用于在 Pass 之间传递临时数据
	// 例如: Token计数结果, 检索到的文档片段等
	Meta map[string]interface{}
	
	// Traces 用于收集 Pipeline 执行过程中的追踪信息
	// 最终会合并到 ContextResponse 中
	Traces []map[string]interface{}
}

// Pass 定义了上下文处理的单一职责单元

type Pass interface {

	// Name 返回 Pass 的唯一标识符，用于系统内部标识

	Name() string



	// Description 返回 Pass 的功能名称或描述，用于 UI 展示

	Description() string



	// Run 执行具体的处理逻辑

	// 如果返回 error，Pipeline 将终止执行

	Run(ctx context.Context, data *ContextData) error

}
