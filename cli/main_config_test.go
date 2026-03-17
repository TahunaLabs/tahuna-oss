package main

import (
	"testing"
)

func TestInitConfig_TAHUNA_API_URL_TakesPrecedence(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_API_URL", "https://api.example.com")
	t.Setenv("TAHUNA_SITE_URL", "https://site.example.com")
	t.Setenv("TAHUNA_PUBLIC_SITE_URL", "https://public.example.com")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiURL != "https://api.example.com" {
		t.Fatalf("expected TAHUNA_API_URL to take precedence, got %q", cfg.apiURL)
	}
}

func TestInitConfig_TAHUNA_SITE_URL_Fallback(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_SITE_URL", "https://site.example.com")
	t.Setenv("TAHUNA_PUBLIC_SITE_URL", "https://public.example.com")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiURL != "https://site.example.com" {
		t.Fatalf("expected TAHUNA_SITE_URL fallback, got %q", cfg.apiURL)
	}
}

func TestInitConfig_TAHUNA_PUBLIC_SITE_URL_Fallback(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_SITE_URL", "")
	t.Setenv("TAHUNA_PUBLIC_SITE_URL", "https://public.example.com")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiURL != "https://public.example.com" {
		t.Fatalf("expected TAHUNA_PUBLIC_SITE_URL fallback, got %q", cfg.apiURL)
	}
}

func TestInitConfig_Default_WhenNoEnvVars(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("HOME", t.TempDir())
	t.Setenv("TAHUNA_API_URL", "")
	t.Setenv("TAHUNA_SITE_URL", "")
	t.Setenv("TAHUNA_PUBLIC_SITE_URL", "")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiURL != defaultAPIURL {
		t.Fatalf("expected default API URL %q, got %q", defaultAPIURL, cfg.apiURL)
	}
}

func TestInitConfig_TrimsTrailingSlash(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_API_URL", "https://api.example.com/")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiURL != "https://api.example.com" {
		t.Fatalf("expected trailing slash trimmed, got %q", cfg.apiURL)
	}
}

func TestInitConfig_ResolvesAPIKey(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_API_KEY", "test-key-123")

	cfg = cliConfig{}
	initConfig()

	if cfg.apiKey != "test-key-123" {
		t.Fatalf("expected apiKey=test-key-123, got %q", cfg.apiKey)
	}
}

func TestInitConfig_ResolvesBrowserURL(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	t.Setenv("TAHUNA_BROWSER_URL", "https://browser.example.com")

	cfg = cliConfig{}
	initConfig()

	if cfg.browserURL != "https://browser.example.com" {
		t.Fatalf("expected browserURL=https://browser.example.com, got %q", cfg.browserURL)
	}
}

func TestAPIURL_FallsBackToLookupWhenCfgEmpty(t *testing.T) {
	prevCfg := cfg
	t.Cleanup(func() { cfg = prevCfg })

	cfg = cliConfig{}
	t.Setenv("TAHUNA_API_URL", "https://fallback.example.com")

	got := apiURL()
	if got != "https://fallback.example.com" {
		t.Fatalf("expected apiURL fallback to env var, got %q", got)
	}
}
