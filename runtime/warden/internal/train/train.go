package train

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"warden/internal/runtimeapi"
)

type Hooks struct {
	EmitLog     func(level, source, message string)
	EmitMetrics func(samples []runtimeapi.MetricSample)
}

const (
	tahunaWandbPath                  = "/api/monitoring/wandb"
	defaultPrebakedVenv              = "/opt/tahuna/venv"
	protectedPackagesEnv             = "TAHUNA_PREBAKED_PROTECTED_PACKAGES"
	prebakedVirtualEnvVar            = "TAHUNA_PREBAKED_VENV"
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
	enableMetricExtraction bool,
	extraEnv []string,
) (int, error)

var runCommand commandRunner = runStreamingCommandWithEnv
var ensureUVCommand = ensureUV

func splitEnvEntry(entry string) (string, string, bool) {
	separator := strings.Index(entry, "=")
	if separator <= 0 {
		return "", "", false
	}
	return entry[:separator], entry[separator+1:], true
}

func lookupEnvValue(env []string, key string) (string, bool) {
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

func normalizeWandbPath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	normalized := strings.TrimRight(trimmed, "/")
	if normalized == "" {
		return "/"
	}
	if !strings.HasPrefix(normalized, "/") {
		return "/" + normalized
	}
	return normalized
}

func isTahunaWandbBaseURL(raw string) bool {
	baseURL := strings.TrimSpace(raw)
	if baseURL == "" {
		return false
	}

	parsed, err := url.Parse(baseURL)
	if err == nil && (parsed.Scheme != "" || parsed.Host != "") {
		return normalizeWandbPath(parsed.Path) == tahunaWandbPath
	}

	if slash := strings.Index(baseURL, "/"); slash >= 0 {
		return normalizeWandbPath(baseURL[slash:]) == tahunaWandbPath
	}
	return normalizeWandbPath(baseURL) == tahunaWandbPath
}

