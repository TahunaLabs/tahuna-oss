package runtimeapi

import (
	"context"
	"net/http"
	"net/http/httptest"
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
		_, _ = w.Write([]byte(`{"run_id":"run_abc","contract_version":"0.1.0","workspace_root":"/workspace","code":{"manifest_hash":"c","entries":[]},"data":{"manifest_hash":null,"entries":[]}}`))
	}))
	defer server.Close()

	client := New(server.URL, "run_abc", "token_123", 5*time.Second)
	plan, err := client.GetBootstrapPlan(context.Background())
	if err != nil {
		t.Fatalf("GetBootstrapPlan returned error: %v", err)
	}
	if plan.RunID != "run_abc" {
		t.Fatalf("expected run_abc, got %q", plan.RunID)
	}
}

func TestEmitStatusReturnsErrorOnNonSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"detail":"runtime authentication required"}`))
	}))
	defer server.Close()

	client := New(server.URL, "run_abc", "token_123", 5*time.Second)
	err := client.EmitStatus(context.Background(), StatusUpdate{
		Status:  StatusProvisioning,
		Message: "starting",
	})
	if err == nil {
		t.Fatal("expected error for unauthorized response")
	}
}
