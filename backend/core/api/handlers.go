package api

import (
	"context-fabric/backend/core/context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/persistence"
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
type AdminHandler struct {
	history    *history.Service
	vectorRepo *persistence.QdrantRepository
}

func NewAdminHandler(h *history.Service, v *persistence.QdrantRepository) *AdminHandler {
	return &AdminHandler{history: h, vectorRepo: v}
}

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

func (h *AdminHandler) ServeVectors(w http.ResponseWriter, r *http.Request) {
	if h.vectorRepo == nil {
		http.Error(w, "Vector repository not configured", http.StatusNotImplemented)
		return
	}

	collection := r.URL.Query().Get("collection")
	if collection == "" {
		// List available collections (simulated for now, based on env known ones)
		// Or just error out. Let's return the configured ones if possible, but
		// the repo struct has them private or we need getters.
		// For now, let's require collection param.
		http.Error(w, "Missing collection parameter", http.StatusBadRequest)
		return
	}

	limit := 20 // default
	// parse limit...

	res, err := h.vectorRepo.ScrollPoints(r.Context(), collection, limit, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
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

func (h *AdminHandler) ServeLogs(w http.ResponseWriter, r *http.Request) {
	fileType := r.URL.Query().Get("file")
	// linesStr := r.URL.Query().Get("lines")

	// 默认回退到相对路径 (假设 binary 在 backend/core 下运行)
	logDir := getEnv("AGENTIC_LOG_DIR", "../../logs")
	allowedFiles := map[string]string{
		"core":     "core.log",
		"agent":    "agent.log",
		"llm":      "llm-gateway.log",
		"frontend": "frontend.log",
		"qdrant":   "qdrant.log",
	}

	fileName, ok := allowedFiles[fileType]
	if !ok {
		http.Error(w, "Invalid log file type", http.StatusBadRequest)
		return
	}

	filePath := strings.TrimRight(logDir, "/") + "/" + fileName
	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Log file not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 简单实现：只返回最后 50KB 或者最后 2000 行
	// 这里为了简单，直接返回所有内容（假设日志会被 rotate 或者重启清空）
	// 改进：限制返回大小，避免前端崩溃
	maxBytes := 100 * 1024 // 100KB
	if len(content) > maxBytes {
		content = content[len(content)-maxBytes:]
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write(content)
}

func (h *AdminHandler) ServeDocs(w http.ResponseWriter, r *http.Request) {
	docName := r.URL.Query().Get("name")
	docsDir := getEnv("AGENTIC_DOCS_DIR", "../../docs")

	// List docs
	if docName == "" {
		entries, err := os.ReadDir(docsDir)
		if err != nil {
			http.Error(w, "Failed to list docs: "+err.Error(), http.StatusInternalServerError)
			return
		}
		var files []string
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
				files = append(files, e.Name())
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
		return
	}

	// Get doc content
	// Security check: prevent directory traversal
	if strings.Contains(docName, "..") || strings.Contains(docName, "/") || strings.Contains(docName, "\\") {
		http.Error(w, "Invalid document name", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(docsDir + "/" + docName)
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Write(content)
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
