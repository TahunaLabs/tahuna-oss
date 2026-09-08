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

func TestEnvironmentUpdate_FlagBased_UpdatesLocalConfigAndCommitsSync(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	var mu sync.Mutex
	requests := []string{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.Method+" "+r.URL.Path)
		mu.Unlock()
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--gpu-type", "nvidia-a100", "--gpu-count", "4", "--volume-gb", "200"})
	})

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	if cfg.GPUType != "nvidia-a100" || cfg.GPUCount != 4 || cfg.VolumeGB != 200 {
		t.Fatalf("expected local environment config to be updated, got gpu=%q count=%d volume=%d", cfg.GPUType, cfg.GPUCount, cfg.VolumeGB)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, request := range requests {
		if request != "GET /api/gpus" {
			t.Fatalf("expected only gpu catalog requests, got %v", requests)
		}
	}

	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	commitPayload := mock.commitBodies[0]
	if asString(commitPayload["gpu_type"]) != "nvidia-a100" {
		t.Fatalf("expected gpu_type=nvidia-a100 in commit payload, got %v", commitPayload["gpu_type"])
	}
	if asInt64(commitPayload["gpu_count"]) != 4 {
		t.Fatalf("expected gpu_count=4 in commit payload, got %v", commitPayload["gpu_count"])
	}
	if asInt64(commitPayload["volume_gb"]) != 200 {
		t.Fatalf("expected volume_gb=200 in commit payload, got %v", commitPayload["volume_gb"])
	}
}

func TestEnvironmentUpdate_GPUTypeOnly_CommitsMergedEnvironmentConfig(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--gpu-type", "nvidia-a100"})
	})

	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	commitPayload := mock.commitBodies[0]
	if asString(commitPayload["gpu_type"]) != "nvidia-a100" {
		t.Fatalf("expected gpu_type update in commit payload, got %v", commitPayload["gpu_type"])
	}
	if asInt64(commitPayload["gpu_count"]) != 1 {
		t.Fatalf("expected existing gpu_count to be preserved in commit payload, got %v", commitPayload["gpu_count"])
	}
	if asInt64(commitPayload["volume_gb"]) != 80 {
		t.Fatalf("expected existing volume_gb to be preserved in commit payload, got %v", commitPayload["volume_gb"])
	}
}

func TestEnvironmentUpdate_VolumeOnly_CommitsMergedEnvironmentConfig(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--volume-gb", "500"})
	})

	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	commitPayload := mock.commitBodies[0]
	if asInt64(commitPayload["volume_gb"]) != 500 {
		t.Fatalf("expected volume_gb=500 in commit payload, got %v", commitPayload["volume_gb"])
	}
	if asString(commitPayload["gpu_type"]) != "NVIDIA A100 80GB" {
		t.Fatalf("expected existing gpu_type to be preserved in commit payload, got %v", commitPayload["gpu_type"])
	}
}

func TestEnvironmentUpdate_EntrypointCommandOnly_UpdatesLocalTrainCommandAndCommitsSync(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--entrypoint-command", `torchrun --nproc-per-node 2 train.py --run-name "hello world"`})
	})

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	want := []string{"torchrun", "--nproc-per-node", "2", "train.py", "--run-name", "hello world"}
	if len(cfg.TrainCommand) != len(want) {
		t.Fatalf("expected %d train command tokens, got %d: %#v", len(want), len(cfg.TrainCommand), cfg.TrainCommand)
	}
	for i, token := range want {
		if cfg.TrainCommand[i] != token {
			t.Fatalf("expected train command token %d=%q, got %q", i, token, cfg.TrainCommand[i])
		}
	}
	if !strings.Contains(output, "train.command updated") {
		t.Fatalf("expected local train command update message, got: %s", output)
	}
	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	command, ok := mock.commitBodies[0]["command"].([]string)
	if !ok {
		t.Fatalf("expected command payload as []string, got %#v", mock.commitBodies[0]["command"])
	}
	if len(command) != len(want) {
		t.Fatalf("expected %d synced command tokens, got %d: %#v", len(want), len(command), command)
	}
}

