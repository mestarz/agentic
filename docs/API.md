# API 接口文档

**ContextFabric Core v1.0.0**

ContextFabric Core 提供无状态的上下文工程能力，负责会话管理、历史持久化以及 Token 优化裁剪。

## 上下文构建 (Build Context)

获取经过 Token 优化和系统指令注入后的完整对话 Payload。

```http
POST /api/v1/context

请求体:
{
  "session_id": "string",
  "query": "用户输入",
  "config": { "model": "..." }
}

响应:
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "...", "meta": { "tokens_total": 120 } }
  ]
}
```

## 消息追加 (Append Message)

将模型生成的回复或用户消息手动存入持久化层。

```http
POST /api/v1/messages

请求体:
{
  "session_id": "string",
  "message": {
    "role": "assistant",
    "content": "内容",
    "timestamp": "2026-01-16T..."
  }
}
```

## 会话管理 (Admin APIs)

### 获取会话列表

获取所有活跃会话的摘要列表。

```http
GET /api/admin/sessions
```

### 获取会话详情

获取指定会话的完整历史记录。

```http
GET /api/admin/sessions/:id
```

### 删除会话

永久删除指定会话的文件。

```http
DELETE /api/admin/sessions/:id
```

### 批量删除会话

批量删除会话。

```http
DELETE /api/admin/sessions

请求体:
["id1", "id2"]
```
