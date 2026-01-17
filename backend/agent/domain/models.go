package domain

import (
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
