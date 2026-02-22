package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"tahuna-provisioner/pkg/provisioner"
)

type dbState struct {
	Environments map[string]map[string]any `json:"environments"`
	Experiments  map[string]map[string]any `json:"experiments"`
	Runs         map[string]map[string]any `json:"runs"`
}

type app struct {
	mu     sync.Mutex
	dbPath string
}

type runJob struct {
	RunID     string         `json:"run_id"`
	Overrides map[string]any `json:"overrides,omitempty"`
}

func main() {
	dbPath := envOr("TAHUNA_DB", "db.json")
	queueDir := envOr("TAHUNA_QUEUE_DIR", "queue/runs")
	pollEvery := envDurationOr("WORKER_POLL_INTERVAL", 2*time.Second)

	if err := os.MkdirAll(queueDir, 0o755); err != nil {
		log.Fatalf("worker failed to create queue dir %q: %v", queueDir, err)
	}

	apiKey := strings.TrimSpace(os.Getenv("RUNPOD_API_KEY"))
	if apiKey == "" {
		log.Fatal("worker invalid config: RUNPOD_API_KEY is required")
	}
	cfg, err := loadProvisionerConfigFromEnv()
	if err != nil {
		log.Fatalf("worker invalid config: %v", err)
	}

	a := &app{dbPath: dbPath}
	client := &http.Client{Timeout: 60 * time.Second}
	log.Printf("worker started (db=%s queue=%s interval=%s)", dbPath, queueDir, pollEvery)

	for {
		processed, err := processNextJob(a, client, apiKey, cfg, queueDir)
		if err != nil {
			log.Printf("worker error: %v", err)
		}
		if !processed {
			time.Sleep(pollEvery)
		}
	}
}

func processNextJob(a *app, client *http.Client, apiKey string, cfg provisioner.Config, queueDir string) (bool, error) {
	jobFile, job, ok, err := claimNextJob(queueDir)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	defer func() {
		_ = os.Remove(jobFile)
	}()

	executeRun(a, client, apiKey, cfg, job.RunID, job.Overrides)
	return true, nil
}

func claimNextJob(queueDir string) (string, runJob, bool, error) {
	entries, err := os.ReadDir(queueDir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", runJob{}, false, nil
		}
		return "", runJob{}, false, err
	}

	candidates := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(name, ".json") {
			candidates = append(candidates, name)
		}
	}
	sort.Strings(candidates)

	for _, name := range candidates {
		src := filepath.Join(queueDir, name)
		claimed := src + ".processing-" + shortID()
		if err := os.Rename(src, claimed); err != nil {
			continue
		}

		b, err := os.ReadFile(claimed)
		if err != nil {
			return claimed, runJob{}, true, fmt.Errorf("read claimed job: %w", err)
		}

		var job runJob
		if err := json.Unmarshal(b, &job); err != nil {
			return claimed, runJob{}, true, fmt.Errorf("invalid job payload: %w", err)
		}
		if strings.TrimSpace(job.RunID) == "" {
			return claimed, runJob{}, true, fmt.Errorf("invalid job payload: run_id missing")
		}
		if job.Overrides == nil {
			job.Overrides = map[string]any{}
		}
		return claimed, job, true, nil
	}

	return "", runJob{}, false, nil
}

