package artifacts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"warden/internal/runtimeapi"
)

type fakeAPI struct {
	uploads   []runtimeapi.ArtifactUpload
	committed []string
}

func (f *fakeAPI) GetArtifactUploadURLs(_ context.Context, _ []runtimeapi.ArtifactRequest) ([]runtimeapi.ArtifactUpload, error) {
	return f.uploads, nil
}

func (f *fakeAPI) CommitArtifacts(_ context.Context, keys []string) (int, error) {
	f.committed = append(f.committed, keys...)
	return len(keys), nil
}

func TestSyncUploadsAndCommitsArtifacts(t *testing.T) {
	received := 0
	putServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("expected PUT, got %s", r.Method)
		}
		received += 1
		w.WriteHeader(http.StatusOK)
	}))
	defer putServer.Close()

	workspace := t.TempDir()
	outputs := filepath.Join(workspace, "outputs")
	if err := os.MkdirAll(outputs, 0o755); err != nil {
		t.Fatalf("mkdir outputs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outputs, "metrics.json"), []byte(`{"loss":0.1}`), 0o644); err != nil {
		t.Fatalf("write output file: %v", err)
	}

	api := &fakeAPI{
		uploads: []runtimeapi.ArtifactUpload{
			{
				Name: "metrics.json",
				Key:  "runs/run_123/outputs/metrics.json",
				URL:  putServer.URL,
			},
		},
	}
	result := Sync(context.Background(), api, outputs, 5*time.Second, nil)
	if result.Uploaded != 1 {
		t.Fatalf("expected uploaded=1, got %d", result.Uploaded)
	}
	if received != 1 {
		t.Fatalf("expected one upload request, got %d", received)
	}
	if len(api.committed) != 1 {
		t.Fatalf("expected one committed key, got %d", len(api.committed))
	}
}

func TestSyncSkipsMissingOutputsDir(t *testing.T) {
	api := &fakeAPI{}
	result := Sync(context.Background(), api, filepath.Join(t.TempDir(), "outputs"), 5*time.Second, nil)
	if result.Uploaded != 0 {
		t.Fatalf("expected uploaded=0, got %d", result.Uploaded)
	}
}
