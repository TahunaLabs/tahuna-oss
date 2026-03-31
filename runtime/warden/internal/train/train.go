package train

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"warden/internal/pythonenv"
	"warden/internal/runtimeapi"
)

type Hooks struct {
	EmitLog     func(level, source, message string)
	EmitMetrics func(samples []runtimeapi.MetricSample)
}

const (
	tahunaWandbPath = "/api/monitoring/wandb"
)

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
	if _, exists := pythonenv.LookupEnvValue(baseEnv, "WANDB_API_KEY"); exists {
		return baseEnv
	}

	runtimeToken, tokenSet := pythonenv.LookupEnvValue(baseEnv, "TAHUNA_RUNTIME_TOKEN")
	if !tokenSet {
		return baseEnv
	}
	runtimeToken = strings.TrimSpace(runtimeToken)
	if runtimeToken == "" {
		return baseEnv
	}

	wandbBaseURL, _ := pythonenv.LookupEnvValue(baseEnv, "WANDB_BASE_URL")
	if !isTahunaWandbBaseURL(wandbBaseURL) {
		return baseEnv
	}

	environment := append([]string{}, baseEnv...)
	environment = append(environment, "WANDB_API_KEY="+runtimeToken)
	return environment
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
	if venvPath, ok := pythonenv.ResolvePrebakedVirtualEnvPath(trainEnv); ok {
		trainEnv = pythonenv.BuildVirtualEnvEnvironment(trainEnv, venvPath)
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
	//
	if len(command) == 0 {
		return nil, fmt.Errorf("command is required: environment has no command configured")
	}
	normalized := append([]string(nil), command...)
	return normalized, nil
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
