#!/bin/bash

ROOT_DIR=$(cd "$(dirname "$0")"; pwd)
LOG_DIR="$ROOT_DIR/logs"
BIN_DIR="$ROOT_DIR/bin"
mkdir -p "$LOG_DIR" "$BIN_DIR"

# 清理代理
unset http_proxy https_proxy all_proxy
export NO_PROXY="localhost,127.0.0.1,0.0.0.0"

echo "正在启动 ContextFabric 完全隔离版 (Core + Agent)..."

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
ss -tulpn | grep -E '9090|9091|5173'
echo "---------------------------------------"
echo "Web 控制台访问地址: http://localhost:5173"
echo "---------------------------------------"
