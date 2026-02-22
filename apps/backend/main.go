package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
)

const runTaskType = "runs:execute"

type ctxKey string

const userIDKey ctxKey = "user_id"

var gpus = []string{
	"NVIDIA GeForce RTX 4090",
	"NVIDIA GeForce RTX 4080",
	"NVIDIA GeForce RTX 4080 SUPER",
	"NVIDIA GeForce RTX 4070 Ti",
	"NVIDIA GeForce RTX 3090",
	"NVIDIA GeForce RTX 3090 Ti",
	"NVIDIA GeForce RTX 3080",
	"NVIDIA GeForce RTX 3080 Ti",
	"NVIDIA GeForce RTX 3070",
	"NVIDIA A100 80GB PCIe",
	"NVIDIA A100-SXM4-80GB",
	"NVIDIA A40",
	"NVIDIA A30",
	"NVIDIA L40",
	"NVIDIA L40S",
	"NVIDIA L4",
	"NVIDIA H100 80GB HBM3",
	"NVIDIA H100 PCIe",
	"NVIDIA H100 NVL",
	"NVIDIA H200",
	"NVIDIA H200 NVL",
	"NVIDIA RTX A6000",
	"NVIDIA RTX A5000",
	"NVIDIA RTX A4500",
	"NVIDIA RTX A4000",
	"NVIDIA RTX A2000",
	"NVIDIA RTX 6000 Ada Generation",
	"NVIDIA RTX 5000 Ada Generation",
	"NVIDIA RTX 4000 Ada Generation",
	"Tesla V100-SXM2-32GB",
	"Tesla V100-SXM2-16GB",
	"Tesla V100-PCIE-16GB",
}

type app struct {
	db              *sql.DB
	redis           *redis.Client
	asynqClient     *asynq.Client
	asynqInspector  *asynq.Inspector
	queueName       string
	authRequired    bool
	devUserID       string
	bootstrapSecret string
	sessionTTL      time.Duration
	sessionCookie   string
}

type environmentCreateRequest struct {
	Name      string `json:"name"`
	GPUType   string `json:"gpu_type"`
	GPUCount  int    `json:"gpu_count"`
	VolumeGB  int    `json:"volume_gb"`
	Framework string `json:"framework"`
	Version   string `json:"version"`
}

type experimentCreateRequest struct {
	Name string `json:"name"`
}

type runCreateRequest struct {
	GPUType  *string `json:"gpu_type"`
	GPUCount *int    `json:"gpu_count"`
	VolumeGB *int    `json:"volume_gb"`
}

type runTaskPayload struct {
	RunID     string         `json:"run_id"`
	UserID    string         `json:"user_id"`
	Overrides map[string]any `json:"overrides,omitempty"`
}

type bootstrapRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	OrgID string `json:"org_id"`
	Name  string `json:"name"`
}

