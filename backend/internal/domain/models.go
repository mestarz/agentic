package domain

import (
	"time"
)

// Message 角色定义
const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleTool      = "tool"
)

// Message 代表对话中的单条消息
type Message struct {
	Role      string                 `json:"role"`      // system, user, assistant, tool
	Content   string                 `json:"content"`   // 消息内容
	Timestamp time.Time              `json:"timestamp"` // 发送时间
	Meta      map[string]interface{} `json:"meta"`      // 扩展元数据，如 token 消耗
}

// Session 代表一个完整的对话会话
type Session struct {
	ID        string    `json:"id"`
	AppID     string    `json:"app_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Messages  []Message `json:"messages"`
}

// SessionSummary 用于列表展示的简略信息
type SessionSummary struct {
	ID        string    `json:"id"`
	AppID     string    `json:"app_id"`
	UpdatedAt time.Time `json:"updated_at"`
	MsgCount  int       `json:"msg_count"`
}

// LLMConfig 定义了连接模型提供商所需的参数
type LLMConfig struct {
	Provider string `json:"provider"` // "gemini", "deepseek", "openai", "mock"
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
}
