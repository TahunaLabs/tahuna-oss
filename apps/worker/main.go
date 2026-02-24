package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	_ "github.com/jackc/pgx/v5/stdlib"
	"tahuna-provisioner/pkg/provisioner"
)

const runTaskType = "runs:execute"

type app struct {
	db     *sql.DB
	client *http.Client
	apiKey string
	cfg    provisioner.Config
}

type runTaskPayload struct {
	RunID     string         `json:"run_id"`
	UserID    string         `json:"user_id"`
	Overrides map[string]any `json:"overrides,omitempty"`
}

func main() {
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	if err := db.PingContext(context.Background()); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	apiKey := strings.TrimSpace(os.Getenv("RUNPOD_API_KEY"))
	if apiKey == "" {
		log.Fatal("RUNPOD_API_KEY is required")
	}
	cfg, err := loadProvisionerConfigFromEnv()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	redisAddr := envOr("REDIS_ADDR", "127.0.0.1:6379")
	redisOpt := asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DB:       envIntOr("REDIS_DB", 0),
	}
	queueName := envOr("TAHUNA_QUEUE_NAME", "runs")
	concurrency := envIntOr("WORKER_CONCURRENCY", 10)

	a := &app{
		db:     db,
		client: &http.Client{Timeout: 60 * time.Second},
		apiKey: apiKey,
		cfg:    cfg,
	}

	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: concurrency,
		Queues: map[string]int{
			queueName: 10,
		},
	})
	mux := asynq.NewServeMux()
	mux.HandleFunc(runTaskType, a.handleRunTask)

	log.Printf("worker started (queue=%s, concurrency=%d)", queueName, concurrency)
	if err := srv.Run(mux); err != nil {
		log.Fatalf("worker stopped: %v", err)
	}
}

func (a *app) handleRunTask(ctx context.Context, t *asynq.Task) error {
	var payload runTaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("invalid payload: %w", err)
	}
	if strings.TrimSpace(payload.RunID) == "" || strings.TrimSpace(payload.UserID) == "" {
		return errors.New("invalid payload: run_id and user_id are required")
	}
	if payload.Overrides == nil {
		payload.Overrides = map[string]any{}
	}
	if cancelled, err := a.isCancellationRequested(ctx, payload.RunID, payload.UserID); err == nil && cancelled {
		_ = a.markCancelled(ctx, payload.RunID, "run cancelled before execution")
		return nil
	}

	run, env, err := a.getRunContext(ctx, payload.RunID, payload.UserID)
	if err != nil {
		_ = a.failRun(ctx, payload.RunID, err)
		return err
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	stopWatcher := make(chan struct{})
	go a.watchCancellation(runCtx, payload.RunID, payload.UserID, cancel, stopWatcher)
	defer close(stopWatcher)

	gpuType := firstString(payload.Overrides["gpu_type"], env["gpu_type"])
	gpuCount := firstInt(payload.Overrides["gpu_count"], env["gpu_count"])
	volumeGB := firstInt(payload.Overrides["volume_gb"], env["volume_gb"])
	_ = a.updateRun(ctx, payload.RunID, map[string]any{
		"status":              "queued",
		"effective_gpu_type":  gpuType,
		"effective_gpu_count": gpuCount,
		"effective_volume_gb": volumeGB,
	})
	_ = a.addRunEvent(ctx, payload.RunID, "queued", "run queued for execution", map[string]any{"gpu_type": gpuType, "gpu_count": gpuCount, "volume_gb": volumeGB})

	podID := ""
	defer func() {
		if podID != "" {
			termCtx, termCancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer termCancel()
			_, _ = provisioner.Terminate(termCtx, a.client, a.apiKey, podID)
		}
	}()
	if cancelled, err := a.isCancellationRequested(ctx, payload.RunID, payload.UserID); err == nil && cancelled {
		_ = a.markCancelled(ctx, payload.RunID, "run cancelled before launch")
		return nil
	}

	podID, err = provisioner.Launch(runCtx, a.client, a.apiKey, a.cfg, provisioner.LaunchRequest{
		EnvArtifacts: asString(env["artifacts"]),
		InputPath:    asString(run["input"]),
		OutputPath:   asString(run["output"]),
		LogsPath:     asString(run["logs"]),
		GPUType:      gpuType,
		GPUCount:     gpuCount,
		VolumeGB:     volumeGB,
		Framework:    asString(env["framework"]),
		Version:      asString(env["version"]),
		RunID:        payload.RunID,
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			if cancelled, cErr := a.isCancellationRequested(context.Background(), payload.RunID, payload.UserID); cErr == nil && cancelled {
				_ = a.markCancelled(context.Background(), payload.RunID, "run cancelled during launch")
				return nil
			}
		}
		_ = a.failRun(ctx, payload.RunID, err)
		return err
	}
	_ = a.updateRun(ctx, payload.RunID, map[string]any{"status": "provisioning", "pod_id": podID})
	_ = a.addRunEvent(ctx, payload.RunID, "provisioning", "pod launched", map[string]any{"pod_id": podID})

	if _, err := provisioner.WaitRunning(runCtx, a.client, a.apiKey, podID, 30*time.Minute); err != nil {
		if errors.Is(err, context.Canceled) {
			if cancelled, cErr := a.isCancellationRequested(context.Background(), payload.RunID, payload.UserID); cErr == nil && cancelled {
				_ = a.markCancelled(context.Background(), payload.RunID, "run cancelled while provisioning")
				return nil
			}
		}
		_ = a.failRun(ctx, payload.RunID, err)
		return err
	}
	_ = a.updateRun(ctx, payload.RunID, map[string]any{"status": "running"})
	_ = a.addRunEvent(ctx, payload.RunID, "running", "pod running", nil)

	if _, err := provisioner.WaitCompletion(runCtx, a.client, a.apiKey, podID, time.Hour); err != nil {
		if errors.Is(err, context.Canceled) {
			if cancelled, cErr := a.isCancellationRequested(context.Background(), payload.RunID, payload.UserID); cErr == nil && cancelled {
				_ = a.markCancelled(context.Background(), payload.RunID, "run cancelled while running")
				return nil
			}
		}
		_ = a.failRun(ctx, payload.RunID, err)
		return err
	}
	_ = a.updateRun(ctx, payload.RunID, map[string]any{"status": "completed", "error": nil})
	_ = a.addRunEvent(ctx, payload.RunID, "completed", "run completed", nil)
	return nil
}