func main() {
	ctx := context.Background()
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("ping db: %v", err)
	}
	if err := applyMigrations(ctx, db, "migrations"); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	redisAddr := envOr("REDIS_ADDR", "127.0.0.1:6379")
	redisClient := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DB:       envIntOr("REDIS_DB", 0),
	})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("redis ping failed: %v", err)
	}

	asynqRedis := asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DB:       envIntOr("REDIS_DB", 0),
	}

	a := &app{
		db:              db,
		redis:           redisClient,
		asynqClient:     asynq.NewClient(asynqRedis),
		asynqInspector:  asynq.NewInspector(asynqRedis),
		queueName:       envOr("TAHUNA_QUEUE_NAME", "runs"),
		authRequired:    envBoolOr("AUTH_REQUIRED", true),
		devUserID:       strings.TrimSpace(os.Getenv("DEV_USER_ID")),
		bootstrapSecret: strings.TrimSpace(os.Getenv("BOOTSTRAP_SECRET")),
		sessionTTL:      envDurationOr("SESSION_TTL", 7*24*time.Hour),
		sessionCookie:   envOr("SESSION_COOKIE_NAME", "tahuna_session"),
	}
	defer a.asynqClient.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.health)
	mux.HandleFunc("POST /auth/bootstrap", a.bootstrap)
	mux.HandleFunc("POST /auth/sessions", a.createSession)
	mux.HandleFunc("DELETE /auth/sessions", a.deleteSession)
	mux.HandleFunc("GET /auth/me", a.withAuth(a.me))

	mux.HandleFunc("GET /catalog", a.withAuth(a.catalog))
	mux.HandleFunc("POST /environments", a.withAuth(a.createEnvironment))
	mux.HandleFunc("GET /environments", a.withAuth(a.listEnvironments))
	mux.HandleFunc("GET /environments/{environment_id}", a.withAuth(a.getEnvironment))
	mux.HandleFunc("DELETE /environments/{environment_id}", a.withAuth(a.deleteEnvironment))
	mux.HandleFunc("POST /environments/{environment_id}/experiments", a.withAuth(a.createExperiment))
	mux.HandleFunc("GET /experiments", a.withAuth(a.listExperiments))
	mux.HandleFunc("GET /experiments/{experiment_id}", a.withAuth(a.getExperiment))
	mux.HandleFunc("DELETE /experiments/{experiment_id}", a.withAuth(a.deleteExperiment))
	mux.HandleFunc("POST /experiments/{experiment_id}/runs", a.withAuth(a.createRun))
	mux.HandleFunc("GET /runs", a.withAuth(a.listRuns))
	mux.HandleFunc("GET /runs/{run_id}", a.withAuth(a.getRun))
	mux.HandleFunc("GET /runs/{run_id}/logs", a.withAuth(a.getRunLogs))
	mux.HandleFunc("DELETE /runs/{run_id}", a.withAuth(a.deleteRun))

	port := envOr("PORT", "8000")
	log.Printf("backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (a *app) bootstrap(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(a.bootstrapSecret) == "" {
		writeErr(w, 404, "bootstrap is disabled")
		return
	}
	if r.Header.Get("X-Bootstrap-Secret") != a.bootstrapSecret {
		writeErr(w, 401, "invalid bootstrap secret")
		return
	}

	var req bootstrapRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeErr(w, 400, "email is required")
		return
	}
	if req.Role == "" {
		req.Role = "user"
	}
	if req.Name == "" {
		req.Name = "bootstrap"
	}

	ctx := r.Context()
	userID, err := a.ensureUser(ctx, req.Email, req.Role, req.OrgID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	plainKey := "tk_" + longID()
	keyHash := sha256Hex(plainKey)
	apiKeyID := shortID()
	_, err = a.db.ExecContext(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash)
		VALUES ($1, $2, $3, $4)
	`, apiKeyID, userID, req.Name, keyHash)
	if err != nil {
		writeErr(w, 500, "failed to create api key")
		return
	}

	writeJSON(w, 200, map[string]any{
		"user_id":    userID,
		"api_key":    plainKey,
		"api_key_id": apiKeyID,
	})
}

func (a *app) createSession(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := a.authenticate(r)
	if !ok {
		writeErr(w, 401, "authentication required")
		return
	}

	sid := "sess_" + longID()
	key := "session:" + sid
	if err := a.redis.Set(r.Context(), key, userID, a.sessionTTL).Err(); err != nil {
		writeErr(w, 500, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     a.sessionCookie,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		Secure:   envBoolOr("COOKIE_SECURE", false),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(a.sessionTTL.Seconds()),
	})

	writeJSON(w, 200, map[string]any{"session_id": sid, "user_id": userID})
}

func (a *app) deleteSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(a.sessionCookie)
	if err == nil && cookie.Value != "" {
		_ = a.redis.Del(r.Context(), "session:"+cookie.Value).Err()
	}
	http.SetCookie(w, &http.Cookie{Name: a.sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	writeJSON(w, 200, map[string]any{"deleted": true})
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	userID := authUserID(r)
	var email, role string
	var orgID sql.NullString
	err := a.db.QueryRowContext(r.Context(), `SELECT email, role, org_id FROM users WHERE id = $1`, userID).Scan(&email, &role, &orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "user not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"user_id": userID,
		"email":   email,
		"role":    role,
		"org_id":  orgID.String,
	})
}

func (a *app) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, ok := a.authenticate(r)
		if !ok {
			writeErr(w, 401, "authentication required")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next(w, r.WithContext(ctx))
	}
}

func (a *app) authenticate(r *http.Request) (string, string, bool) {
	ctx := r.Context()

	if cookie, err := r.Cookie(a.sessionCookie); err == nil && cookie.Value != "" {
		if uid, err := a.redis.Get(ctx, "session:"+cookie.Value).Result(); err == nil && uid != "" {
			return uid, "session", true
		}
	}

	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authz), "bearer ") {
		token := strings.TrimSpace(authz[len("Bearer "):])
		if token != "" {
			hash := sha256Hex(token)
			var userID string
			err := a.db.QueryRowContext(ctx, `
				SELECT user_id FROM api_keys
				WHERE key_hash = $1 AND revoked_at IS NULL
			`, hash).Scan(&userID)
			if err == nil && userID != "" {
				_, _ = a.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, hash)
				return userID, "api_key", true
			}
		}
	}

	if !a.authRequired && a.devUserID != "" {
		return a.devUserID, "dev", true
	}

	return "", "", false
}

func authUserID(r *http.Request) string {
	v, _ := r.Context().Value(userIDKey).(string)
	return v
}

func (a *app) catalog(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cacheKey := "catalog:mvp"
	if raw, err := a.redis.Get(ctx, cacheKey).Bytes(); err == nil && len(raw) > 0 {
		var cached map[string]any
		if json.Unmarshal(raw, &cached) == nil {
			writeJSON(w, 200, cached)
			return
		}
	}

	images, err := getImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	resp := map[string]any{"gpus": gpus, "images": images}
	if payload, err := json.Marshal(resp); err == nil {
		_ = a.redis.Set(ctx, cacheKey, payload, 2*time.Minute).Err()
	}
	writeJSON(w, 200, resp)
}

func (a *app) createEnvironment(w http.ResponseWriter, r *http.Request) {
	var req environmentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Name == "" || req.GPUType == "" || req.Framework == "" || req.Version == "" || req.GPUCount < 1 || req.VolumeGB < 1 {
		writeErr(w, 400, "invalid environment payload")
		return
	}
	if !contains(gpus, req.GPUType) {
		writeErr(w, 400, "Unsupported GPU type: "+req.GPUType)
		return
	}
	images, err := getImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	versions, ok := images[req.Framework]
	if !ok {
		writeErr(w, 400, "Unsupported framework: "+req.Framework)
		return
	}
	if _, ok := versions[req.Version]; !ok {
		writeErr(w, 400, "Unsupported version for framework "+req.Framework+": "+req.Version)
		return
	}

	envID := shortID()
	userID := authUserID(r)
	artifacts := "environments/" + envID + "/artifacts"
	_, err = a.db.ExecContext(r.Context(), `
		INSERT INTO environments (id, user_id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, envID, userID, req.Name, artifacts, req.GPUType, req.GPUCount, req.VolumeGB, req.Framework, req.Version)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]any{
		"environment_id": envID,
		"name":           req.Name,
		"artifacts":      artifacts,
		"gpu_type":       req.GPUType,
		"gpu_count":      req.GPUCount,
		"volume_gb":      req.VolumeGB,
		"framework":      req.Framework,
		"version":        req.Version,
	})
}

