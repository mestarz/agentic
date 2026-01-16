# ContextFabric 核心实现细节

## 1. 彻底解耦设计
本项目在开发过程中经历从单体到分布式整合，最终演进为**完全自包含 (Self-contained)** 的双服务模式。
- **Core 与 Agent 零共享代码**：即使是相似的模型定义，也分别存在于各自的 `domain` 包下。这种“冗余”是为了换取生产环境下的独立部署与升级能力。
- **基于端口的内部通信**：Agent 通过标准 HTTP 协议与 Core 通信，模拟了真实微服务环境。

## 2. 上下文加工 Pipeline

当 Agent 调用 `/api/v1/context` 时，Core 执行以下 Pipeline：

1. **历史提取**：从 JSON 文件读取该 Session 的全量记录。

2. **系统注入**：自动头部注入带时间戳的 System Instruction。

3. **精准 Token 计算**：集成 `github.com/pkoukk/tiktoken-go` (cl100k_base)，确保在各种模型下的 Token 计数精准度，尤其在长文本和中英混合场景下。

4. **智能截断**：基于 tiktoken 结果，从后往前保留历史，确保不超出 4000 Tokens 的历史上限。



## 3. 流式架构与结构化传输

系统全程支持 **Server-Sent Events (SSE)**：

- **结构化 JSON 传输**：放弃了不稳定的文本前缀模式，采用统一的 `SSEResponse` 结构体，包含 `type` (chunk/meta/trace)、`content`、`meta` 等字段，解决了换行符丢失和解析不一致问题。

- **状态同步**：流式结束后，Agent 调用 Core 接口保存 AI 回复及完整的 Pipeline Traces。



## 4. 交互追踪 (Pipeline Observer)

- **实时监控**：Agent 在与前端、Core 及外部 LLM 交互的每个关键节点产生 `TraceEvent`。

- **持久化溯源**：Traces 被存储在 `Message` 模型的 `traces` 字段中，支持会话重启后的历史流程查看。

- **可视化**：前端提供可折叠/展开的“流程观察器”，通过高对比度 UI 展示 Pipeline 轨迹。



## 5. 安全性

- **API Key 无痕化**：Keys 仅存在于浏览器 LocalStorage (cf_app_configs) 和内存变量中。
