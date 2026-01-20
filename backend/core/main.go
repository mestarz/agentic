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

// cors 中间件处理跨域请求
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

// getSessionDir 获取会话数据的存储目录
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
	// 1. 初始化持久化层
	sessionDir := getSessionDir()
	log.Printf("[CORE] Session storage: %s", sessionDir)
	repo, _ := persistence.NewFileHistoryRepository(sessionDir)

	// 2. 初始化核心服务
	hSvc := history.NewService(repo)
	cEng := context.NewEngine(hSvc)
	cSvc := context.NewService(hSvc, cEng)

	// 3. 配置路由
	mux := http.NewServeMux()
	
	// 上下文业务接口
	ctxHandler := api.NewContextHandler(cSvc)
	mux.HandleFunc("/api/v1/sessions", ctxHandler.CreateSession)
	mux.HandleFunc("/api/v1/messages", ctxHandler.AppendMessage)
	mux.HandleFunc("/api/v1/context", ctxHandler.GetContext)
	
	// 管理后台接口
	admin := api.NewAdminHandler(hSvc)
	mux.HandleFunc("/api/admin/sessions", admin.ServeSessions)
	mux.HandleFunc("/api/admin/sessions/", admin.ServeSessions)

	// 4. 启动服务
	log.Printf("[CORE] Listening on 9091...")
	http.ListenAndServe("0.0.0.0:9091", cors(mux))
}