func (a *app) listEnvironments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, name, artifacts, gpuType, framework, version string
		var gpuCount, volumeGB int
		if err := rows.Scan(&id, &name, &artifacts, &gpuType, &gpuCount, &volumeGB, &framework, &version); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"environment_id": id,
			"name":           name,
			"artifacts":      artifacts,
			"gpu_type":       gpuType,
			"gpu_count":      gpuCount,
			"volume_gb":      volumeGB,
			"framework":      framework,
			"version":        version,
		})
	}
	writeJSON(w, 200, map[string]any{"environments": out})
}

func (a *app) getEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	var name, artifacts, gpuType, framework, version string
	var gpuCount, volumeGB int
	err := a.db.QueryRowContext(r.Context(), `
		SELECT name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE id = $1 AND user_id = $2
	`, id, authUserID(r)).Scan(&name, &artifacts, &gpuType, &gpuCount, &volumeGB, &framework, &version)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Environment "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"environment_id": id,
		"name":           name,
		"artifacts":      artifacts,
		"gpu_type":       gpuType,
		"gpu_count":      gpuCount,
		"volume_gb":      volumeGB,
		"framework":      framework,
		"version":        version,
	})
}

func (a *app) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	ctx := r.Context()
	uid := authUserID(r)

	var hasExp bool
	if err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM experiments WHERE environment_id = $1 AND user_id = $2)`, id, uid).Scan(&hasExp); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if hasExp {
		writeErr(w, 409, "Environment "+id+" still has experiments; delete them first")
		return
	}

	res, err := a.db.ExecContext(ctx, `DELETE FROM environments WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, 404, "Environment "+id+" not found")
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "environment_id": id})
}

