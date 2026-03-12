package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	neturl "net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"

	"github.com/manifoldco/promptui"
)

const (
	defaultAPIURL    = "http://localhost:3000"
	apiPrefix        = "/api"
	projectStateDir  = ".tahuna"
	projectEnvIDFile = "environment_id"
	projectCfgFile   = "project.yaml"
	cReset           = "\033[0m"
	// AMP frontend palette mapping:
	// background #0b1d1f, foreground #e8e0d4, primary/accent #c8a84e, muted #8a9a93
	cAmpWord  = "\033[38;5;44m"  // blue-green wordmark
	cAmpText  = "\033[38;5;223m" // sand/foreground
	cAmpMuted = "\033[38;5;108m" // muted green-gray
	cAmpTeal  = "\033[38;5;37m"  // dark teal accent
	cAmpGreen = "\033[38;5;48m"
	cAmpGold  = "\033[38;5;179m"
	cAmpRed   = "\033[38;5;196m"
)

// cliVersion is overridden at release build time via -ldflags.
var cliVersion = "dev"
var warnedLegacyAPIURLEnv bool

func main() {
	if len(os.Args) < 2 {
		usage()
		return
	}

	switch os.Args[1] {
	case "env", "environment":
		handleEnvironment(os.Args[2:])
	case "catalog":
		handleCatalog(os.Args[2:])
	case "data":
		handleData(os.Args[2:])
	case "run":
		handleRun(os.Args[2:])
	case "sync":
		handleSync(os.Args[2:])
	case "train":
		train(os.Args[2:])
	case "shell":
		must(runShell())
	case "init", "start":
		handleInit(os.Args[2:])
	case "up":
		handleInit([]string{"."})
	case "login":
		must(login())
	case "version":
		fmt.Printf("tahuna %s\n", cliVersion)
	case "-h", "--help", "help":
		usage()
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Print(`tahuna CLI

Usage:
  tahuna shell
  tahuna login
  tahuna init [.]|[project-name]
  tahuna sync [code|data]
  tahuna train [-d] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>]
  tahuna env list|show|update|delete ...
  tahuna env data bind|unbind ...
  tahuna catalog gpus
  tahuna data list|show ...
  tahuna run create|rename|list|show|watch|logs|cancel|delete ...
  tahuna up
  tahuna version

Run list:
  tahuna run list                Show last 5 runs (tail order; newest at bottom)
  tahuna run list -l <N>         Show last N runs
  tahuna run list -a             Show all runs
  tahuna run list --verbose      Show full JSON payload
  tahuna run show <run_id>
  tahuna run rename <run_id|run_name> --name <new_name>
  tahuna run watch <run_id> [--interval 5]
  tahuna run logs <run_id> [--verbose] [--follow]
  tahuna run cancel <run_id> [-f]
  tahuna run delete <run_id>

Environment:
  tahuna env list [--verbose]
  tahuna env show --id <env_id> [--verbose]
  tahuna env update [<env_id>] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>]
  tahuna env specs [<env_id>] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>]   Alias

Auth:
  TAHUNA_API_URL      API base URL (default: http://localhost:3000)
  TAHUNA_SITE_URL     Canonical site URL alias for API base
  TAHUNA_PUBLIC_SITE_URL Public site URL alias for API base
  TAHUNA_BROWSER_URL  Browser auth URL base for "tahuna login" (optional)
  TAHUNA_API_KEY      Auth token (set automatically by "tahuna login")

Tip:
  Run "tahuna init ." to initialize the current project.
`)
}

func login() error {
	printHeader()

	resolvedBrowserBase := resolveLoginBrowserBaseURL()
	if lookupConfigValue("TAHUNA_BROWSER_URL") == "" {
		if err := saveConfigValues(map[string]string{"TAHUNA_BROWSER_URL": resolvedBrowserBase}); err != nil {
			return fmt.Errorf("failed to persist browser URL: %w", err)
		}
	}

	state := fmt.Sprintf("st_%d", time.Now().UnixNano())
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()

	callbackURL := fmt.Sprintf("http://%s/callback", listener.Addr().String())
	hostname, _ := os.Hostname()
	authURL := fmt.Sprintf("%s/auth/cli?state=%s&callback=%s&machine=%s",
		resolvedBrowserBase,
		neturl.QueryEscape(state),
		neturl.QueryEscape(callbackURL),
		neturl.QueryEscape(hostname),
	)

	tokenCh := make(chan string, 1)
	errCh := make(chan error, 1)
	mux := http.NewServeMux()
	server := &http.Server{
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		gotState := strings.TrimSpace(r.URL.Query().Get("state"))
		token := strings.TrimSpace(r.URL.Query().Get("token"))
		if gotState == "" || gotState != state {
			http.Error(w, "invalid state", http.StatusBadRequest)
			return
		}
		if token == "" {
			http.Error(w, "missing token", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("Tahuna CLI login complete. You can close this tab."))

		select {
		case tokenCh <- token:
		default:
		}

		go func() {
			_ = server.Shutdown(context.Background())
		}()
	})

	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			errCh <- serveErr
		}
	}()

	if openErr := openBrowser(authURL); openErr != nil {
		fmt.Printf("%sCould not open browser automatically.%s\n", cAmpMuted, cReset)
	}

	fmt.Printf("%sOpen this URL to continue login:%s %s\n", cAmpMuted, cReset, authURL)
	fmt.Printf("%sWaiting for authentication callback...%s\n", cAmpMuted, cReset)

	select {
	case token := <-tokenCh:
		os.Setenv("TAHUNA_API_KEY", token)
		if writeErr := saveTokenToEnvFile(token); writeErr != nil {
			return fmt.Errorf("logged in, but failed to persist token: %w", writeErr)
		}
		fmt.Printf("%sLogin successful.%s Token saved to %s\n", cAmpGreen, cReset, defaultEnvFilePath())
		return nil
	case serveErr := <-errCh:
		return serveErr
	case <-time.After(5 * time.Minute):
		return errors.New("login timed out")
	}
}

func openBrowser(rawURL string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", rawURL)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL)
	default:
		cmd = exec.Command("xdg-open", rawURL)
	}
	return cmd.Start()
}

func defaultEnvFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "tahuna.config.env"
	}
	return filepath.Join(home, ".config", "tahuna", "config.env")
}

func saveTokenToEnvFile(token string) error {
	return saveConfigValues(map[string]string{"TAHUNA_API_KEY": token})
}

func printHeader() {
	printPanel("Tahuna", []string{
		fmt.Sprintf("%s>%s Tahuna CLI", cAmpGold, cReset),
	}, "", "")
}

func runShell() error {
	printHeader()
	fmt.Printf("%sSession mode%s (type 'help' for commands, 'exit' to quit)\n\n", cAmpMuted, cReset)

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Printf("%s%s%s tahuna> %s", serverDot(), cReset, cAmpGold, cReset)
		line, err := reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				fmt.Println()
				return nil
			}
			return err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		switch line {
		case "exit", "quit":
			return nil
		case "help":
			usage()
			continue
		case "clear":
			fmt.Print("\033[2J\033[H")
			printHeader()
			continue
		}

		args := splitArgs(line)
		if len(args) == 0 {
			continue
		}
		if args[0] == "shell" {
			fmt.Println("already in shell mode")
			continue
		}
		if args[0] == "login" || args[0] == "init" || args[0] == "start" {
			fmt.Printf("command unavailable in shell mode: %s\n", args[0])
			continue
		}

		cmd := exec.Command(os.Args[0], args...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Env = os.Environ()
		_ = cmd.Run()
	}
}

