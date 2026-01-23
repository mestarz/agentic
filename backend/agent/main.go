package main

import (
	"context-fabric/backend/agent/logic"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(200)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	coreURL := "http://127.0.0.1:9091"
	llmGatewayURL := "http://127.0.0.1:8000"

	coreClient := logic.NewCoreServiceClient(coreURL)
	llmGateway := logic.NewLLMGatewayClient(llmGatewayURL)
	agentSvc := logic.NewAgentService(coreClient, llmGateway)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/debug/chat", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SessionID         string `json:"session_id"`
			Query             string `json:"query"`
			AgentModelID      string `json:"agent_model_id"`
			CoreModelID       string `json:"core_model_id"`
			RagEnabled        bool   `json:"rag_enabled"`
			RagEmbeddingModel string `json:"rag_embedding_model_id"`
			SanitizationModel string `json:"sanitization_model_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}

		out := make(chan string)
		go agentSvc.Chat(r.Context(), req.SessionID, req.Query, req.AgentModelID, req.CoreModelID, req.RagEnabled, req.RagEmbeddingModel, req.SanitizationModel, out)
		for c := range out {
			fmt.Fprintf(w, "data: %s\n\n", c)
			flusher.Flush()
		}
	})

	mux.HandleFunc("/api/debug/embeddings", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ModelID string `json:"model_id"`
			Input   string `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		result, err := llmGateway.GetEmbeddings(r.Context(), req.ModelID, req.Input)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// 代理到 LLM Gateway
	mux.HandleFunc("/api/models/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/models")
		target := llmGatewayURL + "/v1" + path
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		req, _ := http.NewRequest(r.Method, target, r.Body)
		for k, v := range r.Header {
			req.Header[k] = v
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		defer resp.Body.Close()
		for k, v := range resp.Header {
			w.Header()[k] = v
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	// 代理到 Core Admin
	mux.HandleFunc("/api/admin/", func(w http.ResponseWriter, r *http.Request) {
		target := coreURL + r.URL.Path
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		req, _ := http.NewRequest(r.Method, target, r.Body)
		for k, v := range r.Header {
			req.Header[k] = v
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		defer resp.Body.Close()
		for k, v := range resp.Header {
			w.Header()[k] = v
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	fmt.Println("[AGENT] Listening on 0.0.0.0:9090...")
	http.ListenAndServe("0.0.0.0:9090", cors(mux))
}
