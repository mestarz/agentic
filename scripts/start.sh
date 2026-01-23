#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")/.."; pwd)
LOG_DIR="$ROOT_DIR/logs"
BIN_DIR="$ROOT_DIR/bin"
DATA_DIR="$ROOT_DIR/data"

# 定义颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

mkdir -p "$LOG_DIR" "$BIN_DIR" "$DATA_DIR/qdrant"

export AGENTIC_LOG_DIR="$LOG_DIR"
# 清理代理，避免本地服务连不通
unset http_proxy https_proxy all_proxy
export NO_PROXY="localhost,127.0.0.1,0.0.0.0"

# --- 配置环境变量 ---
export LLM_SERVICE_URL="http://localhost:8000"
export AGENTIC_SESSIONS_DIR="$DATA_DIR/sessions"
export QDRANT_URL="http://localhost:6333"
export QDRANT_COLLECTION="documents"
# 注意：若修改此尺寸，现有数据可能会在 init_qdrant.py 中触发重建
export AGENTIC_VECTOR_SIZE=1024 
export RAG_EMBEDDING_MODEL="embedding-c37c78"
export AGENTIC_REFLECTION_MODEL="deepseek-chat"

echo -e "${BLUE}=======================================================${NC}"
echo -e "${BLUE}🚀 启动 Agentic (ContextFabric) 全栈环境${NC}"
echo -e "${BLUE}=======================================================${NC}"

# 1. 启动 Qdrant (Docker)
echo -e "${YELLOW}[1/5] 启动 Qdrant 向量数据库...${NC}"
QDRANT_START_TIME=$(date +%s)
if docker run -d --name agentic-qdrant \
    --restart unless-stopped \
    -p 6333:6333 -p 6334:6334 \
    -v "$DATA_DIR/qdrant:/qdrant/storage" \
    qdrant/qdrant:latest > /dev/null 2>&1; then
    echo -e "   -> 容器已创建并启动"
else
    docker start agentic-qdrant > /dev/null 2>&1
    echo -e "   -> 现有容器已启动"
fi

# 捕获 Qdrant 日志
nohup docker logs -f --since "$QDRANT_START_TIME" agentic-qdrant > "$LOG_DIR/qdrant.log" 2>&1 &
echo $! > "$LOG_DIR/qdrant-logger.pid"

# 等待 Qdrant 就绪
echo -n "   -> 等待 Qdrant 就绪"
MAX_RETRIES=30
for ((i=1; i<=MAX_RETRIES; i++)); do
    if curl -s -f "http://localhost:6333/healthz" > /dev/null; then
        echo -e " ${GREEN}OK${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq $MAX_RETRIES ]; then
        echo -e " ${RED}超时！${NC}"
        echo "请检查 docker logs agentic-qdrant"
        exit 1
    fi
done

# 2. 初始化 Qdrant 集合 (Python Script)
echo -e "${YELLOW}[2/5] 初始化 Qdrant 集合...${NC}"
LLM_DIR="$ROOT_DIR/llm-service"
VENV_PYTHON="$LLM_DIR/venv/bin/python3"
VENV_PIP="$LLM_DIR/venv/bin/pip"

# 检查虚拟环境
if [ ! -f "$VENV_PYTHON" ]; then
    echo "   -> 创建 Python 虚拟环境..."
    python3 -m venv "$LLM_DIR/venv"
    echo "   -> 安装依赖..."
    "$VENV_PIP" install -r "$LLM_DIR/requirements.txt" > "$LOG_DIR/pip_install.log" 2>&1
fi

# 运行初始化脚本
if "$VENV_PYTHON" "$ROOT_DIR/data/scripts/init_qdrant.py"; then
    echo -e "   -> ${GREEN}初始化完成${NC}"
else
    echo -e "   -> ${RED}初始化失败，请查看输出${NC}"
    # 不退出，尝试继续启动，因为可能只是部分失败
fi

# 3. 启动 LLM Gateway
echo -e "${YELLOW}[3/5] 启动 LLM Gateway...${NC}"
cd "$LLM_DIR"
nohup "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/llm-gateway.log" 2>&1 &
echo $! > "$LOG_DIR/llm-gateway.pid"

# 4. 编译并启动 Go 服务 (Core + Agent)
echo -e "${YELLOW}[4/5] 启动后端服务 (Core & Agent)...${NC}"

# Core
echo -n "   -> 编译 Core..."
cd "$ROOT_DIR/backend/core"
if go build -o "$BIN_DIR/cf-core" ./main.go; then
    echo -e " ${GREEN}OK${NC}"
    nohup "$BIN_DIR/cf-core" > "$LOG_DIR/core.log" 2>&1 &
    echo $! > "$LOG_DIR/core.pid"
else
    echo -e " ${RED}失败${NC}"
    exit 1
fi

# Agent
echo -n "   -> 编译 Agent..."
cd "$ROOT_DIR/backend/agent"
if go build -o "$BIN_DIR/cf-agent" ./main.go; then
    echo -e " ${GREEN}OK${NC}"
    nohup "$BIN_DIR/cf-agent" > "$LOG_DIR/agent.log" 2>&1 &
    echo $! > "$LOG_DIR/agent.pid"
else
    echo -e " ${RED}失败${NC}"
    exit 1
fi

# 5. 启动前端
echo -e "${YELLOW}[5/5] 启动前端 (Vite)...${NC}"
cd "$ROOT_DIR/frontend"
nohup npm run dev -- --host 0.0.0.0 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

echo -e "${BLUE}=======================================================${NC}"
echo -e "${GREEN}✅ 系统启动完毕！${NC}"
echo -e "Web 控制台: ${GREEN}http://localhost:5173${NC}"
echo -e "API 文档  : ${GREEN}http://localhost:9091/api/admin/docs${NC}"
echo -e "日志目录  : ${LOG_DIR}"
echo -e "${BLUE}=======================================================${NC}"

# 简单检查端口监听
sleep 2
echo "端口监听状态:"
if command -v ss >/dev/null 2>&1; then
    ss -tulpn | grep -E '9090|9091|5173|8000|6333'
else
    netstat -tulpn | grep -E '9090|9091|5173|8000|6333'
fi