package train

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeCommandDefaultsToUVTrain(t *testing.T) {
	got := NormalizeCommand(nil)
	want := []string{"uv", "run", "--active", "--no-sync", "python", "-u", "train.py"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected default command: %#v", got)
	}
}

func TestNormalizeCommandWrapsPythonWithUV(t *testing.T) {
	got := NormalizeCommand([]string{"python", "train.py"})
	want := []string{"uv", "run", "--active", "--no-sync", "python", "-u", "train.py"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected normalized command: %#v", got)
	}
}

func TestNormalizeCommandAddsUVRunFlags(t *testing.T) {
	got := NormalizeCommand([]string{"uv", "run", "python", "train.py"})
	want := []string{"uv", "run", "--active", "--no-sync", "python", "train.py"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected normalized uv run command: %#v", got)
	}
}

func TestNormalizeCommandLeavesNonUVCommandUntouched(t *testing.T) {
	input := []string{"bash", "-lc", "python train.py"}
	got := NormalizeCommand(input)
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("unexpected normalized command: %#v", got)
	}
}

func TestLoadCommandFromConfigReadsYamlCommand(t *testing.T) {
	root := t.TempDir()
	content := "command:\n  - python\n  - train.py\n  - --epochs\n  - \"3\"\n"
	if err := os.WriteFile(filepath.Join(root, "config.yaml"), []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	command, source := LoadCommandFromConfig(root)
	want := []string{"python", "train.py", "--epochs", "3"}
	if !reflect.DeepEqual(command, want) {
		t.Fatalf("unexpected command: %#v", command)
	}
	if source == "" {
		t.Fatal("expected config source path")
	}
}

func TestResolveTrainEnvironmentInjectsRuntimeTokenForTahunaBaseURL(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.tahuna.ai/api/monitoring/wandb",
		"PATH=/usr/bin",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	value, ok := lookupEnvValue(resolved, "WANDB_API_KEY")
	if !ok {
		t.Fatal("expected WANDB_API_KEY to be injected")
	}
	if value != "runtime-token-123" {
		t.Fatalf("unexpected WANDB_API_KEY value: %q", value)
	}
}

func TestResolveTrainEnvironmentSkipsInjectionWhenWandbAPIKeyAlreadySet(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.tahuna.ai/api/monitoring/wandb",
		"WANDB_API_KEY=user-key",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	value, ok := lookupEnvValue(resolved, "WANDB_API_KEY")
	if !ok {
		t.Fatal("expected WANDB_API_KEY to remain set")
	}
	if value != "user-key" {
		t.Fatalf("expected user WANDB_API_KEY to win, got %q", value)
	}
}

func TestResolveTrainEnvironmentSkipsInjectionWhenBaseURLIsNonTahuna(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.wandb.ai",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	if _, ok := lookupEnvValue(resolved, "WANDB_API_KEY"); ok {
		t.Fatal("did not expect WANDB_API_KEY to be injected for non-Tahuna base URL")
	}
}

