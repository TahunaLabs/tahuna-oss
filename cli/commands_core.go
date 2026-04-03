package main

import (
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func handleInit(args []string) {
	printHeader()
	target := "."
	if len(args) > 1 {
		must(errors.New("usage: tahuna init [.]|[project-name]"))
	}
	if len(args) == 1 && strings.TrimSpace(args[0]) != "" {
		target = strings.TrimSpace(args[0])
	}
	must(initProject(target))
}

func initProject(target string) error {
	// Fetch GPU catalog upfront — the /gpus endpoint requires auth, so this
	// doubles as the early auth check before any interactive prompts.
	gpus, versionsByFramework, pythonsByFrameworkVersion, err := fetchGpusAndImages()
	if err != nil {
		return err
	}

	projectPath, created, err := prepareProjectPath(target)
	if err != nil {
		return err
	}
	if err := os.Chdir(projectPath); err != nil {
		return err
	}
	if created {
		fmt.Printf("%sCreated project directory:%s %s\n", cAmpWord, cReset, projectPath)
	}
	if linkedEnvironmentID, err := loadLinkedEnvironmentID(); err != nil {
		return err
	} else if linkedEnvironmentID != "" {
		if !supportsInteractivePrompts() {
			return fmt.Errorf("project already initialized (linked environment: %s); remove %s to reinitialize", linkedEnvironmentID, projectEnvironmentFilePath())
		}
		fmt.Printf("%sWarning:%s project already initialized (linked environment: %s)\n", cAmpGold, cReset, linkedEnvironmentID)
		overwrite := promptChoice("Overwrite existing project?", []string{"No", "Yes"}, 0)
		if overwrite != "Yes" {
			return fmt.Errorf("init cancelled")
		}
		if err := os.RemoveAll(projectStateDir); err != nil {
			return fmt.Errorf("failed to remove existing project state: %w", err)
		}
	}

	projectCfg, frameworkKey, err := collectProjectInitConfig()
	if err != nil {
		return err
	}

	envName := filepath.Base(projectPath)
	if envName == "." || envName == string(filepath.Separator) || strings.TrimSpace(envName) == "" {
		envName = "tahuna-project"
	}

	if err := ensureProjectFile("pyproject.toml", defaultPyProjectTemplate(frameworkKey)); err != nil {
		return fmt.Errorf("failed to create pyproject.toml: %w", err)
	}
	if err := ensureUVLockFile(); err != nil {
		return fmt.Errorf("failed to create uv.lock: %w", err)
	}
	if _, err := ensureConfiguredDependencyGroup(
		&projectCfg,
		"train",
		trainDependencyPromptLabel,
		projectCfg.TrainDependencyGroup,
		trainDependencyGroupConfigured(projectCfg),
		"train",
	); err != nil {
		return fmt.Errorf("failed to resolve training dependency selection: %w", err)
	}
	if _, err := ensureConfiguredDependencyGroup(
		&projectCfg,
		"serve",
		serveDependencyPromptLabel,
		projectCfg.ServeDependencyGroup,
		serveDependencyGroupConfigured(projectCfg),
		"serve",
	); err != nil {
		return fmt.Errorf("failed to resolve serving dependency selection: %w", err)
	}
	if err := ensureProjectFile("train.py", defaultTrainEntrypointTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create train entrypoint: %w", err)
	}
	if err := ensureProjectFile("inference.py", defaultInferenceEntrypointTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create inference entrypoint: %w", err)
	}
	if err := os.MkdirAll(projectCfg.DataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}
	if err := os.MkdirAll(projectCfg.OutputDir, 0o755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	initCmd, err := resolveTrainCommand(projectCfg)
	if err != nil {
		return fmt.Errorf("failed to resolve train command: %w", err)
	}
	setup, err := guidedSetup(envName, frameworkKey, projectCfg.PythonVersion, gpus, versionsByFramework, pythonsByFrameworkVersion, initCmd, projectCfg.OutputDir)
	if err != nil {
		return err
	}
	projectCfg.PythonVersion = setup.pythonVersion
	projectCfg.FrameworkVersion = setup.frameworkVersion
	projectCfg.GPUType = setup.gpuType
	projectCfg.GPUCount = setup.gpuCount
	projectCfg.VolumeGB = setup.volumeGB
	projectCfg.ServeGPUType = setup.gpuType
	projectCfg.ServeGPUCount = setup.gpuCount
	projectCfg.ServeVolumeGB = setup.volumeGB
	if err := saveProjectConfig(projectCfg); err != nil {
		return fmt.Errorf("failed to save project config: %w", err)
	}

	if saveErr := saveLinkedEnvironmentID(setup.environmentID); saveErr != nil {
		_, cleanupErr := doJSON(http.MethodDelete, "/environments/"+setup.environmentID, nil)
		if cleanupErr != nil {
			return fmt.Errorf("failed to save environment link: %w (also failed to roll back environment %s: %v)", saveErr, setup.environmentID, cleanupErr)
		}
		return fmt.Errorf("failed to save environment link: %w (rolled back environment %s)", saveErr, setup.environmentID)
	}
	if err := runSyncWithStatus(setup.environmentID, syncScope{}); err != nil {
		return fmt.Errorf("failed to sync local project config: %w", err)
	}
	return nil
}

func prepareProjectPath(target string) (string, bool, error) {
	if target == "." {
		cwd, err := os.Getwd()
		return cwd, false, err
	}

	base, err := os.Getwd()
	if err != nil {
		return "", false, err
	}
	projectPath := target
	if !filepath.IsAbs(projectPath) {
		projectPath = filepath.Join(base, projectPath)
	}
	projectPath = filepath.Clean(projectPath)

	info, statErr := os.Stat(projectPath)
	if statErr == nil {
		if !info.IsDir() {
			return "", false, fmt.Errorf("path exists and is not a directory: %s", projectPath)
		}
		return projectPath, false, nil
	}
	if !errors.Is(statErr, os.ErrNotExist) {
		return "", false, statErr
	}
	if err := os.MkdirAll(projectPath, 0o755); err != nil {
		return "", false, err
	}
	return projectPath, true, nil
}

type guidedSetupResult struct {
	environmentID    string
	frameworkVersion string
	pythonVersion    string
	gpuType          string
	gpuCount         int
	volumeGB         int
}

func guidedSetup(environmentName, frameworkHint, pythonVersionHint string, gpus []string, versionsByFramework map[string][]string, pythonsByFrameworkVersion map[string]map[string][]string, command []string, outputDir string) (guidedSetupResult, error) {
	frameworks := sortedKeys(versionsByFramework)
	framework := strings.TrimSpace(frameworkHint)
	if framework == "" || versionsByFramework[framework] == nil {
		framework = promptChoice("Framework", frameworks, 0)
	}
	versions := versionsByFramework[framework]
	version := promptChoice("Framework version", versions, 0)

	pythons := pythonsByFrameworkVersion[framework][version]
	hint := strings.TrimSpace(pythonVersionHint)
	defaultPythonIdx := 0
	for i, py := range pythons {
		if py == hint {
			defaultPythonIdx = i
			break
		}
	}
	pythonVersion := promptChoice("Python version", pythons, defaultPythonIdx)

	gpuType := promptChoice("GPU type", gpus, 0)
	gpuCount := promptInt("GPU count", 1)
	volumeGB := promptInt("Volume (GB)", 80)
	if err := validateGPUSelection(gpuType, gpuCount); err != nil {
		return guidedSetupResult{}, err
	}

	resolvedOutputDir := strings.TrimSpace(outputDir)
	if resolvedOutputDir == "" {
		resolvedOutputDir = "outputs"
	}
	envPayload := map[string]any{
		"name":           environmentName,
		"gpu_type":       gpuType,
		"gpu_count":      gpuCount,
		"volume_gb":      volumeGB,
		"python_version": pythonVersion,
		"framework":      framework,
		"version":        version,
		"command":        command,
		"output_dir":     resolvedOutputDir,
	}
	env, err := doJSONAs[createEnvironmentResponse](http.MethodPost, "/environments", envPayload)
	if err != nil {
		return guidedSetupResult{}, err
	}

	envID := env.EnvironmentID
	fmt.Printf("\n%sEnvironment created%s\n", cAmpWord, cReset)
	fmt.Printf("%sNote:%s default entrypoint command: %s%s%s\n", cAmpGold, cReset, cAmpMuted, strings.Join(command, " "), cReset)
	fmt.Printf("      To change it: %stahuna env update --entrypoint-command \"<cmd>\"%s\n", cAmpMuted, cReset)
	return guidedSetupResult{
		environmentID:    envID,
		frameworkVersion: version,
		pythonVersion:    pythonVersion,
		gpuType:          gpuType,
		gpuCount:         gpuCount,
		volumeGB:         volumeGB,
	}, nil
}

func handleEnvironment(args []string) {
	if len(args) == 0 {
		fmt.Println("missing environment subcommand")
		environmentUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		environmentUsage()
		return
	}
	switch args[0] {
	case "list":
		environmentList(args[1:])
	case "show":
		environmentShow(args[1:])
	case "update":
		environmentUpdate(args[1:])
	case "rm":
		environmentDelete(args[1:])
	case "data":
		environmentData(args[1:])
	case "create":
		must(errors.New("`tahuna env create` is removed; use `tahuna init .` or `tahuna init <project-name>`"))
	default:
		fmt.Printf("unknown environment subcommand: %s\n", args[0])
		environmentUsage()
		os.Exit(1)
	}
}

func handleGPUs(args []string) {
	if len(args) == 0 {
		fmt.Println("missing gpus subcommand")
		gpusUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		gpusUsage()
		return
	}
	switch args[0] {
	case "list":
		gpusList(args[1:])
	default:
		fmt.Printf("unknown gpus subcommand: %s\n", args[0])
		gpusUsage()
		os.Exit(1)
	}
}

func handleData(args []string) {
	if len(args) == 0 {
		fmt.Println("missing data subcommand")
		dataUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		dataUsage()
		return
	}
	switch args[0] {
	case "list":
		dataList(args[1:])
	case "show":
		dataShow(args[1:])
	default:
		fmt.Printf("unknown data subcommand: %s\n", args[0])
		dataUsage()
		os.Exit(1)
	}
}

func handleRun(args []string) {
	if len(args) == 0 {
		fmt.Println("missing run subcommand")
		runUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		runUsage()
		return
	}

	switch args[0] {
	case "create":
		runCreate(args[1:])
	case "rename":
		runRename(args[1:])
	case "list":
		runList(args[1:])
	case "show":
		runShow(args[1:])
	case "watch", "monitor":
		runWatch(args[1:])
	case "logs":
		runLogs(args[1:])
	case "cancel":
		runCancel(args[1:])
	case "rm":
		runDelete(args[1:])
	default:
		fmt.Printf("unknown run subcommand: %s\n", args[0])
		runUsage()
		os.Exit(1)
	}
}

func runUsage() {
	fmt.Print(`Run commands:
  tahuna run help
  tahuna run list [-l <N>] [--all|-a] [--verbose|-v]
  tahuna run show <run_id|run_name> [--verbose|-v]
  tahuna run create [--name <name>] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>] [--detached|-d]
  tahuna run rename <run_id|run_name> --name <new_name>
	tahuna run watch <run_id|run_name> [--interval 5]
	tahuna run logs <run_id|run_name> [--verbose|-v] [--follow|-f]
	tahuna run cancel <run_id|run_name> [-f]
	tahuna run rm <run_id|run_name|pattern>... [--all|-a] [--cancel|-c] [--force|-f]

Wildcard matching:
  - "run rm" supports shell-style glob patterns for run_id and run_name (*, ?, []).
  - Always quote patterns to prevent shell expansion (for example: tahuna run rm 'warm-*').
  - To remove all runs, prefer: tahuna run rm --all
`)
}

func environmentUsage() {
	fmt.Print(`Environment commands:
  tahuna env help
  tahuna env list [--verbose|-v]
  tahuna env show <env_id> | --id <env_id> [--verbose|-v]
  tahuna env update [<env_id>] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>] [--entrypoint-command <cmd>] [--serve-entrypoint-command <cmd>] [--serve-gpu-type <gpu>] [--serve-gpu-count <n>] [--serve-volume-gb <n>]
  tahuna env rm <env_id> | --id <env_id> | --all|-a
  tahuna env data bind|unbind ...
`)
}

func gpusUsage() {
	fmt.Print(`GPU commands:
  tahuna gpus help
  tahuna gpus list [--verbose|-v]
`)
}

func dataUsage() {
	fmt.Print(`Data commands:
  tahuna data help
  tahuna data list [--verbose|-v]
  tahuna data show <data_id> | --id <data_id> [--verbose|-v]
`)
}

func gpusList(args []string) {
	fs := flag.NewFlagSet("gpus list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full GPUs payload")
	fs.BoolVar(verbose, "v", false, "Show full GPUs payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/gpus", nil)
		must(err)
		printJSON(resp)
		return
	}
	typedResp, err := doJSONAs[gpusResponse](http.MethodGet, "/gpus", nil)
	must(err)
	gpus := parseGpusRows(typedResp.GPUs)
	if len(gpus) == 0 {
		fmt.Println("No GPUs available.")
		return
	}
	fmt.Printf("%-32s %-7s %s\n", "GPU TYPE", "MAX", "MEMORY")
	for _, gpu := range gpus {
		maxLabel := "-"
		if gpu.MaxGPUCount > 0 {
			maxLabel = strconv.Itoa(gpu.MaxGPUCount)
		}
		memoryLabel := "-"
		if gpu.MemoryGB > 0 {
			memoryLabel = fmt.Sprintf("%dGB", gpu.MemoryGB)
		}
		fmt.Printf(
			"%-32s %-7s %s\n",
			truncateRunListColumn(gpu.DisplayName, 32),
			maxLabel,
			memoryLabel,
		)
	}
}

func dataList(args []string) {
	fs := flag.NewFlagSet("data list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full data payload")
	fs.BoolVar(verbose, "v", false, "Show full data payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/data", nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[dataListResponse](http.MethodGet, "/data", nil)
	must(err)
	if len(resp.Blobs) == 0 {
		fmt.Println("No data items found.")
		return
	}
	fmt.Printf("%-18s %-30s %-12s %s\n", "DATA ID", "FILENAME", "SIZE", "CREATED")
	for _, blob := range resp.Blobs {
		blobID := strings.TrimSpace(blob.BlobID)
		filename := strings.TrimSpace(blob.Filename)
		fmt.Printf(
			"%-18s %-30s %-12s %s\n",
			truncateRunListColumn(defaultString(blobID, "-"), 18),
			truncateRunListColumn(defaultString(filename, "-"), 30),
			humanSize(blob.Size),
			formatUnixMillis(blob.CreatedAt),
		)
	}
}

func dataShow(args []string) {
	fs := flag.NewFlagSet("data show", flag.ExitOnError)
	id := fs.String("id", "", "Data item ID")
	verbose := fs.Bool("verbose", false, "Show full data payload")
	fs.BoolVar(verbose, "v", false, "Show full data payload")
	mustParseFlags(fs, args)

	dataID := resolveRunID(*id, fs.Args())
	require(dataID != "", "data_id is required (usage: tahuna data show <data_id>)")
	if *verbose {
		resp, err := doJSON(http.MethodGet, "/data/"+dataID, nil)
		must(err)
		printJSON(resp)
		return
	}
	resp, err := doJSONAs[dataItemResponse](http.MethodGet, "/data/"+dataID, nil)
	must(err)
	fmt.Printf("Data ID: %s\n", defaultString(strings.TrimSpace(resp.BlobID), dataID))
	fmt.Printf("Filename: %s\n", defaultString(strings.TrimSpace(resp.Filename), "-"))
	fmt.Printf("Key: %s\n", defaultString(strings.TrimSpace(resp.Key), "-"))
	fmt.Printf("Size: %s\n", humanSize(resp.Size))
	contentType := strings.TrimSpace(resp.ContentType)
	if contentType != "" {
		fmt.Printf("Content-Type: %s\n", contentType)
	}
	downloadURL := strings.TrimSpace(resp.DownloadURL)
	if downloadURL != "" {
		fmt.Printf("Download URL: %s\n", downloadURL)
	}
	if resp.CreatedAt > 0 {
		fmt.Printf("Created: %s\n", formatUnixMillis(resp.CreatedAt))
	}
	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}

func environmentData(args []string) {
	if len(args) == 0 {
		must(errors.New("usage: tahuna env data bind|unbind <env-id> <data-id...>"))
	}
	switch args[0] {
	case "bind":
		environmentDataBind(args[1:])
	case "unbind":
		environmentDataUnbind(args[1:])
	default:
		must(fmt.Errorf("unknown env data subcommand: %s", args[0]))
	}
}

func parseEnvironmentDataArgs(args []string) (string, []string, error) {
	if len(args) == 0 {
		return "", nil, errors.New("expected <env-id> <data-id...> or <data-id...>")
	}
	if len(args) >= 2 && !strings.HasPrefix(strings.TrimSpace(args[0]), "blob_") {
		return strings.TrimSpace(args[0]), normalizeDataIDs(args[1:]), nil
	}
	envID, err := resolveEnvironmentID()
	if err != nil {
		return "", nil, err
	}
	return envID, normalizeDataIDs(args), nil
}

func normalizeDataIDs(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, raw := range values {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func environmentDataBind(args []string) {
	envID, dataIDs, err := parseEnvironmentDataArgs(args)
	must(err)
	require(envID != "", "environment id is required")
	require(len(dataIDs) > 0, "at least one data id is required")
	resp, err := doJSON(http.MethodPost, "/environments/"+envID+"/data-bindings", map[string]any{
		"data_ids": dataIDs,
	})
	must(err)
	printJSON(resp)
}

func environmentDataUnbind(args []string) {
	envID, dataIDs, err := parseEnvironmentDataArgs(args)
	must(err)
	require(envID != "", "environment id is required")
	require(len(dataIDs) > 0, "at least one data id is required")
	resp, err := doJSON(http.MethodDelete, "/environments/"+envID+"/data-bindings", map[string]any{
		"data_ids": dataIDs,
	})
	must(err)
	printJSON(resp)
}

func resolveRunID(idFlag string, positional []string) string {
	id := strings.TrimSpace(idFlag)
	if id != "" {
		return id
	}
	if len(positional) > 0 {
		return strings.TrimSpace(positional[0])
	}
	return ""
}

type syncScope struct {
	code bool
	data bool
}

type syncManifestEntry struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
	Mode   uint32 `json:"mode"`
}

type syncManifest struct {
	Version   int                 `json:"version"`
	Type      string              `json:"type"`
	CreatedAt int64               `json:"created_at"`
	Entries   []syncManifestEntry `json:"entries"`
}

type preparedManifest struct {
	kind      string
	manifest  syncManifest
	hash      string
	raw       []byte
	cachePath string
	filesByID map[string]string
	cleanup   func()
}

type syncOptions struct {
	logProgress   bool
	dynamicStatus bool
}

var (
	syncDoJSON                      = doJSON
	syncUploadFileToSignedURLRetry  = uploadFileToSignedURLWithRetry
	syncUploadBytesToSignedURLRetry = uploadBytesToSignedURLWithRetry
	runLogsFollowSleep              = time.Sleep
)

func handleSync(args []string) {
	if len(args) > 1 {
		must(errors.New("usage: tahuna sync [code|data]"))
	}
	scope := syncScope{code: true, data: true}
	if len(args) == 1 {
		switch strings.ToLower(strings.TrimSpace(args[0])) {
		case "code":
			scope = syncScope{code: true}
		case "data":
			scope = syncScope{data: true}
		default:
			must(errors.New("usage: tahuna sync [code|data]"))
		}
	}

	environmentID, err := resolveEnvironmentID()
	must(err)
	must(runSyncWithStatus(environmentID, scope))
}

func environmentShow(args []string) {
	fs := flag.NewFlagSet("environment show", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	verbose := fs.Bool("verbose", false, "Show full environment payload")
	fs.BoolVar(verbose, "v", false, "Show full environment payload")
	mustParseFlags(fs, args)

	environmentID := strings.TrimSpace(*id)
	if environmentID == "" && len(fs.Args()) > 0 {
		environmentID = strings.TrimSpace(fs.Args()[0])
	}
	require(environmentID != "", "environment_id is required (usage: tahuna env show <env_id> | --id <env_id>)")

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
		must(err)
		printJSON(resp)
		return
	}
	resp, err := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil)
	must(err)
	printEnvironmentSummary(resp)
}

func environmentList(args []string) {
	fs := flag.NewFlagSet("environment list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full environments payload")
	fs.BoolVar(verbose, "v", false, "Show full environments payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/environments", nil)
		must(err)
		printJSON(resp)
		return
	}
	resp, err := doJSONAs[environmentsResponse](http.MethodGet, "/environments", nil)
	must(err)
	printEnvironmentListSummary(resp.Environments)
}

func printEnvironmentListSummary(environments []environmentResponse) {
	if len(environments) == 0 {
		fmt.Println("No environments found.")
		return
	}

	fmt.Printf("%-22s %-32s %-22s %-10s %-18s\n", "NAME", "ENV ID", "GPU", "VOLUME", "FRAMEWORK")
	for _, env := range environments {
		name := strings.TrimSpace(env.Name)
		if name == "" {
			name = "unknown"
		}
		envID := strings.TrimSpace(env.EnvironmentID)
		if envID == "" {
			envID = "-"
		}
		gpuType := strings.TrimSpace(env.GPUType)
		gpuLabel := gpuType
		if gpuLabel == "" {
			gpuLabel = "unknown"
		}
		if env.GPUCount > 0 {
			gpuLabel = fmt.Sprintf("%s x%d", gpuLabel, env.GPUCount)
		}

		volumeLabel := "-"
		if env.VolumeGB > 0 {
			volumeLabel = fmt.Sprintf("%dGB", env.VolumeGB)
		}

		framework := strings.TrimSpace(env.Framework)
		version := strings.TrimSpace(env.Version)
		frameworkLabel := framework
		if frameworkLabel == "" {
			frameworkLabel = "unknown"
		}
		if version != "" {
			frameworkLabel += " " + version
		}

		fmt.Printf(
			"%-22s %-32s %-22s %-10s %-18s\n",
			truncateRunListColumn(name, 22),
			truncateRunListColumn(envID, 32),
			truncateRunListColumn(gpuLabel, 22),
			truncateRunListColumn(volumeLabel, 10),
			truncateRunListColumn(frameworkLabel, 18),
		)
	}
}

func printEnvironmentSummary(env environmentResponse) {
	name := strings.TrimSpace(env.Name)
	envID := strings.TrimSpace(env.EnvironmentID)
	gpuType := strings.TrimSpace(env.GPUType)

	if name != "" {
		fmt.Printf("Name: %s\n", name)
	}
	if envID != "" {
		fmt.Printf("Environment ID: %s\n", envID)
	}
	if gpuType != "" || env.GPUCount > 0 {
		if env.GPUCount > 0 {
			fmt.Printf("GPU: %s x%d\n", defaultString(gpuType, "unknown"), env.GPUCount)
		} else {
			fmt.Printf("GPU: %s\n", defaultString(gpuType, "unknown"))
		}
	}
	if env.VolumeGB > 0 {
		fmt.Printf("Volume: %dGB\n", env.VolumeGB)
	}
	framework := strings.TrimSpace(env.Framework)
	version := strings.TrimSpace(env.Version)
	if framework != "" || version != "" {
		stack := defaultString(framework, "unknown")
		if version != "" {
			stack += " " + version
		}
		fmt.Printf("Framework: %s\n", stack)
	}
	artifacts := strings.TrimSpace(env.Artifacts)
	if artifacts != "" {
		fmt.Printf("Artifacts: %s\n", artifacts)
	}
	if len(env.BoundDataIDs) > 0 {
		fmt.Printf("Bound data IDs: %d\n", len(env.BoundDataIDs))
	}
	fmt.Println()
	fmt.Println("Use --verbose (-v) for full JSON payload.")
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func environmentDelete(args []string) {
	fs := flag.NewFlagSet("environment rm", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	all := fs.Bool("all", false, "Delete all environments")
	fs.BoolVar(all, "a", false, "Delete all environments")
	mustParseFlags(fs, args)

	environmentID := strings.TrimSpace(*id)
	if environmentID == "" && len(fs.Args()) > 0 {
		environmentID = strings.TrimSpace(fs.Args()[0])
	}
	require(!(*all && environmentID != ""), "cannot combine --all with --id or positional environment id")

	environmentIDs := make([]string, 0, 1)
	if *all {
		resp, err := doJSONAs[environmentsResponse](http.MethodGet, "/environments", nil)
		must(err)
		for _, env := range resp.Environments {
			envID := strings.TrimSpace(env.EnvironmentID)
			if envID != "" {
				environmentIDs = append(environmentIDs, envID)
			}
		}
	} else {
		require(environmentID != "", "environment_id is required (usage: tahuna env rm <environment_id> | --id <environment_id> | --all)")
		environmentIDs = append(environmentIDs, environmentID)
	}

	if len(environmentIDs) == 0 {
		fmt.Println("No environments found.")
		return
	}

	for _, envID := range environmentIDs {
		resp, err := doJSON(http.MethodDelete, "/environments/"+envID, nil)
		must(err)
		if deleted, ok := resp["deleted"]; ok && deleted == true {
			if cleanupErr := clearLinkedEnvironmentIDIfMatches(envID); cleanupErr != nil {
				logWarn("failed to clean local environment link: %v", cleanupErr)
			}
		}
		printJSON(resp)
	}
}

func environmentUpdate(args []string) {
	fs := flag.NewFlagSet("environment update", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID (defaults to linked project environment)")
	gpuType := fs.String("gpu-type", "", "GPU type")
	gpuCount := fs.Int("gpu-count", 0, "GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Volume in GB")
	entrypointCmd := fs.String("entrypoint-command", "", "Custom train command (saved locally and synced on the next run/sync)")
	serveEntrypointCmd := fs.String("serve-entrypoint-command", "", "Custom serve command (saved locally for future serve execution)")
	serveGPUType := fs.String("serve-gpu-type", "", "Serve GPU type (saved locally for future serve execution)")
	serveGPUCount := fs.Int("serve-gpu-count", 0, "Serve GPU count (saved locally for future serve execution)")
	serveVolumeGB := fs.Int("serve-volume-gb", 0, "Serve volume in GB (saved locally for future serve execution)")
	mustParseFlags(fs, args)

	if *gpuCount < 0 || *volumeGB < 0 || *serveGPUCount < 0 || *serveVolumeGB < 0 {
		must(errors.New("--gpu-count, --volume-gb, --serve-gpu-count, and --serve-volume-gb must be positive"))
	}

	cfg, err := loadPersistedProjectConfig()
	must(err)

	trainCommandUpdate := strings.TrimSpace(*entrypointCmd) != ""
	serveCommandUpdate := strings.TrimSpace(*serveEntrypointCmd) != ""
	serveComputeUpdate := strings.TrimSpace(*serveGPUType) != "" || *serveGPUCount > 0 || *serveVolumeGB > 0
	environmentComputeUpdate := strings.TrimSpace(*gpuType) != "" || *gpuCount > 0 || *volumeGB > 0

	environmentID := strings.TrimSpace(*id)
	if environmentID == "" && len(fs.Args()) > 0 {
		environmentID = strings.TrimSpace(fs.Args()[0])
	}

	interactive := !trainCommandUpdate && !serveCommandUpdate && !serveComputeUpdate && !environmentComputeUpdate
	if interactive {
		effectiveCfg := applyProjectConfigDefaults(cfg)
		currentGPU := strings.TrimSpace(effectiveCfg.GPUType)
		currentGPUCount := effectiveCfg.GPUCount
		if currentGPUCount < 1 {
			currentGPUCount = 1
		}
		currentVolume := effectiveCfg.VolumeGB
		if currentVolume < 1 {
			currentVolume = 1
		}

		gpus, _, _, err := fetchGpusAndImages()
		must(err)
		defaultGPUIndex := 0
		if currentGPU != "" {
			for i, item := range gpus {
				if strings.EqualFold(strings.TrimSpace(item), currentGPU) {
					defaultGPUIndex = i
					break
				}
			}
		}

		cfg.GPUType = promptChoice("GPU type", gpus, defaultGPUIndex)
		cfg.GPUCount = promptInt("GPU count", currentGPUCount)
		cfg.VolumeGB = promptInt("Volume (GB)", currentVolume)
		environmentComputeUpdate = true
	}

	if trainCommandUpdate {
		parsedCommand, err := parseShellCommand(normalizeCommandString(strings.TrimSpace(*entrypointCmd)))
		must(err)
		cfg.TrainCommand = parsedCommand
	}
	if serveCommandUpdate {
		parsedCommand, err := parseShellCommand(normalizeCommandString(strings.TrimSpace(*serveEntrypointCmd)))
		must(err)
		cfg.ServeCommand = parsedCommand
	}
	if value := strings.TrimSpace(*gpuType); value != "" {
		cfg.GPUType = value
	}
	if *gpuCount > 0 {
		cfg.GPUCount = *gpuCount
	}
	if *volumeGB > 0 {
		cfg.VolumeGB = *volumeGB
	}
	if value := strings.TrimSpace(*serveGPUType); value != "" {
		cfg.ServeGPUType = value
	}
	if *serveGPUCount > 0 {
		cfg.ServeGPUCount = *serveGPUCount
	}
	if *serveVolumeGB > 0 {
		cfg.ServeVolumeGB = *serveVolumeGB
	}

	configChanged := trainCommandUpdate || serveCommandUpdate || serveComputeUpdate || environmentComputeUpdate
	if !configChanged {
		return
	}

	if cfg.GPUCount > 0 {
		must(validateGPUSelection(strings.TrimSpace(cfg.GPUType), cfg.GPUCount))
	}
	if serveCommandUpdate || serveComputeUpdate {
		must(validateServeComputeConfig(projectConfigFilePath(), cfg))
	}
	must(saveProjectConfig(cfg))

	if trainCommandUpdate {
		fmt.Printf("%s✓%s train.command updated in %s\n", cAmpGreen, cReset, projectConfigFilePath())
	}
	if serveCommandUpdate {
		fmt.Printf("%s✓%s serve.command updated in %s\n", cAmpGreen, cReset, projectConfigFilePath())
	}
	if serveComputeUpdate {
		fmt.Printf("%s✓%s serve compute updated in %s\n", cAmpGreen, cReset, projectConfigFilePath())
	}
	if environmentComputeUpdate {
		fmt.Printf("%s✓%s environment compute updated in %s\n", cAmpGreen, cReset, projectConfigFilePath())
	}

	if environmentID == "" {
		linkedID, err := loadLinkedEnvironmentID()
		must(err)
		environmentID = strings.TrimSpace(linkedID)
	}
	if environmentID == "" {
		return
	}
	must(runSyncWithStatus(environmentID, syncScope{}))
}

func runCreate(args []string) {
	fs := flag.NewFlagSet("run create", flag.ExitOnError)
	name := fs.String("name", "", "Run name")
	fs.StringVar(name, "n", "", "Run name")
	gpuType := fs.String("gpu-type", "", "Override GPU type")
	gpuCount := fs.Int("gpu-count", 0, "Override GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Override volume size")
	detached := fs.Bool("detached", false, "Create run and exit immediately")
	fs.BoolVar(detached, "d", false, "Create run and exit immediately")
	watch := fs.Bool("watch", false, "Watch run status after creation")
	monitor := fs.Bool("monitor", false, "Alias for --watch")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	mustParseFlags(fs, args)
	require(!(*detached && (*watch || *monitor)), "--detached cannot be used with --watch/--monitor")
	environmentID, err := resolveEnvironmentID()
	must(err)
	must(preRunSync(environmentID))

	payload := map[string]any{}
	if strings.TrimSpace(*name) != "" {
		payload["name"] = strings.TrimSpace(*name)
	}
	if *gpuType != "" {
		payload["gpu_type"] = *gpuType
	}
	if *gpuCount > 0 {
		payload["gpu_count"] = *gpuCount
	}
	if *volumeGB > 0 {
		payload["volume_gb"] = *volumeGB
	}
	if *gpuCount > 0 {
		effectiveGPUType, err := resolveEffectiveGPUTypeForEnvironment(environmentID, *gpuType)
		must(err)
		must(validateGPUSelection(effectiveGPUType, *gpuCount))
	}

	resp, err := createRunWithCapacityPrompt("/environments/"+environmentID+"/runs", payload)
	must(err)
	runID := resp.RunID
	runName := strings.TrimSpace(resp.Name)
	if runName == "" {
		runName = "unnamed"
	}
	fmt.Printf("%s✓%s run created: %s (%s) - %s\n", cAmpGreen, cReset, runName, runID, runDashboardURL(runID))
	if *verbose {
		printJSON(resp)
	}
	if *detached {
		return
	}
	if *watch || *monitor {
		must(monitorRunWithLogs(runID, 5))
		return
	}
	must(monitorRunWithLogs(runID, 5))
}

func resolveRunIDByIDOrName(idOrName string) (string, error) {
	target := strings.TrimSpace(idOrName)
	if target == "" {
		return "", errors.New("run id or name is required")
	}

	resp, err := doJSONAs[runsResponse](http.MethodGet, "/runs", nil)
	if err != nil {
		return "", err
	}

	for _, run := range resp.Runs {
		runID := strings.TrimSpace(run.RunID)
		if runID == target {
			return runID, nil
		}
	}

	matches := make([]string, 0, 2)
	for _, run := range resp.Runs {
		runName := strings.TrimSpace(run.Name)
		if runName != target {
			continue
		}
		runID := strings.TrimSpace(run.RunID)
		if runID != "" {
			matches = append(matches, runID)
		}
	}

	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("multiple runs found with name %q; use run_id instead", target)
	}
	return "", fmt.Errorf("run %q not found", target)
}

func runRename(args []string) {
	var target string
	var newName string
	for i := 0; i < len(args); i++ {
		part := strings.TrimSpace(args[i])
		switch {
		case strings.HasPrefix(part, "--name="):
			newName = strings.TrimSpace(strings.TrimPrefix(part, "--name="))
		case part == "--name":
			require(i+1 < len(args), "--name requires a value")
			i++
			newName = strings.TrimSpace(args[i])
		case strings.HasPrefix(part, "--id="):
			target = strings.TrimSpace(strings.TrimPrefix(part, "--id="))
		case part == "--id":
			require(i+1 < len(args), "--id requires a value")
			i++
			target = strings.TrimSpace(args[i])
		case strings.HasPrefix(part, "-"):
			must(fmt.Errorf("unknown flag: %s", part))
		default:
			if target == "" {
				target = part
				continue
			}
			must(fmt.Errorf("unexpected argument: %s", part))
		}
	}
	require(target != "", "run_id_or_name is required (usage: tahuna run rename <id|name> --name <new-name>)")
	require(newName != "", "--name is required")

	runID, err := resolveRunIDByIDOrName(target)
	must(err)

	resp, err := doJSONAs[runResponse](http.MethodPatch, "/runs/"+runID, map[string]any{
		"name": newName,
	})
	must(err)

	resolvedName := strings.TrimSpace(resp.Name)
	if resolvedName == "" {
		resolvedName = newName
	}
	fmt.Printf("%s✓%s run renamed: %s -> %s\n", cAmpGreen, cReset, runID, resolvedName)
}

func train(args []string) {
	fs := flag.NewFlagSet("train", flag.ExitOnError)
	gpuType := fs.String("gpu-type", "", "Override GPU type")
	gpuCount := fs.Int("gpu-count", 0, "Override GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Override volume size")
	detached := fs.Bool("detached", false, "Create run and exit immediately")
	fs.BoolVar(detached, "d", false, "Create run and exit immediately")
	mustParseFlags(fs, args)

	resolvedEnvironmentID, err := resolveEnvironmentID()
	must(err)
	must(preRunSync(resolvedEnvironmentID))

	payload := map[string]any{}
	if *gpuType != "" {
		payload["gpu_type"] = *gpuType
	}
	if *gpuCount > 0 {
		payload["gpu_count"] = *gpuCount
	}
	if *volumeGB > 0 {
		payload["volume_gb"] = *volumeGB
	}
	if *gpuCount > 0 {
		effectiveGPUType, err := resolveEffectiveGPUTypeForEnvironment(resolvedEnvironmentID, *gpuType)
		must(err)
		must(validateGPUSelection(effectiveGPUType, *gpuCount))
	}

	resp, err := createRunWithCapacityPrompt("/environments/"+resolvedEnvironmentID+"/runs", payload)
	must(err)

	runID := resp.RunID
	fmt.Printf("%s✓%s run created: %s - %s\n", cAmpGreen, cReset, runID, runDashboardURL(runID))
	if *detached {
		return
	}
	must(monitorRunWithLogs(runID, 5))
}

func createRunWithCapacityPrompt(path string, payload map[string]any) (createRunResponse, error) {
	return createWithCapacityPrompt(payload, capacityPromptOptions[createRunResponse]{
		create: func(nextPayload map[string]any) (createRunResponse, error) {
			return doJSONAs[createRunResponse](http.MethodPost, path, nextPayload)
		},
		resolveSelection: func(_ map[string]any) (computeSelection, error) {
			environmentID, err := environmentIDFromRunsPath(path)
			if err != nil {
				return computeSelection{}, err
			}
			selections, err := loadEnvironmentComputeSelections(environmentID)
			if err != nil {
				return computeSelection{}, err
			}
			return selections.Environment, nil
		},
		persistSelection: func(selectedGPU string, _ computeSelection) {
			persistFallbackEnvironmentGPU(path, selectedGPU)
		},
	})
}

func preRunSync(environmentID string) error {
	cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}
	if changed, err := ensureConfiguredDependencyGroup(
		&cfg,
		"train",
		trainDependencyPromptLabel,
		cfg.TrainDependencyGroup,
		trainDependencyGroupConfigured(cfg),
		"train",
	); err != nil {
		return err
	} else if changed {
		if err := saveProjectConfig(cfg); err != nil {
			return fmt.Errorf("failed to save project config: %w", err)
		}
	}
	return runSyncWithStatus(environmentID, syncScope{code: true, data: true})
}
