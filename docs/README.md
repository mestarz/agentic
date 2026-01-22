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
*   **交互观测 (Sequence Observer)**: 引入专业级 UML 风格的时序观察仪，支持：
    *   **全链路追踪**：从前端 UI 到 Core 引擎再到远程 LLM 供应商。
    *   **Pipeline 可视化**：清晰展示 Core 内部的上下文处理管线（加载、压缩、截断）。
    *   **调试增强**：支持右键一键导出 Mermaid 时序图代码。
    *   **高精度校准**：修复高频交互下的时序错位与耗时累加逻辑。
    *   **数据深度感知**：支持点击查看纯净的 Prompt Payload 与 Endpoint 路由。
*   **模型管理增强**:
    *   **即时诊断**: 在配置模型时可一键测试连通性，并在前端终端查看流式响应。
*   **全链路插桩**: 实现了跨语言（Go/Python）、跨服务的实时事件同步。每一步动作及接口路径均在观测仪中以中文语义清晰呈现。
*   **上下文工程**: 核心引擎支持细粒度的上下文裁剪策略，通过时序观察器可直观查看上下文构建逻辑。

## 快速启动

确保您的系统已安装 Go 1.22+、Python 3.10+、Node.js 18+ 以及 Docker。

```bash
# 1. 初始化环境 (安装依赖、创建目录)
./scripts/init.sh

# 2. 一键启动所有服务
./scripts/start.sh
```

访问地址: [http://localhost:5173](http://localhost:5173)

## 开发工具

本项目集成了严谨的自动化工具链，建议在提交代码前运行以下指令：

*   **代码格式化**: 运行 `./scripts/format.sh` 一键统一 Go (`gofmt`), Python (`ruff`) 和 Web (`prettier`) 的代码风格。
*   **静态检查**: 运行 `./scripts/lint.sh` 一键扫描全栈代码中的潜在错误与类型问题。
*   **停止服务**: 运行 `./scripts/stop.sh` 安全关闭所有子服务及 Qdrant 容器。

## 目录结构

*   `backend/core/`: 上下文引擎 Go 服务
*   `backend/agent/`: 业务代理 Go 服务
*   `llm-service/`: LLM Gateway Python 服务（含适配器逻辑）
*   `frontend/`: React 前端源码
*   `logs/`: 统一服务日志目录
*   `data/`: 会话与模型配置持久化目录