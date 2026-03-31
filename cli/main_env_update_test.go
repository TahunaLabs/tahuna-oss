package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

func TestEnvironmentUpdate_FlagBased_PatchesPayload(t *testing.T) {
	var mu sync.Mutex
	patchCalls := 0
	var patchPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test":
			mu.Lock()
			patchCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&patchPayload); err != nil {
				t.Fatalf("failed decoding patch payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"gpu_type":       "nvidia-a100",
				"gpu_count":      4,
				"volume_gb":      200,
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
		environmentUpdate([]string{"--id", "env-test", "--gpu-type", "nvidia-a100", "--gpu-count", "4", "--volume-gb", "200"})
	})

	mu.Lock()
	defer mu.Unlock()
	if patchCalls != 1 {
		t.Fatalf("expected one PATCH call, got %d", patchCalls)
	}
	if asString(patchPayload["gpu_type"]) != "nvidia-a100" {
		t.Fatalf("expected gpu_type=nvidia-a100 in payload, got %v", patchPayload["gpu_type"])
	}
	if asInt64(patchPayload["gpu_count"]) != 4 {
		t.Fatalf("expected gpu_count=4 in payload, got %v", patchPayload["gpu_count"])
	}
	if asInt64(patchPayload["volume_gb"]) != 200 {
		t.Fatalf("expected volume_gb=200 in payload, got %v", patchPayload["volume_gb"])
	}
	if !strings.Contains(output, "\"environment_id\": \"env-test\"") {
		t.Fatalf("expected JSON response in output, got: %s", output)
	}
}

func TestEnvironmentUpdate_GPUTypeOnly_SkipsCountAndVolume(t *testing.T) {
	var mu sync.Mutex
	patchCalls := 0
	var patchPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test":
			mu.Lock()
			patchCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&patchPayload); err != nil {
				t.Fatalf("failed decoding patch payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"gpu_type":       "nvidia-a100",
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

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--gpu-type", "nvidia-a100"})
	})

	mu.Lock()
	defer mu.Unlock()
	if patchCalls != 1 {
		t.Fatalf("expected one PATCH call, got %d", patchCalls)
	}
	if _, ok := patchPayload["gpu_count"]; ok {
		t.Fatalf("did not expect gpu_count in payload when only --gpu-type is set")
	}
	if _, ok := patchPayload["volume_gb"]; ok {
		t.Fatalf("did not expect volume_gb in payload when only --gpu-type is set")
	}
}

func TestEnvironmentUpdate_VolumeOnly_PatchesVolumeGB(t *testing.T) {
	var mu sync.Mutex
	patchCalls := 0
	var patchPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test":
			mu.Lock()
			patchCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&patchPayload); err != nil {
				t.Fatalf("failed decoding patch payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"volume_gb":      500,
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

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--volume-gb", "500"})
	})

	mu.Lock()
	defer mu.Unlock()
	if patchCalls != 1 {
		t.Fatalf("expected one PATCH call, got %d", patchCalls)
	}
	if asInt64(patchPayload["volume_gb"]) != 500 {
		t.Fatalf("expected volume_gb=500, got %v", patchPayload["volume_gb"])
	}
	if _, ok := patchPayload["gpu_type"]; ok {
		t.Fatalf("did not expect gpu_type in volume-only update")
	}
}

func TestEnvironmentUpdate_LinkedEnvironmentRefreshesLocalProjectConfig(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/gpus":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"gpus": []map[string]any{
					{"id": "NVIDIA A100 80GB", "display_name": "NVIDIA A100 80GB", "max_gpu_count": 8, "memory_gb": 80},
				},
				"images": map[string]any{
					"pt": map[string]any{
						"2.8.0-cu128": map[string]any{
							"3.11": "docker.io/test/tahuna:pt-2.8.0-cu128-py3.11",
						},
					},
				},
			})
			return
		case r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"gpu_type":       "NVIDIA A100 80GB",
				"gpu_count":      2,
				"volume_gb":      160,
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments/env-test":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"name":           "linked-env",
				"gpu_type":       "NVIDIA A100 80GB",
				"gpu_count":      2,
				"volume_gb":      160,
				"framework":      "pt",
				"version":        "2.8.0-cu128",
				"python_version": "3.11",
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

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--gpu-type", "NVIDIA A100 80GB", "--gpu-count", "2", "--volume-gb", "160"})
	})

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		t.Fatalf("expected local project config to be written: %v", err)
	}
	text := string(raw)
	if !strings.Contains(text, "[project]") {
		t.Fatalf("expected project section in local config, got: %s", text)
	}
	if !strings.Contains(text, "data_dir = \"data\"") || !strings.Contains(text, "output_dir = \"outputs\"") {
		t.Fatalf("expected project bindings to be preserved, got: %s", text)
	}
	if !strings.Contains(text, "[environment]") {
		t.Fatalf("expected environment section in local config, got: %s", text)
	}
	if !strings.Contains(text, "version = \"2.8.0-cu128\"") {
		t.Fatalf("expected environment version in local config, got: %s", text)
	}
	if !strings.Contains(text, "gpu_type = \"NVIDIA A100 80GB\"") {
		t.Fatalf("expected gpu_type in local config, got: %s", text)
	}
	if !strings.Contains(text, "gpu_count = 2") || !strings.Contains(text, "volume_gb = 160") {
		t.Fatalf("expected hardware fields in local config, got: %s", text)
	}
	if !strings.Contains(text, "[train]") || !strings.Contains(text, "output_model_path = \"outputs/model\"") {
		t.Fatalf("expected train section in local config, got: %s", text)
	}
	if !strings.Contains(text, "[serve]") || !strings.Contains(text, "gpu_count = 1") {
		t.Fatalf("expected preserved serve section in local config, got: %s", text)
	}
	if strings.Contains(text, "framework_version") || strings.Contains(text, "requirements") {
		t.Fatalf("local project config leaked legacy fields: %s", text)
	}
}