func (a *app) createExperiment(w http.ResponseWriter, r *http.Request) {
	envID := r.PathValue("environment_id")
	var req experimentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Name == "" {
		writeErr(w, 400, "name is required")
		return
	}
	uid := authUserID(r)
	var exists bool
	if err := a.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM environments WHERE id = $1 AND user_id = $2)`, envID, uid).Scan(&exists); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if !exists {
		writeErr(w, 404, "Environment "+envID+" not found")
		return
	}

	expID := shortID()
	input := "experiments/" + expID + "/input"
	_, err := a.db.ExecContext(r.Context(), `
		INSERT INTO experiments (id, user_id, environment_id, name, input)
		VALUES ($1,$2,$3,$4,$5)
	`, expID, uid, envID, req.Name, input)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"experiment_id": expID, "name": req.Name, "env_id": envID, "input": input})
}

func (a *app) listExperiments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, environment_id, input FROM experiments
		WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, name, envID, input string
		if err := rows.Scan(&id, &name, &envID, &input); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{"experiment_id": id, "name": name, "env_id": envID, "input": input})
	}
	writeJSON(w, 200, map[string]any{"experiments": out})
}

func (a *app) getExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	var name, envID, input string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT name, environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, id, authUserID(r)).Scan(&name, &envID, &input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Experiment "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"experiment_id": id, "name": name, "env_id": envID, "input": input})
}

func (a *app) deleteExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	uid := authUserID(r)
	ctx := r.Context()

	var hasRuns bool
	if err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM runs WHERE experiment_id = $1 AND user_id = $2)`, id, uid).Scan(&hasRuns); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if hasRuns {
		writeErr(w, 409, "Experiment "+id+" still has runs; delete them first")
		return
	}

	res, err := a.db.ExecContext(ctx, `DELETE FROM experiments WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, 404, "Experiment "+id+" not found")
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "experiment_id": id})
}

func (a *app) createRun(w http.ResponseWriter, r *http.Request) {
	experimentID := r.PathValue("experiment_id")
	var req runCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.GPUCount != nil && *req.GPUCount < 1 {
		writeErr(w, 400, "gpu_count must be >= 1")
		return
	}
	if req.VolumeGB != nil && *req.VolumeGB < 1 {
		writeErr(w, 400, "volume_gb must be >= 1")
		return
	}
	uid := authUserID(r)

	var envID, input string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, experimentID, uid).Scan(&envID, &input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Experiment "+experimentID+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}

	runID := shortID()
	output := "runs/" + runID + "/output"
	logsPath := "runs/" + runID + "/logs"
	_, err = a.db.ExecContext(r.Context(), `
		INSERT INTO runs (id, user_id, environment_id, experiment_id, input, output, logs, status, cancellation_requested)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',FALSE)
	`, runID, uid, envID, experimentID, input, output, logsPath)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	overrides := map[string]any{}
	if req.GPUType != nil {
		overrides["gpu_type"] = *req.GPUType
	}
	if req.GPUCount != nil {
		overrides["gpu_count"] = *req.GPUCount
	}
	if req.VolumeGB != nil {
		overrides["volume_gb"] = *req.VolumeGB
	}

	payload, _ := json.Marshal(runTaskPayload{RunID: runID, UserID: uid, Overrides: overrides})
	task := asynq.NewTask(runTaskType, payload, asynq.Queue(a.queueName), asynq.Timeout(2*time.Hour))
	taskInfo, err := a.asynqClient.Enqueue(task, asynq.MaxRetry(10), asynq.ProcessIn(0))
	if err != nil {
		_, _ = a.db.ExecContext(r.Context(), `UPDATE runs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`, runID, "failed to enqueue run: "+err.Error())
		writeErr(w, 500, "failed to enqueue run")
		return
	}
	_, _ = a.db.ExecContext(r.Context(), `UPDATE runs SET task_id = $2, updated_at = NOW() WHERE id = $1`, runID, taskInfo.ID)

	writeJSON(w, 200, map[string]any{
		"run_id":        runID,
		"env_id":        envID,
		"experiment_id": experimentID,
		"input":         input,
		"output":        output,
		"logs":          logsPath,
		"status":        "queued",
	})
}

func (a *app) listRuns(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, envID, expID, input, output, logsPath, status, errMsg, podID, gpuType string
		var gpuCount, volumeGB int
		var cancellationRequested bool
		if err := rows.Scan(&id, &envID, &expID, &input, &output, &logsPath, &status, &errMsg, &podID, &gpuType, &gpuCount, &volumeGB, &cancellationRequested); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"run_id":                 id,
			"env_id":                 envID,
			"experiment_id":          expID,
			"input":                  input,
			"output":                 output,
			"logs":                   logsPath,
			"status":                 status,
			"error":                  errMsg,
			"pod_id":                 podID,
			"effective_gpu_type":     gpuType,
			"effective_gpu_count":    gpuCount,
			"effective_volume_gb":    volumeGB,
			"cancellation_requested": cancellationRequested,
		})
	}
	writeJSON(w, 200, map[string]any{"runs": out})
}

func (a *app) getRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	row := a.db.QueryRowContext(r.Context(), `
		SELECT environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE id = $1 AND user_id = $2
	`, id, authUserID(r))
	var envID, expID, input, output, logsPath, status, errMsg, podID, gpuType string
	var gpuCount, volumeGB int
	var cancellationRequested bool
	if err := row.Scan(&envID, &expID, &input, &output, &logsPath, &status, &errMsg, &podID, &gpuType, &gpuCount, &volumeGB, &cancellationRequested); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"run_id":                 id,
		"env_id":                 envID,
		"experiment_id":          expID,
		"input":                  input,
		"output":                 output,
		"logs":                   logsPath,
		"status":                 status,
		"error":                  errMsg,
		"pod_id":                 podID,
		"effective_gpu_type":     gpuType,
		"effective_gpu_count":    gpuCount,
		"effective_volume_gb":    volumeGB,
		"cancellation_requested": cancellationRequested,
	})
}

func (a *app) getRunLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	var logsPath string
	err := a.db.QueryRowContext(r.Context(), `SELECT logs FROM runs WHERE id = $1 AND user_id = $2`, id, authUserID(r)).Scan(&logsPath)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"run_id":    id,
		"logs_path": logsPath,
		"log_file":  logsPath + "/run.log",
		"note":      "Logs are uploaded by the training pod into R2.",
	})
}

func (a *app) deleteRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	uid := authUserID(r)
	var status, podID, taskID string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT status, COALESCE(pod_id,''), COALESCE(task_id,'')
		FROM runs WHERE id = $1 AND user_id = $2
	`, id, uid).Scan(&status, &podID, &taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	if status == "queued" || status == "provisioning" || status == "running" || status == "cancelling" {
		_, _ = a.db.ExecContext(r.Context(), `
			UPDATE runs
			SET cancellation_requested = TRUE, status = 'cancelling', updated_at = NOW()
			WHERE id = $1 AND user_id = $2
		`, id, uid)
		if taskID != "" {
			_ = a.asynqInspector.DeleteTask(a.queueName, taskID)
		}
		if taskID != "" && podID == "" {
			_, _ = a.db.ExecContext(r.Context(), `
				UPDATE runs
				SET status = 'cancelled', cancellation_requested = TRUE, updated_at = NOW()
				WHERE id = $1 AND user_id = $2
			`, id, uid)
		}
		writeJSON(w, 202, map[string]any{"cancel_requested": true, "run_id": id})
		return
	}
	_, err = a.db.ExecContext(r.Context(), `DELETE FROM runs WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "run_id": id})
}

func (a *app) ensureUser(ctx context.Context, email, role, orgID string) (string, error) {
	var userID string
	err := a.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err == nil {
		return userID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	userID = shortID()
	_, err = a.db.ExecContext(ctx, `
		INSERT INTO users (id, email, role, org_id)
		VALUES ($1,$2,$3,$4)
	`, userID, email, role, nullIfEmpty(orgID))
	if err != nil {
		return "", err
	}
	return userID, nil
}

func applyMigrations(ctx context.Context, db *sql.DB, dir string) error {
	if _, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	files := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)

	for _, name := range files {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}

		path := filepath.Join(dir, name)
		sqlBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func getImages() (map[string]map[string]string, error) {
	user := strings.TrimSpace(os.Getenv("DOCKER_USER"))
	if user == "" {
		user = "local"
	}
	path := filepath.Join("templates", "images.json")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var base map[string]map[string]string
	if err := json.Unmarshal(b, &base); err != nil {
		return nil, err
	}
	out := make(map[string]map[string]string, len(base))
	for fw, versions := range base {
		out[fw] = map[string]string{}
		for version := range versions {
			out[fw][version] = fmt.Sprintf("%s/tahuna:%s-%s", user, fw, version)
		}
	}
	return out, nil
}

func decodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dest); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"detail": msg})
}

func contains(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}

func shortID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b)
}

func longID() string {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b)
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
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

func envBoolOr(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
}

func nullIfEmpty(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}
