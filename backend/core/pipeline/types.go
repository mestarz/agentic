package pipeline

import (
	"context"
	"context-fabric/backend/core/domain"
)

// ContextData 在 Pipeline 中流转的数据上下文。
// 它充当所有 Pass 的“共享黑板”，存储了待处理的消息流、元数据以及执行踪迹。
type ContextData struct {
	// SessionID 当前会话的唯一标识
	SessionID string
	// Messages 当前管线中正在处理的消息列表
	Messages []domain.Message

	// Meta 用于在不同 Pass 之间传递临时或统计数据。
	// 例如：Token 计数结果、检索到的知识片段等。
	Meta map[string]interface{}

	// Traces 收集 Pipeline 执行过程中的关键路径信息。
	// 这些信息最终会被归一化并展示在前端的交互观测仪中。
	Traces []map[string]interface{}
}

// Pass 定义了上下文处理的单一职责单元（插件化设计）。
// 每个 Pass 只负责对 ContextData 进行特定的一种处理或转换。
type Pass interface {
	// Name 返回 Pass 的唯一技术标识符（如: HistoryLoader）。
	Name() string

	// Description 返回 Pass 的功能描述。
	// 用于在 UI 界面展示更加人性化的操作名称（如: 加载历史会话）。
	Description() string

	// Run 执行该处理单元的具体业务逻辑。
	// 如果返回 error，Pipeline 的执行流程将被中断。
	Run(ctx context.Context, data *ContextData) error
}
