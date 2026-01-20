package passes

import (
	"context"
	"fmt"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/pipeline"
)

type HistoryLoader struct {
	historyService *history.Service
}

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

func (p *HistoryLoader) Run(ctx context.Context, data *pipeline.ContextData) error {
	// 从 History Service 获取 Session
	session, err := p.historyService.Get(ctx, data.SessionID)
	if err != nil {
		return fmt.Errorf("failed to load session %s: %w", data.SessionID, err)
	}

	// 将消息加载到 ContextData 中
	data.Messages = session.Messages
	
	// 可选：将 Session 的其他元数据也放入 Meta
	data.Meta["app_id"] = session.AppID
	data.Meta["created_at"] = session.CreatedAt
	
	// 添加自定义 Trace
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
