package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type envVarSetPayload struct {
	EnvironmentID string           `json:"environment_id"`
	EnvVars       []envVarSetInput `json:"env_vars"`
}

func setupLinkedEnvironmentForEnvVarTest(t *testing.T, environmentID string) {
	t.Helper()

	dir := t.TempDir()
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
	if err := saveLinkedEnvironmentID(environmentID); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}
}

func setupEnvVarServer(
	t *testing.T,
	environmentID string,
	handler func(w http.ResponseWriter, r *http.Request),
) {
	t.Helper()

	setupLinkedEnvironmentForEnvVarTest(t, environmentID)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		handler(w, r)
	}))
	t.Cleanup(server.Close)
	t.Setenv("TAHUNA_API_URL", server.URL)
}

func writeNotFound(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	_ = json.NewEncoder(w).Encode(map[string]any{"detail": "not found"})
}

func TestEnvVarList_DefaultHumanReadable(t *testing.T) {
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/env_vars" && r.URL.Query().Get("environment_id") == "env-test" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"env_vars": []map[string]any{
					{"name": "HF_TOKEN"},
					{"name": "WANDB_PROJECT"},
				},
			})
			return
		}
		writeNotFound(w)
	})

	output := captureStdout(t, func() {
		envVarList(nil)
	})

	if !strings.Contains(output, "NAME") || !strings.Contains(output, "HF_TOKEN") || !strings.Contains(output, "WANDB_PROJECT") {
		t.Fatalf("expected env var list output, got: %s", output)
	}
}

func TestEnvVarGet_DefaultHumanReadable(t *testing.T) {
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet &&
			r.URL.Path == "/api/env_vars/WANDB_API_KEY" &&
			r.URL.Query().Get("environment_id") == "env-test" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":  "WANDB_API_KEY",
				"value": "secret-value",
			})
			return
		}
		writeNotFound(w)
	})

	output := captureStdout(t, func() {
		envVarGet([]string{"WANDB_API_KEY"})
	})

	if strings.TrimSpace(output) != "WANDB_API_KEY=secret-value" {
		t.Fatalf("unexpected env var get output: %q", output)
	}
}

func TestEnvVarSet_NameEqualsValue(t *testing.T) {
	var payload envVarSetPayload
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/env_vars" {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("failed to decode payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"env_vars": []map[string]any{{"name": "HF_TOKEN"}},
			})
			return
		}
		writeNotFound(w)
	})

	output := captureStdout(t, func() {
		envVarSet([]string{"HF_TOKEN=hf-secret"})
	})

	if payload.EnvironmentID != "env-test" {
		t.Fatalf("expected environment_id=env-test, got %q", payload.EnvironmentID)
	}
	if len(payload.EnvVars) != 1 || payload.EnvVars[0].Name != "HF_TOKEN" || payload.EnvVars[0].Value != "hf-secret" {
		t.Fatalf("unexpected payload: %#v", payload.EnvVars)
	}
	if !strings.Contains(output, "Set env var: HF_TOKEN") {
		t.Fatalf("expected success output, got: %s", output)
	}
	if strings.Contains(output, "hf-secret") {
		t.Fatalf("set output must not print the secret value: %s", output)
	}
}

func TestEnvVarSet_ValueFlag(t *testing.T) {
	var payload envVarSetPayload
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/env_vars" {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("failed to decode payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"env_vars": []map[string]any{{"name": "WANDB_BASE_URL"}},
			})
			return
		}
		writeNotFound(w)
	})

	output := captureStdout(t, func() {
		envVarSet([]string{"WANDB_BASE_URL", "--value", "https://api.wandb.ai"})
	})

	if payload.EnvironmentID != "env-test" {
		t.Fatalf("expected environment_id=env-test, got %q", payload.EnvironmentID)
	}
	if len(payload.EnvVars) != 1 || payload.EnvVars[0].Name != "WANDB_BASE_URL" || payload.EnvVars[0].Value != "https://api.wandb.ai" {
		t.Fatalf("unexpected payload: %#v", payload.EnvVars)
	}
	if !strings.Contains(output, "Set env var: WANDB_BASE_URL") {
		t.Fatalf("expected success output, got: %s", output)
	}
}

func TestEnvVarSet_DefaultFileLookupPrefersEnvLocal(t *testing.T) {
	var payload envVarSetPayload
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/env_vars" {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("failed to decode payload: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"env_vars": []map[string]any{
					{"name": "HF_TOKEN"},
					{"name": "WANDB_PROJECT"},
				},
			})
			return
		}
		writeNotFound(w)
	})

	tempDir := t.TempDir()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, ".env.local"), []byte("HF_TOKEN=from-local\nWANDB_PROJECT=\"local project\"\n"), 0o644); err != nil {
		t.Fatalf("failed to write .env.local: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("HF_TOKEN=from-env\n"), 0o644); err != nil {
		t.Fatalf("failed to write .env: %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("failed to chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(cwd)
	})
	if err := saveLinkedEnvironmentID("env-test"); err != nil {
		t.Fatalf("failed to save linked environment id: %v", err)
	}

	output := captureStdout(t, func() {
		envVarSet(nil)
	})

	if payload.EnvironmentID != "env-test" {
		t.Fatalf("expected environment_id=env-test, got %q", payload.EnvironmentID)
	}
	if len(payload.EnvVars) != 2 {
		t.Fatalf("expected two env vars, got %#v", payload.EnvVars)
	}
	if payload.EnvVars[0].Name != "HF_TOKEN" || payload.EnvVars[0].Value != "from-local" {
		t.Fatalf("expected .env.local HF_TOKEN, got %#v", payload.EnvVars[0])
	}
	if payload.EnvVars[1].Name != "WANDB_PROJECT" || payload.EnvVars[1].Value != "local project" {
		t.Fatalf("expected parsed quoted value, got %#v", payload.EnvVars[1])
	}
	if !strings.Contains(output, ".env.local") {
		t.Fatalf("expected output to mention .env.local, got: %s", output)
	}
}

func TestParseEnvVarFileSupportsCommentsAndDuplicates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vars.env")
	if err := os.WriteFile(path, []byte(strings.Join([]string{
		"# comment",
		"export HF_TOKEN=one",
		"WANDB_PROJECT=\"two words\"",
		"HF_TOKEN=three # later value wins",
		"",
	}, "\n")), 0o644); err != nil {
		t.Fatalf("failed to write env file: %v", err)
	}

	inputs, err := parseEnvVarFile(path)
	if err != nil {
		t.Fatalf("parseEnvVarFile returned error: %v", err)
	}
	if len(inputs) != 2 {
		t.Fatalf("expected two env vars, got %#v", inputs)
	}
	if inputs[0].Name != "HF_TOKEN" || inputs[0].Value != "three" {
		t.Fatalf("expected duplicate to keep latest value, got %#v", inputs[0])
	}
	if inputs[1].Name != "WANDB_PROJECT" || inputs[1].Value != "two words" {
		t.Fatalf("expected quoted value preserved, got %#v", inputs[1])
	}
}

func TestEnvVarRemove(t *testing.T) {
	setupEnvVarServer(t, "env-test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete &&
			r.URL.Path == "/api/env_vars/HF_TOKEN" &&
			r.URL.Query().Get("environment_id") == "env-test" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":    "HF_TOKEN",
				"deleted": true,
			})
			return
		}
		writeNotFound(w)
	})

	output := captureStdout(t, func() {
		envVarRemove([]string{"HF_TOKEN"})
	})

	if !strings.Contains(output, "Removed env var: HF_TOKEN") {
		t.Fatalf("expected remove output, got: %s", output)
	}
}
