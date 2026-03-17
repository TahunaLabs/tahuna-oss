package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	neturl "net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

func runList(args []string) {
	fs := flag.NewFlagSet("run list", flag.ExitOnError)
	limit := fs.Int("lines", 5, "Show only the last N runs (tail order)")
	fs.IntVar(limit, "l", 5, "Show only the last N runs (tail order)")
	all := fs.Bool("all", false, "Show all runs")
	fs.BoolVar(all, "a", false, "Show all runs")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	mustParseFlags(fs, args)

	resp, err := doJSON(http.MethodGet, "/runs", nil)
	must(err)
	runsAny, ok := resp["runs"].([]any)
	if !ok {
		printJSON(resp)
		return
	}
	orderedRuns := reverseRunsForTailOrder(runsAny)
	if !*all && *limit > 0 && len(orderedRuns) > *limit {
		orderedRuns = orderedRuns[len(orderedRuns)-*limit:]
	}
	if *verbose {
		printJSON(map[string]any{"runs": orderedRuns})
		return
	}
	printRunListSummary(orderedRuns)
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
	resp, err := doJSON(http.MethodGet, "/runs/"+resolvedRunID, nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	printRunSummary(resp)
}

func reverseRunsForTailOrder(runs []any) []any {
	ordered := make([]any, len(runs))
	for i := range runs {
		ordered[i] = runs[len(runs)-1-i]
	}
	return ordered
}

func printRunListSummary(runsAny []any) {
	if len(runsAny) == 0 {
		fmt.Println("No runs found.")
		return
	}

	envNameByID := map[string]string{}
	envResp, err := doJSON(http.MethodGet, "/environments", nil)
	if err == nil {
		if environmentsAny, ok := envResp["environments"].([]any); ok {
			for _, raw := range environmentsAny {
				row, ok := raw.(map[string]any)
				if !ok {
					continue
				}
				envID := asString(row["environment_id"])
				envName := asString(row["name"])
				if envID != "" && envName != "" {
					envNameByID[envID] = envName
				}
			}
		}
	}

	fmt.Printf("%-24s %-22s %-32s %-12s %s\n", "RUN NAME", "ENVIRONMENT", "RUN ID", "STATUS", "CREATED")
	for _, raw := range runsAny {
		run, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		runName := strings.TrimSpace(asString(run["name"]))
		if runName == "" {
			runName = "unnamed"
		}
		envID := strings.TrimSpace(asString(run["environment_id"]))
		envLabel := envNameByID[envID]
		if envLabel == "" {
			envLabel = "unknown"
		}
		runID := asString(run["run_id"])
		status := asString(run["status"])
		created := formatUnixMillis(asInt64(run["created_at"]))
		fmt.Printf(
			"%-24s %-22s %-32s %-12s %s\n",
			truncateRunListColumn(runName, 24),
			truncateRunListColumn(envLabel, 22),
			truncateRunListColumn(runID, 32),
			truncateRunListColumn(status, 12),
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

func asFloat64(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		out, err := t.Float64()
		return out, err == nil
	case string:
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			return 0, false
		}
		out, err := strconv.ParseFloat(trimmed, 64)
		return out, err == nil
	default:
		return 0, false
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
	lines := fs.Int("lines", 0, "Show only the last N log lines (0 = all)")
	fs.IntVar(lines, "l", 0, "Show only the last N log lines (0 = all)")
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

	resp, err := doJSON(http.MethodGet, "/runs/"+resolvedRunID+"/logs", nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	printRunLogsSummary(resp, *lines)

	if !*follow {
		return
	}
	must(followRunLogs(resolvedRunID, resp, *interval))
}

func printRunSummary(resp map[string]any) {
	runID := strings.TrimSpace(asString(resp["run_id"]))
	if runID != "" {
		fmt.Printf("Run ID: %s\n", runID)
	}
	runName := strings.TrimSpace(asString(resp["name"]))
	if runName != "" {
		fmt.Printf("Name: %s\n", runName)
	}
	envID := strings.TrimSpace(asString(resp["environment_id"]))
	if envID != "" {
		fmt.Printf("Environment ID: %s\n", envID)
	}
	status := strings.TrimSpace(asString(resp["status"]))
	if status == "" {
		status = "unknown"
	}
	fmt.Printf("Status: %s\n", status)
	createdAt := asInt64(resp["created_at"])
	if createdAt > 0 {
		fmt.Printf("Created: %s\n", formatUnixMillis(createdAt))
	}
	gpuType := strings.TrimSpace(asString(resp["effective_gpu_type"]))
	gpuCount := asInt64(resp["effective_gpu_count"])
	if gpuType != "" || gpuCount > 0 {
		if gpuCount > 0 {
			fmt.Printf("GPU: %s x%d\n", defaultString(gpuType, "unknown"), gpuCount)
		} else {
			fmt.Printf("GPU: %s\n", defaultString(gpuType, "unknown"))
		}
	}
	volumeGb := asInt64(resp["effective_volume_gb"])
	if volumeGb > 0 {
		fmt.Printf("Volume: %dGB\n", volumeGb)
	}
	codeHash := strings.TrimSpace(asString(resp["code_manifest_hash"]))
	if codeHash != "" {
		fmt.Printf("Code manifest: %s\n", codeHash)
	}
	dataHash := strings.TrimSpace(asString(resp["data_manifest_hash"]))
	if dataHash != "" {
		fmt.Printf("Data manifest: %s\n", dataHash)
	}
	errorText := strings.TrimSpace(asString(resp["error"]))
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

func parseRecentRunLogs(resp map[string]any) []runtimeLogLine {
	recentLogs, _ := resp["recent_logs"].([]any)
	if len(recentLogs) == 0 {
		return nil
	}

	out := make([]runtimeLogLine, 0, len(recentLogs))
	for _, raw := range recentLogs {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		message := strings.TrimSpace(asString(row["message"]))
		if message == "" {
			continue
		}
		level := strings.ToUpper(strings.TrimSpace(asString(row["level"])))
		if level == "" {
			level = "INFO"
		}
		source := strings.TrimSpace(asString(row["source"]))
		if source == "" {
			source = "runtime"
		}
		out = append(out, runtimeLogLine{
			timestamp: asInt64(row["timestamp"]),
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

func followRunLogs(runID string, initialResp map[string]any, interval int) error {
	const maxConsecutivePollErrors = 12
	fmt.Printf("%sFollowing logs for run %s (Ctrl+C to stop)%s\n", cAmpMuted, runID, cReset)

	seen := map[string]struct{}{}
	consecutivePollErrors := 0
	for _, line := range parseRecentRunLogs(initialResp) {
		key := runtimeLogLineKey(line)
		seen[key] = struct{}{}
	}

	for {
		statusResp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				fmt.Printf(
					"%swarning:%s unable to poll run status (%v); retrying in %ds (%d/%d)\n",
					cAmpGold,
					cReset,
					err,
					interval,
					consecutivePollErrors,
					maxConsecutivePollErrors,
				)
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
		status := asString(statusResp["status"])
		if status == "" {
			status = "queued"
		}

		logResp, err := doJSON(http.MethodGet, "/runs/"+runID+"/logs", nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				fmt.Printf(
					"%swarning:%s unable to poll run logs (%v); retrying in %ds (%d/%d)\n",
					cAmpGold,
					cReset,
					err,
					interval,
					consecutivePollErrors,
					maxConsecutivePollErrors,
				)
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
			fmt.Printf("%sinfo:%s recovered run log polling\n", cAmpMuted, cReset)
			consecutivePollErrors = 0
		}
		for _, line := range parseRecentRunLogs(logResp) {
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

func printRunLogsSummary(resp map[string]any, maxLines int) {
	runID := strings.TrimSpace(asString(resp["run_id"]))
	if runID != "" {
		fmt.Printf("Run: %s\n", runID)
	}
	logsPath := strings.TrimSpace(asString(resp["logs_path"]))
	if logsPath != "" {
		fmt.Printf("Logs path: %s\n", logsPath)
	}
	logFile := strings.TrimSpace(asString(resp["log_file"]))
	if logFile != "" {
		fmt.Printf("Log file: %s\n", logFile)
	}
	note := strings.TrimSpace(asString(resp["note"]))
	if note != "" {
		fmt.Printf("Note: %s\n", note)
	}

	fmt.Println()
	fmt.Println("Recent logs:")
	recentLogs := parseRecentRunLogs(resp)
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

	recentMetrics, _ := resp["recent_metrics"].([]any)
	if len(recentMetrics) == 0 {
		return
	}
	fmt.Println()
	fmt.Println("Recent metrics:")
	for _, raw := range recentMetrics {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := strings.TrimSpace(asString(row["name"]))
		if name == "" {
			continue
		}
		value, ok := asFloat64(row["value"])
		if !ok {
			continue
		}
		timestamp := formatUnixMillis(asInt64(row["timestamp"]))
		source := strings.TrimSpace(asString(row["source"]))
		if source == "" {
			source = "runtime"
		}
		stepText := "-"
		if stepRaw, exists := row["step"]; exists && stepRaw != nil {
			stepText = strconv.FormatInt(asInt64(stepRaw), 10)
		}
		unit := strings.TrimSpace(asString(row["unit"]))
		valueText := strconv.FormatFloat(value, 'f', -1, 64)
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

	resp, err := doJSON(http.MethodPost, "/runs/"+resolvedRunID+"/cancel", map[string]any{
		"force": isForce,
	})
	must(err)

	if cancelled, ok := resp["cancel_requested"]; ok && cancelled == true {
		if isForce {
			fmt.Printf("%sForce cancellation requested for run %s.%s\n", cAmpGold, resolvedRunID, cReset)
		} else {
			fmt.Printf("%sCancellation requested for run %s. Waiting for graceful shutdown...%s\n", cAmpGold, resolvedRunID, cReset)
		}
	} else if deleted, ok := resp["deleted"]; ok && deleted == true {
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

	resp, err := doJSON(http.MethodGet, "/runs", nil)
	if err != nil {
		return nil, err
	}
	runsAny, ok := resp["runs"].([]any)
	if !ok {
		return nil, errors.New("invalid runs response")
	}

	runs := make([]runDeleteTarget, 0, len(runsAny))
	for _, raw := range runsAny {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		runID := strings.TrimSpace(asString(row["run_id"]))
		if runID == "" {
			continue
		}
		runs = append(runs, runDeleteTarget{
			id:   runID,
			name: strings.TrimSpace(asString(row["name"])),
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
