package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	neturl "net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

func runList(args []string) {
	fs := flag.NewFlagSet("run list", flag.ExitOnError)
	limit := fs.Int("tail", 5, "Show only the last N runs (tail order)")
	fs.IntVar(limit, "n", 5, "Show only the last N runs (tail order)")
	all := fs.Bool("all", false, "Show all runs")
	fs.BoolVar(all, "a", false, "Show all runs")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/runs", nil)
		must(err)
		runsAny, ok := resp["runs"].([]any)
		if !ok {
			printJSON(resp)
			return
		}
		orderedRuns := reverseSlice(runsAny)
		if !*all && *limit > 0 && len(orderedRuns) > *limit {
			orderedRuns = orderedRuns[len(orderedRuns)-*limit:]
		}
		printJSON(map[string]any{"runs": orderedRuns})
		return
	}

	resp, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	must(err)
	orderedRuns := reverseSlice(resp.Runs)
	if !*all && *limit > 0 && len(orderedRuns) > *limit {
		orderedRuns = orderedRuns[len(orderedRuns)-*limit:]
	}
	envNames := fetchEnvironmentNameMap()
	printRunListSummary(orderedRuns, envNames)
}

func runShow(args []string) {
	fs := flag.NewFlagSet("run show", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	mustParseFlags(fs, args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id_or_name is required (usage: tahuna run show <run_id|run_name>)")
	resolvedRunID, err := resolveRunIDByIDOrName(runID)
	must(err)
	if *verbose {
		resp, err := doJSON(http.MethodGet, "/runs/"+resolvedRunID, nil)
		must(err)
		printJSON(resp)
		return
	}
	resp, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+resolvedRunID, nil)
	must(err)
	printRunSummary(resp)
}

func reverseSlice[T any](s []T) []T {
	out := make([]T, len(s))
	for i := range s {
		out[i] = s[len(s)-1-i]
	}
	return out
}

// fetchEnvironmentNameMap returns a map of environment ID → name for labelling.
func fetchEnvironmentNameMap() map[string]string {
	out := map[string]string{}
	resp, err := doJSONAs[environmentsResponse](http.MethodGet, "/environments", nil)
	if err != nil {
		return out
	}
	for _, env := range resp.Environments {
		if env.EnvironmentID != "" && env.Name != "" {
			out[env.EnvironmentID] = env.Name
		}
	}
	return out
}

func printRunListSummary(runs []runResponse, envNameByID map[string]string) {
	if len(runs) == 0 {
		fmt.Println("No runs found.")
		return
	}

	fmt.Printf("%-24s %-22s %-32s %-12s %s\n", "RUN NAME", "ENVIRONMENT", "RUN ID", "STATUS", "CREATED")
	for _, run := range runs {
		runName := strings.TrimSpace(run.Name)
		if runName == "" {
			runName = "unnamed"
		}
		envLabel := envNameByID[strings.TrimSpace(run.EnvironmentID)]
		if envLabel == "" {
			envLabel = "unknown"
		}
		created := formatUnixMillis(run.CreatedAt)
		fmt.Printf(
			"%-24s %-22s %-32s %-12s %s\n",
			truncateRunListColumn(runName, 24),
			truncateRunListColumn(envLabel, 22),
			truncateRunListColumn(run.RunID, 32),
			truncateRunListColumn(run.Status, 12),
			created,
		)
	}
}

func truncateRunListColumn(value string, max int) string {
	if max <= 3 || len(value) <= max {
		return value
	}
	return value[:max-3] + "..."
}

func formatUnixMillis(value int64) string {
	if value <= 0 {
		return "-"
	}
	return time.UnixMilli(value).Local().Format("2006-01-02 15:04:05")
}

func asInt64(v any) int64 {
	switch t := v.(type) {
	case int:
		return int64(t)
	case int64:
		return t
	case float64:
		return int64(t)
	case json.Number:
		n, err := t.Int64()
		if err == nil {
			return n
		}
		f, ferr := t.Float64()
		if ferr != nil {
			return 0
		}
		return int64(f)
	default:
		return 0
	}
}

func runWatch(args []string) {
	fs := flag.NewFlagSet("run watch", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	interval := fs.Int("interval", 5, "Polling interval seconds")
	mustParseFlags(fs, args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id_or_name is required (usage: tahuna run watch <run_id|run_name>)")
	resolvedRunID, err := resolveRunIDByIDOrName(runID)
	must(err)
	require(*interval > 0, "--interval must be >= 1")

	must(monitorRun(resolvedRunID, *interval))
}

func runLogs(args []string) {
	fs := flag.NewFlagSet("run logs", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	lines := fs.Int("tail", 0, "Show only the last N log lines (0 = all)")
	fs.IntVar(lines, "n", 0, "Show only the last N log lines (0 = all)")
	follow := fs.Bool("follow", false, "Follow log output (stream until run finishes)")
	fs.BoolVar(follow, "f", false, "Follow log output (stream until run finishes)")
	verbose := fs.Bool("verbose", false, "Show full logs payload")
	fs.BoolVar(verbose, "v", false, "Show full logs payload")
	interval := fs.Int("interval", 2, "Polling interval seconds when following")
	mustParseFlags(fs, args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id_or_name is required (usage: tahuna run logs <run_id|run_name>)")
	resolvedRunID, err := resolveRunIDByIDOrName(runID)
	must(err)
	require(*interval > 0, "--interval must be >= 1")
	require(!(*follow && *verbose), "--follow (-f) cannot be used with --verbose (-v)")

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/runs/"+resolvedRunID+"/logs", nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[runLogsResponse](http.MethodGet, "/runs/"+resolvedRunID+"/logs", nil)
	must(err)
	printRunLogsSummary(resp, *lines)

	if !*follow {
		return
	}
	must(followRunLogs(resolvedRunID, resp, *interval))
}

func printRunSummary(run runResponse) {
	runID := strings.TrimSpace(run.RunID)
	if runID != "" {
		fmt.Printf("Run ID: %s\n", runID)
	}
	runName := strings.TrimSpace(run.Name)
	if runName != "" {
		fmt.Printf("Name: %s\n", runName)
	}
	envID := strings.TrimSpace(run.EnvironmentID)
	if envID != "" {
		fmt.Printf("Environment ID: %s\n", envID)
	}
	status := strings.TrimSpace(run.Status)
	if status == "" {
		status = "unknown"
	}
	fmt.Printf("Status: %s\n", status)
	if run.CreatedAt > 0 {
		fmt.Printf("Created: %s\n", formatUnixMillis(run.CreatedAt))
	}
	gpuType := strings.TrimSpace(run.EffectiveGPUType)
	gpuCount := run.EffectiveGPUCount
	if gpuType != "" || gpuCount > 0 {
		if gpuCount > 0 {
			fmt.Printf("GPU: %s x%d\n", defaultString(gpuType, "unknown"), gpuCount)
		} else {
			fmt.Printf("GPU: %s\n", defaultString(gpuType, "unknown"))
		}
	}
	if run.EffectiveVolumeGB > 0 {
		fmt.Printf("Volume: %dGB\n", run.EffectiveVolumeGB)
	}
	codeHash := strings.TrimSpace(run.CodeManifestHash)
	if codeHash != "" {
		fmt.Printf("Code manifest: %s\n", codeHash)
	}
	dataHash := strings.TrimSpace(run.DataManifestHash)
	if dataHash != "" {
		fmt.Printf("Data manifest: %s\n", dataHash)
	}
	errorText := strings.TrimSpace(run.Error)
	if errorText != "" {
		fmt.Printf("Error: %s\n", errorText)
	}
	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}

type runtimeLogLine struct {
	timestamp int64
	level     string
	source    string
	message   string
}

func parseRecentRunLogs(logs []logLineResponse) []runtimeLogLine {
	if len(logs) == 0 {
		return nil
	}

	out := make([]runtimeLogLine, 0, len(logs))
	for _, entry := range logs {
		message := strings.TrimSpace(entry.Message)
		if message == "" {
			continue
		}
		level := strings.ToUpper(strings.TrimSpace(entry.Level))
		if level == "" {
			level = "INFO"
		}
		source := strings.TrimSpace(entry.Source)
		if source == "" {
			source = "runtime"
		}
		out = append(out, runtimeLogLine{
			timestamp: entry.Timestamp,
			level:     level,
			source:    source,
			message:   message,
		})
	}
	return out
}

func formatRuntimeLogLine(line runtimeLogLine) string {
	return fmt.Sprintf("%s %-7s %-12s %s", formatUnixMillis(line.timestamp), line.level, line.source, line.message)
}

func runtimeLogLineKey(line runtimeLogLine) string {
	return fmt.Sprintf("%d|%s|%s|%s", line.timestamp, line.level, line.source, line.message)
}

func isTerminalRunStatus(status string) bool {
	return status == "completed" || status == "failed" || status == "cancelled"
}

func followRunLogs(runID string, initialResp runLogsResponse, interval int) error {
	const maxConsecutivePollErrors = 12
	fmt.Printf("%sFollowing logs for run %s (Ctrl+C to stop)%s\n", cAmpMuted, runID, cReset)

	seen := map[string]struct{}{}
	consecutivePollErrors := 0
	for _, line := range parseRecentRunLogs(initialResp.RecentLogs) {
		key := runtimeLogLineKey(line)
		seen[key] = struct{}{}
	}

	for {
		statusResp, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				logWarn("unable to poll run status (%v); retrying in %ds (%d/%d)",
					err, interval, consecutivePollErrors, maxConsecutivePollErrors)
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf(
						"run status polling failed %d times in a row: %w",
						consecutivePollErrors,
						err,
					)
				}
				runLogsFollowSleep(time.Duration(interval) * time.Second)
				continue
			}
			return err
		}
		status := statusResp.Status
		if status == "" {
			status = "queued"
		}

		logResp, err := doJSONAs[runLogsResponse](http.MethodGet, "/runs/"+runID+"/logs", nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				logWarn("unable to poll run logs (%v); retrying in %ds (%d/%d)",
					err, interval, consecutivePollErrors, maxConsecutivePollErrors)
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf(
						"run log polling failed %d times in a row: %w",
						consecutivePollErrors,
						err,
					)
				}
				runLogsFollowSleep(time.Duration(interval) * time.Second)
				continue
			}
			return err
		}
		if consecutivePollErrors > 0 {
			logInfo("recovered run log polling")
			consecutivePollErrors = 0
		}
		for _, line := range parseRecentRunLogs(logResp.RecentLogs) {
			key := runtimeLogLineKey(line)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			fmt.Println(formatRuntimeLogLine(line))
		}

		if isTerminalRunStatus(status) {
			return nil
		}
		runLogsFollowSleep(time.Duration(interval) * time.Second)
	}
}

