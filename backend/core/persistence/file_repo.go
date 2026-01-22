package persistence

import (
	"context"
	"context-fabric/backend/core/domain"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

type FileHistoryRepository struct {
	basePath  string
	diagCache map[string]*domain.Session // 诊断会话内存缓存
	mu        sync.RWMutex               // 保护 diagCache
}

func NewFileHistoryRepository(base string) (*FileHistoryRepository, error) {
	if err := os.MkdirAll(base, 0755); err != nil {
		return nil, err
	}
	return &FileHistoryRepository{
		basePath:  base,
		diagCache: make(map[string]*domain.Session),
	}, nil
}

func (r *FileHistoryRepository) sessionPath(id string) string {
	return filepath.Join(r.basePath, id+".json")
}

func (r *FileHistoryRepository) SaveSession(ctx context.Context, s *domain.Session) error {
	// 如果是诊断会话，仅存入内存缓存
	if strings.HasPrefix(s.ID, "diag-") {
		r.mu.Lock()
		r.diagCache[s.ID] = s
		r.mu.Unlock()
		return nil
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := r.sessionPath(s.ID) + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}
	return os.Rename(tmpPath, r.sessionPath(s.ID))
}

func (r *FileHistoryRepository) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	// 优先从内存缓存中获取诊断会话
	if strings.HasPrefix(id, "diag-") {
		r.mu.RLock()
		s, ok := r.diagCache[id]
		r.mu.RUnlock()
		if ok {
			return s, nil
		}
	}

	data, err := os.ReadFile(r.sessionPath(id))
	if err != nil {
		return nil, err
	}
	var s domain.Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("failed to parse session %s: %w", id, err)
	}
	return &s, nil
}

func (r *FileHistoryRepository) List(ctx context.Context) ([]domain.SessionSummary, error) {
	files, err := os.ReadDir(r.basePath)
	if err != nil {
		return nil, err
	}

	var list []domain.SessionSummary
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(f.Name(), ".json")

		// 过滤掉诊断会话（即使它们意外存在于磁盘上）
		if strings.HasPrefix(id, "diag-") {
			continue
		}

		data, err := os.ReadFile(r.sessionPath(id))
		if err != nil {
			continue
		}
		var s domain.Session
		if err := json.Unmarshal(data, &s); err == nil {
			list = append(list, domain.SessionSummary{
				ID:        s.ID,
				Name:      s.Name,
				AppID:     s.AppID,
				UpdatedAt: s.UpdatedAt,
				MsgCount:  len(s.Messages),
			})
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].UpdatedAt.After(list[j].UpdatedAt)
	})

	return list, nil
}

func (r *FileHistoryRepository) Delete(ctx context.Context, id string) error {
	if strings.HasPrefix(id, "diag-") {
		r.mu.Lock()
		delete(r.diagCache, id)
		r.mu.Unlock()
		return nil
	}
	return os.Remove(r.sessionPath(id))
}

func (r *FileHistoryRepository) DeleteBatch(ctx context.Context, ids []string) error {
	for _, id := range ids {
		if strings.HasPrefix(id, "diag-") {
			r.mu.Lock()
			delete(r.diagCache, id)
			r.mu.Unlock()
			continue
		}
		_ = os.Remove(r.sessionPath(id))
	}
	return nil
}

type FileTestCaseRepository struct {
	basePath string
}

func NewFileTestCaseRepository(base string) (*FileTestCaseRepository, error) {
	if err := os.MkdirAll(base, 0755); err != nil {
		return nil, err
	}
	return &FileTestCaseRepository{basePath: base}, nil
}

func (r *FileTestCaseRepository) tcPath(id string) string {
	return filepath.Join(r.basePath, id+".json")
}

func (r *FileTestCaseRepository) Save(ctx context.Context, tc *domain.TestCase) error {
	data, err := json.MarshalIndent(tc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.tcPath(tc.ID), data, 0644)
}

func (r *FileTestCaseRepository) Get(ctx context.Context, id string) (*domain.TestCase, error) {
	data, err := os.ReadFile(r.tcPath(id))
	if err != nil {
		return nil, err
	}
	var tc domain.TestCase
	if err := json.Unmarshal(data, &tc); err != nil {
		return nil, fmt.Errorf("failed to parse testcase %s: %w", id, err)
	}
	return &tc, nil
}

func (r *FileTestCaseRepository) List(ctx context.Context) ([]domain.TestCaseSummary, error) {
	files, err := os.ReadDir(r.basePath)
	if err != nil {
		return nil, err
	}

	var list []domain.TestCaseSummary
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(f.Name(), ".json")
		data, err := os.ReadFile(r.tcPath(id))
		if err != nil {
			continue
		}
		var tc domain.TestCase
		if err := json.Unmarshal(data, &tc); err == nil {
			list = append(list, domain.TestCaseSummary{
				ID:        tc.ID,
				Name:      tc.Name,
				CreatedAt: tc.CreatedAt,
				StepCount: len(tc.Prompts),
			})
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})

	return list, nil
}

func (r *FileTestCaseRepository) Delete(ctx context.Context, id string) error {
	return os.Remove(r.tcPath(id))
}
