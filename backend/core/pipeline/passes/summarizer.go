package passes

import (
	"bytes"
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/pipeline"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// SummarizerPass 使用 LLM 对历史消息进行语义摘要，以压缩上下文并保留长期记忆。
type SummarizerPass struct {
	LLMServiceURL string // LLM 网关的基础地址
	ModelID       string // 用于执行摘要的模型 ID
	MaxHistory    int    // 触发摘要的消息数阈值
	KeepRecent    int    // 摘要后保留的最近消息数（不参与摘要）
}

// NewSummarizerPass 创建一个新的摘要处理器。
func NewSummarizerPass(url, model string, maxHistory, keepRecent int) *SummarizerPass {
	return &SummarizerPass{
		LLMServiceURL: url,
		ModelID:       model,
		MaxHistory:    maxHistory,
		KeepRecent:    keepRecent,
	}
}

func (p *SummarizerPass) Name() string {
	return "Summarizer"
}

func (p *SummarizerPass) Description() string {
	return "LLM 语义摘要压缩"
}

// Run 执行摘要逻辑：将较旧的消息打包发送给 LLM 进行总结，并替换为一条摘要消息。
func (p *SummarizerPass) Run(ctx context.Context, data *pipeline.ContextData) error {
	// 如果消息总数未达到触发阈值，直接跳过
	if len(data.Messages) <= p.MaxHistory {
		return nil
	}

	start := time.Now()
	// 划分消息：前部用于摘要，后部保留原始状态
	splitIdx := len(data.Messages) - p.KeepRecent
	if splitIdx <= 0 {
		return nil
	}

	toSummarize := data.Messages[:splitIdx]
	recentMessages := data.Messages[splitIdx:]

	// 序列化待摘要的内容
	historyText := ""
	for _, m := range toSummarize {
		historyText += fmt.Sprintf("%s: %s\n", m.Role, m.Content)
	}

	// 调用远程 LLM 服务生成摘要
	summary, err := p.requestSummary(ctx, historyText)
	if err != nil {
		// 容错处理：记录错误 Trace 但不中断管线执行
		data.Traces = append(data.Traces, map[string]interface{}{
			"source": "Summarizer",
			"target": "LLMService",
			"action": "SummarizeError",
			"data": map[string]interface{}{
				"error":     err.Error(),
				"model_id":  p.ModelID,
				"msg_count": len(toSummarize),
			},
		})
		return nil
	}

	// 构造摘要消息，作为历史背景注入
	summaryMsg := domain.Message{
		Role:      domain.RoleSystem,
		Content:   fmt.Sprintf("[历史会话摘要]:\n%s", summary),
		Timestamp: time.Now(),
		Meta:      map[string]interface{}{"is_summary": true},
	}

	// 重组消息列表：摘要消息 + 最近的原始消息
	data.Messages = append([]domain.Message{summaryMsg}, recentMessages...)

	duration := time.Since(start).Milliseconds()
	data.Traces = append(data.Traces, map[string]interface{}{
		"source": "Summarizer",
		"target": "LLMService",
		"action": "Summarized",
		"data": map[string]interface{}{
			"original_count": len(toSummarize),
			"duration_ms":    duration,
			"summary_length": len(summary),
		},
	})

	return nil
}

// requestSummary 向 LLM 网关发起同步的摘要请求
func (p *SummarizerPass) requestSummary(ctx context.Context, text string) (string, error) {
	prompt := fmt.Sprintf("请简要总结以下对话历史，提取核心事实、用户偏好和重要决策。要求：简洁、客观，不超过 200 字。\n\n对话历史：\n%s", text)

	payload := map[string]interface{}{
		"model": p.ModelID,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream": false,
	}

	body, _ := json.Marshal(payload)
	// 构建请求，指回 llm-service 的标准 completions 接口 (带 /v1 前缀)
	req, err := http.NewRequestWithContext(ctx, "POST", p.LLMServiceURL+"/v1/chat/completions", bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	// 设置较长的超时时间给摘要任务
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM 服务返回错误状态码: %d", resp.StatusCode)
	}

	var res struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}

	if len(res.Choices) > 0 {
		return res.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("LLM 未返回有效摘要内容")
}
