package serve

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"

	"warden/internal/pythonenv"
	"warden/internal/runtimeapi"
)

type Config struct {
	ServeID                 string
	WorkspaceRoot           string
	DataDir                 string
	OutputDir               string
	ModelRoot               string
	Command                 []string
	Port                    int
	HealthPath              string
	StartupTimeout          time.Duration
	HealthInterval          time.Duration
	HealthTimeout           time.Duration
	HealthFailureThreshold  int
	GracefulShutdownTimeout time.Duration
}

type Hooks struct {
	EmitLog    func(level, source, message string)
	EmitStatus func(update runtimeapi.StatusUpdate) error
}

func RunEntrypoint(ctx context.Context, cfg Config, hooks Hooks) error {
	command := normalizeCommand(cfg.Command)
	if len(command) == 0 {
		return fmt.Errorf("command is required: serve has no command configured")
	}

	healthPath := normalizeHealthPath(cfg.HealthPath)
	startupTimeout := cfg.StartupTimeout
	if startupTimeout <= 0 {
		startupTimeout = 15 * time.Minute
	}
	healthInterval := cfg.HealthInterval
	if healthInterval <= 0 {
		healthInterval = 5 * time.Second
	}
	healthTimeout := cfg.HealthTimeout
	if healthTimeout <= 0 {
		healthTimeout = 2 * time.Second
	}
	healthFailureThreshold := cfg.HealthFailureThreshold
	if healthFailureThreshold <= 0 {
		healthFailureThreshold = 1
	}
	gracefulShutdownTimeout := cfg.GracefulShutdownTimeout
	if gracefulShutdownTimeout <= 0 {
		gracefulShutdownTimeout = 30 * time.Second
	}

	emitLog(hooks, "info", "serve", "using command: "+strings.Join(command, " "))
	emitLog(hooks, "info", "serve", "starting serve command")

	cmd := exec.Command(command[0], command[1:]...) // #nosec G204
	cmd.Dir = cfg.WorkspaceRoot

	commandEnv := os.Environ()
	if venvPath, ok := pythonenv.ResolvePrebakedVirtualEnvPath(commandEnv); ok {
		commandEnv = pythonenv.BuildVirtualEnvEnvironment(commandEnv, venvPath)
	}
	commandEnv = pythonenv.MergeEnvironment(commandEnv, []string{
		"TAHUNA_SERVE_ID=" + cfg.ServeID,
		"TAHUNA_WORKSPACE_ROOT=" + cfg.WorkspaceRoot,
		"TAHUNA_DATA_DIR=" + cfg.DataDir,
		"TAHUNA_OUTPUT_DIR=" + cfg.OutputDir,
		"TAHUNA_MODEL_ROOT=" + cfg.ModelRoot,
		"TAHUNA_SERVE_PORT=" + strconv.Itoa(cfg.Port),
		"TAHUNA_SERVE_HEALTH_PATH=" + healthPath,
	})
	cmd.Env = commandEnv

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start serve command: %w", err)
	}
	if hooks.EmitStatus != nil {
		if err := hooks.EmitStatus(runtimeapi.StatusUpdate{
			Status:  runtimeapi.StatusStarting,
			Message: "serve process started",
		}); err != nil {
			stopProcess(cmd)
			return fmt.Errorf("emit starting status: %w", err)
		}
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

	healthURL := fmt.Sprintf("http://127.0.0.1:%d%s", cfg.Port, healthPath)
	healthTicker := time.NewTicker(healthInterval)
	defer healthTicker.Stop()
	startupDeadline := time.Now().Add(startupTimeout)
	healthy := false
	consecutiveFailures := 0
	stopRequested := false
	forceKillAt := time.Time{}
	immediateProbeCh := make(chan struct{}, 1)
	immediateProbeCh <- struct{}{}

	for {
		select {
		case line, ok := <-lineCh:
			if !ok {
				continue
			}
			text := strings.TrimRight(line, "\n")
			if text != "" {
				emitLog(hooks, "info", "serve", text)
			}
		case waitErr := <-waitCh:
			for buffered := range lineCh {
				text := strings.TrimRight(buffered, "\n")
				if text != "" {
					emitLog(hooks, "info", "serve", text)
				}
			}
			if scanErr := <-scanErrCh; scanErr != nil && !isBenignStreamReadError(scanErr) {
				stopProcess(cmd)
				return fmt.Errorf("stream serve output: %w", scanErr)
			}
			if stopRequested {
				emitLog(hooks, "info", "serve", "serve stopped")
				if hooks.EmitStatus != nil {
					_ = hooks.EmitStatus(runtimeapi.StatusUpdate{
						Status:  runtimeapi.StatusStopped,
						Message: "serve stopped",
					})
				}
				return nil
			}
			if waitErr == nil {
				if healthy {
					return fmt.Errorf("serve command exited unexpectedly with status 0")
				}
				return fmt.Errorf("serve command exited before readiness with status 0")
			}
			exitErr, ok := waitErr.(*exec.ExitError)
			if !ok {
				return fmt.Errorf("serve command wait failed: %w", waitErr)
			}
			if healthy {
				return fmt.Errorf("serve command exited unexpectedly with status %d", exitErr.ExitCode())
			}
			return fmt.Errorf("serve command exited before readiness with status %d", exitErr.ExitCode())
		case <-immediateProbeCh:
			if err := probeServeHealth(ctx, healthURL, healthTimeout, startupDeadline, healthFailureThreshold, hooks, &healthy, &consecutiveFailures); err != nil {
				stopProcess(cmd)
				return err
			}
		case <-healthTicker.C:
			if stopRequested {
				if !forceKillAt.IsZero() && time.Now().After(forceKillAt) {
					emitLog(hooks, "warn", "serve", "grace period expired, force killing serve command")
					if cmd.Process != nil {
						_ = cmd.Process.Kill()
					}
					forceKillAt = time.Time{}
				}
				continue
			}
			if err := probeServeHealth(ctx, healthURL, healthTimeout, startupDeadline, healthFailureThreshold, hooks, &healthy, &consecutiveFailures); err != nil {
				stopProcess(cmd)
				return err
			}
		case <-ctx.Done():
			if stopRequested {
				continue
			}
			stopRequested = true
			emitLog(
				hooks,
				"info",
				"serve",
				fmt.Sprintf("stop requested, sending SIGTERM (%ds grace)", int(gracefulShutdownTimeout.Seconds())),
			)
			if hooks.EmitStatus != nil {
				_ = hooks.EmitStatus(runtimeapi.StatusUpdate{
					Status:  runtimeapi.StatusStopping,
					Message: "serve stopping",
				})
			}
			if cmd.Process != nil {
				_ = cmd.Process.Signal(syscall.SIGTERM)
			}
			forceKillAt = time.Now().Add(gracefulShutdownTimeout)
		}
	}
}

