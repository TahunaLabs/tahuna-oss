package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestRunCreateDetached_WithNamePayload(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	runCreateCount := 0
	runGetCount := 0
	var runCreatePayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs":
			mu.Lock()
			runCreateCount++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&runCreatePayload); err != nil {
				t.Fatalf("failed decoding run create payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id": "run-created",
				"name":   "warm-river-fox",
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-created":
			mu.Lock()
			runGetCount++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-created", "status": "completed"})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	t.Setenv("TAHUNA_BROWSER_URL", server.URL)
	t.Setenv("TERM", "dumb")

	output := captureStdout(t, func() {
		runCreate([]string{"-d", "-n", "warm-river-fox"})
	})

	mu.Lock()
	defer mu.Unlock()
	if runCreateCount != 1 {
		t.Fatalf("expected one run create call, got %d", runCreateCount)
	}
	if runGetCount != 0 {
		t.Fatalf("detached run create should not poll run status, got %d", runGetCount)
	}
	if got := strings.TrimSpace(asString(runCreatePayload["name"])); got != "warm-river-fox" {
		t.Fatalf("expected run create payload name=warm-river-fox, got %q", got)
	}
	if got := strings.TrimSpace(asString(runCreatePayload["output_dir"])); got != "outputs" {
		t.Fatalf("expected run create payload output_dir=outputs, got %q", got)
	}
	if !strings.Contains(output, "run created: warm-river-fox (run-created)") {
		t.Fatalf("expected run name and id in output, got: %s", output)
	}
}

func TestRunRename_ResolvesByNameAndPatches(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	renameCalls := 0
	var renamePayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-1", "name": "alpha-forest-fox"},
					{"run_id": "run-2", "name": "warm-river-fox"},
				},
			})
			return
		case r.Method == http.MethodPatch && r.URL.Path == "/api/runs/run-2":
			mu.Lock()
			renameCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&renamePayload); err != nil {
				t.Fatalf("failed decoding rename payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id": "run-2",
				"name":   "cool-meadow-wolf",
			})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	t.Setenv("TAHUNA_BROWSER_URL", server.URL)

	output := captureStdout(t, func() {
		runRename([]string{"warm-river-fox", "--name", "cool-meadow-wolf"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call for name resolution, got %d", listCalls)
	}
	if renameCalls != 1 {
		t.Fatalf("expected one rename call, got %d", renameCalls)
	}
	if got := strings.TrimSpace(asString(renamePayload["name"])); got != "cool-meadow-wolf" {
		t.Fatalf("expected rename payload name=cool-meadow-wolf, got %q", got)
	}
	if !strings.Contains(output, "run renamed: run-2 -> cool-meadow-wolf") {
		t.Fatalf("expected rename summary output, got: %s", output)
	}
}
