#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")/.."; pwd)
LOG_DIR="$ROOT_DIR/logs"

# 定义颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 正在停止 Agentic 服务...${NC}"

# 1. 停止本地进程 (优先停止日志采集等进程)
# 定义服务列表：名称 PID文件名 进程特征
SERVICES=(
    "Frontend:frontend.pid:vite"
    "Agent:agent.pid:cf-agent"
    "Core:core.pid:cf-core"
    "LLM-Gateway:llm-gateway.pid:uvicorn"
    "Qdrant-Logger:qdrant-logger.pid:docker logs"
)

for entry in "${SERVICES[@]}"; do
    IFS=':' read -r NAME PID_FILE PROCESS_NAME <<< "$entry"
    PID_PATH="$LOG_DIR/$PID_FILE"
    
    echo -n "停止 $NAME... "
    
    PID=""
    # 尝试从 PID 文件读取
    if [ -f "$PID_PATH" ]; then
        PID=$(cat "$PID_PATH")
    fi

    # 如果 PID 文件不存在或无效，尝试通过进程名查找
    if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
        # 注意：这里使用 pgrep -f 可能会误杀，需谨慎。
        # 对于开发环境，我们假设 workspace 下只有这一套服务。
        # 为了安全，这里仅作为 fallback，或者仅依赖 PID 文件。
        # 考虑到准确性，我们优先信任 PID 文件，清理时再用端口兜底。
        :
    fi

    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        # 等待进程退出
        TIMEOUT=5
        while kill -0 "$PID" 2>/dev/null && [ $TIMEOUT -gt 0 ]; do
            sleep 1
            ((TIMEOUT--))
        done
        
        if kill -0 "$PID" 2>/dev/null; then
            echo -n "${RED}超时，强制关闭... ${NC}"
            kill -9 "$PID" 2>/dev/null
        fi
        echo -e "${GREEN}完成${NC}"
    else
        echo -e "${YELLOW}未运行 (或 PID 失效)${NC}"
    fi

    # 清理 PID 文件
    rm -f "$PID_PATH"
done

# 2. 停止 Docker 容器 (Qdrant)
echo -n "停止 Qdrant 容器... "
if docker ps -q --filter "name=agentic-qdrant" | grep -q .; then
    docker stop agentic-qdrant > /dev/null 2>&1
    echo -e "${GREEN}完成${NC}"
else
    echo -e "${YELLOW}未运行${NC}"
fi

# 3. 端口强力清理 (兜底)
echo -n "检查端口残留... "
PORTS=(9090 9091 5173 8000)
for PORT in "${PORTS[@]}"; do
    # 使用 fuser 杀掉占用端口的进程
    if command -v fuser >/dev/null 2>&1; then
        fuser -k -s "${PORT}/tcp" >/dev/null 2>&1
    elif command -v lsof >/dev/null 2>&1; then
         lsof -ti "tcp:${PORT}" | xargs -r kill -9 >/dev/null 2>&1
    fi
done
echo -e "${GREEN}完成${NC}"

echo -e "${GREEN}✅ 所有服务已停止。${NC}"