func executeRun(a *app, client *http.Client, apiKey string, runpodCfg provisioner.Config, runID string, overrides map[string]any) {
	ctx := context.Background()

	get := func() (map[string]any, map[string]any, map[string]any, error) {
		a.mu.Lock()
		defer a.mu.Unlock()
		db := a.load()
		run, ok := db.Runs[runID]
		if !ok {
			return nil, nil, nil, fmt.Errorf("run %s not found", runID)
		}
		exp, ok := db.Experiments[asString(run["experiment_id"])]
		if !ok {
			return nil, nil, nil, fmt.Errorf("experiment %s not found", asString(run["experiment_id"]))
		}
		env, ok := db.Environments[asString(exp["env_id"])]
		if !ok {
			return nil, nil, nil, fmt.Errorf("environment %s not found", asString(exp["env_id"]))
		}
		return cloneMap(run), cloneMap(exp), cloneMap(env), nil
	}

	update := func(fields map[string]any) {
		a.mu.Lock()
		db := a.load()
		run := db.Runs[runID]
		if run != nil {
			for k, v := range fields {
				run[k] = v
			}
			db.Runs[runID] = run
			a.save(db)
		}
		a.mu.Unlock()
	}

	run, exp, env, err := get()
	if err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}

	gpuType := firstString(overrides["gpu_type"], env["gpu_type"])
	gpuCount := firstInt(overrides["gpu_count"], env["gpu_count"])
	volumeGB := firstInt(overrides["volume_gb"], env["volume_gb"])
	update(map[string]any{
		"status":              "queued",
		"effective_gpu_type":  gpuType,
		"effective_gpu_count": gpuCount,
		"effective_volume_gb": volumeGB,
	})

	podID := ""
	defer func() {
		if podID != "" {
			_, _ = provisioner.Terminate(ctx, client, apiKey, podID)
		}
	}()

	podID, err = provisioner.Launch(ctx, client, apiKey, runpodCfg, provisioner.LaunchRequest{
		EnvArtifacts: asString(env["artifacts"]),
		InputPath:    asString(exp["input"]),
		OutputPath:   asString(run["output"]),
		LogsPath:     asString(run["logs"]),
		GPUType:      gpuType,
		GPUCount:     gpuCount,
		VolumeGB:     volumeGB,
		Framework:    asString(env["framework"]),
		Version:      asString(env["version"]),
		RunID:        runID,
	})
	if err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	update(map[string]any{"status": "provisioning", "pod_id": podID})

	if _, err := provisioner.WaitRunning(ctx, client, apiKey, podID, 30*time.Minute); err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	update(map[string]any{"status": "running"})

	if _, err := provisioner.WaitCompletion(ctx, client, apiKey, podID, time.Hour); err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	update(map[string]any{"status": "completed"})
}

func loadProvisionerConfigFromEnv() (provisioner.Config, error) {
	require := func(key string) (string, error) {
		v := strings.TrimSpace(os.Getenv(key))
		if v == "" {
			return "", fmt.Errorf("%s is required", key)
		}
		return v, nil
	}

	dockerUser, err := require("DOCKER_USER")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Endpoint, err := require("R2_ENDPOINT")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Access, err := require("R2_ACCESS_KEY")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Secret, err := require("R2_SECRET_KEY")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Bucket, err := require("R2_BUCKET")
	if err != nil {
		return provisioner.Config{}, err
	}

	return provisioner.Config{
		DockerUser:  dockerUser,
		R2Endpoint:  r2Endpoint,
		R2AccessKey: r2Access,
		R2SecretKey: r2Secret,
		R2Bucket:    r2Bucket,
	}, nil
}

func (a *app) load() dbState {
	b, err := os.ReadFile(a.dbPath)
	if err != nil {
		return dbState{Environments: map[string]map[string]any{}, Experiments: map[string]map[string]any{}, Runs: map[string]map[string]any{}}
	}
	var db dbState
	if err := json.Unmarshal(b, &db); err != nil {
		return dbState{Environments: map[string]map[string]any{}, Experiments: map[string]map[string]any{}, Runs: map[string]map[string]any{}}
	}
	if db.Environments == nil {
		db.Environments = map[string]map[string]any{}
	}
	if db.Experiments == nil {
		db.Experiments = map[string]map[string]any{}
	}
	if db.Runs == nil {
		db.Runs = map[string]map[string]any{}
	}
	return db
}

func (a *app) save(db dbState) {
	b, _ := json.MarshalIndent(db, "", "  ")
	_ = os.WriteFile(a.dbPath, b, 0o644)
}

func cloneMap(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func asString(v any) string {
	s, ok := v.(string)
	if ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func asInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(t)
		return n
	default:
		return 0
	}
}

func firstString(values ...any) string {
	for _, v := range values {
		s := strings.TrimSpace(asString(v))
		if s != "" && s != "<nil>" {
			return s
		}
	}
	return ""
}

func firstInt(values ...any) int {
	for _, v := range values {
		n := asInt(v)
		if n > 0 {
			return n
		}
	}
	return 0
}

func shortID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(int64(os.Getpid()), 16)
	}
	return hex.EncodeToString(b)
}

func envOr(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func envDurationOr(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
