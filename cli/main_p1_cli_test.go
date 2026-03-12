package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestRunShow_DefaultHumanSummary(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":                 "run-1",
				"name":                   "warm-river-fox",
				"environment_id":         "env-1",
				"status":                 "running",
				"effective_gpu_type":     "NVIDIA A100 80GB",
				"effective_gpu_count":    1,
				"effective_volume_gb":    80,
				"code_manifest_hash":     "abc123",
				"data_manifest_hash":     "",
				"cancellation_requested": false,
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		runShow([]string{"run-1"})
	})

	if !strings.Contains(output, "Run ID: run-1") {
		t.Fatalf("expected run summary output, got: %s", output)
	}
	if !strings.Contains(output, "Name: warm-river-fox") {
		t.Fatalf("expected run name in summary, got: %s", output)
	}
	if strings.Contains(output, "\"run_id\"") {
		t.Fatalf("default run show output should not be JSON: %s", output)
	}
}

func TestEnvironmentDelete_RemovesLinkedEnvironmentFile(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-123"); err != nil {
		t.Fatalf("failed to save linked env id: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodDelete && r.URL.Path == "/api/environments/env-123" {
			_ = json.NewEncoder(w).Encode(map[string]any{"deleted": true, "environment_id": "env-123"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	captureStdout(t, func() {
		environmentDelete([]string{"--id", "env-123"})
	})

	if _, err := os.Stat(projectEnvironmentFilePath()); !os.IsNotExist(err) {
		t.Fatalf("expected linked environment file to be removed, err=%v", err)
	}
}

func TestDataList_DefaultHumanReadable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/data" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"blobs": []map[string]any{
					{
						"blob_id":      "blob_1",
						"filename":     "dataset.csv",
						"size":         2048,
						"created_at":   1773159537484,
						"download_url": "https://example.com/dataset.csv",
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
		dataList(nil)
	})

	if !strings.Contains(output, "DATA ID") || !strings.Contains(output, "blob_1") {
		t.Fatalf("expected data table output, got: %s", output)
	}
	if strings.Contains(output, "\"blobs\"") {
		t.Fatalf("default data list output should not be JSON: %s", output)
	}
}

func TestEnvironmentDataBind_UsesLinkedEnvironmentWhenOmitted(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-abc"); err != nil {
		t.Fatalf("failed to save linked env id: %v", err)
	}

	var posted map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-abc/data-bindings" {
			if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
				t.Fatalf("failed to decode bind payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-abc",
				"bound_data_ids": []string{"blob_1", "blob_2"},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	captureStdout(t, func() {
		environmentDataBind([]string{"blob_1", "blob_2"})
	})

	dataIDs, _ := posted["data_ids"].([]any)
	if len(dataIDs) != 2 {
		t.Fatalf("expected two data ids in payload, got: %#v", posted)
	}
}
