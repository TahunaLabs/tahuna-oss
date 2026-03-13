package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"warden/internal/config"
)

func TestRunnerTransitionsToFailedWhenStepsNotImplemented(t *testing.T) {
	statuses := []string{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer token_123" {
			t.Fatalf("unexpected auth header: %q", got)
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/runs/run_123/runtime/status":
			var payload struct {
				Status string `json:"status"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode status payload: %v", err)
			}
			statuses = append(statuses, payload.Status)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true,"status":"` + payload.Status + `"}`))
			return
		case r.Method == http.MethodPost && r.URL.Path == "/api/runs/run_123/runtime/logs":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true,"accepted":1}`))
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run_123/runtime/bootstrap":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"run_id":"run_123","contract_version":"0.1.0","workspace_root":"/workspace","code":{"manifest_hash":"abc","entries":[]},"data":{"manifest_hash":null,"entries":[]}}`))
			return
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	cfg := config.Config{
		RunID:             "run_123",
		APIBase:           server.URL,
		RuntimeToken:      "token_123",
		WorkspaceRoot:     "/workspace",
		RequestTimeoutSec: 30,
	}

	err := Run(context.Background(), cfg)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected ErrNotImplemented, got %v", err)
	}
	if len(statuses) != 2 {
		t.Fatalf("expected 2 status updates, got %d", len(statuses))
	}
	if statuses[0] != "provisioning" || statuses[1] != "failed" {
		t.Fatalf("unexpected statuses: %#v", statuses)
	}
}
