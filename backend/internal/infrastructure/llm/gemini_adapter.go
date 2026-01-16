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

type GeminiAdapter struct {
	config domain.LLMConfig
	client *http.Client
}

func NewGeminiAdapter(cfg domain.LLMConfig) *GeminiAdapter {
	if cfg.Model == "" {
		cfg.Model = "gemini-1.5-flash"
	}
	return &GeminiAdapter{
		config: cfg,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (a *GeminiAdapter) buildRequest(messages []domain.Message) geminiRequest {
	contents := make([]geminiContent, 0)
	var systemInstruction *geminiContent
	for _, m := range messages {
		if m.Role == domain.RoleSystem {
			systemInstruction = &geminiContent{Parts: []geminiPart{{Text: m.Content}}}
			continue
		}
		role := "user"
		if m.Role == domain.RoleAssistant { role = "model" }
		contents = append(contents, geminiContent{Role: role, Parts: []geminiPart{{Text: m.Content}}})
	}
	return geminiRequest{Contents: contents, SystemInstruction: systemInstruction}
}

func (a *GeminiAdapter) Chat(ctx context.Context, messages []domain.Message) (string, error) {
	reqBody := a.buildRequest(messages)
	jsonData, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", a.config.Model, a.config.APIKey)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()
	var result struct { Candidates []struct { Content struct { Parts []struct { Text string `json:"text"` } `json:"parts"` } `json:"content"` } `json:"candidates"` }
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Candidates) > 0 && len(result.Candidates[0].Content.Parts) > 0 {
		return result.Candidates[0].Content.Parts[0].Text, nil
	}
	return "", fmt.Errorf("no response")
}

func (a *GeminiAdapter) ChatStream(ctx context.Context, messages []domain.Message, chunkChan chan<- string) error {
	defer close(chunkChan)
	reqBody := a.buildRequest(messages)
	jsonData, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse", a.config.Model, a.config.APIKey)
	
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil { break }
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data: ") { continue }
		data := strings.TrimPrefix(line, "data: ")
		
		var streamResp struct {
			Candidates []struct {
				Content struct {
					Parts []struct { Text string `json:"text"` } `json:"parts"`
				}
			}
		}
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil { continue }
		if len(streamResp.Candidates) > 0 && len(streamResp.Candidates[0].Content.Parts) > 0 {
			chunkChan <- streamResp.Candidates[0].Content.Parts[0].Text
		}
	}
	return nil
}

func (a *GeminiAdapter) Summarize(ctx context.Context, text string) (string, error) {
	return a.Chat(ctx, []domain.Message{{Role: "user", Content: "总结: " + text}})
}

type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
	SystemInstruction *geminiContent `json:"system_instruction,omitempty"`
}
type geminiContent struct { Role string `json:"role,omitempty"` ; Parts []geminiPart `json:"parts"` }
type geminiPart struct { Text string `json:"text"` }
