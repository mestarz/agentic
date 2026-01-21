package api

import (
	"context-fabric/backend/core/context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// ContextHandler 处理与上下文构建相关的 HTTP 请求
type ContextHandler struct{ svc *context.Service }

// NewContextHandler 创建一个新的 ContextHandler 实例
func NewContextHandler(s *context.Service) *ContextHandler { return &ContextHandler{svc: s} }

// CreateSession 创建新的会话
func (h *ContextHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppID string `json:"app_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	session, _ := h.svc.CreateSession(r.Context(), req.AppID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// AppendMessage 向现有会话追加消息
func (h *ContextHandler) AppendMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string         `json:"session_id"`
		Message   domain.Message `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	meta, _ := h.svc.AppendMessage(r.Context(), req.SessionID, req.Message)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(meta)
}

// GetContext 获取经过 Pipeline 优化后的上下文负载
func (h *ContextHandler) GetContext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID         string `json:"session_id"`
		Query             string `json:"query"`
		ModelID           string `json:"model_id"`
		RagEnabled        bool   `json:"rag_enabled"`
		RagEmbeddingModel string `json:"rag_embedding_model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	msgs, _ := h.svc.GetOptimizedContext(r.Context(), req.SessionID, req.Query, req.ModelID, req.RagEnabled, req.RagEmbeddingModel)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"messages": msgs})
}

// AdminHandler 处理会话管理和测试用例相关的管理端请求
type AdminHandler struct{ history *history.Service }

func NewAdminHandler(h *history.Service) *AdminHandler { return &AdminHandler{history: h} }

func (h *AdminHandler) parseID(r *http.Request) string {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) >= 4 {
		return parts[3]
	}
	return ""
}

func (h *AdminHandler) ServeTestCases(w http.ResponseWriter, r *http.Request) {
	id := h.parseID(r)
	if id != "" {
		if r.Method == http.MethodDelete {
			h.history.DeleteTestCase(r.Context(), id)
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodPut {
			var tc domain.TestCase
			if err := json.NewDecoder(r.Body).Decode(&tc); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			tc.ID = id
			h.history.SaveTestCase(r.Context(), &tc)
			w.WriteHeader(http.StatusOK)
			return
		}
		tc, _ := h.history.GetTestCase(r.Context(), id)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tc)
		return
	}

	if r.Method == http.MethodPost {
		var req struct {
			SessionID string `json:"session_id"`
			Name      string `json:"name"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		tc, _ := h.history.CreateTestCaseFromSession(r.Context(), req.SessionID, req.Name)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tc)
		return
	}

	list, _ := h.history.ListTestCases(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (h *AdminHandler) ServeSessions(w http.ResponseWriter, r *http.Request) {
	id := h.parseID(r)
	if id != "" {
		if r.Method == http.MethodDelete {
			h.history.Delete(r.Context(), id)
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodPatch {
			var req struct {
				Name string `json:"name"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			h.history.Rename(r.Context(), id, req.Name)
			w.WriteHeader(http.StatusOK)
			return
		}
		session, _ := h.history.Get(r.Context(), id)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(session)
		return
	}

	if r.Method == http.MethodDelete {
		var ids []string
		json.NewDecoder(r.Body).Decode(&ids)
		h.history.DeleteBatch(r.Context(), ids)
		w.WriteHeader(http.StatusOK)
		return
	}

	list, _ := h.history.List(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (h *AdminHandler) GetSystemStatus(w http.ResponseWriter, r *http.Request) {
	qdrantURL := getEnv("QDRANT_URL", "http://localhost:6333")
	status := "disconnected"
	resp, err := http.Get(qdrantURL + "/healthz")
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			status = "connected"
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"qdrant": map[string]string{
			"status":   status,
			"endpoint": qdrantURL,
		},
	})
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
