package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"context-fabric/backend/internal/service/history"
)

type AdminHandler struct {
	historyService *history.Service
}

func NewAdminHandler(hs *history.Service) *AdminHandler {
	return &AdminHandler{historyService: hs}
}

func (h *AdminHandler) ServeSessions(w http.ResponseWriter, r *http.Request) {
	// 获取列表: GET /api/admin/sessions
	if r.Method == http.MethodGet {
		pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		
		// 如果是 GET /api/admin/sessions/{id}
		if len(pathParts) == 4 {
			sessionID := pathParts[3]
			session, err := h.historyService.Get(r.Context(), sessionID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(session)
			return
		}

		// 否则返回列表
		list, err := h.historyService.List(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
		return
	}
	
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}
