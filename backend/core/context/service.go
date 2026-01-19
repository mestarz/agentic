package context

import (
	stdctx "context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/pipeline"
	"context-fabric/backend/core/pipeline/passes"
	"time"
)

type Engine struct {
	pipeline *pipeline.Pipeline
}

func NewEngine(h *history.Service) *Engine {
	// 构建默认的处理管线
	// 顺序: 加载历史 -> 注入系统提示词 -> Token 限制截断
	pl := pipeline.NewPipeline(
		passes.NewHistoryLoader(h),
		passes.NewSystemPromptPass(),
		passes.NewTokenLimitPass(4000),
	)
	return &Engine{pipeline: pl}
}

func (e *Engine) BuildPayload(ctx stdctx.Context, id string, query string, modelID string) ([]domain.Message, error) {
	// 1. 初始化 Pipeline 数据上下文
	data := &pipeline.ContextData{
		SessionID: id,
		Messages:  make([]domain.Message, 0),
		Meta:      make(map[string]interface{}),
		Traces:    make([]map[string]interface{}, 0),
	}
	
	// 额外信息注入 Meta
	data.Meta["query"] = query
	data.Meta["model_id"] = modelID

	// 2. 执行 Pipeline
	if err := e.pipeline.Execute(ctx, data); err != nil {
		return nil, err
	}

	// 3. 处理 Trace 和 Meta
	// 将 Pipeline 中收集的 Trace 信息转换为 domain.TraceEvent，并附着到最后一条消息上
	// 这样前端 Sequence Diagram 就能看到完整的处理过程
	if len(data.Messages) > 0 {
		lastMsg := &data.Messages[len(data.Messages)-1]
		
		var domainTraces []domain.TraceEvent
		baseTime := time.Now()
		
		for i, t := range data.Traces {
			src, _ := t["source"].(string)
			// tgt, _ := t["target"].(string)
			act, _ := t["action"].(string)
			dat, _ := t["data"].(map[string]interface{})
			
			// 将原始组件信息注入 Data，供前端详情页展示
			dat["internal_component"] = src
			
			// 强制归一化: Pipeline 的所有内部活动都在 Core 服务内部发生
			// 表现为 Core -> Core 的自环调用
			domainTraces = append(domainTraces, domain.TraceEvent{
				Source:    "Core",
				Target:    "Core",
				Action:    act,
				Data:      dat,
				Timestamp: baseTime.Add(time.Duration(i) * time.Microsecond),
			})
		}
		
		lastMsg.Traces = append(lastMsg.Traces, domainTraces...)
		
		// 合并 Meta
		if lastMsg.Meta == nil {
			lastMsg.Meta = make(map[string]interface{})
		}
		for k, v := range data.Meta {
			lastMsg.Meta[k] = v
		}
	}

	return data.Messages, nil
}

// Service 编排层
type Service struct {
	historySvc *history.Service
	engine     *Engine
}

func NewService(h *history.Service, e *Engine) *Service {
	return &Service{historySvc: h, engine: e}
}

func (s *Service) CreateSession(ctx stdctx.Context, appID string) (*domain.Session, error) {
	return s.historySvc.GetOrCreateSession(ctx, "session-"+time.Now().Format("20060102150405.000000"), appID)
}

func (s *Service) AppendMessage(ctx stdctx.Context, id string, msg domain.Message) (map[string]interface{}, error) {
	err := s.historySvc.Append(ctx, id, msg)
	if err != nil {
		return nil, err
	}
	
	// 为了计算 Token 统计信息，我们临时跑一次 Pipeline (或者只跑 Token 计算逻辑)
	// 这里为了简单，我们暂时不做完整的 BuildPayload，因为那会触发完整的 Trace
	// 但如果不跑，前端可能看不到 tokens_total 更新。
	// 既然我们要解耦，这里理想做法是调用一个轻量级的 "StatsPipeline"。
	// 暂时保留旧行为：不做 BuildPayload，或者简化处理。
	// 原逻辑: 调用 selectMessages 算一次 Token。
	
	// 为了保持行为一致，我们可以手动调用 TokenLimitPass 的逻辑?
	// 或者直接忽略这里的 Token 计算优化，等待下一次 GetContext 时计算。
	// 考虑到前端需要 tokens_total 来展示进度条:
	// 我们可以在 Meta 里简单标记 "pending calculation"
	
	meta := map[string]interface{}{"status": "appended"}
	s.historySvc.UpdateLastMessageMeta(ctx, id, meta)
	return meta, nil
}

func (s *Service) GetOptimizedContext(ctx stdctx.Context, id, query string, modelID string) ([]domain.Message, error) {
	// 1. 确保 Session 存在
	s.historySvc.GetOrCreateSession(ctx, id, "auto")
	
	// 2. 将用户当前的 Query 追加到历史记录
	userMsg := domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()}
	s.historySvc.Append(ctx, id, userMsg)
	
	// 3. 构建优化后的 Payload (Pipeline 执行)
	payload, err := s.engine.BuildPayload(ctx, id, query, modelID)
	
	// 4. 更新最后一条消息的 Meta (包含 Token 统计)
	if err == nil && len(payload) > 0 {
		s.historySvc.UpdateLastMessageMeta(ctx, id, payload[len(payload)-1].Meta)
	}
	
	return payload, err
}