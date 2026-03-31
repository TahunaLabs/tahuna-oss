package main

import (
	"os"
	"path/filepath"
	"testing"
)

func setTestArgv0(t *testing.T, value string) {
	t.Helper()
	prev := os.Args
	next := append([]string{}, prev...)
	if len(next) == 0 {
		next = []string{value}
	} else {
		next[0] = value
	}
	os.Args = next
	t.Cleanup(func() { os.Args = prev })
}

func TestInitConfig_ResolvesProdDefaultsForTahunaBinary(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna")

	t.Setenv("HOME", t.TempDir())
	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_CONFIG_DIR", "")
	t.Setenv("TAHUNA_API_KEY", "")
	t.Setenv("TAHUNA_BROWSER_URL", "")

	cfg = cliConfig{}
	if err := initConfig(); err != nil {
		t.Fatalf("initConfig failed: %v", err)
	}

	if cfg.apiURL != defaultAPIURL {
		t.Fatalf("expected default API URL %q, got %q", defaultAPIURL, cfg.apiURL)
	}
}

func TestInitConfig_ResolvesDevDefaultsForTahunaDevBinary(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna-dev")

	t.Setenv("HOME", t.TempDir())
	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_CONFIG_DIR", "")
	t.Setenv("TAHUNA_API_KEY", "")
	t.Setenv("TAHUNA_BROWSER_URL", "")

	cfg = cliConfig{}
	if err := initConfig(); err != nil {
		t.Fatalf("initConfig failed: %v", err)
	}

	if cfg.apiURL != defaultDevAPIURL {
		t.Fatalf("expected default dev API URL %q, got %q", defaultDevAPIURL, cfg.apiURL)
	}
}

func TestInitConfig_TAHUNA_API_URL_TakesPrecedence(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna")

	t.Setenv("TAHUNA_API_URL", "https://api.example.com/")

	cfg = cliConfig{}
	if err := initConfig(); err != nil {
		t.Fatalf("initConfig failed: %v", err)
	}

	if cfg.apiURL != "https://api.example.com" {
		t.Fatalf("expected TAHUNA_API_URL to take precedence, got %q", cfg.apiURL)
	}
}

func TestInitConfig_ResolvesAPIKey(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna")

	t.Setenv("TAHUNA_API_KEY", "test-key-123")

	cfg = cliConfig{}
	if err := initConfig(); err != nil {
		t.Fatalf("initConfig failed: %v", err)
	}

	if cfg.apiKey != "test-key-123" {
		t.Fatalf("expected apiKey=test-key-123, got %q", cfg.apiKey)
	}
}

func TestInitConfig_ResolvesBrowserURL(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna")

	t.Setenv("TAHUNA_BROWSER_URL", "https://browser.example.com")

	cfg = cliConfig{}
	if err := initConfig(); err != nil {
		t.Fatalf("initConfig failed: %v", err)
	}

	if cfg.browserURL != "https://browser.example.com" {
		t.Fatalf("expected browserURL=https://browser.example.com, got %q", cfg.browserURL)
	}
}

func TestInitConfig_ProdBinaryRejectsLocalhostAPI(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna")

	t.Setenv("TAHUNA_API_URL", "http://localhost:3000")

	cfg = cliConfig{}
	err := initConfig()
	if err == nil {
		t.Fatal("expected initConfig to fail for localhost API in tahuna mode")
	}
}

func TestInitConfig_DevBinaryRejectsProdAPI(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })
	setTestArgv0(t, "tahuna-dev")

	t.Setenv("TAHUNA_API_URL", "https://tahuna.app")

	cfg = cliConfig{}
	err := initConfig()
	if err == nil {
		t.Fatal("expected initConfig to fail for prod API in tahuna-dev mode")
	}
}

func TestAPIURL_FallsBackToEnvWhenCfgEmpty(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	cfg = cliConfig{}
	t.Setenv("TAHUNA_API_URL", "https://fallback.example.com")

	got := apiURL()
	if got != "https://fallback.example.com" {
		t.Fatalf("expected apiURL fallback to env var, got %q", got)
	}
}

func TestDefaultEnvFilePath_UsesModeSpecificDefaultDir(t *testing.T) {
	setTestArgv0(t, "tahuna-dev")
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("TAHUNA_CONFIG_DIR", "")

	got := defaultEnvFilePath()
	want := filepath.Join(home, ".config", "tahuna-dev", "config.env")
	if got != want {
		t.Fatalf("expected mode-specific config path %q, got %q", want, got)
	}
}