func TestIsTahunaWandbBaseURL(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{
			name:  "absolute URL with exact path",
			value: "https://api.tahuna.ai/api/monitoring/wandb",
			want:  true,
		},
		{
			name:  "absolute URL with trailing slash",
			value: "https://api.tahuna.ai/api/monitoring/wandb/",
			want:  true,
		},
		{
			name:  "relative path",
			value: "/api/monitoring/wandb",
			want:  true,
		},
		{
			name:  "different path",
			value: "https://api.tahuna.ai/api/monitoring/other",
			want:  false,
		},
		{
			name:  "wandb SaaS URL",
			value: "https://api.wandb.ai",
			want:  false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isTahunaWandbBaseURL(tc.value)
			if got != tc.want {
				t.Fatalf("isTahunaWandbBaseURL(%q) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}

func TestInstallDependenciesSelectiveSyncSuccess(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "uv.lock"), []byte("version = 1\n"), 0o644); err != nil {
		t.Fatalf("write uv.lock: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(prebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision,torchaudio,triton")

	previousEnsure := ensureUVCommand
	previousRunner := runCommand
	defer func() {
		ensureUVCommand = previousEnsure
		runCommand = previousRunner
	}()

	ensureUVCommand = func(context.Context, string, Hooks) error { return nil }

	commands := make([][]string, 0, 2)
	commandEnvs := make([][]string, 0, 2)
	runCommand = func(
		_ context.Context,
		_ string,
		command []string,
		_ Hooks,
		_ bool,
		extraEnv []string,
	) (int, error) {
		commands = append(commands, append([]string{}, command...))
		commandEnvs = append(commandEnvs, append([]string{}, extraEnv...))
		return 0, nil
	}

	if err := InstallDependencies(context.Background(), root, Hooks{}); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	if len(commands) != 1 {
		t.Fatalf("expected one sync command, got %d", len(commands))
	}
	commandText := strings.Join(commands[0], " ")
	for _, token := range []string{"uv", "sync", "--active", "--frozen", "--no-dev", "--inexact", "--no-install-package torch", "--no-install-package torchvision", "--no-install-package torchaudio", "--no-install-package triton"} {
		if !strings.Contains(commandText, token) {
			t.Fatalf("expected selective command to include %q, got %q", token, commandText)
		}
	}

	if len(commandEnvs) != 1 {
		t.Fatalf("expected one env payload, got %d", len(commandEnvs))
	}
	virtualEnv, ok := lookupEnvValue(commandEnvs[0], "VIRTUAL_ENV")
	if !ok || virtualEnv != venvPath {
		t.Fatalf("expected VIRTUAL_ENV=%q, got %q", venvPath, virtualEnv)
	}
	pathValue, ok := lookupEnvValue(commandEnvs[0], "PATH")
	if !ok {
		t.Fatal("expected PATH to be set for dependency install command")
	}
	if !strings.HasPrefix(pathValue, filepath.Join(venvPath, "bin")) {
		t.Fatalf("expected PATH to start with venv bin, got %q", pathValue)
	}
}

func TestInstallDependenciesFallsBackToFullSync(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "uv.lock"), []byte("version = 1\n"), 0o644); err != nil {
		t.Fatalf("write uv.lock: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(prebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision,torchaudio,triton")

	previousEnsure := ensureUVCommand
	previousRunner := runCommand
	defer func() {
		ensureUVCommand = previousEnsure
		runCommand = previousRunner
	}()

	ensureUVCommand = func(context.Context, string, Hooks) error { return nil }

	callCount := 0
	commands := make([][]string, 0, 2)
	runCommand = func(
		_ context.Context,
		_ string,
		command []string,
		_ Hooks,
		_ bool,
		_ []string,
	) (int, error) {
		callCount++
		commands = append(commands, append([]string{}, command...))
		if callCount == 1 {
			return 42, nil
		}
		return 0, nil
	}

	if err := InstallDependencies(context.Background(), root, Hooks{}); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	if len(commands) != 2 {
		t.Fatalf("expected selective + fallback sync commands, got %d", len(commands))
	}

	firstCommand := strings.Join(commands[0], " ")
	if !strings.Contains(firstCommand, "--no-install-package torch") {
		t.Fatalf("expected selective command to skip protected packages, got %q", firstCommand)
	}

	secondCommand := strings.Join(commands[1], " ")
	if strings.Contains(secondCommand, "--no-install-package") {
		t.Fatalf("expected fallback command without package exclusions, got %q", secondCommand)
	}
}

func TestInstallDependenciesWithoutLockSkipsFrozenFlag(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(prebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision")

	previousEnsure := ensureUVCommand
	previousRunner := runCommand
	defer func() {
		ensureUVCommand = previousEnsure
		runCommand = previousRunner
	}()

	ensureUVCommand = func(context.Context, string, Hooks) error { return nil }

	var command []string
	runCommand = func(
		_ context.Context,
		_ string,
		cmd []string,
		_ Hooks,
		_ bool,
		_ []string,
	) (int, error) {
		command = append([]string{}, cmd...)
		return 0, nil
	}

	if err := InstallDependencies(context.Background(), root, Hooks{}); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	joined := strings.Join(command, " ")
	if strings.Contains(joined, "--frozen") {
		t.Fatalf("did not expect --frozen without uv.lock, got %q", joined)
	}
}

func TestInstallDependenciesReturnsErrorWhenFallbackFails(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "uv.lock"), []byte("version = 1\n"), 0o644); err != nil {
		t.Fatalf("write uv.lock: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(prebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision,torchaudio,triton")

	previousEnsure := ensureUVCommand
	previousRunner := runCommand
	defer func() {
		ensureUVCommand = previousEnsure
		runCommand = previousRunner
	}()

	ensureUVCommand = func(context.Context, string, Hooks) error { return nil }
	runCommand = func(
		_ context.Context,
		_ string,
		_ []string,
		_ Hooks,
		_ bool,
		_ []string,
	) (int, error) {
		return 9, nil
	}

	err := InstallDependencies(context.Background(), root, Hooks{})
	if err == nil {
		t.Fatal("expected InstallDependencies to fail when fallback sync fails")
	}
	if !strings.Contains(err.Error(), "uv sync failed with status 9") {
		t.Fatalf("unexpected error: %v", err)
	}
}
