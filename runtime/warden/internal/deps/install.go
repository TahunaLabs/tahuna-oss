package deps

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"warden/internal/pythonenv"
)

type Hooks struct {
	EmitLog func(level, source, message string)
}

type Mode string

const (
	ModeTrain Mode = "train"
	ModeServe Mode = "serve"

	protectedPackagesEnv             = "TAHUNA_PREBAKED_PROTECTED_PACKAGES"
	prebakedProtectedVersionsFileEnv = "TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE"
	defaultProtectedVersionsFilePath = "/opt/tahuna/protected-package-versions.json"
)

var defaultProtectedPackages = []string{
	"torch",
	"torchvision",
	"torchaudio",
	"triton",
}

type commandRunner func(
	ctx context.Context,
	cwd string,
	command []string,
	hooks Hooks,
	extraEnv []string,
) (int, error)

var runCommand commandRunner = runStreamingCommandWithEnv
var ensureUVCommand = ensureUV

func InstallDependencies(ctx context.Context, workspaceRoot string, mode Mode, hooks Hooks) error {
	group, err := dependencyGroup(mode)
	if err != nil {
		return err
	}

	pyproject := filepath.Join(workspaceRoot, "pyproject.toml")
	if _, err := os.Stat(pyproject); err != nil {
		return fmt.Errorf("pyproject.toml not found in workspace")
	}
	if err := ensureUVCommand(ctx, workspaceRoot, hooks); err != nil {
		return err
	}

	hasLock := false
	if _, err := os.Stat(filepath.Join(workspaceRoot, "uv.lock")); err == nil {
		hasLock = true
	}

	installEnv := os.Environ()
	protectedPackages := []string{}
	useActiveVirtualEnv := false
	if venvPath, ok := pythonenv.ResolvePrebakedVirtualEnvPath(installEnv); ok {
		useActiveVirtualEnv = true
		installEnv = pythonenv.BuildVirtualEnvEnvironment(installEnv, venvPath)
		protectedPackages = resolveProtectedPackages(installEnv)
		if hasLock && len(protectedPackages) > 0 {
			lockPath := filepath.Join(workspaceRoot, "uv.lock")
			selectedPackages, detail := evaluateProtectedPackagesForLock(
				installEnv,
				lockPath,
				protectedPackages,
			)
			protectedPackages = selectedPackages
			if detail != "" {
				emitLog(hooks, "info", "bootstrap", detail)
			}
		}
	}

	fullSyncCommand := buildSyncCommand(group, hasLock, useActiveVirtualEnv)
	selectiveSyncCommand := buildSelectiveSyncCommand(fullSyncCommand, protectedPackages)
	selectiveInstallEnabled := len(protectedPackages) > 0
	if selectiveInstallEnabled {
		emitLog(
			hooks,
			"info",
			"bootstrap",
			"bootstrap: installing dependencies with "+strings.Join(selectiveSyncCommand, " "),
		)
	} else {
		emitLog(
			hooks,
			"info",
			"bootstrap",
			"bootstrap: installing dependencies with "+strings.Join(fullSyncCommand, " "),
		)
	}

	exitCode, err := runCommand(
		ctx,
		workspaceRoot,
		selectiveSyncCommand,
		hooks,
		installEnv,
	)
	if err != nil {
		return err
	}

	if exitCode != 0 && selectiveInstallEnabled {
		emitLog(
			hooks,
			"warn",
			"bootstrap",
			fmt.Sprintf(
				"bootstrap: selective sync failed status=%d detail=retrying full dependency sync",
				exitCode,
			),
		)
		emitLog(
			hooks,
			"info",
			"bootstrap",
			"bootstrap: installing dependencies with "+strings.Join(fullSyncCommand, " "),
		)
		exitCode, err = runCommand(
			ctx,
			workspaceRoot,
			fullSyncCommand,
			hooks,
			installEnv,
		)
		if err != nil {
			return err
		}
	}

	if exitCode != 0 {
		return fmt.Errorf("uv sync failed with status %d", exitCode)
	}
	emitLog(hooks, "info", "bootstrap", "bootstrap: dependency install complete")
	return nil
}

