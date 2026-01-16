#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")"; pwd)
LOG_DIR="$ROOT_DIR/logs"

echo "正在停止所有 ContextFabric 服务..."

for service in core agent frontend; do
    if [ -f "$LOG_DIR/$service.pid" ]; then
        PID=$(cat "$LOG_DIR/$service.pid")
        echo "停止 $service (PID: $PID)..."
        pkill -P $PID 2>/dev/null
        kill $PID 2>/dev/null
        rm "$LOG_DIR/$service.pid"
    fi
done

# 强制清理端口
fuser -k 9091/tcp 9090/tcp 5173/tcp 2>/dev/null

echo "清理完成。"