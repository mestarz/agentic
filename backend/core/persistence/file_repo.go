package persistence

import (
	"context"
	"context-fabric/backend/core/domain"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// FileHistoryRepository 基于文件系统的会话历史持久化实现
type FileHistoryRepository struct {
	basePath string
	mu       sync.RWMutex
}

// NewFileHistoryRepository 创建一个新的文件系统存储库
func NewFileHistoryRepository(basePath string) (*FileHistoryRepository, error) {
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, err
	}
	return &FileHistoryRepository{basePath: basePath}, nil
}

// SaveSession 将会话数据以 JSON 格式持久化到磁盘
func (r *FileHistoryRepository) SaveSession(ctx context.Context, session *domain.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	filePath := r.sessionPath(session.ID)
	data, _ := json.MarshalIndent(session, "", "  ")

	// 使用临时文件写入并重命名，确保原子性
	tmpPath := filePath + ".tmp"
	os.WriteFile(tmpPath, data, 0644)
	return os.Rename(tmpPath, filePath)
}

// GetSession 从磁盘读取指定 ID 的会话数据
func (r *FileHistoryRepository) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	data, err := os.ReadFile(r.sessionPath(id))
	if err != nil {
		return nil, err
	}
	var s domain.Session
	json.Unmarshal(data, &s)
	return &s, nil
}

// ListSessions 遍历存储目录并返回所有会话的摘要信息
func (r *FileHistoryRepository) ListSessions(ctx context.Context) ([]*domain.SessionSummary, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	files, _ := os.ReadDir(r.basePath)
	var list []*domain.SessionSummary
	for _, f := range files {
		if filepath.Ext(f.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(r.basePath, f.Name()))
		if err != nil {
			continue
		}

		var s domain.Session
		json.Unmarshal(data, &s)
		list = append(list, &domain.SessionSummary{
			ID:        s.ID,
			Name:      s.Name,
			AppID:     s.AppID,
			UpdatedAt: s.UpdatedAt,
			MsgCount:  len(s.Messages),
		})
	}

	// 按更新时间倒序排列
	sort.Slice(list, func(i, j int) bool { return list[i].UpdatedAt.After(list[j].UpdatedAt) })
	return list, nil
}

// DeleteSession 删除磁盘上的会话文件
func (r *FileHistoryRepository) DeleteSession(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return os.Remove(r.sessionPath(id))
}

// DeleteSessions 批量删除会话文件
func (r *FileHistoryRepository) DeleteSessions(ctx context.Context, ids []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, id := range ids {
		os.Remove(r.sessionPath(id))
	}
	return nil
}

// sessionPath 生成会话文件的绝对路径

func (r *FileHistoryRepository) sessionPath(id string) string {

	return filepath.Join(r.basePath, fmt.Sprintf("%s.json", id))

}

// FileTestCaseRepository 基于文件系统的测试用例持久化实现

type FileTestCaseRepository struct {
	basePath string

	mu sync.RWMutex
}

// NewFileTestCaseRepository 创建一个新的测试用例文件存储库

func NewFileTestCaseRepository(basePath string) (*FileTestCaseRepository, error) {

	if err := os.MkdirAll(basePath, 0755); err != nil {

		return nil, err

	}

	return &FileTestCaseRepository{basePath: basePath}, nil

}

// SaveTestCase 将测试用例持久化到磁盘

func (r *FileTestCaseRepository) SaveTestCase(ctx context.Context, tc *domain.TestCase) error {

	r.mu.Lock()

	defer r.mu.Unlock()

	filePath := filepath.Join(r.basePath, fmt.Sprintf("%s.json", tc.ID))

	data, _ := json.MarshalIndent(tc, "", "  ")

	return os.WriteFile(filePath, data, 0644)

}

// GetTestCase 从磁盘读取测试用例

func (r *FileTestCaseRepository) GetTestCase(ctx context.Context, id string) (*domain.TestCase, error) {

	r.mu.RLock()

	defer r.mu.RUnlock()

	data, err := os.ReadFile(filepath.Join(r.basePath, fmt.Sprintf("%s.json", id)))

	if err != nil {

		return nil, err

	}

	var tc domain.TestCase

	json.Unmarshal(data, &tc)

	return &tc, nil

}

// ListTestCases 列出所有测试用例摘要

func (r *FileTestCaseRepository) ListTestCases(ctx context.Context) ([]*domain.TestCaseSummary, error) {

	r.mu.RLock()

	defer r.mu.RUnlock()

	files, _ := os.ReadDir(r.basePath)

	var list []*domain.TestCaseSummary

	for _, f := range files {

		if filepath.Ext(f.Name()) != ".json" {

			continue

		}

		data, err := os.ReadFile(filepath.Join(r.basePath, f.Name()))

		if err != nil {

			continue

		}

		var tc domain.TestCase

		json.Unmarshal(data, &tc)

		list = append(list, &domain.TestCaseSummary{

			ID: tc.ID,

			Name: tc.Name,

			CreatedAt: tc.CreatedAt,

			StepCount: len(tc.Prompts),
		})

	}

	sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.After(list[j].CreatedAt) })

	return list, nil

}

// DeleteTestCase 删除测试用例

func (r *FileTestCaseRepository) DeleteTestCase(ctx context.Context, id string) error {

	r.mu.Lock()

	defer r.mu.Unlock()

	return os.Remove(filepath.Join(r.basePath, fmt.Sprintf("%s.json", id)))

}
