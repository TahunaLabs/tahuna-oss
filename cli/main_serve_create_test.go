package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestValidateServeCreateSelection(t *testing.T) {
	if err := validateServeCreateSelection("run-1", "", "outputs/model"); err != nil {
		t.Fatalf("expected valid run source selection, got %v", err)
	}
	if err := validateServeCreateSelection("", "storage/prefix", ""); err != nil {
		t.Fatalf("expected valid storage source selection, got %v", err)
	}
	if err := validateServeCreateSelection("", "", ""); err == nil || !strings.Contains(err.Error(), "exactly one") {
		t.Fatalf("expected exact-source validation error, got %v", err)
	}
	if err := validateServeCreateSelection("run-1", "storage/prefix", ""); err == nil || !strings.Contains(err.Error(), "exactly one") {
		t.Fatalf("expected exact-source validation error for duplicate sources, got %v", err)
	}
	if err := validateServeCreateSelection("", "storage/prefix", "outputs/model"); err == nil || !strings.Contains(err.Error(), "--model-path requires --from-run") {
		t.Fatalf("expected model-path validation error, got %v", err)
	}
}

func TestServeCreate_FromRunPayloadAndOutput(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	createCalls := 0
	var createPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/serves":
			mu.Lock()
			createCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&createPayload); err != nil {
				t.Fatalf("failed decoding serve create payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":                  "serve-123",
				"created_at":                1773159748712.4966,
				"environment_id":            "env-test",
				"command":                   []string{"uv", "run", "python", "-u", "inference.py"},
				"output_dir":                "outputs",
				"logs":                      "serves/env-test/1/logs",
				"status":                    "queued",
				"error":                     "",
				"provider_machine_id":       "",
				"code_manifest_hash":        "code-hash",
				"data_manifest_hash":        "data-hash",
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
					"source_run_id":        "run-123",
					"source_object_prefix": nil,
					"source_model_path":    "outputs/finetuned",
					"object_prefix":        "serves/env-test/1/model",
					"manifest_key":         "serves/env-test/1/model-manifest.json",
					"manifest_hash":        "manifest-hash",
					"object_count":         2,
					"total_bytes":          4096,
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
		serveCreate([]string{"--from-run", "run-123", "--model-path", "outputs/finetuned"})
	})

	mu.Lock()
	defer mu.Unlock()
	if createCalls != 1 {
		t.Fatalf("expected one serve create call, got %d", createCalls)
	}
	if got := strings.TrimSpace(asString(createPayload["environment_id"])); got != "env-test" {
		t.Fatalf("expected environment_id=env-test, got %q", got)
	}
	if got := strings.TrimSpace(asString(createPayload["from_run_id"])); got != "run-123" {
		t.Fatalf("expected from_run_id=run-123, got %q", got)
	}
	if got := strings.TrimSpace(asString(createPayload["model_path"])); got != "outputs/finetuned" {
		t.Fatalf("expected model_path=outputs/finetuned, got %q", got)
	}
	if _, hasStoragePrefix := createPayload["from_storage_prefix"]; hasStoragePrefix {
		t.Fatalf("did not expect from_storage_prefix in run payload: %#v", createPayload)
	}
	if !strings.Contains(output, "serve created: serve-123 (queued)") {
		t.Fatalf("expected human-readable create output, got: %s", output)
	}
}

func TestServeCreate_FromStoragePrefixPayload(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var createPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/serves" {
			if err := json.NewDecoder(r.Body).Decode(&createPayload); err != nil {
				t.Fatalf("failed decoding serve create payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"serve_id":                  "serve-storage",
				"created_at":                1773159748712.4966,
				"environment_id":            "env-test",
				"command":                   []string{"uv", "run", "python", "-u", "inference.py"},
				"output_dir":                "outputs",
				"logs":                      "serves/env-test/2/logs",
				"status":                    "queued",
				"error":                     "",
				"provider_machine_id":       "",
				"code_manifest_hash":        "code-hash",
				"data_manifest_hash":        "data-hash",
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
					"source_type":          "storage",
					"source_run_id":        nil,
					"source_object_prefix": "storage/env-test/models/qwen",
					"source_model_path":    nil,
					"object_prefix":        "serves/env-test/2/model",
					"manifest_key":         "serves/env-test/2/model-manifest.json",
					"manifest_hash":        "manifest-hash",
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

	captureStdout(t, func() {
		serveCreate([]string{"--from-storage-prefix", "storage/env-test/models/qwen"})
	})

	if got := strings.TrimSpace(asString(createPayload["from_storage_prefix"])); got != "storage/env-test/models/qwen" {
		t.Fatalf("expected from_storage_prefix payload, got %q", got)
	}
	if _, hasRunID := createPayload["from_run_id"]; hasRunID {
		t.Fatalf("did not expect from_run_id in storage payload: %#v", createPayload)
	}
	if _, hasModelPath := createPayload["model_path"]; hasModelPath {
		t.Fatalf("did not expect model_path in storage payload: %#v", createPayload)
	}
}

func TestCreateServeWithCapacityPrompt_NonInteractiveNoCapacityError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/serves" {
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

	_, err := createServeWithCapacityPrompt("env-test", map[string]any{"gpu_type": "nvidia-h100"})
	if err == nil {
		t.Fatalf("expected no-capacity error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "no gpu capacity currently available") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPersistFallbackServeCompute_UpdatesLocalServeConfigAndCommitsSync(t *testing.T) {
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

	persistFallbackServeCompute("env-test", "NVIDIA RTX A5000", 2, 160)

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	if cfg.ServeGPUType != "NVIDIA RTX A5000" {
		t.Fatalf("expected local serve gpu_type to match selected fallback GPU, got %q", cfg.ServeGPUType)
	}
	if cfg.ServeGPUCount != 2 {
		t.Fatalf("expected local serve gpu_count=2, got %d", cfg.ServeGPUCount)
	}
	if cfg.ServeVolumeGB != 160 {
		t.Fatalf("expected local serve volume_gb=160, got %d", cfg.ServeVolumeGB)
	}
	if cfg.GPUType != "NVIDIA A100 80GB" {
		t.Fatalf("expected environment gpu_type to remain unchanged, got %q", cfg.GPUType)
	}
	if len(mock.commitBodies) != 1 {
		t.Fatalf("expected one config sync commit, got %d", len(mock.commitBodies))
	}
	serveSnapshot, ok := mock.commitBodies[0]["serve_snapshot"].(*serveSnapshotResponse)
	if !ok {
		t.Fatalf("expected serve_snapshot payload, got %#v", mock.commitBodies[0]["serve_snapshot"])
	}
	if serveSnapshot.GPUType != "NVIDIA RTX A5000" || serveSnapshot.GPUCount != 2 || serveSnapshot.VolumeGB != 160 {
		t.Fatalf("expected synced serve snapshot to match selected fallback compute, got %#v", serveSnapshot)
	}
	for _, request := range requests {
		if request != "GET /api/gpus" {
			t.Fatalf("expected fallback serve sync to avoid remote environment refreshes, got %v", requests)
		}
	}
}
