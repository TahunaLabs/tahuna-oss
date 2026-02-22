package provisioner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const runPodEndpoint = "https://api.runpod.io/graphql"

type Config struct {
	DockerUser  string
	R2Endpoint  string
	R2AccessKey string
	R2SecretKey string
	R2Bucket    string
}

type LaunchRequest struct {
	EnvArtifacts string
	InputPath    string
	OutputPath   string
	LogsPath     string
	GPUType      string
	GPUCount     int
	VolumeGB     int
	Framework    string
	Version      string
	RunID        string
}

type podRuntime struct {
	UptimeSeconds any `json:"uptimeInSeconds"`
}

type PodState struct {
	ID            string      `json:"id"`
	DesiredStatus string      `json:"desiredStatus"`
	Runtime       *podRuntime `json:"runtime"`
}

type Completion struct {
	Completed      bool   `json:"completed"`
	Status         string `json:"status"`
	ElapsedSeconds int    `json:"elapsed_seconds"`
}

type graphQLError struct {
	Message string `json:"message"`
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors"`
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

func Launch(ctx context.Context, client *http.Client, apiKey string, cfg Config, req LaunchRequest) (string, error) {
	if strings.TrimSpace(apiKey) == "" {
		return "", errors.New("api key is required")
	}
	if err := validateLaunchConfig(cfg, req); err != nil {
		return "", err
	}

	imageName := fmt.Sprintf("%s/tahuna:%s-%s", cfg.DockerUser, req.Framework, req.Version)
	env := []map[string]string{
		{"key": "ENV_ARTIFACTS", "value": req.EnvArtifacts},
		{"key": "INPUT_PATH", "value": req.InputPath},
		{"key": "OUTPUT_PATH", "value": "/workspace/output"},
		{"key": "OUTPUT_PATH_R2", "value": req.OutputPath},
		{"key": "LOGS_PATH_R2", "value": req.LogsPath},
		{"key": "R2_ENDPOINT", "value": cfg.R2Endpoint},
		{"key": "R2_ACCESS_KEY", "value": cfg.R2AccessKey},
		{"key": "R2_SECRET_KEY", "value": cfg.R2SecretKey},
		{"key": "R2_BUCKET", "value": cfg.R2Bucket},
	}

	query := `mutation Deploy($input: PodFindAndDeployOnDemandInput!) { podFindAndDeployOnDemand(input: $input) { id } }`
	variables := map[string]any{
		"input": map[string]any{
			"name":              "tahuna_" + req.RunID,
			"imageName":         imageName,
			"gpuTypeId":         req.GPUType,
			"gpuCount":          req.GPUCount,
			"volumeInGb":        req.VolumeGB,
			"containerDiskInGb": 20,
			"volumeMountPath":   "/workspace",
			"startSsh":          true,
			"env":               env,
		},
	}

	var out struct {
		Pod struct {
			ID string `json:"id"`
		} `json:"podFindAndDeployOnDemand"`
	}
	if err := doGraphQL(ctx, client, apiKey, query, variables, &out); err != nil {
		return "", err
	}
	if out.Pod.ID == "" {
		return "", errors.New("runpod response missing pod id")
	}
	return out.Pod.ID, nil
}

func WaitRunning(ctx context.Context, client *http.Client, apiKey, podID string, timeout time.Duration) (*PodState, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("api key is required")
	}
	if strings.TrimSpace(podID) == "" {
		return nil, errors.New("pod id is required")
	}
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}

	deadline := time.Now().Add(timeout)
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		pod, err := getPod(ctx, client, apiKey, podID)
		if err != nil {
			return nil, err
		}
		if strings.EqualFold(pod.DesiredStatus, "RUNNING") && pod.Runtime != nil {
			return pod, nil
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("pod %s did not become RUNNING within %s", podID, timeout)
		}
		timer := time.NewTimer(5 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func WaitCompletion(ctx context.Context, client *http.Client, apiKey, podID string, timeout time.Duration) (*Completion, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("api key is required")
	}
	if strings.TrimSpace(podID) == "" {
		return nil, errors.New("pod id is required")
	}
	if timeout <= 0 {
		timeout = time.Hour
	}

	start := time.Now()
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if time.Since(start) > timeout {
			return nil, fmt.Errorf("pod %s did not complete within %s", podID, timeout)
		}
		pod, err := getPod(ctx, client, apiKey, podID)
		if err != nil {
			return nil, err
		}
		if strings.EqualFold(pod.DesiredStatus, "EXITED") || pod.Runtime == nil {
			return &Completion{
				Completed:      true,
				Status:         pod.DesiredStatus,
				ElapsedSeconds: int(time.Since(start).Seconds()),
			}, nil
		}
		timer := time.NewTimer(30 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func Terminate(ctx context.Context, client *http.Client, apiKey, podID string) (string, error) {
	if strings.TrimSpace(apiKey) == "" {
		return "", errors.New("api key is required")
	}
	if strings.TrimSpace(podID) == "" {
		return "", errors.New("pod id is required")
	}

	query := `mutation Terminate($podId: String!) { podTerminate(input: { podId: $podId }) { id desiredStatus } }`
	variables := map[string]any{"podId": podID}
	var out struct {
		Pod struct {
			ID            string `json:"id"`
			DesiredStatus string `json:"desiredStatus"`
		} `json:"podTerminate"`
	}
	if err := doGraphQL(ctx, client, apiKey, query, variables, &out); err != nil {
		return "", err
	}
	if out.Pod.ID == "" {
		return "", errors.New("runpod response missing pod id")
	}
	return out.Pod.DesiredStatus, nil
}

func getPod(ctx context.Context, client *http.Client, apiKey, podID string) (*PodState, error) {
	query := `query Pod($podId: String!) { pod(input: { podId: $podId }) { id desiredStatus runtime { uptimeInSeconds } } }`
	variables := map[string]any{"podId": podID}
	var out struct {
		Pod *PodState `json:"pod"`
	}
	if err := doGraphQL(ctx, client, apiKey, query, variables, &out); err != nil {
		return nil, err
	}
	if out.Pod == nil {
		return nil, fmt.Errorf("pod %s not found", podID)
	}
	return out.Pod, nil
}

func doGraphQL(ctx context.Context, client *http.Client, apiKey, query string, variables map[string]any, out any) error {
	payload := graphQLRequest{Query: query, Variables: variables}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, runPodEndpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("runpod http %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var decoded graphQLResponse
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return fmt.Errorf("invalid runpod response: %w", err)
	}
	if len(decoded.Errors) > 0 {
		msgs := make([]string, 0, len(decoded.Errors))
		for _, e := range decoded.Errors {
			if e.Message != "" {
				msgs = append(msgs, e.Message)
			}
		}
		if len(msgs) == 0 {
			return errors.New("runpod graphql returned errors")
		}
		return fmt.Errorf("runpod graphql error: %s", strings.Join(msgs, "; "))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(decoded.Data, out)
}

func validateLaunchConfig(cfg Config, req LaunchRequest) error {
	for _, required := range []struct {
		name  string
		value string
	}{
		{"docker user", cfg.DockerUser},
		{"r2 endpoint", cfg.R2Endpoint},
		{"r2 access key", cfg.R2AccessKey},
		{"r2 secret key", cfg.R2SecretKey},
		{"r2 bucket", cfg.R2Bucket},
		{"env artifacts", req.EnvArtifacts},
		{"input path", req.InputPath},
		{"output path", req.OutputPath},
		{"logs path", req.LogsPath},
		{"gpu type", req.GPUType},
		{"framework", req.Framework},
		{"version", req.Version},
		{"run id", req.RunID},
	} {
		if strings.TrimSpace(required.value) == "" {
			return fmt.Errorf("%s is required", required.name)
		}
	}
	if req.GPUCount < 1 {
		return errors.New("gpu count must be >= 1")
	}
	if req.VolumeGB < 1 {
		return errors.New("volume gb must be >= 1")
	}
	return nil
}
