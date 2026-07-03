package config

import (
	"testing"
)

func TestLoadFromEnvDefaultsWorkspaceRoot(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "run_123")
	t.Setenv("TAHUNA_SERVE_ID", "")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com/")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")
	t.Setenv("TAHUNA_WORKSPACE_ROOT", "")
	t.Setenv("TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS", "")
	t.Setenv("TAHUNA_CANCELLATION_GRACE_SECONDS", "")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}

	if cfg.WorkspaceRoot != "/workspace" {
		t.Fatalf("expected /workspace, got %q", cfg.WorkspaceRoot)
	}
	if cfg.APIBase != "https://api.example.com" {
		t.Fatalf("expected trimmed API base, got %q", cfg.APIBase)
	}
	if cfg.RequestTimeoutSec != 120 {
		t.Fatalf("expected default request timeout 120, got %d", cfg.RequestTimeoutSec)
	}
	if cfg.CancellationGraceSec != 30 {
		t.Fatalf("expected default cancellation grace 30, got %d", cfg.CancellationGraceSec)
	}
	if cfg.Mode != ModeRun {
		t.Fatalf("expected run mode, got %q", cfg.Mode)
	}
}

func TestLoadFromEnvFailsWhenRequiredVarsMissing(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "")
	t.Setenv("TAHUNA_SERVE_ID", "")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "")
	t.Setenv("TAHUNA_API_BASE", "")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("expected error for missing required env vars")
	}
}

func TestLoadFromEnvSupportsRuntimeRequestTimeoutOverride(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "run_123")
	t.Setenv("TAHUNA_SERVE_ID", "")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")
	t.Setenv("TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS", "15")
	t.Setenv("TAHUNA_CANCELLATION_GRACE_SECONDS", "45")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.RequestTimeoutSec != 15 {
		t.Fatalf("expected request timeout 15, got %d", cfg.RequestTimeoutSec)
	}
	if cfg.CancellationGraceSec != 45 {
		t.Fatalf("expected cancellation grace 45, got %d", cfg.CancellationGraceSec)
	}
}

func TestLoadFromEnvSupportsServeMode(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "")
	t.Setenv("TAHUNA_SERVE_ID", "serve_123")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.Mode != ModeServe {
		t.Fatalf("expected serve mode, got %q", cfg.Mode)
	}
	if cfg.ResourceID() != "serve_123" {
		t.Fatalf("expected serve resource id, got %q", cfg.ResourceID())
	}
}

func TestLoadFromEnvSupportsServeModeWithComputeSessionID(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "")
	t.Setenv("TAHUNA_SERVE_ID", "serve_123")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "session_123")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.Mode != ModeServe {
		t.Fatalf("expected serve mode, got %q", cfg.Mode)
	}
	if cfg.ResourceID() != "serve_123" {
		t.Fatalf("expected serve resource id, got %q", cfg.ResourceID())
	}
	if cfg.ComputeSessionID != "session_123" {
		t.Fatalf("expected compute session id session_123, got %q", cfg.ComputeSessionID)
	}
}

func TestLoadFromEnvSupportsSessionMode(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "")
	t.Setenv("TAHUNA_SERVE_ID", "")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "session_123")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}
	if cfg.Mode != ModeSession {
		t.Fatalf("expected session mode, got %q", cfg.Mode)
	}
	if cfg.ResourceID() != "session_123" {
		t.Fatalf("expected session resource id, got %q", cfg.ResourceID())
	}
}

func TestLoadFromEnvRejectsMultipleTargets(t *testing.T) {
	t.Setenv("TAHUNA_RUN_ID", "run_123")
	t.Setenv("TAHUNA_SERVE_ID", "serve_123")
	t.Setenv("TAHUNA_COMPUTE_SESSION_ID", "")
	t.Setenv("TAHUNA_API_BASE", "https://api.example.com")
	t.Setenv("TAHUNA_RUNTIME_TOKEN", "secret")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("expected error when both runtime targets are set")
	}
}
