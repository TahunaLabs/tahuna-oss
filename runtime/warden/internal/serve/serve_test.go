package serve

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"warden/internal/runtimeapi"
)

func TestRunEntrypointTransitionsToServingAndStopped(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	healthURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	port := testPort(t, healthURL.Host)

	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	statuses := []string{}

	errCh := make(chan error, 1)
	go func() {
		errCh <- RunEntrypoint(ctx, Config{
			ServeID:                 "serve_123",
			WorkspaceRoot:           root,
			DataDir:                 filepath.Join(root, "data"),
			OutputDir:               filepath.Join(root, "outputs"),
			ModelRoot:               filepath.Join(root, "model"),
			Command:                 []string{"sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 0.1; done"},
			Port:                    port,
			HealthPath:              healthURL.Path,
			StartupTimeout:          2 * time.Second,
			HealthInterval:          50 * time.Millisecond,
			HealthTimeout:           200 * time.Millisecond,
			HealthFailureThreshold:  2,
			GracefulShutdownTimeout: time.Second,
		}, Hooks{
			EmitStatus: func(update runtimeapi.StatusUpdate) error {
				mu.Lock()
				statuses = append(statuses, update.Status)
				mu.Unlock()
				if update.Status == runtimeapi.StatusServing {
					cancel()
				}
				return nil
			},
		})
	}()

	if err := <-errCh; err != nil {
		t.Fatalf("RunEntrypoint returned error: %v", err)
	}

	mu.Lock()
	got := append([]string(nil), statuses...)
	mu.Unlock()
	want := []string{
		runtimeapi.StatusStarting,
		runtimeapi.StatusServing,
		runtimeapi.StatusStopping,
		runtimeapi.StatusStopped,
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("unexpected statuses: got=%v want=%v", got, want)
	}
}

func TestRunEntrypointFailsWhenReadinessTimesOut(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	healthURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	port := testPort(t, healthURL.Host)

	root := t.TempDir()
	err = RunEntrypoint(context.Background(), Config{
		ServeID:                 "serve_123",
		WorkspaceRoot:           root,
		DataDir:                 filepath.Join(root, "data"),
		OutputDir:               filepath.Join(root, "outputs"),
		ModelRoot:               filepath.Join(root, "model"),
		Command:                 []string{"sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 0.1; done"},
		Port:                    port,
		HealthPath:              healthURL.Path,
		StartupTimeout:          250 * time.Millisecond,
		HealthInterval:          50 * time.Millisecond,
		HealthTimeout:           200 * time.Millisecond,
		HealthFailureThreshold:  2,
		GracefulShutdownTimeout: time.Second,
	}, Hooks{})
	if err == nil {
		t.Fatal("expected readiness timeout error")
	}
	if !strings.Contains(err.Error(), "serve readiness timed out") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func testPort(t *testing.T, hostPort string) int {
	t.Helper()
	_, portValue, err := net.SplitHostPort(hostPort)
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}
	value, err := net.LookupPort("tcp", portValue)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return value
}
