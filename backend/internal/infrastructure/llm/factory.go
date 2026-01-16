package llm

import (
	"context-fabric/backend/internal/domain"
	"fmt"
)

func NewLLMProvider(cfg domain.LLMConfig) (domain.LLMProvider, error) {
	switch cfg.Provider {
	case "gemini":
		return NewGeminiAdapter(cfg), nil
	case "deepseek", "openai":
		if cfg.BaseURL == "" && cfg.Provider == "deepseek" {
			cfg.BaseURL = "https://api.deepseek.com"
		}
		return NewOpenAIAdapter(cfg), nil
	case "mock":
		return NewMockLLM("CF-Agent"), nil
	default:
		return nil, fmt.Errorf("unsupported llm provider: %s", cfg.Provider)
	}
}
