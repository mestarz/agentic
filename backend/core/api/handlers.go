package api

import (
	"context-fabric/backend/core/context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"encoding/json"
	"net/http"
	"strings"
)

type ContextHandler struct{ svc *context.Service }

func NewContextHandler(s *context.Service) *ContextHandler { return &ContextHandler{svc: s} }
func (h *ContextHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppID string `json:"app_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	s, _ := h.svc.CreateSession(r.Context(), req.AppID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}
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
func (h *ContextHandler) GetContext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string           `json:"session_id"`
		Query     string           `json:"query"`
		Config    domain.LLMConfig `json:"config"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	msgs, _ := h.svc.GetOptimizedContext(r.Context(), req.SessionID, req.Query, req.Config)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"messages": msgs})
}

type AdminHandler struct{ history *history.Service }

func NewAdminHandler(h *history.Service) *AdminHandler { return &AdminHandler{history: h} }
func (h *AdminHandler) ServeSessions(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
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
	if r.Method == http.MethodDelete {
		var ids []string
		json.NewDecoder(r.Body).Decode(&ids)
		h.history.DeleteBatch(r.Context(), ids)
		w.WriteHeader(200)
		return
	}
	l, _ := h.history.List(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(l)
}
