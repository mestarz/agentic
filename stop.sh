#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")"; pwd)
LOG_DIR="$ROOT_DIR/logs"

echo "---------------------------------------"
echo "正在停止 ContextFabric 所有服务..."

# 1. 尝试通过记录的 PID 停止
if [ -f "$LOG_DIR/backend.pid" ]; then
    PID=$(cat "$LOG_DIR/backend.pid")
    if ps -p $PID > /dev/null; then
        echo "[后端] 停止进程 $PID..."
        kill $PID
    fi
    rm "$LOG_DIR/backend.pid"
fi

if [ -f "$LOG_DIR/frontend.pid" ]; then
    PID=$(cat "$LOG_DIR/frontend.pid")
    if ps -p $PID > /dev/null; then
        echo "[前端] 停止进程 $PID 及其子进程..."
        # Vite 往往会产生子进程，杀死整个进程组或使用 pkill
        pkill -P $PID
        kill $PID
    fi
    rm "$LOG_DIR/frontend.pid"
fi

# 2. 强制清理残留端口 (关键：防止端口冲突导致的 404 或随机切换)
echo "清理端口占用 (9090, 5173)..."
fuser -k 9090/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null

# 3. 兜底清理二进制文件
pkill context-fabric-server 2>/dev/null

echo "所有服务已彻底停止，端口已释放。"
echo "---------------------------------------"
