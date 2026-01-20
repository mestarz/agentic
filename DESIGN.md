# ContextFabric 系统设计文档 (彻底解耦版)

**日期:** 2026-01-16
**架构模式:** 分布式双服务 (Core + Agent)
**通信协议:** HTTP / SSE (结构化 JSON 流)
**语言支持:** Web 界面全中文

---

## 1. 系统定位
ContextFabric 是一个专业的上下文治理中间件。它通过将“应用对话逻辑”与“上下文治理逻辑”在物理上彻底隔离，实现了高性能、高可扩展的 Agent 基础设施。

---

## 2. 核心架构

### 2.1. Core Service (核心引擎)
*   **监听端口**: 9091
*   **职责**:
    *   **Pipeline 引擎**: 采用 `Pass` 插件化架构处理上下文。每个请求依次经过：
    1.  `HistoryLoader`: 加载历史会话。
    2.  `SummarizerPass`: LLM 语义摘要压缩（长会话自动触发）。
    3.  `SystemPromptPass`: 注入系统提示词。
    4.  `TokenLimitPass`: 物理 Token 截断兜底。
    *   **持久化**: 负责原始对话历史的读写，并存储 Pipeline Trace 轨迹。
    *   **上下文加工**: 使用专业 `tiktoken-go` 库执行精准 Token 计算与截断。
    *   **会话管理**: 提供单条及批量会话删除功能。

### 2.2. Agent Service (应用网关)
*   **监听端口**: 9090
*   **职责**:
    *   **协议转换**: 提供基于结构化 JSON 的 SSE 流。
    *   **Pipeline 追踪**: 实时生成并下发前端、Agent 与 Core 之间的交互轨迹。
    *   **模型编排**: 负责调用外部 LLM 提供商。

---

## 3. 接口契约 (V1)

| 路径 (Core) | 方法 | 描述 |
| :--- | :--- | :--- |
| `/api/v1/sessions` | `POST` | 初始化会话空间。 |
| `/api/v1/context` | `POST` | **核心**: 输入 Query，返回优化后的 Prompt。 |
| `/api/v1/messages` | `POST` | 将回复记入历史，同时支持持久化 Traces 记录。 |
| `/api/admin/sessions/:id` | `DELETE` | 删除指定会话文件。 |
| `/api/admin/sessions` | `DELETE` | 批量删除会话（Body 为 ID 数组）。 |

---

## 4. 目录结构
```text
backend/
├── core/               # 核心服务：上下文工程大脑
│   ├── api/            # REST API 实现
│   ├── context/        # 上下文服务编排
│   ├── pipeline/       # [NEW] Pipeline 引擎与 Pass 实现
│   ├── history/        # 历史记录服务
│   ├── persistence/    # JSON 文件仓储
│   └── domain/         # Core 内部模型
└── agent/              # 应用服务：Agent 交互入口
    ├── logic/          # Agent 交互流控
    ├── llm/            # 模型调用适配器
    └── domain/         # Agent 内部模型
```
