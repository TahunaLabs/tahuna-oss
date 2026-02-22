package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/manifoldco/promptui"
)

const (
	defaultAPIURL = "http://localhost:8000"
	cliVersion    = "0.1.0"
	cReset        = "\033[0m"
	// Logo-only colors mapped from frontend palette:
	// wordmark: teal family (#142e30/#1e3e40), mascot: gold (#c8a84e)
	cLogoWord   = "\033[38;5;30m"
	cLogoDonkey = "\033[38;5;179m"
	// AMP frontend palette mapping:
	// background #0b1d1f, foreground #e8e0d4, primary/accent #c8a84e, muted #8a9a93
	cAmpWord   = "\033[38;5;44m"  // blue-green wordmark
	cAmpText   = "\033[38;5;223m" // sand/foreground
	cAmpMuted  = "\033[38;5;108m" // muted green-gray
	cAmpTeal   = "\033[38;5;37m"  // dark teal accent
	cAmpSlate  = "\033[38;5;66m"  // subdued slate
)

func main() {
	if len(os.Args) < 2 {
		printLogo()
		must(guidedSetup())
		return
	}

	switch os.Args[1] {
	case "env", "environment":
		handleEnvironment(os.Args[2:])
	case "exp", "experiment":
		handleExperiment(os.Args[2:])
	case "run":
		handleRun(os.Args[2:])
	case "init", "start":
		printLogo()
		must(guidedSetup())
	case "up":
		printLogo()
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

func printLogo() {
	logo := strings.TrimPrefix(`
                                                                          ▄▄█████▄
                                                                     ▄████▀▀████                 ▄▄▄
                                                                    █████    ████              ▄█████▄
                                                                    █████    ████             ████▀▀███
                                                                    █████    ████            █████   ███
                                                                     █████   ████           █████    ███
                                                                     █████   ████          █████     ███
                                                                      █████  █████        █████     ███
  ██             ██                                                   ██████▄▄█████████████████    ███
  ██             ██                                                    ███████████████████████████████
██████   ▄████▄  ██████▄  ██    ██ ▄██████▄  ▄████▄                   █████████████████████████████████
  ██    ██▀  ▀██ ██▀  ▀██ ██    ██ ██▀  ▀██ ██▀  ▀██                 ███████████████████████████████████
  ██    ████████ ██    ██ ██    ██ ██    ██ ████████                 █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
  ██    ██▄  ▄██ ██    ██ ██▄  ▄██ ██    ██ ██▄  ▄██                 ███████    ████████████    ████████
  ▀████ ▀██████▀ ██    ██ ▀██████▀ ██    ██ ▀██████▀                 ███████    ████████████    ████████
                                                                      ███████▄▄▄████████████▄▄▄████████
─────────────────────────────────────────────────────────              ███████████████████████████████
                                                                        █████████████████████████████
     T H E   R L   T R A I N I N G   S U B S T R A T E                    ██████████████████████████
                                                                           █████████████████████████
                                                                            █████████████████████████
                                                                            ████████  ████████  █████
                                                                            ████████▄▄████████▄▄█████
                                                                             ███████████████████████
                                                                              ████████      ███████
                                                                               ███████████████████
                                                                                 ▀▀▀██████████▀▀▀
`, "\n")
	for _, line := range strings.Split(logo, "\n") {
		gapStart, gapEnd, gapLen := longestGap(line)
		if gapLen >= 10 {
			left := line[:gapStart]
			gap := line[gapStart:gapEnd]
			right := line[gapEnd:]
			leftHasGlyphs := strings.TrimSpace(left) != ""
			rightHasGlyphs := strings.TrimSpace(right) != ""

			switch {
			case leftHasGlyphs && rightHasGlyphs:
				fmt.Printf("%s%s%s\n", colorGlyphs(left, cLogoWord), gap, colorGlyphs(right, cLogoDonkey))
				continue
			case rightHasGlyphs:
				fmt.Printf("%s\n", colorGlyphs(line, cLogoDonkey))
				continue
			case leftHasGlyphs:
				fmt.Printf("%s\n", colorGlyphs(line, cLogoWord))
				continue
			}
		}
		fmt.Printf("%s\n", colorGlyphs(line, cLogoDonkey))
	}
	fmt.Println()
}

func colorGlyphs(s, color string) string {
	var b strings.Builder
	inColor := false
	for _, r := range s {
		if r == ' ' {
			if inColor {
				b.WriteString(cReset)
				inColor = false
			}
			b.WriteRune(r)
			continue
		}
		if !inColor {
			b.WriteString(color)
			inColor = true
		}
		b.WriteRune(r)
	}
	if inColor {
		b.WriteString(cReset)
	}
	return b.String()
}

func longestGap(s string) (start int, end int, length int) {
	bestStart, bestEnd, bestLen := 0, 0, 0
	curStart, curLen := -1, 0
	for i, r := range s {
		if r == ' ' {
			if curStart == -1 {
				curStart = i
				curLen = 1
			} else {
				curLen++
			}
			if curLen > bestLen {
				bestLen = curLen
				bestStart = curStart
				bestEnd = i + 1
			}
		} else {
			curStart = -1
			curLen = 0
		}
	}
	return bestStart, bestEnd, bestLen
}

func usage() {
	fmt.Println(`tahuna CLI

Usage:
  tahuna init
  tahuna env create|list|show|delete ...
  tahuna exp create|list|show|delete ...
  tahuna run create|list|show|watch|logs|delete ...
  tahuna up
  tahuna version

Environment:
  TAHUNA_API_URL   Backend base URL (default: http://localhost:8000)

Tip:
  Run "tahuna" with no args to launch the guided setup flow (same as "tahuna init").
`)
}

func apiURL() string {
	if v := os.Getenv("TAHUNA_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return defaultAPIURL
}

func guidedSetup() error {
	fmt.Printf("%sUsing API:%s %s\n\n", cAmpSlate, cReset, apiURL())

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
	env, err := doJSON(http.MethodPost, "/v1/environments", envPayload)
	if err != nil {
		return err
	}

	envID := asString(env["environment_id"])
	fmt.Printf("\n%sEnvironment created:%s %s\n", cAmpWord, cReset, envID)
	fmt.Printf("%sArtifacts path:%s      %s\n", cAmpMuted, cReset, asString(env["artifacts"]))

	if !promptYesNo("\nCreate an experiment now?", true) {
		fmt.Println("\nDone. Next: tahuna exp create --environment-id <environment_id> --name <name>")
		return nil
	}

	expName := promptString("Experiment name", "baseline")
	exp, err := doJSON(
		http.MethodPost,
		"/v1/environments/"+envID+"/experiments",
		map[string]any{"name": expName},
	)
	if err != nil {
		return err
	}

	expID := asString(exp["experiment_id"])
	fmt.Printf("\n%sExperiment created:%s  %s\n", cAmpWord, cReset, expID)
	fmt.Printf("%sInput path:%s          %s\n", cAmpMuted, cReset, asString(exp["input"]))

	if !promptYesNo("\nStart a run now?", true) {
		fmt.Println("\nDone. Next: tahuna run create --experiment-id <experiment_id>")
		return nil
	}

	runResp, err := doJSON(http.MethodPost, "/v1/experiments/"+expID+"/runs", map[string]any{})
	if err != nil {
		return err
	}
	runID := asString(runResp["run_id"])
	fmt.Printf("\n%sRun created:%s         %s\n", cAmpWord, cReset, runID)

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

func handleExperiment(args []string) {
	if len(args) == 0 {
		fmt.Println("missing experiment subcommand")
		os.Exit(1)
	}
	switch args[0] {
	case "create":
		experimentCreate(args[1:])
	case "list":
		experimentList(args[1:])
	case "show":
		experimentShow(args[1:])
	case "delete":
		experimentDelete(args[1:])
	default:
		fmt.Printf("unknown experiment subcommand: %s\n", args[0])
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
	resp, err := doJSON(http.MethodPost, "/v1/environments", payload)
	must(err)
	printJSON(resp)
}

func environmentShow(args []string) {
	fs := flag.NewFlagSet("environment show", flag.ExitOnError)
	id := fs.String("id", "", "Environment ID")
	list := fs.Bool("list", false, "List all environments")
	fs.Parse(args)

	if *list {
		resp, err := doJSON(http.MethodGet, "/v1/environments", nil)
		must(err)
		printJSON(resp)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/v1/environments/"+*id, nil)
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

	resp, err := doJSON(http.MethodDelete, "/v1/environments/"+*id, nil)
	must(err)
	printJSON(resp)
}

func experimentCreate(args []string) {
	fs := flag.NewFlagSet("experiment create", flag.ExitOnError)
	environmentID := fs.String("environment-id", "", "Parent environment ID")
	name := fs.String("name", "", "Experiment name")
	fs.Parse(args)
	if *environmentID == "" {
		*environmentID = promptString("Environment ID", "")
	}
	if *name == "" {
		*name = promptString("Experiment name", "baseline")
	}

	payload := map[string]any{"name": *name}
	resp, err := doJSON(http.MethodPost, "/v1/environments/"+*environmentID+"/experiments", payload)
	must(err)
	printJSON(resp)
}

func experimentShow(args []string) {
	fs := flag.NewFlagSet("experiment show", flag.ExitOnError)
	id := fs.String("id", "", "Experiment ID")
	list := fs.Bool("list", false, "List all experiments")
	fs.Parse(args)

	if *list {
		resp, err := doJSON(http.MethodGet, "/v1/experiments", nil)
		must(err)
		printJSON(resp)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/v1/experiments/"+*id, nil)
	must(err)
	printJSON(resp)
}

func experimentList(args []string) {
	experimentShow(append(args, "--list"))
}

func experimentDelete(args []string) {
	fs := flag.NewFlagSet("experiment delete", flag.ExitOnError)
	id := fs.String("id", "", "Experiment ID")
	fs.Parse(args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodDelete, "/v1/experiments/"+*id, nil)
	must(err)
	printJSON(resp)
}

func runCreate(args []string) {
	fs := flag.NewFlagSet("run create", flag.ExitOnError)
	experimentID := fs.String("experiment-id", "", "Experiment ID")
	gpuType := fs.String("gpu-type", "", "Override GPU type")
	gpuCount := fs.Int("gpu-count", 0, "Override GPU count")
	volumeGB := fs.Int("volume-gb", 0, "Override volume size")
	watch := fs.Bool("watch", false, "Watch run status after creation")
	monitor := fs.Bool("monitor", false, "Alias for --watch")
	fs.Parse(args)
	if *experimentID == "" {
		*experimentID = promptString("Experiment ID", "")
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

	resp, err := doJSON(http.MethodPost, "/v1/experiments/"+*experimentID+"/runs", payload)
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
		resp, err := doJSON(http.MethodGet, "/v1/runs", nil)
		must(err)
		printJSON(resp)
		return
	}
	require(*id != "", "--id is required when --list is not set")
	resp, err := doJSON(http.MethodGet, "/v1/runs/"+*id, nil)
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

	resp, err := doJSON(http.MethodGet, "/v1/runs/"+*id+"/logs", nil)
	must(err)
	printJSON(resp)
}

func runDelete(args []string) {
	fs := flag.NewFlagSet("run delete", flag.ExitOnError)
	id := fs.String("id", "", "Run ID")
	fs.Parse(args)
	require(*id != "", "--id is required")

	resp, err := doJSON(http.MethodDelete, "/v1/runs/"+*id, nil)
	must(err)
	printJSON(resp)
}

func monitorRun(runID string, interval int) error {
	for {
		resp, err := doJSON(http.MethodGet, "/v1/runs/"+runID, nil)
		if err != nil {
			return err
		}
		status := asString(resp["status"])
		errMsg := asString(resp["error"])
		fmt.Printf("%s[%s]%s run=%s status=%s\n", cAmpTeal, time.Now().Format(time.RFC3339), cReset, runID, status)
		if errMsg != "" {
			fmt.Printf("error=%s\n", errMsg)
		}
		if status == "completed" || status == "failed" {
			break
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return nil
}

func fetchCatalog() ([]string, map[string][]string, error) {
	resp, err := doJSON(http.MethodGet, "/v1/catalog", nil)
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
			Active:   fmt.Sprintf("%s▸%s {{ . }}", cAmpWord, cReset),
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
