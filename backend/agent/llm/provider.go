package llm

import (
	"bufio"
	"bytes"
	"context"
	"context-fabric/backend/agent/domain"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type OpenAIProvider struct {
	cfg    domain.LLMConfig
	client *http.Client
}

func NewOpenAIProvider(cfg domain.LLMConfig) *OpenAIProvider {
	return &OpenAIProvider{cfg: cfg, client: &http.Client{Timeout: 60 * time.Second}}
}
func (p *OpenAIProvider) ChatStream(ctx context.Context, msgs []domain.Message, out chan<- string) error {
	defer close(out)
	body := map[string]interface{}{"model": p.cfg.Model, "messages": msgs, "stream": true}
	data, _ := json.Marshal(body)
	url := p.cfg.BaseURL
	if url == "" {
		url = "https://api.deepseek.com"
	}
	req, _ := http.NewRequestWithContext(ctx, "POST", url+"/chat/completions", bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	reader := bufio.NewReader(resp.Body)
	for {
		line, _ := reader.ReadString('\n')
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		if strings.Contains(line, "[DONE]") {
			break
		}
		var res struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &res)
		if len(res.Choices) > 0 {
			out <- res.Choices[0].Delta.Content
		}
	}
	return nil
}

type GeminiProvider struct {
	cfg    domain.LLMConfig
	client *http.Client
}

func NewGeminiProvider(cfg domain.LLMConfig) *GeminiProvider {
	return &GeminiProvider{cfg: cfg, client: &http.Client{Timeout: 60 * time.Second}}
}
func (p *GeminiProvider) ChatStream(ctx context.Context, msgs []domain.Message, out chan<- string) error {
	defer close(out)
	var contents []interface{}
	for _, m := range msgs {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, map[string]interface{}{"role": role, "parts": []interface{}{map[string]interface{}{"text": m.Content}}})
	}
	body := map[string]interface{}{"contents": contents}
	data, _ := json.Marshal(body)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse", p.cfg.Model, p.cfg.APIKey)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	reader := bufio.NewReader(resp.Body)
	for {
		line, _ := reader.ReadString('\n')
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var res struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &res)
		if len(res.Candidates) > 0 && len(res.Candidates[0].Content.Parts) > 0 {
			out <- res.Candidates[0].Content.Parts[0].Text
		}
	}
}

func NewProvider(cfg domain.LLMConfig) domain.LLMProvider {
	if cfg.Provider == "gemini" {
		return NewGeminiProvider(cfg)
	}
	return NewOpenAIProvider(cfg)
}
