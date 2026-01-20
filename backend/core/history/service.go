package history

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/persistence"
	"time"
)

// Service 提供会话历史和测试用例的增删改查服务
type Service struct {
	repo   *persistence.FileHistoryRepository
	tcRepo *persistence.FileTestCaseRepository
}

// NewService 创建一个新的 Service 实例
func NewService(repo *persistence.FileHistoryRepository, tcRepo *persistence.FileTestCaseRepository) *Service {
	return &Service{repo: repo, tcRepo: tcRepo}
}

// CreateTestCaseFromSession 将现有会话转换为测试用例
func (s *Service) CreateTestCaseFromSession(ctx context.Context, sessionID, name string) (*domain.TestCase, error) {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	var prompts []string
	for _, m := range session.Messages {
		if m.Role == domain.RoleUser {
			prompts = append(prompts, m.Content)
		}
	}

	tc := &domain.TestCase{
		ID:        "tc-" + time.Now().Format("20060102150405"),
		Name:      name,
		AppID:     session.AppID,
		Prompts:   prompts,
		CreatedAt: time.Now(),
	}

	err = s.tcRepo.SaveTestCase(ctx, tc)
	return tc, err
}

// ListTestCases 列出所有测试用例
func (s *Service) ListTestCases(ctx context.Context) ([]*domain.TestCaseSummary, error) {
	return s.tcRepo.ListTestCases(ctx)
}

// GetTestCase 获取测试用例详情
func (s *Service) GetTestCase(ctx context.Context, id string) (*domain.TestCase, error) {
	return s.tcRepo.GetTestCase(ctx, id)
}

// DeleteTestCase 删除测试用例
func (s *Service) DeleteTestCase(ctx context.Context, id string) error {
	return s.tcRepo.DeleteTestCase(ctx, id)
}

// SaveTestCase 保存或更新测试用例
func (s *Service) SaveTestCase(ctx context.Context, tc *domain.TestCase) error {
	return s.tcRepo.SaveTestCase(ctx, tc)
}

// GetOrCreateSession 获取现有会话或创建新会话
func (s *Service) GetOrCreateSession(ctx context.Context, id, appID string) (*domain.Session, error) {
	session, err := s.repo.GetSession(ctx, id)
	if err == nil {
		return session, nil
	}
	newS := &domain.Session{
		ID:        id,
		AppID:     appID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Messages:  []domain.Message{},
	}
	s.repo.SaveSession(ctx, newS)
	return newS, nil
}

// Append 向指定会话追加一条消息
func (s *Service) Append(ctx context.Context, id string, msg domain.Message) error {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil {
		return err
	}
	session.Messages = append(session.Messages, msg)
	session.UpdatedAt = time.Now()
	return s.repo.SaveSession(ctx, session)
}

// UpdateLastMessageMeta 更新会话中最后一条消息的元数据
func (s *Service) UpdateLastMessageMeta(ctx context.Context, id string, meta map[string]interface{}) error {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil || len(session.Messages) == 0 {
		return err
	}
	session.Messages[len(session.Messages)-1].Meta = meta
	return s.repo.SaveSession(ctx, session)
}

// List 列出所有会话的摘要信息
func (s *Service) List(ctx context.Context) ([]*domain.SessionSummary, error) {
	return s.repo.ListSessions(ctx)
}

// Get 获取指定会话的完整详情
func (s *Service) Get(ctx context.Context, id string) (*domain.Session, error) {
	return s.repo.GetSession(ctx, id)
}

// Delete 删除指定会话
func (s *Service) Delete(ctx context.Context, id string) error {
	return s.repo.DeleteSession(ctx, id)
}

// DeleteBatch 批量删除会话
func (s *Service) DeleteBatch(ctx context.Context, ids []string) error {
	return s.repo.DeleteSessions(ctx, ids)
}

// Rename 重命名会话
func (s *Service) Rename(ctx context.Context, id, newName string) error {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil {
		return err
	}
	session.Name = newName
	session.UpdatedAt = time.Now()
	return s.repo.SaveSession(ctx, session)
}
