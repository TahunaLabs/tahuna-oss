package pythonenv

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestBuildWorkspaceCacheEnvironmentSetsHuggingFaceCachesUnderWorkspace(t *testing.T) {
	workspaceRoot := "/workspace"
	resolved := BuildWorkspaceCacheEnvironment([]string{"PATH=/usr/bin"}, workspaceRoot)

	cacheRoot := filepath.Join(workspaceRoot, ".cache")
	hfHome := filepath.Join(cacheRoot, "huggingface")
	hubCache := filepath.Join(hfHome, "hub")
	cases := map[string]string{
		"XDG_CACHE_HOME":        cacheRoot,
		"HF_HOME":               hfHome,
		"HF_HUB_CACHE":          hubCache,
		"HUGGINGFACE_HUB_CACHE": hubCache,
		"HF_XET_CACHE":          filepath.Join(hfHome, "xet"),
		"HF_DATASETS_CACHE":     filepath.Join(hfHome, "datasets"),
	}

	for key, want := range cases {
		got, ok := LookupEnvValue(resolved, key)
		if !ok {
			t.Fatalf("expected %s to be set", key)
		}
		if got != want {
			t.Fatalf("expected %s=%q, got %q", key, want, got)
		}
	}
}

func TestBuildWorkspaceCacheEnvironmentSkipsBlankWorkspaceRoot(t *testing.T) {
	baseEnv := []string{"PATH=/usr/bin", "HF_HOME=/tmp/hf"}
	resolved := BuildWorkspaceCacheEnvironment(baseEnv, "   ")
	if !reflect.DeepEqual(resolved, baseEnv) {
		t.Fatalf("expected environment to remain unchanged, got %#v", resolved)
	}
}
