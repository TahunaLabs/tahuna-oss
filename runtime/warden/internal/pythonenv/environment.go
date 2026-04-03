package pythonenv

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	PrebakedVirtualEnvVar = "TAHUNA_PREBAKED_VENV"
	defaultPrebakedVenv   = "/opt/tahuna/venv"
)

func LookupEnvValue(env []string, key string) (string, bool) {
	value := ""
	found := false
	for _, entry := range env {
		name, rawValue, ok := splitEnvEntry(entry)
		if !ok || name != key {
			continue
		}
		value = rawValue
		found = true
	}
	return value, found
}

func ResolvePrebakedVirtualEnvPath(baseEnv []string) (string, bool) {
	venvPath, ok := LookupEnvValue(baseEnv, PrebakedVirtualEnvVar)
	if !ok {
		venvPath = defaultPrebakedVenv
	}
	venvPath = strings.TrimSpace(venvPath)
	if venvPath == "" {
		return "", false
	}
	info, err := os.Stat(venvPath)
	if err != nil || !info.IsDir() {
		return "", false
	}
	return venvPath, true
}

func BuildVirtualEnvEnvironment(baseEnv []string, venvPath string) []string {
	venvBin := filepath.Join(venvPath, "bin")
	pathValue := venvBin
	if existingPath, ok := LookupEnvValue(baseEnv, "PATH"); ok && strings.TrimSpace(existingPath) != "" {
		pathValue = pathValue + string(os.PathListSeparator) + existingPath
	}
	withVirtualEnv := setEnvValue(baseEnv, "VIRTUAL_ENV", venvPath)
	withProjectEnv := setEnvValue(withVirtualEnv, "UV_PROJECT_ENVIRONMENT", venvPath)
	return setEnvValue(withProjectEnv, "PATH", pathValue)
}

func BuildWorkspaceCacheEnvironment(baseEnv []string, workspaceRoot string) []string {
	trimmedRoot := strings.TrimSpace(workspaceRoot)
	if trimmedRoot == "" {
		return append([]string{}, baseEnv...)
	}

	cacheRoot := filepath.Join(trimmedRoot, ".cache")
	hfHome := filepath.Join(cacheRoot, "huggingface")
	hubCache := filepath.Join(hfHome, "hub")

	withCacheRoot := setEnvValueIfMissing(baseEnv, "XDG_CACHE_HOME", cacheRoot)
	withHFHome := setEnvValueIfMissing(withCacheRoot, "HF_HOME", hfHome)
	withHubCache := setEnvValueIfMissing(withHFHome, "HF_HUB_CACHE", hubCache)
	withLegacyHubCache := setEnvValueIfMissing(withHubCache, "HUGGINGFACE_HUB_CACHE", hubCache)
	withXetCache := setEnvValueIfMissing(withLegacyHubCache, "HF_XET_CACHE", filepath.Join(hfHome, "xet"))
	return setEnvValueIfMissing(withXetCache, "HF_DATASETS_CACHE", filepath.Join(hfHome, "datasets"))
}

func MergeEnvironment(baseEnv, overrides []string) []string {
	merged := append([]string{}, baseEnv...)
	for _, entry := range overrides {
		key, value, ok := splitEnvEntry(entry)
		if !ok {
			continue
		}
		merged = setEnvValue(merged, key, value)
	}
	return merged
}

func splitEnvEntry(entry string) (string, string, bool) {
	separator := strings.Index(entry, "=")
	if separator <= 0 {
		return "", "", false
	}
	return entry[:separator], entry[separator+1:], true
}

func setEnvValue(baseEnv []string, key, value string) []string {
	filtered := make([]string, 0, len(baseEnv)+1)
	for _, entry := range baseEnv {
		name, _, ok := splitEnvEntry(entry)
		if ok && name == key {
			continue
		}
		filtered = append(filtered, entry)
	}
	filtered = append(filtered, key+"="+value)
	return filtered
}

func setEnvValueIfMissing(baseEnv []string, key, value string) []string {
	if _, exists := LookupEnvValue(baseEnv, key); exists {
		return append([]string{}, baseEnv...)
	}
	return append(append([]string{}, baseEnv...), key+"="+value)
}
