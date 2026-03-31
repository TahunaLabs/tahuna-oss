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

func TestTrainDetached_EndToEndPreflightAndRunCreation(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	runCreateCount := 0
	runWatchCount := 0
	var runCreatePayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs":
			mu.Lock()
			runCreateCount++
			mu.Unlock()

			if err := json.NewDecoder(r.Body).Decode(&runCreatePayload); err != nil {
				t.Fatalf("failed decoding run create payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-detached"})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-detached":
			mu.Lock()
			runWatchCount++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-detached", "status": "completed"})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	t.Setenv("TAHUNA_BROWSER_URL", server.URL)
	t.Setenv("TERM", "dumb")

	output := captureStdout(t, func() {
		train([]string{"-d", "--gpu-type", "nvidia-a100", "--gpu-count", "2", "--volume-gb", "120"})
	})

	mock.mu.Lock()
	commitCount := mock.commitCount
	mock.mu.Unlock()
	if commitCount == 0 {
		t.Fatalf("expected preflight sync commit before run creation")
	}

	mu.Lock()
	defer mu.Unlock()
	if runCreateCount != 1 {
		t.Fatalf("expected one run create call, got %d", runCreateCount)
	}
	if runWatchCount != 0 {
		t.Fatalf("detached train should not monitor run status, got %d watch calls", runWatchCount)
	}
	if asString(runCreatePayload["gpu_type"]) != "nvidia-a100" {
		t.Fatalf("expected gpu_type override in run payload, got %v", runCreatePayload["gpu_type"])
	}
	if _, hasCommand := runCreatePayload["command"]; hasCommand {
		t.Fatalf("run create payload must not contain command (should come from environment)")
	}
	if _, hasOutputDir := runCreatePayload["output_dir"]; hasOutputDir {
		t.Fatalf("run create payload must not contain output_dir (should come from environment)")
	}
	if asInt64(runCreatePayload["gpu_count"]) != 2 {
		t.Fatalf("expected gpu_count=2 in run payload, got %v", runCreatePayload["gpu_count"])
	}
	if asInt64(runCreatePayload["volume_gb"]) != 120 {
		t.Fatalf("expected volume_gb=120 in run payload, got %v", runCreatePayload["volume_gb"])
	}

	if !strings.Contains(output, "sync complete") {
		t.Fatalf("expected sync completion status in output, got: %s", output)
	}
	if !strings.Contains(output, "run created: run-detached") {
		t.Fatalf("expected run summary in output, got: %s", output)
	}
	if !strings.Contains(output, server.URL+"/dashboard/runs/run-detached") {
		t.Fatalf("expected dashboard URL in output, got: %s", output)
	}
}

func TestTrainAttached_MonitorsUntilCompletion(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	var mu sync.Mutex
	runCreateCount := 0
	runWatchCount := 0
	runLogsCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs":
			mu.Lock()
			runCreateCount++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-attached"})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-attached":
			mu.Lock()
			runWatchCount++
			call := runWatchCount
			mu.Unlock()

			status := "running"
			if call >= 2 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-attached", "status": status})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-attached/logs":
			mu.Lock()
			runLogsCount++
			call := runLogsCount
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
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":         "run-attached",
				"logs_path":      "runs/env-test/1/logs",
				"log_file":       "runs/env-test/1/logs/run.log",
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
	t.Setenv("TAHUNA_BROWSER_URL", server.URL)
	t.Setenv("TERM", "dumb")

	output := captureStdout(t, func() {
		train(nil)
	})

	mu.Lock()
	defer mu.Unlock()
	if runCreateCount != 1 {
		t.Fatalf("expected one run create call, got %d", runCreateCount)
	}
	if runWatchCount < 2 {
		t.Fatalf("expected monitor loop to poll at least twice, got %d", runWatchCount)
	}
	if runLogsCount < 2 {
		t.Fatalf("expected monitor loop to poll run logs at least twice, got %d", runLogsCount)
	}

	if !strings.Contains(output, "Monitoring run lifecycle...") {
		t.Fatalf("expected monitoring UX copy in output, got: %s", output)
	}
	if !strings.Contains(output, "Status") || !strings.Contains(output, "completed") {
		t.Fatalf("expected completed status in output, got: %s", output)
	}
	if !strings.Contains(output, "epoch=1 train_loss=0.1688") {
		t.Fatalf("expected streamed training log output, got: %s", output)
	}
}

func TestCreateRunWithCapacityPrompt_NonInteractiveNoCapacityError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost && r.URL.Path == "/api/environments/env-test/runs" {
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

	_, err := createRunWithCapacityPrompt("/environments/env-test/runs", map[string]any{"gpu_type": "nvidia-h100"})
	if err == nil {
		t.Fatalf("expected no-capacity error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "no gpu capacity currently available") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMonitorRunWithLogs_RetriesTransientStatusPollError(t *testing.T) {
	var mu sync.Mutex
	statusCalls := 0
	logCalls := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-monitor":
			mu.Lock()
			statusCalls++
			call := statusCalls
			mu.Unlock()
			if call == 1 {
				w.Header().Set("Content-Type", "text/html")
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte("<!DOCTYPE html><html><body>temporary route miss</body></html>"))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			status := "running"
			if call >= 3 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"run_id": "run-monitor", "status": status})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-monitor/logs":
			w.Header().Set("Content-Type", "application/json")
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
					"timestamp": 1773159748712,
					"level":     "info",
					"source":    "train",
					"message":   "Training complete.",
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id":         "run-monitor",
				"logs_path":      "runs/env-monitor/1/logs",
				"log_file":       "runs/env-monitor/1/logs/run.log",
				"note":           "Runtime logs/metrics are streamed by the pod and persisted in Convex.",
				"recent_logs":    logs,
				"recent_metrics": []map[string]any{},
			})
			return
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
			return
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)
	t.Setenv("TAHUNA_BROWSER_URL", server.URL)

	output := captureStdout(t, func() {
		if err := monitorRunWithLogs("run-monitor", 0); err != nil {
			t.Fatalf("monitorRunWithLogs returned error: %v", err)
		}
	})

	if !strings.Contains(output, "warning:") || !strings.Contains(output, "unable to poll run status") {
		t.Fatalf("expected transient poll warning, got: %s", output)
	}
	if !strings.Contains(output, "recovered run status polling") {
		t.Fatalf("expected polling recovery message, got: %s", output)
	}
	if !strings.Contains(output, "Training complete.") {
		t.Fatalf("expected recovered log stream, got: %s", output)
	}

	mu.Lock()
	defer mu.Unlock()
	if statusCalls < 3 {
		t.Fatalf("expected retried status polls, got %d", statusCalls)
	}
	if logCalls < 2 {
		t.Fatalf("expected log polling after retry, got %d", logCalls)
	}
}

