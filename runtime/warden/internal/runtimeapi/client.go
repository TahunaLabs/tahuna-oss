package runtimeapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	StatusProvisioning = "provisioning"
	StatusRunning      = "running"
	StatusCompleted    = "completed"
	StatusFailed       = "failed"
	StatusCancelled    = "cancelled"
)

type BootstrapEntry struct {
	Path        string `json:"path"`
	SHA256      string `json:"sha256"`
	Size        int64  `json:"size"`
	Mode        int    `json:"mode"`
	DownloadURL string `json:"download_url"`
}

type BootstrapPlan struct {
	RunID           string `json:"run_id"`
	ContractVersion string `json:"contract_version"`
	WorkspaceRoot   string `json:"workspace_root"`
	Code            struct {
		ManifestHash string           `json:"manifest_hash"`
		Entries      []BootstrapEntry `json:"entries"`
	} `json:"code"`
	Data struct {
		ManifestHash *string          `json:"manifest_hash"`
		Entries      []BootstrapEntry `json:"entries"`
	} `json:"data"`
}

type StatusUpdate struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

type LogLine struct {
	Message   string `json:"message"`
	Level     string `json:"level,omitempty"`
	Source    string `json:"source,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

type MetricSample struct {
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Step      *int64  `json:"step,omitempty"`
	Unit      string  `json:"unit,omitempty"`
	Source    string  `json:"source,omitempty"`
	Timestamp int64   `json:"timestamp,omitempty"`
}

type ArtifactRequest struct {
	Name      string `json:"name"`
	SizeBytes int64  `json:"size_bytes"`
}

type ArtifactUpload struct {
	Name string `json:"name"`
	Key  string `json:"key"`
	URL  string `json:"url"`
}

type clientResponseAccepted struct {
	Accepted int `json:"accepted"`
}

type Client struct {
	baseURL string
	runID   string
	token   string
	http    *http.Client
}

func New(baseURL, runID, runtimeToken string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		runID:   strings.TrimSpace(runID),
		token:   strings.TrimSpace(runtimeToken),
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) GetBootstrapPlan(ctx context.Context) (BootstrapPlan, error) {
	var plan BootstrapPlan
	if err := c.doJSON(ctx, http.MethodGet, c.path("bootstrap"), nil, &plan); err != nil {
		return BootstrapPlan{}, err
	}
	return plan, nil
}

func (c *Client) EmitStatus(ctx context.Context, update StatusUpdate) error {
	return c.doJSON(ctx, http.MethodPost, c.path("status"), update, nil)
}

func (c *Client) EmitLogs(ctx context.Context, lines []LogLine) (int, error) {
	body := struct {
		Lines []LogLine `json:"lines"`
	}{
		Lines: lines,
	}
	var response clientResponseAccepted
	if err := c.doJSON(ctx, http.MethodPost, c.path("logs"), body, &response); err != nil {
		return 0, err
	}
	return response.Accepted, nil
}

func (c *Client) EmitMetrics(ctx context.Context, metrics []MetricSample) (int, error) {
	body := struct {
		Metrics []MetricSample `json:"metrics"`
	}{
		Metrics: metrics,
	}
	var response clientResponseAccepted
	if err := c.doJSON(ctx, http.MethodPost, c.path("metrics"), body, &response); err != nil {
		return 0, err
	}
	return response.Accepted, nil
}

func (c *Client) GetArtifactUploadURLs(ctx context.Context, artifacts []ArtifactRequest) ([]ArtifactUpload, error) {
	body := struct {
		Artifacts []ArtifactRequest `json:"artifacts"`
	}{
		Artifacts: artifacts,
	}
	var response struct {
		Uploads []ArtifactUpload `json:"uploads"`
	}
	if err := c.doJSON(ctx, http.MethodPost, c.path("artifacts/upload-url"), body, &response); err != nil {
		return nil, err
	}
	return response.Uploads, nil
}

func (c *Client) CommitArtifacts(ctx context.Context, keys []string) (int, error) {
	body := struct {
		Keys []string `json:"keys"`
	}{
		Keys: keys,
	}
	var response clientResponseAccepted
	if err := c.doJSON(ctx, http.MethodPost, c.path("artifacts/commit"), body, &response); err != nil {
		return 0, err
	}
	return response.Accepted, nil
}

func (c *Client) path(action string) string {
	return fmt.Sprintf("%s/api/runs/%s/runtime/%s", c.baseURL, c.runID, action)
}

func (c *Client) doJSON(ctx context.Context, method, url string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("encode request body: %w", err)
		}
		body = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("request %s %s: %w", method, url, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		message := strings.TrimSpace(string(raw))
		if message == "" {
			message = resp.Status
		}
		return fmt.Errorf("runtime API %s %s failed: status=%d body=%s", method, url, resp.StatusCode, message)
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}
