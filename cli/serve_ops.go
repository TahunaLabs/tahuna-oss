package main

import (
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
)

func handleServe(args []string) {
	if len(args) == 0 {
		fmt.Println("missing serve subcommand")
		serveUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		serveUsage()
		return
	}

	switch args[0] {
	case "create":
		serveCreate(args[1:])
	case "list":
		serveList(args[1:])
	case "show":
		serveShow(args[1:])
	case "logs":
		serveLogs(args[1:])
	case "stop":
		serveStop(args[1:])
	default:
		fmt.Printf("unknown serve subcommand: %s\n", args[0])
		serveUsage()
		os.Exit(1)
	}
}

func serveUsage() {
	fmt.Print(`Serve commands:
  tahuna serve help
  tahuna serve create --from-run <run_id> [--model-path <path>] [--verbose|-v]
  tahuna serve create --from-storage-prefix <prefix> [--verbose|-v]
  tahuna serve list [--verbose|-v]
  tahuna serve show <serve_id> | --id <serve_id> [--verbose|-v]
  tahuna serve logs <serve_id> | --id <serve_id> [--lines|-l <N>] [--verbose|-v]
  tahuna serve stop <serve_id> | --id <serve_id> [--force|-f]
`)
}

func validateServeCreateSelection(fromRunID, fromStoragePrefix, modelPath string) error {
	hasRunSource := strings.TrimSpace(fromRunID) != ""
	hasStorageSource := strings.TrimSpace(fromStoragePrefix) != ""
	sourceCount := 0
	if hasRunSource {
		sourceCount++
	}
	if hasStorageSource {
		sourceCount++
	}
	if sourceCount != 1 {
		return errors.New("exactly one of --from-run or --from-storage-prefix is required")
	}
	if !hasRunSource && strings.TrimSpace(modelPath) != "" {
		return errors.New("--model-path requires --from-run")
	}
	return nil
}

func buildServeCreatePayload(environmentID, fromRunID, fromStoragePrefix, modelPath string) (map[string]any, error) {
	if strings.TrimSpace(environmentID) == "" {
		return nil, errors.New("environment_id is required")
	}
	if err := validateServeCreateSelection(fromRunID, fromStoragePrefix, modelPath); err != nil {
		return nil, err
	}

	payload := map[string]any{
		"environment_id": strings.TrimSpace(environmentID),
	}
	if trimmed := strings.TrimSpace(fromRunID); trimmed != "" {
		payload["from_run_id"] = trimmed
	}
	if trimmed := strings.TrimSpace(fromStoragePrefix); trimmed != "" {
		payload["from_storage_prefix"] = trimmed
	}
	if trimmed := strings.TrimSpace(modelPath); trimmed != "" {
		payload["model_path"] = trimmed
	}
	return payload, nil
}

func resolveServeID(id string, args []string, usage string) string {
	serveID := strings.TrimSpace(id)
	if serveID == "" && len(args) > 0 {
		serveID = strings.TrimSpace(args[0])
	}
	require(serveID != "", fmt.Sprintf("serve_id is required (usage: %s)", usage))
	return serveID
}

func createServeWithCapacityPrompt(environmentID string, payload map[string]any) (serveResponse, error) {
	return createWithCapacityPrompt(payload, capacityPromptOptions[serveResponse]{
		create: func(nextPayload map[string]any) (serveResponse, error) {
			return doJSONAs[serveResponse](http.MethodPost, "/serves", nextPayload)
		},
		resolveSelection: func(_ map[string]any) (computeSelection, error) {
			selections, err := loadEnvironmentComputeSelections(environmentID)
			if err != nil {
				return computeSelection{}, err
			}
			return selections.Serve, nil
		},
		persistSelection: func(selectedGPU string, selection computeSelection) {
			persistFallbackServeCompute(environmentID, selectedGPU, selection.GPUCount, selection.VolumeGB)
		},
	})
}

func ensureServeDependencySelection(environmentID string) error {
	cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}
	changed, err := ensureConfiguredDependencyGroup(
		&cfg,
		"serve",
		serveDependencyPromptLabel,
		cfg.ServeDependencyGroup,
		serveDependencyGroupConfigured(cfg),
		"serve",
	)
	if err != nil {
		return err
	}
	if !changed {
		return nil
	}
	if err := saveProjectConfig(cfg); err != nil {
		return fmt.Errorf("failed to save project config: %w", err)
	}
	return runSyncWithStatus(environmentID, syncScope{})
}

func serveCreate(args []string) {
	fs := flag.NewFlagSet("serve create", flag.ExitOnError)
	fromRunID := fs.String("from-run", "", "Completed run ID to serve from")
	fromStoragePrefix := fs.String("from-storage-prefix", "", "Storage prefix to serve from")
	modelPath := fs.String("model-path", "", "Model path inside the selected run output tree")
	verbose := fs.Bool("verbose", false, "Show full serve payload")
	fs.BoolVar(verbose, "v", false, "Show full serve payload")
	mustParseFlags(fs, args)

	must(validateServeCreateSelection(*fromRunID, *fromStoragePrefix, *modelPath))

	environmentID, err := resolveEnvironmentID()
	must(err)
	must(ensureServeDependencySelection(environmentID))

	payload, err := buildServeCreatePayload(environmentID, *fromRunID, *fromStoragePrefix, *modelPath)
	must(err)

	resp, err := createServeWithCapacityPrompt(environmentID, payload)
	must(err)

	printSuccessLine(fmt.Sprintf("serve created: %s (%s)", resp.ServeID, defaultString(resp.Status, "queued")))
	if *verbose {
		printJSON(resp)
	}
}

