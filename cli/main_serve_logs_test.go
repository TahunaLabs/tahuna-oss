package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServeLogs_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/serves/serve-1/logs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":  "serve-1",
				"status":    "serving",
				"logs_path": "serves/env-1/1/logs",
				"log_file":  "serves/env-1/1/logs/serve.log",
				"note":      "Runtime logs are streamed by the serve runtime and persisted in Convex.",
				"logs_window": map[string]any{
					"tail_limit":                100,
					"startup_scan_limit":        50,
					"pinned_bootstrap_limit":    20,
					"scanned_tail":              2,
					"scanned_startup":           2,
					"pinned_bootstrap_count":    1,
					"returned_logs":             2,
					"includes_pinned_bootstrap": true,
				},
				"recent_logs": []map[string]any{
					{
						"timestamp": 1773159537484,
						"level":     "info",
						"source":    "bootstrap",
						"message":   "resolved pinned model snapshot",
					},
					{
						"timestamp": 1773159748712,
						"level":     "info",
						"source":    "runtime",
						"message":   "ready to serve",
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
		serveLogs([]string{"serve-1"})
	})

	if !strings.Contains(output, "Serve: serve-1") {
		t.Fatalf("expected serve log summary, got: %s", output)
	}
	if !strings.Contains(output, "Recent logs:") {
		t.Fatalf("expected human logs section, got: %s", output)
	}
	if !strings.Contains(output, "ready to serve") {
		t.Fatalf("expected runtime log line, got: %s", output)
	}
	if strings.Contains(output, "\"recent_logs\"") {
		t.Fatalf("default output should not be raw JSON: %s", output)
	}
}

func TestServeLogs_VerboseShowsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/serves/serve-verbose/logs" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":  "serve-verbose",
				"status":    "queued",
				"logs_path": "serves/env-1/2/logs",
				"log_file":  "serves/env-1/2/logs/serve.log",
				"note":      "Runtime logs are streamed by the serve runtime and persisted in Convex.",
				"logs_window": map[string]any{
					"tail_limit":                100,
					"startup_scan_limit":        50,
					"pinned_bootstrap_limit":    20,
					"scanned_tail":              0,
					"scanned_startup":           0,
					"pinned_bootstrap_count":    0,
					"returned_logs":             0,
					"includes_pinned_bootstrap": false,
				},
				"recent_logs": []map[string]any{},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		serveLogs([]string{"--verbose", "serve-verbose"})
	})

	if !strings.Contains(output, "\"serve_id\": \"serve-verbose\"") {
		t.Fatalf("expected verbose JSON output, got: %s", output)
	}
}

func TestServeStop_ForcePayload(t *testing.T) {
	var forceValue bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/serves/serve-1/stop" {
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("failed decoding stop payload: %v", err)
			}
			forceValue = payload["force"] == true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":       "serve-1",
				"stop_requested": true,
				"forced":         true,
				"status":         "stopping",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		serveStop([]string{"--force", "serve-1"})
	})

	if !forceValue {
		t.Fatalf("expected force=true in stop payload")
	}
	if !strings.Contains(output, "Force stop requested for serve serve-1") {
		t.Fatalf("expected force stop output, got: %s", output)
	}
}
