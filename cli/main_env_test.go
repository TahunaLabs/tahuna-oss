package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEnvironmentList_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/environments" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environments": []map[string]any{
					{
						"environment_id": "env-123",
						"name":           "mnist-prod",
						"gpu_type":       "nvidia-a100",
						"gpu_count":      2,
						"volume_gb":      120,
						"framework":      "pt",
						"version":        "2.2.0-cu121",
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
		environmentList(nil)
	})

	if !strings.Contains(output, "NAME") || !strings.Contains(output, "ENV ID") {
		t.Fatalf("expected list header, got: %s", output)
	}
	if !strings.Contains(output, "mnist-prod") {
		t.Fatalf("expected environment row, got: %s", output)
	}
	if strings.Contains(output, "\"environments\"") {
		t.Fatalf("default list output should not be JSON: %s", output)
	}
}

func TestEnvironmentList_VerboseShowsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/environments" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environments": []map[string]any{
					{"environment_id": "env-verbose", "name": "verbose-env"},
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
		environmentList([]string{"-v"})
	})

	if !strings.Contains(output, "\"environment_id\": \"env-verbose\"") {
		t.Fatalf("expected JSON output, got: %s", output)
	}
	if strings.Contains(output, "NAME") {
		t.Fatalf("verbose output should not print table summary: %s", output)
	}
}

func TestEnvironmentShow_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/environments/env-1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-1",
				"name":           "single-env",
				"gpu_type":       "nvidia-a100",
				"gpu_count":      1,
				"volume_gb":      80,
				"framework":      "pt",
				"version":        "2.2.0-cu121",
				"artifacts":      "runs/env-1/artifacts",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		environmentShow([]string{"--id", "env-1"})
	})

	if !strings.Contains(output, "Name: single-env") {
		t.Fatalf("expected human summary, got: %s", output)
	}
	if !strings.Contains(output, "Environment ID: env-1") {
		t.Fatalf("expected environment id summary, got: %s", output)
	}
	if strings.Contains(output, "\"environment_id\"") {
		t.Fatalf("default show output should not be JSON: %s", output)
	}
}

func TestAPIURL_IgnoresLegacyProviderEnvVars(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_SITE_URL", "")
	t.Setenv("TAHUNA_PUBLIC_SITE_URL", "")
	t.Setenv("CONVEX_SITE_URL", "https://legacy.example.com")
	t.Setenv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://legacy-public.example.com")

	if got := apiURL(); got != defaultAPIURL {
		t.Fatalf("expected default API URL when only legacy provider env vars are set, got %q", got)
	}
}