func resolveTrainEnvironment(baseEnv []string) []string {
	if _, exists := lookupEnvValue(baseEnv, "WANDB_API_KEY"); exists {
		return baseEnv
	}

	runtimeToken, tokenSet := lookupEnvValue(baseEnv, "TAHUNA_RUNTIME_TOKEN")
	if !tokenSet {
		return baseEnv
	}
	runtimeToken = strings.TrimSpace(runtimeToken)
	if runtimeToken == "" {
		return baseEnv
	}

	wandbBaseURL, _ := lookupEnvValue(baseEnv, "WANDB_BASE_URL")
	if !isTahunaWandbBaseURL(wandbBaseURL) {
		return baseEnv
	}

	environment := append([]string{}, baseEnv...)
	environment = append(environment, "WANDB_API_KEY="+runtimeToken)
	return environment
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

func mergeEnvironment(baseEnv, overrides []string) []string {
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

func resolvePrebakedVirtualEnvPath(baseEnv []string) (string, bool) {
	venvPath, ok := lookupEnvValue(baseEnv, prebakedVirtualEnvVar)
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

func buildVirtualEnvEnvironment(baseEnv []string, venvPath string) []string {
	venvBin := filepath.Join(venvPath, "bin")
	pathValue := venvBin
	if existingPath, ok := lookupEnvValue(baseEnv, "PATH"); ok && strings.TrimSpace(existingPath) != "" {
		pathValue = pathValue + string(os.PathListSeparator) + existingPath
	}
	withVirtualEnv := setEnvValue(baseEnv, "VIRTUAL_ENV", venvPath)
	return setEnvValue(withVirtualEnv, "PATH", pathValue)
}

func resolveProtectedPackages(baseEnv []string) []string {
	value, ok := lookupEnvValue(baseEnv, protectedPackagesEnv)
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
	value, ok := lookupEnvValue(baseEnv, prebakedProtectedVersionsFileEnv)
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
		// Strip PEP 440 local version segment (e.g. +cu128) for comparison:
		// lock has "2.8.0", prebaked has "2.8.0+cu128" — these are the same release.
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

func buildSyncCommand(hasLock, useActiveVirtualEnv bool) []string {
	command := []string{"uv", "sync"}
	if useActiveVirtualEnv {
		command = append(command, "--active")
	}
	if hasLock {
		command = append(command, "--frozen")
	}
	command = append(command, "--no-dev", "--inexact")
	return command
}

func buildSelectiveSyncCommand(base []string, protectedPackages []string) []string {
	command := append([]string{}, base...)
	for _, pkg := range protectedPackages {
		command = append(command, "--no-install-package", pkg)
	}
	return command
}

func InstallDependencies(ctx context.Context, workspaceRoot string, hooks Hooks) error {
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
	if venvPath, ok := resolvePrebakedVirtualEnvPath(installEnv); ok {
		useActiveVirtualEnv = true
		installEnv = buildVirtualEnvEnvironment(installEnv, venvPath)
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

	fullSyncCommand := buildSyncCommand(hasLock, useActiveVirtualEnv)
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
		false,
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
			false,
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

func RunEntrypoint(
	ctx context.Context,
	workspaceRoot string,
	command []string,
	gracePeriod time.Duration,
	hooks Hooks,
) (exitCode int, cancelled bool, err error) {
	normalized, normErr := NormalizeCommand(command)
	if normErr != nil {
		return 0, false, normErr
	}
	emitLog(hooks, "info", "train", "using command: "+strings.Join(normalized, " "))

	entrypoint := resolveEntrypoint(normalized)
	if entrypoint != "" {
		entrypointPath := filepath.Join(workspaceRoot, entrypoint)
		if _, statErr := os.Stat(entrypointPath); statErr != nil {
			emitLog(hooks, "info", "train", "no entrypoint found at "+entrypointPath+" (bootstrap only)")
			return 0, false, nil
		}
	}

	emitLog(hooks, "info", "train", "starting entrypoint")
	cmd := exec.Command(normalized[0], normalized[1:]...) // #nosec G204
	cmd.Dir = workspaceRoot
	trainEnv := os.Environ()
	if venvPath, ok := resolvePrebakedVirtualEnvPath(trainEnv); ok {
		trainEnv = buildVirtualEnvEnvironment(trainEnv, venvPath)
	}
	cmd.Env = resolveTrainEnvironment(trainEnv)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, false, fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return 0, false, fmt.Errorf("start entrypoint: %w", err)
	}

	lineCh := make(chan string, 128)
	scanErrCh := make(chan error, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		buf := make([]byte, 0, 64*1024)
		scanner.Buffer(buf, 4*1024*1024)
		for scanner.Scan() {
			lineCh <- scanner.Text()
		}
		scanErrCh <- scanner.Err()
		close(lineCh)
	}()

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	metricPattern := regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)=([-+]?(?:\d+\.\d+|\d+)(?:e[+-]?\d+)?)`)
	step := int64(0)
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	forceKillAt := time.Time{}
	for {
		select {
		case line, ok := <-lineCh:
			if !ok {
				continue
			}
			step = emitTrainOutputLine(hooks, metricPattern, line, step)
		case waitErr := <-waitCh:
			for buffered := range lineCh {
				step = emitTrainOutputLine(hooks, metricPattern, buffered, step)
			}
			if scanErr := <-scanErrCh; scanErr != nil && !isBenignStreamReadError(scanErr) {
				return 0, cancelled, fmt.Errorf("stream entrypoint output: %w", scanErr)
			}
			if waitErr == nil {
				return 0, cancelled, nil
			}
			exitErr, ok := waitErr.(*exec.ExitError)
			if !ok {
				return 0, cancelled, fmt.Errorf("entrypoint wait failed: %w", waitErr)
			}
			return exitErr.ExitCode(), cancelled, nil
		case <-ctx.Done():
			if !cancelled {
				cancelled = true
				if gracePeriod <= 0 {
					gracePeriod = 30 * time.Second
				}
				emitLog(
					hooks,
					"info",
					"bootstrap",
					fmt.Sprintf("SIGTERM received, graceful shutdown (%ds grace)", int(gracePeriod.Seconds())),
				)
				if cmd.Process != nil {
					_ = cmd.Process.Signal(syscall.SIGTERM)
				}
				forceKillAt = time.Now().Add(gracePeriod)
			}
		case <-ticker.C:
			if cancelled && !forceKillAt.IsZero() && time.Now().After(forceKillAt) {
				emitLog(hooks, "warn", "bootstrap", "grace period expired, force killing entrypoint")
				if cmd.Process != nil {
					_ = cmd.Process.Kill()
				}
				forceKillAt = time.Time{}
			}
		}
	}
}

func isBenignStreamReadError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrClosed) || errors.Is(err, io.ErrClosedPipe) {
		return true
	}
	normalized := strings.ToLower(err.Error())
	return strings.Contains(normalized, "file already closed")
}

func emitTrainOutputLine(
	hooks Hooks,
	metricPattern *regexp.Regexp,
	line string,
	step int64,
) int64 {
	text := strings.TrimRight(line, "\n")
	if text == "" {
		return step
	}
	emitLog(hooks, "info", "train", text)
	samples := extractMetrics(metricPattern, text, step)
	if len(samples) > 0 {
		emitMetrics(hooks, samples)
	}
	return step + 1
}

func NormalizeCommand(command []string) ([]string, error) {
	if len(command) == 0 {
		return nil, fmt.Errorf("command is required: environment has no command configured")
	}
	normalized := append([]string(nil), command...)
	return normalized, nil
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
		false,
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
	enableMetricExtraction bool,
	extraEnv []string,
) (int, error) {
	if len(command) == 0 {
		return 0, fmt.Errorf("command is required")
	}
	cmd := exec.CommandContext(ctx, command[0], command[1:]...) // #nosec G204
	cmd.Dir = cwd
	if len(extraEnv) > 0 {
		cmd.Env = mergeEnvironment(os.Environ(), extraEnv)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("start command %s: %w", strings.Join(command, " "), err)
	}

	step := int64(0)
	metricPattern := regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)=([-+]?(?:\d+\.\d+|\d+)(?:e[+-]?\d+)?)`)
	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 4*1024*1024)
	for scanner.Scan() {
		text := strings.TrimRight(scanner.Text(), "\n")
		if text == "" {
			continue
		}
		emitLog(hooks, "info", "bootstrap", text)
		if enableMetricExtraction {
			samples := extractMetrics(metricPattern, text, step)
			if len(samples) > 0 {
				emitMetrics(hooks, samples)
			}
			step += 1
		}
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

func resolveEntrypoint(command []string) string {
	for i, token := range command {
		if i == 0 {
			continue
		}
		if strings.HasSuffix(strings.TrimSpace(token), ".py") {
			return strings.TrimSpace(token)
		}
	}
	return ""
}

func extractMetrics(pattern *regexp.Regexp, line string, step int64) []runtimeapi.MetricSample {
	matches := pattern.FindAllStringSubmatch(line, -1)
	if len(matches) == 0 {
		return nil
	}
	samples := make([]runtimeapi.MetricSample, 0, len(matches))
	for _, match := range matches {
		if len(match) != 3 {
			continue
		}
		value, err := strconv.ParseFloat(match[2], 64)
		if err != nil {
			continue
		}
		currentStep := step
		samples = append(samples, runtimeapi.MetricSample{
			Name:   match[1],
			Value:  value,
			Step:   &currentStep,
			Source: "train",
		})
	}
	return samples
}

func emitLog(hooks Hooks, level, source, message string) {
	if hooks.EmitLog != nil {
		hooks.EmitLog(level, source, message)
	}
}

func emitMetrics(hooks Hooks, samples []runtimeapi.MetricSample) {
	if hooks.EmitMetrics != nil && len(samples) > 0 {
		hooks.EmitMetrics(samples)
	}
}