func dependencyGroup(mode Mode) (string, error) {
	switch mode {
	case ModeTrain:
		return "train", nil
	case ModeServe:
		return "serve", nil
	default:
		return "", fmt.Errorf("unsupported dependency install mode %q", strings.TrimSpace(string(mode)))
	}
}

func buildSyncCommand(group string, hasLock, useActiveVirtualEnv bool) []string {
	command := []string{"uv", "sync"}
	if useActiveVirtualEnv {
		command = append(command, "--active")
	}
	if hasLock {
		command = append(command, "--frozen")
	}
	command = append(command, "--no-dev", "--inexact", "--group", group)
	return command
}

func buildSelectiveSyncCommand(base []string, protectedPackages []string) []string {
	command := append([]string{}, base...)
	for _, pkg := range protectedPackages {
		command = append(command, "--no-install-package", pkg)
	}
	return command
}

func resolveProtectedPackages(baseEnv []string) []string {
	value, ok := pythonenv.LookupEnvValue(baseEnv, protectedPackagesEnv)
	if !ok || strings.TrimSpace(value) == "" {
		return append([]string{}, defaultProtectedPackages...)
	}

	seen := map[string]struct{}{}
	packages := make([]string, 0, len(defaultProtectedPackages))
	for _, raw := range strings.Split(value, ",") {
		name := strings.ToLower(strings.TrimSpace(raw))
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		packages = append(packages, name)
	}
	if len(packages) == 0 {
		return append([]string{}, defaultProtectedPackages...)
	}
	return packages
}

func parseTOMLQuotedValue(line, prefix string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, prefix) {
		return "", false
	}
	raw := strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
	if len(raw) < 2 || raw[0] != '"' {
		return "", false
	}
	for i := 1; i < len(raw); i++ {
		if raw[i] == '"' && raw[i-1] != '\\' {
			return raw[1:i], true
		}
	}
	return "", false
}

func readLockedPackageVersions(lockPath string, packageNames []string) (map[string]string, error) {
	blob, err := os.ReadFile(lockPath)
	if err != nil {
		return nil, fmt.Errorf("read uv.lock: %w", err)
	}

	targets := map[string]struct{}{}
	for _, pkg := range packageNames {
		name := strings.ToLower(strings.TrimSpace(pkg))
		if name == "" {
			continue
		}
		targets[name] = struct{}{}
	}

	versions := map[string]string{}
	currentName := ""
	currentVersion := ""
	inPackage := false

	flush := func() {
		if currentName == "" || currentVersion == "" {
			return
		}
		if _, ok := targets[currentName]; ok {
			versions[currentName] = currentVersion
		}
	}

	for _, line := range strings.Split(string(blob), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "[[package]]":
			if inPackage {
				flush()
			}
			inPackage = true
			currentName = ""
			currentVersion = ""
		case strings.HasPrefix(trimmed, "[["):
			if inPackage {
				flush()
			}
			inPackage = false
			currentName = ""
			currentVersion = ""
		case !inPackage:
			continue
		default:
			if name, ok := parseTOMLQuotedValue(trimmed, "name = "); ok {
				currentName = strings.ToLower(strings.TrimSpace(name))
				continue
			}
			if version, ok := parseTOMLQuotedValue(trimmed, "version = "); ok {
				currentVersion = strings.TrimSpace(version)
				continue
			}
		}
	}
	if inPackage {
		flush()
	}

	return versions, nil
}

func resolvePrebakedProtectedVersionsFilePath(baseEnv []string) string {
	value, ok := pythonenv.LookupEnvValue(baseEnv, prebakedProtectedVersionsFileEnv)
	if !ok {
		return defaultProtectedVersionsFilePath
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultProtectedVersionsFilePath
	}
	return trimmed
}

func readPrebakedProtectedVersions(path string) (map[string]string, error) {
	blob, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read prebaked protected versions: %w", err)
	}

	decoded := map[string]string{}
	if err := json.Unmarshal(blob, &decoded); err != nil {
		return nil, fmt.Errorf("parse prebaked protected versions: %w", err)
	}

	versions := map[string]string{}
	for name, version := range decoded {
		pkg := strings.ToLower(strings.TrimSpace(name))
		val := strings.TrimSpace(version)
		if pkg == "" || val == "" {
			continue
		}
		versions[pkg] = val
	}
	return versions, nil
}

