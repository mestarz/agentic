# 实现细节 (Implementation Details)

## 1. 链路追踪与时序观测器 (Trace Observer)

### 1.1 事件捕获 (Event Capture)
系统通过在 `Agent` 和 `Core` 服务中植入 Trace 记录点来捕获全链路行为。每个 Trace 事件包含：
*   `Source` / `Target`: 起始与目标节点。
*   `Action`: 动作描述（支持自动汉化映射）。
*   `Timestamp`: 微秒级精度时间戳。
*   `Endpoint`: 实际调用的 API 路径或虚拟内部路径（如 `internal://payload-factory`）。

### 1.2 排序与纠偏逻辑
为了在前端准确还原时序，系统采用了多维排序策略：
1.  **后端顺序生成**：在同一执行块中生成的 Trace，通过 1 微秒的强制偏移确保 `Timestamp` 严格递增。
2.  **前端二次排序**：前端使用 ISO 时间字符串比较（处理毫秒以上精度）结合原始索引进行稳定排序。
3.  **时延校准**：对于流式合并步骤，引入 `endTimestamp` 记录块结束时间，确保后续步骤的增量耗时计算（`+Xms`）不再受长时流传输的影响。

### 1.3 流程可视化 (Visualization)
*   **激活条 (Activation Bars)**：模拟 UML 顺序图，展示节点在特定交互中的“忙碌”状态。
*   **流合并 (Stream Merging)**：自动将 `Streaming Content` 序列折叠为单一动作，并聚合显示总持续时间。
*   **交互式详情**：点击连线可实时查看包含 API Endpoint 和原始 JSON Payload 的元数据。

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
