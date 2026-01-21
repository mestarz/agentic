package pipeline

import (
	"context"
	"context-fabric/backend/core/domain"
	"fmt"
	"time"
)

// Pipeline 管理一组有序执行的 Pass 处理单元。
// 它负责协调上下文数据的流转，并记录每一步的执行踪迹。
type Pipeline struct {
	passes []Pass
}

// NewPipeline 创建一个新的 Pipeline 实例。
func NewPipeline(passes ...Pass) *Pipeline {
	return &Pipeline{
		passes: passes,
	}
}

// Execute 依次执行管线中注册的所有 Pass。
// 它会初始化上下文环境，并为每个 Pass 生成包含消息快照的 Trace 记录。
func (p *Pipeline) Execute(ctx context.Context, data *ContextData) error {
	totalStart := time.Now()

	// 初始化元数据和追踪容器
	if data.Meta == nil {
		data.Meta = make(map[string]interface{})
	}
	if data.Traces == nil {
		data.Traces = make([]map[string]interface{}, 0)
	}

	// 记录 Pipeline 启动事件
	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "Core",
		"target": "Pipeline",
		"action": "Start",
		"data": map[string]interface{}{
			"session_id": data.SessionID,
			"pass_count": len(p.passes),
		},
	})

	// 循环执行每一个处理步骤 (Pass)
	for _, pass := range p.passes {
		start := time.Now()
		passName := pass.Name()
		passDesc := pass.Description()

		// 执行具体的业务逻辑
		if err := pass.Run(ctx, data); err != nil {
			return fmt.Errorf("pass %s failed: %w", passName, err)
		}

		duration := time.Since(start).Milliseconds()

		// 记录 Pass 执行完成的 Trace，并捕获当前的消息列表快照
		data.Traces = append(data.Traces, map[string]interface{}{
			"source": "Pipeline",
			"target": passName,
			"action": "Complete",
			"data": map[string]interface{}{
				"description": passDesc,
				"is_pass":     true,
				"pass_name":   passName,
				"duration_ms": duration,
				"msg_count":   len(data.Messages),
				"messages":    cloneMessages(data.Messages),
			},
		})
	}

	// 记录整个管线完成的事件
	totalDuration := time.Since(totalStart).Milliseconds()
	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "Core",
		"target": "Pipeline",
		"action": "Finished",
		"data": map[string]interface{}{
			"total_duration_ms": totalDuration,
		},
	})

	return nil
}

// cloneMessages 将消息列表转换为适合 Trace 记录的快照映射（投影）。
// 这确保了记录的是该时刻的静态内容，不会受到后续 Pass 对原始消息对象修改的影响。
func cloneMessages(msgs []domain.Message) []interface{} {
	cloned := make([]interface{}, len(msgs))
	for i, m := range msgs {
		cloned[i] = map[string]interface{}{
			"role":    m.Role,
			"content": m.Content,
		}
	}
	return cloned
}
