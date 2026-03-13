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
		return fmt.Errorf("project already initialized (linked environment: %s); use `tahuna train` or remove %s to reinitialize", linkedEnvironmentID, projectEnvironmentFilePath())
	}

	projectCfg, frameworkKey, err := collectProjectInitConfig()
	if err != nil {
		return err
	}

	envName := filepath.Base(projectPath)
	if envName == "." || envName == string(filepath.Separator) || strings.TrimSpace(envName) == "" {
		envName = "tahuna-project"
	}

	if err := ensureProjectFile(projectCfg.ConfigYAMLPath, defaultConfigYAMLTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create config yaml: %w", err)
	}
	if err := ensureProjectFile(projectCfg.PythonProjectFile, defaultPyProjectTemplate(frameworkKey)); err != nil {
		return fmt.Errorf("failed to create pyproject.toml: %w", err)
	}
	if err := ensureUVLockFile(projectCfg.PythonProjectFile, projectCfg.UVLockFile); err != nil {
		return fmt.Errorf("failed to create uv.lock: %w", err)
	}
	if err := ensureProjectFile(projectCfg.TrainEntrypoint, defaultTrainEntrypointTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create train entrypoint: %w", err)
	}
	if err := os.MkdirAll(projectCfg.DataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}
	if err := os.MkdirAll(projectCfg.OutputDir, 0o755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	if err := saveProjectConfig(projectCfg); err != nil {
		return fmt.Errorf("failed to save project config: %w", err)
	}

	envID, err := guidedSetup(envName, frameworkKey, projectCfg.PythonVersion)
	if err != nil {
		return err
	}
	if saveErr := saveLinkedEnvironmentID(envID); saveErr != nil {
		_, cleanupErr := doJSON(http.MethodDelete, "/environments/"+envID, nil)
		if cleanupErr != nil {
			return fmt.Errorf("failed to save environment link: %w (also failed to roll back environment %s: %v)", saveErr, envID, cleanupErr)
		}
		return fmt.Errorf("failed to save environment link: %w (rolled back environment %s)", saveErr, envID)
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

func guidedSetup(environmentName, frameworkHint, pythonVersion string) (string, error) {
	gpus, versionsByFramework, err := fetchCatalog()
	if err != nil {
		return "", err
	}

	frameworks := sortedKeys(versionsByFramework)
	framework := strings.TrimSpace(frameworkHint)
	if framework == "" || versionsByFramework[framework] == nil {
		framework = promptChoice("Framework", frameworks, 0)
	}
	versions := versionsByFramework[framework]
	version := promptChoice("Framework version", versions, 0)
	gpuType := promptChoice("GPU type", gpus, 0)
	gpuCount := promptInt("GPU count", 1)
	volumeGB := promptInt("Volume (GB)", 80)
	if err := validateGPUSelection(gpuType, gpuCount); err != nil {
		return "", err
	}

	envPayload := map[string]any{
		"name":           environmentName,
		"gpu_type":       gpuType,
		"gpu_count":      gpuCount,
		"volume_gb":      volumeGB,
		"python_version": strings.TrimSpace(pythonVersion),
		"framework":      framework,
		"version":        version,
	}
	env, err := doJSON(http.MethodPost, "/environments", envPayload)
	if err != nil {
		return "", err
	}

	envID := asString(env["environment_id"])
	fmt.Printf("\n%sEnvironment created%s\n", cAmpWord, cReset)
	return envID, nil
}

func handleEnvironment(args []string) {
	if len(args) == 0 {
		fmt.Println("missing environment subcommand")
		os.Exit(1)
	}
	switch args[0] {
	case "list":
		environmentList(args[1:])
	case "show":
		environmentShow(args[1:])
	case "update", "specs":
		environmentUpdate(args[1:])
	case "delete":
		environmentDelete(args[1:])
	case "data":
		environmentData(args[1:])
	case "create":
		must(errors.New("`tahuna env create` is removed; use `tahuna init .` or `tahuna init <project-name>`"))
	default:
		fmt.Printf("unknown environment subcommand: %s\n", args[0])
		os.Exit(1)
	}
}

func handleCatalog(args []string) {
	if len(args) == 0 {
		must(errors.New("usage: tahuna catalog gpus"))
	}
	switch args[0] {
	case "gpus":
		catalogGPUs(args[1:])
	default:
		must(fmt.Errorf("unknown catalog subcommand: %s", args[0]))
	}
}

func handleData(args []string) {
	if len(args) == 0 {
		must(errors.New("usage: tahuna data list|show ..."))
	}
	switch args[0] {
	case "list":
		dataList(args[1:])
	case "show":
		dataShow(args[1:])
	default:
		must(fmt.Errorf("unknown data subcommand: %s", args[0]))
	}
}

func handleRun(args []string) {
	if len(args) == 0 {
		fmt.Println("missing run subcommand")
		os.Exit(1)
	}
	switch args[0] {
	case "create":
		runCreate(args[1:])
	case "rename":
		runRename(args[1:])
	case "list":
		runShow(append(args[1:], "--list"))
	case "show":
		runShow(args[1:])
	case "watch", "monitor":
		runWatch(args[1:])
	case "logs":
		runLogs(args[1:])
	case "cancel":
		runCancel(args[1:])
	case "delete":
		runDelete(args[1:])
	default:
		fmt.Printf("unknown run subcommand: %s\n", args[0])
		os.Exit(1)
	}
}

func catalogGPUs(args []string) {
	fs := flag.NewFlagSet("catalog gpus", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full catalog payload")
	fs.BoolVar(verbose, "v", false, "Show full catalog payload")
	mustParseFlags(fs, args)

	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	gpus := parseCatalogGPUs(resp)
	if len(gpus) == 0 {
		fmt.Println("No GPUs available.")
		return
	}
	fmt.Printf("%-32s %-7s %-9s %s\n", "GPU TYPE", "MAX", "MEMORY", "PRICE/H")
	for _, gpu := range gpus {
		maxLabel := "-"
		if gpu.MaxGPUCount > 0 {
			maxLabel = strconv.Itoa(gpu.MaxGPUCount)
		}
		memoryLabel := "-"
		if gpu.MemoryGB > 0 {
			memoryLabel = fmt.Sprintf("%dGB", gpu.MemoryGB)
		}
		priceLabel := "-"
		if gpu.PricePerHour > 0 {
			priceLabel = fmt.Sprintf("$%.3f", gpu.PricePerHour)
		}
		fmt.Printf(
			"%-32s %-7s %-9s %s\n",
			truncateRunListColumn(gpu.DisplayName, 32),
			maxLabel,
			memoryLabel,
			priceLabel,
		)
	}
}

func dataList(args []string) {
	fs := flag.NewFlagSet("data list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full data payload")
	fs.BoolVar(verbose, "v", false, "Show full data payload")
	mustParseFlags(fs, args)

	resp, err := doJSON(http.MethodGet, "/data", nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}

	blobsAny, ok := resp["blobs"].([]any)
	if !ok || len(blobsAny) == 0 {
		fmt.Println("No data items found.")
		return
	}
	fmt.Printf("%-18s %-30s %-12s %s\n", "DATA ID", "FILENAME", "SIZE", "CREATED")
	for _, raw := range blobsAny {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		blobID := strings.TrimSpace(asString(row["blob_id"]))
		filename := strings.TrimSpace(asString(row["filename"]))
		size := asInt64(row["size"])
		created := formatUnixMillis(asInt64(row["created_at"]))
		fmt.Printf(
			"%-18s %-30s %-12s %s\n",
			truncateRunListColumn(defaultString(blobID, "-"), 18),
			truncateRunListColumn(defaultString(filename, "-"), 30),
			humanSize(size),
			created,
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
	resp, err := doJSON(http.MethodGet, "/data/"+dataID, nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	fmt.Printf("Data ID: %s\n", defaultString(strings.TrimSpace(asString(resp["blob_id"])), dataID))
	fmt.Printf("Filename: %s\n", defaultString(strings.TrimSpace(asString(resp["filename"])), "-"))
	fmt.Printf("Key: %s\n", defaultString(strings.TrimSpace(asString(resp["key"])), "-"))
	fmt.Printf("Size: %s\n", humanSize(asInt64(resp["size"])))
	contentType := strings.TrimSpace(asString(resp["content_type"]))
	if contentType != "" {
		fmt.Printf("Content-Type: %s\n", contentType)
	}
	downloadURL := strings.TrimSpace(asString(resp["download_url"]))
	if downloadURL != "" {
		fmt.Printf("Download URL: %s\n", downloadURL)
	}
	created := asInt64(resp["created_at"])
	if created > 0 {
		fmt.Printf("Created: %s\n", formatUnixMillis(created))
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
	list := fs.Bool("list", false, "List all environments")
	verbose := fs.Bool("verbose", false, "Show full environment payload")
	fs.BoolVar(verbose, "v", false, "Show full environment payload")
	mustParseFlags(fs, args)

	if *list {
		resp, err := doJSON(http.MethodGet, "/environments", nil)
		must(err)
		if *verbose {
			printJSON(resp)
			return
		}
		environmentsAny, ok := resp["environments"].([]any)
		if !ok {
			printJSON(resp)
			return
		}
		printEnvironmentListSummary(environmentsAny)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/environments/"+*id, nil)
	must(err)
	if *verbose {
		printJSON(resp)
		return
	}
	printEnvironmentSummary(resp)
}

func environmentList(args []string) {
	environmentShow(append(args, "--list"))
}

func printEnvironmentListSummary(environmentsAny []any) {
	if len(environmentsAny) == 0 {
		fmt.Println("No environments found.")
		return
	}

	fmt.Printf("%-22s %-32s %-22s %-10s %-18s\n", "NAME", "ENV ID", "GPU", "VOLUME", "FRAMEWORK")
	for _, raw := range environmentsAny {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := strings.TrimSpace(asString(row["name"]))
		if name == "" {
			name = "unknown"
		}
		envID := strings.TrimSpace(asString(row["environment_id"]))
		if envID == "" {
			envID = "-"
		}
		gpuType := strings.TrimSpace(asString(row["gpu_type"]))
		gpuCount := asInt64(row["gpu_count"])
		gpuLabel := gpuType
		if gpuLabel == "" {
			gpuLabel = "unknown"
		}
		if gpuCount > 0 {
			gpuLabel = fmt.Sprintf("%s x%d", gpuLabel, gpuCount)
		}

		volumeGb := asInt64(row["volume_gb"])
		volumeLabel := "-"
		if volumeGb > 0 {
			volumeLabel = fmt.Sprintf("%dGB", volumeGb)
		}

		framework := strings.TrimSpace(asString(row["framework"]))
		version := strings.TrimSpace(asString(row["version"]))
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

func printEnvironmentSummary(resp map[string]any) {
	name := strings.TrimSpace(asString(resp["name"]))
	envID := strings.TrimSpace(asString(resp["environment_id"]))
	gpuType := strings.TrimSpace(asString(resp["gpu_type"]))
	gpuCount := asInt64(resp["gpu_count"])
	volumeGb := asInt64(resp["volume_gb"])
	framework := strings.TrimSpace(asString(resp["framework"]))
	version := strings.TrimSpace(asString(resp["version"]))
	artifacts := strings.TrimSpace(asString(resp["artifacts"]))

	if name != "" {
		fmt.Printf("Name: %s\n", name)
	}
	if envID != "" {
		fmt.Printf("Environment ID: %s\n", envID)
	}
	if gpuType != "" || gpuCount > 0 {
		if gpuCount > 0 {
			fmt.Printf("GPU: %s x%d\n", defaultString(gpuType, "unknown"), gpuCount)
		} else {
			fmt.Printf("GPU: %s\n", defaultString(gpuType, "unknown"))
		}
	}
	if volumeGb > 0 {
		fmt.Printf("Volume: %dGB\n", volumeGb)
	}
	if framework != "" || version != "" {
		stack := defaultString(framework, "unknown")
		if version != "" {
			stack += " " + version
		}
		fmt.Printf("Framework: %s\n", stack)
	}
	if artifacts != "" {
		fmt.Printf("Artifacts: %s\n", artifacts)
	}
	if boundAny, ok := resp["bound_data_ids"].([]any); ok && len(boundAny) > 0 {
		fmt.Printf("Bound data IDs: %d\n", len(boundAny))
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
	fs := flag.NewFlagSet("environment delete", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	mustParseFlags(fs, args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodDelete, "/environments/"+*id, nil)
	must(err)
	if deleted, ok := resp["deleted"]; ok && deleted == true {
		if cleanupErr := clearLinkedEnvironmentIDIfMatches(strings.TrimSpace(*id)); cleanupErr != nil {
			fmt.Printf("%sWarning:%s failed to clean local environment link: %v\n", cAmpGold, cReset, cleanupErr)
		}
	}
	printJSON(resp)
}

func environmentUpdate(args []string) {
	fs := flag.NewFlagSet("environment update", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID (defaults to linked project environment)")
	gpuType := fs.String("gpu-type", "", "GPU type")
	gpuCount := fs.Int("gpu-count", 0, "GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Volume in GB")
	mustParseFlags(fs, args)

	environmentID := strings.TrimSpace(*id)
	if environmentID == "" && len(fs.Args()) > 0 {
		environmentID = strings.TrimSpace(fs.Args()[0])
	}
	if environmentID == "" {
		linkedID, err := resolveEnvironmentID()
		must(err)
		environmentID = linkedID
	}

	if *gpuCount < 0 || *volumeGB < 0 {
		must(errors.New("--gpu-count and --volume-gb must be positive"))
	}

	payload := map[string]any{}
	if strings.TrimSpace(*gpuType) != "" {
		payload["gpu_type"] = strings.TrimSpace(*gpuType)
	}
	if *gpuCount > 0 {
		payload["gpu_count"] = *gpuCount
	}
	if *volumeGB > 0 {
		payload["volume_gb"] = *volumeGB
	}

	interactive := len(payload) == 0
	if interactive {
		current, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
		must(err)

		currentGPU := strings.TrimSpace(asString(current["gpu_type"]))
		currentGPUCount := int(asInt64(current["gpu_count"]))
		if currentGPUCount < 1 {
			currentGPUCount = 1
		}
		currentVolume := int(asInt64(current["volume_gb"]))
		if currentVolume < 1 {
			currentVolume = 1
		}

		gpus, _, err := fetchCatalog()
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

		payload["gpu_type"] = promptChoice("GPU type", gpus, defaultGPUIndex)
		payload["gpu_count"] = promptInt("GPU count", currentGPUCount)
		payload["volume_gb"] = promptInt("Volume (GB)", currentVolume)
	}
	if gpuCountValue := int(asInt64(payload["gpu_count"])); gpuCountValue > 0 {
		effectiveGPUType := strings.TrimSpace(asString(payload["gpu_type"]))
		if effectiveGPUType == "" {
			current, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
			must(err)
			effectiveGPUType = strings.TrimSpace(asString(current["gpu_type"]))
		}
		if err := validateGPUSelection(effectiveGPUType, gpuCountValue); err != nil {
			must(err)
		}
	}

	resp, err := doJSON(http.MethodPatch, "/environments/"+environmentID, payload)
	must(err)
	printJSON(resp)
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
	runID := asString(resp["run_id"])
	runName := strings.TrimSpace(asString(resp["name"]))
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

	resp, err := doJSON(http.MethodGet, "/runs", nil)
	if err != nil {
		return "", err
	}
	runsAny, ok := resp["runs"].([]any)
	if !ok {
		return "", errors.New("invalid runs response")
	}

	for _, raw := range runsAny {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		runID := strings.TrimSpace(asString(row["run_id"]))
		if runID == target {
			return runID, nil
		}
	}

	matches := make([]string, 0, 2)
	for _, raw := range runsAny {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		runName := strings.TrimSpace(asString(row["name"]))
		if runName != target {
			continue
		}
		runID := strings.TrimSpace(asString(row["run_id"]))
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

	resp, err := doJSON(http.MethodPatch, "/runs/"+runID, map[string]any{
		"name": newName,
	})
	must(err)

	resolvedName := strings.TrimSpace(asString(resp["name"]))
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

	runID := asString(resp["run_id"])
	fmt.Printf("%s✓%s run created: %s - %s\n", cAmpGreen, cReset, runID, runDashboardURL(runID))
	if *detached {
		return
	}
	must(monitorRunWithLogs(runID, 5))
}

func createRunWithCapacityPrompt(path string, payload map[string]any) (map[string]any, error) {
	resp, err := doJSON(http.MethodPost, path, payload)
	if err == nil || !isNoGPUCapacityCreateError(err) || !supportsInteractivePrompts() {
		return resp, err
	}

	gpus, _, catalogErr := fetchCatalog()
	if catalogErr != nil || len(gpus) == 0 {
		return nil, err
	}

	defaultGPU := strings.TrimSpace(asString(payload["gpu_type"]))
	if defaultGPU == "" {
		if inferred, inferErr := inferEnvironmentGPU(path); inferErr == nil {
			defaultGPU = inferred
		}
	}
	defaultIndex := 0
	if defaultGPU != "" {
		for i, gpu := range gpus {
			if strings.EqualFold(strings.TrimSpace(gpu), defaultGPU) {
				defaultIndex = i
				break
			}
		}
	}

	lastErr := err
	for {
		fmt.Printf("%sNo GPU capacity for current selection.%s\n", cAmpGold, cReset)
		nextGPU := promptChoice("Choose available GPU", gpus, defaultIndex)
		payload["gpu_type"] = nextGPU
		if gpuCount := int(asInt64(payload["gpu_count"])); gpuCount > 0 {
			if err := validateGPUSelection(nextGPU, gpuCount); err != nil {
				fmt.Printf("%s%s%s\n", cAmpGold, err.Error(), cReset)
				choice := promptChoice("Still unavailable", []string{"Try another GPU", "Cancel"}, 0)
				if choice == "Cancel" {
					return nil, lastErr
				}
				continue
			}
		}

		resp, err = doJSON(http.MethodPost, path, payload)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !isNoGPUCapacityCreateError(err) {
			return nil, err
		}

		choice := promptChoice("Still unavailable", []string{"Try another GPU", "Cancel"}, 0)
		if choice == "Cancel" {
			return nil, lastErr
		}
		for i, gpu := range gpus {
			if strings.EqualFold(strings.TrimSpace(gpu), nextGPU) {
				defaultIndex = (i + 1) % len(gpus)
				break
			}
		}
	}
}

func isNoGPUCapacityCreateError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "no gpu capacity currently available") ||
		strings.Contains(text, "no instances currently available") ||
		strings.Contains(text, "insufficient capacity")
}

func supportsInteractivePrompts() bool {
	in, inErr := os.Stdin.Stat()
	out, outErr := os.Stdout.Stat()
	if inErr != nil || outErr != nil {
		return false
	}
	return (in.Mode()&os.ModeCharDevice) != 0 && (out.Mode()&os.ModeCharDevice) != 0
}

func inferEnvironmentGPU(path string) (string, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// Expected: environments/{env_id}/runs
	if len(parts) < 3 || parts[0] != "environments" {
		return "", errors.New("environment id not found in path")
	}
	environmentID := strings.TrimSpace(parts[1])
	if environmentID == "" {
		return "", errors.New("environment id is empty")
	}
	env, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return "", err
	}
	gpu := strings.TrimSpace(asString(env["gpu_type"]))
	if gpu == "" {
		return "", errors.New("environment gpu_type is empty")
	}
	return gpu, nil
}

func preRunSync(environmentID string) error {
	return runSyncWithStatus(environmentID, syncScope{code: true, data: true})
}
