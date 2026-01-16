# ContextFabric 系统设计文档

**日期:** 2026-01-16
**状态:** 草案 / MVP 设计
**后端语言:** Go
**存储方案:** JSON 文件存储 (Repository 模式)

---

## 1. 系统概览 (System Overview)

**ContextFabric** 是一个上下文工程服务，旨在将“原始对话历史”与发送给大语言模型 (LLM) 的“优化上下文”解耦。它采用分层架构，支持复杂的上下文压缩、技能注入和历史记录管理，并通过 Web 管理界面进行控制。

### 核心设计理念
1.  **关注点分离:** 原始存储 (History) 与 逻辑处理 (Context Engine) 分离。
2.  **LLM 作为基础设施:** 调用 LLM 的能力不仅用于应用层（生成回复），也作为底层设施服务于逻辑层（用于总结/压缩历史）。
3.  **起步简单，预留扩展:** MVP 阶段使用 JSON 文件存储，但通过接口封装，未来可无缝迁移至 PostgreSQL/VectorDB。

---

## 2. 架构图 (Architecture Diagram)

系统遵循 **整洁架构 (Clean Architecture)** 分层原则。

```mermaid
graph TD
    User[用户 / Web 客户端] --> API[API 层 (HTTP/REST)]
    
    subgraph "应用核心层 (Application Core)"
        API --> ChatService[对话编排服务 (Chat Orchestrator)]
        ChatService --> HistoryService[历史记录服务]
        ChatService --> ContextEngine[上下文引擎服务]
    end
    
    subgraph "基础设施层 (Infrastructure Layer)"
        HistoryService -.-> FileRepo[文件存储仓储 (JSON)]
        ChatService -.-> LLMClient[LLM 提供方 (OpenAI/Mock)]
        ContextEngine -.-> LLMClient
    end
    
    FileRepo --> Disk[(文件系统)]
    LLMClient --> Cloud[(外部模型 API)]
```

---

## 3. 模块详细设计

### 3.1. 基础设施层 (Infrastructure Layer - 底层)

#### A. 存储模块 (Storage)
*   **策略:** 单会话单文件 (File-per-Session)。
*   **格式:** JSON 文件，存储路径 `/data/sessions/{uuid}.json`。
*   **并发控制:** 在 Repository 实现层通过 `sync.RWMutex` (或 `sync.Map` 锁池) 保证线程安全。
*   **扩展性:** 实现 `HistoryRepository` 接口，方便未来替换。

#### B. LLM 网关 (LLM Gateway)
*   **角色:** 统一的 AI 模型调用客户端。
*   **用途:**
    1.  被 **上下文引擎** 调用：用于压缩旧历史（例如：“把这20行对话总结为1段话”）。
    2.  被 **对话服务** 调用：用于生成最终回复。

### 3.2. 服务层 (Service Layer - 中层)

#### A. 历史核心 (History Core)
*   **角色:** “单一事实来源 (Single Source of Truth)”。
*   **职责:**
    *   创建会话 (Create Sessions)。
    *   追加原始消息 (User, Assistant, System)。
    *   读取完整、无修饰的历史记录。

#### B. 上下文引擎 (Context Engine - 大脑)
*   **角色:** 构造发给 LLM 的最佳 Payload。
*   **策略:**
    *   **滑动窗口 (Sliding Window):** 仅保留最近 N 条。
    *   **摘要压缩 (Summarization):** 如果 Token 数超标，调用 `LLMProvider` 对旧消息进行摘要。
    *   **技能注入 (Skill Injection):** 根据意图动态插入 System Prompt。
*   **输出:** 返回可直接用于 LLM API 的 `Message` 列表。

#### C. 对话编排器 (Chat Orchestrator)
*   **角色:** 协调员。
*   **工作流:**
    1.  接收用户输入。
    2.  保存用户输入到 History。
    3.  调用 Context Engine 获取优化后的上下文。
    4.  调用 LLM Provider 获取回复。
    5.  保存 AI 回复到 History。
    6.  返回回复给前端。

---

## 4. 数据结构设计 (JSON Schema)

**文件路径:** `data/sessions/<uuid>.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "app_id": "agent-001",
  "created_at": "2026-01-16T10:00:00Z",
  "updated_at": "2026-01-16T10:05:00Z",
  "messages": [
    {
      "role": "user",
      "content": "你好，你是谁？",
      "timestamp": "2026-01-16T10:00:01Z",
      "meta": {
        "tokens": 5
      }
    },
    {
      "role": "assistant",
      "content": "我是 ContextFabric AI 助手。",
      "timestamp": "2026-01-16T10:00:05Z",
      "meta": {
        "tokens": 8
      }
    }
  ]
}
```

---

## 5. 接口定义 (Go Interface)

这些接口定义了层级之间的契约。

### 5.1. 领域层接口 (Domain Interfaces)
`internal/domain/interfaces.go`

```go
package domain

import "context"

// 1. 存储契约
type HistoryRepository interface {
    CreateSession(ctx context.Context, session *Session) error
    GetSession(ctx context.Context, id string) (*Session, error)
    AppendMessage(ctx context.Context, sessionID string, msg Message) error
    ListSessions(ctx context.Context) ([]*Session, error)
}

// 2. LLM 基础设施契约
type LLMProvider interface {
    // 标准对话能力
    Chat(ctx context.Context, messages []Message) (string, error)
    // 专用总结能力 (简化 Context Engine 逻辑)
    Summarize(ctx context.Context, text string) (string, error)
}

// 3. 核心逻辑契约
type ContextEngine interface {
    // 输入原始请求，查询历史，压缩/优化，返回处理后的上下文
    BuildPayload(ctx context.Context, sessionID string, currentQuery string) ([]Message, error)
}
```

---

## 6. 项目目录结构

模块化单体应用的 Go 标准目录结构。

```text
/context-fabric
├── cmd
│   └── server
│       └── main.go              # 入口：依赖注入 & 服务启动
│
├── internal
│   ├── domain                   # [纯净] 实体 (Structs) & 接口
│   │   ├── models.go
│   │   └── interfaces.go
│   │
│   ├── infrastructure           # [非纯净] 外部适配器
│   │   ├── persistence
│   │   │   └── file_repo.go     # HistoryRepository 的 JSON 文件实现
│   │   │
│   │   └── llm
│   │       ├── openai.go        # LLMProvider 的 OpenAI 实现
│   │       └── mock.go          # 测试用的 Mock 实现
│   │
│   └── service                  # [业务逻辑]
│       ├── history
│       │   └── service.go       # CRUD 包装
│       │
│       ├── context
│       │   ├── engine.go        # 核心逻辑 (BuildPayload)
│       │   └── compressor.go    # Token 计数 & 摘要策略
│       │
│       └── chat
│           └── orchestrator.go  # 串联整个流程
│
├── api                          # [传输层] HTTP Handlers
│   ├── router.go
│   ├── chat_handler.go
│   └── admin_handler.go
│
└── data                         # [运行时] 存储位置
    └── sessions
```