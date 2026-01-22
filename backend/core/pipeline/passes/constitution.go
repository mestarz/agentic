package passes

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	"fmt"
	"log"
	"strings"
	"time"
)

type ConstitutionPass struct {
	memorySvc interface {
		GetEmbedding(ctx context.Context, text string, modelID string) ([]float32, error)
		Retrieve(ctx context.Context, vector []float32) ([]domain.SharedMemory, []domain.StagingFact, error)
	}
}

func NewConstitutionPass(svc interface {
	GetEmbedding(ctx context.Context, text string, modelID string) ([]float32, error)
	Retrieve(ctx context.Context, vector []float32) ([]domain.SharedMemory, []domain.StagingFact, error)
}) *ConstitutionPass {
	return &ConstitutionPass{memorySvc: svc}
}

func (p *ConstitutionPass) Name() string {
	return "Constitution"
}

func (p *ConstitutionPass) Description() string {
	return "注入长期记忆与近期事实 (DEMA)"
}

func (p *ConstitutionPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	if p.memorySvc == nil {
		return nil
	}

	// 1. 提取 Query
	var userQuery string
	for i := len(data.Messages) - 1; i >= 0; i-- {
		if data.Messages[i].Role == domain.RoleUser {
			userQuery = data.Messages[i].Content
			break
		}
	}
	if userQuery == "" {
		return nil
	}

	log.Printf("[Constitution] Building context for query: %s", userQuery)

	// 2. 获取向量
	embeddingModel, _ := data.Meta["rag_embedding_model"].(string)
	vector, err := p.memorySvc.GetEmbedding(ctx, userQuery, embeddingModel)
	if err != nil {
		log.Printf("[Constitution] ERROR: Failed to get embedding: %v", err)
		return nil // 允许失败，降级处理
	}

	// 3. 检索
	l1, l2, err := p.memorySvc.Retrieve(ctx, vector)
	if err != nil {
		log.Printf("[Constitution] ERROR: Retrieval failed: %v", err)
		return nil
	}

	log.Printf("[Constitution] Retrieved %d long-term memories and %d recent facts", len(l1), len(l2))

	// 4. 构建注入文本
	var sb strings.Builder
	if len(l1) > 0 {
		sb.WriteString("### 核心事实与偏好 (长期)\n")
		for _, m := range l1 {
			sb.WriteString(fmt.Sprintf("- %s\n", m.Content))
		}
	}
	if len(l2) > 0 {
		if sb.Len() > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString("### 相关近期事件 (暂存)\n")
		for _, f := range l2 {
			sb.WriteString(fmt.Sprintf("- %s\n", f.Content))
		}
	}

	if sb.Len() == 0 {
		return nil
	}

	// 5. 注入作为系统消息
	systemMsg := domain.Message{
		Role:      domain.RoleSystem,
		Content:   "这是从你的长期记忆和近期交互中提取的背景信息，请在回复时参考：\n\n" + sb.String(),
		Timestamp: time.Now(),
	}

	// 插入到最后一条消息之前
	if len(data.Messages) > 0 {
		idx := len(data.Messages) - 1
		newMsgs := make([]domain.Message, 0, len(data.Messages)+1)
		newMsgs = append(newMsgs, data.Messages[:idx]...)
		newMsgs = append(newMsgs, systemMsg)
		newMsgs = append(newMsgs, data.Messages[idx])
		data.Messages = newMsgs
	}

	return nil
}
