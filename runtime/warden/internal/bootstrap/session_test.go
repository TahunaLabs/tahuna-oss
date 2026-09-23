package bootstrap

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"warden/internal/config"
	"warden/internal/runtimeapi"
)

func TestSessionStartupRecoversFromLostHeartbeatResponse(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var heartbeats, assignments atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.Path {
		case "/api/compute_sessions/session_123/runtime/heartbeat":
			if heartbeats.Add(1) == 1 {
				closeHeartbeatConnection(t, w)
				return
			}
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/api/compute_sessions/session_123/runtime/assignment":
			assignments.Add(1)
			cancel()
			_, _ = w.Write([]byte(`{"run_id":""}`))
		default:
			t.Errorf("unexpected request: %s %s", req.Method, req.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	runner := &Runner{api: runtimeapi.NewSession(server.URL, "session_123", "test-token", time.Second)}
	if err := runner.runSession(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation after assignment polling, got %v", err)
	}
	if heartbeats.Load() != 2 || assignments.Load() != 1 {
		t.Fatalf("expected two heartbeats and one assignment poll, got %d and %d", heartbeats.Load(), assignments.Load())
	}
}

func TestSessionStartupHeartbeatRetryLimits(t *testing.T) {
	for _, tc := range []struct {
		name     string
		status   int
		attempts int32
	}{
		{name: "transport failure", attempts: config.SessionHeartbeatRetryAttempts},
		{name: "authentication failure", status: http.StatusUnauthorized, attempts: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				if tc.status == 0 {
					closeHeartbeatConnection(t, w)
					return
				}
				w.WriteHeader(tc.status)
			}))
			defer server.Close()
			runner := &Runner{api: runtimeapi.NewSession(server.URL, "session_123", "test-token", time.Second)}
			if err := runner.emitInitialSessionHeartbeat(context.Background()); err == nil {
				t.Fatal("expected heartbeat failure")
			}
			if got := calls.Load(); got != tc.attempts {
				t.Fatalf("expected %d attempts, got %d", tc.attempts, got)
			}
		})
	}
}

func TestSessionStartupHeartbeatStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		cancel()
		closeHeartbeatConnection(t, w)
	}))
	defer server.Close()
	runner := &Runner{api: runtimeapi.NewSession(server.URL, "session_123", "test-token", time.Second)}
	if err := runner.emitInitialSessionHeartbeat(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context cancellation, got %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected one attempt, got %d", calls.Load())
	}
}

func closeHeartbeatConnection(t *testing.T, w http.ResponseWriter) {
	t.Helper()
	conn, _, err := w.(http.Hijacker).Hijack()
	if err != nil {
		t.Errorf("hijack heartbeat connection: %v", err)
		return
	}
	_ = conn.Close()
}
