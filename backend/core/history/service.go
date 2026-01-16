package history

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/persistence"
	"time"
)

type Service struct {
	repo *persistence.FileHistoryRepository
}

func NewService(repo *persistence.FileHistoryRepository) *Service { return &Service{repo: repo} }

func (s *Service) GetOrCreateSession(ctx context.Context, id, appID string) (*domain.Session, error) {
	session, err := s.repo.GetSession(ctx, id)
	if err == nil {
		return session, nil
	}
	newS := &domain.Session{ID: id, AppID: appID, CreatedAt: time.Now(), UpdatedAt: time.Now(), Messages: []domain.Message{}}
	s.repo.SaveSession(ctx, newS)
	return newS, nil
}

func (s *Service) Append(ctx context.Context, id string, msg domain.Message) error {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil {
		return err
	}
	session.Messages = append(session.Messages, msg)
	session.UpdatedAt = time.Now()
	return s.repo.SaveSession(ctx, session)
}

func (s *Service) UpdateLastMessageMeta(ctx context.Context, id string, meta map[string]interface{}) error {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil || len(session.Messages) == 0 {
		return err
	}
	session.Messages[len(session.Messages)-1].Meta = meta
	return s.repo.SaveSession(ctx, session)
}

func (s *Service) List(ctx context.Context) ([]*domain.SessionSummary, error) {
	return s.repo.ListSessions(ctx)
}
func (s *Service) Get(ctx context.Context, id string) (*domain.Session, error) {
	return s.repo.GetSession(ctx, id)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	return s.repo.DeleteSession(ctx, id)
}

func (s *Service) DeleteBatch(ctx context.Context, ids []string) error {
	return s.repo.DeleteSessions(ctx, ids)
}
