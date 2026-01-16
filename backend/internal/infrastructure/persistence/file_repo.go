package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"context-fabric/backend/internal/domain"
)

type FileHistoryRepository struct {
	basePath string
	mu       sync.RWMutex // 全局简单锁，后续可优化为分段锁
}

func NewFileHistoryRepository(basePath string) (*FileHistoryRepository, error) {
	// 确保目录存在
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, err
	}
	return &FileHistoryRepository{
		basePath: basePath,
	}, nil
}

func (r *FileHistoryRepository) SaveSession(ctx context.Context, session *domain.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	filePath := filepath.Join(r.basePath, fmt.Sprintf("%s.json", session.ID))
	
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	// 写入临时文件再重命名，确保原子性
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write tmp file: %w", err)
	}

	return os.Rename(tmpPath, filePath)
}

func (r *FileHistoryRepository) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	filePath := filepath.Join(r.basePath, fmt.Sprintf("%s.json", id))
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("session not found: %s", id)
		}
		return nil, err
	}

	var session domain.Session
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session: %w", err)
	}

	return &session, nil
}

func (r *FileHistoryRepository) ListSessions(ctx context.Context) ([]*domain.SessionSummary, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	files, err := os.ReadDir(r.basePath)
	if err != nil {
		return nil, err
	}

	var summaries []*domain.SessionSummary
	for _, f := range files {
		if filepath.Ext(f.Name()) != ".json" {
			continue
		}

		// 为了列表性能，这里可以只读取部分元数据，但目前先读取整个文件
		data, err := os.ReadFile(filepath.Join(r.basePath, f.Name()))
		if err != nil {
			continue
		}

		var s domain.Session
		if err := json.Unmarshal(data, &s); err != nil {
			continue
		}

		summaries = append(summaries, &domain.SessionSummary{
			ID:        s.ID,
			AppID:     s.AppID,
			UpdatedAt: s.UpdatedAt,
			MsgCount:  len(s.Messages),
		})
	}

	// 按更新时间倒序排列
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].UpdatedAt.After(summaries[j].UpdatedAt)
	})

	return summaries, nil
}
