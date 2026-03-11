package main

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type syncBackendMock struct {
	mu sync.Mutex

	metadata map[string]bool
	uploaded map[string]bool

	blobUploadCount     int
	manifestUploadCount int
	commitCount         int

	blobKinds    []string
	missingKinds []string
	commitBodies []map[string]any
}

func newSyncBackendMock() *syncBackendMock {
	return &syncBackendMock{
		metadata: map[string]bool{},
		uploaded: map[string]bool{},
	}
}

func (m *syncBackendMock) doJSON(method, path string, payload map[string]any) (map[string]any, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	switch {
	case method == http.MethodPost && path == "/sync/blobs/missing":
		environmentID := asString(payload["environment_id"])
		if environmentID == "" {
			return nil, fmt.Errorf("missing environment_id")
		}
		kind := asString(payload["kind"])
		hashesAny, _ := payload["hashes"].([]string)
		if len(hashesAny) == 0 {
			if raw, ok := payload["hashes"].([]any); ok {
				hashesAny = make([]string, 0, len(raw))
				for _, r := range raw {
					hashesAny = append(hashesAny, asString(r))
				}
			}
		}
		m.missingKinds = append(m.missingKinds, kind)
		missing := make([]string, 0, len(hashesAny))
		for _, hash := range hashesAny {
			key := fmt.Sprintf("user/blobs/%s", hash)
			if !m.metadata[key] {
				missing = append(missing, hash)
			}
		}
		missingAny := make([]any, 0, len(missing))
		for _, hash := range missing {
			missingAny = append(missingAny, hash)
		}
		return map[string]any{"missing": missingAny}, nil

	case method == http.MethodPost && path == "/sync/blobs/upload-url":
		environmentID := asString(payload["environment_id"])
		if environmentID == "" {
			return nil, fmt.Errorf("missing environment_id")
		}
		sizeBytes := asInt64(payload["size_bytes"])
		if sizeBytes <= 0 {
			return nil, fmt.Errorf("missing size_bytes")
		}
		kind := asString(payload["kind"])
		sha := asString(payload["sha256"])
		_ = kind
		key := fmt.Sprintf("user/blobs/%s", sha)
		m.blobUploadCount++
		m.blobKinds = append(m.blobKinds, kind)
		return map[string]any{"key": key, "url": "mock://upload?key=" + url.QueryEscape(key)}, nil

	case method == http.MethodPost && path == "/sync/manifests/upload-url":
		environmentID := asString(payload["environment_id"])
		if environmentID == "" {
			return nil, fmt.Errorf("missing environment_id")
		}
		sizeBytes := asInt64(payload["size_bytes"])
		if sizeBytes <= 0 {
			return nil, fmt.Errorf("missing size_bytes")
		}
		kind := asString(payload["kind"])
		hash := asString(payload["manifest_hash"])
		key := fmt.Sprintf("user/environment/%s/manifests/%s/%s.json", environmentID, kind, hash)
		if kind == "data" {
			key = fmt.Sprintf("user/data/data-%s/manifests/%s.json", environmentID, hash)
		}
		m.manifestUploadCount++
		return map[string]any{"key": key, "url": "mock://upload?key=" + url.QueryEscape(key)}, nil

	case method == http.MethodPost && path == "/sync/commit":
		m.commitCount++
		clone := map[string]any{}
		for k, v := range payload {
			clone[k] = v
		}
		m.commitBodies = append(m.commitBodies, clone)

		codeHash := asString(payload["code_manifest_hash"])
		dataHash := asString(payload["data_manifest_hash"])
		environmentID := asString(payload["environment_id"])
		if environmentID == "" {
			return nil, fmt.Errorf("missing environment_id")
		}
		if codeHash != "" {
			if !m.metadata[fmt.Sprintf("user/environment/%s/manifests/code/%s.json", environmentID, codeHash)] {
				return nil, fmt.Errorf("api error (400): code manifest not found in object storage")
			}
		}
		if dataHash != "" {
			if !m.metadata[fmt.Sprintf("user/data/data-%s/manifests/%s.json", environmentID, dataHash)] {
				return nil, fmt.Errorf("api error (400): data manifest not found in object storage")
			}
		}

		return map[string]any{
			"ok":                 true,
			"environment_id":     asString(payload["environment_id"]),
			"code_manifest_hash": codeHash,
			"data_manifest_hash": dataHash,
		}, nil
	}

	return nil, fmt.Errorf("unexpected call: %s %s", method, path)
}

func (m *syncBackendMock) uploadFile(path, rawURL string, attempts int) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "mock" {
		return fmt.Errorf("unexpected upload url: %s", rawURL)
	}
	key := parsed.Query().Get("key")
	if key == "" {
		return fmt.Errorf("missing key in upload url: %s", rawURL)
	}
	m.mu.Lock()
	m.uploaded[key] = true
	m.metadata[key] = true
	m.mu.Unlock()
	return nil
}

func (m *syncBackendMock) uploadBytes(raw []byte, rawURL, contentType string, attempts int) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "mock" {
		return fmt.Errorf("unexpected upload url: %s", rawURL)
	}
	key := parsed.Query().Get("key")
	if key == "" {
		return fmt.Errorf("missing key in upload url: %s", rawURL)
	}
	m.mu.Lock()
	m.uploaded[key] = true
	m.metadata[key] = true
	m.mu.Unlock()
	return nil
}

func setupTestProject(t *testing.T, withData bool) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "train.py"), []byte("print('hello')\n"), 0o644); err != nil {
		t.Fatalf("failed to write train.py: %v", err)
	}
	if withData {
		if err := os.MkdirAll(filepath.Join(dir, "data"), 0o755); err != nil {
			t.Fatalf("failed to create data dir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, "data", "sample.txt"), []byte("sample\n"), 0o644); err != nil {
			t.Fatalf("failed to write data file: %v", err)
		}
	}
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("failed to chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(cwd)
	})
	return dir
}

func installSyncStubs(t *testing.T, mock *syncBackendMock) {
	t.Helper()
	prevDoJSON := syncDoJSON
	prevUploadFile := syncUploadFileToSignedURLRetry
	prevUploadBytes := syncUploadBytesToSignedURLRetry
	prevPromptChoice := syncPromptChoice
	prevPromptString := syncPromptString
	prevSupportsInteractive := syncSupportsInteractivePrompts
	syncDoJSON = mock.doJSON
	syncUploadFileToSignedURLRetry = mock.uploadFile
	syncUploadBytesToSignedURLRetry = mock.uploadBytes
	syncPromptChoice = promptChoice
	syncPromptString = promptString
	syncSupportsInteractivePrompts = supportsInteractivePrompts
	t.Cleanup(func() {
		syncDoJSON = prevDoJSON
		syncUploadFileToSignedURLRetry = prevUploadFile
		syncUploadBytesToSignedURLRetry = prevUploadBytes
		syncPromptChoice = prevPromptChoice
		syncPromptString = prevPromptString
		syncSupportsInteractivePrompts = prevSupportsInteractive
	})
}

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

	syncSupportsInteractivePrompts = func() bool { return false }
	if err := syncIncremental("env-test", syncScope{data: true}, syncOptions{}); err != nil {
		t.Fatalf("expected changed data sync to proceed without interactive prompts, got: %v", err)
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
