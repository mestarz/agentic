#!/bin/bash

# =================================================================
# Agentic 项目环境初始化脚本 (init.sh)
# 作用: 自动化检查系统依赖, 创建目录, 安装后端/前端/网关的所有依赖。
# =================================================================

set -e # 遇到错误立即停止执行

ROOT_DIR=$(cd "$(dirname "$0")"; pwd)
LOG_DIR="$ROOT_DIR/logs"
BIN_DIR="$ROOT_DIR/bin"
DATA_DIR="$ROOT_DIR/data"

echo "-------------------------------------------------------"
echo "🚀 开始初始化 Agentic 开发环境..."
echo "-------------------------------------------------------"

# 1. 创建必要的目录结构
echo "📁 [1/5] 创建项目目录结构..."
mkdir -p "$LOG_DIR"
mkdir -p "$BIN_DIR"
mkdir -p "$DATA_DIR/sessions"
mkdir -p "$DATA_DIR/testcases"
mkdir -p "$DATA_DIR/qdrant"
echo "✅ 目录创建完成。"

# 2. 系统环境检查
echo "🔍 [2/5] 检查系统依赖环境..."

check_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "❌ 错误: 未找到 $1, 请先安装它。"
        exit 1
    fi
}

check_cmd "go"
check_cmd "python3"
check_cmd "node"
check_cmd "npm"
check_cmd "docker"

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo "✅ 依赖检查通过 (Go: $GO_VERSION, Python: $(python3 --version), Node: $(node --version))"

# 3. 初始化后端依赖 (Go)
echo "📦 [3/5] 正在安装后端 Go 模块依赖..."
cd "$ROOT_DIR/backend"
go mod tidy
echo "✅ 后端依赖处理完成。"

# 4. 初始化 LLM Gateway 依赖 (Python)
echo "🐍 [4/5] 正在创建 Python 虚拟环境并安装依赖..."
cd "$ROOT_DIR/llm-service"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ 虚拟环境 venv 已创建。"
fi
# 升级 pip 并安装依赖
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -r requirements.txt -q
echo "✅ Python 依赖安装完成。"

# 5. 初始化前端依赖 (Node.js)
echo "⚛️ [5/5] 正在安装前端 npm 依赖 (可能需要一些时间)..."
cd "$ROOT_DIR/frontend"
# 检查是否已安装依赖，避免重复耗时
if [ ! -d "node_modules" ]; then
    npm install --silent
    echo "✅ 前端依赖安装完成。"
else
    echo "ℹ️ 前端 node_modules 已存在，跳过安装。"
fi

# 6. 预拉取 Docker 镜像
echo "🐳 [可选] 正在预拉取 Qdrant 镜像..."
docker pull qdrant/qdrant:latest > /dev/null 2>&1 || echo "⚠️ Docker 镜像拉取失败, 请检查网络或 Docker 服务状态。"

echo "-------------------------------------------------------"
echo "🎉 初始化成功！"
echo "-------------------------------------------------------"
echo "提示: "
echo "1. 使用 ./start.sh 启动所有服务。"
echo "2. 访问 http://localhost:5173 进入 Web 控制台。"
echo "3. 如果需要使用 RAG, 请确保 Docker 已启动。"
echo "-------------------------------------------------------"
