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
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
)

type app struct {
	db             *sql.DB
	redis          *redis.Client
	asynqClient    *asynq.Client
	asynqInspector *asynq.Inspector
	queueName      string
	authRequired   bool
	devUserID      string
	sessionTTL     time.Duration
	sessionCookie  string

	authSvc        *authService
	environmentSvc *environmentService
	runSvc         *runService
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

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
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("redis ping failed: %v", err)
	}

	asynqRedis := asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DB:       envIntOr("REDIS_DB", 0),
	}

	queueName := envOr("TAHUNA_QUEUE_NAME", "runs")
	asynqClient := asynq.NewClient(asynqRedis)
	defer asynqClient.Close()
	asynqInspector := asynq.NewInspector(asynqRedis)

	a := &app{
		db:             db,
		redis:          redisClient,
		asynqClient:    asynqClient,
		asynqInspector: asynqInspector,
		queueName:      queueName,
		authRequired:   envBoolOr("AUTH_REQUIRED", true),
		devUserID:      strings.TrimSpace(os.Getenv("DEV_USER_ID")),
		sessionTTL:     envDurationOr("SESSION_TTL", 7*24*time.Hour),
		sessionCookie:  envOr("SESSION_COOKIE_NAME", "tahuna_session"),
	}
	a.authSvc = newAuthService(db, redisClient)
	a.environmentSvc = newEnvironmentService(db, redisClient)
	a.runSvc = newRunService(db, asynqClient, asynqInspector, queueName)

	mux := a.routes()
	port := envOr("PORT", "8000")
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("backend listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("server shutdown failed: %v", err)
		}
	case err := <-errCh:
		log.Fatalf("server failed: %v", err)
	}
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, healthResponse{Status: "ok"})
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
