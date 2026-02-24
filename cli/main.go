package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
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
	defaultAPIURL = "http://localhost:8000"
	cliVersion    = "0.1.0"
	cReset        = "\033[0m"
	// AMP frontend palette mapping:
	// background #0b1d1f, foreground #e8e0d4, primary/accent #c8a84e, muted #8a9a93
	cAmpWord  = "\033[38;5;44m"  // blue-green wordmark
	cAmpText  = "\033[38;5;223m" // sand/foreground
	cAmpMuted = "\033[38;5;108m" // muted green-gray
	cAmpTeal  = "\033[38;5;37m"  // dark teal accent
	cAmpSlate = "\033[38;5;66m"  // subdued slate
	cAmpGreen = "\033[38;5;48m"
	cAmpGold  = "\033[38;5;179m"
	cAmpRed   = "\033[38;5;196m"
)

func main() {
	if len(os.Args) < 2 {
		printHeader()
		must(guidedSetup())
		return
	}

	switch os.Args[1] {
	case "env", "environment":
		handleEnvironment(os.Args[2:])
	case "run":
		handleRun(os.Args[2:])
	case "shell":
		must(runShell())
	case "init", "start":
		printHeader()
		must(guidedSetup())
	case "up":
		printHeader()
		must(guidedSetup())
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
  tahuna init
  tahuna env create|list|show|delete ...
  tahuna run create|list|show|watch|logs|delete ...
  tahuna up
  tahuna version

Environment:
  TAHUNA_API_URL   Backend base URL (default: http://localhost:8000)
  TAHUNA_API_KEY   API key from the API key manager (sent as Bearer token)

Tip:
  Run "tahuna" with no args to launch the guided setup flow (same as "tahuna init").
`)
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
	if v := os.Getenv("TAHUNA_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return defaultAPIURL
}

func guidedSetup() error {
	gpus, versionsByFramework, err := fetchCatalog()
	if err != nil {
		return err
	}

	name := promptString("Environment name", "")
	gpuType := promptChoice("GPU type", gpus, 0)
	gpuCount := promptInt("GPU count", 1)
	volumeGB := promptInt("Volume (GB)", 80)

	frameworks := sortedKeys(versionsByFramework)
	framework := promptChoice("Framework", frameworks, 0)
	versions := versionsByFramework[framework]
	version := promptChoice("Framework version", versions, 0)

	envPayload := map[string]any{
		"name":      name,
		"gpu_type":  gpuType,
		"gpu_count": gpuCount,
		"volume_gb": volumeGB,
		"framework": framework,
		"version":   version,
	}
	env, err := doJSON(http.MethodPost, "/environments", envPayload)
	if err != nil {
		return err
	}

	envID := asString(env["environment_id"])
	fmt.Printf("\n%sEnvironment created:%s %s\n", cAmpWord, cReset, envID)
	fmt.Printf("%sArtifacts path:%s      %s\n", cAmpMuted, cReset, asString(env["artifacts"]))

	if !promptYesNo("\nStart a run now?", true) {
		fmt.Println("\nDone. Next: tahuna run create --environment-id <environment_id>")
		return nil
	}

	runResp, err := doJSON(http.MethodPost, "/environments/"+envID+"/runs", map[string]any{})
	if err != nil {
		return err
	}
	runID := asString(runResp["run_id"])
	fmt.Printf("\n%sRun created:%s         %s\n", cAmpWord, cReset, runID)
	printTrainPreview(envID, runID)

	if promptYesNo("Watch this run now?", true) {
		return monitorRun(runID, 5)
	}

	fmt.Println("\nDone. Next: tahuna run watch --id <run_id>")
	return nil
}

func handleEnvironment(args []string) {
	if len(args) == 0 {
		fmt.Println("missing environment subcommand")
		os.Exit(1)
	}
	switch args[0] {
	case "create":
		environmentCreate(args[1:])
	case "list":
		environmentList(args[1:])
	case "show":
		environmentShow(args[1:])
	case "delete":
		environmentDelete(args[1:])
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
	environmentID := fs.String("environment-id", "", "Environment ID")
	gpuType := fs.String("gpu-type", "", "Override GPU type")
	gpuCount := fs.Int("gpu-count", 0, "Override GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Override volume size")
	watch := fs.Bool("watch", false, "Watch run status after creation")
	monitor := fs.Bool("monitor", false, "Alias for --watch")
	fs.Parse(args)
	if *environmentID == "" {
		*environmentID = promptString("Environment ID", "")
	}

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

	resp, err := doJSON(http.MethodPost, "/environments/"+*environmentID+"/runs", payload)
	must(err)
	printJSON(resp)
	if *watch || *monitor {
		must(monitorRun(asString(resp["run_id"]), 5))
	}
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

func monitorRun(runID string, interval int) error {
	for {
		resp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			return err
		}
		status := asString(resp["status"])
		errMsg := asString(resp["error"])
		printRunPanel(runID, status, errMsg)
		if status == "completed" || status == "failed" {
			break
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return nil
}

func printTrainPreview(envID, runID string) {
	lines := []string{
		fmt.Sprintf("%s>%s Tahuna train --environment %s", cAmpGold, cReset, envID),
		"",
		fmt.Sprintf("  %sSetting up post-training pipeline...%s", cAmpMuted, cReset),
		"",
		fmt.Sprintf("  %s✓%s Loading environment and artifacts", cAmpGreen, cReset),
		fmt.Sprintf("  %s✓%s Launching run %s%s%s", cAmpGreen, cReset, cAmpGold, runID, cReset),
		fmt.Sprintf("  %s✓%s Waiting for pod allocation", cAmpGreen, cReset),
	}
	printPanel("Tahuna", lines, "training", "episode 1/500  ETA --")
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
	printPanel("Tahuna", lines, status, "run "+runID)
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
		Label:    fmt.Sprintf("%s%s%s", cAmpText, label, cReset),
		Default:  defaultValue,
		Validate: validate,
		Templates: &promptui.PromptTemplates{
			Prompt:  "{{ . }} ",
			Success: fmt.Sprintf("%s✔%s {{ . | faint }} ", cAmpWord, cReset),
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
		Label:     fmt.Sprintf("%s%s%s", cAmpText, label, cReset),
		Items:     options,
		CursorPos: defaultIndex,
		HideHelp:  true,
		Size:      10,
		Templates: &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   fmt.Sprintf("%s>%s {{ . }}", cAmpGold, cReset),
			Inactive: fmt.Sprintf("%s  {{ . }}%s", cAmpMuted, cReset),
			Selected: fmt.Sprintf("%s✔%s {{ .Label }}: %s{{ . }}%s", cAmpWord, cReset, cAmpText, cReset),
		},
	}
	_, value, err := prompt.Run()
	must(err)
	return value
}

func promptYesNo(label string, defaultYes bool) bool {
	defaultIndex := 0
	options := []string{"Yes", "No"}
	if !defaultYes {
		defaultIndex = 1
	}
	answer := promptChoice(label, options, defaultIndex)
	return answer == "Yes"
}

func sortedKeys(m map[string][]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
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

	req, err := http.NewRequest(method, apiURL()+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := strings.TrimSpace(os.Getenv("TAHUNA_API_KEY")); key != "" {
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
			return nil, err
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
