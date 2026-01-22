package domain

import (
	"context"
	"time"
)

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

// TestCase 代表一个可重现的测试用例
type TestCase struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	AppID     string    `json:"app_id"`
	Prompts   []string  `json:"prompts"` // 提取自 User 消息的内容列表
	CreatedAt time.Time `json:"created_at"`
}

// TestCaseSummary 测试用例摘要
type TestCaseSummary struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	StepCount int       `json:"step_count"`
}

// StagingFact 代表暂存区中的原始事实碎片
type StagingFact struct {
	ID            string    `json:"id"`
	Vector        []float32 `json:"vector,omitempty"`
	Content       string    `json:"content"`
	SourceSession string    `json:"source_session"`
	CreatedAt     time.Time `json:"created_at"`
	Status        string    `json:"status"` // pending, processing, completed
}

// SharedMemory 代表共享区中的可演进知识单元
type SharedMemory struct {
	ID           string    `json:"id"`
	Vector       []float32 `json:"vector,omitempty"`
	Content      string    `json:"content"`
	Topic        string    `json:"topic"`
	Confidence   float32   `json:"confidence"`
	Version      int       `json:"version"`
	Status       string    `json:"status"` // active, deprecated, disputed
	LastVerified time.Time `json:"last_verified"`
	EvidenceRefs []string  `json:"evidence_refs"` // 来源 StagingFact ID 列表
}

// VectorRepository 定义向量存储层的抽象接口
type VectorRepository interface {
	// StagingFact 操作
	SaveStagingFact(ctx context.Context, fact *StagingFact) error
	SearchStagingFacts(ctx context.Context, vector []float32, limit int) ([]StagingFact, error)
	ListPendingFacts(ctx context.Context, limit int) ([]StagingFact, error)
	DeleteStagingFact(ctx context.Context, id string) error

	// SharedMemory 操作
	SaveSharedMemory(ctx context.Context, mem *SharedMemory) error
	SearchSharedMemories(ctx context.Context, vector []float32, limit int) ([]SharedMemory, error)
	UpdateSharedMemory(ctx context.Context, mem *SharedMemory) error
}
