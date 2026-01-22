# 实现细节 (Implementation Details)

## 1. 链路追踪与时序观测器 (Trace Observer)

### 1.1 事件捕获 (Event Capture)
系统通过在 `Agent` 和 `Core` 服务中植入 Trace 记录点来捕获全链路行为。每个 Trace 事件包含：
*   `Source` / `Target`: 起始与目标节点。
*   `Action`: 动作描述（支持自动汉化映射）。
*   `Timestamp`: 微秒级精度时间戳。
*   `Endpoint`: 实际调用的 API 路径或虚拟内部路径（如 `internal://payload-factory`）。

#### 1.1.1 轨迹归一化 (Trace Normalization)
为解决微服务内部复杂组件暴露导致的视图混乱，系统引入了 Trace 归一化策略：
*   **Pipeline 归一**: `HistoryLoader`, `TokenLimitPass` 等内部组件产生的 Trace，其 `Source` 和 `Target` 被强制重写为 `Core`，形成 Core 内部自环。原始组件名保存在 `Data.internal_component` 中供详情页展示。
*   **LLM 三段式**: LLM 交互被精简为标准的“发送 -> 处理 -> 返回”三段式。中间的复杂流式传输过程被隐藏，仅保留总耗时。

### 1.2 排序与纠偏逻辑
为了在前端准确还原时序，系统采用了多维排序策略：
1.  **后端顺序生成**：在同一执行块中生成的 Trace，通过 1 微秒的强制偏移确保 `Timestamp` 严格递增。
2.  **前端二次排序**：前端使用 ISO 时间字符串比较（处理毫秒以上精度）结合原始索引进行稳定排序。
3.  **时延校准**：对于流式合并步骤，引入 `endTimestamp` 记录块结束时间，确保后续步骤的增量耗时计算（`+Xms`）不再受长时流传输的影响。

### 1.3 流程可视化 (Visualization)
*   **激活条 (Activation Bars)**：模拟 UML 顺序图，展示节点在特定交互中的“忙碌”状态。
*   **流合并 (Stream Merging)**：自动将 `Streaming Content` 序列折叠为单一动作，并聚合显示总持续时间。
*   **交互式详情**：点击连线可实时查看包含 API Endpoint 和原始 JSON Payload 的元数据。
*   **Mermaid 导出**: 支持右键将 Trace 数据转换为标准 Mermaid `sequenceDiagram` 语法，方便复制到文档或调试。

### 1.4 数据脱敏与格式化 (Data Sanitization)
为了保证观测器展示的专业性与安全性，系统在记录 Trace 前会执行数据脱敏：
*   **协议提取**：使用 `cleanMessages` 辅助函数从复杂的内部 `domain.Message` 对象中提取纯净的 `role` 和 `content` 字段。
*   **冗余剥离**：移除消息中携带的 Trace 递归引用、元数据（Meta）及时间戳副本，确保发送给 LLM 的 Payload 在界面上以最纯粹的对话格式呈现。
*   **字段语义化**：将原始 JSON 键名映射为 `context` (上下文) 或 `prompt` (提示词)，提升非技术背景人员的可读性。

## 2. 布局设计 (Layout Architecture)

### 2.1 响应式侧边栏
采用 `isObserverExpanded` 状态控制。展开时，聊天窗口缩窄为 `48px` 的功能条，利用 `writing-mode: vertical-lr` 展示“返回对话”指引，确保核心视口专注于链路分析。

### 2.2 性能优化
*   使用 React `useMemo` 缓存 Trace 处理结果，避免大并发下的渲染抖动。
*   Tailwind `will-change` 属性优化 GPU 动画加速。

## 3. 多语言模型网关 (Python LLM Gateway)
*   **动态适配**：支持在线注入 Python 脚本，通过 `importlib` 动态加载模型适配器。
*   **协议转换**：将各家厂商非标的 SSE 格式统一转换为标准 JSON 流，并注入 Tracing 信息。
*   **适配器诊断**: 内置诊断工具，通过模拟请求测试模型配置的连通性和流式响应能力。

## 4. Core 上下文引擎 (Context Engine)
Core 服务采用 Pipeline + Pass 架构：
*   **Pipeline**: 管理一组有序执行的 Pass，并负责 Trace 的自动收集与上下文对象的生命周期管理。
*   **ContextData**: 类似于“黑板模式”的共享数据结构，包含 SessionID、Messages、Meta 和 Traces。
*   **Pass**: 原子化的处理单元。
        *   `HistoryLoader`: 从持久化库加载历史。
        *   `SummarizerPass`: [NEW] 使用 LLM 对历史进行语义摘要，实现无限长对话感知。
        *   `SystemPromptPass`: 注入系统提示词。
        *   `TokenLimitPass`: 基于 Tiktoken 进行物理截断。
    
    ## 5. 自动化测试与重放 (Test & Replay)
    
    ### 5.1 测试用例持久化 (Git-Tracked Persistence)
    *   **物理存储**：测试用例以 JSON 格式存储在 `data/testcases/` 目录下。
    *   **Git 集成**：与普通的 `data/sessions/` (Ignored) 不同，测试用例目录配置为 Git 跟踪，确保评估集可随代码版本同步演进。
    *   **提取算法**：后台服务仅提取 `role: user` 的文本序列，确保重放时能触发模型针对相同指令的不同响应。
    
    ### 5.2 自动重放状态机 (Async Replay State Machine)
    重放逻辑实现在前端 `useChat` 钩子中，采用 Promise 驱动的循环：
    1.  **环境隔离**：重放启动时会自动创建 `test-XXXX` 前缀的临时 Session。
    2.  **流式同步**：利用 SSE 的 `[DONE]` 标记作为当前回合结束的信号。通过 `await` handleSend 异步等待模型回复完全吐出。
    3.  **进度反馈**：实时更新 `replayProgress` 状态，驱动 UI 进度条展示。
    4.  **容错机制**：捕获单轮交互异常（如 HTTP 500 或网关超时），自动终止重放并记录错误日志。
    