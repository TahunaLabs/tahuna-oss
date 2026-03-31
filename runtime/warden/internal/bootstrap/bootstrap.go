package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"warden/internal/artifacts"
	"warden/internal/config"
	"warden/internal/deps"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/serve"
	"warden/internal/train"
)

const maxURLRefreshRetries = 1

type State string

const (
	StateInit         State = "init"
	StateProvisioning State = "provisioning"
	StateMaterialize  State = "materialize"
	StateInstall      State = "install"
	StateTraining     State = "training"
	StateServing      State = "serving"
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
		api:   newRuntimeClient(cfg),
		cfg:   cfg,
	}
}

func newRuntimeClient(cfg config.Config) *runtimeapi.Client {
	if cfg.Mode == config.ModeServe {
		return runtimeapi.NewServe(cfg.APIBase, cfg.ServeID, cfg.RuntimeToken, cfg.RequestTimeout())
	}
	return runtimeapi.NewRun(cfg.APIBase, cfg.RunID, cfg.RuntimeToken, cfg.RequestTimeout())
}

func (r *Runner) transition(next State) {
	r.state = next
}

func (r *Runner) Run(ctx context.Context) error {
	switch r.cfg.Mode {
	case config.ModeServe:
		return r.runServe(ctx)
	case config.ModeRun:
		return r.runTraining(ctx)
	default:
		return fmt.Errorf("unsupported runtime mode %q", strings.TrimSpace(string(r.cfg.Mode)))
	}
}

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

	emitLog := func(level, source, message string) {
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: message,
				Level:   level,
				Source:  source,
			},
		})
	}
	emitMetrics := func(samples []runtimeapi.MetricSample) {
		_, _ = r.api.EmitMetrics(ctx, samples)
	}
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
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
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
		_, _ = r.api.EmitMetrics(ctx, []runtimeapi.MetricSample{
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

	emitLog := func(level, source, message string) {
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: message,
				Level:   level,
				Source:  source,
			},
		})
	}
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
	installErr := deps.InstallDependencies(ctx, r.cfg.WorkspaceRoot, deps.ModeServe, installHooks)
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
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
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

type materializeResult struct {
	stats materialize.Stats
	err   error
}

type dataMaterializeResult struct {
	stats                 materialize.Stats
	bundleFiles           int
	bundleBytes           int64
	bundleArchiveBytes    int64
	bundleExtractDuration time.Duration
	err                   error
}

func (r *Runner) emitProvisioning(ctx context.Context, message string) error {
	r.transition(StateProvisioning)
	if err := r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusProvisioning,
		Message: message,
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
	return nil
}

func (r *Runner) materializeEntries(
	ctx context.Context,
	downloader *materialize.Downloader,
	kind string,
	rootDir string,
	entries []runtimeapi.BootstrapEntry,
	reload func(context.Context) ([]runtimeapi.BootstrapEntry, error),
) (materialize.Stats, error) {
	var stats materialize.Stats
	var err error
	for attempt := 0; ; attempt++ {
		totalBytes := sumEntryBytes(entries)
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{
				Message: fmt.Sprintf(
					"bootstrap: materializing %s files=%d bytes=%s",
					kind,
					len(entries),
					formatBytes(totalBytes),
				),
				Level:  "info",
				Source: "bootstrap",
			},
		})
		stats, err = materialize.WriteManifestEntries(
			ctx,
			downloader,
			entries,
			rootDir,
			kind,
			r.newProgressReporter(ctx, kind),
		)
		if err == nil {
			return stats, nil
		}
		if !errors.Is(err, materialize.ErrSignedURLExpired) || attempt >= maxURLRefreshRetries {
			return materialize.Stats{}, err
		}
		_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
			{Message: "bootstrap: signed URLs expired, re-fetching plan", Level: "warn", Source: "bootstrap"},
		})
		entries, err = reload(ctx)
		if err != nil {
			return materialize.Stats{}, fmt.Errorf("re-fetch bootstrap plan: %w", err)
		}
	}
}

func (r *Runner) materializeData(
	ctx context.Context,
	downloader *materialize.Downloader,
	dataRoot string,
	dataEntries []runtimeapi.BootstrapEntry,
	reload func(context.Context) ([]runtimeapi.BootstrapEntry, error),
) dataMaterializeResult {
	stats, err := r.materializeEntries(ctx, downloader, "data", dataRoot, dataEntries, reload)
	if err != nil {
		return dataMaterializeResult{err: err}
	}

	bundleStart := time.Now()
	bundleFiles, bundleBytes, bundleArchiveBytes, extractErr := materialize.ExtractDataBundle(dataRoot)
	bundleDuration := time.Since(bundleStart)
	if extractErr != nil {
		return dataMaterializeResult{err: extractErr}
	}

	return dataMaterializeResult{
		stats:                 stats,
		bundleFiles:           bundleFiles,
		bundleBytes:           bundleBytes,
		bundleArchiveBytes:    bundleArchiveBytes,
		bundleExtractDuration: bundleDuration,
	}
}

func (r *Runner) emitMaterializedLogs(ctx context.Context, statsByKind map[string]materialize.Stats) {
	parts := make([]string, 0, len(statsByKind))
	for _, kind := range []string{"code", "data", "model"} {
		stats, ok := statsByKind[kind]
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s files=%d", kind, stats.FileCount))
	}
	if len(parts) == 0 {
		return
	}
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: "bootstrap: materialized " + strings.Join(parts, " "),
			Level:   "info",
			Source:  "bootstrap",
		},
	})
}

func (r *Runner) emitMaterializedMetrics(ctx context.Context, statsByKind map[string]materialize.Stats) {
	samples := []runtimeapi.MetricSample{}
	for kind, stats := range statsByKind {
		samples = append(samples,
			runtimeapi.MetricSample{
				Name:   "bootstrap_" + kind + "_files",
				Value:  float64(stats.FileCount),
				Source: "bootstrap",
			},
			runtimeapi.MetricSample{
				Name:   "bootstrap_" + kind + "_bytes",
				Value:  float64(stats.TotalBytes),
				Source: "bootstrap",
			},
		)
	}
	if len(samples) > 0 {
		_, _ = r.api.EmitMetrics(ctx, samples)
	}
}

func ensureSharedWorkspacePaths(workspaceRoot, outputDir string) (string, string, error) {
	dataRoot := filepath.Clean(filepath.Join(workspaceRoot, "data"))
	outputRoot := filepath.Clean(filepath.Join(workspaceRoot, outputDir))
	for _, path := range []string{dataRoot, outputRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			return "", "", fmt.Errorf("create workspace path %s: %w", path, err)
		}
	}
	return dataRoot, outputRoot, nil
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

func (r *Runner) syncArtifacts(ctx context.Context, hooks train.Hooks, outputDir string) {
	result := artifacts.Sync(
		ctx,
		r.api,
		outputDir,
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
