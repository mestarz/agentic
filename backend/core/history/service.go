package history

import (
	"context"
	"context-fabric/backend/core/domain"
	"fmt"
	"time"
)

// Repository 定义了会话和测试用例的持久化接口
type Repository interface {
	SaveSession(ctx context.Context, s *domain.Session) error
	GetSession(ctx context.Context, id string) (*domain.Session, error)
	List(ctx context.Context) ([]domain.SessionSummary, error)
	Delete(ctx context.Context, id string) error
	DeleteBatch(ctx context.Context, ids []string) error
}

type TestCaseRepository interface {
	Save(ctx context.Context, tc *domain.TestCase) error
	Get(ctx context.Context, id string) (*domain.TestCase, error)
	List(ctx context.Context) ([]domain.TestCaseSummary, error)
	Delete(ctx context.Context, id string) error
}

type Service struct {
	repo   Repository
	tcRepo TestCaseRepository
}

func NewService(r Repository, tr TestCaseRepository) *Service {
	return &Service{repo: r, tcRepo: tr}
}

// TestCase 相关操作

func (s *Service) SaveTestCase(ctx context.Context, tc *domain.TestCase) error {
	return s.tcRepo.Save(ctx, tc)
}

func (s *Service) ListTestCases(ctx context.Context) ([]domain.TestCaseSummary, error) {
	return s.tcRepo.List(ctx)
}

func (s *Service) GetTestCase(ctx context.Context, id string) (*domain.TestCase, error) {
	return s.tcRepo.Get(ctx, id)
}

func (s *Service) DeleteTestCase(ctx context.Context, id string) error {
	return s.tcRepo.Delete(ctx, id)
}

func (s *Service) CreateTestCaseFromSession(ctx context.Context, sessionID, name string) (*domain.TestCase, error) {
	sess, err := s.Get(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	tc := &domain.TestCase{
		ID:        fmt.Sprintf("tc-%s", time.Now().Format("20060102150405")),
		Name:      name,
		AppID:     sess.AppID,
		CreatedAt: time.Now(),
	}

	for _, m := range sess.Messages {
		if m.Role == domain.RoleUser {
			tc.Prompts = append(tc.Prompts, m.Content)
		}
	}

	if err := s.tcRepo.Save(ctx, tc); err != nil {
		return nil, err
	}
	return tc, nil
}

// Session 相关操作

func (s *Service) Save(ctx context.Context, sess *domain.Session) error {
	sess.UpdatedAt = time.Now()
	return s.repo.SaveSession(ctx, sess)
}

func (s *Service) Get(ctx context.Context, id string) (*domain.Session, error) {
	return s.repo.GetSession(ctx, id)
}

func (s *Service) GetOrCreateSession(ctx context.Context, id, appID string) (*domain.Session, error) {
	sess, err := s.Get(ctx, id)
	if err == nil {
		return sess, nil
	}

	newS := &domain.Session{
		ID:        id,
		Name:      fmt.Sprintf("会话 %s", time.Now().Format("01-02 15:04")),
		AppID:     appID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Messages:  []domain.Message{},
	}
	_ = s.repo.SaveSession(ctx, newS)
	return newS, nil
}

func (s *Service) Append(ctx context.Context, id string, msg domain.Message) error {
	sess, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	sess.Messages = append(sess.Messages, msg)
	return s.Save(ctx, sess)
}

func (s *Service) List(ctx context.Context) ([]domain.SessionSummary, error) {
	return s.repo.List(ctx)
}

func (s *Service) Rename(ctx context.Context, id, newName string) error {
	sess, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	sess.Name = newName
	return s.Save(ctx, sess)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

func (s *Service) DeleteBatch(ctx context.Context, ids []string) error {
	return s.repo.DeleteBatch(ctx, ids)
}

func (s *Service) UpdateLastMessageMeta(ctx context.Context, id string, meta map[string]interface{}) error {
	sess, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if len(sess.Messages) > 0 {
		sess.Messages[len(sess.Messages)-1].Meta = meta
		return s.Save(ctx, sess)
	}
	return nil
}
