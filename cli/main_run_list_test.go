package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRunList_DefaultTailOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-1", "name": "alpha", "environment_id": "env-1", "status": "completed", "created_at": 1773159359016},
					{"run_id": "run-2", "name": "bravo", "environment_id": "env-1", "status": "running", "created_at": 1773159537484},
					{"run_id": "run-3", "name": "charlie", "environment_id": "env-1", "status": "queued", "created_at": 1773159748712},
				},
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environments": []map[string]any{
					{"environment_id": "env-1", "name": "my-env"},
				},
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

	output := captureStdout(t, func() {
		runList(nil)
	})

	if !strings.Contains(output, "RUN NAME") {
		t.Fatalf("expected table header, got: %s", output)
	}
	if !strings.Contains(output, "my-env") {
		t.Fatalf("expected environment name in output, got: %s", output)
	}
	if !strings.Contains(output, "alpha") || !strings.Contains(output, "bravo") || !strings.Contains(output, "charlie") {
		t.Fatalf("expected all runs in output, got: %s", output)
	}
}

func TestRunList_LimitFlag(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			runs := make([]map[string]any, 0, 10)
			for i := 0; i < 10; i++ {
				runs = append(runs, map[string]any{
					"run_id":         "run-" + strings.Repeat("x", 1) + string(rune('a'+i)),
					"name":           "run-name-" + string(rune('a'+i)),
					"environment_id": "env-1",
					"status":         "completed",
					"created_at":     1773159359016 + int64(i*1000),
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"runs": runs})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{"environments": []map[string]any{}})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runList([]string{"-l", "2"})
	})

	lines := strings.Split(strings.TrimSpace(output), "\n")
	// header + 2 data lines
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines (1 header + 2 data), got %d: %s", len(lines), output)
	}
}

func TestRunList_EmptyRuns(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			_ = json.NewEncoder(w).Encode(map[string]any{"runs": []map[string]any{}})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{"environments": []map[string]any{}})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runList(nil)
	})

	if !strings.Contains(output, "No runs found.") {
		t.Fatalf("expected 'No runs found.' message, got: %s", output)
	}
}

func TestRunList_UnnamedRunShowsUnnamed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-1", "name": "", "environment_id": "env-1", "status": "completed", "created_at": 1773159359016},
				},
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{"environments": []map[string]any{}})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runList(nil)
	})

	if !strings.Contains(output, "unnamed") {
		t.Fatalf("expected 'unnamed' for empty name, got: %s", output)
	}
	if !strings.Contains(output, "unknown") {
		t.Fatalf("expected 'unknown' for unresolved environment, got: %s", output)
	}
}

func TestRunList_AllFlag(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			runs := make([]map[string]any, 0, 10)
			for i := 0; i < 10; i++ {
				runs = append(runs, map[string]any{
					"run_id":         "run-" + string(rune('a'+i)),
					"name":           "run-" + string(rune('a'+i)),
					"environment_id": "env-1",
					"status":         "completed",
					"created_at":     1773159359016 + int64(i*1000),
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"runs": runs})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{"environments": []map[string]any{}})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runList([]string{"--all"})
	})

	lines := strings.Split(strings.TrimSpace(output), "\n")
	// header + 10 data lines
	if len(lines) != 11 {
		t.Fatalf("expected 11 lines (1 header + 10 data) with --all, got %d: %s", len(lines), output)
	}
}
