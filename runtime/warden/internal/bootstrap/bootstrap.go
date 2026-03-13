package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"warden/internal/config"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/train"
)

var ErrNotImplemented = errors.New("warden runtime bootstrap is not implemented yet")
var ErrArtifactsNotImplemented = errors.New("artifact upload is not implemented yet")

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
	codeStats, err := materialize.WriteManifestEntries(
		ctx,
		downloader,
		plan.Code.Entries,
		r.cfg.WorkspaceRoot,
		"code",
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	dataRoot := filepath.Join(r.cfg.WorkspaceRoot, "data")
	dataStats, err := materialize.WriteManifestEntries(
		ctx,
		downloader,
		plan.Data.Entries,
		dataRoot,
		"data",
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	bundleFiles, bundleBytes, bundleArchiveBytes, err := materialize.ExtractDataBundle(dataRoot)
	if err != nil {
		return r.failWithError(ctx, err)
	}
	if bundleFiles > 0 {
		dataStats.FileCount = maxInt(0, dataStats.FileCount-1) + bundleFiles
		dataStats.TotalBytes = maxInt64(0, dataStats.TotalBytes-bundleArchiveBytes) + bundleBytes
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf("bootstrap: extracted data bundle files=%d", bundleFiles),
				Level:   "info",
				Source:  "bootstrap",
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
		r.transition(StateFailed)
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
	return r.failWithError(ctx, ErrArtifactsNotImplemented)
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
