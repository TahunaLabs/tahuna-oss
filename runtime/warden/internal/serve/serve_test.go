package serve

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
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

func TestRunEntrypointEmitsSessionHeartbeatWhileServing(t *testing.T) {
	port, healthPath, closeServer := newHealthServer(t, http.StatusOK)
	defer closeServer()

	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var heartbeatCount atomic.Int32
	errCh := make(chan error, 1)
	go func() {
		errCh <- RunEntrypoint(ctx, testServeConfig(
			root,
			port,
			healthPath,
			[]string{"sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 0.1; done"},
			func(cfg *Config) {
				cfg.HealthInterval = 25 * time.Millisecond
				cfg.GracefulShutdownTimeout = time.Second
			},
		), Hooks{
			EmitSessionHeartbeat: func(context.Context) error {
				if heartbeatCount.Add(1) >= 2 {
					cancel()
				}
				return nil
			},
		})
	}()

	if err := <-errCh; err != nil {
		t.Fatalf("RunEntrypoint returned error: %v", err)
	}
	if got := heartbeatCount.Load(); got < 2 {
		t.Fatalf("expected repeated session heartbeats, got %d", got)
	}
}

func TestRunEntrypointFailsWhenReadinessTimesOut(t *testing.T) {
	port, healthPath, closeServer := newHealthServer(t, http.StatusServiceUnavailable)
	defer closeServer()

	root := t.TempDir()
	err := RunEntrypoint(context.Background(), testServeConfig(
		root,
		port,
		healthPath,
		[]string{"sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 0.1; done"},
		func(cfg *Config) {
			cfg.StartupTimeout = 250 * time.Millisecond
			cfg.GracefulShutdownTimeout = time.Second
		},
	), Hooks{})
	if err == nil {
		t.Fatal("expected readiness timeout error")
	}
	if !strings.Contains(err.Error(), "serve readiness timed out") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunEntrypointForceKillsProcessGroupAfterGraceTimeout(t *testing.T) {
	port, healthPath, closeServer := newHealthServer(t, http.StatusOK)
	defer closeServer()

	root := t.TempDir()
	childScript := writeExecutableScript(t, root, "child.sh", `#!/bin/sh
trap '' TERM INT
while :; do
  sleep 0.1
done
`)
	parentScript := writeExecutableScript(t, root, "parent.sh", `#!/bin/sh
trap '' TERM INT
"$1" &
child=$!
printf '%s\n' "$child" > "$2"
while :; do
  sleep 0.1
done
`)
	childPIDFile := filepath.Join(root, "child.pid")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	statuses := []string{}
	errCh := make(chan error, 1)
	go func() {
		errCh <- RunEntrypoint(ctx, testServeConfig(
			root,
			port,
			healthPath,
			[]string{parentScript, childScript, childPIDFile},
			func(cfg *Config) {
				cfg.GracefulShutdownTimeout = 150 * time.Millisecond
			},
		), Hooks{
			EmitStatus: func(update runtimeapi.StatusUpdate) error {
				mu.Lock()
				statuses = append(statuses, update.Status)
				mu.Unlock()
				if update.Status == runtimeapi.StatusServing {
					go func() {
						deadline := time.Now().Add(500 * time.Millisecond)
						for time.Now().Before(deadline) {
							if _, err := os.Stat(childPIDFile); err == nil {
								break
							}
							time.Sleep(10 * time.Millisecond)
						}
						cancel()
					}()
				}
				return nil
			},
		})
	}()

	if err := <-errCh; err != nil {
		t.Fatalf("RunEntrypoint returned error: %v", err)
	}

	childPID := waitForPIDFile(t, childPIDFile, 2*time.Second)
	defer forceKillProcess(t, childPID)
	waitForProcessExit(t, childPID, 2*time.Second)

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

func TestRunEntrypointFailsWhenServeExitsAfterReadiness(t *testing.T) {
	port, healthPath, closeServer := newHealthServer(t, http.StatusOK)
	defer closeServer()

	root := t.TempDir()
	err := RunEntrypoint(context.Background(), testServeConfig(
		root,
		port,
		healthPath,
		[]string{"sh", "-c", "sleep 0.5"},
	), Hooks{})
	if err == nil {
		t.Fatal("expected post-readiness exit error")
	}
	if !strings.Contains(err.Error(), "serve command exited unexpectedly") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunEntrypointFailsWhenStartingStatusCallbackFails(t *testing.T) {
	root := t.TempDir()
	err := RunEntrypoint(context.Background(), testServeConfig(
		root,
		1,
		"",
		[]string{"sh", "-c", "while :; do sleep 0.1; done"},
		func(cfg *Config) {
			cfg.GracefulShutdownTimeout = 150 * time.Millisecond
		},
	), Hooks{
		EmitStatus: func(update runtimeapi.StatusUpdate) error {
			if update.Status == runtimeapi.StatusStarting {
				return errors.New("start callback failed")
			}
			return nil
		},
	})
	if err == nil {
		t.Fatal("expected starting status callback error")
	}
	if !strings.Contains(err.Error(), "emit starting status") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunEntrypointFailsWhenServingStatusCallbackFails(t *testing.T) {
	port, healthPath, closeServer := newHealthServer(t, http.StatusOK)
	defer closeServer()

	root := t.TempDir()
	err := RunEntrypoint(context.Background(), testServeConfig(
		root,
		port,
		healthPath,
		[]string{"sh", "-c", "while :; do sleep 0.1; done"},
		func(cfg *Config) {
			cfg.GracefulShutdownTimeout = 150 * time.Millisecond
		},
	), Hooks{
		EmitStatus: func(update runtimeapi.StatusUpdate) error {
			if update.Status == runtimeapi.StatusServing {
				return errors.New("serving callback failed")
			}
			return nil
		},
	})
	if err == nil {
		t.Fatal("expected serving status callback error")
	}
	if !strings.Contains(err.Error(), "emit serving status") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func newHealthServer(t *testing.T, statusCode int) (int, string, func()) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(statusCode)
	}))
	healthURL, err := url.Parse(server.URL)
	if err != nil {
		server.Close()
		t.Fatalf("parse test server URL: %v", err)
	}
	return testPort(t, healthURL.Host), healthURL.Path, server.Close
}

func testServeConfig(root string, port int, healthPath string, command []string, options ...func(*Config)) Config {
	cfg := Config{
		ServeID:                 "serve_123",
		WorkspaceRoot:           root,
		DataDir:                 filepath.Join(root, "data"),
		OutputDir:               filepath.Join(root, "outputs"),
		ModelRoot:               filepath.Join(root, "model"),
		Command:                 command,
		Port:                    port,
		HealthPath:              healthPath,
		StartupTimeout:          2 * time.Second,
		HealthInterval:          50 * time.Millisecond,
		HealthTimeout:           200 * time.Millisecond,
		HealthFailureThreshold:  2,
		GracefulShutdownTimeout: time.Second,
	}
	for _, option := range options {
		option(&cfg)
	}
	return cfg
}

func writeExecutableScript(t *testing.T, dir, name, contents string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(contents), 0o755); err != nil {
		t.Fatalf("write script %s: %v", path, err)
	}
	return path
}

func waitForPIDFile(t *testing.T, path string, timeout time.Duration) int {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		raw, err := os.ReadFile(path)
		if err == nil {
			pid, convErr := strconv.Atoi(strings.TrimSpace(string(raw)))
			if convErr != nil {
				t.Fatalf("parse child pid: %v", convErr)
			}
			return pid
		}
		if !os.IsNotExist(err) {
			t.Fatalf("read pid file %s: %v", path, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for pid file %s", path)
	return 0
}

func waitForProcessExit(t *testing.T, pid int, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !processExists(pid) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("process %d still alive after %s", pid, timeout)
}

func forceKillProcess(t *testing.T, pid int) {
	t.Helper()

	if pid <= 0 {
		return
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("force kill pid %d: %v", pid, err)
	}
}

func processExists(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
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
