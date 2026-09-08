package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Mode string

const (
	ModeRun     Mode = "run"
	ModeServe   Mode = "serve"
	ModeSession Mode = "session"
)

type Config struct {
	Mode                 Mode
	RunID                string
	ServeID              string
	ComputeSessionID     string
	APIBase              string
	RuntimeToken         string
	WorkspaceRoot        string
	OutputDir            string
	RequestTimeoutSec    int
	CancellationGraceSec int
}

func LoadFromEnv() (Config, error) {
	requestTimeoutSec := 120
	rawRequestTimeout := strings.TrimSpace(os.Getenv("TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS"))
	if rawRequestTimeout != "" {
		parsed, err := strconv.Atoi(rawRequestTimeout)
		if err != nil || parsed <= 0 {
			return Config{}, fmt.Errorf("invalid TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS: %q", rawRequestTimeout)
		}
		requestTimeoutSec = parsed
	}

	cancellationGraceSec := 30
	rawCancellationGrace := strings.TrimSpace(os.Getenv("TAHUNA_CANCELLATION_GRACE_SECONDS"))
	if rawCancellationGrace != "" {
		parsed, err := strconv.Atoi(rawCancellationGrace)
		if err != nil || parsed <= 0 {
			return Config{}, fmt.Errorf("invalid TAHUNA_CANCELLATION_GRACE_SECONDS: %q", rawCancellationGrace)
		}
		cancellationGraceSec = parsed
	}

	runID := strings.TrimSpace(os.Getenv("TAHUNA_RUN_ID"))
	serveID := strings.TrimSpace(os.Getenv("TAHUNA_SERVE_ID"))
	computeSessionID := strings.TrimSpace(os.Getenv("TAHUNA_COMPUTE_SESSION_ID"))
	mode, err := resolveMode(runID, serveID, computeSessionID)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Mode:                 mode,
		RunID:                runID,
		ServeID:              serveID,
		ComputeSessionID:     computeSessionID,
		APIBase:              strings.TrimRight(strings.TrimSpace(os.Getenv("TAHUNA_API_BASE")), "/"),
		RuntimeToken:         strings.TrimSpace(os.Getenv("TAHUNA_RUNTIME_TOKEN")),
		WorkspaceRoot:        strings.TrimSpace(os.Getenv("TAHUNA_WORKSPACE_ROOT")),
		OutputDir:            strings.TrimSpace(os.Getenv("TAHUNA_OUTPUT_DIR")),
		RequestTimeoutSec:    requestTimeoutSec,
		CancellationGraceSec: cancellationGraceSec,
	}
	if cfg.WorkspaceRoot == "" {
		cfg.WorkspaceRoot = "/workspace"
	}
	if cfg.OutputDir == "" {
		cfg.OutputDir = "outputs"
	}
	if cfg.APIBase == "" || cfg.RuntimeToken == "" {
		return Config{}, fmt.Errorf("missing required env vars: TAHUNA_API_BASE / TAHUNA_RUNTIME_TOKEN")
	}
	return cfg, nil
}

func (c Config) RequestTimeout() time.Duration {
	return time.Duration(c.RequestTimeoutSec) * time.Second
}

func (c Config) ResourceID() string {
	if c.Mode == ModeServe {
		return c.ServeID
	}
	if c.Mode == ModeSession {
		return c.ComputeSessionID
	}
	return c.RunID
}

func resolveMode(runID, serveID, computeSessionID string) (Mode, error) {
	hasRunID := runID != ""
	hasServeID := serveID != ""
	hasComputeSessionID := computeSessionID != ""
	if hasRunID && (hasServeID || hasComputeSessionID) {
		return "", fmt.Errorf("exactly one runtime target is required: TAHUNA_RUN_ID, TAHUNA_SERVE_ID, or TAHUNA_COMPUTE_SESSION_ID")
	}
	if !hasRunID && !hasServeID && !hasComputeSessionID {
		return "", fmt.Errorf("exactly one runtime target is required: TAHUNA_RUN_ID, TAHUNA_SERVE_ID, or TAHUNA_COMPUTE_SESSION_ID")
	}
	if hasServeID {
		return ModeServe, nil
	}
	if hasComputeSessionID {
		return ModeSession, nil
	}
	return ModeRun, nil
}
