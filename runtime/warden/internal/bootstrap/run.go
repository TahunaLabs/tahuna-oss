package bootstrap

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"
	"time"

	"warden/internal/deps"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/train"
)

func (r *Runner) runTraining(ctx context.Context) error {
	if err := r.emitProvisioning(ctx, "warden bootstrap started"); err != nil {
		return err
	}

	plan, err := r.api.GetRunBootstrapPlan(ctx)
	if err != nil {
		return r.failWithError(ctx, fmt.Errorf("fetch bootstrap plan: %w", err))
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
			refreshed, err := r.api.GetRunBootstrapPlan(ctx)
			if err != nil {
				return nil, err
			}
			return refreshed.Code.Entries, nil
		},
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	dataRoot, outputRoot, err := ensureSharedWorkspacePaths(r.cfg.WorkspaceRoot, r.cfg.OutputDir)
	if err != nil {
		return r.failWithError(ctx, err)
	}

	emitLog := r.logEmitter(ctx)
	emitMetrics := r.metricEmitter(ctx)
	trainHooks := train.Hooks{
		EmitLog:     emitLog,
		EmitMetrics: emitMetrics,
	}
	installHooks := deps.Hooks{
		EmitLog: emitLog,
	}

	dataResultCh := make(chan dataMaterializeResult, 1)
	go func() {
		dataResultCh <- r.materializeData(
			ctx,
			downloader,
			dataRoot,
			plan.Data.Entries,
			func(ctx context.Context) ([]runtimeapi.BootstrapEntry, error) {
				refreshed, err := r.api.GetRunBootstrapPlan(ctx)
				if err != nil {
					return nil, err
				}
				return refreshed.Data.Entries, nil
			},
		)
	}()

	r.transition(StateInstall)
	installErr := deps.InstallDependencies(ctx, r.cfg.WorkspaceRoot, deps.ModeTrain, installHooks)
	dataRes := <-dataResultCh
	if installErr != nil {
		return r.failWithError(ctx, installErr)
	}
	if dataRes.err != nil {
		return r.failWithError(ctx, dataRes.err)
	}

	dataStats := dataRes.stats
	if dataRes.bundleFiles > 0 {
		dataStats.FileCount = maxInt(0, dataStats.FileCount-1) + dataRes.bundleFiles
		dataStats.TotalBytes = maxInt64(0, dataStats.TotalBytes-dataRes.bundleArchiveBytes) + dataRes.bundleBytes
		filesPerSec := perSecond(float64(dataRes.bundleFiles), dataRes.bundleExtractDuration)
		bytesPerSec := perSecond(float64(dataRes.bundleBytes), dataRes.bundleExtractDuration)
		r.emitLines(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf(
					"bootstrap: extracted data bundle files=%d bytes=%s duration=%s throughput=%0.1f files/s %s/s",
					dataRes.bundleFiles,
					formatBytes(dataRes.bundleBytes),
					dataRes.bundleExtractDuration.Round(10*time.Millisecond).String(),
					filesPerSec,
					formatBytes(int64(bytesPerSec)),
				),
				Level:  "info",
				Source: "bootstrap",
			},
		})
		r.emitMetricSamples(ctx, []runtimeapi.MetricSample{
			{
				Name:   "bootstrap_data_extract_seconds",
				Value:  dataRes.bundleExtractDuration.Seconds(),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_files",
				Value:  float64(dataRes.bundleFiles),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_bytes",
				Value:  float64(dataRes.bundleBytes),
				Source: "bootstrap",
			},
			{
				Name:   "bootstrap_data_extract_files_per_sec",
				Value:  filesPerSec,
				Source: "bootstrap",
			},
		})
	}

	r.emitMaterializedLogs(ctx, map[string]materialize.Stats{
		"code": codeStats,
		"data": dataStats,
	})
	r.emitMaterializedMetrics(ctx, map[string]materialize.Stats{
		"code": codeStats,
		"data": dataStats,
	})
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
		plan.Command,
		time.Duration(r.cfg.CancellationGraceSec)*time.Second,
		trainHooks,
	)
	if err != nil {
		return r.failWithError(ctx, err)
	}
	if cancelled {
		r.transition(StateArtifacts)
		r.syncArtifacts(ctx, trainHooks, outputRoot)
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
	r.syncArtifacts(ctx, trainHooks, outputRoot)
	r.transition(StateCompleted)
	_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusCompleted,
		Message: "entrypoint completed",
	})
	return nil
}
