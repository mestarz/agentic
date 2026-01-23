package persistence

import (
	"bytes"
	"context"
	"context-fabric/backend/core/domain"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

type QdrantRepository struct {
	baseURL     string
	stagingColl string
	sharedColl  string
	client      *http.Client
}

func NewQdrantRepository(url, staging, shared string) *QdrantRepository {
	return &QdrantRepository{
		baseURL:     url,
		stagingColl: staging,
		sharedColl:  shared,
		client:      &http.Client{},
	}
}

func (r *QdrantRepository) SaveStagingFact(ctx context.Context, fact *domain.StagingFact) error {
	log.Printf("[Qdrant] Saving staging fact: %s", fact.ID)
	endpoint := fmt.Sprintf("%s/collections/%s/points?wait=true", r.baseURL, r.stagingColl)

	payload := map[string]interface{}{
		"points": []map[string]interface{}{
			{
				"id":     fact.ID,
				"vector": fact.Vector,
				"payload": map[string]interface{}{
					"content":        fact.Content,
					"source_session": fact.SourceSession,
					"created_at":     fact.CreatedAt.Unix(),
					"status":         fact.Status,
				},
			},
		},
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "PUT", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("qdrant error: %s", resp.Status)
	}
	return nil
}

func (r *QdrantRepository) SearchStagingFacts(ctx context.Context, vector []float32, limit int) ([]domain.StagingFact, error) {
	log.Printf("[Qdrant] Searching staging facts (limit: %d)", limit)
	endpoint := fmt.Sprintf("%s/collections/%s/points/search", r.baseURL, r.stagingColl)

	payload := map[string]interface{}{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant search error: %s - %s", resp.Status, string(body))
	}

	var result struct {
		Result []struct {
			ID      string                 `json:"id"`
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var facts []domain.StagingFact
	for _, item := range result.Result {
		f := domain.StagingFact{
			ID:      item.ID,
			Content: item.Payload["content"].(string),
			Status:  item.Payload["status"].(string),
		}
		facts = append(facts, f)
	}
	return facts, nil
}

func (r *QdrantRepository) ListPendingFacts(ctx context.Context, limit int) ([]domain.StagingFact, error) {
	endpoint := fmt.Sprintf("%s/collections/%s/points/scroll", r.baseURL, r.stagingColl)

	payload := map[string]interface{}{
		"limit": limit,
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key": "status",
					"match": map[string]interface{}{
						"value": "pending",
					},
				},
			},
		},
		"with_payload": true,
		"with_vector":  true,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Result struct {
			Points []struct {
				ID      string                 `json:"id"`
				Vector  []float32              `json:"vector"`
				Payload map[string]interface{} `json:"payload"`
			} `json:"points"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var facts []domain.StagingFact
	for _, item := range result.Result.Points {
		f := domain.StagingFact{
			ID:      item.ID,
			Vector:  item.Vector,
			Content: item.Payload["content"].(string),
			Status:  item.Payload["status"].(string),
		}
		facts = append(facts, f)
	}
	return facts, nil
}

func (r *QdrantRepository) DeleteStagingFact(ctx context.Context, id string) error {
	endpoint := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", r.baseURL, r.stagingColl)

	payload := map[string]interface{}{
		"points": []string{id},
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("qdrant delete error: %s", resp.Status)
	}
	return nil
}

func (r *QdrantRepository) SaveSharedMemory(ctx context.Context, mem *domain.SharedMemory) error {
	log.Printf("[Qdrant] Saving shared memory: %s (Topic: %s)", mem.ID, mem.Topic)
	endpoint := fmt.Sprintf("%s/collections/%s/points?wait=true", r.baseURL, r.sharedColl)

	payload := map[string]interface{}{
		"points": []map[string]interface{}{
			{
				"id":     mem.ID,
				"vector": mem.Vector,
				"payload": map[string]interface{}{
					"content":       mem.Content,
					"topic":         mem.Topic,
					"confidence":    mem.Confidence,
					"version":       mem.Version,
					"status":        mem.Status,
					"last_verified": mem.LastVerified.Unix(),
					"evidence_refs": mem.EvidenceRefs,
				},
			},
		},
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "PUT", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("qdrant shared save error: %s", resp.Status)
	}
	return nil
}

func (r *QdrantRepository) SearchSharedMemories(ctx context.Context, vector []float32, limit int) ([]domain.SharedMemory, error) {
	log.Printf("[Qdrant] Searching shared memories (limit: %d)", limit)
	endpoint := fmt.Sprintf("%s/collections/%s/points/search", r.baseURL, r.sharedColl)

	payload := map[string]interface{}{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant shared search error: %s - %s", resp.Status, string(body))
	}

	var result struct {
		Result []struct {
			ID      string                 `json:"id"`
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var memories []domain.SharedMemory
	for _, item := range result.Result {
		m := domain.SharedMemory{
			ID:      item.ID,
			Content: item.Payload["content"].(string),
			Topic:   item.Payload["topic"].(string),
			Version: int(item.Payload["version"].(float64)),
			Status:  item.Payload["status"].(string),
		}
		memories = append(memories, m)
	}
	return memories, nil
}

func (r *QdrantRepository) UpdateSharedMemory(ctx context.Context, mem *domain.SharedMemory) error {
	return r.SaveSharedMemory(ctx, mem) // Qdrant PUT is upsert
}

func (r *QdrantRepository) DeleteSharedMemory(ctx context.Context, id string) error {
	endpoint := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", r.baseURL, r.sharedColl)

	payload := map[string]interface{}{
		"points": []string{id},
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("qdrant shared delete error: %s", resp.Status)
	}
	return nil
}

// DeletePoints Generic delete for admin
func (r *QdrantRepository) DeletePoints(ctx context.Context, collection string, ids []string) error {
	endpoint := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", r.baseURL, collection)

	payload := map[string]interface{}{
		"points": ids,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("qdrant generic delete error: %s", resp.Status)
	}
	return nil
}

// ScrollPoints Generic scroll for admin viewer
func (r *QdrantRepository) ScrollPoints(ctx context.Context, collection string, limit int, offset interface{}) (map[string]interface{}, error) {
	endpoint := fmt.Sprintf("%s/collections/%s/points/scroll", r.baseURL, collection)

	payload := map[string]interface{}{
		"limit":        limit,
		"with_payload": true,
		"with_vector":  false, // Don't return full vectors to save bandwidth
	}
	if offset != nil {
		payload["offset"] = offset
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("qdrant scroll error: %s", resp.Status)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}