func splitArgs(s string) []string {
	// Lightweight parser: keeps quoted segments together.
	var out []string
	var cur strings.Builder
	inQuote := byte(0)
	escaped := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if escaped {
			cur.WriteByte(ch)
			escaped = false
			continue
		}
		if ch == '\\' {
			escaped = true
			continue
		}
		if inQuote != 0 {
			if ch == inQuote {
				inQuote = 0
			} else {
				cur.WriteByte(ch)
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			inQuote = ch
			continue
		}
		if ch == ' ' || ch == '\t' {
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
			continue
		}
		cur.WriteByte(ch)
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

func serverDot() string {
	client := &http.Client{Timeout: 1200 * time.Millisecond}
	req, err := http.NewRequest(http.MethodGet, apiURL()+"/health", nil)
	if err != nil {
		return cAmpRed + "●"
	}
	resp, err := client.Do(req)
	if err != nil {
		return cAmpRed + "●"
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return cAmpGreen + "●"
	}
	return cAmpRed + "●"
}

func apiURL() string {
	if v := lookupConfigValue("TAHUNA_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := lookupConfigValue("TAHUNA_SITE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := lookupConfigValue("TAHUNA_PUBLIC_SITE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	// Legacy provider-specific aliases are supported temporarily for migration.
	if v := lookupConfigValue("CONVEX_SITE_URL"); v != "" {
		if !warnedLegacyAPIURLEnv {
			fmt.Fprintf(os.Stderr, "warning: using a legacy backend URL env var; use TAHUNA_API_URL/TAHUNA_SITE_URL instead\n")
			warnedLegacyAPIURLEnv = true
		}
		return strings.TrimRight(v, "/")
	}
	if v := lookupConfigValue("NEXT_PUBLIC_CONVEX_SITE_URL"); v != "" {
		if !warnedLegacyAPIURLEnv {
			fmt.Fprintf(os.Stderr, "warning: using a legacy backend URL env var; use TAHUNA_API_URL/TAHUNA_SITE_URL instead\n")
			warnedLegacyAPIURLEnv = true
		}
		return strings.TrimRight(v, "/")
	}
	return defaultAPIURL
}

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
		"name":      environmentName,
		"gpu_type":  gpuType,
		"gpu_count": gpuCount,
		"volume_gb": volumeGB,
		"python_version": strings.TrimSpace(pythonVersion),
		"framework": framework,
		"version":   version,
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
	fs.Parse(args)

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
	fs.Parse(args)

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
	fs.Parse(args)

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

type dataSyncDecision struct {
	upload      bool
	versionName string
}

var (
	syncDoJSON                      = doJSON
	syncUploadFileToSignedURLRetry  = uploadFileToSignedURLWithRetry
	syncUploadBytesToSignedURLRetry = uploadBytesToSignedURLWithRetry
	syncPromptChoice                = promptChoice
	syncPromptString                = promptString
	syncSupportsInteractivePrompts  = supportsInteractivePrompts
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

func environmentCreate(args []string) {
	fs := flag.NewFlagSet("environment create", flag.ExitOnError)
	name := fs.String("name", "", "Environment name")
	gpuType := fs.String("gpu-type", "", "GPU type")
	gpuCount := fs.Int("gpu-count", 1, "GPU count")
	volumeGB := fs.Int("volume-gb", 80, "Volume in GB")
	framework := fs.String("framework", "", "Framework key (e.g. pt)")
	version := fs.String("version", "", "Framework version (e.g. 2.8.0-cu128)")
	fs.Parse(args)

	if *name == "" || *gpuType == "" || *framework == "" || *version == "" {
		fmt.Println("Missing required values; switching to guided prompts.")
		gpus, versionsByFramework, err := fetchCatalog()
		must(err)
		if *name == "" {
			*name = promptString("Environment name", "")
		}
		if *gpuType == "" {
			*gpuType = promptChoice("GPU type", gpus, 0)
		}
		if *framework == "" {
			frameworks := sortedKeys(versionsByFramework)
			*framework = promptChoice("Framework", frameworks, 0)
		}
		if *version == "" {
			*version = promptChoice("Framework version", versionsByFramework[*framework], 0)
		}
	}
	if err := validateGPUSelection(*gpuType, *gpuCount); err != nil {
		must(err)
	}

	payload := map[string]any{
		"name":      *name,
		"gpu_type":  *gpuType,
		"gpu_count": *gpuCount,
		"volume_gb": *volumeGB,
		"framework": *framework,
		"version":   *version,
	}
	resp, err := doJSON(http.MethodPost, "/environments", payload)
	must(err)
	printJSON(resp)
}

func environmentShow(args []string) {
	fs := flag.NewFlagSet("environment show", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	list := fs.Bool("list", false, "List all environments")
	verbose := fs.Bool("verbose", false, "Show full environment payload")
	fs.BoolVar(verbose, "v", false, "Show full environment payload")
	fs.Parse(args)

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
	fs.Parse(args)
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
	fs.Parse(args)

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
	fs.Parse(args)
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
	fs.Parse(args)

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

func runSyncWithStatus(environmentID string, scope syncScope) error {
	start := time.Now()
	dynamic := supportsDynamicStatus()
	if err := syncIncremental(environmentID, scope, syncOptions{
		logProgress:   true,
		dynamicStatus: dynamic,
	}); err != nil {
		if dynamic {
			clearStatusLine()
		}
		return err
	}
	if dynamic {
		clearStatusLine()
	}
	printSuccessLine(fmt.Sprintf("sync complete (%s)", formatDuration(time.Since(start))))
	return nil
}

func syncIncremental(environmentID string, scope syncScope, options syncOptions) error {
	prepared := []preparedManifest{}

	if scope.code {
		codeSpinner := newSyncPhaseSpinner("syncing code...", options)
		codeManifest, err := prepareCodeManifest()
		if err != nil {
			codeSpinner.StopError()
			return fmt.Errorf("code sync failed: %w", err)
		}
		if codeManifest.cleanup != nil {
			defer codeManifest.cleanup()
		}
		if err := syncMissingBlobs(environmentID, codeManifest, nil, false); err != nil {
			codeSpinner.StopError()
			return fmt.Errorf("%s sync failed: %w", codeManifest.kind, err)
		}
		codeSpinner.StopSuccess("syncing code")
		prepared = append(prepared, codeManifest)
	}

	if scope.data {
		dataSpinner := newSyncPhaseSpinner("syncing data...", options)
		dataManifest, err := prepareDataManifest()
		if err != nil {
			dataSpinner.StopError()
			return fmt.Errorf("data sync failed: %w", err)
		}
		if dataManifest.cleanup != nil {
			defer dataManifest.cleanup()
		}
		if err := syncMissingBlobs(environmentID, dataManifest, func(done, total int, phase string) {
			dataSpinner.SetMessage(formatDataSyncProgress(done, total, phase))
		}, false); err != nil {
			dataSpinner.StopError()
			return fmt.Errorf("%s sync failed: %w", dataManifest.kind, err)
		}
		dataSpinner.StopSuccess("syncing data")
		prepared = append(prepared, dataManifest)
	}

	commitSpinner := newSyncPhaseSpinner("finalizing sync...", options)
	commitPayload := map[string]any{
		"environment_id": environmentID,
	}
	for _, item := range prepared {
		commitPayload[item.kind+"_manifest_hash"] = item.hash
	}

	for _, item := range prepared {
		if err := uploadManifest(environmentID, item); err != nil {
			commitSpinner.StopError()
			return fmt.Errorf("%s sync failed: %w", item.kind, err)
		}
	}

	var commitErr error
	backoff := 250 * time.Millisecond
	for attempt := 0; attempt < 8; attempt++ {
		if _, commitErr = syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); commitErr == nil {
			break
		}
		if !isMissingManifestCommitError(commitErr) {
			commitSpinner.StopError()
			return commitErr
		}
		// Re-upload manifests midway in case storage propagation lagged.
		if attempt == 3 {
			for _, item := range prepared {
				if err := uploadManifest(environmentID, item); err != nil {
					commitSpinner.StopError()
					return fmt.Errorf("%s sync failed: %w", item.kind, err)
				}
			}
		}
		if attempt < 7 {
			time.Sleep(backoff)
			if backoff < 2*time.Second {
				backoff *= 2
			}
		}
	}
	if commitErr != nil {
		// Last fallback: one more upload + one last commit try before giving up.
		for _, item := range prepared {
			if err := uploadManifest(environmentID, item); err != nil {
				commitSpinner.StopError()
				return fmt.Errorf("%s sync failed: %w", item.kind, err)
			}
		}
		if _, err := syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); err != nil {
			commitSpinner.StopError()
			return err
		}
	}
	commitSpinner.StopSuccess("finalizing sync")

	for _, item := range prepared {
		if err := saveManifestCache(item); err != nil {
			return fmt.Errorf("%s sync failed: %w", item.kind, err)
		}
	}
	return nil
}

func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}

func supportsDynamicStatus() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("TERM")), "dumb") {
		return false
	}
	info, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

func printStatusLine(prefix, message string) {
	fmt.Printf("\r\033[2K%s%s%s %s", cAmpGreen, prefix, cReset, message)
}

func clearStatusLine() {
	fmt.Print("\r\033[2K")
}

func isMissingManifestCommitError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		return apiErr.status == http.StatusBadRequest &&
			strings.Contains(strings.ToLower(apiErr.detail), "manifest not found in object storage")
	}
	return strings.Contains(strings.ToLower(err.Error()), "manifest not found in object storage")
}

func prepareCodeManifest() (preparedManifest, error) {
	cfg, err := loadProjectConfig()
	if err != nil {
		return preparedManifest{}, err
	}
	dataDir := strings.TrimSpace(cfg.DataDir)
	if dataDir == "" {
		dataDir = "data"
	}
	outputDir := strings.TrimSpace(cfg.OutputDir)
	if outputDir == "" {
		outputDir = "outputs"
	}
	cachePath := filepath.Join(projectStateDir, "sync_code_manifest.json")
	return buildManifest("code", cachePath, []string{dataDir, outputDir})
}

func prepareDataManifest() (preparedManifest, error) {
	cachePath := filepath.Join(projectStateDir, "sync_data_manifest.json")
	return buildManifest("data", cachePath, nil)
}

func dataSyncVersionNamePath() string {
	return filepath.Join(projectStateDir, "sync_data_version_name")
}

