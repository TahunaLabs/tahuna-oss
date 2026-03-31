package runtimeapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGetBootstrapPlanUsesRuntimeAuthAndPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		if r.URL.Path != "/api/runs/run_abc/runtime/bootstrap" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer token_123" {
			t.Fatalf("unexpected auth header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"run_id":"run_abc","contract_version":"0.1.0","workspace_root":"/workspace","command":["uv","run","--active","--no-sync","python","-u","train.py"],"code":{"manifest_hash":"c","entries":[]},"data":{"manifest_hash":null,"entries":[]}}`))
	}))
	defer server.Close()

	client := NewRun(server.URL, "run_abc", "token_123", 5*time.Second)
	plan, err := client.GetRunBootstrapPlan(context.Background())
	if err != nil {
		t.Fatalf("GetRunBootstrapPlan returned error: %v", err)
	}
	if plan.RunID != "run_abc" {
		t.Fatalf("expected run_abc, got %q", plan.RunID)
	}
	if got := strings.Join(plan.Command, " "); got != "uv run --active --no-sync python -u train.py" {
		t.Fatalf("unexpected bootstrap command: %q", got)
	}
}

func TestGetServeBootstrapPlanUsesServeRuntimePath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		if r.URL.Path != "/api/serves/serve_abc/runtime/bootstrap" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer token_123" {
			t.Fatalf("unexpected auth header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"serve_id":"serve_abc","contract_version":"serve.v1","environment_id":"env_123","workspace_root":"/workspace","model_root":"/workspace/model","output_dir":"outputs","logs_path":"serves/env/logs","command":["python","-u","inference.py"],"code":{"manifest_hash":"code","entries":[]},"data":{"manifest_hash":null,"entries":[]},"model":{"manifest_hash":"model","entries":[]},"python_version":"3.11","port":8000,"health_path":"/health","startup_timeout_seconds":900,"health_interval_seconds":5,"health_timeout_seconds":2,"health_failure_threshold":3,"graceful_shutdown_seconds":30}`))
	}))
	defer server.Close()

	client := NewServe(server.URL, "serve_abc", "token_123", 5*time.Second)
	plan, err := client.GetServeBootstrapPlan(context.Background())
	if err != nil {
		t.Fatalf("GetServeBootstrapPlan returned error: %v", err)
	}
	if plan.ServeID != "serve_abc" {
		t.Fatalf("expected serve_abc, got %q", plan.ServeID)
	}
	if plan.Model.ManifestHash != "model" {
		t.Fatalf("expected model manifest hash, got %q", plan.Model.ManifestHash)
	}
}

func TestEmitStatusReturnsErrorOnNonSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"detail":"runtime authentication required"}`))
	}))
	defer server.Close()

	client := NewRun(server.URL, "run_abc", "token_123", 5*time.Second)
	err := client.EmitStatus(context.Background(), StatusUpdate{
		Status:  StatusProvisioning,
		Message: "starting",
	})
	if err == nil {
		t.Fatal("expected error for unauthorized response")
	}
}
