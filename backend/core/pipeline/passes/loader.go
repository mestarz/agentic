package passes

import (
	"context"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/pipeline"
	"fmt"
)

// HistoryLoader 负责从持久化存储中加载指定会话的历史消息。
type HistoryLoader struct {
	historyService *history.Service
}

// NewHistoryLoader 创建一个 HistoryLoader 实例。
func NewHistoryLoader(h *history.Service) *HistoryLoader {
	return &HistoryLoader{
		historyService: h,
	}
}

func (p *HistoryLoader) Name() string {
	return "HistoryLoader"
}

func (p *HistoryLoader) Description() string {
	return "加载历史会话"
}

// Run 执行加载逻辑，将历史消息注入到管线上下文中。
func (p *HistoryLoader) Run(ctx context.Context, data *pipeline.ContextData) error {
	// 调用历史服务获取会话详情
	session, err := p.historyService.Get(ctx, data.SessionID)
	if err != nil {
		return fmt.Errorf("failed to load session %s: %w", data.SessionID, err)
	}

	// 初始化管线中的消息列表
	data.Messages = session.Messages

	// 将会话的元数据注入到共享上下文
	data.Meta["app_id"] = session.AppID
	data.Meta["created_at"] = session.CreatedAt

	// 记录具体的加载情况
	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "HistoryLoader",
		"target": "ContextData",
		"action": "Loaded",
		"data": map[string]interface{}{
			"original_count": len(session.Messages),
		},
	})

	return nil
}
