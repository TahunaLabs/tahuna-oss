package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	RunID                string
	APIBase              string
	RuntimeToken         string
	WorkspaceRoot        string
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

	cfg := Config{
		RunID:                strings.TrimSpace(os.Getenv("TAHUNA_RUN_ID")),
		APIBase:              strings.TrimRight(strings.TrimSpace(os.Getenv("TAHUNA_API_BASE")), "/"),
		RuntimeToken:         strings.TrimSpace(os.Getenv("TAHUNA_RUNTIME_TOKEN")),
		WorkspaceRoot:        strings.TrimSpace(os.Getenv("TAHUNA_WORKSPACE_ROOT")),
		RequestTimeoutSec:    requestTimeoutSec,
		CancellationGraceSec: cancellationGraceSec,
	}
	if cfg.WorkspaceRoot == "" {
		cfg.WorkspaceRoot = "/workspace"
	}
	if cfg.RunID == "" || cfg.APIBase == "" || cfg.RuntimeToken == "" {
		return Config{}, fmt.Errorf("missing required env vars: TAHUNA_RUN_ID / TAHUNA_API_BASE / TAHUNA_RUNTIME_TOKEN")
	}
	return cfg, nil
}

func (c Config) RequestTimeout() time.Duration {
	return time.Duration(c.RequestTimeoutSec) * time.Second
}