func TestPersistFallbackEnvironmentGPU_UpdatesLinkedEnvironmentGPUType(t *testing.T) {
	var mu sync.Mutex
	patchCalls := 0
	var patchPayload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test" {
			mu.Lock()
			patchCalls++
			mu.Unlock()
			if err := json.NewDecoder(r.Body).Decode(&patchPayload); err != nil {
				t.Fatalf("failed decoding environment patch payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"environment_id": "env-test"})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	persistFallbackEnvironmentGPU("/environments/env-test/runs", "NVIDIA RTX A5000")

	mu.Lock()
	defer mu.Unlock()
	if patchCalls != 1 {
		t.Fatalf("expected one environment patch call, got %d", patchCalls)
	}
	if asString(patchPayload["gpu_type"]) != "NVIDIA RTX A5000" {
		t.Fatalf("expected gpu_type patch to match selected fallback GPU, got %v", patchPayload["gpu_type"])
	}
}

func TestPersistFallbackEnvironmentGPU_RefreshesLocalProjectConfig(t *testing.T) {
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/api/environments/env-test":
			_ = json.NewEncoder(w).Encode(map[string]any{"environment_id": "env-test"})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/environments/env-test":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"environment_id": "env-test",
				"name":           "fallback-env",
				"gpu_type":       "NVIDIA RTX A5000",
				"gpu_count":      1,
				"volume_gb":      80,
				"framework":      "pt",
				"version":        "2.8.0-cu128",
				"python_version": "3.11",
			})
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
		}
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	persistFallbackEnvironmentGPU("/environments/env-test/runs", "NVIDIA RTX A5000")

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
	if !strings.Contains(text, "[train]") || !strings.Contains(text, "output_model_path = \"outputs/model\"") {
		t.Fatalf("expected train section in local config, got: %s", text)
	}
	if !strings.Contains(text, "[serve]") || !strings.Contains(text, "gpu_type = \"NVIDIA A100 80GB\"") {
		t.Fatalf("expected serve section in local config, got: %s", text)
	}
	if !strings.Contains(text, "gpu_type = \"NVIDIA RTX A5000\"") {
		t.Fatalf("expected fallback gpu in local config, got: %s", text)
	}
	if !strings.Contains(text, "framework = \"pt\"") || !strings.Contains(text, "version = \"2.8.0-cu128\"") || !strings.Contains(text, "python_version = \"3.11\"") {
		t.Fatalf("expected runtime fields in local config, got: %s", text)
	}
	if strings.Contains(text, "framework_version") || strings.Contains(text, "requirements") {
		t.Fatalf("local project config leaked legacy fields: %s", text)
	}
}

func TestPersistFallbackEnvironmentGPU_IgnoresInvalidRunPath(t *testing.T) {
	var mu sync.Mutex
	requestCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requestCount++
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"detail": "unexpected request"})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	persistFallbackEnvironmentGPU("/runs", "NVIDIA RTX A5000")

	mu.Lock()
	defer mu.Unlock()
	if requestCount != 0 {
		t.Fatalf("expected no API calls for invalid path, got %d", requestCount)
	}
}

func TestAvailableGPUChoices_FiltersUnavailableCaseInsensitive(t *testing.T) {
	gpus := []string{
		"NVIDIA H200 NVL",
		"NVIDIA GeForce RTX 3070",
		"NVIDIA GeForce RTX 3090",
	}
	unavailable := map[string]struct{}{
		normalizeGPUChoice("nvidia geforce rtx 3070"): {},
	}

	got := availableGPUChoices(gpus, unavailable)
	if len(got) != 2 {
		t.Fatalf("expected 2 choices after filtering, got %d (%v)", len(got), got)
	}
	if got[0] != "NVIDIA H200 NVL" || got[1] != "NVIDIA GeForce RTX 3090" {
		t.Fatalf("unexpected filtered order: %v", got)
	}
}

func TestAvailableGPUChoices_DeduplicatesAndTrims(t *testing.T) {
	gpus := []string{
		" NVIDIA H200 NVL ",
		"nvidia h200 nvl",
		"",
		"  ",
		"NVIDIA GeForce RTX 3090",
	}

	got := availableGPUChoices(gpus, map[string]struct{}{})
	if len(got) != 2 {
		t.Fatalf("expected 2 unique choices, got %d (%v)", len(got), got)
	}
	if got[0] != "NVIDIA H200 NVL" || got[1] != "NVIDIA GeForce RTX 3090" {
		t.Fatalf("unexpected normalized choices: %v", got)
	}
}
