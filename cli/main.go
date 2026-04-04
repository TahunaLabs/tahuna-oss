package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	neturl "net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	defaultAPIURL     = "https://tahuna.app"
	defaultDevAPIURL  = "http://localhost:3000"
	apiPrefix         = "/api"
	projectStateDir   = ".tahuna"
	projectEnvIDFile  = "environment_id"
	projectCfgFile    = "tahuna.toml"
	defaultProdConfig = "tahuna"
	defaultDevConfig  = "tahuna-dev"
	cReset            = "\033[0m"
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

type cliMode string

const (
	cliModeProd cliMode = "prod"
	cliModeDev  cliMode = "dev"
)

// cliVersion is overridden at release build time via -ldflags.
var cliVersion = "dev"

func main() {
	if err := initConfig(); err != nil {
		must(err)
	}

	if len(os.Args) < 2 {
		usage()
		return
	}

	switch os.Args[1] {
	case "env", "environment":
		handleEnvironment(os.Args[2:])
	case "env_vars":
		handleEnvVars(os.Args[2:])
	case "gpus":
		handleGPUs(os.Args[2:])
	case "data":
		handleData(os.Args[2:])
	case "run":
		handleRun(os.Args[2:])
	case "serve":
		handleServe(os.Args[2:])
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
  tahuna env list|show|update|rm ...
  tahuna env_vars list|get|set|rm ...
  tahuna env data bind|unbind ...
  tahuna gpus list
  tahuna data list|show ...
  tahuna run create|rename|list|show|watch|logs|cancel|rm ...
  tahuna serve create|list|show|logs|stop ...
  tahuna up
  tahuna version

Run commands:
  tahuna run help
  tahuna run list                Show last 5 runs (tail order; newest at bottom)
  tahuna run list -n <N>         Show last N runs
  tahuna run list -a             Show all runs
  tahuna run list --verbose      Show full JSON payload
  tahuna run show <run_id|run_name>
  tahuna run rename <run_id|run_name> --name <new_name>
  tahuna run watch <run_id|run_name> [--interval 5]
  tahuna run logs <run_id|run_name> [--verbose] [--follow] [--tail|-n <N>]
  tahuna run metrics <run>... --metric|-m <name>... [--tail|-n <N>] [--follow]
  tahuna run cancel <run_id|run_name> [-f]
  tahuna run rm <run_id|run_name|pattern>... [--all|-a] [--cancel|-c] [--force|-f]

Serve commands:
  tahuna serve help
  tahuna serve create --from-run <run_id> [--model-path <path>]
  tahuna serve create --from-storage-prefix <prefix>
  tahuna serve list
  tahuna serve show <serve_id>
  tahuna serve logs <serve_id>
  tahuna serve stop <serve_id> [--force|-f]

Environment:
  tahuna env list [--verbose]
  tahuna env show <env_id> | --id <env_id> [--verbose]
  tahuna env update [<env_id>] [--gpu-type <gpu>] [--gpu-count <n>] [--volume-gb <n>]
  tahuna env rm <env_id> | --id <env_id> | --all|-a

Env Vars:
  tahuna env_vars list [--verbose]
  tahuna env_vars get <name> [--verbose]
  tahuna env_vars set NAME=value [--verbose]
  tahuna env_vars set NAME --value <value> [--verbose]
  tahuna env_vars set [--from-file <path>] [--verbose]
  tahuna env_vars rm <name> [--verbose]
  Operates on the linked environment in the current project.

Auth:
  TAHUNA_API_URL      API base URL override
                      default in tahuna:     https://tahuna.app
                      default in tahuna-dev: http://localhost:3000
  TAHUNA_CONFIG_DIR   Config directory override
                      default in tahuna:     ~/.config/tahuna
                      default in tahuna-dev: ~/.config/tahuna-dev
  TAHUNA_BROWSER_URL  Browser auth URL base for "tahuna login" (optional)
  TAHUNA_API_KEY      Auth token (set automatically by "tahuna login")

Tip:
  Run "tahuna init ." to initialize the current project.
`)
}

func login() error {
	printHeader()

	resolvedBrowserBase := resolveLoginBrowserBaseURL()
	if cfg.browserURL == "" {
		if err := saveConfigValues(map[string]string{"TAHUNA_BROWSER_URL": resolvedBrowserBase}); err != nil {
			return fmt.Errorf("failed to persist browser URL: %w", err)
		}
		cfg.browserURL = resolvedBrowserBase
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
		cfg.apiKey = token
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
	if dir := os.Getenv("TAHUNA_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "config.env")
	}
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "tahuna.config.env"
	}
	configName := defaultProdConfig
	if activeCLIMode() == cliModeDev {
		configName = defaultDevConfig
	}
	return filepath.Join(home, ".config", configName, "config.env")
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
	if cfg.apiURL != "" {
		return cfg.apiURL
	}
	// Fallback for test contexts where initConfig has not been called.
	if v := strings.TrimSpace(os.Getenv("TAHUNA_API_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	if activeCLIMode() == cliModeDev {
		return defaultDevAPIURL
	}
	return defaultAPIURL
}

func activeCLIMode() cliMode {
	bin := strings.ToLower(filepath.Base(strings.TrimSpace(os.Args[0])))
	if strings.HasSuffix(bin, "-dev") {
		return cliModeDev
	}
	return cliModeProd
}
