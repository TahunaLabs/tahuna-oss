package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const runPodEndpoint = "https://api.runpod.io/graphql"

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

func main() {
	if len(os.Args) < 2 {
		fatalf("usage: provisioner <launch|wait-running|wait-completion|terminate>")
	}

	apiKey := strings.TrimSpace(os.Getenv("RUNPOD_API_KEY"))
	if apiKey == "" {
		fatalf("RUNPOD_API_KEY is required")
	}

	client := &http.Client{Timeout: 60 * time.Second}

	switch os.Args[1] {
	case "launch":
		if err := launch(client, apiKey, os.Args[2:]); err != nil {
			fatalf(err.Error())
		}
	case "wait-running":
		if err := waitRunning(client, apiKey, os.Args[2:]); err != nil {
			fatalf(err.Error())
		}
	case "wait-completion":
		if err := waitCompletion(client, apiKey, os.Args[2:]); err != nil {
			fatalf(err.Error())
		}
	case "terminate":
		if err := terminate(client, apiKey, os.Args[2:]); err != nil {
			fatalf(err.Error())
		}
	default:
		fatalf("unknown subcommand %q", os.Args[1])
	}
}

func launch(client *http.Client, apiKey string, args []string) error {
	fs := flag.NewFlagSet("launch", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	envArtifacts := fs.String("env-artifacts", "", "")
	inputPath := fs.String("input-path", "", "")
	outputPath := fs.String("output-path", "", "")
	logsPath := fs.String("logs-path", "", "")
	gpuType := fs.String("gpu-type", "", "")
	gpuCount := fs.Int("gpu-count", 1, "")
	volumeGB := fs.Int("volume-gb", 1, "")
	framework := fs.String("framework", "", "")
	version := fs.String("version", "", "")
	runID := fs.String("run-id", "", "")
	if err := fs.Parse(args); err != nil {
		return err
	}

	for _, req := range []struct {
		name string
		val  string
	}{
		{"env-artifacts", *envArtifacts},
		{"input-path", *inputPath},
		{"output-path", *outputPath},
		{"logs-path", *logsPath},
		{"gpu-type", *gpuType},
		{"framework", *framework},
		{"version", *version},
		{"run-id", *runID},
	} {
		if strings.TrimSpace(req.val) == "" {
			return fmt.Errorf("--%s is required", req.name)
		}
	}
	if *gpuCount < 1 {
		return errors.New("--gpu-count must be >= 1")
	}
	if *volumeGB < 1 {
		return errors.New("--volume-gb must be >= 1")
	}

	dockerUser := strings.TrimSpace(os.Getenv("DOCKER_USER"))
	if dockerUser == "" {
		return errors.New("DOCKER_USER is required")
	}
	imageName := fmt.Sprintf("%s/tahuna:%s-%s", dockerUser, *framework, *version)

	r2Endpoint, err := requiredEnv("R2_ENDPOINT")
	if err != nil {
		return err
	}
	r2Access, err := requiredEnv("R2_ACCESS_KEY")
	if err != nil {
		return err
	}
	r2Secret, err := requiredEnv("R2_SECRET_KEY")
	if err != nil {
		return err
	}
	r2Bucket, err := requiredEnv("R2_BUCKET")
	if err != nil {
		return err
	}

	env := []map[string]string{
		{"key": "ENV_ARTIFACTS", "value": *envArtifacts},
		{"key": "INPUT_PATH", "value": *inputPath},
		{"key": "OUTPUT_PATH", "value": "/workspace/output"},
		{"key": "OUTPUT_PATH_R2", "value": *outputPath},
		{"key": "LOGS_PATH_R2", "value": *logsPath},
		{"key": "R2_ENDPOINT", "value": r2Endpoint},
		{"key": "R2_ACCESS_KEY", "value": r2Access},
		{"key": "R2_SECRET_KEY", "value": r2Secret},
		{"key": "R2_BUCKET", "value": r2Bucket},
	}

	query := `mutation Deploy($input: PodFindAndDeployOnDemandInput!) { podFindAndDeployOnDemand(input: $input) { id } }`
	variables := map[string]any{
		"input": map[string]any{
			"name":              "tahuna_" + *runID,
			"imageName":         imageName,
			"gpuTypeId":         *gpuType,
			"gpuCount":          *gpuCount,
			"volumeInGb":        *volumeGB,
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
	if err := doGraphQL(client, apiKey, query, variables, &out); err != nil {
		return err
	}
	if out.Pod.ID == "" {
		return errors.New("runpod response missing pod id")
	}
	return printJSON(map[string]string{"pod_id": out.Pod.ID})
}

func waitRunning(client *http.Client, apiKey string, args []string) error {
	fs := flag.NewFlagSet("wait-running", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	podID := fs.String("pod-id", "", "")
	timeoutSec := fs.Int("timeout", 1800, "")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*podID) == "" {
		return errors.New("--pod-id is required")
	}

	deadline := time.Now().Add(time.Duration(*timeoutSec) * time.Second)
	for {
		pod, err := getPod(client, apiKey, *podID)
		if err != nil {
			return err
		}
		if strings.EqualFold(pod.DesiredStatus, "RUNNING") && pod.Runtime != nil {
			return printJSON(pod)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("pod %s did not become RUNNING within %ds", *podID, *timeoutSec)
		}
		time.Sleep(5 * time.Second)
	}
}

func waitCompletion(client *http.Client, apiKey string, args []string) error {
	fs := flag.NewFlagSet("wait-completion", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	podID := fs.String("pod-id", "", "")
	timeoutSec := fs.Int("timeout", 3600, "")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*podID) == "" {
		return errors.New("--pod-id is required")
	}

	start := time.Now()
	for {
		if time.Since(start) > time.Duration(*timeoutSec)*time.Second {
			return fmt.Errorf("pod %s did not complete within %ds", *podID, *timeoutSec)
		}
		pod, err := getPod(client, apiKey, *podID)
		if err != nil {
			return err
		}
		if strings.EqualFold(pod.DesiredStatus, "EXITED") || pod.Runtime == nil {
			return printJSON(map[string]any{
				"completed":       true,
				"status":          pod.DesiredStatus,
				"elapsed_seconds": int(time.Since(start).Seconds()),
			})
		}
		time.Sleep(30 * time.Second)
	}
}

func terminate(client *http.Client, apiKey string, args []string) error {
	fs := flag.NewFlagSet("terminate", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	podID := fs.String("pod-id", "", "")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*podID) == "" {
		return errors.New("--pod-id is required")
	}

	query := `mutation Terminate($podId: String!) { podTerminate(input: { podId: $podId }) { id desiredStatus } }`
	variables := map[string]any{"podId": *podID}
	var out struct {
		Pod struct {
			ID            string `json:"id"`
			DesiredStatus string `json:"desiredStatus"`
		} `json:"podTerminate"`
	}
	if err := doGraphQL(client, apiKey, query, variables, &out); err != nil {
		return err
	}
	if out.Pod.ID == "" {
		return errors.New("runpod response missing pod id")
	}
	return printJSON(map[string]string{"pod_id": out.Pod.ID, "desired_status": out.Pod.DesiredStatus})
}

type podRuntime struct {
	UptimeSeconds any `json:"uptimeInSeconds"`
}

type podState struct {
	ID            string      `json:"id"`
	DesiredStatus string      `json:"desiredStatus"`
	Runtime       *podRuntime `json:"runtime"`
}

func getPod(client *http.Client, apiKey, podID string) (*podState, error) {
	query := `query Pod($podId: String!) { pod(input: { podId: $podId }) { id desiredStatus runtime { uptimeInSeconds } } }`
	variables := map[string]any{"podId": podID}
	var out struct {
		Pod *podState `json:"pod"`
	}
	if err := doGraphQL(client, apiKey, query, variables, &out); err != nil {
		return nil, err
	}
	if out.Pod == nil {
		return nil, fmt.Errorf("pod %s not found", podID)
	}
	return out.Pod, nil
}

func doGraphQL(client *http.Client, apiKey, query string, variables map[string]any, out any) error {
	payload := graphQLRequest{Query: query, Variables: variables}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, runPodEndpoint, bytes.NewReader(body))
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

func requiredEnv(key string) (string, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return "", fmt.Errorf("%s is required", key)
	}
	return v, nil
}

func printJSON(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(append(b, '\n'))
	return err
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
