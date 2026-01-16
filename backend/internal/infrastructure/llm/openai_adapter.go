package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"context-fabric/backend/internal/domain"
)

type OpenAIAdapter struct {
	config domain.LLMConfig
	client *http.Client
}

func NewOpenAIAdapter(cfg domain.LLMConfig) *OpenAIAdapter {
	return &OpenAIAdapter{
		config: cfg,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

// 之前的 Chat 方法保持不变...
func (a *OpenAIAdapter) Chat(ctx context.Context, messages []domain.Message) (string, error) {
	apiMsgs := make([]openAIChatMessage, len(messages))
	for i, m := range messages {
		apiMsgs[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
	}
	reqBody := openAIChatRequest{Model: a.config.Model, Messages: apiMsgs}
	jsonData, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/chat/completions", a.config.BaseURL)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.config.APIKey))
	resp, err := a.client.Do(req)
	if err != nil { return "", err } // 修复了这里少了一个换行符
	defer resp.Body.Close()
	var result struct {
		Choices []struct { Message struct { Content string `json:"content"` } `json:"message"` } `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil { // 修复了这里少了一个换行符
		return "", err
	}

	if len(result.Choices) > 0 { return result.Choices[0].Message.Content, nil } // 修复了这里少了一个换行符
	return "", fmt.Errorf("no response")
}

// ChatStream 实现流式输出
func (a *OpenAIAdapter) ChatStream(ctx context.Context, messages []domain.Message, chunkChan chan<- string) error {
	defer close(chunkChan)

	apiMsgs := make([]openAIChatMessage, len(messages))
	for i, m := range messages {
		apiMsgs[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
	}

	reqBody := map[string]interface{}{
		"model":    a.config.Model,
		"messages": apiMsgs,
		"stream":   true,
	}

	jsonData, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/chat/completions", a.config.BaseURL)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.config.APIKey)

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("openai error: %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var streamResp struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				}
			}
		}
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 && streamResp.Choices[0].Delta.Content != "" {
			chunkChan <- streamResp.Choices[0].Delta.Content
		}
	}
	return nil
}

func (a *OpenAIAdapter) Summarize(ctx context.Context, text string) (string, error) {
	return a.Chat(ctx, []domain.Message{{Role: "user", Content: "总结: " + text}})
}

type openAIChatRequest struct {
	Model    string             `json:"model"`
	Messages []openAIChatMessage `json:"messages"`
}

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}