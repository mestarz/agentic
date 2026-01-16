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

type FileHistoryRepository struct {
	basePath string
	mu       sync.RWMutex
}

func NewFileHistoryRepository(basePath string) (*FileHistoryRepository, error) {
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, err
	}
	return &FileHistoryRepository{basePath: basePath}, nil
}

func (r *FileHistoryRepository) SaveSession(ctx context.Context, session *domain.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	filePath := filepath.Join(r.basePath, fmt.Sprintf("%s.json", session.ID))
	data, _ := json.MarshalIndent(session, "", "  ")
	tmpPath := filePath + ".tmp"
	os.WriteFile(tmpPath, data, 0644)
	return os.Rename(tmpPath, filePath)
}

func (r *FileHistoryRepository) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	data, err := os.ReadFile(filepath.Join(r.basePath, fmt.Sprintf("%s.json", id)))
	if err != nil {
		return nil, err
	}
	var s domain.Session
	json.Unmarshal(data, &s)
	return &s, nil
}

func (r *FileHistoryRepository) ListSessions(ctx context.Context) ([]*domain.SessionSummary, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	files, _ := os.ReadDir(r.basePath)
	var list []*domain.SessionSummary
	for _, f := range files {
		if filepath.Ext(f.Name()) != ".json" {
			continue
		}
		data, _ := os.ReadFile(filepath.Join(r.basePath, f.Name()))
		var s domain.Session
		json.Unmarshal(data, &s)
		list = append(list, &domain.SessionSummary{ID: s.ID, AppID: s.AppID, UpdatedAt: s.UpdatedAt, MsgCount: len(s.Messages)})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].UpdatedAt.After(list[j].UpdatedAt) })
	return list, nil
}

func (r *FileHistoryRepository) DeleteSession(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return os.Remove(filepath.Join(r.basePath, fmt.Sprintf("%s.json", id)))
}

func (r *FileHistoryRepository) DeleteSessions(ctx context.Context, ids []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, id := range ids {
		os.Remove(filepath.Join(r.basePath, fmt.Sprintf("%s.json", id)))
	}
	return nil
}
