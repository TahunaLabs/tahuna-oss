package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func runShow(args []string) {
	fs := flag.NewFlagSet("run show", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	list := fs.Bool("list", false, "List all runs")
	limit := fs.Int("lines", 5, "Show only the last N runs (tail order)")
	fs.IntVar(limit, "l", 5, "Show only the last N runs (tail order)")
	fs.IntVar(limit, "n", 5, "Deprecated alias for --lines")
	all := fs.Bool("all", false, "Show all runs")
	fs.BoolVar(all, "a", false, "Show all runs")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	fs.Parse(args)

	if *list {
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
		return
	}
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id is required (usage: tahuna run show <run_id>)")
	resp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
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
	fs.Parse(args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id is required (usage: tahuna run watch <run_id>)")
	require(*interval > 0, "--interval must be >= 1")

	must(monitorRun(runID, *interval))
}

func runLogs(args []string) {
	fs := flag.NewFlagSet("run logs", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	lines := fs.Int("lines", 0, "Show only the last N log lines (0 = all)")
	fs.IntVar(lines, "l", 0, "Show only the last N log lines (0 = all)")
	fs.IntVar(lines, "n", 0, "Deprecated alias for --lines")
	follow := fs.Bool("follow", false, "Follow log output (stream until run finishes)")
	fs.BoolVar(follow, "f", false, "Follow log output (stream until run finishes)")
	verbose := fs.Bool("verbose", false, "Show full logs payload")
	fs.BoolVar(verbose, "v", false, "Show full logs payload")
	interval := fs.Int("interval", 2, "Polling interval seconds when following")
	fs.Parse(args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id is required (usage: tahuna run logs <run_id>)")
	require(*interval > 0, "--interval must be >= 1")
	require(!(*follow && *verbose), "--follow (-f) cannot be used with --verbose (-v)")

	resp, err := doJSON(http.MethodGet, "/runs/"+runID+"/logs", nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	printRunLogsSummary(resp, *lines)

	if !*follow {
		return
	}
	must(followRunLogs(runID, resp, *interval))
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
	fmt.Printf("%sFollowing logs for run %s (Ctrl+C to stop)%s\n", cAmpMuted, runID, cReset)

	seen := map[string]struct{}{}
	for _, line := range parseRecentRunLogs(initialResp) {
		key := runtimeLogLineKey(line)
		seen[key] = struct{}{}
	}

	for {
		statusResp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			return err
		}
		status := asString(statusResp["status"])
		if status == "" {
			status = "queued"
		}

		logResp, err := doJSON(http.MethodGet, "/runs/"+runID+"/logs", nil)
		if err != nil {
			return err
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
	fs.Parse(args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id is required (usage: tahuna run cancel <run_id> [-f])")

	isForce := *force || *forceLong

	if !isForce {
		confirm := promptChoice(
			fmt.Sprintf("Cancel run %s? This will attempt graceful shutdown.", runID),
			[]string{"Yes, cancel", "No, keep running"},
			1,
		)
		if confirm != "Yes, cancel" {
			fmt.Println("Cancelled.")
			return
		}
	}

	resp, err := doJSON(http.MethodPost, "/runs/"+runID+"/cancel", map[string]any{
		"force": isForce,
	})
	must(err)

	if cancelled, ok := resp["cancel_requested"]; ok && cancelled == true {
		if isForce {
			fmt.Printf("%sForce cancellation requested for run %s.%s\n", cAmpGold, runID, cReset)
		} else {
			fmt.Printf("%sCancellation requested for run %s. Waiting for graceful shutdown...%s\n", cAmpGold, runID, cReset)
		}
	} else if deleted, ok := resp["deleted"]; ok && deleted == true {
		fmt.Printf("%sRun %s deleted.%s\n", cAmpGreen, runID, cReset)
	} else {
		printJSON(resp)
	}
}

func runDelete(args []string) {
	fs := flag.NewFlagSet("run delete", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	fs.Parse(args)
	runID := resolveRunID(*id, fs.Args())
	require(runID != "", "run_id is required (usage: tahuna run delete <run_id>)")

	resp, err := doJSON(http.MethodDelete, "/runs/"+runID, nil)
	must(err)
	printJSON(resp)
}
