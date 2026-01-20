package domain

import "time"

// 定义消息的角色类型
const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// Message 代表会话中的单条消息
type Message struct {
	Role      string                 `json:"role"`
	Content   string                 `json:"content"`
	Timestamp time.Time              `json:"timestamp"`
	Meta      map[string]interface{} `json:"meta"`             // 存储 Token 统计等元数据
	Traces    []TraceEvent           `json:"traces,omitempty"` // 存储上下文处理的执行踪迹
}

// TraceEvent 代表上下文处理过程中的一个原子步骤
type TraceEvent struct {
	Source    string      `json:"source"`
	Target    string      `json:"target"`
	Action    string      `json:"action"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// Session 代表一个完整的会话记录
type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"` // 会话名称
	AppID     string    `json:"app_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Messages  []Message `json:"messages"`
}

// SessionSummary 会话的摘要信息，用于列表展示
type SessionSummary struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"` // 会话名称
	AppID     string    `json:"app_id"`
	UpdatedAt time.Time `json:"updated_at"`
	MsgCount  int       `json:"msg_count"`
}
