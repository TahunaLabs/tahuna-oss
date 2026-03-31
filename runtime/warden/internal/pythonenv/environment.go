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
	return setEnvValue(withVirtualEnv, "PATH", pathValue)
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
