package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("failed to create stdout pipe: %v", err)
	}
	os.Stdout = w

	done := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		_, _ = io.Copy(&buf, r)
		done <- buf.String()
	}()

	defer func() {
		os.Stdout = oldStdout
		_ = r.Close()
	}()

	fn()

	_ = w.Close()
	return <-done
}

func TestTrainDetached_EndToEndPreflightAndRunCreation(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	runCreateCount := 0
	runWatchCount := 0
	var runCreatePayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs":
			mu.Lock()
			runCreateCount++
			mu.Unlock()

			if err := json.NewDecoder(r.Body).Decode(&runCreatePayload); err != nil {
				t.Fatalf("failed decoding run create payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-detached"})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-detached":
			mu.Lock()
			runWatchCount++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-detached", "status": "completed"})
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
		train([]string{"-d", "--gpu-type", "nvidia-a100", "--gpu-count", "2", "--volume-gb", "120"})
	})

	mock.mu.Lock()
	commitCount := mock.commitCount
	mock.mu.Unlock()
	if commitCount == 0 {
		t.Fatalf("expected preflight sync commit before run creation")
	}

	mu.Lock()
	defer mu.Unlock()
	if runCreateCount != 1 {
		t.Fatalf("expected one run create call, got %d", runCreateCount)
	}
	if runWatchCount != 0 {
		t.Fatalf("detached train should not monitor run status, got %d watch calls", runWatchCount)
	}
	if asString(runCreatePayload["gpu_type"]) != "nvidia-a100" {
		t.Fatalf("expected gpu_type override in run payload, got %v", runCreatePayload["gpu_type"])
	}
	if asInt64(runCreatePayload["gpu_count"]) != 2 {
		t.Fatalf("expected gpu_count=2 in run payload, got %v", runCreatePayload["gpu_count"])
	}
	if asInt64(runCreatePayload["volume_gb"]) != 120 {
		t.Fatalf("expected volume_gb=120 in run payload, got %v", runCreatePayload["volume_gb"])
	}

	if !strings.Contains(output, "sync complete") {
		t.Fatalf("expected sync completion status in output, got: %s", output)
	}
	if !strings.Contains(output, "run created: run-detached") {
		t.Fatalf("expected run summary in output, got: %s", output)
	}
	if !strings.Contains(output, server.URL+"/runs/run-detached") {
		t.Fatalf("expected dashboard URL in output, got: %s", output)
	}
}

func TestTrainAttached_MonitorsUntilCompletion(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	runCreateCount := 0
	runWatchCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs":
			mu.Lock()
			runCreateCount++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-attached"})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-attached":
			mu.Lock()
			runWatchCount++
			call := runWatchCount
			mu.Unlock()

			status := "running"
			if call >= 2 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-attached", "status": status})
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
		train(nil)
	})

	mu.Lock()
	defer mu.Unlock()
	if runCreateCount != 1 {
		t.Fatalf("expected one run create call, got %d", runCreateCount)
	}
	if runWatchCount < 2 {
		t.Fatalf("expected monitor loop to poll at least twice, got %d", runWatchCount)
	}

	if !strings.Contains(output, "Monitoring run lifecycle...") {
		t.Fatalf("expected monitoring UX copy in output, got: %s", output)
	}
	if !strings.Contains(output, "Status") || !strings.Contains(output, "completed") {
		t.Fatalf("expected completed status in output, got: %s", output)
	}
}

func TestCreateRunWithCapacityPrompt_NonInteractiveNoCapacityError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs" {
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"detail": "no gpu capacity currently available",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	t.Setenv("TERM", "dumb")

	_, err := createRunWithCapacityPrompt("/environments/env-test/runs", map[string]any{"gpu_type": "nvidia-h100"})
	if err == nil {
		t.Fatalf("expected no-capacity error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "no gpu capacity currently available") {
		t.Fatalf("unexpected error: %v", err)
	}
}
