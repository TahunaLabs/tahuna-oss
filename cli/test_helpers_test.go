package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// captureStdout redirects os.Stdout to a pipe, runs fn, then returns everything
// written to stdout as a string. Used by most test files.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("failed to create stdout pipe: %v", err)
	}
	os.Stdout = w

	done := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		_, _ = io.Copy(&buf, r)
		done <- buf.String()
	}()

	defer func() {
		os.Stdout = oldStdout
		_ = r.Close()
	}()

	fn()

	_ = w.Close()
	return <-done
}

// serveGpusAndEnvironment handles /api/gpus and /api/environments/env-test
// requests used by runtime validation. Returns true if the request was handled.
func serveGpusAndEnvironment(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet && r.URL.Path == "/api/gpus" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"gpus": []map[string]any{
				{"id": "NVIDIA A100 80GB", "display_name": "NVIDIA A100 80GB", "max_gpu_count": 8, "memory_gb": 80},
				{"id": "nvidia-a100", "display_name": "nvidia-a100", "max_gpu_count": 8, "memory_gb": 80},
			},
			"images": map[string]any{
				"pt": map[string]any{
					"2.8.0-cu128": map[string]any{
						"3.11": "docker.io/test/tahuna:pt-2.8.0-cu128-py3.11",
						"3.12": "docker.io/test/tahuna:pt-2.8.0-cu128-py3.12",
					},
				},
			},
		})
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/environments/env-test" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"environment_id": "env-test",
			"name":           "test",
			"gpu_type":       "NVIDIA A100 80GB",
			"gpu_count":      1,
			"volume_gb":      80,
			"framework":      "pt",
			"version":        "2.8.0-cu128",
			"python_version": "3.11",
		})
		return true
	}
	return false
}

// setupTestProject creates a minimal Tahuna project in a temp directory,
// writes the canonical root files plus a saved config, changes cwd to the
// project directory, and restores cwd on cleanup.
func setupTestProject(t *testing.T, withData bool) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "train.py"), []byte("print('hello')\n"), 0o644); err != nil {
		t.Fatalf("failed to write train.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "inference.py"), []byte("print('ready')\n"), 0o644); err != nil {
		t.Fatalf("failed to write inference.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "pyproject.toml"), []byte("[project]\nname = \"test\"\nversion = \"0.1.0\"\nrequires-python = \">=3.11\"\n"), 0o644); err != nil {
		t.Fatalf("failed to write pyproject.toml: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "uv.lock"), []byte("version = 1\nrequires-python = \">=3.11\"\n"), 0o644); err != nil {
		t.Fatalf("failed to write uv.lock: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "data"), 0o755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "outputs"), 0o755); err != nil {
		t.Fatalf("failed to create outputs dir: %v", err)
	}
	if withData {
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
	if err := saveProjectConfig(projectConfig{
		DataDir:                   "data",
		OutputDir:                 "outputs",
		Framework:                 "pt",
		FrameworkVersion:          "2.8.0-cu128",
		PythonVersion:             "3.11",
		GPUType:                   "NVIDIA A100 80GB",
		GPUCount:                  1,
		VolumeGB:                  80,
		TrainOutputModelPath:      "outputs/model",
		TrainDependencyConfigured: true,
		ServeGPUType:              "NVIDIA A100 80GB",
		ServeGPUCount:             1,
		ServeVolumeGB:             80,
		ServeDependencyConfigured: true,
	}); err != nil {
		t.Fatalf("failed to save project config: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(cwd)
	})
	return dir
}

// syncBackendMock simulates the sync backend for testing incremental sync,
// blob upload, and commit flows.
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

// installSyncStubs installs the sync backend mock stubs and restores the
// originals on cleanup.
func installSyncStubs(t *testing.T, mock *syncBackendMock) {
	t.Helper()
	prevDoJSON := syncDoJSON
	prevUploadFile := syncUploadFileToSignedURLRetry
	prevUploadBytes := syncUploadBytesToSignedURLRetry
	syncDoJSON = mock.doJSON
	syncUploadFileToSignedURLRetry = mock.uploadFile
	syncUploadBytesToSignedURLRetry = mock.uploadBytes
	t.Cleanup(func() {
		syncDoJSON = prevDoJSON
		syncUploadFileToSignedURLRetry = prevUploadFile
		syncUploadBytesToSignedURLRetry = prevUploadBytes
	})
}
