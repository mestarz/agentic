#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")/.."; pwd)
LOG_DIR="$ROOT_DIR/logs"
BIN_DIR="$ROOT_DIR/bin"
mkdir -p "$LOG_DIR" "$BIN_DIR"

export AGENTIC_LOG_DIR="$LOG_DIR"

# 清理代理
unset http_proxy https_proxy all_proxy
export NO_PROXY="localhost,127.0.0.1,0.0.0.0"

# 配置环境变量
export LLM_SERVICE_URL="http://localhost:8000"
export AGENTIC_SESSIONS_DIR="$ROOT_DIR/data/sessions"
export QDRANT_URL="http://localhost:6333"
export QDRANT_COLLECTION="documents"
export AGENTIC_VECTOR_SIZE=1024
export RAG_EMBEDDING_MODEL="embedding-c37c78"
export AGENTIC_REFLECTION_MODEL="deepseek-chat"

echo "正在启动 ContextFabric 完全隔离版 (Core + Agent + LLM Gateway)..."

# 0. 启动 Qdrant 向量数据库 (Docker)
echo "启动 Qdrant 服务..."
docker run -d --name agentic-qdrant \
    -p 6333:6333 -p 6334:6334 \
    -v "$ROOT_DIR/data/qdrant:/qdrant/storage" \
    qdrant/qdrant:latest > /dev/null 2>&1 || docker start agentic-qdrant

# 捕获 Qdrant 日志
nohup docker logs -f agentic-qdrant > "$LOG_DIR/qdrant.log" 2>&1 &
echo $! > "$LOG_DIR/qdrant-logger.pid"

# 0. 启动 LLM Gateway (Python)
echo "启动 LLM Gateway 服务..."
cd "$ROOT_DIR/llm-service"
# 尝试创建并激活虚拟环境 (可选)
if [ ! -d "venv" ]; then
    python3 -m venv venv
    "$ROOT_DIR/llm-service/venv/bin/pip" install -r requirements.txt
fi

# 在启动 Gateway 之前，初始化 Qdrant 集合
echo "检查并初始化 Qdrant 集合..."
sleep 2
"$ROOT_DIR/llm-service/venv/bin/python3" "$ROOT_DIR/data/scripts/init_qdrant.py"

nohup "$ROOT_DIR/llm-service/venv/bin/python3" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/llm-gateway.log" 2>&1 &
echo $! > "$LOG_DIR/llm-gateway.pid"

# 1. 编译并启动 Core
echo "编译 Core 服务..."
cd "$ROOT_DIR/backend/core"
go build -o "$BIN_DIR/cf-core" ./main.go
nohup "$BIN_DIR/cf-core" > "$LOG_DIR/core.log" 2>&1 &
echo $! > "$LOG_DIR/core.pid"

# 2. 编译并启动 Agent
echo "编译 Agent 服务..."
cd "$ROOT_DIR/backend/agent"
go build -o "$BIN_DIR/cf-agent" ./main.go
nohup "$BIN_DIR/cf-agent" > "$LOG_DIR/agent.log" 2>&1 &
echo $! > "$LOG_DIR/agent.pid"

# 3. 启动前端
echo "启动前端 React 服务..."
cd "$ROOT_DIR/frontend"
nohup npm run dev -- --host 0.0.0.0 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

echo "---------------------------------------"
echo "系统启动指令已发出！"
sleep 3
ss -tulpn | grep -E '9090|9091|5173|8000'
echo "---------------------------------------"
echo "Web 控制台访问地址: http://localhost:5173"
echo "---------------------------------------"