func printRunLogsSummary(resp runLogsResponse, maxLines int) {
	runID := strings.TrimSpace(resp.RunID)
	if runID != "" {
		fmt.Printf("Run: %s\n", runID)
	}
	logsPath := strings.TrimSpace(resp.LogsPath)
	if logsPath != "" {
		fmt.Printf("Logs path: %s\n", logsPath)
	}
	logFile := strings.TrimSpace(resp.LogFile)
	if logFile != "" {
		fmt.Printf("Log file: %s\n", logFile)
	}
	note := strings.TrimSpace(resp.Note)
	if note != "" {
		fmt.Printf("Note: %s\n", note)
	}

	fmt.Println()
	fmt.Println("Recent logs:")
	recentLogs := parseRecentRunLogs(resp.RecentLogs)
	if maxLines > 0 && len(recentLogs) > maxLines {
		recentLogs = recentLogs[len(recentLogs)-maxLines:]
	}
	if len(recentLogs) == 0 {
		fmt.Println("(no log lines yet)")
	} else {
		for _, line := range recentLogs {
			fmt.Println(formatRuntimeLogLine(line))
		}
	}

	if len(resp.RecentMetrics) == 0 {
		return
	}
	fmt.Println()
	fmt.Println("Recent metrics:")
	for _, metric := range resp.RecentMetrics {
		name := strings.TrimSpace(metric.Name)
		if name == "" {
			continue
		}
		timestamp := formatUnixMillis(metric.Timestamp)
		source := strings.TrimSpace(metric.Source)
		if source == "" {
			source = "runtime"
		}
		stepText := "-"
		if metric.Step != nil {
			stepText = strconv.FormatInt(*metric.Step, 10)
		}
		unit := strings.TrimSpace(metric.Unit)
		valueText := strconv.FormatFloat(metric.Value, 'f', -1, 64)
		if unit != "" {
			valueText = valueText + " " + unit
		}
		fmt.Printf("%s %-12s %-20s value=%-12s step=%s\n", timestamp, source, name, valueText, stepText)
	}
	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}

