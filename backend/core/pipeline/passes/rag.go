package passes

import (
	"bytes"
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	"context-fabric/backend/core/util"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// RAGPass 实现了检索增强生成逻辑，支持从向量数据库获取背景知识。
type RAGPass struct {
	qdrantURL      string
	collectionName string
	embeddingURL   string
	defaultModelID string
	topK           int
}

// NewRAGPass 基于环境变量初始化 RAG 处理器。
func NewRAGPass() *RAGPass {
	return &RAGPass{
		qdrantURL:      util.GetEnv("QDRANT_URL", "http://localhost:6333"),
		collectionName: util.GetEnv("QDRANT_COLLECTION", "documents"),
		embeddingURL:   util.GetEnv("LLM_SERVICE_URL", "http://localhost:8000") + "/v1/embeddings",
		defaultModelID: util.GetEnv("RAG_EMBEDDING_MODEL", "text-embedding-3-small"),
		topK:           3,
	}
}

func (p *RAGPass) Name() string {
	return "RAGPass"
}

func (p *RAGPass) Description() string {
	return "检索增强生成 (RAG)"
}

func (p *RAGPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	isEnabled, _ := data.Meta["rag_enabled"].(bool)
	if !isEnabled {
		return nil
	}

	embeddingModel, _ := data.Meta["rag_embedding_model"].(string)
	if embeddingModel == "" {
		embeddingModel = p.defaultModelID
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

	// 2. 获取向量
	vector, err := p.fetchEmbedding(ctx, userQuery, embeddingModel)
	if err != nil {
		data.Traces = append(data.Traces, map[string]interface{}{
			"source": "RAGPass",
			"action": "EmbeddingError",
			"data":   map[string]interface{}{"error": err.Error()},
		})
		return nil
	}

	// 3. Qdrant 检索
	results, err := p.searchQdrant(ctx, vector)
	if err != nil {
		data.Traces = append(data.Traces, map[string]interface{}{
			"source": "RAGPass",
			"action": "SearchError",
			"data":   map[string]interface{}{"error": err.Error()},
		})
		return nil
	}

	if len(results) == 0 {
		return nil
	}

	// 4. 注入上下文
	var contextBuilder bytes.Buffer
	for _, content := range results {
		contextBuilder.WriteString(fmt.Sprintf("---\n%s\n", content))
	}
	knowledgeContext := contextBuilder.String()

	data.Meta["rag_context"] = knowledgeContext

	systemMessage := domain.Message{
		Role:      domain.RoleSystem,
		Content:   "以下是检索到的参考信息，请结合这些信息回答用户问题：\n\n" + knowledgeContext,
		Timestamp: time.Now(),
	}

	// 插入到最后一条 User 消息之前
	if len(data.Messages) > 0 {
		idx := len(data.Messages) - 1
		newMsgs := make([]domain.Message, 0, len(data.Messages)+1)
		newMsgs = append(newMsgs, data.Messages[:idx]...)
		newMsgs = append(newMsgs, systemMessage)
		newMsgs = append(newMsgs, data.Messages[idx])
		data.Messages = newMsgs
	}

	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "RAGPass",
		"target": "Qdrant",
		"action": "SearchComplete",
		"data": map[string]interface{}{
			"count": len(results),
		},
	})

	return nil
}

func (p *RAGPass) fetchEmbedding(ctx context.Context, text, modelID string) ([]float32, error) {
	payload := map[string]interface{}{"model": modelID, "input": text}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequestWithContext(ctx, "POST", p.embeddingURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding gateway returned status %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}

	return result.Data[0].Embedding, nil
}

func (p *RAGPass) searchQdrant(ctx context.Context, vector []float32) ([]string, error) {
	searchURL := fmt.Sprintf("%s/collections/%s/points/search", p.qdrantURL, p.collectionName)
	payload := map[string]interface{}{
		"vector":       vector,
		"limit":        p.topK,
		"with_payload": true,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequestWithContext(ctx, "POST", searchURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("qdrant search failed with status %d", resp.StatusCode)
	}

	var searchResponse struct {
		Result []struct {
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&searchResponse); err != nil {
		return nil, err
	}

	var snippets []string
	for _, item := range searchResponse.Result {
		if content, ok := item.Payload["content"].(string); ok {
			snippets = append(snippets, content)
		}
	}

	return snippets, nil
}