func serveList(args []string) {
	fs := flag.NewFlagSet("serve list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full serve payload")
	fs.BoolVar(verbose, "v", false, "Show full serve payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/serves", nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[servesResponse](http.MethodGet, "/serves", nil)
	must(err)
	printServeListSummary(resp.Serves, fetchEnvironmentNameMap())
}

func serveShow(args []string) {
	fs := flag.NewFlagSet("serve show", flag.ExitOnError)
	id := fs.String("id", "", "Serve ID")
	verbose := fs.Bool("verbose", false, "Show full serve payload")
	fs.BoolVar(verbose, "v", false, "Show full serve payload")
	mustParseFlags(fs, args)

	serveID := resolveServeID(*id, fs.Args(), "tahuna serve show <serve_id>")
	if *verbose {
		resp, err := doJSON(http.MethodGet, "/serves/"+serveID, nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[serveResponse](http.MethodGet, "/serves/"+serveID, nil)
	must(err)
	printServeSummary(resp)
}

func serveLogs(args []string) {
	fs := flag.NewFlagSet("serve logs", flag.ExitOnError)
	id := fs.String("id", "", "Serve ID")
	lines := fs.Int("lines", 0, "Show only the last N log lines (0 = all)")
	fs.IntVar(lines, "l", 0, "Show only the last N log lines (0 = all)")
	verbose := fs.Bool("verbose", false, "Show full logs payload")
	fs.BoolVar(verbose, "v", false, "Show full logs payload")
	mustParseFlags(fs, args)

	require(*lines >= 0, "--lines must be >= 0")
	serveID := resolveServeID(*id, fs.Args(), "tahuna serve logs <serve_id>")

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/serves/"+serveID+"/logs", nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[serveLogsResponse](http.MethodGet, "/serves/"+serveID+"/logs", nil)
	must(err)
	printServeLogsSummary(resp, *lines)
}

func serveStop(args []string) {
	fs := flag.NewFlagSet("serve stop", flag.ExitOnError)
	id := fs.String("id", "", "Serve ID")
	force := fs.Bool("force", false, "Force stop (immediate termination)")
	fs.BoolVar(force, "f", false, "Force stop (immediate termination)")
	mustParseFlags(fs, args)

	serveID := resolveServeID(*id, fs.Args(), "tahuna serve stop <serve_id> [--force]")
	resp, err := doJSONAs[stopServeResponse](http.MethodPost, "/serves/"+serveID+"/stop", map[string]any{
		"force": *force,
	})
	must(err)

	if !resp.StopRequested {
		printJSON(resp)
		return
	}

	if *force {
		fmt.Printf("%sForce stop requested for serve %s (status: %s).%s\n", cAmpGold, serveID, defaultString(resp.Status, "unknown"), cReset)
		return
	}
	fmt.Printf("%sStop requested for serve %s (status: %s).%s\n", cAmpGold, serveID, defaultString(resp.Status, "unknown"), cReset)
}

func printServeListSummary(serves []serveResponse, envNameByID map[string]string) {
	if len(serves) == 0 {
		fmt.Println("No serves found.")
		return
	}

	fmt.Printf("%-32s %-22s %-12s %-10s %s\n", "SERVE ID", "ENVIRONMENT", "STATUS", "SOURCE", "CREATED")
	for _, serve := range serves {
		envLabel := strings.TrimSpace(envNameByID[strings.TrimSpace(serve.EnvironmentID)])
		if envLabel == "" {
			envLabel = defaultString(serve.EnvironmentID, "unknown")
		}
		fmt.Printf(
			"%-32s %-22s %-12s %-10s %s\n",
			truncateRunListColumn(serve.ServeID, 32),
			truncateRunListColumn(envLabel, 22),
			truncateRunListColumn(defaultString(serve.Status, "unknown"), 12),
			truncateRunListColumn(serveSourceTypeLabel(serve.ModelSnapshot), 10),
			formatUnixMillis(int64(serve.CreatedAt)),
		)
	}
}

func serveSourceTypeLabel(snapshot serveModelSnapshotResponse) string {
	sourceType := strings.TrimSpace(snapshot.SourceType)
	if sourceType == "" {
		return "unknown"
	}
	return sourceType
}

func serveSourceDetail(snapshot serveModelSnapshotResponse) string {
	switch strings.TrimSpace(snapshot.SourceType) {
	case "run":
		runID := strings.TrimSpace(snapshot.SourceRunID)
		if runID == "" {
			return "run"
		}
		return "run " + runID
	case "storage":
		prefix := strings.TrimSpace(snapshot.SourceObjectPrefix)
		if prefix == "" {
			return "storage"
		}
		return "storage " + prefix
	default:
		return "unknown"
	}
}

func printServeSummary(serve serveResponse) {
	if strings.TrimSpace(serve.ServeID) != "" {
		fmt.Printf("Serve ID: %s\n", serve.ServeID)
	}
	if strings.TrimSpace(serve.EnvironmentID) != "" {
		fmt.Printf("Environment ID: %s\n", serve.EnvironmentID)
	}
	fmt.Printf("Status: %s\n", defaultString(serve.Status, "unknown"))
	if serve.CreatedAt > 0 {
		fmt.Printf("Created: %s\n", formatUnixMillis(int64(serve.CreatedAt)))
	}
	if strings.TrimSpace(serve.PodID) != "" {
		fmt.Printf("Pod ID: %s\n", serve.PodID)
	}
	if strings.TrimSpace(serve.PythonVersion) != "" {
		fmt.Printf("Python: %s\n", serve.PythonVersion)
	}
	gpuType := strings.TrimSpace(serve.GPUType)
	gpuCount := serve.GPUCount
	if gpuType != "" || gpuCount > 0 {
		if gpuCount > 0 {
			fmt.Printf("GPU: %s x%d\n", defaultString(gpuType, "unknown"), gpuCount)
		} else {
			fmt.Printf("GPU: %s\n", defaultString(gpuType, "unknown"))
		}
	}
	if serve.VolumeGB > 0 {
		fmt.Printf("Volume: %dGB\n", serve.VolumeGB)
	}
	if serve.Port > 0 {
		fmt.Printf("Port: %d\n", serve.Port)
	}
	if strings.TrimSpace(serve.HealthPath) != "" {
		fmt.Printf("Health path: %s\n", serve.HealthPath)
	}
	if inferenceURL := serveInferenceURL(serve.InferencePath); inferenceURL != "" {
		fmt.Printf("Inference URL: %s\n", inferenceURL)
	}
	if len(serve.Command) > 0 {
		fmt.Printf("Command: %s\n", strings.Join(serve.Command, " "))
	}
	if strings.TrimSpace(serve.DefaultModelPath) != "" {
		fmt.Printf("Default model path: %s\n", serve.DefaultModelPath)
	}
	if strings.TrimSpace(serve.OutputDir) != "" {
		fmt.Printf("Output dir: %s\n", serve.OutputDir)
	}
	if strings.TrimSpace(serve.Logs) != "" {
		fmt.Printf("Logs path: %s\n", serve.Logs)
	}
	if strings.TrimSpace(serve.CodeManifestHash) != "" {
		fmt.Printf("Code manifest: %s\n", serve.CodeManifestHash)
	}
	if strings.TrimSpace(serve.DataManifestHash) != "" {
		fmt.Printf("Data manifest: %s\n", serve.DataManifestHash)
	}
	fmt.Printf("Model source: %s\n", serveSourceDetail(serve.ModelSnapshot))
	if strings.TrimSpace(serve.ModelSnapshot.SourceModelPath) != "" {
		fmt.Printf("Model path: %s\n", serve.ModelSnapshot.SourceModelPath)
	}
	if strings.TrimSpace(serve.ModelSnapshot.ObjectPrefix) != "" {
		fmt.Printf("Model object prefix: %s\n", serve.ModelSnapshot.ObjectPrefix)
	}
	if strings.TrimSpace(serve.ModelSnapshot.ManifestKey) != "" {
		fmt.Printf("Model manifest key: %s\n", serve.ModelSnapshot.ManifestKey)
	}
	if strings.TrimSpace(serve.ModelSnapshot.ManifestHash) != "" {
		fmt.Printf("Model manifest hash: %s\n", serve.ModelSnapshot.ManifestHash)
	}
	if serve.ModelSnapshot.ObjectCount > 0 || serve.ModelSnapshot.TotalBytes > 0 {
		fmt.Printf("Model snapshot: %d objects, %d bytes\n", serve.ModelSnapshot.ObjectCount, serve.ModelSnapshot.TotalBytes)
	}
	if strings.TrimSpace(serve.Error) != "" {
		fmt.Printf("Error: %s\n", serve.Error)
	}
	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}

func printServeLogsSummary(resp serveLogsResponse, maxLines int) {
	if strings.TrimSpace(resp.ServeID) != "" {
		fmt.Printf("Serve: %s\n", resp.ServeID)
	}
	if strings.TrimSpace(resp.Status) != "" {
		fmt.Printf("Status: %s\n", resp.Status)
	}
	if strings.TrimSpace(resp.LogsPath) != "" {
		fmt.Printf("Logs path: %s\n", resp.LogsPath)
	}
	if strings.TrimSpace(resp.LogFile) != "" {
		fmt.Printf("Log file: %s\n", resp.LogFile)
	}
	if strings.TrimSpace(resp.Note) != "" {
		fmt.Printf("Note: %s\n", resp.Note)
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

	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}
