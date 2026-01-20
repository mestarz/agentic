package api

import (
	"context-fabric/backend/core/context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"encoding/json"
	"net/http"
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
	json.NewDecoder(r.Body).Decode(&req)
	s, _ := h.svc.CreateSession(r.Context(), req.AppID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// AppendMessage 向现有会话追加消息
func (h *ContextHandler) AppendMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string         `json:"session_id"`
		Message   domain.Message `json:"message"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	meta, _ := h.svc.AppendMessage(r.Context(), req.SessionID, req.Message)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(meta)
}

// GetContext 获取经过 Pipeline 优化后的上下文负载
func (h *ContextHandler) GetContext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
		Query     string `json:"query"`
		ModelID   string `json:"model_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	msgs, _ := h.svc.GetOptimizedContext(r.Context(), req.SessionID, req.Query, req.ModelID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"messages": msgs})
}

// AdminHandler 处理会话管理相关的管理端请求
type AdminHandler struct{ history *history.Service }

// NewAdminHandler 创建一个新的 AdminHandler 实例
func NewAdminHandler(h *history.Service) *AdminHandler { return &AdminHandler{history: h} }

// ServeSessions 提供会话列表查询、详情获取及删除功能
func (h *AdminHandler) ServeSessions(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// 处理详情或删除单条: /api/admin/sessions/{id}
	if len(parts) == 4 {
		id := parts[3]
		if r.Method == http.MethodDelete {
			h.history.Delete(r.Context(), id)
			w.WriteHeader(200)
			return
		}
		s, _ := h.history.Get(r.Context(), id)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s)
		return
	}
	// 批量删除请求
	if r.Method == http.MethodDelete {
		var ids []string
		json.NewDecoder(r.Body).Decode(&ids)
		h.history.DeleteBatch(r.Context(), ids)
		w.WriteHeader(200)
		return
	}
	// 列表查询请求
	l, _ := h.history.List(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(l)
}