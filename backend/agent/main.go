package main

import (
	"context-fabric/backend/agent/domain"
	"context-fabric/backend/agent/logic"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	cc := logic.NewCoreClient(coreURL)
	svc := logic.NewAgentService(cc)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/debug/chat", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SessionID   string           `json:"session_id"`
			Query       string           `json:"query"`
			AgentConfig domain.LLMConfig `json:"agent_config"`
			CoreConfig  domain.LLMConfig `json:"core_config"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		out := make(chan string)
		go svc.Chat(r.Context(), req.SessionID, req.Query, req.AgentConfig, req.CoreConfig, out)
		for c := range out {
			fmt.Fprintf(w, "data: %s\n\n", c)
			flusher.Flush()
		}
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
