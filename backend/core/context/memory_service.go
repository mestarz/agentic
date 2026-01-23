package context

import (
	"bytes"
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/util"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// MemoryState 记录记忆系统的运行快照，用于前端仪表盘展示
type MemoryState struct {
	IngestQueueSize int `json:"ingest_queue_size"` // 待处理的会话清洗任务数量

	// 快系统 (Ingestion) 状态
	LastIngestTime    time.Time `json:"last_ingest_time"`
	LastIngestSession string    `json:"last_ingest_session"`
	LastIngestStatus  string    `json:"last_ingest_status"` // "processing", "success", "failed"
	LastIngestInput   int       `json:"last_ingest_input_count"`
	LastIngestOutput  int       `json:"last_ingest_output_count"`
	LastIngestTopic   string    `json:"last_ingest_topic"`

	// 慢系统 (Reflection) 状态
	IsReflecting                 bool      `json:"is_reflecting"` // 当前是否正在执行反思循环
	LastReflectionTime           time.Time `json:"last_reflection_time"`
	LastReflectionStatus         string    `json:"last_reflection_status"`
	LastReflectionFactsProcessed int       `json:"last_reflection_facts_processed"`
	LastReflectionInstructions   int       `json:"last_reflection_instructions"`
}

// MemoryService 负责管理跨会话的长期记忆进化 (DEMA 架构)
type MemoryService struct {
	repo          domain.VectorRepository
	llmServiceURL string
	ingestChan    chan ingestTask // 异步清洗任务队列
	state         MemoryState     // 系统实时状态
	stateLock     sync.RWMutex    // 状态读写锁
	memoryLogger  *log.Logger     // 专用的业务逻辑日志记录器
}

type ingestTask struct {
	SessionID           string
	Messages            []domain.Message
	ModelID             string
	SanitizationModelID string
}

func NewMemoryService(repo domain.VectorRepository, llmURL string) *MemoryService {
	// 初始化记忆系统专用日志 (logs/memory.log)
	logDir := util.GetEnv("AGENTIC_LOG_DIR", "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		log.Printf("[Memory] Failed to create log dir: %v", err)
	}
	logFile, err := os.OpenFile(filepath.Join(logDir, "memory.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	var memLogger *log.Logger
	if err != nil {
		log.Printf("[Memory] Failed to open memory.log: %v", err)
		memLogger = log.New(os.Stdout, "[MEMORY_DEBUG] ", log.LstdFlags)
	} else {
		memLogger = log.New(logFile, "", log.LstdFlags)
	}

	svc := &MemoryService{
		repo:          repo,
		llmServiceURL: llmURL,
		ingestChan:    make(chan ingestTask, 100),
		memoryLogger:  memLogger,
	}
	go svc.worker()         // 启动快系统 Worker
	go svc.reflectionLoop() // 启动慢系统 Ticker
	return svc
}

// GetState 返回系统当前的运行指标
func (s *MemoryService) GetState() MemoryState {
	s.stateLock.RLock()
	defer s.stateLock.RUnlock()
	state := s.state
	state.IngestQueueSize = len(s.ingestChan)
	return state
}

// logEvent 以 JSON 格式记录详细的业务输入输出，供调试与审计
func (s *MemoryService) logEvent(system string, action string, details interface{}) {
	entry := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"system":    system,
		"action":    action,
		"details":   details,
	}
	if data, err := json.Marshal(entry); err == nil {
		s.memoryLogger.Println(string(data))
	}
}

func (s *MemoryService) reflectionLoop() {
	log.Printf("[Memory] Reflection loop started (interval: 5m)")
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		log.Printf("[Memory] Ticker triggered reflection cycle")
		if err := s.Reflect(context.Background()); err != nil {
			log.Printf("[Memory] ERROR: Reflection cycle failed: %v", err)
		}
	}
}

func (s *MemoryService) Reflect(ctx context.Context) error {
	s.stateLock.Lock()
	s.state.IsReflecting = true
	s.stateLock.Unlock()

	defer func() {
		s.stateLock.Lock()
		s.state.IsReflecting = false
		s.state.LastReflectionTime = time.Now()
		s.stateLock.Unlock()
	}()

	// 1. 获取待处理事实
	facts, err := s.repo.ListPendingFacts(ctx, 10)
	if err != nil {
		s.updateReflectionStatus("failed", 0, 0)
		return err
	}
	if len(facts) == 0 {
		s.updateReflectionStatus("idle", 0, 0)
		return nil
	}

	log.Printf("[Memory] Reflection: Found %d pending facts to process", len(facts))
	s.logEvent("Reflection", "cycle_start", map[string]interface{}{
		"pending_facts_count": len(facts),
	})

	totalInstructions := 0
	for _, fact := range facts {
		log.Printf("[Memory] Reflection: Processing fact [%s] (Session: %s)", fact.ID[:8], fact.SourceSession)

		// 2. 检索相关旧记忆
		related, err := s.repo.SearchSharedMemories(ctx, fact.Vector, 3)
		if err != nil {
			log.Printf("[Memory] Reflection ERROR: Search failed for fact %s: %v", fact.ID, err)
			continue
		}
		log.Printf("[Memory] Reflection: Found %d potentially related old memories", len(related))

		// 3. 提交仲裁请求 (LLM)
		instructions, err := s.getEvolutionInstructions(ctx, fact, related)
		if err != nil {
			log.Printf("[Memory] Reflection ERROR: LLM Arbitration failed for fact %s: %v", fact.ID, err)
			continue
		}

		s.logEvent("Reflection", "shared_evolution", map[string]interface{}{
			"fact_id":          fact.ID,
			"fact_content":     fact.Content,
			"related_memories": related,
			"instructions":     instructions,
		})

		// 4. 执行演进指令
		for _, inst := range instructions {
			log.Printf("[Memory] Reflection EXEC: Action=%s, Reason=%s", inst.Action, inst.Reason)
			if err := s.executeInstruction(ctx, fact, inst); err != nil {
				log.Printf("[Memory] Reflection ERROR: Execution failed for action %s: %v", inst.Action, err)
			}
			totalInstructions++
		}

		// 5. 清理已处理事实
		if err := s.repo.DeleteStagingFact(ctx, fact.ID); err == nil {
			log.Printf("[Memory] Reflection: Fact %s cleaned from staging", fact.ID[:8])
		}
	}

	s.updateReflectionStatus("success", len(facts), totalInstructions)
	log.Printf("[Memory] Reflection cycle completed")
	return nil
}

func (s *MemoryService) updateReflectionStatus(status string, facts, insts int) {
	s.stateLock.Lock()
	defer s.stateLock.Unlock()
	s.state.LastReflectionStatus = status
	s.state.LastReflectionFactsProcessed = facts
	s.state.LastReflectionInstructions = insts
}

type instructionDTO struct {
	Action      string `json:"action"`
	FactContent string `json:"fact_content"`
	MemoryID    string `json:"memory_id,omitempty"`
	Reason      string `json:"reason,omitempty"`
}

func (s *MemoryService) getEvolutionInstructions(ctx context.Context, fact domain.StagingFact, related []domain.SharedMemory) ([]instructionDTO, error) {
	url := fmt.Sprintf("%s/v1/memory/reflect", s.llmServiceURL)
	modelID := util.GetEnv("AGENTIC_REFLECTION_MODEL", "")
	if modelID == "" {
		return nil, fmt.Errorf("reflection model not configured (AGENTIC_REFLECTION_MODEL)")
	}

	payload := map[string]interface{}{
		"model":            modelID,
		"new_facts":        []domain.StagingFact{fact},
		"related_memories": related,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Instructions []instructionDTO `json:"instructions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Instructions, nil
}

func (s *MemoryService) executeInstruction(ctx context.Context, fact domain.StagingFact, inst instructionDTO) error {
	switch inst.Action {
	case "create":
		return s.repo.SaveSharedMemory(ctx, &domain.SharedMemory{
			ID:           uuid.New().String(),
			Vector:       fact.Vector,
			Content:      inst.FactContent,
			Topic:        "general",
			Confidence:   1.0,
			Version:      1,
			Status:       "active",
			LastVerified: time.Now(),
			EvidenceRefs: []string{fact.ID},
		})
	case "evolve":
		// 需要先获取旧记忆的完整信息（此处简化，实际应先读后写）
		// 目前仓库层 UpdateSharedMemory 使用 PUT (upsert)，
		// 这里暂且直接作为新记录保存或覆盖
		return s.repo.SaveSharedMemory(ctx, &domain.SharedMemory{
			ID:           inst.MemoryID,
			Vector:       fact.Vector, // 演进后的新向量
			Content:      inst.FactContent,
			Status:       "active",
			LastVerified: time.Now(),
			Version:      2, // 简化处理
		})
	case "deprecate":
		// 软删除
		return s.repo.UpdateSharedMemory(ctx, &domain.SharedMemory{
			ID:     inst.MemoryID,
			Status: "deprecated",
		})
	}
	return nil
}

func (s *MemoryService) Ingest(ctx context.Context, sessionID string, messages []domain.Message, modelID string, sanitizationModel string) error {
	select {
	case s.ingestChan <- ingestTask{SessionID: sessionID, Messages: messages, ModelID: modelID, SanitizationModelID: sanitizationModel}:
		return nil
	default:
		return fmt.Errorf("memory ingest channel full")
	}
}

func (s *MemoryService) GetEmbedding(ctx context.Context, text string, modelID string) ([]float32, error) {
	if modelID == "" {
		modelID = "text-embedding-3-small" // 兜底
	}
	return s.getEmbedding(ctx, text, modelID)
}

func (s *MemoryService) Retrieve(ctx context.Context, vector []float32) (l1 []domain.SharedMemory, l2 []domain.StagingFact, err error) {
	if len(vector) == 0 {
		return nil, nil, nil
	}

	// Layer 1: 长期背景 (Shared)
	l1, err = s.repo.SearchSharedMemories(ctx, vector, 3)
	if err != nil {
		return nil, nil, err
	}

	// Layer 2: 近期事实 (Staging)
	l2, err = s.repo.SearchStagingFacts(ctx, vector, 3)
	if err != nil {
		return nil, nil, err
	}

	return l1, l2, nil
}

func (s *MemoryService) worker() {
	for task := range s.ingestChan {
		ctx := context.Background()
		if err := s.processIngest(ctx, task); err != nil {
			log.Printf("[Memory] Ingest failed for session %s: %v", task.SessionID, err)
		}
	}
}

func (s *MemoryService) processIngest(ctx context.Context, task ingestTask) error {
	log.Printf("[Memory] Ingest: Start sanitizing session %s (%d messages)", task.SessionID, len(task.Messages))

	s.stateLock.Lock()
	s.state.LastIngestStatus = "processing"
	s.state.LastIngestTime = time.Now()
	s.state.LastIngestSession = task.SessionID
	s.state.LastIngestInput = len(task.Messages)
	s.stateLock.Unlock()

	// 1. 调用 LLM Gateway 进行清洗
	// 使用专门的清洗模型 (Chat Model)，而不是 Embedding 模型。
	// 这里优先使用任务中传入的模型 ID (来自前端配置)，如果没有则回退到环境变量或默认值。
	sanitizeModel := task.SanitizationModelID
	if sanitizeModel == "" {
		sanitizeModel = util.GetEnv("AGENTIC_SANITIZE_MODEL", "deepseek-chat")
	}
	if sanitizeModel == "" {
		s.updateIngestStatus("failed", 0, "")
		return fmt.Errorf("no sanitization model configured (AGENTIC_SANITIZE_MODEL)")
	}

	facts, err := s.sanitizeDialogue(ctx, task.Messages, sanitizeModel)
	if err != nil {
		s.updateIngestStatus("failed", 0, "")
		return err
	}
	log.Printf("[Memory] Ingest: LLM extracted %d facts from dialogue", len(facts))

	s.logEvent("Ingestion", "staging_ingest", map[string]interface{}{
		"session_id":     task.SessionID,
		"input_messages": len(task.Messages),
		"output_facts":   facts,
		"model_used":     sanitizeModel,
	})

	lastTopic := ""
	for i, f := range facts {
		lastTopic = f.Topic
		// 2. 为每个事实获取 Embedding
		// 这里必须使用 Embedding 模型 (向量模型)，该模型 ID 同样来自前端 RAG 配置。
		embModel := task.ModelID
		if embModel == "" {
			embModel = "text-embedding-3-small"
		}
		vector, err := s.getEmbedding(ctx, f.Content, embModel)
		if err != nil {
			log.Printf("[Memory] Ingest ERROR: Failed to get embedding for fact %d: %v", i, err)
			continue
		}
		if vector == nil {
			// Already logged warning in getEmbedding
			continue
		}

		// 3. 存入暂存区
		fact := &domain.StagingFact{
			ID:            uuid.New().String(),
			Vector:        vector,
			Content:       f.Content,
			SourceSession: task.SessionID,
			CreatedAt:     time.Now(),
			Status:        "pending",
		}
		if err := s.repo.SaveStagingFact(ctx, fact); err != nil {
			log.Printf("[Memory] Ingest ERROR: Failed to save fact %d to staging: %v", i, err)
		} else {
			log.Printf("[Memory] Ingest: Fact %d saved to staging (Topic: %s)", i, f.Topic)
		}
	}

	s.updateIngestStatus("success", len(facts), lastTopic)
	log.Printf("[Memory] Ingest: Session %s processed successfully", task.SessionID)
	return nil
}

func (s *MemoryService) updateIngestStatus(status string, output int, topic string) {
	s.stateLock.Lock()
	defer s.stateLock.Unlock()
	s.state.LastIngestStatus = status
	s.state.LastIngestOutput = output
	s.state.LastIngestTopic = topic
}

type factDTO struct {
	Content string `json:"content"`
	Topic   string `json:"topic"`
}

func (s *MemoryService) sanitizeDialogue(ctx context.Context, msgs []domain.Message, modelID string) ([]factDTO, error) {
	url := fmt.Sprintf("%s/v1/memory/sanitize", s.llmServiceURL)

	payload := map[string]interface{}{
		"model":    modelID,
		"messages": msgs,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("llm gateway sanitize error: %s, details: %s", resp.Status, string(bodyBytes))
	}

	var result struct {
		Facts []factDTO `json:"facts"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Facts, nil
}

func (s *MemoryService) getEmbedding(ctx context.Context, text string, modelID string) ([]float32, error) {
	url := fmt.Sprintf("%s/v1/embeddings", s.llmServiceURL)

	payload := map[string]interface{}{
		"model": modelID,
		"input": text,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 {
		log.Printf("[MemoryService] WARNING: No embedding returned for model %s", modelID)
		return nil, nil
	}

	return result.Data[0].Embedding, nil
}
