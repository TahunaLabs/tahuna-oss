package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResolveRunDeleteTargets_NoTargetsNoAll_ReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"runs": []map[string]any{}})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := resolveRunDeleteTargets(nil, false)
	if err == nil {
		t.Fatal("expected error when no targets and --all not set")
	}
	if !strings.Contains(err.Error(), "run_id_or_name is required") {
		t.Fatalf("expected usage hint, got: %v", err)
	}
}

func TestResolveRunDeleteTargets_All_ReturnsAllRuns(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"runs": []map[string]any{
				{"run_id": "run-1", "name": "alpha"},
				{"run_id": "run-2", "name": "bravo"},
				{"run_id": "run-3", "name": "charlie"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	ids, err := resolveRunDeleteTargets(nil, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ids) != 3 {
		t.Fatalf("expected 3 runs, got %d", len(ids))
	}
}

func TestResolveRunDeleteTargets_WildcardNoMatch_ReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"runs": []map[string]any{
				{"run_id": "run-1", "name": "alpha"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := resolveRunDeleteTargets([]string{"zzz-*"}, false)
	if err == nil {
		t.Fatal("expected error when wildcard matches no runs")
	}
	if !strings.Contains(err.Error(), "matched no runs") {
		t.Fatalf("expected 'matched no runs' error, got: %v", err)
	}
}

func TestResolveRunDeleteTargets_DuplicateTargets_Deduplicates(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"runs": []map[string]any{
				{"run_id": "run-1", "name": "alpha"},
				{"run_id": "run-2", "name": "bravo"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	ids, err := resolveRunDeleteTargets([]string{"run-1", "alpha"}, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("expected deduplicated to 1 run, got %d: %v", len(ids), ids)
	}
	if ids[0] != "run-1" {
		t.Fatalf("expected run-1, got %s", ids[0])
	}
}

func TestResolveRunDeleteTargets_AmbiguousName_ReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"runs": []map[string]any{
				{"run_id": "run-1", "name": "same-name"},
				{"run_id": "run-2", "name": "same-name"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := resolveRunDeleteTargets([]string{"same-name"}, false)
	if err == nil {
		t.Fatal("expected error on ambiguous name")
	}
	if !strings.Contains(err.Error(), "multiple runs found") {
		t.Fatalf("expected 'multiple runs found' error, got: %v", err)
	}
}

func TestResolveRunDeleteTargets_NotFound_ReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"runs": []map[string]any{
				{"run_id": "run-1", "name": "alpha"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := resolveRunDeleteTargets([]string{"nonexistent"}, false)
	if err == nil {
		t.Fatal("expected error when target not found")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected 'not found' error, got: %v", err)
	}
}

func TestReverseSlice_PreservesOriginal(t *testing.T) {
	original := []string{"a", "b", "c"}
	reversed := reverseSlice(original)
	if reversed[0] != "c" || reversed[1] != "b" || reversed[2] != "a" {
		t.Fatalf("expected [c b a], got %v", reversed)
	}
	if original[0] != "a" || original[1] != "b" || original[2] != "c" {
		t.Fatalf("reverseSlice mutated original: %v", original)
	}
}

func TestReverseSlice_Empty(t *testing.T) {
	reversed := reverseSlice([]int{})
	if len(reversed) != 0 {
		t.Fatalf("expected empty slice, got %v", reversed)
	}
}

func TestTruncateRunListColumn_ShortValue(t *testing.T) {
	if got := truncateRunListColumn("short", 24); got != "short" {
		t.Fatalf("expected 'short', got %q", got)
	}
}

func TestTruncateRunListColumn_LongValue(t *testing.T) {
	long := "this-is-a-very-long-run-name-that-exceeds"
	got := truncateRunListColumn(long, 24)
	if len(got) != 24 {
		t.Fatalf("expected length 24, got %d: %q", len(got), got)
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("expected truncated value to end with ..., got %q", got)
	}
}

func TestFormatUnixMillis_Zero(t *testing.T) {
	if got := formatUnixMillis(0); got != "-" {
		t.Fatalf("expected '-' for zero timestamp, got %q", got)
	}
}

func TestFormatUnixMillis_Negative(t *testing.T) {
	if got := formatUnixMillis(-1); got != "-" {
		t.Fatalf("expected '-' for negative timestamp, got %q", got)
	}
}

func TestFormatUnixMillis_ValidTimestamp(t *testing.T) {
	got := formatUnixMillis(1773159359016)
	if got == "-" || got == "" {
		t.Fatalf("expected formatted timestamp, got %q", got)
	}
	if !strings.Contains(got, "2026") {
		t.Fatalf("expected year 2026 in formatted timestamp, got %q", got)
	}
}

func TestIsTerminalRunStatus(t *testing.T) {
	for _, status := range []string{"completed", "failed", "cancelled"} {
		if !isTerminalRunStatus(status) {
			t.Fatalf("expected %q to be terminal", status)
		}
	}
	for _, status := range []string{"running", "queued", "pending", ""} {
		if isTerminalRunStatus(status) {
			t.Fatalf("expected %q to not be terminal", status)
		}
	}
}
