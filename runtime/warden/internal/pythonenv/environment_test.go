package pythonenv

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildVirtualEnvEnvironmentSetsCanonicalRuntimePaths(t *testing.T) {
	baseEnv := []string{"PATH=/usr/bin:/bin"}
	venvPath := "/workspace/.venv"

	resolved := BuildVirtualEnvEnvironment(baseEnv, venvPath)

	virtualEnv, ok := LookupEnvValue(resolved, "VIRTUAL_ENV")
	if !ok || virtualEnv != venvPath {
		t.Fatalf("expected VIRTUAL_ENV=%q, got %q (ok=%v)", venvPath, virtualEnv, ok)
	}

	projectEnv, ok := LookupEnvValue(resolved, "UV_PROJECT_ENVIRONMENT")
	if !ok || projectEnv != venvPath {
		t.Fatalf("expected UV_PROJECT_ENVIRONMENT=%q, got %q (ok=%v)", venvPath, projectEnv, ok)
	}

	pathValue, ok := LookupEnvValue(resolved, "PATH")
	wantPath := filepath.Join(venvPath, "bin") + string(os.PathListSeparator) + "/usr/bin:/bin"
	if !ok || pathValue != wantPath {
		t.Fatalf("expected PATH=%q, got %q (ok=%v)", wantPath, pathValue, ok)
	}
}

func TestMergeEnvironmentOverridesByKey(t *testing.T) {
	merged := MergeEnvironment(
		[]string{"PATH=/usr/bin", "WANDB_PROJECT=old"},
		[]string{"WANDB_PROJECT=new", "HF_TOKEN=secret"},
	)

	if got, ok := LookupEnvValue(merged, "WANDB_PROJECT"); !ok || got != "new" {
		t.Fatalf("expected WANDB_PROJECT=new, got %q (ok=%v)", got, ok)
	}
	if got, ok := LookupEnvValue(merged, "HF_TOKEN"); !ok || got != "secret" {
		t.Fatalf("expected HF_TOKEN=secret, got %q (ok=%v)", got, ok)
	}
}
