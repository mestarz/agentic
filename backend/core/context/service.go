package context

import (
	stdctx "context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/pipeline"
	"context-fabric/backend/core/pipeline/passes"
	"log"
	"time"
)

// Engine 是上下文处理的核心引擎。
// 它维护了一个 Pipeline 管线，负责将原始会话历史转换为模型可用的优化负载。
type Engine struct {
	pipeline      *pipeline.Pipeline
	llmServiceURL string
}

// NewEngine 初始化引擎并配置默认的处理管线。
// 默认顺序：1. 加载历史 -> 2. LLM 语义摘要 -> 3. 注入系统提示词 -> 4. Token 限制截断。
func NewEngine(h *history.Service, llmServiceURL string, m *MemoryService) *Engine {
	pl := pipeline.NewPipeline(
		passes.NewHistoryLoader(h),
		passes.NewRAGPass(),
		passes.NewConstitutionPass(m),
		// 消息数超过 10 条时触发摘要，保留最近 5 条
		passes.NewSummarizerPass(llmServiceURL, "deepseek-chat", 10, 5),
		passes.NewSystemPromptPass(),
		passes.NewSanitizePass(m),
		passes.NewTokenLimitPass(4000), // 默认设置 4k 上下文限制
	)
	return &Engine{
		pipeline:      pl,
		llmServiceURL: llmServiceURL,
	}
}

// BuildPayload 驱动管线执行，并负责将管线生成的内部 Trace 信息归一化为业务层可理解的格式。
func (e *Engine) BuildPayload(ctx stdctx.Context, id string, query string, modelID string, ragEnabled bool, ragEmbeddingModel string) ([]domain.Message, error) {
	log.Printf("[Core] Pipeline Start - Session: %s, Query: %s, RAG: %v", id, query, ragEnabled)
	start := time.Now()

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
	data.Meta["rag_enabled"] = ragEnabled
	data.Meta["rag_embedding_model"] = ragEmbeddingModel

	// 2. 启动 Pipeline 逻辑处理
	if err := e.pipeline.Execute(ctx, data); err != nil {
		log.Printf("[Core] Pipeline Failed - Session: %s, Error: %v", id, err)
		return nil, err
	}

	// 3. 处理 Trace 和 Meta
	// 将 Pipeline 中收集的 Trace 信息转换为 domain.TraceEvent，并附着到最后一条消息上
	if len(data.Messages) > 0 {
		lastMsg := &data.Messages[len(data.Messages)-1]

		var domainTraces []domain.TraceEvent
		var internalDetails []map[string]interface{}
		baseTime := time.Now()

		for _, t := range data.Traces {
			src, _ := t["source"].(string)
			act, _ := t["action"].(string)
			dat, _ := t["data"].(map[string]interface{})
			if dat == nil {
				dat = make(map[string]interface{})
			}

			// 3.1 过滤掉冗余的管线级元数据，避免时序图过度拥挤
			if (src == "Core" || src == "Pipeline") && (act == "Start" || act == "Finished") {
				continue
			}
			if act == "Loaded" { // HistoryLoader 的内部事件
				continue
			}

			// 3.2 如果是 Pipeline 的 Complete 事件（即一个 Pass 执行完成）
			if src == "Pipeline" && act == "Complete" {
				// 将之前累积的内部细节注入到这个主 Trace 中，实现交互图节点的“折叠”
				if len(internalDetails) > 0 {
					dat["internal_logs"] = internalDetails
					internalDetails = nil // 重置缓冲区
				}

				domainTraces = append(domainTraces, domain.TraceEvent{
					Source:    "Core",
					Target:    "Core",
					Action:    act,
					Data:      dat,
					Timestamp: baseTime.Add(time.Duration(len(domainTraces)) * time.Microsecond),
				})
				continue
			}

			// 3.3 其他内部业务事件（如 Summarizer 的 Summarized/SummarizeError, TokenLimit 的 Truncate）
			// 暂时缓存起来，等待下一个 Complete 事件将其打包。
			dat["internal_action"] = act
			dat["internal_component"] = src
			internalDetails = append(internalDetails, dat)
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

	log.Printf("[Core] Pipeline Finished - Session: %s, Duration: %dms, MsgCount: %d", id, time.Since(start).Milliseconds(), len(data.Messages))
	return data.Messages, nil
}

// Service 是面向外部接口的上下文服务编排层。
type Service struct {
	historySvc *history.Service
	engine     *Engine
	memorySvc  *MemoryService
}

// NewService 创建一个新的 Context Service。
func NewService(h *history.Service, e *Engine, m *MemoryService) *Service {
	return &Service{historySvc: h, engine: e, memorySvc: m}
}

// CreateSession 初始化一个新的会话记录。
func (s *Service) CreateSession(ctx stdctx.Context, appID string) (*domain.Session, error) {
	sess, err := s.historySvc.GetOrCreateSession(ctx, "session-"+time.Now().Format("20060102150405.000000"), appID)
	if err == nil {
		log.Printf("[Core] Session Created - ID: %s, AppID: %s", sess.ID, sess.AppID)
	} else {
		log.Printf("[Core] Session Create Failed - Error: %v", err)
	}
	return sess, err
}

// AppendMessage 向会话中追加一条消息（通常是模型生成的回复）。
func (s *Service) AppendMessage(ctx stdctx.Context, id string, msg domain.Message) (map[string]interface{}, error) {
	log.Printf("[Core] Append Message - Session: %s, Role: %s, Len: %d", id, msg.Role, len(msg.Content))
	err := s.historySvc.Append(ctx, id, msg)
	if err != nil {
		log.Printf("[Core] Append Message Failed - Session: %s, Error: %v", id, err)
		return nil, err
	}

	// 触发异步记忆录入（仅针对助手回复后的完整会话）
	if msg.Role == domain.RoleAssistant && s.memorySvc != nil {
		sess, err := s.historySvc.GetOrCreateSession(ctx, id, "")
		if err == nil {
			embModel, _ := sess.Messages[len(sess.Messages)-1].Meta["rag_embedding_model"].(string)
			go s.memorySvc.Ingest(stdctx.Background(), id, sess.Messages, embModel)
		}
	}

	// 临时元数据标记
	meta := map[string]interface{}{"status": "appended"}
	s.historySvc.UpdateLastMessageMeta(ctx, id, meta)
	return meta, nil
}

// GetOptimizedContext 是核心业务入口。
// 它负责记录用户请求并驱动 Engine 生成优化后的模型上下文。
func (s *Service) GetOptimizedContext(ctx stdctx.Context, id, query string, modelID string, ragEnabled bool, ragEmbeddingModel string) ([]domain.Message, error) {
	log.Printf("[Core] GetContext Request - Session: %s", id)

	// 1. 自动确保 Session 环境存在
	s.historySvc.GetOrCreateSession(ctx, id, "auto")

	// 2. 将当前用户提问持久化到历史库中
	userMsg := domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()}
	s.historySvc.Append(ctx, id, userMsg)

	// 3. 调用核心引擎通过 Pipeline 构建优化后的消息 Payload
	payload, err := s.engine.BuildPayload(ctx, id, query, modelID, ragEnabled, ragEmbeddingModel)

	// 4. 将处理后的元数据（如 Token 统计）同步更新到持久化库的消息 Meta 中
	if err == nil && len(payload) > 0 {
		s.historySvc.UpdateLastMessageMeta(ctx, id, payload[len(payload)-1].Meta)
	} else if err != nil {
		log.Printf("[Core] GetContext Failed - Session: %s, Error: %v", id, err)
	}

	return payload, err
}
