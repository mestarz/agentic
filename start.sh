#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")"; pwd)
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

echo "正在启动 ContextFabric 服务 (分层架构)..."

# 1. 启动后端
echo "启动后端 Go 服务 (Port: 9090)..."
cd "$ROOT_DIR/backend"
go build -o ../context-fabric-server ./cmd/server/main.go
cd "$ROOT_DIR"
nohup ./context-fabric-server > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"

# 2. 启动前端
echo "启动前端 React 服务 (Port: 5173)..."
cd "$ROOT_DIR/frontend"
nohup npm run dev -- --host > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"

echo "---------------------------------------"
echo "服务启动成功！"
echo "前端地址: http://localhost:5173"
echo "日志目录: $LOG_DIR"
echo "停止服务: ./stop.sh"
echo "---------------------------------------"