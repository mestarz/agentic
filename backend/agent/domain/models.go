package domain

import (
	"context"
	"time"
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



type LLMConfig struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
}

// 补全接口定义
type LLMProvider interface {
	ChatStream(ctx context.Context, msgs []Message, out chan<- string) error
}
