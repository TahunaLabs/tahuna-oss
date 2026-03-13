package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRunLogs_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/runs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-123", "name": "run-123"},
				},
			})
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-123/logs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":    "run-123",
				"logs_path": "runs/env-1/123/logs",
				"log_file":  "runs/env-1/123/logs/run.log",
				"note":      "Runtime logs/metrics are streamed by the pod and persisted in Convex.",
				"recent_logs": []map[string]any{
					{
						"timestamp": 1773159537484,
						"level":     "info",
						"source":    "train",
						"message":   "epoch=1 train_loss=0.1688 val_loss=0.0546 val_acc=0.9811",
					},
					{
						"timestamp": 1773159748712,
						"level":     "info",
						"source":    "train",
						"message":   "Training complete.",
					},
				},
				"recent_metrics": []map[string]any{
					{
						"timestamp": 1773159753414,
						"name":      "artifacts_uploaded",
						"value":     2,
						"step":      nil,
						"unit":      nil,
						"source":    "bootstrap",
					},
				},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runLogs([]string{"run-123"})
	})

	if !strings.Contains(output, "Run: run-123") {
		t.Fatalf("expected run summary, got: %s", output)
	}
	if !strings.Contains(output, "Recent logs:") {
		t.Fatalf("expected human logs section, got: %s", output)
	}
	if !strings.Contains(output, "epoch=1 train_loss=0.1688") {
		t.Fatalf("expected training log line, got: %s", output)
	}
	if !strings.Contains(output, "Recent metrics:") {
		t.Fatalf("expected metrics section, got: %s", output)
	}
	if strings.Contains(output, "\"recent_logs\"") {
		t.Fatalf("default output should not be raw JSON: %s", output)
	}
}

func TestRunLogs_VerboseShowsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/runs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-456", "name": "run-456"},
				},
			})
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-456/logs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":         "run-456",
				"logs_path":      "runs/env-2/456/logs",
				"log_file":       "runs/env-2/456/logs/run.log",
				"note":           "Runtime logs/metrics are streamed by the pod and persisted in Convex.",
				"recent_logs":    []map[string]any{},
				"recent_metrics": []map[string]any{},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runLogs([]string{"--verbose", "run-456"})
	})

	if !strings.Contains(output, "\"run_id\": \"run-456\"") {
		t.Fatalf("expected verbose JSON output, got: %s", output)
	}
	if !strings.Contains(output, "\"recent_logs\": []") {
		t.Fatalf("expected verbose JSON logs field, got: %s", output)
	}
	if strings.Contains(output, "Recent logs:") {
		t.Fatalf("verbose output should not be human summary: %s", output)
	}
}

func TestRunLogs_FollowStreamsUntilTerminal(t *testing.T) {
	var mu sync.Mutex
	statusCalls := 0
	logCalls := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-follow", "name": "run-follow"},
				},
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-follow":
			mu.Lock()
			statusCalls++
			call := statusCalls
			mu.Unlock()

			status := "running"
			if call >= 2 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-follow", "status": status})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-follow/logs":
			mu.Lock()
			logCalls++
			call := logCalls
			mu.Unlock()

			logs := []map[string]any{
				{
					"timestamp": 1773159359016,
					"level":     "info",
					"source":    "train",
					"message":   "starting entrypoint",
				},
			}
			if call >= 2 {
				logs = append(logs, map[string]any{
					"timestamp": 1773159537484,
					"level":     "info",
					"source":    "train",
					"message":   "epoch=1 train_loss=0.1688 val_loss=0.0546 val_acc=0.9811",
				})
			}
			if call >= 3 {
				logs = append(logs, map[string]any{
					"timestamp": 1773159748712,
					"level":     "info",
					"source":    "train",
					"message":   "Training complete.",
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":         "run-follow",
				"logs_path":      "runs/env-follow/1/logs",
				"log_file":       "runs/env-follow/1/logs/run.log",
				"note":           "Runtime logs/metrics are streamed by the pod and persisted in Convex.",
				"recent_logs":    logs,
				"recent_metrics": []map[string]any{},
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

	prevSleep := runLogsFollowSleep
	runLogsFollowSleep = func(_ time.Duration) {}
	t.Cleanup(func() {
		runLogsFollowSleep = prevSleep
	})

	output := captureStdout(t, func() {
		runLogs([]string{"--follow", "--interval", "1", "run-follow"})
	})

	if !strings.Contains(output, "Following logs for run run-follow") {
		t.Fatalf("expected follow banner, got: %s", output)
	}
	if !strings.Contains(output, "epoch=1 train_loss=0.1688") {
		t.Fatalf("expected streamed epoch log, got: %s", output)
	}
	if !strings.Contains(output, "Training complete.") {
		t.Fatalf("expected terminal log line, got: %s", output)
	}
	if strings.Count(output, "starting entrypoint") != 1 {
		t.Fatalf("expected deduplicated follow output, got: %s", output)
	}

	mu.Lock()
	defer mu.Unlock()
	if statusCalls < 2 {
		t.Fatalf("expected at least two status polls, got %d", statusCalls)
	}
	if logCalls < 3 {
		t.Fatalf("expected at least three log polls, got %d", logCalls)
	}
}