func runCancel(args []string) {
	fs := flag.NewFlagSet("run cancel", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	force := fs.Bool("f", false, "Force cancel (immediate termination, no graceful shutdown)")
	forceLong := fs.Bool("force", false, "Force cancel (immediate termination, no graceful shutdown)")
	mustParseFlags(fs, args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id_or_name is required (usage: tahuna run cancel <run_id|run_name> [-f])")
	resolvedRunID, err := resolveRunIDByIDOrName(runID)
	must(err)

	isForce := *force || *forceLong

	if !isForce {
		confirm := promptChoice(
			fmt.Sprintf("Cancel run %s? This will attempt graceful shutdown.", resolvedRunID),
			[]string{"Yes, cancel", "No, keep running"},
			1,
		)
		if confirm != "Yes, cancel" {
			fmt.Println("Cancelled.")
			return
		}
	}

	resp, err := doJSONAs[cancelRunResponse](http.MethodPost, "/runs/"+resolvedRunID+"/cancel", map[string]any{
		"force": isForce,
	})
	must(err)

	if resp.CancelRequested {
		if isForce {
			fmt.Printf("%sForce cancellation requested for run %s.%s\n", cAmpGold, resolvedRunID, cReset)
		} else {
			fmt.Printf("%sCancellation requested for run %s. Waiting for graceful shutdown...%s\n", cAmpGold, resolvedRunID, cReset)
		}
	} else if resp.Deleted {
		fmt.Printf("%sRun %s deleted.%s\n", cAmpGreen, resolvedRunID, cReset)
	} else {
		printJSON(resp)
	}
}

func runDelete(args []string) {
	fs := flag.NewFlagSet("run rm", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	all := fs.Bool("all", false, "Delete all runs")
	fs.BoolVar(all, "a", false, "Delete all runs")
	cancel := fs.Bool("cancel", false, "Cancel run first, then delete")
	fs.BoolVar(cancel, "c", false, "Cancel run first, then delete")
	force := fs.Bool("force", false, "Force delete active run (terminates pod immediately)")
	fs.BoolVar(force, "f", false, "Force delete active run (terminates pod immediately)")
	mustParseFlags(fs, args)
	rawTargets := append([]string{}, fs.Args()...)
	if strings.TrimSpace(*id) != "" {
		rawTargets = append(rawTargets, *id)
	}
	require(!(*all && len(rawTargets) > 0), "cannot combine --all with explicit run targets")

	resolvedRunIDs, err := resolveRunDeleteTargets(rawTargets, *all)
	must(err)
	if len(resolvedRunIDs) == 0 {
		fmt.Println("No runs found.")
		return
	}

	query := neturl.Values{}
	if *cancel || *force {
		query.Set("cancel", "1")
	}
	if *force {
		query.Set("force", "1")
	}
	for _, resolvedRunID := range resolvedRunIDs {
		path := "/runs/" + resolvedRunID
		if encoded := query.Encode(); encoded != "" {
			path += "?" + encoded
		}

		resp, err := doJSON(http.MethodDelete, path, nil)
		if err != nil {
			var apiErr *apiRequestError
			if errors.As(err, &apiErr) && *cancel && !*force && apiErr.status == http.StatusConflict {
				if strings.Contains(strings.ToLower(apiErr.detail), "cancellation requested") {
					fmt.Printf("%sCancellation requested for run %s. Delete will complete after shutdown; retry `tahuna run rm %s` in a moment.%s\n", cAmpGold, resolvedRunID, resolvedRunID, cReset)
					continue
				}
			}
			must(err)
		}
		printJSON(resp)
	}
}

type runDeleteTarget struct {
	id   string
	name string
}

func resolveRunDeleteTargets(targets []string, deleteAll bool) ([]string, error) {
	trimmed := make([]string, 0, len(targets))
	for _, raw := range targets {
		target := strings.TrimSpace(raw)
		if target == "" {
			continue
		}
		trimmed = append(trimmed, target)
	}
	if !deleteAll && len(trimmed) == 0 {
		return nil, errors.New("run_id_or_name is required (usage: tahuna run rm <run_id|run_name|pattern> ... or --all)")
	}

	resp, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err != nil {
		return nil, err
	}

	runs := make([]runDeleteTarget, 0, len(resp.Runs))
	for _, r := range resp.Runs {
		runID := strings.TrimSpace(r.RunID)
		if runID == "" {
			continue
		}
		runs = append(runs, runDeleteTarget{
			id:   runID,
			name: strings.TrimSpace(r.Name),
		})
	}

	if deleteAll {
		out := make([]string, 0, len(runs))
		for _, run := range runs {
			out = append(out, run.id)
		}
		return out, nil
	}

	out := make([]string, 0, len(trimmed))
	seen := make(map[string]struct{}, len(trimmed))
	for _, target := range trimmed {
		resolved, err := resolveRunDeleteTarget(target, runs)
		if err != nil {
			return nil, err
		}
		for _, runID := range resolved {
			if _, exists := seen[runID]; exists {
				continue
			}
			seen[runID] = struct{}{}
			out = append(out, runID)
		}
	}
	return out, nil
}

func resolveRunDeleteTarget(target string, runs []runDeleteTarget) ([]string, error) {
	if strings.ContainsAny(target, "*?[") {
		matches := make([]string, 0, 4)
		for _, run := range runs {
			matchName, err := path.Match(target, run.name)
			if err != nil {
				return nil, fmt.Errorf("invalid wildcard pattern %q: %w", target, err)
			}
			matchID, err := path.Match(target, run.id)
			if err != nil {
				return nil, fmt.Errorf("invalid wildcard pattern %q: %w", target, err)
			}
			if matchName || matchID {
				matches = append(matches, run.id)
			}
		}
		if len(matches) == 0 {
			return nil, fmt.Errorf("run pattern %q matched no runs", target)
		}
		return matches, nil
	}

	for _, run := range runs {
		if run.id == target {
			return []string{run.id}, nil
		}
	}

	matches := make([]string, 0, 2)
	for _, run := range runs {
		if run.name == target {
			matches = append(matches, run.id)
		}
	}
	if len(matches) == 1 {
		return matches, nil
	}
	if len(matches) > 1 {
		return nil, fmt.Errorf("multiple runs found with name %q; use run_id instead", target)
	}
	return nil, fmt.Errorf("run %q not found", target)
}

// extractMetricArgs splits --metric / -m values (multi-value) out of the arg
// list and returns the remaining args plus the collected metric names.
// Everything after --metric / -m that does not start with "-" is a metric name.
func extractMetricArgs(args []string) (remaining []string, metrics []string) {
	remaining = make([]string, 0, len(args))
	metrics = make([]string, 0, 4)
	collecting := false
	for _, arg := range args {
		if arg == "--metric" || arg == "-m" {
			collecting = true
			continue
		}
		if collecting {
			if strings.HasPrefix(arg, "-") {
				collecting = false
				remaining = append(remaining, arg)
			} else {
				metrics = append(metrics, strings.TrimSpace(arg))
			}
			continue
		}
		remaining = append(remaining, arg)
	}
	return remaining, metrics
}

func runMetrics(args []string) {
	cleanedArgs, metrics := extractMetricArgs(args)

	fs := flag.NewFlagSet("run metrics", flag.ExitOnError)
	tail := fs.Int("tail", 0, "Show only the last N steps per run (0 = all)")
	fs.IntVar(tail, "n", 0, "Show only the last N steps per run (0 = all)")
	follow := fs.Bool("follow", false, "Follow metric output (stream until runs finish)")
	fs.BoolVar(follow, "f", false, "Follow metric output (stream until runs finish)")
	verbose := fs.Bool("verbose", false, "Show full JSON payload")
	fs.BoolVar(verbose, "v", false, "Show full JSON payload")
	interval := fs.Int("interval", 2, "Polling interval seconds when following")
	mustParseFlags(fs, cleanedArgs)

	positional := fs.Args()
	require(len(positional) >= 1, "at least one run_id or run_name is required (usage: tahuna run metrics <run>... --metric <name>)")
	require(len(metrics) > 0, "at least one --metric (-m) is required")
	require(*interval > 0, "--interval must be >= 1")
	require(!(*follow && *verbose), "--follow (-f) cannot be used with --verbose (-v)")

	type resolvedRun struct {
		label string
		id    string
	}
	runs := make([]resolvedRun, 0, len(positional))
	for _, arg := range positional {
		label := strings.TrimSpace(arg)
		resolvedID, err := resolveRunIDByIDOrName(label)
		must(err)
		runs = append(runs, resolvedRun{label: label, id: resolvedID})
	}

	if *verbose {
		combined := make(map[string]any, len(runs))
		for _, run := range runs {
			resp, err := doJSON(http.MethodGet, "/runs/"+run.id+"/logs", nil)
			must(err)
			combined[run.label] = resp
		}
		printJSON(combined)
		return
	}

	fetchAllMetrics := func() map[string][]metricResponse {
		out := make(map[string][]metricResponse, len(runs))
		for _, run := range runs {
			resp, err := doJSONAs[runLogsResponse](http.MethodGet, "/runs/"+run.id+"/logs", nil)
			must(err)
			out[run.label] = resp.RecentMetrics
		}
		return out
	}

	labels := make([]string, 0, len(runs))
	for _, r := range runs {
		labels = append(labels, r.label)
	}

	if !*follow {
		allMetrics := fetchAllMetrics()
		for _, metricName := range metrics {
			printMetricTable(metricName, labels, allMetrics, *tail)
		}
		return
	}

	fmt.Printf("%sFollowing metrics for %s (Ctrl+C to stop)%s\n", cAmpMuted, strings.Join(labels, ", "), cReset)

	// Track seen steps per metric per run to only print new rows.
	seen := make(map[string]map[string]map[int64]struct{}) // metric -> run -> step
	for _, m := range metrics {
		seen[m] = make(map[string]map[int64]struct{})
		for _, label := range labels {
			seen[m][label] = make(map[int64]struct{})
		}
	}

	// Seed seen set from initial fetch.
	allMetrics := fetchAllMetrics()
	for _, metricName := range metrics {
		for _, label := range labels {
			for _, m := range allMetrics[label] {
				if strings.TrimSpace(m.Name) != metricName || m.Step == nil {
					continue
				}
				seen[metricName][label][*m.Step] = struct{}{}
			}
		}
		printMetricTable(metricName, labels, allMetrics, 0)
	}

	consecutivePollErrors := 0
	const maxConsecutivePollErrors = 12

	for {
		// Check if all runs are terminal.
		allTerminal := true
		for _, run := range runs {
			statusResp, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+run.id, nil)
			if err != nil {
				if isRetryableRunPollError(err) {
					consecutivePollErrors++
					logWarn("unable to poll run status (%v); retrying in %ds (%d/%d)",
						err, *interval, consecutivePollErrors, maxConsecutivePollErrors)
					if consecutivePollErrors >= maxConsecutivePollErrors {
						must(fmt.Errorf("run status polling failed %d times in a row: %w", consecutivePollErrors, err))
					}
					allTerminal = false
					break
				}
				must(err)
			}
			if !isTerminalRunStatus(statusResp.Status) {
				allTerminal = false
			}
		}

		latestMetrics := fetchAllMetrics()
		if consecutivePollErrors > 0 {
			logInfo("recovered metric polling")
			consecutivePollErrors = 0
		}

		for _, metricName := range metrics {
			// Collect only new rows.
			newMetrics := make(map[string][]metricResponse, len(labels))
			hasNew := false
			for _, label := range labels {
				for _, m := range latestMetrics[label] {
					if strings.TrimSpace(m.Name) != metricName || m.Step == nil {
						continue
					}
					if _, exists := seen[metricName][label][*m.Step]; exists {
						continue
					}
					seen[metricName][label][*m.Step] = struct{}{}
					newMetrics[label] = append(newMetrics[label], m)
					hasNew = true
				}
			}
			if hasNew {
				fmt.Printf("%s── %s (%s) ──%s\n", cAmpMuted, metricName, strings.Join(labels, ", "), cReset)
				printMetricTable(metricName, labels, newMetrics, 0)
			}
		}

		if allTerminal {
			return
		}
		runLogsFollowSleep(time.Duration(*interval) * time.Second)
	}
}

func printMetricTable(metricName string, runLabels []string, allMetrics map[string][]metricResponse, tailN int) {
	// Collect values per run keyed by step.
	runValues := make(map[string]map[int64]float64, len(runLabels))
	stepsSet := make(map[int64]struct{})
	for _, label := range runLabels {
		runValues[label] = make(map[int64]float64)
		for _, m := range allMetrics[label] {
			if strings.TrimSpace(m.Name) != metricName {
				continue
			}
			if m.Step == nil {
				continue
			}
			runValues[label][*m.Step] = m.Value
			stepsSet[*m.Step] = struct{}{}
		}
	}

	steps := make([]int64, 0, len(stepsSet))
	for s := range stepsSet {
		steps = append(steps, s)
	}
	sort.Slice(steps, func(i, j int) bool { return steps[i] < steps[j] })

	if tailN > 0 && len(steps) > tailN {
		steps = steps[len(steps)-tailN:]
	}

	if len(steps) == 0 {
		fmt.Printf("\nMetric: %s\n(no data points)\n\n", metricName)
		return
	}

	// Compute column widths.
	stepColWidth := 6 // "  STEP"
	for _, s := range steps {
		w := len(strconv.FormatInt(s, 10))
		if w+2 > stepColWidth {
			stepColWidth = w + 2
		}
	}

	colWidths := make([]int, len(runLabels))
	for i, label := range runLabels {
		colWidths[i] = len(label) + 2
		if colWidths[i] < 10 {
			colWidths[i] = 10
		}
	}

	for i, label := range runLabels {
		for _, s := range steps {
			if v, ok := runValues[label][s]; ok {
				w := len(formatMetricValue(v)) + 2
				if w > colWidths[i] {
					colWidths[i] = w
				}
			}
		}
	}

	fmt.Printf("\nMetric: %s\n\n", metricName)

	// Header.
	fmt.Printf("%*s", stepColWidth, "STEP")
	for i, label := range runLabels {
		fmt.Printf("%*s", colWidths[i], label)
	}
	fmt.Println()

	// Rows.
	for _, s := range steps {
		fmt.Printf("%*d", stepColWidth, s)
		for i, label := range runLabels {
			if v, ok := runValues[label][s]; ok {
				fmt.Printf("%*s", colWidths[i], formatMetricValue(v))
			} else {
				fmt.Printf("%*s", colWidths[i], "-")
			}
		}
		fmt.Println()
	}
	fmt.Println()
}

func formatMetricValue(v float64) string {
	s := strconv.FormatFloat(v, 'f', -1, 64)
	// Cap decimal places at 4 for readability.
	if idx := strings.Index(s, "."); idx >= 0 && len(s)-idx-1 > 4 {
		s = strconv.FormatFloat(v, 'f', 4, 64)
	}
	return s
}
