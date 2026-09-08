package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"warden/internal/artifacts"
	"warden/internal/materialize"
	"warden/internal/runtimeapi"
	"warden/internal/train"
)

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
		r.emitLines(ctx, []runtimeapi.LogLine{
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
		r.emitLines(ctx, []runtimeapi.LogLine{
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
	r.emitLines(ctx, []runtimeapi.LogLine{
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
		r.emitMetricSamples(ctx, samples)
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
	r.emitLines(ctx, []runtimeapi.LogLine{
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
	r.emitMetricSamples(ctx, []runtimeapi.MetricSample{
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
		r.emitLines(ctx, []runtimeapi.LogLine{
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

func (r *Runner) logEmitter(ctx context.Context) func(level, source, message string) {
	return func(level, source, message string) {
		r.emitLines(ctx, []runtimeapi.LogLine{
			{
				Message: message,
				Level:   level,
				Source:  source,
			},
		})
	}
}

func (r *Runner) metricEmitter(ctx context.Context) func(samples []runtimeapi.MetricSample) {
	return func(samples []runtimeapi.MetricSample) {
		r.emitMetricSamples(ctx, samples)
	}
}

func (r *Runner) emitLines(ctx context.Context, lines []runtimeapi.LogLine) {
	_, _ = r.api.EmitLogs(ctx, lines)
}

func (r *Runner) emitMetricSamples(ctx context.Context, samples []runtimeapi.MetricSample) {
	_, _ = r.api.EmitMetrics(ctx, samples)
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
