package context

import (
	"context"
	"context-fabric/backend/core/domain"
	"context-fabric/backend/core/history"
	"context-fabric/backend/core/persistence"
	"time"

	"github.com/pkoukk/tiktoken-go"
)

type Engine struct {
	repo *persistence.FileHistoryRepository
	tke  *tiktoken.Tiktoken
}

func NewEngine(repo *persistence.FileHistoryRepository) *Engine {
	tke, _ := tiktoken.GetEncoding("cl100k_base")
	return &Engine{repo: repo, tke: tke}
}

func (e *Engine) BuildPayload(ctx context.Context, id string, query string, cfg domain.LLMConfig) ([]domain.Message, error) {
	session, _ := e.repo.GetSession(ctx, id)
	sysMsg := domain.Message{Role: domain.RoleSystem, Content: "ContextFabric Engine. Time: " + time.Now().Format("15:04:05")}
	
	maxTokens := 4000
	payload, tokens, _ := e.selectMessages(ctx, session, sysMsg, maxTokens)
	
	payload[len(payload)-1].Meta = map[string]interface{}{"tokens_total": tokens, "tokens_max": maxTokens}
	return payload, nil
}

func (e *Engine) selectMessages(ctx context.Context, session *domain.Session, sysMsg domain.Message, max int) ([]domain.Message, int, error) {
	estimate := func(s string) int {
		if e.tke == nil { return len(s) / 4 }
		tokens := e.tke.Encode(s, nil, nil)
		return len(tokens)
	}

	currentTokens := estimate(sysMsg.Content)
	var selected []domain.Message
	if session != nil {
		for i := len(session.Messages) - 1; i >= 0; i-- {
			msg := session.Messages[i]
			t := estimate(msg.Content)
			if currentTokens+t > max {
				break
			}
			selected = append([]domain.Message{msg}, selected...)
			currentTokens += t
		}
	}
	return append([]domain.Message{sysMsg}, selected...), currentTokens, nil
}

type Service struct {
	historySvc *history.Service
	engine     *Engine
}

func NewService(h *history.Service, e *Engine) *Service { return &Service{historySvc: h, engine: e} }
func (s *Service) CreateSession(ctx context.Context, appID string) (*domain.Session, error) {
	return s.historySvc.GetOrCreateSession(ctx, "session-"+time.Now().Format("05"), appID)
}
func (s *Service) AppendMessage(ctx context.Context, id string, msg domain.Message) (map[string]interface{}, error) {
	err := s.historySvc.Append(ctx, id, msg)
	if err != nil {
		return nil, err
	}
	// Recalculate stats
	session, _ := s.historySvc.Get(ctx, id)
	sysMsg := domain.Message{Content: "ContextFabric Engine."} // Simplified for stats
	_, tokens, _ := s.engine.selectMessages(ctx, session, sysMsg, 4000)
	meta := map[string]interface{}{"tokens_total": tokens, "tokens_max": 4000}
	s.historySvc.UpdateLastMessageMeta(ctx, id, meta)
	return meta, nil
}
func (s *Service) GetOptimizedContext(ctx context.Context, id, query string, cfg domain.LLMConfig) ([]domain.Message, error) {
	s.historySvc.GetOrCreateSession(ctx, id, "auto")
	userMsg := domain.Message{Role: domain.RoleUser, Content: query, Timestamp: time.Now()}
	s.historySvc.Append(ctx, id, userMsg)
	
	payload, err := s.engine.BuildPayload(ctx, id, query, cfg)
	if err == nil && len(payload) > 0 {
		s.historySvc.UpdateLastMessageMeta(ctx, id, payload[len(payload)-1].Meta)
	}
	return payload, err
}
