package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
