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
	StatusStarting     = "starting"
	StatusServing      = "serving"
	StatusStopping     = "stopping"
	StatusStopped      = "stopped"
)

type TargetType string

const (
	TargetTypeRun            TargetType = "runs"
	TargetTypeServe          TargetType = "serves"
	TargetTypeComputeSession TargetType = "compute_sessions"
)

type BootstrapEntry struct {
	Path        string `json:"path"`
	SHA256      string `json:"sha256"`
	Size        int64  `json:"size"`
	Mode        int    `json:"mode"`
	DownloadURL string `json:"download_url"`
}

type BootstrapManifest struct {
	ManifestHash string           `json:"manifest_hash"`
	Entries      []BootstrapEntry `json:"entries"`
}

type OptionalBootstrapManifest struct {
	ManifestHash *string          `json:"manifest_hash"`
	Entries      []BootstrapEntry `json:"entries"`
}

type RunBootstrapPlan struct {
	RunID           string                    `json:"run_id"`
	ContractVersion string                    `json:"contract_version"`
	WorkspaceRoot   string                    `json:"workspace_root"`
	Command         []string                  `json:"command"`
	DependencyGroup string                    `json:"dependency_group"`
	Code            BootstrapManifest         `json:"code"`
	Data            OptionalBootstrapManifest `json:"data"`
}

type ServeBootstrapPlan struct {
	ServeID                 string                    `json:"serve_id"`
	ContractVersion         string                    `json:"contract_version"`
	EnvironmentID           string                    `json:"environment_id"`
	WorkspaceRoot           string                    `json:"workspace_root"`
	ModelRoot               string                    `json:"model_root"`
	OutputDir               string                    `json:"output_dir"`
	LogsPath                string                    `json:"logs_path"`
	Command                 []string                  `json:"command"`
	DependencyGroup         string                    `json:"dependency_group"`
	Code                    BootstrapManifest         `json:"code"`
	Data                    OptionalBootstrapManifest `json:"data"`
	Model                   BootstrapManifest         `json:"model"`
	PythonVersion           string                    `json:"python_version"`
	Port                    int                       `json:"port"`
	HealthPath              string                    `json:"health_path"`
	StartupTimeoutSeconds   int                       `json:"startup_timeout_seconds"`
	HealthIntervalSeconds   int                       `json:"health_interval_seconds"`
	HealthTimeoutSeconds    int                       `json:"health_timeout_seconds"`
	HealthFailureThreshold  int                       `json:"health_failure_threshold"`
	GracefulShutdownSeconds int                       `json:"graceful_shutdown_seconds"`
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

type SessionAssignment struct {
	RunID string `json:"run_id"`
}

type clientResponseAccepted struct {
	Accepted int `json:"accepted"`
}

type Client struct {
	baseURL    string
	targetType TargetType
	targetID   string
	token      string
	http       *http.Client
}

func NewRun(baseURL, runID, runtimeToken string, timeout time.Duration) *Client {
	return newClient(baseURL, TargetTypeRun, runID, runtimeToken, timeout)
}

func NewServe(baseURL, serveID, runtimeToken string, timeout time.Duration) *Client {
	return newClient(baseURL, TargetTypeServe, serveID, runtimeToken, timeout)
}

func NewSession(baseURL, computeSessionID, runtimeToken string, timeout time.Duration) *Client {
	return newClient(baseURL, TargetTypeComputeSession, computeSessionID, runtimeToken, timeout)
}

func newClient(baseURL string, targetType TargetType, targetID, runtimeToken string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &Client{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		targetType: targetType,
		targetID:   strings.TrimSpace(targetID),
		token:      strings.TrimSpace(runtimeToken),
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) GetRunBootstrapPlan(ctx context.Context) (RunBootstrapPlan, error) {
	var plan RunBootstrapPlan
	if err := c.doJSON(ctx, http.MethodGet, c.path("bootstrap"), nil, &plan); err != nil {
		return RunBootstrapPlan{}, err
	}
	return plan, nil
}

func (c *Client) GetServeBootstrapPlan(ctx context.Context) (ServeBootstrapPlan, error) {
	var plan ServeBootstrapPlan
	if err := c.doJSON(ctx, http.MethodGet, c.path("bootstrap"), nil, &plan); err != nil {
		return ServeBootstrapPlan{}, err
	}
	return plan, nil
}

func (c *Client) GetSessionAssignment(ctx context.Context) (SessionAssignment, error) {
	var assignment SessionAssignment
	if err := c.doJSON(ctx, http.MethodGet, c.path("assignment"), nil, &assignment); err != nil {
		return SessionAssignment{}, err
	}
	return assignment, nil
}

func (c *Client) EmitSessionHeartbeat(ctx context.Context) error {
	return c.doJSON(ctx, http.MethodPost, c.path("heartbeat"), nil, nil)
}

func (c *Client) MarkSessionIdle(ctx context.Context, runID string) error {
	body := struct {
		RunID string `json:"run_id"`
	}{
		RunID: strings.TrimSpace(runID),
	}
	return c.doJSON(ctx, http.MethodPost, c.path("idle"), body, nil)
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
	return fmt.Sprintf("%s/api/%s/%s/runtime/%s", c.baseURL, c.targetType, c.targetID, action)
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
