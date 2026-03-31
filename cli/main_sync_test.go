package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncIncremental_CodeCommitRetryUploadsManifestAndMetadata(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := syncIncremental("env-test", syncScope{code: true}, syncOptions{}); err != nil {
		t.Fatalf("syncIncremental failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()

	if mock.commitCount != 1 {
		t.Fatalf("expected 1 commit call, got %d", mock.commitCount)
	}
	if mock.manifestUploadCount != 1 {
		t.Fatalf("expected 1 manifest upload, got %d", mock.manifestUploadCount)
	}
	if mock.blobUploadCount == 0 {
		t.Fatalf("expected at least one blob upload")
	}
	if _, err := os.Stat(filepath.Join(projectStateDir, "sync_code_manifest.json")); err != nil {
		t.Fatalf("expected sync_code_manifest.json to exist: %v", err)
	}

	hasManifestMetadata := false
	for key := range mock.metadata {
		if strings.HasPrefix(key, "user/environment/env-test/manifests/code/") {
			hasManifestMetadata = true
			break
		}
	}
	if !hasManifestMetadata {
		t.Fatalf("expected code manifest metadata sync")
	}
}

func TestSyncIncremental_CodeNoChangeSkipsBlobAndManifestUploads(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	if err := syncIncremental("env-test", syncScope{code: true}, syncOptions{}); err != nil {
		t.Fatalf("first syncIncremental failed: %v", err)
	}

	mock.mu.Lock()
	blobUploadsBefore := mock.blobUploadCount
	manifestUploadsBefore := mock.manifestUploadCount
	commitCountBefore := mock.commitCount
	mock.mu.Unlock()

	if err := syncIncremental("env-test", syncScope{code: true}, syncOptions{}); err != nil {
		t.Fatalf("second syncIncremental failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()

	if mock.blobUploadCount != blobUploadsBefore {
		t.Fatalf("expected no new blob uploads on no-change sync, before=%d after=%d", blobUploadsBefore, mock.blobUploadCount)
	}
	if mock.manifestUploadCount != manifestUploadsBefore+1 {
		t.Fatalf("expected exactly one new manifest upload on no-change sync, before=%d after=%d", manifestUploadsBefore, mock.manifestUploadCount)
	}
	if mock.commitCount != commitCountBefore+1 {
		t.Fatalf("expected one additional commit call, before=%d after=%d", commitCountBefore, mock.commitCount)
	}
}

func TestSyncIncremental_DataScopeOnlyCommitsDataManifest(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("syncIncremental(data only) failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()

	if len(mock.commitBodies) == 0 {
		t.Fatalf("expected at least one commit payload")
	}
	lastCommit := mock.commitBodies[len(mock.commitBodies)-1]
	if _, ok := lastCommit["code_manifest_hash"]; ok {
		t.Fatalf("did not expect code_manifest_hash in data-only commit payload")
	}
	if asString(lastCommit["data_manifest_hash"]) == "" {
		t.Fatalf("expected data_manifest_hash in data-only commit payload")
	}

	if len(mock.blobKinds) == 0 {
		t.Fatalf("expected at least one blob upload")
	}
	for _, kind := range mock.blobKinds {
		if kind != "data" {
			t.Fatalf("expected only data blob uploads, found kind=%s", kind)
		}
	}

	if _, ok := lastCommit["data_manifest"]; ok {
		t.Fatalf("did not expect data_manifest payload in commit request")
	}
}

func TestSyncIncremental_CodeCommitIncludesConfiguredTrainCommand(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)

	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	cfg.TrainCommand = []string{"torchrun", "--nproc-per-node", "2", "train.py"}
	if err := saveProjectConfig(cfg); err != nil {
		t.Fatalf("failed to save project config: %v", err)
	}

	if err := syncIncremental("env-test", syncScope{code: true}, syncOptions{}); err != nil {
		t.Fatalf("syncIncremental failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()

	if len(mock.commitBodies) == 0 {
		t.Fatalf("expected at least one commit payload")
	}
	lastCommit := mock.commitBodies[len(mock.commitBodies)-1]
	command, ok := lastCommit["command"].([]string)
	if !ok {
		t.Fatalf("expected command payload as []string, got %#v", lastCommit["command"])
	}
	want := []string{"torchrun", "--nproc-per-node", "2", "train.py"}
	if len(command) != len(want) {
		t.Fatalf("expected %d command tokens, got %d: %#v", len(want), len(command), command)
	}
	for i, token := range want {
		if command[i] != token {
			t.Fatalf("expected command token %d=%q, got %q", i, token, command[i])
		}
	}
	if got := asString(lastCommit["output_dir"]); got != "outputs" {
		t.Fatalf("expected output_dir=outputs in sync commit, got %q", got)
	}
}

func TestRunSyncWithStatus_ValidatesLocalConfigAndPreservesProjectFile(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}
	cfg, err := loadProjectConfig()
	if err != nil {
		t.Fatalf("failed to load project config: %v", err)
	}
	cfg.GPUType = "NVIDIA RTX A5000"
	if err := saveProjectConfig(cfg); err != nil {
		t.Fatalf("failed to save local project config: %v", err)
	}

	requests := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
			serveGpusAndEnvironment(w, r)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	output := captureStdout(t, func() {
		if err := runSyncWithStatus("env-test", syncScope{code: true}); err != nil {
			t.Fatalf("runSyncWithStatus failed: %v", err)
		}
	})

	if !strings.Contains(output, "validating project config") {
		t.Fatalf("expected sync output to include local config validation, got: %s", output)
	}
	if strings.Contains(output, "syncing environment") {
		t.Fatalf("did not expect remote environment refresh phase in sync output, got: %s", output)
	}

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		t.Fatalf("expected project config to be written: %v", err)
	}
	text := string(raw)
	if !strings.Contains(text, "framework = \"pt\"") || !strings.Contains(text, "version = \"2.8.0-cu128\"") {
		t.Fatalf("expected local runtime config to remain present, got: %s", text)
	}
	if !strings.Contains(text, "gpu_type = \"NVIDIA RTX A5000\"") || !strings.Contains(text, "gpu_count = 1") {
		t.Fatalf("expected local environment hardware to remain authoritative, got: %s", text)
	}
	for _, request := range requests {
		if request != "GET /api/gpus" {
			t.Fatalf("expected sync to avoid remote environment refreshes, got %v", requests)
		}
	}
}

func TestRunSyncWithStatus_EnvironmentOnlyConfigFails(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, false)
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}
	if err := os.WriteFile(projectConfigFilePath(), []byte("# Generated from the remote Tahuna environment record.\n[environment]\nframework = \"pt\"\nversion = \"2.8.0-cu128\"\npython_version = \"3.11\"\ngpu_type = \"NVIDIA RTX A5000\"\ngpu_count = 1\nvolume_gb = 80\n"), 0o600); err != nil {
		t.Fatalf("failed to write env-only project config: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveGpusAndEnvironment(w, r) {
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	err := runSyncWithStatus("env-test", syncScope{code: true})
	if err == nil {
		t.Fatal("expected runSyncWithStatus to fail for env-only root config")
	}
	if !strings.Contains(err.Error(), "project.data_dir") || !strings.Contains(err.Error(), "project.output_dir") {
		t.Fatalf("expected missing project binding error, got: %v", err)
	}
}

func TestPreRunSync_ConfigValidationDetectsMissingInferenceEntrypoint(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	if err := os.Remove("inference.py"); err != nil {
		t.Fatalf("failed to remove inference.py: %v", err)
	}

	err := preRunSync("env-test")
	if err == nil {
		t.Fatal("expected preRunSync to fail when inference.py is missing")
	}
	if !strings.Contains(err.Error(), "missing required project file \"inference.py\"") {
		t.Fatalf("expected missing inference.py error, got: %v", err)
	}
}

func TestPreRunSync_SyncsCodeAndData(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	if err := preRunSync("env-test"); err != nil {
		t.Fatalf("preRunSync failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()

	if len(mock.commitBodies) == 0 {
		t.Fatalf("expected at least one commit payload")
	}
	lastCommit := mock.commitBodies[len(mock.commitBodies)-1]
	if asString(lastCommit["code_manifest_hash"]) == "" {
		t.Fatalf("expected code_manifest_hash in preRunSync commit payload")
	}
	if asString(lastCommit["data_manifest_hash"]) == "" {
		t.Fatalf("expected data_manifest_hash in preRunSync commit payload")
	}
}

func TestPreRunSync_ConfigValidationFailsBeforeSyncCommit(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	brokenConfig := `[project]
data_dir = "data"

[serve]
gpu_type = "NVIDIA A100 80GB"
gpu_count = 1
volume_gb = 80
`
	if err := os.WriteFile(projectConfigFilePath(), []byte(brokenConfig), 0o600); err != nil {
		t.Fatalf("failed to write broken project config: %v", err)
	}

	err := preRunSync("env-test")
	if err == nil {
		t.Fatal("expected preRunSync to fail on broken project bindings")
	}
	if !strings.Contains(err.Error(), "missing required binding keys") {
		t.Fatalf("expected missing binding validation error, got: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()
	if mock.commitCount != 0 {
		t.Fatalf("expected config validation to fail before any sync commit, got %d commits", mock.commitCount)
	}
}

func TestPreRunSync_ConfigValidationDetectsMissingEntrypointPath(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	if err := os.Remove("train.py"); err != nil {
		t.Fatalf("failed to remove train.py: %v", err)
	}

	err := preRunSync("env-test")
	if err == nil {
		t.Fatal("expected preRunSync to fail when train.py is missing")
	}
	if !strings.Contains(err.Error(), "missing required project file \"train.py\"") {
		t.Fatalf("expected missing train.py error, got: %v", err)
	}
}

func TestSyncIncremental_DataChangedWithoutInteractiveStillSyncs(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	projectDir := setupTestProject(t, true)

	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("initial data sync failed: %v", err)
	}

	if err := os.WriteFile(filepath.Join(projectDir, "data", "sample.txt"), []byte("changed\n"), 0o644); err != nil {
		t.Fatalf("failed to mutate data file: %v", err)
	}

	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("expected changed data sync to proceed non-interactively, got: %v", err)
	}
}

func TestSyncIncremental_DataChangedUploadsNewArchive(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	projectDir := setupTestProject(t, true)

	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("initial data sync failed: %v", err)
	}

	mock.mu.Lock()
	initialUploads := mock.blobUploadCount
	mock.mu.Unlock()

	if err := os.WriteFile(filepath.Join(projectDir, "data", "sample.txt"), []byte("changed-again\n"), 0o644); err != nil {
		t.Fatalf("failed to mutate data file: %v", err)
	}

	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("changed data sync failed: %v", err)
	}

	mock.mu.Lock()
	defer mock.mu.Unlock()
	if mock.blobUploadCount <= initialUploads {
		t.Fatalf("expected additional data uploads after changed data overwrite prompt")
	}
}
