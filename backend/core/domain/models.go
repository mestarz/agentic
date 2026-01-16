package domain

import "time"

const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

type Message struct {
	Role      string                 `json:"role"`
	Content   string                 `json:"content"`
	Timestamp time.Time              `json:"timestamp"`
	Meta      map[string]interface{} `json:"meta"`
	Traces    []TraceEvent           `json:"traces,omitempty"`
}

type TraceEvent struct {
	Source    string      `json:"source"`
	Target    string      `json:"target"`
	Action    string      `json:"action"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

type Session struct {
	ID        string    `json:"id"`
	AppID     string    `json:"app_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Messages  []Message `json:"messages"`
}

type SessionSummary struct {
	ID        string    `json:"id"`
	AppID     string    `json:"app_id"`
	UpdatedAt time.Time `json:"updated_at"`
	MsgCount  int       `json:"msg_count"`
}

type LLMConfig struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
}
