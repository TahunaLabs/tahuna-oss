package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDoJSONAs_401_ReturnsAPIRequestError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"detail":"invalid or expired token"}`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err == nil {
		t.Fatal("expected error on 401 response")
	}
	var apiErr *apiRequestError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected apiRequestError, got %T: %v", err, err)
	}
	if apiErr.status != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", apiErr.status)
	}
	if !strings.Contains(apiErr.detail, "invalid or expired token") {
		t.Fatalf("expected detail to contain 'invalid or expired token', got: %s", apiErr.detail)
	}
}

func TestDoJSONAs_404_ReturnsAPIRequestError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"detail":"run not found"}`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSONAs[runResponse](http.MethodGet, "/runs/nonexistent", nil)
	if err == nil {
		t.Fatal("expected error on 404 response")
	}
	var apiErr *apiRequestError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected apiRequestError, got %T: %v", err, err)
	}
	if apiErr.status != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", apiErr.status)
	}
}

func TestDoJSONAs_500_ReturnsAPIRequestError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"detail":"internal server error"}`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSONAs[environmentsResponse](http.MethodGet, "/environments", nil)
	if err == nil {
		t.Fatal("expected error on 500 response")
	}
	var apiErr *apiRequestError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected apiRequestError, got %T: %v", err, err)
	}
	if apiErr.status != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", apiErr.status)
	}
}

func TestDoJSONRaw_NonJSONResponse_ReturnsDescriptiveError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><body>not json</body></html>`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err == nil {
		t.Fatal("expected error on non-JSON response")
	}
	if !strings.Contains(err.Error(), "api response was not JSON") {
		t.Fatalf("expected 'api response was not JSON' error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "check TAHUNA_API_URL") {
		t.Fatalf("expected TAHUNA_API_URL hint in error, got: %v", err)
	}
}

func TestDoJSONAs_MalformedJSON_ReturnsUnmarshalError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"runs": "not_an_array"}`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err == nil {
		t.Fatal("expected error on malformed JSON structure")
	}
	if strings.Contains(err.Error(), "api error") {
		t.Fatalf("expected unmarshal error, not API error, got: %v", err)
	}
}

func TestDoJSONAs_EmptyBody_ReturnsZeroValue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	resp, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err != nil {
		t.Fatalf("expected no error on empty body, got: %v", err)
	}
	if len(resp.Runs) != 0 {
		t.Fatalf("expected zero-value response with no runs, got %d", len(resp.Runs))
	}
}

func TestDoJSON_ErrorDetail_ExtractsDetailField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"detail":"gpu_count must be positive","code":"validation_error"}`))
	}))
	defer server.Close()

	t.Setenv("TAHUNA_API_URL", server.URL)

	_, err := doJSON(http.MethodPost, "/environments", map[string]any{"gpu_count": -1})
	if err == nil {
		t.Fatal("expected error on 400 response")
	}
	var apiErr *apiRequestError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected apiRequestError, got %T: %v", err, err)
	}
	if apiErr.detail != "gpu_count must be positive" {
		t.Fatalf("expected detail extracted from JSON, got: %s", apiErr.detail)
	}
}