func loadDataSyncVersionName() string {
	raw, err := os.ReadFile(dataSyncVersionNamePath())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func saveDataSyncVersionName(name string) error {
	if strings.TrimSpace(name) == "" {
		return nil
	}
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(dataSyncVersionNamePath(), []byte(strings.TrimSpace(name)+"\n"), 0o600)
}

func defaultDataSyncVersionName() string {
	cfg, err := loadProjectConfig()
	if err != nil {
		return "data"
	}
	resolved := strings.TrimSpace(cfg.DataDir)
	if resolved == "" {
		resolved = "data"
	}
	base := strings.TrimSpace(filepath.Base(filepath.Clean(resolved)))
	if base == "" || base == "." || base == string(filepath.Separator) {
		return "data"
	}
	return base
}

func decideDataSyncUpload(item preparedManifest) (dataSyncDecision, error) {
	currentName := loadDataSyncVersionName()
	if currentName == "" {
		currentName = defaultDataSyncVersionName()
	}

	_, previousHash, previousOK := loadManifestCache(item.cachePath)
	changed := !previousOK || previousHash != item.hash
	if !changed {
		return dataSyncDecision{upload: true, versionName: currentName}, nil
	}
	if !previousOK {
		if err := saveDataSyncVersionName(currentName); err != nil {
			return dataSyncDecision{}, err
		}
		return dataSyncDecision{upload: true, versionName: currentName}, nil
	}

	if !syncSupportsInteractivePrompts() {
		return dataSyncDecision{}, errors.New("data changed; interactive confirmation required (run `tahuna sync data` in a terminal)")
	}

	fmt.Printf("%sData files changed.%s\n", cAmpGold, cReset)
	choice := syncPromptChoice("Data sync action", []string{
		fmt.Sprintf("Re-upload and overwrite \"%s\"", currentName),
		"Re-upload as a new data name",
		"Cancel",
	}, 0)

	switch choice {
	case "Cancel":
		return dataSyncDecision{upload: false, versionName: currentName}, nil
	case "Re-upload as a new data name":
		nextName := strings.TrimSpace(syncPromptString("New data name", currentName+"-v2"))
		if nextName == "" {
			return dataSyncDecision{}, errors.New("data name is required")
		}
		if err := saveDataSyncVersionName(nextName); err != nil {
			return dataSyncDecision{}, err
		}
		return dataSyncDecision{upload: true, versionName: nextName}, nil
	default:
		if err := saveDataSyncVersionName(currentName); err != nil {
			return dataSyncDecision{}, err
		}
		return dataSyncDecision{upload: true, versionName: currentName}, nil
	}
}

func buildManifest(kind, cachePath string, excludeDirs []string) (preparedManifest, error) {
	entries, filesByID, cleanup, err := collectManifestEntries(kind, excludeDirs)
	if err != nil {
		return preparedManifest{}, err
	}

	createdAt := time.Now().UnixMilli()
	if cached, cachedHash, cachedOK := loadManifestCache(cachePath); cachedOK {
		if cachedHash != "" && manifestEntriesEqual(cached.Entries, entries) {
			createdAt = cached.CreatedAt
		}
	}

	manifest := syncManifest{
		Version:   1,
		Type:      kind,
		CreatedAt: createdAt,
		Entries:   entries,
	}
	raw, hash, err := marshalAndHashManifest(manifest)
	if err != nil {
		return preparedManifest{}, err
	}

	return preparedManifest{
		kind:      kind,
		manifest:  manifest,
		hash:      hash,
		raw:       raw,
		cachePath: cachePath,
		filesByID: filesByID,
		cleanup:   cleanup,
	}, nil
}

func collectManifestEntries(kind string, excludeDirs []string) ([]syncManifestEntry, map[string]string, func(), error) {
	baseDir, err := os.Getwd()
	if err != nil {
		return nil, nil, nil, err
	}

	entries := []syncManifestEntry{}
	filesByID := map[string]string{}

	addEntry := func(fullPath, relPath string, fileInfo fs.FileInfo) error {
		hash, size, err := fileSHA256(fullPath)
		if err != nil {
			return err
		}
		normalized := filepath.ToSlash(relPath)
		entries = append(entries, syncManifestEntry{
			Path:   normalized,
			SHA256: hash,
			Size:   size,
			Mode:   uint32(fileInfo.Mode().Perm()),
		})
		if _, exists := filesByID[hash]; !exists {
			filesByID[hash] = fullPath
		}
		return nil
	}

	if kind == "data" {
		cfg, cfgErr := loadProjectConfig()
		if cfgErr != nil {
			return nil, nil, nil, cfgErr
		}
		resolvedDataDir := strings.TrimSpace(cfg.DataDir)
		if resolvedDataDir == "" {
			resolvedDataDir = "data"
		}
		info, statErr := os.Stat(resolvedDataDir)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				return entries, filesByID, nil, nil
			}
			return nil, nil, nil, statErr
		}
		if !info.IsDir() {
			return entries, filesByID, nil, nil
		}
		archiveEntry, archivePath, walkErr := buildDataArchiveEntry(resolvedDataDir)
		if walkErr != nil {
			return nil, nil, nil, walkErr
		}
		if archiveEntry == nil {
			return entries, filesByID, nil, nil
		}
		entries = append(entries, *archiveEntry)
		filesByID[archiveEntry.SHA256] = archivePath
		return entries, filesByID, func() {
			_ = os.Remove(archivePath)
		}, nil
	}

	normalizedExcludeDirs := make([]string, 0, len(excludeDirs))
	for _, dir := range excludeDirs {
		nd := filepath.Clean(dir)
		if filepath.IsAbs(nd) {
			if relDir, relErr := filepath.Rel(baseDir, nd); relErr == nil && relDir != "." && relDir != ".." && !strings.HasPrefix(relDir, ".."+string(filepath.Separator)) {
				nd = filepath.Clean(relDir)
			}
		}
		normalizedExcludeDirs = append(normalizedExcludeDirs, nd)
	}

	gitEntries, gitFilesByID, gitErr := collectCodeEntriesWithGitIgnore(baseDir, normalizedExcludeDirs)
	if gitErr == nil {
		if len(gitEntries) == 0 {
			return nil, nil, nil, errors.New("no code files found to sync")
		}
		sort.Slice(gitEntries, func(i, j int) bool { return gitEntries[i].Path < gitEntries[j].Path })
		return gitEntries, gitFilesByID, nil, nil
	}

	walkErr := filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == baseDir {
			return nil
		}

		relPath, relErr := filepath.Rel(baseDir, path)
		if relErr != nil {
			return relErr
		}
		relPath = filepath.Clean(relPath)

		if d.IsDir() && shouldSkipCodePath(relPath, excludeDirs) {
			return filepath.SkipDir
		}
		if d.IsDir() {
			return nil
		}
		if shouldSkipCodePath(relPath, excludeDirs) {
			return nil
		}
		if !d.Type().IsRegular() || (d.Type()&os.ModeSymlink) != 0 {
			return nil
		}

		fileInfo, infoErr := d.Info()
		if infoErr != nil {
			return infoErr
		}
		return addEntry(path, relPath, fileInfo)
	})
	if walkErr != nil {
		return nil, nil, nil, walkErr
	}
	if len(entries) == 0 {
		return nil, nil, nil, errors.New("no code files found to sync")
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, filesByID, nil, nil
}

func buildDataArchiveEntry(dataDir string) (*syncManifestEntry, string, error) {
	files, err := listDataFiles(dataDir)
	if err != nil {
		return nil, "", err
	}
	if len(files) == 0 {
		return nil, "", nil
	}
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return nil, "", err
	}

	archiveFile, err := os.CreateTemp(projectStateDir, "data_bundle_*.tar.gz")
	if err != nil {
		return nil, "", err
	}
	archivePath := archiveFile.Name()
	if err := writeDeterministicDataArchive(archiveFile, dataDir, files); err != nil {
		_ = archiveFile.Close()
		_ = os.Remove(archivePath)
		return nil, "", err
	}
	if err := archiveFile.Close(); err != nil {
		_ = os.Remove(archivePath)
		return nil, "", err
	}

	hash, size, err := fileSHA256(archivePath)
	if err != nil {
		_ = os.Remove(archivePath)
		return nil, "", err
	}
	entry := syncManifestEntry{
		Path:   "__tahuna__/data_bundle.tar.gz",
		SHA256: hash,
		Size:   size,
		Mode:   0o644,
	}
	return &entry, archivePath, nil
}

func listDataFiles(dataDir string) ([]string, error) {
	files := []string{}
	err := filepath.WalkDir(dataDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() || (d.Type()&os.ModeSymlink) != 0 {
			return nil
		}
		relPath, relErr := filepath.Rel(dataDir, path)
		if relErr != nil {
			return relErr
		}
		files = append(files, filepath.ToSlash(relPath))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func writeDeterministicDataArchive(dst *os.File, dataDir string, files []string) error {
	gw := gzip.NewWriter(dst)
	gw.Header.ModTime = time.Unix(0, 0)
	gw.Header.OS = 255
	tw := tar.NewWriter(gw)

	for _, rel := range files {
		fullPath := filepath.Join(dataDir, filepath.FromSlash(rel))
		info, err := os.Stat(fullPath)
		if err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		header := &tar.Header{
			Name:     rel,
			Mode:     int64(info.Mode().Perm()),
			Size:     info.Size(),
			ModTime:  time.Unix(0, 0),
			Typeflag: tar.TypeReg,
			Format:   tar.FormatUSTAR,
		}
		if err := tw.WriteHeader(header); err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		file, err := os.Open(fullPath)
		if err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		_, copyErr := io.Copy(tw, file)
		closeErr := file.Close()
		if copyErr != nil {
			_ = tw.Close()
			_ = gw.Close()
			return copyErr
		}
		if closeErr != nil {
			_ = tw.Close()
			_ = gw.Close()
			return closeErr
		}
	}
	if err := tw.Close(); err != nil {
		_ = gw.Close()
		return err
	}
	return gw.Close()
}

func shouldSkipCodePath(relPath string, excludeDirs []string) bool {
	if relPath == "." {
		return false
	}
	if relPath == ".git" || strings.HasPrefix(relPath, ".git"+string(filepath.Separator)) {
		return true
	}
	if relPath == projectStateDir || strings.HasPrefix(relPath, projectStateDir+string(filepath.Separator)) {
		return true
	}
	// Hardcoded exclusions
	for _, dir := range []string{"node_modules", "__pycache__"} {
		if relPath == dir || strings.HasPrefix(relPath, dir+string(filepath.Separator)) {
			return true
		}
	}
	for _, dir := range excludeDirs {
		if dir != "." && dir != "" {
			if relPath == dir || strings.HasPrefix(relPath, dir+string(filepath.Separator)) {
				return true
			}
		}
	}
	return false
}

func collectCodeEntriesWithGitIgnore(
	baseDir string,
	excludeDirs []string,
) ([]syncManifestEntry, map[string]string, error) {
	cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	cmd.Dir = baseDir
	checkRaw, err := cmd.Output()
	if err != nil || strings.TrimSpace(string(checkRaw)) != "true" {
		return nil, nil, errors.New("not a git work tree")
	}

	listCmd := exec.Command("git", "ls-files", "-co", "--exclude-standard")
	listCmd.Dir = baseDir
	raw, err := listCmd.Output()
	if err != nil {
		return nil, nil, err
	}

	entries := []syncManifestEntry{}
	filesByID := map[string]string{}
	lines := strings.Split(string(raw), "\n")
	for _, line := range lines {
		relPath := filepath.Clean(strings.TrimSpace(line))
		if relPath == "" || relPath == "." || strings.HasPrefix(relPath, ".."+string(filepath.Separator)) {
			continue
		}
		if shouldSkipCodePath(relPath, excludeDirs) {
			continue
		}

		fullPath := filepath.Join(baseDir, relPath)
		info, statErr := os.Lstat(fullPath)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				continue
			}
			return nil, nil, statErr
		}
		if info.IsDir() || !info.Mode().IsRegular() || (info.Mode()&os.ModeSymlink) != 0 {
			continue
		}

		hash, size, err := fileSHA256(fullPath)
		if err != nil {
			return nil, nil, err
		}
		entries = append(entries, syncManifestEntry{
			Path:   filepath.ToSlash(relPath),
			SHA256: hash,
			Size:   size,
			Mode:   uint32(info.Mode().Perm()),
		})
		if _, exists := filesByID[hash]; !exists {
			filesByID[hash] = fullPath
		}
	}
	return entries, filesByID, nil
}

