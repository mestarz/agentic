#!/bin/bash

# =================================================================
# Agentic 全栈静态检查脚本 (lint.sh)
# 作用: 发现代码中的潜在 Bug、未处理错误及类型不匹配。
# =================================================================

ROOT_DIR=$(cd "$(dirname "$0")/.."; pwd)

echo "-------------------------------------------------------"
echo "🔍 开始执行全栈静态检查..."
echo "-------------------------------------------------------"

# 1. 检查 Go 后端
echo "🐹 [1/3] 正在检查 Go 代码 (golangci-lint)..."
if command -v golangci-lint >/dev/null 2>&1; then
    cd "$ROOT_DIR/backend"
    golangci-lint run ./... --config "$ROOT_DIR/.golangci.yml"
    if [ $? -eq 0 ]; then
        echo "✅ Go 静态检查通过。"
    else
        echo "❌ Go 静态检查发现问题。"
    fi
else
    echo "⚠️ 警告: 未找到 golangci-lint，请先通过 scripts/init.sh 安装。"
fi

# 2. 检查 Python 网关
echo "🐍 [2/3] 正在检查 Python 代码 (ruff)..."
if [ -f "$ROOT_DIR/llm-service/venv/bin/ruff" ]; then
    "$ROOT_DIR/llm-service/venv/bin/ruff" check "$ROOT_DIR/llm-service"
    if [ $? -eq 0 ]; then
        echo "✅ Python 静态检查通过。"
    else
        echo "❌ Python 静态检查发现问题。"
    fi
else
    echo "⚠️ 警告: 未在虚拟环境中找到 ruff。"
fi

# 3. 检查 Web 前端 (ESLint + Type Check)
echo "⚛️ [3/3] 正在检查前端代码 (eslint + tsc)..."
if [ -d "$ROOT_DIR/frontend/node_modules" ]; then
    cd "$ROOT_DIR/frontend"
    echo "--- 正在运行 ESLint ---"
    npm run lint
    ESLINT_RES=$?
    
    echo "--- 正在运行 TypeScript 类型检查 ---"
    # 仅执行类型检查，不生成文件
    ./node_modules/.bin/tsc --noEmit
    TSC_RES=$?

    if [ $ESLINT_RES -eq 0 ] && [ $TSC_RES -eq 0 ]; then
        echo "✅ 前端静态检查通过。"
    else
        echo "❌ 前端静态检查发现问题。"
    fi
else
    echo "⚠️ 警告: 未找到前端 node_modules。"
fi

echo "-------------------------------------------------------"
echo "🏁 检查任务执行完毕。"
echo "-------------------------------------------------------"