func TestEnvironmentUpdate_ServeEntrypointCommandOnly_UpdatesLocalServeCommandAndCommitsSync(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--serve-entrypoint-command", `uv run --active --no-sync python -u inference.py --port 9000`})
	})

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	want := []string{"uv", "run", "--active", "--no-sync", "python", "-u", "inference.py", "--port", "9000"}
	if len(cfg.ServeCommand) != len(want) {
		t.Fatalf("expected %d serve command tokens, got %d: %#v", len(want), len(cfg.ServeCommand), cfg.ServeCommand)
	}
	for i, token := range want {
		if cfg.ServeCommand[i] != token {
			t.Fatalf("expected serve command token %d=%q, got %q", i, token, cfg.ServeCommand[i])
		}
	}
	if !strings.Contains(output, "serve.command updated") {
		t.Fatalf("expected local serve command update message, got: %s", output)
	}
	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	serveSnapshot, ok := mock.commitBodies[0]["serve_snapshot"].(*serveSnapshotResponse)
	if !ok {
		t.Fatalf("expected serve_snapshot payload, got %#v", mock.commitBodies[0]["serve_snapshot"])
	}
	if len(serveSnapshot.Command) != len(want) {
		t.Fatalf("expected %d synced serve command tokens, got %d: %#v", len(want), len(serveSnapshot.Command), serveSnapshot.Command)
	}
}

func TestEnvironmentUpdate_ServeComputeOnly_UpdatesLocalServeConfigAndCommitsSync(t *testing.T) {
	setupTestProject(t, false)
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	requests := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		environmentUpdate([]string{"--id", "env-test", "--serve-gpu-type", "nvidia-a100", "--serve-gpu-count", "2", "--serve-volume-gb", "160"})
	})

	for _, request := range requests {
		if request != "GET /api/gpus" {
			t.Fatalf("expected serve-only update to avoid remote environment refreshes, got %v", requests)
		}
	}

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	if cfg.ServeGPUType != "nvidia-a100" {
		t.Fatalf("expected serve gpu_type to be updated, got %q", cfg.ServeGPUType)
	}
	if cfg.ServeGPUCount != 2 {
		t.Fatalf("expected serve gpu_count=2, got %d", cfg.ServeGPUCount)
	}
	if cfg.ServeVolumeGB != 160 {
		t.Fatalf("expected serve volume_gb=160, got %d", cfg.ServeVolumeGB)
	}
	if cfg.GPUType != "NVIDIA A100 80GB" {
		t.Fatalf("expected environment gpu_type to remain unchanged, got %q", cfg.GPUType)
	}
	if cfg.GPUCount != 1 {
		t.Fatalf("expected environment gpu_count to remain 1, got %d", cfg.GPUCount)
	}
	if cfg.VolumeGB != 80 {
		t.Fatalf("expected environment volume_gb to remain 80, got %d", cfg.VolumeGB)
	}
	if !strings.Contains(output, "serve compute updated") {
		t.Fatalf("expected local serve compute update message, got: %s", output)
	}
	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	serveSnapshot, ok := mock.commitBodies[0]["serve_snapshot"].(*serveSnapshotResponse)
	if !ok {
		t.Fatalf("expected serve_snapshot payload, got %#v", mock.commitBodies[0]["serve_snapshot"])
	}
	if serveSnapshot.GPUType != "nvidia-a100" || serveSnapshot.GPUCount != 2 || serveSnapshot.VolumeGB != 160 {
		t.Fatalf("expected synced serve snapshot to reflect local updates, got %#v", serveSnapshot)
	}
}

func TestEnvironmentUpdate_LinkedEnvironmentUsesLocalSourceOfTruth(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)

	var mu sync.Mutex
	requests := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.Method+" "+r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
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
	mu.Lock()
	defer mu.Unlock()
	for _, request := range requests {
		if request != "GET /api/gpus" {
			t.Fatalf("expected local config to remain authoritative without environment refreshes, got %v", requests)
		}
	}
	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
}