func marshalAndHashManifest(manifest syncManifest) ([]byte, string, error) {
	raw, err := json.Marshal(manifest)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(raw)
	return raw, hex.EncodeToString(sum[:]), nil
}

func loadManifestCache(path string) (syncManifest, string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return syncManifest{}, "", false
	}
	var manifest syncManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return syncManifest{}, "", false
	}
	_, hash, err := marshalAndHashManifest(manifest)
	if err != nil {
		return syncManifest{}, "", false
	}
	return manifest, hash, true
}

func saveManifestCache(item preparedManifest) error {
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(item.cachePath, append(item.raw, '\n'), 0o600)
}

func manifestEntriesEqual(a, b []syncManifestEntry) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func syncMissingBlobs(
	environmentID string,
	item preparedManifest,
	onProgress func(done, total int, phase string),
	forceUploadAll bool,
) error {
	hashes := uniqueSortedHashes(item.manifest.Entries)
	totalHashes := len(hashes)
	if onProgress != nil {
		onProgress(0, totalHashes, "checking")
	}
	if len(hashes) == 0 {
		if onProgress != nil {
			onProgress(0, 0, "done")
		}
		return nil
	}
	sizeByHash := manifestSizesByHash(item.manifest.Entries)
	missingHashes := make([]string, 0, len(hashes))
	confirmedCount := 0
	if forceUploadAll {
		missingHashes = append(missingHashes, hashes...)
	} else {
		const missingCheckChunkSize = 500
		for start := 0; start < len(hashes); start += missingCheckChunkSize {
			end := start + missingCheckChunkSize
			if end > len(hashes) {
				end = len(hashes)
			}
			chunk := hashes[start:end]
			missingChunk, err := fetchMissingBlobHashesWithRetry(environmentID, item.kind, chunk)
			if err != nil {
				return err
			}
			missingHashes = append(missingHashes, missingChunk...)
			confirmedCount += len(chunk) - len(missingChunk)
			if onProgress != nil {
				onProgress(confirmedCount, totalHashes, "checking")
			}
		}
	}

	if onProgress != nil {
		onProgress(confirmedCount, totalHashes, "uploading")
	}

	type blobUploadTask struct {
		hash string
		path string
		size int64
	}
	tasks := make([]blobUploadTask, 0, len(missingHashes))
	for _, hash := range missingHashes {
		if hash == "" {
			continue
		}
		path, exists := item.filesByID[hash]
		if !exists {
			return fmt.Errorf("missing local blob for hash %s", hash)
		}
		sizeBytes, hasSize := sizeByHash[hash]
		if !hasSize || sizeBytes <= 0 {
			return fmt.Errorf("missing local size for hash %s", hash)
		}
		tasks = append(tasks, blobUploadTask{
			hash: hash,
			path: path,
			size: sizeBytes,
		})
	}
	if len(tasks) == 0 {
		return nil
	}

	workerCount := syncUploadWorkerCount(len(tasks))
	jobs := make(chan blobUploadTask)
	errCh := make(chan error, 1)
	var wg sync.WaitGroup
	var completed atomic.Int64
	completed.Store(int64(confirmedCount))

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range jobs {
				_, err := uploadBlobTask(environmentID, item.kind, task.hash, task.path, task.size)
				if err != nil {
					select {
					case errCh <- err:
					default:
					}
					return
				}
				if onProgress != nil {
					done := int(completed.Add(1))
					onProgress(done, totalHashes, "uploading")
				}
			}
		}()
	}

	var firstErr error
sendLoop:
	for _, task := range tasks {
		select {
		case err := <-errCh:
			firstErr = err
			break sendLoop
		default:
		}
		jobs <- task
	}
	close(jobs)
	wg.Wait()
	if firstErr == nil {
		select {
		case err := <-errCh:
			firstErr = err
		default:
		}
	}
	if firstErr != nil {
		return firstErr
	}

	if onProgress != nil {
		onProgress(int(completed.Load()), totalHashes, "finalizing")
	}
	return nil
}

func syncUploadWorkerCount(total int) int {
	if total <= 1 {
		return 1
	}
	workers := 8
	if raw := strings.TrimSpace(os.Getenv("TAHUNA_SYNC_UPLOAD_WORKERS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			workers = parsed
		}
	}
	if workers < 1 {
		workers = 1
	}
	if workers > 16 {
		workers = 16
	}
	if workers > total {
		workers = total
	}
	return workers
}

func uploadBlobTask(environmentID, kind, hash, path string, sizeBytes int64) (string, error) {
	uploadResp, uploadErr := syncDoJSON(http.MethodPost, "/sync/blobs/upload-url", map[string]any{
		"environment_id": environmentID,
		"kind":           kind,
		"sha256":         hash,
		"size_bytes":     sizeBytes,
	})
	if uploadErr != nil {
		return "", uploadErr
	}
	uploadURL := asString(uploadResp["url"])
	key := asString(uploadResp["key"])
	if uploadURL == "" || key == "" {
		return "", errors.New("invalid blob upload URL response")
	}
	if err := syncUploadFileToSignedURLRetry(path, uploadURL, 3); err != nil {
		return "", err
	}
	return key, nil
}

func fetchMissingBlobHashesWithRetry(environmentID, kind string, hashes []string) ([]string, error) {
	var lastErr error
	backoff := 750 * time.Millisecond
	for attempt := 0; attempt < 4; attempt++ {
		missing, err := fetchMissingBlobHashes(environmentID, kind, hashes)
		if err == nil {
			return missing, nil
		}
		lastErr = err
		if !isRetryableSyncError(err) {
			return nil, err
		}
		if attempt < 3 {
			time.Sleep(backoff)
			if backoff < 4*time.Second {
				backoff *= 2
			}
		}
	}
	return nil, lastErr
}

func fetchMissingBlobHashes(environmentID, kind string, hashes []string) ([]string, error) {
	resp, err := syncDoJSON(http.MethodPost, "/sync/blobs/missing", map[string]any{
		"environment_id": environmentID,
		"kind":           kind,
		"hashes":         hashes,
	})
	if err != nil {
		return nil, err
	}

	missingAny, ok := resp["missing"].([]any)
	if !ok {
		return nil, errors.New("invalid missing blob response")
	}
	missing := make([]string, 0, len(missingAny))
	for _, rawHash := range missingAny {
		hash := asString(rawHash)
		if hash == "" {
			continue
		}
		missing = append(missing, hash)
	}
	return missing, nil
}

func isRetryableSyncError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		switch apiErr.status {
		case 408, 429, 502, 503, 504, 524:
			return true
		case 409:
			return strings.Contains(strings.ToLower(apiErr.detail), "not ready")
		default:
			return false
		}
	}

	var netErr net.Error
	if errors.As(err, &netErr) && (netErr.Timeout() || netErr.Temporary()) {
		return true
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset")
}

func formatDataSyncProgress(done, total int, phase string) string {
	if total == 0 {
		return "syncing data... [====================] 100% (0/0) up to date"
	}
	width := 20
	filled := int(float64(done) / float64(total) * float64(width))
	if filled > width {
		filled = width
	}
	bar := strings.Repeat("=", filled) + strings.Repeat(" ", width-filled)
	percent := int(float64(done) / float64(total) * 100)
	switch phase {
	case "checking":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) checking remote", bar, percent, done, total)
	case "uploading":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) uploading missing blobs", bar, percent, done, total)
	case "finalizing":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) finalizing", bar, percent, done, total)
	default:
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d)", bar, percent, done, total)
	}
}

type syncPhaseSpinner struct {
	options syncOptions
	done    chan struct{}
	stopped chan struct{}
	mu      sync.RWMutex
	message string
}

func newSyncPhaseSpinner(initialMessage string, options syncOptions) *syncPhaseSpinner {
	sp := &syncPhaseSpinner{
		options: options,
		done:    make(chan struct{}),
		stopped: make(chan struct{}),
		message: initialMessage,
	}
	if !options.logProgress {
		close(sp.stopped)
		return sp
	}
	if !options.dynamicStatus {
		fmt.Println(initialMessage)
		close(sp.stopped)
		return sp
	}

	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	go func() {
		defer close(sp.stopped)
		ticker := time.NewTicker(90 * time.Millisecond)
		defer ticker.Stop()
		frame := 0
		for {
			sp.mu.RLock()
			message := sp.message
			sp.mu.RUnlock()
			printStatusLine(frames[frame%len(frames)], message)
			frame++
			select {
			case <-sp.done:
				return
			case <-ticker.C:
			}
		}
	}()
	return sp
}

func (sp *syncPhaseSpinner) SetMessage(message string) {
	sp.mu.Lock()
	sp.message = message
	sp.mu.Unlock()
	if sp.options.logProgress && !sp.options.dynamicStatus {
		fmt.Println(message)
	}
}

