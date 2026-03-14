package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"warden/internal/artifacts"
	"warden/internal/config"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/train"
)

var ErrNotImplemented = errors.New("warden runtime bootstrap is not implemented yet")

type State string

const (
	StateInit         State = "init"
	StateProvisioning State = "provisioning"
	StateMaterialize  State = "materialize"
	StateInstall      State = "install"
	StateTraining     State = "training"
	StateArtifacts    State = "artifacts"
	StateCompleted    State = "completed"
	StateFailed       State = "failed"
)

type Runner struct {
	state State
	api   *runtimeapi.Client
	cfg   config.Config
}

func NewRunner(cfg config.Config) *Runner {
	return &Runner{
		state: StateInit,
		api:   runtimeapi.New(cfg.APIBase, cfg.RunID, cfg.RuntimeToken, cfg.RequestTimeout()),
		cfg:   cfg,
	}
}

func (r *Runner) transition(next State) {
	r.state = next
}

func (r *Runner) Run(ctx context.Context) error {
	r.transition(StateProvisioning)
	if err := r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusProvisioning,
		Message: "warden bootstrap started",
	}); err != nil {
		return fmt.Errorf("emit provisioning status: %w", err)
	}
	if _, err := r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: "bootstrap: requesting materialization plan",
			Level:   "info",
			Source:  "bootstrap",
		},
	}); err != nil {
		return fmt.Errorf("emit startup log: %w", err)
	}

	plan, err := r.api.GetBootstrapPlan(ctx)
	if err != nil {
		return r.failWithError(ctx, fmt.Errorf("fetch bootstrap plan: %w", err))
	}

	r.transition(StateMaterialize)
	downloader := materialize.NewDownloader(r.cfg.RequestTimeout())
	codeTotalBytes := sumEntryBytes(plan.Code.Entries)
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: fmt.Sprintf(
				"bootstrap: materializing code files=%d bytes=%s",
				len(plan.Code.Entries),
				formatBytes(codeTotalBytes),
			),
			Level:  "info",
			Source: "bootstrap",
		},
	})
	codeStats, err := materialize.WriteManifestEntries(
		ctx,
		downloader,
		plan.Code.Entries,
		r.cfg.WorkspaceRoot,
		"code",
		r.newProgressReporter(ctx, "code"),
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	dataRoot := filepath.Join(r.cfg.WorkspaceRoot, "data")
	dataTotalBytes := sumEntryBytes(plan.Data.Entries)
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: fmt.Sprintf(
				"bootstrap: materializing data files=%d bytes=%s",
				len(plan.Data.Entries),
				formatBytes(dataTotalBytes),
			),
			Level:  "info",
			Source: "bootstrap",
		},
	})
	dataStats, err := materialize.WriteManifestEntries(
		ctx,
		downloader,
		plan.Data.Entries,
		dataRoot,
		"data",
		r.newProgressReporter(ctx, "data"),
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	bundleExtractStartedAt := time.Now()
	bundleFiles, bundleBytes, bundleArchiveBytes, err := materialize.ExtractDataBundle(dataRoot)
	bundleExtractDuration := time.Since(bundleExtractStartedAt)
	if err != nil {
		return r.failWithError(ctx, err)
	}
	if bundleFiles > 0 {
		dataStats.FileCount = maxInt(0, dataStats.FileCount-1) + bundleFiles
		dataStats.TotalBytes = maxInt64(0, dataStats.TotalBytes-bundleArchiveBytes) + bundleBytes
		filesPerSec := perSecond(float64(bundleFiles), bundleExtractDuration)
		bytesPerSec := perSecond(float64(bundleBytes), bundleExtractDuration)
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf(
					"bootstrap: extracted data bundle files=%d bytes=%s duration=%s throughput=%0.1f files/s %s/s",
					bundleFiles,
					formatBytes(bundleBytes),
					bundleExtractDuration.Round(10*time.Millisecond).String(),
					filesPerSec,
					formatBytes(int64(bytesPerSec)),
				),
				Level:  "info",
				Source: "bootstrap",
			},
		})
		_, _ = r.api.EmitMetrics(ctx, []runtimeapi.MetricSample{
			{
				Name:   "bootstrap_data_extract_seconds",
				Value:  bundleExtractDuration.Seconds(),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_files",
				Value:  float64(bundleFiles),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_bytes",
				Value:  float64(bundleBytes),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_files_per_sec",
				Value:  filesPerSec,
				Source: "bootstrap",
			},
		})
	}
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: fmt.Sprintf(
				"bootstrap: materialized code files=%d data files=%d",
				codeStats.FileCount,
				dataStats.FileCount,
			),
			Level:  "info",
			Source: "bootstrap",
		},
	})
	_, _ = r.api.EmitMetrics(ctx, []runtimeapi.MetricSample{
		{
			Name:   "bootstrap_code_files",
			Value:  float64(codeStats.FileCount),
			Source: "bootstrap",
		},
		{
			Name:   "bootstrap_code_bytes",
			Value:  float64(codeStats.TotalBytes),
			Source: "bootstrap",
		},
		{
			Name:   "bootstrap_data_files",
			Value:  float64(dataStats.FileCount),
			Source: "bootstrap",
		},
		{
			Name:   "bootstrap_data_bytes",
			Value:  float64(dataStats.TotalBytes),
			Source: "bootstrap",
		},
	})

	r.transition(StateInstall)
	hooks := train.Hooks{
		EmitLog: func(level, source, message string) {
			_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
				{
					Message: message,
					Level:   level,
					Source:  source,
				},
			})
		},
		EmitMetrics: func(samples []runtimeapi.MetricSample) {
			_, _ = r.api.EmitMetrics(ctx, samples)
		},
	}
	if err := train.InstallDependencies(ctx, r.cfg.WorkspaceRoot, hooks); err != nil {
		return r.failWithError(ctx, err)
	}
	if err := r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusRunning,
		Message: "workspace materialized",
	}); err != nil {
		return r.failWithError(ctx, err)
	}

	r.transition(StateTraining)
	trainCtx, stopSignals := signal.NotifyContext(ctx, syscall.SIGTERM, syscall.SIGINT)
	defer stopSignals()
	exitCode, cancelled, err := train.RunEntrypoint(
		trainCtx,
		r.cfg.WorkspaceRoot,
		time.Duration(r.cfg.CancellationGraceSec)*time.Second,
		hooks,
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}
	if cancelled {
		r.transition(StateArtifacts)
		r.syncArtifacts(ctx, hooks)
		_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
			Status:  runtimeapi.StatusCancelled,
			Message: "run cancelled by user",
		})
		return nil
	}
	if exitCode != 0 {
		return r.failWithError(ctx, fmt.Errorf("entrypoint exited with status %d", exitCode))
	}

	r.transition(StateArtifacts)
	r.syncArtifacts(ctx, hooks)
	r.transition(StateCompleted)
	_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusCompleted,
		Message: "entrypoint completed",
	})
	return nil
}

