# 实现细节：模型解耦与动态适配

## LLM Gateway 设计 (Python)

为了解决 Go 后端频繁修改适配器导致的重新编译问题，我们引入了 Python 驱动的 LLM Gateway。

### 1. 动态加载机制 (Dynamic Loading)
Gateway 存储适配器 Python 代码于 `data/scripts/`。使用 `importlib.util` 在运行时将代码片段转化为可执行模块：
*   适配器必须实现 `generate_stream(messages, config)`。
*   支持异步和同步生成器。

### 2. 路由与分发 (Dispatching)
Agent 不再直接调用 Provider，而是发送：
```json
{
  "model": "my-custom-model",
  "messages": [...],
  "stream": true
}
```
Gateway 根据 `model_id` 查找配置，决定是调用内置厂商逻辑（OpenAI 协议兼容）还是执行自定义脚本。

### 3. 全链路插桩 (Trace Injection)
在流式响应中，Gateway 会在 SSE 文本块之间穿插 JSON 格式的元数据：
```text
data: {"choices": [], "trace": {"source": "Adapter", "target": "Remote Provider", "action": "Call API"}}
```
Agent 负责解析并实时推送到前端。

## 上下文构建流程 (Core Engine)

Core 引擎在接收到请求时，会执行以下原子操作，每个操作均有对应的插桩记录：
1.  **Loading History**: 从持久化层加载最近会话。
2.  **Context Analysis**: 利用模型能力或启发式算法分析当前意图。
3.  **Token Calculation**: 使用 `tiktoken` 精准计算当前 Token 消耗。
4.  **Context Compression**: 执行滑动窗口裁剪，确保不超出模型限制。