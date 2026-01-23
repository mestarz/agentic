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

// getLLMServiceURL 获取核心引擎调用摘要模型所需的 LLM 网关地址
func getLLMServiceURL() string {
	if url := os.Getenv("LLM_SERVICE_URL"); url != "" {
		return url
	}
	return "http://localhost:8000"
}

func getQdrantConfig() (string, string, string) {
	url := os.Getenv("AGENTIC_QDRANT_URL")
	if url == "" {
		url = "http://localhost:6333"
	}
	staging := os.Getenv("AGENTIC_MEM_STAGING_COLL")
	if staging == "" {
		staging = "mem_staging"
	}
	shared := os.Getenv("AGENTIC_MEM_SHARED_COLL")
	if shared == "" {
		shared = "mem_shared"
	}
	return url, staging, shared
}

func main() {
	// 1. 初始化持久化层
	sessionDir := getSessionDir()
	testcaseDir := filepath.Join(filepath.Dir(sessionDir), "testcases")
	llmServiceURL := getLLMServiceURL()
	log.Printf("[CORE] Session storage: %s", sessionDir)
	log.Printf("[CORE] TestCase storage: %s", testcaseDir)
	log.Printf("[CORE] LLM Service URL: %s", llmServiceURL)

	repo, _ := persistence.NewFileHistoryRepository(sessionDir)
	tcRepo, _ := persistence.NewFileTestCaseRepository(testcaseDir)

	// 1.1 初始化向量存储层 (DEMA)
	qURL, qStaging, qShared := getQdrantConfig()
	vRepo := persistence.NewQdrantRepository(qURL, qStaging, qShared)
	log.Printf("[CORE] Vector store: %s (Staging: %s, Shared: %s)", qURL, qStaging, qShared)

	// 2. 初始化核心服务
	mSvc := context.NewMemoryService(vRepo, llmServiceURL)
	hSvc := history.NewService(repo, tcRepo)
	cEng := context.NewEngine(hSvc, llmServiceURL, mSvc)
	cSvc := context.NewService(hSvc, cEng, mSvc)

	// 3. 配置路由
	mux := http.NewServeMux()

	// 上下文业务接口
	ctxHandler := api.NewContextHandler(cSvc)
	mux.HandleFunc("/api/v1/sessions", ctxHandler.CreateSession)
	mux.HandleFunc("/api/v1/messages", ctxHandler.AppendMessage)
	mux.HandleFunc("/api/v1/context", ctxHandler.GetContext)

	// 管理后台接口
	admin := api.NewAdminHandler(hSvc, vRepo)
	mux.HandleFunc("/api/admin/sessions", admin.ServeSessions)
	mux.HandleFunc("/api/admin/sessions/", admin.ServeSessions)
	mux.HandleFunc("/api/admin/testcases", admin.ServeTestCases)
	mux.HandleFunc("/api/admin/testcases/", admin.ServeTestCases)
	mux.HandleFunc("/api/admin/vectors", admin.ServeVectors)
	mux.HandleFunc("/api/admin/status", admin.GetSystemStatus)
	mux.HandleFunc("/api/admin/logs", admin.ServeLogs)
	mux.HandleFunc("/api/admin/docs", admin.ServeDocs)

	// 4. 启动服务
	log.Printf("[CORE] Listening on 9091...")
	http.ListenAndServe("0.0.0.0:9091", cors(mux))
}