func (sp *syncPhaseSpinner) StopSuccess(label string) {
	if !sp.options.logProgress {
		return
	}
	if sp.options.dynamicStatus {
		close(sp.done)
		<-sp.stopped
		fmt.Printf("\r\033[2K%s✓%s %s\n", cAmpGreen, cReset, label)
		return
	}
	fmt.Printf("%s✓%s %s\n", cAmpGreen, cReset, label)
}

func (sp *syncPhaseSpinner) StopError() {
	if !sp.options.dynamicStatus || !sp.options.logProgress {
		return
	}
	close(sp.done)
	<-sp.stopped
	clearStatusLine()
}

func uploadManifest(environmentID string, item preparedManifest) error {
	uploadResp, err := syncDoJSON(http.MethodPost, "/sync/manifests/upload-url", map[string]any{
		"environment_id": environmentID,
		"kind":           item.kind,
		"manifest_hash":  item.hash,
		"size_bytes":     len(item.raw),
	})
	if err != nil {
		return err
	}
	uploadURL := asString(uploadResp["url"])
	key := asString(uploadResp["key"])
	if uploadURL == "" {
		return errors.New("invalid manifest upload URL response")
	}
	if key == "" {
		return errors.New("invalid manifest upload URL response")
	}
	if err := syncUploadBytesToSignedURLRetry(item.raw, uploadURL, "application/json", 3); err != nil {
		return err
	}
	return nil
}

func uniqueSortedHashes(entries []syncManifestEntry) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.SHA256 == "" {
			continue
		}
		if _, exists := seen[entry.SHA256]; exists {
			continue
		}
		seen[entry.SHA256] = struct{}{}
		out = append(out, entry.SHA256)
	}
	sort.Strings(out)
	return out
}

func manifestSizesByHash(entries []syncManifestEntry) map[string]int64 {
	out := make(map[string]int64, len(entries))
	for _, entry := range entries {
		if entry.SHA256 == "" || entry.Size <= 0 {
			continue
		}
		if _, exists := out[entry.SHA256]; exists {
			continue
		}
		out[entry.SHA256] = entry.Size
	}
	return out
}

func fileSHA256(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()

	hasher := sha256.New()
	size, err := io.Copy(hasher, file)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hasher.Sum(nil)), size, nil
}

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
		envID := asString(run["env_id"])
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
	envID := strings.TrimSpace(asString(resp["env_id"]))
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

func resolveEnvironmentID() (string, error) {
	linkedEnvironmentID, err := loadLinkedEnvironmentID()
	if err != nil {
		return "", err
	}
	if linkedEnvironmentID != "" {
		return linkedEnvironmentID, nil
	}

	resp, err := doJSON(http.MethodGet, "/environments", nil)
	if err != nil {
		return "", err
	}

	raw, ok := resp["environments"].([]any)
	if !ok {
		return "", errors.New("invalid environments response")
	}
	if len(raw) == 0 {
		return "", errors.New("no environments found; run `tahuna init .` first")
	}
	return "", errors.New("no linked environment in this project; run `tahuna init .` first")
}

func projectEnvironmentFilePath() string {
	return filepath.Join(projectStateDir, projectEnvIDFile)
}

type projectConfig struct {
	DataDir            string
	OutputDir          string
	ConfigYAMLPath     string
	TrainEntrypoint    string
	PythonProjectFile  string
	UVLockFile         string
	Framework          string
	PythonVersion      string
}

func collectProjectInitConfig() (projectConfig, string, error) {
	cfg := projectConfig{
		DataDir:            "data",
		OutputDir:          "outputs",
		ConfigYAMLPath:     "config.yaml",
		TrainEntrypoint:    "train.py",
		PythonProjectFile:  "pyproject.toml",
		UVLockFile:         "uv.lock",
	}

	if fileExists(cfg.TrainEntrypoint) {
		fmt.Printf("✓ Found %s%s%s\n", cAmpGold, cfg.TrainEntrypoint, cReset)
		cfg.TrainEntrypoint = choosePathWhenFound("Entrypoint script", cfg.TrainEntrypoint, "train.py")
	} else {
		fmt.Printf("%s?%s No train.py found\n", cAmpGold, cReset)
		cfg.TrainEntrypoint = choosePathWhenMissing("Entrypoint script", "train.py")
	}

	if dirExists(cfg.DataDir) {
		fmt.Printf("✓ Found %s%s/%s\n", cAmpGold, cfg.DataDir, cReset)
		cfg.DataDir = choosePathWhenFound("Data directory", cfg.DataDir, "data")
	} else {
		fmt.Printf("%s?%s No data/ directory\n", cAmpGold, cReset)
		cfg.DataDir = choosePathWhenMissing("Data directory", "data")
	}

	if dirExists(cfg.OutputDir) {
		fmt.Printf("✓ Found %s%s/%s\n", cAmpGold, cfg.OutputDir, cReset)
		cfg.OutputDir = choosePathWhenFound("Output directory", cfg.OutputDir, "outputs")
	} else {
		fmt.Printf("%s?%s No outputs/ directory\n", cAmpGold, cReset)
		cfg.OutputDir = choosePathWhenMissing("Output directory", "outputs")
	}

	if fileExists("config.yaml") {
		cfg.ConfigYAMLPath = "config.yaml"
		fmt.Printf("✓ Found %sconfig.yaml%s\n", cAmpGold, cReset)
		cfg.ConfigYAMLPath = choosePathWhenFound("Config file", cfg.ConfigYAMLPath, "config.yaml")
	} else if fileExists("config.yml") {
		cfg.ConfigYAMLPath = "config.yml"
		fmt.Printf("✓ Found %sconfig.yml%s\n", cAmpGold, cReset)
		cfg.ConfigYAMLPath = choosePathWhenFound("Config file", cfg.ConfigYAMLPath, "config.yaml")
	} else {
		fmt.Printf("%s?%s No config yaml found\n", cAmpGold, cReset)
		cfg.ConfigYAMLPath = choosePathWhenMissing("Config file", "config.yaml")
	}

	if fileExists(cfg.PythonProjectFile) {
		fmt.Printf("✓ Found %spyproject.toml%s\n", cAmpGold, cReset)
		cfg.PythonProjectFile = choosePathWhenFound("Python project file", cfg.PythonProjectFile, "pyproject.toml")
	} else {
		fmt.Printf("%s?%s No pyproject.toml found\n", cAmpGold, cReset)
		cfg.PythonProjectFile = choosePathWhenMissing("Python project file", "pyproject.toml")
	}
	if filepath.Base(cfg.PythonProjectFile) != "pyproject.toml" {
		return cfg, "", fmt.Errorf("python project file must be named pyproject.toml (got %s)", filepath.Base(cfg.PythonProjectFile))
	}

	if fileExists(cfg.UVLockFile) {
		fmt.Printf("✓ Found %suv.lock%s\n", cAmpGold, cReset)
		cfg.UVLockFile = choosePathWhenFound("uv lock file", cfg.UVLockFile, "uv.lock")
	} else {
		fmt.Printf("%s?%s No uv.lock found\n", cAmpGold, cReset)
		cfg.UVLockFile = choosePathWhenMissing("uv lock file", "uv.lock")
	}

	framework := detectFramework(cfg)
	if framework == "" {
		framework = promptChoice("No framework detected. PyTorch or TensorFlow?", []string{"pt", "tf"}, 0)
	} else {
		fmt.Printf("✓ Detected framework %s%s%s\n", cAmpGold, framework, cReset)
	}
	cfg.Framework = framework
	cfg.PythonVersion = detectPythonVersion(cfg)
	if strings.TrimSpace(cfg.PythonVersion) == "" {
		cfg.PythonVersion = "3.11"
	}

	return cfg, framework, nil
}

func choosePathWhenFound(label, detectedPath, defaultCreatePath string) string {
	choice := promptChoice(
		label,
		[]string{
			fmt.Sprintf("%s (detected)", detectedPath),
			"Enter path",
			"Create new",
		},
		0,
	)
	if choice == fmt.Sprintf("%s (detected)", detectedPath) {
		return detectedPath
	}
	if choice == "Create new" {
		return promptPath(label+" path", defaultCreatePath)
	}
	return promptPath(label+" path", detectedPath)
}

func choosePathWhenMissing(label, defaultCreatePath string) string {
	choice := promptChoice(
		label,
		[]string{
			fmt.Sprintf("Create %s", defaultCreatePath),
			"Enter path",
		},
		0,
	)
	if choice == "Enter path" {
		return promptPath(label+" path", defaultCreatePath)
	}
	return filepath.Clean(defaultCreatePath)
}

func promptPath(label, defaultValue string) string {
	value := strings.TrimSpace(promptString(label, defaultValue))
	if value == "" {
		value = defaultValue
	}
	return filepath.Clean(value)
}

func detectFramework(cfg projectConfig) string {
	if cfg.PythonProjectFile == "" {
		return ""
	}
	raw, err := os.ReadFile(cfg.PythonProjectFile)
	if err != nil {
		return ""
	}
	lower := strings.ToLower(string(raw))
	if strings.Contains(lower, "tensorflow") || strings.Contains(lower, "keras") {
		return "tf"
	}
	if strings.Contains(lower, "torch") || strings.Contains(lower, "pytorch") {
		return "pt"
	}
	return ""
}

func detectPythonVersion(cfg projectConfig) string {
	readAndExtract := func(path string) string {
		if strings.TrimSpace(path) == "" {
			return ""
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return ""
		}
		return extractPythonVersionFromText(string(raw))
	}

	if version := readAndExtract(cfg.UVLockFile); version != "" {
		return version
	}
	return readAndExtract(cfg.PythonProjectFile)
}

