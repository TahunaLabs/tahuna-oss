package train

import (
	"bufio"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
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
	tahunaWandbPath       = "/api/monitoring/wandb"
	defaultPrebakedVenv   = "/opt/tahuna/venv"
	protectedPackagesEnv  = "TAHUNA_PREBAKED_PROTECTED_PACKAGES"
	prebakedVirtualEnvVar = "TAHUNA_PREBAKED_VENV"
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
		name := strings.TrimSpace(raw)
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
	gracePeriod time.Duration,
	hooks Hooks,
) (exitCode int, cancelled bool, err error) {
	command, sourceConfig := LoadCommandFromConfig(workspaceRoot)
	normalized := NormalizeCommand(command)
	if sourceConfig != "" {
		emitLog(hooks, "info", "train", "using command from "+sourceConfig+": "+strings.Join(normalized, " "))
	} else {
		emitLog(hooks, "info", "train", "no config command found; using default: "+strings.Join(normalized, " "))
	}

	entrypoint := resolveEntrypoint(normalized)
	entrypointPath := filepath.Join(workspaceRoot, entrypoint)
	if strings.HasSuffix(entrypoint, ".py") {
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
			if scanErr := <-scanErrCh; scanErr != nil {
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

func LoadCommandFromConfig(workspaceRoot string) ([]string, string) {
	candidates := []string{
		filepath.Join(workspaceRoot, "config.yaml"),
		filepath.Join(workspaceRoot, "config.yml"),
	}
	for _, configPath := range candidates {
		content, err := os.ReadFile(configPath)
		if err != nil {
			continue
		}
		lines := strings.Split(string(content), "\n")
		command := []string{}
		inCommand := false
		for _, line := range lines {
			stripped := strings.TrimSpace(line)
			if stripped == "" || strings.HasPrefix(stripped, "#") {
				continue
			}
			if !inCommand {
				if stripped == "command:" {
					inCommand = true
				}
				continue
			}
			if !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
				break
			}
			if strings.HasPrefix(stripped, "- ") {
				value := unquote(strings.TrimSpace(strings.TrimPrefix(stripped, "- ")))
				if value != "" {
					command = append(command, value)
				}
			}
		}
		if len(command) > 0 {
			return command, configPath
		}
	}
	return nil, ""
}

func NormalizeCommand(command []string) []string {
	if len(command) == 0 {
		return []string{"uv", "run", "--active", "--no-sync", "python", "-u", "train.py"}
	}
	resolved := append([]string(nil), command...)
	first := strings.ToLower(strings.TrimSpace(resolved[0]))
	if first == "uv" {
		if len(resolved) > 1 && strings.EqualFold(strings.TrimSpace(resolved[1]), "run") {
			return ensureUVRunFlags(resolved)
		}
		return resolved
	}
	if first == "python" || first == "python3" {
		tail := append([]string(nil), resolved[1:]...)
		if len(tail) == 0 || tail[0] != "-u" {
			tail = append([]string{"-u"}, tail...)
		}
		return append([]string{"uv", "run", "--active", "--no-sync", "python"}, tail...)
	}
	return resolved
}

func ensureUVRunFlags(command []string) []string {
	if len(command) < 2 {
		return command
	}
	hasActive := false
	hasNoSync := false
	for _, token := range command[2:] {
		switch strings.TrimSpace(token) {
		case "--active":
			hasActive = true
		case "--no-sync":
			hasNoSync = true
		}
	}

	normalized := []string{command[0], command[1]}
	if !hasActive {
		normalized = append(normalized, "--active")
	}
	if !hasNoSync {
		normalized = append(normalized, "--no-sync")
	}
	return append(normalized, command[2:]...)
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
	if len(command) == 0 {
		return "train.py"
	}
	for i, token := range command {
		if i == 0 {
			continue
		}
		if strings.HasSuffix(strings.TrimSpace(token), ".py") {
			return strings.TrimSpace(token)
		}
	}
	return "train.py"
}

func unquote(value string) string {
	text := strings.TrimSpace(value)
	if len(text) >= 2 {
		if (strings.HasPrefix(text, "\"") && strings.HasSuffix(text, "\"")) ||
			(strings.HasPrefix(text, "'") && strings.HasSuffix(text, "'")) {
			return text[1 : len(text)-1]
		}
	}
	return text
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
