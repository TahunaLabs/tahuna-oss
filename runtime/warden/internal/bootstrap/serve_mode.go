package bootstrap

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"warden/internal/deps"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/serve"
)

func (r *Runner) runServe(ctx context.Context) error {
	if err := r.emitProvisioning(ctx, "serve bootstrap started"); err != nil {
		return err
	}

	plan, err := r.api.GetServeBootstrapPlan(ctx)
	if err != nil {
		return r.failWithError(ctx, fmt.Errorf("fetch serve bootstrap plan: %w", err))
	}

	r.transition(StateMaterialize)
	downloader := materialize.NewDownloader(r.cfg.RequestTimeout())
	codeStats, err := r.materializeEntries(
		ctx,
		downloader,
		"code",
		r.cfg.WorkspaceRoot,
		plan.Code.Entries,
		func(ctx context.Context) ([]runtimeapi.BootstrapEntry, error) {
			refreshed, err := r.api.GetServeBootstrapPlan(ctx)
			if err != nil {
				return nil, err
			}
			return refreshed.Code.Entries, nil
		},
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	dataRoot, outputRoot, err := ensureSharedWorkspacePaths(r.cfg.WorkspaceRoot, plan.OutputDir)
	if err != nil {
		return r.failWithError(ctx, err)
	}
	if err := os.MkdirAll(plan.ModelRoot, 0o755); err != nil {
		return r.failWithError(ctx, fmt.Errorf("create model root %s: %w", plan.ModelRoot, err))
	}

	emitLog := r.logEmitter(ctx)
	installHooks := deps.Hooks{
		EmitLog: emitLog,
	}
	serveHooks := serve.Hooks{
		EmitLog: emitLog,
		EmitStatus: func(update runtimeapi.StatusUpdate) error {
			return r.api.EmitStatus(ctx, update)
		},
	}

	dataResultCh := make(chan dataMaterializeResult, 1)
	go func() {
		dataResultCh <- r.materializeData(
			ctx,
			downloader,
			dataRoot,
			plan.Data.Entries,
			func(ctx context.Context) ([]runtimeapi.BootstrapEntry, error) {
				refreshed, err := r.api.GetServeBootstrapPlan(ctx)
				if err != nil {
					return nil, err
				}
				return refreshed.Data.Entries, nil
			},
		)
	}()

	modelResultCh := make(chan materializeResult, 1)
	go func() {
		stats, err := r.materializeEntries(
			ctx,
			downloader,
			"model",
			plan.ModelRoot,
			plan.Model.Entries,
			func(ctx context.Context) ([]runtimeapi.BootstrapEntry, error) {
				refreshed, err := r.api.GetServeBootstrapPlan(ctx)
				if err != nil {
					return nil, err
				}
				return refreshed.Model.Entries, nil
			},
		)
		modelResultCh <- materializeResult{stats: stats, err: err}
	}()

	r.transition(StateInstall)
	installErr := deps.InstallDependencies(ctx, r.cfg.WorkspaceRoot, plan.DependencyGroup, installHooks)
	dataRes := <-dataResultCh
	modelRes := <-modelResultCh
	if installErr != nil {
		return r.failWithError(ctx, installErr)
	}
	if dataRes.err != nil {
		return r.failWithError(ctx, dataRes.err)
	}
	if modelRes.err != nil {
		return r.failWithError(ctx, modelRes.err)
	}

	dataStats := dataRes.stats
	if dataRes.bundleFiles > 0 {
		dataStats.FileCount = maxInt(0, dataStats.FileCount-1) + dataRes.bundleFiles
		dataStats.TotalBytes = maxInt64(0, dataStats.TotalBytes-dataRes.bundleArchiveBytes) + dataRes.bundleBytes
		r.emitLines(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf(
					"bootstrap: extracted data bundle files=%d bytes=%s duration=%s",
					dataRes.bundleFiles,
					formatBytes(dataRes.bundleBytes),
					dataRes.bundleExtractDuration.Round(10*time.Millisecond).String(),
				),
				Level:  "info",
				Source: "bootstrap",
			},
		})
	}

	r.emitMaterializedLogs(ctx, map[string]materialize.Stats{
		"code":  codeStats,
		"data":  dataStats,
		"model": modelRes.stats,
	})

	r.transition(StateServing)
	serveCtx, stopSignals := signal.NotifyContext(ctx, syscall.SIGTERM, syscall.SIGINT)
	defer stopSignals()
	if err := serve.RunEntrypoint(
		serveCtx,
		serve.Config{
			ServeID:                 plan.ServeID,
			WorkspaceRoot:           r.cfg.WorkspaceRoot,
			DataDir:                 dataRoot,
			OutputDir:               outputRoot,
			ModelRoot:               plan.ModelRoot,
			Command:                 plan.Command,
			Port:                    plan.Port,
			HealthPath:              plan.HealthPath,
			StartupTimeout:          time.Duration(plan.StartupTimeoutSeconds) * time.Second,
			HealthInterval:          time.Duration(plan.HealthIntervalSeconds) * time.Second,
			HealthTimeout:           time.Duration(plan.HealthTimeoutSeconds) * time.Second,
			HealthFailureThreshold:  plan.HealthFailureThreshold,
			GracefulShutdownTimeout: time.Duration(plan.GracefulShutdownSeconds) * time.Second,
		},
		serveHooks,
	); err != nil {
		return r.failWithError(ctx, err)
	}

	r.transition(StateCompleted)
	return nil
}
