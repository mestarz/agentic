package pipeline

import (
	"context"
	"fmt"
	"time"
)

// Pipeline 管理一组有序执行的 Pass
type Pipeline struct {
	passes []Pass
}

// NewPipeline 创建一个新的 Pipeline 实例
func NewPipeline(passes ...Pass) *Pipeline {
	return &Pipeline{
		passes: passes,
	}
}

// Execute 依次执行所有的 Pass
func (p *Pipeline) Execute(ctx context.Context, data *ContextData) error {
	totalStart := time.Now()
	
	// 初始化
	if data.Meta == nil {
		data.Meta = make(map[string]interface{})
	}
	if data.Traces == nil {
		data.Traces = make([]map[string]interface{}, 0)
	}

	// 记录 Pipeline 开始
	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "Core",
		"target": "Pipeline",
		"action": "Start",
		"data": map[string]interface{}{
			"session_id": data.SessionID,
			"pass_count": len(p.passes),
		},
	})

	for _, pass := range p.passes {
		start := time.Now()
		passName := pass.Name()

		// 执行 Pass
		if err := pass.Run(ctx, data); err != nil {
			return fmt.Errorf("pass %s failed: %w", passName, err)
		}

		duration := time.Since(start).Milliseconds()
		
		// 记录 Pass 执行完成的 Trace
		data.Traces = append(data.Traces, map[string]interface{}{
			"source": "Pipeline",
			"target": passName,
			"action": "Complete",
			"data": map[string]interface{}{
				"duration_ms": duration,
				"msg_count":   len(data.Messages),
			},
		})
	}

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