func evaluateProtectedPackagesForLock(baseEnv []string, lockPath string, protectedPackages []string) ([]string, string) {
	lockVersions, err := readLockedPackageVersions(lockPath, protectedPackages)
	if err != nil {
		return nil, fmt.Sprintf(
			"bootstrap: disabling protected package skip detail=failed to parse uv.lock error=%v",
			err,
		)
	}
	if len(lockVersions) == 0 {
		return protectedPackages, ""
	}

	versionsPath := resolvePrebakedProtectedVersionsFilePath(baseEnv)
	prebakedVersions, err := readPrebakedProtectedVersions(versionsPath)
	if err != nil {
		return nil, fmt.Sprintf(
			"bootstrap: disabling protected package skip detail=failed to read prebaked versions file=%s error=%v",
			versionsPath,
			err,
		)
	}

	mismatches := make([]string, 0, len(protectedPackages))
	for _, pkg := range protectedPackages {
		requestedVersion, requested := lockVersions[pkg]
		if !requested {
			continue
		}
		prebakedVersion, prebaked := prebakedVersions[pkg]
		if !prebaked {
			mismatches = append(
				mismatches,
				fmt.Sprintf("%s lock=%s prebaked=missing", pkg, requestedVersion),
			)
			continue
		}
		reqBase, _, _ := strings.Cut(requestedVersion, "+")
		preBase, _, _ := strings.Cut(prebakedVersion, "+")
		if reqBase != preBase {
			mismatches = append(
				mismatches,
				fmt.Sprintf("%s lock=%s prebaked=%s", pkg, requestedVersion, prebakedVersion),
			)
		}
	}
	if len(mismatches) == 0 {
		return protectedPackages, ""
	}

	sort.Strings(mismatches)
	return nil, fmt.Sprintf(
		"bootstrap: disabling protected package skip detail=version mismatch %s",
		strings.Join(mismatches, "; "),
	)
}

func ensureUV(ctx context.Context, workspaceRoot string, hooks Hooks) error {
	check := exec.CommandContext(ctx, "uv", "--version")
	check.Dir = workspaceRoot
	if err := check.Run(); err == nil {
		return nil
	}
	emitLog(hooks, "info", "bootstrap", "bootstrap: installing uv package manager")
	exitCode, err := runCommand(
		ctx,
		workspaceRoot,
		[]string{"python3", "-m", "pip", "install", "uv"},
		hooks,
		nil,
	)
	if err != nil {
		return err
	}
	if exitCode != 0 {
		return fmt.Errorf("failed to install uv")
	}
	return nil
}

func runStreamingCommandWithEnv(
	ctx context.Context,
	cwd string,
	command []string,
	hooks Hooks,
	extraEnv []string,
) (int, error) {
	if len(command) == 0 {
		return 0, fmt.Errorf("command is required")
	}
	cmd := exec.CommandContext(ctx, command[0], command[1:]...) // #nosec G204
	cmd.Dir = cwd
	if len(extraEnv) > 0 {
		cmd.Env = pythonenv.MergeEnvironment(os.Environ(), extraEnv)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("start command %s: %w", strings.Join(command, " "), err)
	}

	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 4*1024*1024)
	for scanner.Scan() {
		text := strings.TrimRight(scanner.Text(), "\n")
		if text == "" {
			continue
		}
		emitLog(hooks, "info", "bootstrap", text)
	}
	if scanErr := scanner.Err(); scanErr != nil {
		return 0, fmt.Errorf("stream command output: %w", scanErr)
	}

	if err := cmd.Wait(); err != nil {
		exitErr, ok := err.(*exec.ExitError)
		if !ok {
			return 0, fmt.Errorf("wait command %s: %w", strings.Join(command, " "), err)
		}
		return exitErr.ExitCode(), nil
	}
	return 0, nil
}

func emitLog(hooks Hooks, level, source, message string) {
	if hooks.EmitLog != nil {
		hooks.EmitLog(level, source, message)
	}
}