func extractPythonVersionFromText(text string) string {
	lower := strings.ToLower(text)
	lines := strings.Split(lower, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "requires-python") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx < 0 || idx+1 >= len(line) {
			continue
		}
		value := strings.TrimSpace(strings.Trim(line[idx+1:], `"'`))
		for i := 0; i+3 <= len(value); i++ {
			ch := value[i]
			if ch < '0' || ch > '9' {
				continue
			}
			segment := value[i:]
			if len(segment) < 3 {
				continue
			}
			if segment[1] == '.' && segment[0] >= '0' && segment[0] <= '9' && segment[2] >= '0' && segment[2] <= '9' {
				return segment[:3]
			}
			if len(segment) >= 4 && segment[1] >= '0' && segment[1] <= '9' && segment[2] == '.' && segment[3] >= '0' && segment[3] <= '9' {
				return segment[:4]
			}
		}
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func projectConfigFilePath() string {
	return filepath.Join(projectStateDir, projectCfgFile)
}

func saveProjectConfig(cfg projectConfig) error {
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	body := fmt.Sprintf(
		"entrypoint: %q\ndata_dir: %q\noutput_dir: %q\nconfig_file: %q\npython_project_file: %q\nuv_lock_file: %q\nframework: %q\npython_version: %q\n",
		cfg.TrainEntrypoint,
		cfg.DataDir,
		cfg.OutputDir,
		cfg.ConfigYAMLPath,
		cfg.PythonProjectFile,
		cfg.UVLockFile,
		cfg.Framework,
		cfg.PythonVersion,
	)
	return os.WriteFile(projectConfigFilePath(), []byte(body), 0o600)
}

func loadProjectConfig() (projectConfig, error) {
	cfg := projectConfig{
		DataDir:            "data",
		OutputDir:          "outputs",
		ConfigYAMLPath:     "config.yaml",
		TrainEntrypoint:    "train.py",
		PythonProjectFile:  "pyproject.toml",
		UVLockFile:         "uv.lock",
		PythonVersion:      "3.11",
	}

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}

	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		parts := strings.SplitN(trimmed, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, "\"")

		switch key {
		case "entrypoint":
			if value != "" {
				cfg.TrainEntrypoint = filepath.Clean(value)
			}
		case "data_dir":
			if value != "" {
				cfg.DataDir = filepath.Clean(value)
			}
		case "output_dir":
			if value != "" {
				cfg.OutputDir = filepath.Clean(value)
			}
		case "config_yaml", "config_file":
			if value != "" {
				cfg.ConfigYAMLPath = filepath.Clean(value)
			}
		case "train_entrypoint":
			if value != "" {
				cfg.TrainEntrypoint = filepath.Clean(value)
			}
		case "python_project_file":
			if value != "" {
				cfg.PythonProjectFile = filepath.Clean(value)
			}
		case "uv_lock_file":
			if value != "" {
				cfg.UVLockFile = filepath.Clean(value)
			}
		case "framework":
			if value != "" {
				cfg.Framework = value
			}
		case "python_version":
			if value != "" {
				cfg.PythonVersion = value
			}
		case "requirements":
			// Legacy key kept for backward compatibility with older project configs.
		}
	}

	return cfg, nil
}

func ensureProjectFile(path, content string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func defaultConfigYAMLTemplate(cfg projectConfig) string {
	return fmt.Sprintf("project: %q\nentrypoint: %q\ndata:\n  path: %q\n", filepath.Base(mustGetwd()), cfg.TrainEntrypoint, cfg.DataDir)
}

func defaultPyProjectTemplate(framework string) string {
	dependency := "torch"
	if framework == "tf" {
		dependency = "tensorflow"
	}
	return fmt.Sprintf("[project]\nname = %q\nversion = \"0.1.0\"\nrequires-python = \">=3.11\"\ndependencies = [\n  %q,\n]\n", filepath.Base(mustGetwd()), dependency)
}

func ensureUVLockFile(pyprojectPath, uvLockPath string) error {
	if strings.TrimSpace(uvLockPath) == "" {
		return nil
	}
	if fileExists(uvLockPath) {
		return nil
	}

	projectPath := strings.TrimSpace(pyprojectPath)
	if projectPath == "" {
		projectPath = "pyproject.toml"
	}
	projectDir := filepath.Dir(projectPath)
	if projectDir == "" {
		projectDir = "."
	}
	if !fileExists(projectPath) {
		return fmt.Errorf("pyproject.toml not found at %s", projectPath)
	}
	if filepath.Base(projectPath) != "pyproject.toml" {
		return fmt.Errorf("python project file must be named pyproject.toml (got %s)", filepath.Base(projectPath))
	}

	cmd := exec.Command("uv", "lock", "--project", projectDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return errors.New("uv is not installed; install uv and rerun `tahuna init`")
		}
		trimmed := strings.TrimSpace(string(output))
		if trimmed == "" {
			return fmt.Errorf("uv lock failed: %w", err)
		}
		return fmt.Errorf("uv lock failed: %s", trimmed)
	}

	generatedLockPath := filepath.Join(projectDir, "uv.lock")
	targetLockPath := filepath.Clean(uvLockPath)
	if targetLockPath == generatedLockPath {
		return nil
	}

	content, readErr := os.ReadFile(generatedLockPath)
	if readErr != nil {
		return fmt.Errorf("failed to read generated uv.lock: %w", readErr)
	}
	lockDir := filepath.Dir(targetLockPath)
	if lockDir != "." && lockDir != "" {
		if mkdirErr := os.MkdirAll(lockDir, 0o755); mkdirErr != nil {
			return fmt.Errorf("failed to create directory for uv.lock: %w", mkdirErr)
		}
	}
	return os.WriteFile(targetLockPath, content, 0o644)
}

func defaultTrainEntrypointTemplate(cfg projectConfig) string {
	return fmt.Sprintf("print(\"Tahuna training entrypoint\")\nprint(\"data dir: %s\")\n", cfg.DataDir)
}

func mustGetwd() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}

func saveLinkedEnvironmentID(environmentID string) error {
	if strings.TrimSpace(environmentID) == "" {
		return errors.New("environment id is empty")
	}
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	content := strings.TrimSpace(environmentID) + "\n"
	return os.WriteFile(projectEnvironmentFilePath(), []byte(content), 0o600)
}

