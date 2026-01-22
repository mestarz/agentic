package context

import (
	"bytes"
	"context"
	"context-fabric/backend/core/domain"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type MemoryService struct {
	repo          domain.VectorRepository
	llmServiceURL string
	ingestChan    chan ingestTask
}

type ingestTask struct {
	SessionID string
	Messages  []domain.Message
	ModelID   string
}

func NewMemoryService(repo domain.VectorRepository, llmURL string) *MemoryService {
	svc := &MemoryService{
		repo:          repo,
		llmServiceURL: llmURL,
		ingestChan:    make(chan ingestTask, 100),
	}
	go svc.worker()
	go svc.reflectionLoop()
	return svc
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
	// 1. 获取待处理事实
	facts, err := s.repo.ListPendingFacts(ctx, 10)
	if err != nil {
		return err
	}
	if len(facts) == 0 {
		return nil
	}

	log.Printf("[Memory] Reflection: Found %d pending facts to process", len(facts))

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

		// 4. 执行演进指令
		for _, inst := range instructions {
			log.Printf("[Memory] Reflection EXEC: Action=%s, Reason=%s", inst.Action, inst.Reason)
			if err := s.executeInstruction(ctx, fact, inst); err != nil {
				log.Printf("[Memory] Reflection ERROR: Execution failed for action %s: %v", inst.Action, err)
			}
		}

		// 5. 清理已处理事实
		if err := s.repo.DeleteStagingFact(ctx, fact.ID); err == nil {
			log.Printf("[Memory] Reflection: Fact %s cleaned from staging", fact.ID[:8])
		}
	}

	log.Printf("[Memory] Reflection cycle completed")
	return nil
}

type instructionDTO struct {
	Action      string `json:"action"`
	FactContent string `json:"fact_content"`
	MemoryID    string `json:"memory_id,omitempty"`
	Reason      string `json:"reason,omitempty"`
}

func (s *MemoryService) getEvolutionInstructions(ctx context.Context, fact domain.StagingFact, related []domain.SharedMemory) ([]instructionDTO, error) {
	url := fmt.Sprintf("%s/v1/memory/reflect", s.llmServiceURL)

	payload := map[string]interface{}{
		"model":            "deepseek-chat",
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

func (s *MemoryService) Ingest(ctx context.Context, sessionID string, messages []domain.Message, modelID string) error {
	select {
	case s.ingestChan <- ingestTask{SessionID: sessionID, Messages: messages, ModelID: modelID}:
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

	// 1. 调用 LLM Gateway 进行清洗
	facts, err := s.sanitizeDialogue(ctx, task.Messages)
	if err != nil {
		return err
	}
	log.Printf("[Memory] Ingest: LLM extracted %d facts from dialogue", len(facts))

	for i, f := range facts {
		// 2. 为每个事实获取 Embedding
		embModel := task.ModelID
		if embModel == "" {
			embModel = "text-embedding-3-small"
		}
		vector, err := s.getEmbedding(ctx, f.Content, embModel)
		if err != nil {
			log.Printf("[Memory] Ingest ERROR: Failed to get embedding for fact %d: %v", i, err)
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

	log.Printf("[Memory] Ingest: Session %s processed successfully", task.SessionID)
	return nil
}

type factDTO struct {
	Content string `json:"content"`
	Topic   string `json:"topic"`
}

func (s *MemoryService) sanitizeDialogue(ctx context.Context, msgs []domain.Message) ([]factDTO, error) {
	url := fmt.Sprintf("%s/v1/memory/sanitize", s.llmServiceURL)

	payload := map[string]interface{}{
		"model":    "deepseek-chat", // 默认使用较强的模型进行清洗
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
		return nil, fmt.Errorf("llm gateway sanitize error: %s", resp.Status)
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
		return nil, fmt.Errorf("no embedding returned")
	}

	return result.Data[0].Embedding, nil
}
