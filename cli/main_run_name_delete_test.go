package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestRunShow_ResolvesByName(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	showCalls := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-abc", "name": "warm-river-fox"},
				},
			})
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs/run-abc":
			mu.Lock()
			showCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run_id": "run-abc",
				"name":   "warm-river-fox",
				"status": "completed",
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
		runShow([]string{"warm-river-fox"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if showCalls != 1 {
		t.Fatalf("expected one run show call, got %d", showCalls)
	}
	if !strings.Contains(output, "Run ID: run-abc") {
		t.Fatalf("expected resolved run output, got: %s", output)
	}
}

func TestRunCancel_ResolvesByName_Force(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	cancelCalls := 0
	forceSeen := false

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-abc", "name": "warm-river-fox"},
				},
			})
			return
		case r.Method == http.MethodPost && r.URL.Path == "/api/runs/run-abc/cancel":
			mu.Lock()
			cancelCalls++
			mu.Unlock()
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("failed decoding cancel payload: %v", err)
			}
			forceSeen = body["force"] == true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"cancel_requested": true,
				"forced":           true,
				"run_id":           "run-abc",
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
		runCancel([]string{"--force", "warm-river-fox"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if cancelCalls != 1 {
		t.Fatalf("expected one run cancel call, got %d", cancelCalls)
	}
	if !forceSeen {
		t.Fatalf("expected force=true in cancel payload")
	}
	if !strings.Contains(output, "Force cancellation requested for run run-abc.") {
		t.Fatalf("expected force cancel confirmation, got: %s", output)
	}
}

func TestRunDelete_CancelFlag_ResolvesByNameAndSetsQuery(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	deleteCalls := 0
	cancelQuerySeen := false
	forceQuerySeen := false

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-abc", "name": "warm-river-fox"},
				},
			})
			return
		case r.Method == http.MethodDelete && r.URL.Path == "/api/runs/run-abc":
			mu.Lock()
			deleteCalls++
			mu.Unlock()
			cancelQuerySeen = r.URL.Query().Get("cancel") == "1"
			forceQuerySeen = r.URL.Query().Get("force") == "1"
			_ = json.NewEncoder(w).Encode(map[string]any{
				"deleted": true,
				"run_id":  "run-abc",
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
		runDelete([]string{"--cancel", "warm-river-fox"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if deleteCalls != 1 {
		t.Fatalf("expected one run delete call, got %d", deleteCalls)
	}
	if !cancelQuerySeen {
		t.Fatalf("expected cancel=1 query param")
	}
	if forceQuerySeen {
		t.Fatalf("did not expect force=1 query param")
	}
	if !strings.Contains(output, "\"deleted\": true") {
		t.Fatalf("expected delete JSON output, got: %s", output)
	}
}

func TestRunDelete_ForceFlag_ResolvesByNameAndSetsQuery(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	deleteCalls := 0
	cancelQuerySeen := false
	forceQuerySeen := false

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-abc", "name": "warm-river-fox"},
				},
			})
			return
		case r.Method == http.MethodDelete && r.URL.Path == "/api/runs/run-abc":
			mu.Lock()
			deleteCalls++
			mu.Unlock()
			cancelQuerySeen = r.URL.Query().Get("cancel") == "1"
			forceQuerySeen = r.URL.Query().Get("force") == "1"
			_ = json.NewEncoder(w).Encode(map[string]any{
				"deleted": true,
				"run_id":  "run-abc",
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
		runDelete([]string{"--force", "warm-river-fox"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if deleteCalls != 1 {
		t.Fatalf("expected one run delete call, got %d", deleteCalls)
	}
	if !cancelQuerySeen {
		t.Fatalf("expected cancel=1 query param for force delete")
	}
	if !forceQuerySeen {
		t.Fatalf("expected force=1 query param")
	}
	if !strings.Contains(output, "\"deleted\": true") {
		t.Fatalf("expected delete JSON output, got: %s", output)
	}
}

func TestRunDelete_MultipleTargets_ResolvesAndDeletesEach(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	deleteCalls := 0
	deletedPaths := make([]string, 0, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-1", "name": "warm-river-fox"},
					{"run_id": "run-2", "name": "amber-valley-panda"},
				},
			})
			return
		case r.Method == http.MethodDelete && (r.URL.Path == "/api/runs/run-1" || r.URL.Path == "/api/runs/run-2"):
			mu.Lock()
			deleteCalls++
			deletedPaths = append(deletedPaths, r.URL.Path)
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"deleted": true,
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
		runDelete([]string{"warm-river-fox", "run-2"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if deleteCalls != 2 {
		t.Fatalf("expected two run delete calls, got %d", deleteCalls)
	}
	if !strings.Contains(strings.Join(deletedPaths, ","), "/api/runs/run-1") {
		t.Fatalf("expected run-1 to be deleted, got paths: %v", deletedPaths)
	}
	if !strings.Contains(strings.Join(deletedPaths, ","), "/api/runs/run-2") {
		t.Fatalf("expected run-2 to be deleted, got paths: %v", deletedPaths)
	}
	if strings.Count(output, "\"deleted\": true") != 2 {
		t.Fatalf("expected two delete JSON outputs, got: %s", output)
	}
}

func TestRunDelete_WildcardTarget_DeletesMatches(t *testing.T) {
	var mu sync.Mutex
	listCalls := 0
	deleteCalls := 0
	deletedPaths := make([]string, 0, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/runs":
			mu.Lock()
			listCalls++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"runs": []map[string]any{
					{"run_id": "run-1", "name": "warm-river-fox"},
					{"run_id": "run-2", "name": "warm-harbor-eagle"},
					{"run_id": "run-3", "name": "amber-valley-panda"},
				},
			})
			return
		case r.Method == http.MethodDelete && (r.URL.Path == "/api/runs/run-1" || r.URL.Path == "/api/runs/run-2"):
			mu.Lock()
			deleteCalls++
			deletedPaths = append(deletedPaths, r.URL.Path)
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"deleted": true,
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
	captureStdout(t, func() {
		runDelete([]string{"warm-*"})
	})

	mu.Lock()
	defer mu.Unlock()
	if listCalls != 1 {
		t.Fatalf("expected one run list call, got %d", listCalls)
	}
	if deleteCalls != 2 {
		t.Fatalf("expected two run delete calls for wildcard, got %d", deleteCalls)
	}
	if !strings.Contains(strings.Join(deletedPaths, ","), "/api/runs/run-1") || !strings.Contains(strings.Join(deletedPaths, ","), "/api/runs/run-2") {
		t.Fatalf("expected wildcard to delete run-1 and run-2, got paths: %v", deletedPaths)
	}
}
