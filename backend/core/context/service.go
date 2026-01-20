package context

import (
	stdctx "context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/pipeline"
	"context-fabric/backend/core/pipeline/passes"
	"time"
)

// Engine 是上下文处理的核心引擎。
// 它维护了一个 Pipeline 管线，负责将原始会话历史转换为模型可用的优化负载。
type Engine struct {
	pipeline *pipeline.Pipeline
}

// NewEngine 初始化引擎并配置默认的处理管线。
// 默认顺序：1. 加载历史 -> 2. 注入系统提示词 -> 3. Token 限制与截断。
func NewEngine(h *history.Service) *Engine {
	pl := pipeline.NewPipeline(
		passes.NewHistoryLoader(h),
		passes.NewSystemPromptPass(),
		passes.NewTokenLimitPass(4000), // 默认设置 4k 上下文限制
	)
	return &Engine{pipeline: pl}
}

// BuildPayload 驱动管线执行，并负责将管线生成的内部 Trace 信息归一化为业务层可理解的格式。
func (e *Engine) BuildPayload(ctx stdctx.Context, id string, query string, modelID string) ([]domain.Message, error) {
	// 1. 初始化管线运行时的黑板数据 (ContextData)
	data := &pipeline.ContextData{
		SessionID: id,
		Messages:  make([]domain.Message, 0),
		Meta:      make(map[string]interface{}),
		Traces:    make([]map[string]interface{}, 0),
	}
	
	// 注入初始上下文元数据
	data.Meta["query"] = query
	data.Meta["model_id"] = modelID

	// 2. 启动 Pipeline 逻辑处理
	if err := e.pipeline.Execute(ctx, data); err != nil {
		return nil, err
	}

	// 3. 将管线执行轨迹 (Traces) 归一化并附着在最后一条消息上，供前端交互图展示。
	if len(data.Messages) > 0 {
		lastMsg := &data.Messages[len(data.Messages)-1]
		
		var domainTraces []domain.TraceEvent
		baseTime := time.Now()
		
		for i, t := range data.Traces {
			src, _ := t["source"].(string)
			act, _ := t["action"].(string)
			dat, _ := t["data"].(map[string]interface{})
			
			// 保存原始组件信息以便深度调试
			dat["internal_component"] = src
			
			// 归一化策略：管线内的所有活动在宏观视图上表现为 Core 内部的逻辑自环
			domainTraces = append(domainTraces, domain.TraceEvent{
				Source:    "Core",
				Target:    "Core",
				Action:    act,
				Data:      dat,
				Timestamp: baseTime.Add(time.Duration(i) * time.Microsecond),
			})
		}
		
		lastMsg.Traces = append(lastMsg.Traces, domainTraces...)
		
		// 合并管线处理过程中生成的元数据 (如 Token 计数等)
		if lastMsg.Meta == nil {
			lastMsg.Meta = make(map[string]interface{})
		}
		for k, v := range data.Meta {
			lastMsg.Meta[k] = v
		}
	}

	return data.Messages, nil
}

// Service 是面向外部接口的上下文服务编排层。
type Service struct {
	historySvc *history.Service
	engine     *Engine
}

// NewService 创建一个新的 Context Service。
func NewService(h *history.Service, e *Engine) *Service {
	return &Service{historySvc: h, engine: e}
}

// CreateSession 初始化一个新的会话记录。
func (s *Service) CreateSession(ctx stdctx.Context, appID string) (*domain.Session, error) {
	return s.historySvc.GetOrCreateSession(ctx, "session-"+time.Now().Format("20060102150405.000000"), appID)
}

// AppendMessage 向会话中追加一条消息（通常是模型生成的回复）。
func (s *Service) AppendMessage(ctx stdctx.Context, id string, msg domain.Message) (map[string]interface{}, error) {
	err := s.historySvc.Append(ctx, id, msg)
	if err != nil {
		return nil, err
	}
	
	// 临时元数据标记
	meta := map[string]interface{}{"status": "appended"}
	s.historySvc.UpdateLastMessageMeta(ctx, id, meta)
	return meta, nil
}

// GetOptimizedContext 是核心业务入口。
// 它负责记录用户请求并驱动 Engine 生成优化后的模型上下文。
func (s *Service) GetOptimizedContext(ctx stdctx.Context, id, query string, modelID string) ([]domain.Message, error) {
	// 1. 自动确保 Session 环境存在
	s.historySvc.GetOrCreateSession(ctx, id, "auto")
	
	// 2. 将当前用户提问持久化到历史库中
	userMsg := domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()}
	s.historySvc.Append(ctx, id, userMsg)
	
	// 3. 调用核心引擎通过 Pipeline 构建优化后的消息 Payload
	payload, err := s.engine.BuildPayload(ctx, id, query, modelID)
	
	// 4. 将处理后的元数据（如 Token 统计）同步更新到持久化库的消息 Meta 中
	if err == nil && len(payload) > 0 {
		s.historySvc.UpdateLastMessageMeta(ctx, id, payload[len(payload)-1].Meta)
	}
	
	return payload, err
}
