# Agentic: 基于 Gemini 驱动的交互式微服务控制台

本项目是一个高度解耦的软件工程实验平台，旨在通过多服务协作，实现基于上下文感知的智能交互。

## 核心架构 (Service-Oriented Architecture)

系统由四个相互协作的服务组成：

*   **Core (Go)**: 存储引擎与上下文专家。负责会话持久化、Token 计算及上下文窗口的动态优化（滑动窗口/摘要）。(Port 9091)
*   **Agent (Go)**: 业务逻辑中控。作为前端、Core 与模型层之间的桥梁，负责请求编排与全链路插桩（Tracing）转发。(Port 9090)
*   **LLM Gateway (Python/FastAPI)**: 模型适配层。实现模型能力的彻底解耦，支持通过 Python 脚本动态定义模型行为，内置 OpenAI/Gemini/DeepSeek 等厂商适配。(Port 8000)
*   **Frontend (React/Vite)**: 现代化调试控制台。包含会话管理、模型适配器编辑器、以及**全链路交互时序观察器 (Sequence Observer)**。(Port 5173)

## 核心进展

*   **模型解耦**: 将 LLM 调用从 Go 后端完全剥离至 Python Gateway，支持运行时动态更新适配器脚本。
*   **全链路插桩**: 实现了跨语言、跨服务的实时追踪。从前端发起请求到模型商返回首个 Token，每一步均在时序图中可见。
*   **上下文工程**: 核心引擎支持细粒度的上下文裁剪策略，通过时序观察器可直观查看着上下文构建逻辑。

## 快速启动

确保您的系统已安装 Go 1.21+、Python 3.10+ 和 Node.js。

```bash
# 一键启动所有服务（包括 Python 环境初始化、Go 编译、前端启动）
./start.sh
```

访问地址: [http://localhost:5173](http://localhost:5173)

## 目录结构

*   `backend/core/`: 上下文引擎 Go 服务
*   `backend/agent/`: 业务代理 Go 服务
*   `llm-service/`: LLM Gateway Python 服务（含适配器逻辑）
*   `frontend/`: React 前端源码
*   `logs/`: 统一服务日志目录
*   `data/`: 会话与模型配置持久化目录