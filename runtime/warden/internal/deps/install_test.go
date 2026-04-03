package deps

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"warden/internal/pythonenv"
)

func TestInstallDependenciesSelectiveSyncSuccess(t *testing.T) {
	for _, tc := range []struct {
		name  string
		group string
	}{
		{
			name:  "train",
			group: "train",
		},
		{
			name:  "serve",
			group: "serve",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
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
			t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
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
				extraEnv []string,
			) (int, error) {
				commands = append(commands, append([]string{}, command...))
				commandEnvs = append(commandEnvs, append([]string{}, extraEnv...))
				return 0, nil
			}

			if err := InstallDependencies(context.Background(), root, tc.group, Hooks{}); err != nil {
				t.Fatalf("InstallDependencies returned error: %v", err)
			}

			if len(commands) != 1 {
				t.Fatalf("expected one sync command, got %d", len(commands))
			}
			commandText := strings.Join(commands[0], " ")
			for _, token := range []string{"uv", "sync", "--active", "--frozen", "--no-dev", "--inexact", "--group " + tc.group, "--no-install-package torch", "--no-install-package torchvision", "--no-install-package torchaudio", "--no-install-package triton"} {
				if !strings.Contains(commandText, token) {
					t.Fatalf("expected selective command to include %q, got %q", token, commandText)
				}
			}

			if len(commandEnvs) != 1 {
				t.Fatalf("expected one env payload, got %d", len(commandEnvs))
			}
			virtualEnv, ok := pythonenv.LookupEnvValue(commandEnvs[0], "VIRTUAL_ENV")
			if !ok || virtualEnv != venvPath {
				t.Fatalf("expected VIRTUAL_ENV=%q, got %q", venvPath, virtualEnv)
			}
			pathValue, ok := pythonenv.LookupEnvValue(commandEnvs[0], "PATH")
			if !ok {
				t.Fatal("expected PATH to be set for dependency install command")
			}
			if !strings.HasPrefix(pathValue, filepath.Join(venvPath, "bin")) {
				t.Fatalf("expected PATH to start with venv bin, got %q", pathValue)
			}
		})
	}
}

func TestInstallDependenciesKeepsProtectionWhenLockedVersionsMatchPrebaked(t *testing.T) {
	root := t.TempDir()
	lockContent := `version = 1

[[package]]
name = "torch"
version = "2.4.0"

[[package]]
name = "torchvision"
version = "0.19.0"

[[package]]
name = "torchaudio"
version = "2.4.0"

[[package]]
name = "triton"
version = "3.0.0"
`
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "uv.lock"), []byte(lockContent), 0o644); err != nil {
		t.Fatalf("write uv.lock: %v", err)
	}

	versionsPath := filepath.Join(root, "prebaked_versions.json")
	versionsJSON := `{"torch":"2.4.0+cu124","torchvision":"0.19.0+cu124","torchaudio":"2.4.0+cu124","triton":"3.0.0"}`
	if err := os.WriteFile(versionsPath, []byte(versionsJSON), 0o644); err != nil {
		t.Fatalf("write prebaked versions: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision,torchaudio,triton")
	t.Setenv(prebakedProtectedVersionsFileEnv, versionsPath)

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
		_ []string,
	) (int, error) {
		command = append([]string{}, cmd...)
		return 0, nil
	}

	if err := InstallDependencies(
		context.Background(),
		root,
		"train",
		Hooks{},
	); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	joined := strings.Join(command, " ")
	if !strings.Contains(joined, "--no-install-package torch") {
		t.Fatalf("expected selective sync for matching lock versions, got %q", joined)
	}
}

func TestInstallDependenciesDisablesProtectionWhenLockedVersionsDiffer(t *testing.T) {
	root := t.TempDir()
	lockContent := `version = 1

[[package]]
name = "torch"
version = "2.5.0"
`
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "uv.lock"), []byte(lockContent), 0o644); err != nil {
		t.Fatalf("write uv.lock: %v", err)
	}

	versionsPath := filepath.Join(root, "prebaked_versions.json")
	if err := os.WriteFile(versionsPath, []byte(`{"torch":"2.4.0","torchvision":"0.19.0"}`), 0o644); err != nil {
		t.Fatalf("write prebaked versions: %v", err)
	}

	venvPath := filepath.Join(root, "venv")
	if err := os.MkdirAll(venvPath, 0o755); err != nil {
		t.Fatalf("mkdir venv: %v", err)
	}
	t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
	t.Setenv(protectedPackagesEnv, "torch,torchvision,torchaudio,triton")
	t.Setenv(prebakedProtectedVersionsFileEnv, versionsPath)

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
		_ []string,
	) (int, error) {
		command = append([]string{}, cmd...)
		return 0, nil
	}

	if err := InstallDependencies(
		context.Background(),
		root,
		"train",
		Hooks{},
	); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	joined := strings.Join(command, " ")
	if strings.Contains(joined, "--no-install-package") {
		t.Fatalf("expected full sync without protected skip on version mismatch, got %q", joined)
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
	t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
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
		_ []string,
	) (int, error) {
		callCount++
		commands = append(commands, append([]string{}, command...))
		if callCount == 1 {
			return 42, nil
		}
		return 0, nil
	}

	if err := InstallDependencies(
		context.Background(),
		root,
		"train",
		Hooks{},
	); err != nil {
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
	t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
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
		_ []string,
	) (int, error) {
		command = append([]string{}, cmd...)
		return 0, nil
	}

	if err := InstallDependencies(
		context.Background(),
		root,
		"",
		Hooks{},
	); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	joined := strings.Join(command, " ")
	if strings.Contains(joined, "--frozen") {
		t.Fatalf("did not expect --frozen without uv.lock, got %q", joined)
	}
	if strings.Contains(joined, "--group") {
		t.Fatalf("did not expect dependency group for project-mode install, got %q", joined)
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
	t.Setenv(pythonenv.PrebakedVirtualEnvVar, venvPath)
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
		_ []string,
	) (int, error) {
		return 9, nil
	}

	err := InstallDependencies(
		context.Background(),
		root,
		"train",
		Hooks{},
	)
	if err == nil {
		t.Fatal("expected InstallDependencies to fail when fallback sync fails")
	}
	if !strings.Contains(err.Error(), "uv sync failed with status 9") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestInstallDependenciesTrimsDependencyGroup(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte("[project]\nname='x'\nversion='0.1.0'\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}

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
		_ []string,
	) (int, error) {
		command = append([]string{}, cmd...)
		return 0, nil
	}

	if err := InstallDependencies(context.Background(), root, "  train  ", Hooks{}); err != nil {
		t.Fatalf("InstallDependencies returned error: %v", err)
	}

	joined := strings.Join(command, " ")
	if !strings.Contains(joined, "--group train") {
		t.Fatalf("expected trimmed dependency group, got %q", joined)
	}
}
