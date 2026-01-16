# ContextFabric 核心设计与实现细节 (Current Progress)

## 1. 核心工程模式

当前代码实现严格遵循了**整洁架构 (Clean Architecture)** 和 **领域驱动设计 (DDD)** 的简化版，采用了以下核心模式：

### 1.1. 依赖注入 (Dependency Injection)
在 `cmd/server/main.go` 中，我们手动执行了依赖注入。
- **优点**: 各层之间完全解耦。例如，`ChatOrchestrator` 只依赖于 `domain.ContextEngine` 接口，而不关心它是如何压缩上下文的。这使得我们可以轻松地将 `MockLLM` 替换为 `OpenAILLM`。

### 1.2. 仓储模式 (Repository Pattern)
`FileHistoryRepository` 封装了所有底层文件 IO。
- **线程安全**: 使用 `sync.RWMutex` 保护文件读写，防止在高并发对话时出现文件损坏。
- **原子性写入**: 采用“写临时文件 + Rename”策略，确保在程序意外崩溃时，原始 JSON 数据不会被截断或损坏。

### 1.3. 编排器模式 (Orchestrator Pattern)
`ChatOrchestrator` 充当了“导演”角色，它不包含具体的算法逻辑，只负责协调：
1. **状态持久化**: 调用 HistoryService。
2. **上下文加工**: 调用 ContextEngine。
3. **模型执行**: 调用 LLMProvider。

---

## 2. 关键代码检视

### 2.1. 领域模型 (internal/domain/models.go)
- **Message 结构**: 包含了 `Meta` 字段（`map[string]interface{}`），为后续存储 Token 消耗、模型参数、甚至是多模态数据预留了空间。
- **Role 常量**: 使用 `RoleUser`, `RoleAssistant` 等常量，避免了代码中硬编码字符串带来的风险。

### 2.2. 存储层实现 (internal/infrastructure/persistence/file_repo.go)
- **单会话单文件**: 保证了扩展性。读取单个 Session 不需要加载整个数据库。
- **ListSessions**: 目前通过遍历目录实现。在 MVP 阶段性能足够，但在海量数据下需要建立索引文件（这也是未来的优化点）。

### 2.3. 上下文引擎 (internal/service/context/engine.go)
- **当前状态**: 处于 "Pass-through"（透传）阶段。
- **扩展性**: 它已经注入了 `LLMProvider`。这意味着它随时可以发起一次内部 LLM 调用来生成历史摘要（Summarization）。

---

## 3. 实现状态概览 (Progress Map)

| 模块 | 功能点 | 状态 | 备注 |
| :--- | :--- | :--- | :--- |
| **Storage** | 会话持久化 (JSON) | ✅ 完成 | 支持并发安全和原子写 |
| **History** | 消息追加与获取 | ✅ 完成 | 封装了基础 CRUD |
| **Orchestrator** | 对话全流程串联 | ✅ 完成 | 支持端到端对话测试 |
| **Infrastructure** | Mock LLM | ✅ 完成 | 用于离线测试 |
| **Infrastructure** | OpenAI LLM | ⏳ 待办 | 需要集成 SDK 或 HTTP 调用 |
| **Context Engine** | 滑动窗口压缩 | ⏳ 待办 | 核心算法点 |
| **Context Engine** | 自动摘要压缩 | ⏳ 待办 | 需要调用内部 LLM |
| **Web Admin** | 界面管理 | ⏳ 待办 | 后续开发 |

---

## 4. 下一步演进建议

1. **增强 Context Engine**: 引入 `tiktoken-go` 或类似库进行准确的 Token 计数，并实现“超过阈值自动截断”的逻辑。
2. **LLM 适配器**: 实现真实的 `OpenAILLM` 客户端，支持环境变量配置 API Key。
3. **管理端 API**: 在 `api/admin_handler.go` 中实现 `ListSessions` 和 `GetSessionDetail` 接口，为前端界面提供数据支撑。