func loadLinkedEnvironmentID() (string, error) {
	raw, err := os.ReadFile(projectEnvironmentFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

func clearLinkedEnvironmentIDIfMatches(environmentID string) error {
	environmentID = strings.TrimSpace(environmentID)
	if environmentID == "" {
		return nil
	}
	linkedID, err := loadLinkedEnvironmentID()
	if err != nil {
		return err
	}
	if linkedID == "" || linkedID != environmentID {
		return nil
	}
	if err := os.Remove(projectEnvironmentFilePath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func printTrainRunSummary(resp map[string]any) {
	runID := asString(resp["run_id"])
	envID := asString(resp["env_id"])
	status := asString(resp["status"])
	if status == "" {
		status = "queued"
	}

	fmt.Printf("%s✓%s Run created: %s\n", cAmpGreen, cReset, runID)
	fmt.Printf("Environment: %s\n", envID)
	fmt.Printf("Status: %s\n", status)
}

func printSuccessLine(message string) {
	fmt.Printf("%s✓%s %s\n", cAmpGreen, cReset, message)
}

func monitorRun(runID string, interval int) error {
	return monitorRunWithOptions(runID, interval, false)
}

func monitorRunWithLogs(runID string, interval int) error {
	return monitorRunWithOptions(runID, interval, true)
}

func monitorRunWithOptions(runID string, interval int, streamLogs bool) error {
	dynamic := supportsDynamicStatus()
	if streamLogs {
		dynamic = false
	}
	anchored := false
	headerPrinted := false
	lastStatus := ""
	seenLogLines := map[string]struct{}{}
	logFetchWarned := false
	monitorStartedAt := time.Now()
	lastLogSeenAt := monitorStartedAt
	lastNoLogHintAt := time.Time{}

	for {
		resp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			return err
		}
		status := asString(resp["status"])
		if status == "" {
			status = "queued"
		}
		errMsg := asString(resp["error"])

		if streamLogs {
			if !headerPrinted {
				printPanel(
					"Tahuna",
					[]string{
						fmt.Sprintf("%s>%s Tahuna train", cAmpGold, cReset),
						"",
						fmt.Sprintf("  %sMonitoring run lifecycle...%s", cAmpMuted, cReset),
						fmt.Sprintf("  %s>%s Run ID %s", cAmpGreen, cReset, runID),
						fmt.Sprintf("  %s>%s Dashboard %s", cAmpGreen, cReset, runDashboardURL(runID)),
					},
					"",
					"",
				)
				headerPrinted = true
			}
			if status != lastStatus {
				fmt.Printf("Status: %s\n", status)
				lastStatus = status
			}

			logResp, logErr := doJSON(http.MethodGet, "/runs/"+runID+"/logs", nil)
			if logErr != nil {
				if !logFetchWarned {
					fmt.Printf("%swarning:%s unable to stream logs yet (%v)\n", cAmpGold, cReset, logErr)
					logFetchWarned = true
				}
			} else {
				newLogCount := 0
				for _, line := range parseRecentRunLogs(logResp) {
					key := runtimeLogLineKey(line)
					if _, exists := seenLogLines[key]; exists {
						continue
					}
					seenLogLines[key] = struct{}{}
					fmt.Println(formatRuntimeLogLine(line))
					newLogCount++
				}
				if newLogCount > 0 {
					lastLogSeenAt = time.Now()
					lastNoLogHintAt = time.Time{}
				}
				if newLogCount == 0 && !isTerminalRunStatus(status) {
					silentFor := time.Since(lastLogSeenAt)
					if silentFor >= 30*time.Second && (lastNoLogHintAt.IsZero() || time.Since(lastNoLogHintAt) >= 30*time.Second) {
						fmt.Printf(
							"%sinfo:%s waiting for runtime logs (%ds since last log, %ds since monitor start)\n",
							cAmpMuted,
							cReset,
							int(silentFor.Seconds()),
							int(time.Since(monitorStartedAt).Seconds()),
						)
						lastNoLogHintAt = time.Now()
					}
				}
			}

			if isTerminalRunStatus(status) {
				if errMsg != "" {
					fmt.Printf("%sError:%s %s\n", cAmpRed, cReset, errMsg)
				}
				break
			}
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		if dynamic {
			if anchored {
				// Restore cursor to the first run panel render and clear below it.
				fmt.Print("\033[u\033[J")
			} else {
				// Save cursor so subsequent updates can redraw in place.
				fmt.Print("\033[s")
				anchored = true
			}
		}

		printRunPanel(runID, status, errMsg)
		if isTerminalRunStatus(status) {
			break
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return nil
}

func printRunPanel(runID, status, errMsg string) {
	statusColor := cAmpGold
	if status == "running" || status == "completed" {
		statusColor = cAmpGreen
	}
	lines := []string{
		fmt.Sprintf("%s>%s Tahuna run watch --id %s", cAmpGold, cReset, runID),
		"",
		fmt.Sprintf("  %sMonitoring run lifecycle...%s", cAmpMuted, cReset),
		"",
		fmt.Sprintf("  %s✓%s Status %s%s%s", cAmpGreen, cReset, statusColor, status, cReset),
		fmt.Sprintf("  %s>%s Last update %s", cAmpGreen, cReset, time.Now().Format(time.RFC3339)),
	}
	if errMsg != "" {
		lines = append(lines, fmt.Sprintf("  %s>%s Error %s", cAmpGold, cReset, errMsg))
	}
	printPanel("Tahuna", lines, "", "")
}

func printPanel(title string, lines []string, leftFooter, rightFooter string) {
	width := panelWidth()
	border := strings.Repeat("─", width-2)

	fmt.Printf("\n%s╭%s╮%s\n", cAmpTeal, border, cReset)
	printPanelLine(width, fmt.Sprintf("%s● ● ●%s  %s%s%s", cAmpMuted, cReset, cAmpText, title, cReset))
	fmt.Printf("%s├%s┤%s\n", cAmpTeal, border, cReset)
	for _, line := range lines {
		printPanelLine(width, line)
	}
	if strings.TrimSpace(leftFooter) != "" || strings.TrimSpace(rightFooter) != "" {
		fmt.Printf("%s├%s┤%s\n", cAmpTeal, border, cReset)
		footerGap := width - 4 - visibleLen(leftFooter) - visibleLen(rightFooter)
		if footerGap < 1 {
			footerGap = 1
		}
		printPanelLine(width, leftFooter+strings.Repeat(" ", footerGap)+rightFooter)
	}
	fmt.Printf("%s╰%s╯%s\n", cAmpTeal, border, cReset)
}

func printPanelLine(width int, content string) {
	space := width - 6 - visibleLen(content)
	if space < 0 {
		space = 0
	}
	fmt.Printf("%s│%s  %s%s  %s│%s\n", cAmpTeal, cReset, content, strings.Repeat(" ", space), cAmpTeal, cReset)
}

func visibleLen(s string) int {
	n := 0
	for i := 0; i < len(s); {
		if s[i] == 0x1b {
			for i < len(s) && s[i] != 'm' {
				i++
			}
			if i < len(s) {
				i++
			}
			continue
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		n++
		i += size
	}
	return n
}

func panelWidth() int {
	cols := terminalColumns()
	if cols <= 0 {
		cols = 100
	}

	// Keep the panel readable on small terminals and avoid getting too wide.
	width := cols - 2
	if width < 72 {
		width = 72
	}
	if width > 120 {
		width = 120
	}
	return width
}

func terminalColumns() int {
	if v := strings.TrimSpace(os.Getenv("COLUMNS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}

	type winsize struct {
		Row    uint16
		Col    uint16
		Xpixel uint16
		Ypixel uint16
	}
	ws := winsize{}
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		uintptr(os.Stdout.Fd()),
		uintptr(syscall.TIOCGWINSZ),
		uintptr(unsafe.Pointer(&ws)),
	)
	if errno == 0 && ws.Col > 0 {
		return int(ws.Col)
	}
	return 0
}

type catalogGPU struct {
	ID           string
	DisplayName  string
	MaxGPUCount  int
	MemoryGB     int
	PricePerHour float64
}

func parseCatalogGPUs(resp map[string]any) []catalogGPU {
	gpuRaw, ok := resp["gpus"].([]any)
	if !ok {
		return nil
	}
	gpus := make([]catalogGPU, 0, len(gpuRaw))
	for _, raw := range gpuRaw {
		switch row := raw.(type) {
		case map[string]any:
			id := strings.TrimSpace(asString(row["id"]))
			display := strings.TrimSpace(asString(row["display_name"]))
			if display == "" {
				display = id
			}
			if id == "" {
				id = display
			}
			if id == "" {
				continue
			}
			price, _ := asFloat64(row["price_per_hour"])
			gpus = append(gpus, catalogGPU{
				ID:           id,
				DisplayName:  display,
				MaxGPUCount:  int(asInt64(row["max_gpu_count"])),
				MemoryGB:     int(asInt64(row["memory_gb"])),
				PricePerHour: price,
			})
		default:
			id := strings.TrimSpace(asString(raw))
			if id == "" {
				continue
			}
			gpus = append(gpus, catalogGPU{
				ID:           id,
				DisplayName:  id,
				MaxGPUCount:  0,
				MemoryGB:     0,
				PricePerHour: 0,
			})
		}
	}
	sort.Slice(gpus, func(i, j int) bool {
		return strings.ToLower(gpus[i].DisplayName) < strings.ToLower(gpus[j].DisplayName)
	})
	return gpus
}

func fetchCatalog() ([]string, map[string][]string, error) {
	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	if err != nil {
		return nil, nil, err
	}
	parsedGpus := parseCatalogGPUs(resp)
	if len(parsedGpus) == 0 {
		return nil, nil, errors.New("invalid catalog response: gpus missing")
	}
	gpus := make([]string, 0, len(parsedGpus))
	for _, gpu := range parsedGpus {
		gpus = append(gpus, gpu.ID)
	}

	imagesRaw, ok := resp["images"].(map[string]any)
	if !ok {
		return nil, nil, errors.New("invalid catalog response: images missing")
	}

	versionsByFramework := map[string][]string{}
	for framework, versionsAny := range imagesRaw {
		versionsMap, ok := versionsAny.(map[string]any)
		if !ok {
			continue
		}
		versions := make([]string, 0, len(versionsMap))
		for v := range versionsMap {
			versions = append(versions, v)
		}
		sort.Strings(versions)
		versionsByFramework[framework] = versions
	}
	return gpus, versionsByFramework, nil
}

func fetchCatalogGPUByID() (map[string]catalogGPU, error) {
	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	if err != nil {
		return nil, err
	}
	entries := parseCatalogGPUs(resp)
	if len(entries) == 0 {
		return nil, errors.New("invalid catalog response: gpus missing")
	}
	out := make(map[string]catalogGPU, len(entries))
	for _, entry := range entries {
		out[strings.ToLower(strings.TrimSpace(entry.ID))] = entry
		if strings.TrimSpace(entry.DisplayName) != "" {
			out[strings.ToLower(strings.TrimSpace(entry.DisplayName))] = entry
		}
	}
	return out, nil
}

func validateGPUSelection(gpuType string, gpuCount int) error {
	trimmedType := strings.TrimSpace(gpuType)
	if trimmedType == "" || gpuCount <= 0 {
		return nil
	}
	entries, err := fetchCatalogGPUByID()
	if err != nil {
		return nil
	}
	entry, ok := entries[strings.ToLower(trimmedType)]
	if !ok {
		return fmt.Errorf("GPU type %q is not available. Run `tahuna catalog gpus`.", trimmedType)
	}
	if entry.MaxGPUCount > 0 && gpuCount > entry.MaxGPUCount {
		return fmt.Errorf("Max GPU count for %s is %d.", trimmedType, entry.MaxGPUCount)
	}
	return nil
}

func resolveEffectiveGPUTypeForEnvironment(environmentID, overrideType string) (string, error) {
	if strings.TrimSpace(overrideType) != "" {
		return strings.TrimSpace(overrideType), nil
	}
	resp, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(asString(resp["gpu_type"])), nil
}

func humanSize(bytes int64) string {
	if bytes <= 0 {
		return "0B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(bytes)
	unit := 0
	for size >= 1024 && unit < len(units)-1 {
		size /= 1024
		unit++
	}
	if unit == 0 {
		return fmt.Sprintf("%d%s", int64(size), units[unit])
	}
	return fmt.Sprintf("%.1f%s", size, units[unit])
}

func promptString(label, defaultValue string) string {
	validate := func(input string) error {
		if strings.TrimSpace(input) == "" && defaultValue == "" {
			return errors.New("value is required")
		}
		return nil
	}

	prompt := promptui.Prompt{
		Label:    label,
		Default:  defaultValue,
		Validate: validate,
		Templates: &promptui.PromptTemplates{
			Prompt:  "{{ . }} ",
			Success: "✓ {{ . }} ",
		},
	}

	value, err := prompt.Run()
	must(err)
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultValue
	}
	return value
}

func promptInt(label string, defaultValue int) int {
	for {
		raw := promptString(label, strconv.Itoa(defaultValue))
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 {
			fmt.Println("Please enter a valid positive number.")
			continue
		}
		return value
	}
}

func promptChoice(label string, options []string, defaultIndex int) string {
	if len(options) == 0 {
		must(errors.New("no options available for " + label))
	}
	prompt := promptui.Select{
		Label:     label,
		Items:     options,
		CursorPos: defaultIndex,
		HideHelp:  true,
		Size:      10,
		Templates: &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   fmt.Sprintf("%s>%s {{ . }}", cAmpGold, cReset),
			Inactive: fmt.Sprintf("%s  {{ . }}%s", cAmpMuted, cReset),
			Selected: "✓ {{ .Label }}: {{ . }}",
		},
	}
	_, value, err := prompt.Run()
	must(err)
	return value
}

func sortedKeys(m map[string][]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func uploadFileToSignedURL(path, rawURL string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPut, rawURL, file)
	if err != nil {
		return err
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return &uploadRequestError{
			status: resp.StatusCode,
			detail: strings.TrimSpace(string(raw)),
		}
	}
	return nil
}

func uploadFileToSignedURLWithRetry(path, rawURL string, attempts int) error {
	var lastErr error
	for i := 1; i <= attempts; i++ {
		if err := uploadFileToSignedURL(path, rawURL); err == nil {
			return nil
		} else {
			lastErr = err
			if !isRetryableUploadError(err) {
				return err
			}
		}
		if i < attempts {
			time.Sleep(time.Duration(1<<(i-1)) * time.Second)
		}
	}
	return lastErr
}

func uploadBytesToSignedURL(raw []byte, rawURL, contentType string) error {
	req, err := http.NewRequest(http.MethodPut, rawURL, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.ContentLength = int64(len(raw))
	req.Header.Set("Content-Length", strconv.Itoa(len(raw)))
	if strings.TrimSpace(contentType) != "" {
		req.Header.Set("Content-Type", contentType)
	}

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return &uploadRequestError{
			status: resp.StatusCode,
			detail: strings.TrimSpace(string(body)),
		}
	}
	return nil
}

func uploadBytesToSignedURLWithRetry(raw []byte, rawURL, contentType string, attempts int) error {
	var lastErr error
	for i := 1; i <= attempts; i++ {
		if err := uploadBytesToSignedURL(raw, rawURL, contentType); err == nil {
			return nil
		} else {
			lastErr = err
			if !isRetryableUploadError(err) {
				return err
			}
		}
		if i < attempts {
			time.Sleep(time.Duration(1<<(i-1)) * time.Second)
		}
	}
	return lastErr
}

type uploadRequestError struct {
	status int
	detail string
}

func (e *uploadRequestError) Error() string {
	return fmt.Sprintf("upload failed (%d): %s", e.status, e.detail)
}

func isRetryableUploadError(err error) bool {
	if err == nil {
		return false
	}
	var uploadErr *uploadRequestError
	if errors.As(err, &uploadErr) {
		switch uploadErr.status {
		case 408, 429:
			return true
		default:
			return uploadErr.status >= 500
		}
	}
	var netErr net.Error
	if errors.As(err, &netErr) && (netErr.Timeout() || netErr.Temporary()) {
		return true
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset")
}

type apiRequestError struct {
	status int
	detail string
}

func (e *apiRequestError) Error() string {
	return fmt.Sprintf("api error (%d): %s", e.status, e.detail)
}

func friendlyError(err error) string {
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		detail := strings.ToLower(apiErr.detail)
		switch {
		case apiErr.status == 401 && strings.Contains(detail, "expired"):
			return "Session expired. Run `tahuna login` to re-authenticate."
		case apiErr.status == 401:
			return "Not authenticated. Run `tahuna login` first."
		case apiErr.status == 403:
			return "Access denied."
		case apiErr.status == 404 && strings.Contains(detail, "environment"):
			return "Environment not found."
		case apiErr.status == 404 && strings.Contains(detail, "run"):
			return "Run not found."
		case apiErr.status == 404:
			return "Resource not found."
		case apiErr.status == 409:
			return apiErr.detail
		case apiErr.status == 400:
			return apiErr.detail
		case apiErr.status >= 500:
			return "Something went wrong. Try again or check status."
		}
		return ""
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return "Cannot reach Tahuna backend. Check your connection."
	}
	return ""
}

func doJSON(method, path string, payload map[string]any) (map[string]any, error) {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}

	baseURL := apiURL()
	requestPath := normalizedAPIPath(path)
	if strings.HasSuffix(baseURL, apiPrefix) {
		requestPath = strings.TrimPrefix(requestPath, apiPrefix)
		if requestPath == "" {
			requestPath = "/"
		}
	}

	req, err := http.NewRequest(method, baseURL+requestPath, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := lookupConfigValue("TAHUNA_API_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var out map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			snippet := strings.TrimSpace(string(raw))
			if len(snippet) > 140 {
				snippet = snippet[:140] + "..."
			}
			return nil, fmt.Errorf(
				"api response was not JSON (%s %s -> %d). check TAHUNA_API_URL and that Tahuna web+convex are running. body starts with: %q",
				method,
				baseURL+requestPath,
				resp.StatusCode,
				snippet,
			)
		}
	} else {
		out = map[string]any{}
	}

	if resp.StatusCode >= 400 {
		msg := asString(out["detail"])
		if msg == "" {
			msg = string(raw)
		}
		return nil, &apiRequestError{
			status: resp.StatusCode,
			detail: msg,
		}
	}

	return out, nil
}

func lookupConfigValue(key string) string {
	if key == "" {
		return ""
	}
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}

	for _, path := range candidateEnvFiles() {
		if v, ok := readKeyFromEnvFile(path, key); ok {
			return v
		}
	}
	return ""
}

func candidateEnvFiles() []string {
	candidates := []string{}
	seen := map[string]struct{}{}
	add := func(path string) {
		if path == "" {
			return
		}
		clean := filepath.Clean(path)
		if _, ok := seen[clean]; ok {
			return
		}
		seen[clean] = struct{}{}
		candidates = append(candidates, clean)
	}

	// Primary CLI config file (global, CLI-only).
	add(defaultEnvFilePath())

	return candidates
}

func readKeyFromEnvFile(path, key string) (string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	prefix := key + "="
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if !strings.HasPrefix(trimmed, prefix) {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
		value = strings.Trim(value, `"'`)
		if value == "" {
			return "", false
		}
		return value, true
	}
	return "", false
}

func normalizedAPIPath(path string) string {
	if path == "" {
		return apiPrefix
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if strings.HasPrefix(path, apiPrefix+"/") || path == apiPrefix {
		return path
	}
	return apiPrefix + path
}

func browserBaseURL() string {
	if v := lookupConfigValue("TAHUNA_BROWSER_URL"); v != "" {
		base := strings.TrimRight(v, "/")
		if strings.HasSuffix(base, apiPrefix) {
			base = strings.TrimSuffix(base, apiPrefix)
		}
		return base
	}

	base := strings.TrimRight(apiURL(), "/")
	if strings.HasSuffix(base, apiPrefix) {
		base = strings.TrimSuffix(base, apiPrefix)
	}
	// Convex backend hosts serve /api routes but not Next.js app routes like /auth/cli.
	// Default to local web app URL unless browser base is explicitly configured.
	if strings.Contains(base, ".convex.cloud") {
		return defaultAPIURL
	}
	return base
}

func runDashboardURL(runID string) string {
	base := strings.TrimRight(browserBaseURL(), "/")
	if strings.TrimSpace(runID) == "" {
		return base + "/dashboard"
	}
	return fmt.Sprintf("%s/dashboard/runs/%s", base, neturl.QueryEscape(runID))
}

func resolveLoginBrowserBaseURL() string {
	if v := lookupConfigValue("TAHUNA_BROWSER_URL"); strings.TrimSpace(v) != "" {
		return cleanBrowserBaseURL(v)
	}

	candidates := loginBrowserCandidates()
	for _, candidate := range candidates {
		if loginRouteAvailable(candidate) {
			return candidate
		}
	}

	if len(candidates) > 0 {
		return candidates[0]
	}
	return defaultAPIURL
}

func loginBrowserCandidates() []string {
	rawCandidates := []string{browserBaseURL(), defaultAPIURL}
	candidates := []string{}
	seen := map[string]struct{}{}
	for _, raw := range rawCandidates {
		clean := cleanBrowserBaseURL(raw)
		if clean == "" {
			continue
		}
		if _, exists := seen[clean]; exists {
			continue
		}
		seen[clean] = struct{}{}
		candidates = append(candidates, clean)
	}
	return candidates
}

func cleanBrowserBaseURL(raw string) string {
	base := strings.TrimSpace(strings.TrimRight(raw, "/"))
	if strings.HasSuffix(base, apiPrefix) {
		base = strings.TrimSuffix(base, apiPrefix)
	}
	return base
}

func loginRouteAvailable(base string) bool {
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodGet, cleanBrowserBaseURL(base)+"/auth/cli", nil)
	if err != nil {
		return false
	}

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return !strings.Contains(strings.ToLower(string(body)), "no matching routes found")
}

func saveConfigValues(values map[string]string) error {
	if len(values) == 0 {
		return nil
	}

	path := defaultEnvFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	existing, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	filtered := []string{}
	if len(existing) > 0 {
		for _, line := range strings.Split(string(existing), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}

			skip := false
			for key := range values {
				if strings.HasPrefix(trimmed, key+"=") {
					skip = true
					break
				}
			}
			if skip {
				continue
			}
			filtered = append(filtered, line)
		}
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := strings.TrimSpace(values[key])
		if value == "" {
			continue
		}
		filtered = append(filtered, key+"="+value)
	}

	output := strings.Join(filtered, "\n")
	if output != "" && !strings.HasSuffix(output, "\n") {
		output += "\n"
	}

	return os.WriteFile(path, []byte(output), 0o600)
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	s, ok := v.(string)
	if ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func require(condition bool, msg string) {
	if condition {
		return
	}
	must(errors.New(msg))
}

func must(err error) {
	if err == nil {
		return
	}
	if msg := friendlyError(err); msg != "" {
		fmt.Fprintln(os.Stderr, "error:", msg)
	} else {
		fmt.Fprintln(os.Stderr, "error:", err)
	}
	os.Exit(1)
}
