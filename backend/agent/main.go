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
	llmGatewayURL := "http://127.0.0.1:8000" // Default FastAPI port
	cc := logic.NewCoreServiceClient(coreURL)
	lg := logic.NewLLMGatewayClient(llmGatewayURL)
	svc := logic.NewAgentService(cc, lg)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/debug/chat", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SessionID    string `json:"session_id"`
			Query        string `json:"query"`
			AgentModelID string `json:"agent_model_id"`
			CoreModelID  string `json:"core_model_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate required fields
		if req.AgentModelID == "" {
			http.Error(w, "agent_model_id is required", http.StatusBadRequest)
			return
		}
		if req.CoreModelID == "" {
			// CoreModelID might be optional depending on design, but let's enforce it for now or default to AgentModelID?
			// Let's enforce it to be explicit based on user's request for robustness.
			http.Error(w, "core_model_id is required", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}

		out := make(chan string)
		go svc.Chat(r.Context(), req.SessionID, req.Query, req.AgentModelID, req.CoreModelID, out)
		for c := range out {
			fmt.Fprintf(w, "data: %s\n\n", c)
			flusher.Flush()
		}
	})

	// Proxy to LLM Gateway for model management
	mux.HandleFunc("/api/models/", func(w http.ResponseWriter, r *http.Request) {
		// Strip /api/models and forward to /v1 (e.g., /api/models/models -> /v1/models)
		path := strings.TrimPrefix(r.URL.Path, "/api/models")
		req, err := http.NewRequest(r.Method, llmGatewayURL+"/v1"+path, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	mux.HandleFunc("/api/admin/", func(w http.ResponseWriter, r *http.Request) {
		req, err := http.NewRequest(r.Method, coreURL+r.URL.Path, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	http.ListenAndServe("0.0.0.0:9090", cors(mux))
}
