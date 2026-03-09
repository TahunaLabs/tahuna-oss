package main

import (
	"bufio"
	"bytes"
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

func main() {
	if len(os.Args) < 2 {
		usage()
		return
	}

	switch os.Args[1] {
	case "env", "environment":
		handleEnvironment(os.Args[2:])
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
  tahuna env list|show|delete ...
  tahuna run create|list|show|watch|logs|delete ...
  tahuna up
  tahuna version

Environment:
  TAHUNA_API_URL      API base URL (default: http://localhost:3000)
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
	authURL := fmt.Sprintf("%s/auth/cli?state=%s&callback=%s",
		resolvedBrowserBase,
		neturl.QueryEscape(state),
		neturl.QueryEscape(callbackURL),
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
	// Convex site URL is the backend endpoint for HTTP actions (/api/*).
	if v := lookupConfigValue("CONVEX_SITE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := lookupConfigValue("NEXT_PUBLIC_CONVEX_SITE_URL"); v != "" {
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

	envID, err := guidedSetup(envName, frameworkKey)
	if err != nil {
		return err
	}
	if err := saveLinkedEnvironmentID(envID); err != nil {
		return fmt.Errorf("project initialized, but failed to save environment link: %w", err)
	}
	if err := saveProjectConfig(projectCfg); err != nil {
		return fmt.Errorf("project initialized, but failed to save project config: %w", err)
	}
	if err := ensureProjectFile(projectCfg.ConfigYAMLPath, defaultConfigYAMLTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create config yaml: %w", err)
	}
	if err := ensureProjectFile(projectCfg.RequirementsPath, defaultRequirementsTemplate()); err != nil {
		return fmt.Errorf("failed to create requirements file: %w", err)
	}
	if err := ensureProjectFile(projectCfg.TrainEntrypoint, defaultTrainEntrypointTemplate(projectCfg)); err != nil {
		return fmt.Errorf("failed to create train entrypoint: %w", err)
	}
	if err := os.MkdirAll(projectCfg.DataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}
	if err := ensureFrameworkDependency(projectCfg.RequirementsPath, frameworkKey); err != nil {
		return fmt.Errorf("failed to update requirements: %w", err)
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

func guidedSetup(environmentName, frameworkHint string) (string, error) {
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

	envPayload := map[string]any{
		"name":      environmentName,
		"gpu_type":  gpuType,
		"gpu_count": gpuCount,
		"volume_gb": volumeGB,
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
	case "delete":
		environmentDelete(args[1:])
	case "create":
		must(errors.New("`tahuna env create` is removed; use `tahuna init .` or `tahuna init <project-name>`"))
	default:
		fmt.Printf("unknown environment subcommand: %s\n", args[0])
		os.Exit(1)
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
	case "list":
		runShow([]string{"--list"})
	case "show":
		runShow(args[1:])
	case "watch", "monitor":
		runWatch(args[1:])
	case "logs":
		runLogs(args[1:])
	case "delete":
		runDelete(args[1:])
	default:
		fmt.Printf("unknown run subcommand: %s\n", args[0])
		os.Exit(1)
	}
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
}

type syncOptions struct {
	logProgress bool
}

var (
	syncDoJSON                      = doJSON
	syncUploadFileToSignedURLRetry  = uploadFileToSignedURLWithRetry
	syncUploadBytesToSignedURLRetry = uploadBytesToSignedURLWithRetry
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
	fs.Parse(args)

	if *list {
		resp, err := doJSON(http.MethodGet, "/environments", nil)
		must(err)
		printJSON(resp)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/environments/"+*id, nil)
	must(err)
	printJSON(resp)
}

func environmentList(args []string) {
	environmentShow(append(args, "--list"))
}

func environmentDelete(args []string) {
	fs := flag.NewFlagSet("environment delete", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	fs.Parse(args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodDelete, "/environments/"+*id, nil)
	must(err)
	printJSON(resp)
}

func runCreate(args []string) {
	fs := flag.NewFlagSet("run create", flag.ExitOnError)
	gpuType := fs.String("gpu-type", "", "Override GPU type")
	gpuCount := fs.Int("gpu-count", 0, "Override GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Override volume size")
	watch := fs.Bool("watch", false, "Watch run status after creation")
	monitor := fs.Bool("monitor", false, "Alias for --watch")
	verbose := fs.Bool("verbose", false, "Show full run payload")
	fs.BoolVar(verbose, "v", false, "Show full run payload")
	fs.Parse(args)
	environmentID, err := resolveEnvironmentID()
	must(err)
	must(preRunSync(environmentID))

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

	resp, err := doJSON(http.MethodPost, "/environments/"+environmentID+"/runs", payload)
	must(err)
	runID := asString(resp["run_id"])
	fmt.Printf("%s✓%s run created: %s - %s\n", cAmpGreen, cReset, runID, runDashboardURL(runID))
	if *verbose {
		printJSON(resp)
	}
	if *watch || *monitor {
		must(monitorRun(runID, 5))
	}
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

	resp, err := doJSON(http.MethodPost, "/environments/"+resolvedEnvironmentID+"/runs", payload)
	must(err)

	runID := asString(resp["run_id"])
	fmt.Printf("%s✓%s run created: %s - %s\n", cAmpGreen, cReset, runID, runDashboardURL(runID))
	if *detached {
		return
	}
	must(monitorRun(runID, 5))
}

func preRunSync(environmentID string) error {
	return runSyncWithStatus(environmentID, syncScope{code: true, data: true})
}

func runSyncWithStatus(environmentID string, scope syncScope) error {
	start := time.Now()
	if !supportsDynamicStatus() {
		if err := syncIncremental(environmentID, scope, syncOptions{logProgress: false}); err != nil {
			return err
		}
		printSuccessLine(fmt.Sprintf("sync complete (%s)", formatDuration(time.Since(start))))
		return nil
	}

	status := syncStatusText(scope)
	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	printStatusLine(frames[0], status)

	done := make(chan error, 1)
	go func() {
		done <- syncIncremental(environmentID, scope, syncOptions{logProgress: false})
	}()

	ticker := time.NewTicker(90 * time.Millisecond)
	defer ticker.Stop()
	frameIndex := 1
	for {
		select {
		case err := <-done:
			if err != nil {
				clearStatusLine()
				return err
			}
			fmt.Printf("\r\033[2K%s✓%s %s\n", cAmpGreen, cReset, fmt.Sprintf("sync complete (%s)", formatDuration(time.Since(start))))
			return nil
		case <-ticker.C:
			printStatusLine(frames[frameIndex%len(frames)], status)
			frameIndex++
		}
	}
}

func syncIncremental(environmentID string, scope syncScope, options syncOptions) error {
	prepared := []preparedManifest{}

	if scope.code {
		if options.logProgress {
			fmt.Println("syncing code...")
		}
		codeManifest, err := prepareCodeManifest()
		if err != nil {
			return fmt.Errorf("code sync failed: %w", err)
		}
		prepared = append(prepared, codeManifest)
	}

	if scope.data {
		if options.logProgress {
			fmt.Println("syncing data...")
		}
		dataManifest, err := prepareDataManifest()
		if err != nil {
			return fmt.Errorf("data sync failed: %w", err)
		}
		prepared = append(prepared, dataManifest)
	}

	for _, item := range prepared {
		if err := syncMissingBlobs(environmentID, item); err != nil {
			return fmt.Errorf("%s sync failed: %w", item.kind, err)
		}
	}

	commitPayload := map[string]any{
		"environment_id": environmentID,
	}
	for _, item := range prepared {
		commitPayload[item.kind+"_manifest_hash"] = item.hash
		commitPayload[item.kind+"_manifest"] = item.manifest
	}

	if _, err := syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); err != nil {
		if !isMissingManifestCommitError(err) {
			return err
		}
		for _, item := range prepared {
			if errUpload := uploadManifest(environmentID, item); errUpload != nil {
				return fmt.Errorf("%s sync failed: %w", item.kind, errUpload)
			}
		}
		if _, retryErr := syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); retryErr != nil {
			return retryErr
		}
	}

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

func syncStatusText(scope syncScope) string {
	switch {
	case scope.code && scope.data:
		return "syncing code and data..."
	case scope.code:
		return "syncing code..."
	default:
		return "syncing data..."
	}
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
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "manifest not found in object storage")
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
	cachePath := filepath.Join(projectStateDir, "sync_code_manifest.json")
	return buildManifest("code", cachePath, dataDir)
}

func prepareDataManifest() (preparedManifest, error) {
	cachePath := filepath.Join(projectStateDir, "sync_data_manifest.json")
	return buildManifest("data", cachePath, "")
}

func buildManifest(kind, cachePath, dataDir string) (preparedManifest, error) {
	entries, filesByID, err := collectManifestEntries(kind, dataDir)
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
	}, nil
}

func collectManifestEntries(kind, dataDir string) ([]syncManifestEntry, map[string]string, error) {
	baseDir, err := os.Getwd()
	if err != nil {
		return nil, nil, err
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
			return nil, nil, cfgErr
		}
		resolvedDataDir := strings.TrimSpace(cfg.DataDir)
		if resolvedDataDir == "" {
			resolvedDataDir = "data"
		}
		info, statErr := os.Stat(resolvedDataDir)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				return entries, filesByID, nil
			}
			return nil, nil, statErr
		}
		if !info.IsDir() {
			return entries, filesByID, nil
		}
		walkErr := filepath.WalkDir(resolvedDataDir, func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() {
				return nil
			}
			if !d.Type().IsRegular() || (d.Type()&os.ModeSymlink) != 0 {
				return nil
			}
			relPath, relErr := filepath.Rel(resolvedDataDir, path)
			if relErr != nil {
				return relErr
			}
			fileInfo, infoErr := d.Info()
			if infoErr != nil {
				return infoErr
			}
			return addEntry(path, relPath, fileInfo)
		})
		if walkErr != nil {
			return nil, nil, walkErr
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
		return entries, filesByID, nil
	}

	normalizedDataDir := filepath.Clean(dataDir)
	if filepath.IsAbs(normalizedDataDir) {
		if relDataDir, relErr := filepath.Rel(baseDir, normalizedDataDir); relErr == nil && relDataDir != "." && relDataDir != ".." && !strings.HasPrefix(relDataDir, ".."+string(filepath.Separator)) {
			normalizedDataDir = filepath.Clean(relDataDir)
		}
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

		shouldSkipDir := relPath == ".git" ||
			strings.HasPrefix(relPath, ".git"+string(filepath.Separator)) ||
			relPath == projectStateDir ||
			strings.HasPrefix(relPath, projectStateDir+string(filepath.Separator)) ||
			relPath == normalizedDataDir ||
			strings.HasPrefix(relPath, normalizedDataDir+string(filepath.Separator))

		if d.IsDir() && shouldSkipDir {
			return filepath.SkipDir
		}
		if d.IsDir() {
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
		return nil, nil, walkErr
	}
	if len(entries) == 0 {
		return nil, nil, errors.New("no code files found to sync")
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
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

func syncMissingBlobs(environmentID string, item preparedManifest) error {
	hashes := uniqueSortedHashes(item.manifest.Entries)
	if len(hashes) == 0 {
		return nil
	}

	resp, err := syncDoJSON(http.MethodPost, "/sync/blobs/missing", map[string]any{
		"environment_id": environmentID,
		"kind":           item.kind,
		"hashes":         hashes,
	})
	if err != nil {
		return err
	}

	missingAny, ok := resp["missing"].([]any)
	if !ok {
		return errors.New("invalid missing blob response")
	}

	for _, rawHash := range missingAny {
		hash := asString(rawHash)
		if hash == "" {
			continue
		}
		path, exists := item.filesByID[hash]
		if !exists {
			return fmt.Errorf("missing local blob for hash %s", hash)
		}
		uploadResp, uploadErr := syncDoJSON(http.MethodPost, "/sync/blobs/upload-url", map[string]any{
			"environment_id": environmentID,
			"kind":           item.kind,
			"sha256":         hash,
		})
		if uploadErr != nil {
			return uploadErr
		}
		uploadURL := asString(uploadResp["url"])
		key := asString(uploadResp["key"])
		if uploadURL == "" {
			return errors.New("invalid blob upload URL response")
		}
		if key == "" {
			return errors.New("invalid blob upload URL response")
		}
		if err := syncUploadFileToSignedURLRetry(path, uploadURL, 3); err != nil {
			return err
		}
		if _, err := syncDoJSON(http.MethodPost, "/sync/metadata", map[string]any{"key": key}); err != nil {
			return err
		}
	}
	return nil
}

func uploadManifest(environmentID string, item preparedManifest) error {
	uploadResp, err := syncDoJSON(http.MethodPost, "/sync/manifests/upload-url", map[string]any{
		"environment_id": environmentID,
		"kind":           item.kind,
		"manifest_hash":  item.hash,
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
	if _, err := syncDoJSON(http.MethodPost, "/sync/metadata", map[string]any{"key": key}); err != nil {
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
	fs.Parse(args)

	if *list {
		resp, err := doJSON(http.MethodGet, "/runs", nil)
		must(err)
		printJSON(resp)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/runs/"+*id, nil)
	must(err)
	printJSON(resp)
}

func runWatch(args []string) {
	fs := flag.NewFlagSet("run watch", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	interval := fs.Int("interval", 5, "Polling interval seconds")
	fs.Parse(args)
	require(*id != "", "--id is required")
	require(*interval > 0, "--interval must be >= 1")

	must(monitorRun(*id, *interval))
}

func runLogs(args []string) {
	fs := flag.NewFlagSet("run logs", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	fs.Parse(args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodGet, "/runs/"+*id+"/logs", nil)
	must(err)
	printJSON(resp)
}

func runDelete(args []string) {
	fs := flag.NewFlagSet("run delete", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	fs.Parse(args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodDelete, "/runs/"+*id, nil)
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
	DataDir          string
	ConfigYAMLPath   string
	TrainEntrypoint  string
	RequirementsPath string
}

func collectProjectInitConfig() (projectConfig, string, error) {
	cfg := projectConfig{
		DataDir:          "data",
		ConfigYAMLPath:   "config.yaml",
		TrainEntrypoint:  "train.py",
		RequirementsPath: "requirements.txt",
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

	if fileExists(cfg.RequirementsPath) {
		fmt.Printf("✓ Found %srequirements.txt%s\n", cAmpGold, cReset)
		cfg.RequirementsPath = choosePathWhenFound("Requirements file", cfg.RequirementsPath, "requirements.txt")
	} else {
		fmt.Printf("%s?%s No requirements.txt found\n", cAmpGold, cReset)
		cfg.RequirementsPath = choosePathWhenMissing("Requirements file", "requirements.txt")
	}

	framework := detectFramework(cfg)
	if framework == "" {
		framework = promptChoice("No framework detected. PyTorch or TensorFlow?", []string{"pt", "tf"}, 0)
	} else {
		fmt.Printf("✓ Detected framework %s%s%s\n", cAmpGold, framework, cReset)
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
	candidates := []string{}
	if cfg.ConfigYAMLPath != "" {
		candidates = append(candidates, cfg.ConfigYAMLPath)
	}
	if cfg.RequirementsPath != "" {
		candidates = append(candidates, cfg.RequirementsPath)
	}
	for _, path := range candidates {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lower := strings.ToLower(string(raw))
		if strings.Contains(lower, "tensorflow") || strings.Contains(lower, "keras") {
			return "tf"
		}
		if strings.Contains(lower, "torch") || strings.Contains(lower, "pytorch") {
			return "pt"
		}
	}
	return ""
}

func ensureFrameworkDependency(requirementsPath, framework string) error {
	dep := ""
	switch framework {
	case "pt":
		dep = "torch"
	case "tf":
		dep = "tensorflow"
	default:
		return nil
	}

	if strings.TrimSpace(requirementsPath) == "" {
		return nil
	}
	if err := ensureProjectFile(requirementsPath, defaultRequirementsTemplate()); err != nil {
		return err
	}

	raw, err := os.ReadFile(requirementsPath)
	if err != nil {
		return err
	}
	lower := strings.ToLower(string(raw))
	if strings.Contains(lower, dep) {
		return nil
	}

	content := string(raw)
	if content != "" && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	content += dep + "\n"
	return os.WriteFile(requirementsPath, []byte(content), 0o644)
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
		"data_dir: %q\nconfig_yaml: %q\ntrain_entrypoint: %q\nrequirements: %q\n",
		cfg.DataDir,
		cfg.ConfigYAMLPath,
		cfg.TrainEntrypoint,
		cfg.RequirementsPath,
	)
	return os.WriteFile(projectConfigFilePath(), []byte(body), 0o600)
}

func loadProjectConfig() (projectConfig, error) {
	cfg := projectConfig{
		DataDir:          "data",
		ConfigYAMLPath:   "config.yaml",
		TrainEntrypoint:  "train.py",
		RequirementsPath: "requirements.txt",
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
		case "data_dir":
			if value != "" {
				cfg.DataDir = filepath.Clean(value)
			}
		case "config_yaml":
			if value != "" {
				cfg.ConfigYAMLPath = filepath.Clean(value)
			}
		case "train_entrypoint":
			if value != "" {
				cfg.TrainEntrypoint = filepath.Clean(value)
			}
		case "requirements":
			if value != "" {
				cfg.RequirementsPath = filepath.Clean(value)
			}
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

func defaultRequirementsTemplate() string {
	return "# Add Python dependencies here\n"
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
	dynamic := supportsDynamicStatus()
	anchored := false

	for {
		resp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			return err
		}
		status := asString(resp["status"])
		errMsg := asString(resp["error"])

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
		if status == "completed" || status == "failed" || status == "cancelled" {
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

func fetchCatalog() ([]string, map[string][]string, error) {
	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	if err != nil {
		return nil, nil, err
	}

	gpuRaw, ok := resp["gpus"].([]any)
	if !ok {
		return nil, nil, errors.New("invalid catalog response: gpus missing")
	}
	gpus := make([]string, 0, len(gpuRaw))
	for _, g := range gpuRaw {
		gpus = append(gpus, asString(g))
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

	req, err := http.NewRequest(http.MethodPut, rawURL, file)
	if err != nil {
		return err
	}
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
		return fmt.Errorf("upload failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
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
		return fmt.Errorf("upload failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
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
		}
		if i < attempts {
			time.Sleep(time.Duration(1<<(i-1)) * time.Second)
		}
	}
	return lastErr
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
		return nil, fmt.Errorf("api error (%d): %s", resp.StatusCode, msg)
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
		return base + "/runs"
	}
	return fmt.Sprintf("%s/runs/%s", base, neturl.QueryEscape(runID))
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
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
