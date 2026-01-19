package main

import (
	"context-fabric/backend/core/api"
	"context-fabric/backend/core/context"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/persistence"
	"log"
	"net/http"
	"os"
	"path/filepath"
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

func getSessionDir() string {
	if env := os.Getenv("AGENTIC_SESSIONS_DIR"); env != "" {
		return env
	}
	home, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Warning: Could not get user home dir, falling back to ./data/sessions: %v", err)
		return "./data/sessions"
	}
	return filepath.Join(home, ".agentic", "sessions")
}

func main() {
	sessionDir := getSessionDir()
	log.Printf("[CORE] Session storage: %s", sessionDir)

	repo, _ := persistence.NewFileHistoryRepository(sessionDir)
	hSvc := history.NewService(repo)
	cEng := context.NewEngine(hSvc)
	cSvc := context.NewService(hSvc, cEng)
	mux := http.NewServeMux()
	ctxHandler := api.NewContextHandler(cSvc)
	mux.HandleFunc("/api/v1/sessions", ctxHandler.CreateSession)
	mux.HandleFunc("/api/v1/messages", ctxHandler.AppendMessage)
	mux.HandleFunc("/api/v1/context", ctxHandler.GetContext)
	admin := api.NewAdminHandler(hSvc)
	mux.HandleFunc("/api/admin/sessions", admin.ServeSessions)
	mux.HandleFunc("/api/admin/sessions/", admin.ServeSessions)
	log.Printf("[CORE] Listening on 9091...")
	http.ListenAndServe("0.0.0.0:9091", cors(mux))
}