func probeServeHealth(
	ctx context.Context,
	healthURL string,
	healthTimeout time.Duration,
	startupDeadline time.Time,
	healthFailureThreshold int,
	hooks Hooks,
	healthy *bool,
	consecutiveFailures *int,
) error {
	probeCtx, cancel := context.WithTimeout(ctx, healthTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(probeCtx, http.MethodGet, healthURL, nil)
	if err != nil {
		return fmt.Errorf("create health probe request: %w", err)
	}
	response, err := http.DefaultClient.Do(request)
	if err == nil {
		_, _ = io.Copy(io.Discard, response.Body)
		response.Body.Close()
	}

	if err == nil && response.StatusCode == http.StatusOK {
		*consecutiveFailures = 0
		if !*healthy {
			*healthy = true
			emitLog(hooks, "info", "serve", "serve readiness probe succeeded")
			if hooks.EmitStatus != nil {
				if err := hooks.EmitStatus(runtimeapi.StatusUpdate{
					Status:  runtimeapi.StatusServing,
					Message: "serve healthy and serving",
				}); err != nil {
					return fmt.Errorf("emit serving status: %w", err)
				}
			}
		}
		return nil
	}

	*consecutiveFailures += 1
	detail := healthFailureDetail(err, response)
	if !*healthy {
		emitLog(hooks, "warn", "serve", "serve readiness probe failed: "+detail)
		if time.Now().After(startupDeadline) {
			return fmt.Errorf("serve readiness timed out: %s", detail)
		}
		return nil
	}

	emitLog(
		hooks,
		"warn",
		"serve",
		fmt.Sprintf(
			"serve health probe failed consecutive=%d/%d detail=%s",
			*consecutiveFailures,
			healthFailureThreshold,
			detail,
		),
	)
	if *consecutiveFailures >= healthFailureThreshold {
		return fmt.Errorf(
			"serve health probe failed %d consecutive times: %s",
			*consecutiveFailures,
			detail,
		)
	}
	return nil
}

func healthFailureDetail(err error, response *http.Response) string {
	if err != nil {
		return err.Error()
	}
	if response == nil {
		return "unknown probe failure"
	}
	return fmt.Sprintf("status=%d", response.StatusCode)
}

func normalizeCommand(command []string) []string {
	if len(command) == 0 {
		return nil
	}
	return append([]string(nil), command...)
}

func normalizeHealthPath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "/health"
	}
	if !strings.HasPrefix(trimmed, "/") {
		return "/" + trimmed
	}
	return trimmed
}

func emitLog(hooks Hooks, level, source, message string) {
	if hooks.EmitLog != nil {
		hooks.EmitLog(level, source, message)
	}
}

func stopProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
	_ = cmd.Process.Kill()
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
