#!/bin/bash

# =================================================================
# Agentic 全栈代码格式化脚本 (format.sh)
# 作用: 一键格式化 Go 后端, Python 网关及 React 前端代码。
# =================================================================

ROOT_DIR=$(
    cd "$(dirname "$0")/.."
    pwd
)

echo "-------------------------------------------------------"
echo "🎨 开始执行全栈代码格式化..."
echo "-------------------------------------------------------"

# 1. 格式化 Go 后端 (gofmt)
echo "🐹 [1/3] 正在格式化 Go 代码 (backend)..."
if command -v gofmt >/dev/null 2>&1; then
    find "$ROOT_DIR/backend" -name "*.go" -exec gofmt -w {} +
    echo "✅ Go 格式化完成。"
else
    echo "❌ 错误: 未找到 gofmt，请检查 Go 环境。"
fi

# 2. 格式化 Python 网关 (ruff)
echo "🐍 [2/3] 正在格式化 Python 代码 (llm-service)..."
if [ -f "$ROOT_DIR/llm-service/venv/bin/ruff" ]; then
    "$ROOT_DIR/llm-service/venv/bin/ruff" format "$ROOT_DIR/llm-service"
    "$ROOT_DIR/llm-service/venv/bin/ruff" check "$ROOT_DIR/llm-service" --fix
    echo "✅ Python 格式化与 Lint 修复完成。"
else
    echo "⚠️ 警告: 未在虚拟环境中找到 ruff，跳过 Python 格式化。"
fi

# 3. 格式化 React 前端 (prettier)
echo "⚛️ [3/3] 正在格式化前端代码 (frontend)..."
if [ -d "$ROOT_DIR/frontend/node_modules" ]; then
    cd "$ROOT_DIR/frontend" && npm run format -- --log-level silent
    echo "✅ 前端格式化与 Tailwind 类名排序完成。"
else
    echo "⚠️ 警告: 未找到前端 node_modules，跳过 Prettier 格式化。"
fi

echo "-------------------------------------------------------"
echo "✨ 所有模块已焕然一新！"
echo "-------------------------------------------------------"
