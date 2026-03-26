package main

import (
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

func TestPreRunSync_ConfigValidationDetectsMissingBindingAfterSync(t *testing.T) {
	mock := newSyncBackendMock()
	installSyncStubs(t, mock)
	setupTestProject(t, true)

	if err := os.WriteFile(projectConfigFilePath(), []byte("[project]\ndata_dir = \"data\"\n"), 0o600); err != nil {
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
	if mock.commitCount == 0 {
		t.Fatalf("expected sync commit to complete before config validation failure")
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
		t.Fatal("expected preRunSync to fail when entrypoint binding path is missing")
	}
	if !strings.Contains(err.Error(), "entrypoint binding points to missing path") {
		t.Fatalf("expected missing entrypoint binding error, got: %v", err)
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
