package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServeList_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/serves":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serves": []map[string]any{
					{
						"serve_id":                  "serve-1",
						"created_at":                1773159359016.25,
						"environment_id":            "env-1",
						"inference_path":            "/api/serves/serve-1/inference",
						"command":                   []string{"uv", "run", "python", "-u", "inference.py"},
						"output_dir":                "outputs",
						"logs":                      "serves/env-1/1/logs",
						"status":                    "serving",
						"error":                     "",
						"provider_machine_id":       "machine-1",
						"code_manifest_hash":        "code-1",
						"data_manifest_hash":        "data-1",
						"python_version":            "3.11",
						"gpu_type":                  "NVIDIA L40S",
						"gpu_count":                 1,
						"volume_gb":                 120,
						"port":                      8000,
						"health_path":               "/health",
						"default_model_path":        "outputs/model",
						"startup_timeout_seconds":   900,
						"health_interval_seconds":   5,
						"health_timeout_seconds":    2,
						"health_failure_threshold":  3,
						"graceful_shutdown_seconds": 30,
						"model_snapshot": map[string]any{
							"source_type":          "run",
							"source_run_id":        "run-1",
							"source_object_prefix": nil,
							"source_model_path":    "outputs/model",
							"object_prefix":        "serves/env-1/1/model",
							"manifest_key":         "serves/env-1/1/model-manifest.json",
							"manifest_hash":        "manifest-1",
							"object_count":         2,
							"total_bytes":          4096,
						},
					},
				},
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environments": []map[string]any{
					{"environment_id": "env-1", "name": "serve-env"},
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
		serveList(nil)
	})

	if !strings.Contains(output, "SERVE ID") {
		t.Fatalf("expected serve list header, got: %s", output)
	}
	if !strings.Contains(output, "serve-env") {
		t.Fatalf("expected environment label in output, got: %s", output)
	}
	if !strings.Contains(output, "serving") || !strings.Contains(output, "run") {
		t.Fatalf("expected status and source type in output, got: %s", output)
	}
	if strings.Contains(output, "\"serves\"") {
		t.Fatalf("default output should not be raw JSON: %s", output)
	}
}

func TestServeList_VerboseShowsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/serves" {
			_ = json.NewEncoder(w).Encode(map[string]any{"serves": []map[string]any{{"serve_id": "serve-verbose"}}})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		serveList([]string{"--verbose"})
	})

	if !strings.Contains(output, "\"serve_id\": \"serve-verbose\"") {
		t.Fatalf("expected verbose JSON output, got: %s", output)
	}
}

func TestServeShow_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/serves/serve-1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":                  "serve-1",
				"created_at":                1773159359016.25,
				"environment_id":            "env-1",
				"inference_path":            "/api/serves/serve-1/inference",
				"command":                   []string{"uv", "run", "python", "-u", "inference.py"},
				"output_dir":                "outputs",
				"logs":                      "serves/env-1/1/logs",
				"status":                    "serving",
				"error":                     "",
				"provider_machine_id":       "machine-1",
				"code_manifest_hash":        "code-1",
				"data_manifest_hash":        "data-1",
				"python_version":            "3.11",
				"gpu_type":                  "NVIDIA L40S",
				"gpu_count":                 1,
				"volume_gb":                 120,
				"port":                      8000,
				"health_path":               "/health",
				"default_model_path":        "outputs/model",
				"startup_timeout_seconds":   900,
				"health_interval_seconds":   5,
				"health_timeout_seconds":    2,
				"health_failure_threshold":  3,
				"graceful_shutdown_seconds": 30,
				"model_snapshot": map[string]any{
					"source_type":          "run",
					"source_run_id":        "run-1",
					"source_object_prefix": nil,
					"source_model_path":    "outputs/model",
					"object_prefix":        "serves/env-1/1/model",
					"manifest_key":         "serves/env-1/1/model-manifest.json",
					"manifest_hash":        "manifest-1",
					"object_count":         2,
					"total_bytes":          4096,
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
		serveShow([]string{"serve-1"})
	})

	if !strings.Contains(output, "Serve ID: serve-1") {
		t.Fatalf("expected serve summary, got: %s", output)
	}
	if !strings.Contains(output, "Model source: run run-1") {
		t.Fatalf("expected model source detail, got: %s", output)
	}
	if !strings.Contains(output, "Command: uv run python -u inference.py") {
		t.Fatalf("expected command summary, got: %s", output)
	}
	if !strings.Contains(output, "Inference URL:") || !strings.Contains(output, "/api/serves/serve-1/inference") {
		t.Fatalf("expected inference URL, got: %s", output)
	}
	if !strings.Contains(output, "Use --verbose (-v) for full JSON payload.") {
		t.Fatalf("expected verbose hint, got: %s", output)
	}
}
