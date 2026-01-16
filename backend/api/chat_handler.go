package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"context-fabric/backend/internal/domain"
	"context-fabric/backend/internal/service/chat"
)

type ChatRequest struct {
	SessionID string           `json:"session_id"`
	AppID     string           `json:"app_id"`
	Query     string           `json:"query"`
	Config    domain.LLMConfig `json:"config"`
	Stream    bool             `json:"stream"` // 新增 Stream 标志
}

type ChatResponse struct {
	Reply string `json:"reply"`
	Error string `json:"error,omitempty"`
}

type ChatHandler struct {
	orchestrator *chat.Orchestrator
}

func NewChatHandler(o *chat.Orchestrator) *ChatHandler {
	return &ChatHandler{orchestrator: o}
}

func (h *ChatHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 如果请求流式输出
	if req.Stream {
		h.handleStream(w, r, req)
		return
	}

	// 普通非流式请求
	reply, err := h.orchestrator.Chat(r.Context(), req.SessionID, req.AppID, req.Query, req.Config)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ChatResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(ChatResponse{Reply: reply})
}

func (h *ChatHandler) handleStream(w http.ResponseWriter, r *http.Request, req ChatRequest) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	chunkChan := make(chan string)
	
	// 在后台运行 orchestrator.ChatStream
	go func() {
		err := h.orchestrator.ChatStream(r.Context(), req.SessionID, req.AppID, req.Query, req.Config, chunkChan)
		if err != nil {
			// 如果出错，发送错误消息
			fmt.Fprintf(w, "data: {\"error\": %q}\n\n", err.Error())
			flusher.Flush()
		}
	}()

	// 监听通道并转发给客户端
	for chunk := range chunkChan {
		// SSE 格式: data: <content>\n\n
		fmt.Fprintf(w, "data: %s\n\n", chunk)
		flusher.Flush()
	}
}