func (a *app) getRunContext(ctx context.Context, runID, userID string) (map[string]any, map[string]any, error) {
	var run = map[string]any{}
	var env = map[string]any{}

	var input, output, logsPath, envID string
	err := a.db.QueryRowContext(ctx, `
		SELECT input, output, logs, environment_id
		FROM runs WHERE id = $1 AND user_id = $2
	`, runID, userID).Scan(&input, &output, &logsPath, &envID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, fmt.Errorf("run %s not found", runID)
		}
		return nil, nil, err
	}
	run["input"] = input
	run["output"] = output
	run["logs"] = logsPath
	run["env_id"] = envID

	var artifacts, gpuType, framework, version string
	var gpuCount, volumeGB int
	err = a.db.QueryRowContext(ctx, `
		SELECT artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE id = $1 AND user_id = $2
	`, envID, userID).Scan(&artifacts, &gpuType, &gpuCount, &volumeGB, &framework, &version)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, fmt.Errorf("environment %s not found", envID)
		}
		return nil, nil, err
	}
	env["artifacts"] = artifacts
	env["gpu_type"] = gpuType
	env["gpu_count"] = gpuCount
	env["volume_gb"] = volumeGB
	env["framework"] = framework
	env["version"] = version

	return run, env, nil
}

func (a *app) updateRun(ctx context.Context, runID string, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}

	allowed := map[string]bool{
		"status":                 true,
		"error":                  true,
		"pod_id":                 true,
		"effective_gpu_type":     true,
		"effective_gpu_count":    true,
		"effective_volume_gb":    true,
		"cancellation_requested": true,
	}

	sets := make([]string, 0, len(fields)+1)
	args := make([]any, 0, len(fields)+1)
	i := 1
	for k, v := range fields {
		if !allowed[k] {
			continue
		}
		sets = append(sets, fmt.Sprintf("%s = $%d", k, i))
		args = append(args, v)
		i++
	}
	if len(sets) == 0 {
		return nil
	}
	sets = append(sets, "updated_at = NOW()")
	args = append(args, runID)
	query := fmt.Sprintf("UPDATE runs SET %s WHERE id = $%d", strings.Join(sets, ", "), len(args))
	_, err := a.db.ExecContext(ctx, query, args...)
	return err
}

func (a *app) failRun(ctx context.Context, runID string, err error) error {
	_ = a.addRunEvent(ctx, runID, "failed", err.Error(), nil)
	return a.updateRun(ctx, runID, map[string]any{"status": "failed", "error": err.Error()})
}

func (a *app) markCancelled(ctx context.Context, runID, message string) error {
	_ = a.addRunEvent(ctx, runID, "cancelled", message, nil)
	return a.updateRun(ctx, runID, map[string]any{
		"status":                 "cancelled",
		"error":                  nil,
		"cancellation_requested": true,
	})
}

func (a *app) isCancellationRequested(ctx context.Context, runID, userID string) (bool, error) {
	var cancelRequested bool
	err := a.db.QueryRowContext(ctx, `
		SELECT cancellation_requested
		FROM runs WHERE id = $1 AND user_id = $2
	`, runID, userID).Scan(&cancelRequested)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return cancelRequested, nil
}

func (a *app) watchCancellation(ctx context.Context, runID, userID string, cancel context.CancelFunc, stop <-chan struct{}) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-ticker.C:
			cancelled, err := a.isCancellationRequested(context.Background(), runID, userID)
			if err != nil {
				continue
			}
			if cancelled {
				cancel()
				return
			}
		}
	}
}

func (a *app) addRunEvent(ctx context.Context, runID, eventType, message string, payload map[string]any) error {
	var raw any
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		raw = b
	}
	_, err := a.db.ExecContext(ctx, `
		INSERT INTO run_events (run_id, event_type, message, payload)
		VALUES ($1,$2,$3,$4)
	`, runID, eventType, message, raw)
	return err
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
		DockerUser:       dockerUser,
		R2Endpoint:       r2Endpoint,
		R2AccessKey:      r2Access,
		R2SecretKey:      r2Secret,
		R2Bucket:         r2Bucket,
		ContainerDiskGB:  envIntOr("CONTAINER_DISK_GB", 0),
		VolumeMountPath:  envOr("VOLUME_MOUNT_PATH", ""),
		StartSSH:         envBoolOr("START_SSH", true),
		WaitRunTimeout:   envDurationOr("WAIT_RUN_TIMEOUT", 0),
		WaitCompTimeout:  envDurationOr("WAIT_COMP_TIMEOUT", 0),
		PollRunInterval:  envDurationOr("POLL_RUN_INTERVAL", 0),
		PollCompInterval: envDurationOr("POLL_COMP_INTERVAL", 0),
	}, nil
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
		return strconv.FormatInt(time.Now().UnixNano(), 16)
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

func envIntOr(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envBoolOr(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
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
