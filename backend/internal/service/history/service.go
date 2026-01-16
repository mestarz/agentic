package history

import (
	"context"
	"time"

	"context-fabric/backend/internal/domain"
)

type Service struct {
	repo domain.HistoryRepository
}

func NewService(repo domain.HistoryRepository) *Service {
	return &Service{repo: repo}
}

// GetOrCreateSession 获取或初始化一个会话
func (s *Service) GetOrCreateSession(ctx context.Context, sessionID, appID string) (*domain.Session, error) {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err == nil {
		return session, nil
	}

	// 如果不存在，创建新的
	newSession := &domain.Session{
		ID:        sessionID,
		AppID:     appID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Messages:  []domain.Message{},
	}
	if err := s.repo.SaveSession(ctx, newSession); err != nil {
		return nil, err
	}
	return newSession, nil
}

// Append 快速追加一条消息
func (s *Service) Append(ctx context.Context, sessionID string, msg domain.Message) error {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return err
	}

	session.Messages = append(session.Messages, msg)
	session.UpdatedAt = time.Now()
	return s.repo.SaveSession(ctx, session)
}

// List 导出所有会话列表
func (s *Service) List(ctx context.Context) ([]*domain.SessionSummary, error) {
	return s.repo.ListSessions(ctx)
}

// Get 获取指定会话内容
func (s *Service) Get(ctx context.Context, id string) (*domain.Session, error) {
	return s.repo.GetSession(ctx, id)
}