func (r *Runner) failWithError(ctx context.Context, reason error) error {
	r.transition(StateFailed)
	message := reason.Error()
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: "bootstrap failed: " + message,
			Level:   "error",
			Source:  "bootstrap",
		},
	})
	_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusFailed,
		Message: "bootstrap failed",
		Error:   message,
	})
	return reason
}

func (r *Runner) syncArtifacts(ctx context.Context, hooks train.Hooks) {
	result := artifacts.Sync(
		ctx,
		r.api,
		r.cfg.WorkspaceRoot,
		r.cfg.RequestTimeout(),
		hooks.EmitLog,
	)
	_, _ = r.api.EmitMetrics(ctx, []runtimeapi.MetricSample{
		{
			Name:   "artifacts_uploaded",
			Value:  float64(result.Uploaded),
			Source: "bootstrap",
		},
	})
}

func (r *Runner) newProgressReporter(ctx context.Context, kind string) func(materialize.Progress) {
	lastEmit := time.Time{}
	return func(progress materialize.Progress) {
		if progress.TotalFiles <= 0 {
			return
		}
		now := time.Now()
		isDone := progress.CompletedFiles >= progress.TotalFiles
		if !isDone && !lastEmit.IsZero() && now.Sub(lastEmit) < 2*time.Second {
			return
		}
		lastEmit = now
		pct := float64(progress.CompletedFiles) / float64(progress.TotalFiles)
		if pct < 0 {
			pct = 0
		}
		if pct > 1 {
			pct = 1
		}
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf(
					"bootstrap: materializing %s %s %3.0f%% files=%d/%d bytes=%s/%s",
					kind,
					progressBar(pct, 20),
					pct*100,
					progress.CompletedFiles,
					progress.TotalFiles,
					formatBytes(progress.CompletedBytes),
					formatBytes(progress.TotalBytes),
				),
				Level:  "info",
				Source: "bootstrap",
			},
		})
	}
}

func sumEntryBytes(entries []runtimeapi.BootstrapEntry) int64 {
	total := int64(0)
	for _, entry := range entries {
		total += entry.Size
	}
	return total
}

func progressBar(progress float64, width int) string {
	if width <= 0 {
		width = 20
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 1 {
		progress = 1
	}
	filled := int(progress * float64(width))
	if filled > width {
		filled = width
	}
	return "[" + strings.Repeat("#", filled) + strings.Repeat("-", width-filled) + "]"
}

func formatBytes(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%dB", bytes)
	}
	units := []string{"KB", "MB", "GB", "TB"}
	value := float64(bytes)
	unit := "B"
	for _, candidate := range units {
		value /= 1024.0
		unit = candidate
		if value < 1024.0 {
			break
		}
	}
	return fmt.Sprintf("%.1f%s", value, unit)
}

func perSecond(total float64, duration time.Duration) float64 {
	seconds := duration.Seconds()
	if seconds <= 0 {
		return total
	}
	return total / seconds
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func Run(ctx context.Context, cfg config.Config) error {
	return NewRunner(cfg).Run(ctx)
}
