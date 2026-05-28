package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html"
	"math"
	"net/http"
	neturl "net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const (
	researchStateDir = "research"

	researchSessionStatusAwaitingPatch = "awaiting_patch"
	researchSessionStatusBudgetExhaust = "budget_exhausted"
	researchSessionStatusRunning       = "running"
	researchSessionStatusRunningTrial  = "running_trial"

	researchTrialLabelAccepted     = "accepted"
	researchTrialLabelInconclusive = "inconclusive"
	researchTrialLabelRejected     = "rejected"
	researchTrialStatusRunning     = "running"
)

var researchWorktreePathspecs = []string{
	".",
	":(exclude).tahuna/research/**",
	":(exclude).tahuna/sync_code_manifest.json",
	":(exclude).tahuna/sync_data_manifest.json",
}

type repeatedResearchFlag []string

func (v *repeatedResearchFlag) String() string {
	return strings.Join(*v, ",")
}

func (v *repeatedResearchFlag) Set(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return errors.New("value cannot be empty")
	}
	*v = append(*v, filepath.ToSlash(filepath.Clean(trimmed)))
	return nil
}

type researchMetricConfig struct {
	Type    string `json:"type"`
	Name    string `json:"name,omitempty"`
	Command string `json:"command,omitempty"`
}

type researchBudgetConfig struct {
	MaxTrials              int     `json:"max_trials"`
	MaxSpendUSD            float64 `json:"max_spend_usd"`
	MaxTrialMinutes        int     `json:"max_trial_minutes"`
	StopAfterNoImprovement int     `json:"stop_after_no_improvement"`
	MinImprovement         float64 `json:"min_improvement"`
	ObservedSpendUSD       float64 `json:"observed_spend_usd"`
}

type researchRunResult struct {
	RunID  string   `json:"run_id"`
	Status string   `json:"status"`
	Value  *float64 `json:"value,omitempty"`
}

type researchRuntimeSpec struct {
	Framework     string `json:"framework"`
	Version       string `json:"version"`
	PythonVersion string `json:"python_version"`
	GPUType       string `json:"gpu_type"`
	GPUCount      int    `json:"gpu_count"`
	VolumeGB      int    `json:"volume_gb"`
}

type researchWarmComputeConfig struct {
	Enabled         bool    `json:"enabled"`
	KeepWarmMinutes float64 `json:"keep_warm_minutes,omitempty"`
}

type researchIncumbent struct {
	Trial       int      `json:"trial"`
	RunID       string   `json:"run_id"`
	Value       *float64 `json:"value,omitempty"`
	PatchSHA256 string   `json:"patch_sha256"`
	PatchPath   string   `json:"patch_path,omitempty"`
}

type researchTrial struct {
	Number            int      `json:"number"`
	RunID             string   `json:"run_id,omitempty"`
	Status            string   `json:"status"`
	Value             *float64 `json:"value,omitempty"`
	RunningBest       *float64 `json:"running_best,omitempty"`
	Label             string   `json:"label,omitempty"`
	Reason            string   `json:"reason,omitempty"`
	PatchSHA256       string   `json:"patch_sha256,omitempty"`
	EstimatedSpendUSD float64  `json:"estimated_spend_usd,omitempty"`
	ObservedSpendUSD  float64  `json:"observed_spend_usd,omitempty"`
	StartedAt         string   `json:"started_at,omitempty"`
	CompletedAt       string   `json:"completed_at,omitempty"`
}

type researchSession struct {
	SessionID      string                     `json:"session_id"`
	CreatedAt      string                     `json:"created_at"`
	Status         string                     `json:"status"`
	Program        string                     `json:"program"`
	Direction      string                     `json:"direction"`
	Metric         researchMetricConfig       `json:"metric"`
	Editable       []string                   `json:"editable"`
	Budget         researchBudgetConfig       `json:"budget"`
	EnvironmentID  string                     `json:"environment_id,omitempty"`
	StartingCommit string                     `json:"starting_commit,omitempty"`
	StartingPatch  string                     `json:"starting_patch_sha256,omitempty"`
	RuntimeSpec    researchRuntimeSpec        `json:"runtime_spec"`
	WarmCompute    *researchWarmComputeConfig `json:"warm_compute,omitempty"`
	Baseline       *researchRunResult         `json:"baseline,omitempty"`
	Incumbent      *researchIncumbent         `json:"incumbent,omitempty"`
	Trials         []researchTrial            `json:"trials"`
}

type researchWorktreeSnapshot struct {
	Diff         string
	SHA256       string
	HasUntracked bool
}

type researchRunBudget struct {
	GPUType          string
	GPUCount         int64
	EstimatedSpend   float64
	ObservedSpend    float64
	EstimatedMinutes float64
}

type researchRunOptions struct {
	program                string
	metric                 string
	metricCmd              string
	minimize               bool
	maximize               bool
	maxTrials              int
	maxSpendUSD            float64
	maxTrialMinutes        int
	stopAfterNoImprovement int
	minImprovement         float64
	keepWarmMinutes        string
	editable               []string
	allowDirty             bool
	resume                 string
	verbose                bool
}

func handleResearch(args []string) {
	if len(args) == 0 {
		fmt.Println("missing research subcommand")
		researchUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		researchUsage()
		return
	case "run":
		researchRun(args[1:])
	case "graph":
		researchGraph(args[1:])
	default:
		fmt.Printf("unknown research subcommand: %s\n", args[0])
		researchUsage()
		os.Exit(1)
	}
}

func researchUsage() {
	fmt.Print(`Research commands:
  tahuna research help
  tahuna research run --program <program.md> --metric final:<name> --minimize|--maximize --max-trials <N> --max-spend-usd <USD> --max-trial-minutes <N> [--keep-warm-minutes <n>] --editable <path>
  tahuna research run --resume <session-id> [--verbose|-v]
  tahuna research graph <session-id> [--output <path>]
`)
}

func researchRun(args []string) {
	opts := parseResearchRunOptions(args)
	if strings.TrimSpace(opts.resume) != "" {
		must(resumeResearchSession(opts))
		return
	}
	must(createResearchSession(opts))
}

func parseResearchRunOptions(args []string) researchRunOptions {
	fs := flag.NewFlagSet("research run", flag.ExitOnError)
	var editable repeatedResearchFlag
	opts := researchRunOptions{}
	fs.StringVar(&opts.program, "program", "", "Research program markdown path")
	fs.StringVar(&opts.metric, "metric", "", "Tahuna metric source, for example final:val_bpb")
	fs.StringVar(&opts.metricCmd, "metric-cmd", "", "External metric command (not supported in local MVP)")
	fs.BoolVar(&opts.minimize, "minimize", false, "Minimize objective")
	fs.BoolVar(&opts.maximize, "maximize", false, "Maximize objective")
	fs.IntVar(&opts.maxTrials, "max-trials", 0, "Maximum trial count")
	fs.Float64Var(&opts.maxSpendUSD, "max-spend-usd", 0, "Maximum estimated spend in USD")
	fs.IntVar(&opts.maxTrialMinutes, "max-trial-minutes", 0, "Maximum minutes per trial")
	fs.IntVar(&opts.stopAfterNoImprovement, "stop-after-no-improvement", 0, "Stop after consecutive non-improving trials")
	fs.Float64Var(&opts.minImprovement, "min-improvement", 0, "Minimum absolute objective improvement")
	fs.StringVar(&opts.keepWarmMinutes, "keep-warm-minutes", "", "Explicitly keep compute warm across baseline and trials for this many minutes")
	fs.Var(&editable, "editable", "Editable path or glob, repeatable")
	fs.BoolVar(&opts.allowDirty, "allow-dirty", false, "Allow dirty working tree state")
	fs.StringVar(&opts.resume, "resume", "", "Resume an existing research session")
	fs.BoolVar(&opts.verbose, "verbose", false, "Show session JSON")
	fs.BoolVar(&opts.verbose, "v", false, "Show session JSON")
	mustParseFlags(fs, args)
	require(len(fs.Args()) == 0, "unexpected positional arguments")
	opts.editable = editable
	return opts
}

func createResearchSession(opts researchRunOptions) error {
	metric, direction, err := validateResearchRunConfig(opts)
	if err != nil {
		return err
	}
	if metric.Type != "final" {
		return errors.New("--metric-cmd scoring is not part of the local autoresearch MVP")
	}
	environmentID, startingCommit, err := validateResearchProject(opts.editable, opts.allowDirty)
	if err != nil {
		return err
	}
	cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}
	runtimeSpec := researchRuntimeSpecFromConfig(cfg)
	keepWarmMinutes, err := researchKeepWarmMinutes(opts)
	if err != nil {
		return err
	}
	startingSnapshot, err := captureResearchWorktreeSnapshot(".")
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	session := researchSession{
		SessionID:      researchSessionID(now),
		CreatedAt:      now.Format(time.RFC3339),
		Status:         researchSessionStatusRunning,
		Program:        filepath.ToSlash(filepath.Clean(opts.program)),
		Direction:      direction,
		Metric:         metric,
		Editable:       append([]string{}, opts.editable...),
		EnvironmentID:  environmentID,
		StartingCommit: startingCommit,
		StartingPatch:  startingSnapshot.SHA256,
		RuntimeSpec:    runtimeSpec,
		Budget: researchBudgetConfig{
			MaxTrials:              opts.maxTrials,
			MaxSpendUSD:            opts.maxSpendUSD,
			MaxTrialMinutes:        opts.maxTrialMinutes,
			StopAfterNoImprovement: opts.stopAfterNoImprovement,
			MinImprovement:         opts.minImprovement,
			ObservedSpendUSD:       0,
		},
		Trials: []researchTrial{},
	}
	if keepWarmMinutes > 0 {
		session.WarmCompute = &researchWarmComputeConfig{
			Enabled:         true,
			KeepWarmMinutes: keepWarmMinutes,
		}
	}
	if err := writeResearchPatchSnapshot(session.SessionID, "starting.patch", startingSnapshot.Diff); err != nil {
		return err
	}
	if err := saveResearchSession(session); err != nil {
		return err
	}
	if err := ensureResearchBudgetForNextRun(&session, true); err != nil {
		return err
	}
	if err := runResearchBaseline(&session); err != nil {
		session.Status = "failed"
		_ = saveResearchSession(session)
		return err
	}
	printResearchSessionCreated(session, opts.verbose)
	return nil
}

func resumeResearchSession(opts researchRunOptions) error {
	if err := validateResearchResumeOptions(opts); err != nil {
		return err
	}
	sessionID := strings.TrimSpace(opts.resume)
	session, err := loadResearchSession(sessionID)
	if err != nil {
		return err
	}
	if _, _, err := validateResearchProject(session.Editable, opts.allowDirty); err != nil {
		return err
	}
	if err := validateResearchRuntimeSpecUnchanged(session); err != nil {
		return err
	}
	if opts.verbose {
		printJSON(session)
		return nil
	}
	return runResearchTrial(&session)
}

func validateResearchRunConfig(opts researchRunOptions) (researchMetricConfig, string, error) {
	if strings.TrimSpace(opts.resume) != "" {
		return researchMetricConfig{}, "", errors.New("--resume cannot be combined with new session flags")
	}
	if strings.TrimSpace(opts.program) == "" {
		return researchMetricConfig{}, "", errors.New("--program is required")
	}
	if _, err := os.Stat(opts.program); err != nil {
		return researchMetricConfig{}, "", fmt.Errorf("program not found: %s", opts.program)
	}
	if opts.minimize == opts.maximize {
		return researchMetricConfig{}, "", errors.New("exactly one of --minimize or --maximize is required")
	}
	if len(opts.editable) == 0 {
		return researchMetricConfig{}, "", errors.New("at least one --editable path is required")
	}
	if opts.maxTrials <= 0 {
		return researchMetricConfig{}, "", errors.New("--max-trials must be greater than 0")
	}
	if opts.maxSpendUSD <= 0 {
		return researchMetricConfig{}, "", errors.New("--max-spend-usd must be greater than 0")
	}
	if opts.maxTrialMinutes <= 0 {
		return researchMetricConfig{}, "", errors.New("--max-trial-minutes must be greater than 0")
	}
	if opts.stopAfterNoImprovement < 0 {
		return researchMetricConfig{}, "", errors.New("--stop-after-no-improvement cannot be negative")
	}
	if opts.minImprovement < 0 {
		return researchMetricConfig{}, "", errors.New("--min-improvement cannot be negative")
	}
	if strings.TrimSpace(opts.keepWarmMinutes) != "" {
		if _, err := parseKeepWarmMinutes(opts.keepWarmMinutes); err != nil {
			return researchMetricConfig{}, "", err
		}
	}

	metric, err := parseResearchMetric(opts.metric, opts.metricCmd)
	if err != nil {
		return researchMetricConfig{}, "", err
	}
	direction := "minimize"
	if opts.maximize {
		direction = "maximize"
	}
	return metric, direction, nil
}

func validateResearchResumeOptions(opts researchRunOptions) error {
	if strings.TrimSpace(opts.program) != "" ||
		strings.TrimSpace(opts.metric) != "" ||
		strings.TrimSpace(opts.metricCmd) != "" ||
		opts.minimize ||
		opts.maximize ||
		opts.maxTrials != 0 ||
		opts.maxSpendUSD != 0 ||
		opts.maxTrialMinutes != 0 ||
		opts.stopAfterNoImprovement != 0 ||
		opts.minImprovement != 0 ||
		strings.TrimSpace(opts.keepWarmMinutes) != "" ||
		len(opts.editable) != 0 {
		return errors.New("--resume cannot be combined with new session flags")
	}
	return nil
}

func parseResearchMetric(metric, metricCmd string) (researchMetricConfig, error) {
	metric = strings.TrimSpace(metric)
	metricCmd = strings.TrimSpace(metricCmd)
	if metric == "" && metricCmd == "" {
		return researchMetricConfig{}, errors.New("--metric final:<name> is required")
	}
	if metric != "" && metricCmd != "" {
		return researchMetricConfig{}, errors.New("--metric-cmd cannot be combined with --metric")
	}
	if metricCmd != "" {
		return researchMetricConfig{Type: "command", Command: metricCmd}, nil
	}
	name, ok := strings.CutPrefix(metric, "final:")
	if !ok || strings.TrimSpace(name) == "" {
		return researchMetricConfig{}, errors.New("--metric must use final:<name>")
	}
	return researchMetricConfig{Type: "final", Name: strings.TrimSpace(name)}, nil
}

func validateResearchProject(editable []string, allowDirty bool) (string, string, error) {
	if _, err := os.Stat(projectConfigFilePath()); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", "", fmt.Errorf("missing %s; run `tahuna init .` first", projectConfigFilePath())
		}
		return "", "", err
	}
	environmentID, err := loadLinkedEnvironmentID()
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(environmentID) == "" {
		return "", "", errors.New("no linked environment in this project; run `tahuna init .` first")
	}
	if err := ensureGitWorkTree("."); err != nil {
		return "", "", err
	}
	commit, err := gitOutput(".", "rev-parse", "HEAD")
	if err != nil {
		return "", "", fmt.Errorf("failed to resolve starting commit: %w", err)
	}
	if !allowDirty {
		if err := validateResearchDirtyFiles(".", editable); err != nil {
			return "", "", err
		}
	}
	return environmentID, strings.TrimSpace(commit), nil
}

func researchRuntimeSpecFromConfig(cfg projectConfig) researchRuntimeSpec {
	return researchRuntimeSpec{
		Framework:     strings.TrimSpace(cfg.Framework),
		Version:       strings.TrimSpace(cfg.FrameworkVersion),
		PythonVersion: strings.TrimSpace(cfg.PythonVersion),
		GPUType:       strings.TrimSpace(cfg.GPUType),
		GPUCount:      cfg.GPUCount,
		VolumeGB:      cfg.VolumeGB,
	}
}

func researchKeepWarmMinutes(opts researchRunOptions) (float64, error) {
	raw := strings.TrimSpace(opts.keepWarmMinutes)
	if raw == "" {
		return 0, nil
	}
	return parseKeepWarmMinutes(raw)
}

func validateResearchRuntimeSpecUnchanged(session researchSession) error {
	if strings.TrimSpace(session.RuntimeSpec.Framework) == "" {
		return nil
	}
	cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}
	current := researchRuntimeSpecFromConfig(cfg)
	if current == session.RuntimeSpec {
		return nil
	}
	return fmt.Errorf(
		"research runtime spec changed; warm compute is environment-scoped and would be replaced. Start a new research session or restore %s runtime fields",
		projectConfigFilePath(),
	)
}

func researchWarmComputeEnabled(session researchSession) bool {
	return session.WarmCompute != nil && session.WarmCompute.Enabled
}

func researchRunCreatePayload(name string, session researchSession, baseline bool) map[string]any {
	payload := map[string]any{"name": name}
	if !researchWarmComputeEnabled(session) {
		return payload
	}
	if baseline {
		payload["keep_warm_after_minutes"] = session.WarmCompute.KeepWarmMinutes
	} else {
		payload["warm"] = true
	}
	return payload
}

func isWarmComputeUnavailableError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "warm compute is stale") ||
		strings.Contains(text, "warm compute is not idle")
}

func ensureGitWorkTree(dir string) error {
	raw, err := gitOutput(dir, "rev-parse", "--is-inside-work-tree")
	if err != nil || strings.TrimSpace(raw) != "true" {
		return errors.New("research must run inside a git repository")
	}
	return nil
}

func validateResearchDirtyFiles(dir string, editable []string) error {
	raw, err := gitOutput(dir, "status", "--porcelain", "-uall", "--", ".")
	if err != nil {
		return err
	}
	projectPrefix, err := gitProjectPrefix(dir)
	if err != nil {
		return err
	}
	unexpected := []string{}
	for _, line := range strings.Split(raw, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		relPath := parseGitStatusPath(line)
		if relPath == "" {
			continue
		}
		projectRelPath := researchProjectRelativePath(relPath, projectPrefix)
		if isResearchOwnedLocalStatePath(projectRelPath) {
			continue
		}
		if isResearchEditablePath(projectRelPath, editable) {
			continue
		}
		unexpected = append(unexpected, projectRelPath)
	}
	if len(unexpected) > 0 {
		return fmt.Errorf("dirty files outside --editable paths: %s", strings.Join(unexpected, ", "))
	}
	return nil
}

func gitProjectPrefix(dir string) (string, error) {
	raw, err := gitOutput(dir, "rev-parse", "--show-prefix")
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Clean(strings.TrimSpace(raw))), nil
}

func researchProjectRelativePath(relPath, projectPrefix string) string {
	relPath = filepath.ToSlash(filepath.Clean(relPath))
	projectPrefix = filepath.ToSlash(filepath.Clean(strings.TrimSpace(projectPrefix)))
	if projectPrefix == "." || projectPrefix == "" {
		return relPath
	}
	projectPrefix = strings.TrimSuffix(projectPrefix, "/")
	if relPath == projectPrefix {
		return "."
	}
	if strings.HasPrefix(relPath, projectPrefix+"/") {
		return strings.TrimPrefix(relPath, projectPrefix+"/")
	}
	return relPath
}

func parseGitStatusPath(line string) string {
	if len(line) < 4 {
		return ""
	}
	pathText := strings.TrimSpace(line[3:])
	if strings.Contains(pathText, " -> ") {
		parts := strings.Split(pathText, " -> ")
		pathText = parts[len(parts)-1]
	}
	pathText = strings.Trim(pathText, `"`)
	return filepath.ToSlash(filepath.Clean(pathText))
}

func isResearchEditablePath(relPath string, editable []string) bool {
	relPath = filepath.ToSlash(filepath.Clean(relPath))
	for _, rawPattern := range editable {
		pattern := filepath.ToSlash(filepath.Clean(rawPattern))
		if pattern == "." || pattern == relPath {
			return true
		}
		if strings.HasSuffix(pattern, "/**") {
			prefix := strings.TrimSuffix(pattern, "/**")
			if relPath == prefix || strings.HasPrefix(relPath, prefix+"/") {
				return true
			}
			continue
		}
		if matched, err := path.Match(pattern, relPath); err == nil && matched {
			return true
		}
	}
	return false
}

func isResearchOwnedLocalStatePath(relPath string) bool {
	relPath = filepath.ToSlash(filepath.Clean(strings.TrimSpace(relPath)))
	switch relPath {
	case filepath.ToSlash(filepath.Join(projectStateDir, "sync_code_manifest.json")),
		filepath.ToSlash(filepath.Join(projectStateDir, "sync_data_manifest.json")):
		return true
	}
	researchDir := filepath.ToSlash(filepath.Join(projectStateDir, researchStateDir))
	return relPath == researchDir || strings.HasPrefix(relPath, researchDir+"/")
}

func researchGitPathspecArgs(args ...string) []string {
	out := append([]string{}, args...)
	out = append(out, "--")
	out = append(out, researchWorktreePathspecs...)
	return out
}

func gitOutput(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	raw, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func researchSessionID(now time.Time) string {
	base := "research-" + now.Format("20060102-150405")
	if _, err := os.Stat(researchSessionPath(base)); errors.Is(err, os.ErrNotExist) {
		return base
	}
	sum := sha256.Sum256([]byte(now.Format(time.RFC3339Nano)))
	return base + "-" + hex.EncodeToString(sum[:])[:8]
}

func researchSessionPath(sessionID string) string {
	return filepath.Join(projectStateDir, researchStateDir, strings.TrimSpace(sessionID)+".json")
}

func saveResearchSession(session researchSession) error {
	if err := os.MkdirAll(filepath.Join(projectStateDir, researchStateDir), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(researchSessionPath(session.SessionID), append(raw, '\n'), 0o600)
}

func loadResearchSession(sessionID string) (researchSession, error) {
	cleanID := strings.TrimSpace(sessionID)
	if cleanID == "" {
		return researchSession{}, errors.New("session id is required")
	}
	raw, err := os.ReadFile(researchSessionPath(cleanID))
	if err != nil {
		return researchSession{}, err
	}
	var session researchSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return researchSession{}, err
	}
	return session, nil
}

func printResearchSessionCreated(session researchSession, verbose bool) {
	if verbose {
		printJSON(session)
		return
	}
	fmt.Printf("Research session: %s\n", session.SessionID)
	fmt.Printf("Metric: %s", session.Metric.Type)
	if session.Metric.Name != "" {
		fmt.Printf(":%s", session.Metric.Name)
	}
	fmt.Printf(" (%s)\n", session.Direction)
	fmt.Printf("Session file: %s\n", researchSessionPath(session.SessionID))
	if session.Baseline != nil {
		fmt.Println()
		fmt.Println("Baseline:")
		fmt.Printf("  run: %s\n", session.Baseline.RunID)
		if session.Baseline.Value != nil {
			fmt.Printf("  final %s: %s\n", session.Metric.Name, strconvFloat(*session.Baseline.Value))
		}
		fmt.Printf("  status: %s\n", session.Baseline.Status)
	}
	fmt.Println()
	if session.Status == researchSessionStatusBudgetExhaust {
		fmt.Println("Budget exhausted; no further trial can launch.")
		return
	}
	fmt.Println("Next: edit one allowed file, then run:")
	fmt.Printf("  tahuna research run --resume %s\n", session.SessionID)
}

func runResearchBaseline(session *researchSession) error {
	fmt.Printf("Research session: %s\n", session.SessionID)
	fmt.Println("Syncing baseline code and data...")
	if err := preRunSync(session.EnvironmentID); err != nil {
		return err
	}

	runName := session.SessionID + "-baseline"
	fmt.Printf("Launching baseline run: %s\n", runName)
	resp, err := createRunWithCapacityPrompt(
		"/environments/"+session.EnvironmentID+"/runs",
		researchRunCreatePayload(runName, *session, true),
	)
	if err != nil {
		return err
	}
	runID := strings.TrimSpace(resp.RunID)
	if runID == "" {
		return errors.New("baseline run create response did not include run_id")
	}
	fmt.Printf("%s✓%s baseline run created: %s (%s)\n", cAmpGreen, cReset, runID, runDashboardURL(runID))

	if err := monitorRunWithLogs(runID, 5); err != nil {
		return err
	}
	terminalRun, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+runID, nil)
	if err != nil {
		return err
	}
	recordResearchRunSpend(session, terminalRun)
	session.Baseline = &researchRunResult{
		RunID:  runID,
		Status: terminalRun.Status,
	}
	if !strings.EqualFold(terminalRun.Status, "completed") {
		if err := saveResearchSession(*session); err != nil {
			return err
		}
		return fmt.Errorf("baseline run ended with status %s", terminalRun.Status)
	}

	metric, err := fetchResearchFinalMetric(runID, session.Metric.Name)
	if err != nil {
		if err := saveResearchSession(*session); err != nil {
			return err
		}
		return err
	}
	value := metric.Value
	session.Baseline.Value = &value
	session.Incumbent = &researchIncumbent{
		Trial:       0,
		RunID:       runID,
		Value:       &value,
		PatchSHA256: session.StartingPatch,
		PatchPath:   researchPatchSnapshotRelPath(session.SessionID, "incumbent.patch"),
	}
	incumbentSnapshot, err := captureResearchWorktreeSnapshot(".")
	if err != nil {
		return err
	}
	session.Incumbent.PatchSHA256 = incumbentSnapshot.SHA256
	if err := writeResearchPatchSnapshot(session.SessionID, "incumbent.patch", incumbentSnapshot.Diff); err != nil {
		return err
	}
	session.Status = researchSessionStatusAwaitingPatch
	if researchBudgetExhausted(*session) {
		session.Status = researchSessionStatusBudgetExhaust
	}
	return saveResearchSession(*session)
}

func runResearchTrial(session *researchSession) error {
	if session.Status != researchSessionStatusAwaitingPatch {
		return fmt.Errorf("research session must be %s, got %s", researchSessionStatusAwaitingPatch, session.Status)
	}
	if session.Metric.Type != "final" {
		return errors.New("resume currently requires a final:<name> metric")
	}
	if session.Incumbent == nil || session.Incumbent.Value == nil {
		return errors.New("research session has no scored incumbent")
	}
	if err := ensureResearchBudgetForNextRun(session, false); err != nil {
		return err
	}

	candidate, err := captureResearchWorktreeSnapshot(".")
	if err != nil {
		return err
	}
	if candidate.SHA256 == session.Incumbent.PatchSHA256 {
		return errors.New("candidate patch is empty; edit one allowed file before resuming")
	}
	if candidate.HasUntracked {
		return errors.New("candidate patch includes untracked files; add them to git before resuming")
	}
	if strings.TrimSpace(candidate.Diff) == "" {
		return errors.New("candidate patch has no tracked diff")
	}

	trialNumber := len(session.Trials) + 1
	patchName := fmt.Sprintf("trial-%d.patch", trialNumber)
	if err := writeResearchPatchSnapshot(session.SessionID, patchName, candidate.Diff); err != nil {
		return err
	}

	trial := researchTrial{
		Number:            trialNumber,
		Status:            researchTrialStatusRunning,
		PatchSHA256:       candidate.SHA256,
		EstimatedSpendUSD: estimateResearchNextRunSpend(*session),
		StartedAt:         time.Now().UTC().Format(time.RFC3339),
	}
	session.Status = researchSessionStatusRunningTrial
	session.Trials = append(session.Trials, trial)
	if err := saveResearchSession(*session); err != nil {
		return err
	}

	fmt.Printf("Research session: %s\n", session.SessionID)
	fmt.Printf("Trial: %d\n", trialNumber)
	fmt.Println("Syncing trial code and data...")
	if err := preRunSync(session.EnvironmentID); err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, "", fmt.Sprintf("sync failed: %v", err))
	}

	runName := fmt.Sprintf("%s-trial-%d", session.SessionID, trialNumber)
	fmt.Printf("Launching trial run: %s\n", runName)
	resp, err := createRunWithCapacityPrompt(
		"/environments/"+session.EnvironmentID+"/runs",
		researchRunCreatePayload(runName, *session, false),
	)
	if err != nil {
		if researchWarmComputeEnabled(*session) && isWarmComputeUnavailableError(err) {
			session.Status = researchSessionStatusAwaitingPatch
			session.Trials = session.Trials[:len(session.Trials)-1]
			_ = saveResearchSession(*session)
			return err
		}
		return finishInconclusiveResearchTrial(session, trialNumber, "", fmt.Sprintf("run create failed: %v", err))
	}
	runID := strings.TrimSpace(resp.RunID)
	if runID == "" {
		return finishInconclusiveResearchTrial(session, trialNumber, "", "run create response did not include run_id")
	}
	fmt.Printf("%s✓%s trial run created: %s (%s)\n", cAmpGreen, cReset, runID, runDashboardURL(runID))
	session.Trials[len(session.Trials)-1].RunID = runID
	if err := saveResearchSession(*session); err != nil {
		return err
	}

	if err := monitorResearchTrialRun(session, trialNumber, runID, 5); err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, fmt.Sprintf("run monitor failed: %v", err))
	}
	if session.Trials[trialNumber-1].Label == researchTrialLabelInconclusive {
		return nil
	}
	terminalRun, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+runID, nil)
	if err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, fmt.Sprintf("run status lookup failed: %v", err))
	}
	recordResearchTrialSpend(session, trialNumber, terminalRun)
	if err := saveResearchSession(*session); err != nil {
		return err
	}
	if !strings.EqualFold(terminalRun.Status, "completed") {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, "run ended with status "+terminalRun.Status)
	}

	metric, err := fetchResearchFinalMetric(runID, session.Metric.Name)
	if err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, fmt.Sprintf("metric lookup failed: %v", err))
	}
	value := metric.Value
	label := researchTrialLabelRejected
	reason := "metric did not improve incumbent"
	if researchMetricImproved(session.Direction, value, *session.Incumbent.Value, session.Budget.MinImprovement) {
		label = researchTrialLabelAccepted
		reason = "metric improved incumbent"
	}
	return finishResearchTrial(session, trialNumber, label, runID, &value, reason)
}

func finishInconclusiveResearchTrial(session *researchSession, trialNumber int, runID, reason string) error {
	return finishResearchTrial(session, trialNumber, researchTrialLabelInconclusive, runID, nil, reason)
}

func finishResearchTrial(session *researchSession, trialNumber int, label, runID string, value *float64, reason string) error {
	if trialNumber <= 0 || trialNumber > len(session.Trials) {
		return errors.New("invalid research trial number")
	}
	trial := &session.Trials[trialNumber-1]
	trial.Status = label
	trial.Label = label
	trial.Reason = reason
	trial.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	if strings.TrimSpace(runID) != "" {
		trial.RunID = strings.TrimSpace(runID)
	}
	if value != nil {
		v := *value
		trial.Value = &v
	}

	accepted := label == researchTrialLabelAccepted
	if accepted {
		snapshot, err := captureResearchWorktreeSnapshot(".")
		if err != nil {
			return err
		}
		session.Incumbent = &researchIncumbent{
			Trial:       trialNumber,
			RunID:       trial.RunID,
			Value:       trial.Value,
			PatchSHA256: snapshot.SHA256,
			PatchPath:   researchPatchSnapshotRelPath(session.SessionID, "incumbent.patch"),
		}
		if err := writeResearchPatchSnapshot(session.SessionID, "incumbent.patch", snapshot.Diff); err != nil {
			return err
		}
	} else if err := restoreResearchIncumbentPatch(*session); err != nil {
		return err
	}

	if session.Incumbent != nil && session.Incumbent.Value != nil {
		best := *session.Incumbent.Value
		trial.RunningBest = &best
	}
	session.Status = researchSessionStatusAwaitingPatch
	if researchBudgetExhausted(*session) {
		session.Status = researchSessionStatusBudgetExhaust
	}
	if err := saveResearchSession(*session); err != nil {
		return err
	}
	printResearchTrialResult(*session, *trial)
	return nil
}

func researchMetricImproved(direction string, candidate, incumbent, minImprovement float64) bool {
	var delta float64
	if direction == "maximize" {
		delta = candidate - incumbent
	} else {
		delta = incumbent - candidate
	}
	return delta > 0 && delta >= minImprovement
}

func restoreResearchIncumbentPatch(session researchSession) error {
	if session.Incumbent == nil {
		return errors.New("research session has no incumbent")
	}
	current, err := captureResearchWorktreeSnapshot(".")
	if err != nil {
		return err
	}
	if strings.TrimSpace(current.Diff) != "" {
		if err := gitApplyPatch(".", current.Diff, "--reverse"); err != nil {
			return fmt.Errorf("failed to remove candidate patch: %w", err)
		}
	}
	patchPath := session.Incumbent.PatchPath
	if strings.TrimSpace(patchPath) == "" {
		patchPath = researchPatchSnapshotRelPath(session.SessionID, "incumbent.patch")
	}
	raw, err := os.ReadFile(patchPath)
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(raw)) != "" {
		if err := gitApplyPatch(".", string(raw)); err != nil {
			return fmt.Errorf("failed to restore incumbent patch: %w", err)
		}
	}
	return validateResearchIncumbentSnapshot(session)
}

func gitApplyPatch(dir, diff string, args ...string) error {
	cmdArgs := append([]string{"apply", "--whitespace=nowarn"}, args...)
	cmdArgs = append(cmdArgs, "-")
	cmd := exec.Command("git", cmdArgs...)
	cmd.Dir = dir
	cmd.Stdin = bytes.NewBufferString(diff)
	raw, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(raw)))
	}
	return nil
}

func printResearchTrialResult(session researchSession, trial researchTrial) {
	fmt.Println()
	fmt.Printf("Trial %d: %s\n", trial.Number, trial.Label)
	if trial.RunID != "" {
		fmt.Printf("  run: %s\n", trial.RunID)
	}
	if trial.Value != nil {
		fmt.Printf("  final %s: %s\n", session.Metric.Name, strconvFloat(*trial.Value))
	}
	if trial.RunningBest != nil {
		fmt.Printf("  running best: %s\n", strconvFloat(*trial.RunningBest))
	}
	if trial.Reason != "" {
		fmt.Printf("  reason: %s\n", trial.Reason)
	}
	fmt.Println()
	if session.Status == researchSessionStatusBudgetExhaust {
		fmt.Println("Budget exhausted; no further trial can launch.")
		return
	}
	fmt.Println("Next: edit one allowed file, then run:")
	fmt.Printf("  tahuna research run --resume %s\n", session.SessionID)
}

func validateResearchIncumbentSnapshot(session researchSession) error {
	expected := strings.TrimSpace(session.StartingPatch)
	if session.Incumbent != nil && strings.TrimSpace(session.Incumbent.PatchSHA256) != "" {
		expected = strings.TrimSpace(session.Incumbent.PatchSHA256)
	}
	if expected == "" {
		return errors.New("research session has no incumbent patch snapshot")
	}
	current, err := captureResearchWorktreeSnapshot(".")
	if err != nil {
		return err
	}
	if current.SHA256 != expected {
		return fmt.Errorf("working tree does not match incumbent patch snapshot: expected %s, got %s", expected, current.SHA256)
	}
	return nil
}

func captureResearchWorktreeSnapshot(dir string) (researchWorktreeSnapshot, error) {
	diff, err := gitOutput(dir, researchGitPathspecArgs("diff", "--binary", "HEAD")...)
	if err != nil {
		return researchWorktreeSnapshot{}, err
	}
	untracked, err := gitOutput(dir, researchGitPathspecArgs("ls-files", "--others", "--exclude-standard")...)
	if err != nil {
		return researchWorktreeSnapshot{}, err
	}
	var material strings.Builder
	material.WriteString(diff)
	hasUntracked := false
	for _, relPath := range strings.Split(untracked, "\n") {
		relPath = filepath.ToSlash(filepath.Clean(strings.TrimSpace(relPath)))
		if relPath == "" || relPath == "." || strings.HasPrefix(relPath, "../") {
			continue
		}
		if isResearchOwnedLocalStatePath(relPath) {
			continue
		}
		hasUntracked = true
		fullPath := filepath.Join(dir, filepath.FromSlash(relPath))
		info, err := os.Lstat(fullPath)
		if err != nil || info.IsDir() || !info.Mode().IsRegular() || (info.Mode()&os.ModeSymlink) != 0 {
			continue
		}
		raw, err := os.ReadFile(fullPath)
		if err != nil {
			return researchWorktreeSnapshot{}, err
		}
		material.WriteString("\n-- untracked ")
		material.WriteString(relPath)
		material.WriteString(" --\n")
		material.Write(raw)
	}
	sum := sha256.Sum256([]byte(material.String()))
	return researchWorktreeSnapshot{
		Diff:         diff,
		SHA256:       hex.EncodeToString(sum[:]),
		HasUntracked: hasUntracked,
	}, nil
}

func researchSessionDir(sessionID string) string {
	return filepath.Join(projectStateDir, researchStateDir, strings.TrimSpace(sessionID))
}

func researchPatchSnapshotRelPath(sessionID, name string) string {
	return filepath.ToSlash(filepath.Join(projectStateDir, researchStateDir, strings.TrimSpace(sessionID), name))
}

func writeResearchPatchSnapshot(sessionID, name, diff string) error {
	dir := researchSessionDir(sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, name), []byte(diff), 0o600)
}

func fetchResearchFinalMetric(runID, name string) (finalMetricResponse, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return finalMetricResponse{}, errors.New("final metric name is required")
	}
	return doJSONAs[finalMetricResponse](
		http.MethodGet,
		"/runs/"+strings.TrimSpace(runID)+"/metrics/final?name="+neturl.QueryEscape(name),
		nil,
	)
}

func ensureResearchBudgetForNextRun(session *researchSession, baseline bool) error {
	if !baseline {
		if session.Budget.MaxTrials > 0 && len(session.Trials) >= session.Budget.MaxTrials {
			return markResearchBudgetExhausted(session, fmt.Sprintf("--max-trials reached (%d)", session.Budget.MaxTrials))
		}
		if session.Budget.StopAfterNoImprovement > 0 && researchConsecutiveNoImprovement(*session) >= session.Budget.StopAfterNoImprovement {
			return markResearchBudgetExhausted(session, fmt.Sprintf("--stop-after-no-improvement reached (%d)", session.Budget.StopAfterNoImprovement))
		}
	}
	budget, err := resolveResearchRunBudget(*session, nil, true)
	if err != nil {
		return err
	}
	estimate := budget.EstimatedSpend
	if session.Budget.MaxSpendUSD > 0 && session.Budget.ObservedSpendUSD+estimate > session.Budget.MaxSpendUSD {
		return markResearchBudgetExhausted(
			session,
			fmt.Sprintf("estimated next run spend %.6f would exceed --max-spend-usd %.6f", estimate, session.Budget.MaxSpendUSD),
		)
	}
	return nil
}

func markResearchBudgetExhausted(session *researchSession, reason string) error {
	session.Status = researchSessionStatusBudgetExhaust
	if err := saveResearchSession(*session); err != nil {
		return err
	}
	return errors.New(reason)
}

func researchBudgetExhausted(session researchSession) bool {
	if session.Budget.MaxTrials > 0 && len(session.Trials) >= session.Budget.MaxTrials {
		return true
	}
	if session.Budget.StopAfterNoImprovement > 0 && researchConsecutiveNoImprovement(session) >= session.Budget.StopAfterNoImprovement {
		return true
	}
	if session.Budget.MaxSpendUSD > 0 && session.Budget.ObservedSpendUSD+estimateResearchNextRunSpend(session) > session.Budget.MaxSpendUSD {
		return true
	}
	return false
}

func researchConsecutiveNoImprovement(session researchSession) int {
	count := 0
	for i := len(session.Trials) - 1; i >= 0; i-- {
		if session.Trials[i].Label == researchTrialLabelAccepted {
			break
		}
		if session.Trials[i].Label == researchTrialLabelRejected || session.Trials[i].Label == researchTrialLabelInconclusive {
			count++
		}
	}
	return count
}

func estimateResearchNextRunSpend(session researchSession) float64 {
	budget, err := resolveResearchRunBudget(session, nil, true)
	if err != nil {
		return 0
	}
	return budget.EstimatedSpend
}

func recordResearchTrialSpend(session *researchSession, trialNumber int, run runResponse) {
	if trialNumber <= 0 || trialNumber > len(session.Trials) {
		return
	}
	budget, err := resolveResearchRunBudget(*session, &run, false)
	if err != nil {
		return
	}
	trial := &session.Trials[trialNumber-1]
	if budget.EstimatedSpend > 0 {
		trial.EstimatedSpendUSD = budget.EstimatedSpend
	}
	if budget.ObservedSpend > 0 {
		trial.ObservedSpendUSD = budget.ObservedSpend
	}
	session.Budget.ObservedSpendUSD += budget.ObservedSpend
}

func recordResearchRunSpend(session *researchSession, run runResponse) {
	budget, err := resolveResearchRunBudget(*session, &run, false)
	if err != nil {
		return
	}
	session.Budget.ObservedSpendUSD += budget.ObservedSpend
}

func resolveResearchRunBudget(session researchSession, run *runResponse, estimateOnly bool) (researchRunBudget, error) {
	gpuType, gpuCount, err := researchRunCompute(session.EnvironmentID, run)
	if err != nil {
		return researchRunBudget{}, err
	}
	price, err := researchGPUHourlyPrice(gpuType)
	if err != nil {
		return researchRunBudget{}, err
	}
	minutes := researchEstimatedRunMinutes(session)
	estimated := researchSpendUSD(price, gpuCount, time.Duration(minutes*float64(time.Minute)))
	observed := 0.0
	if run != nil && !estimateOnly {
		observedDuration := researchRunObservedDuration(*run)
		observed = researchSpendUSD(price, gpuCount, observedDuration)
	}
	return researchRunBudget{
		GPUType:          gpuType,
		GPUCount:         gpuCount,
		EstimatedSpend:   estimated,
		ObservedSpend:    observed,
		EstimatedMinutes: minutes,
	}, nil
}

func researchRunCompute(environmentID string, run *runResponse) (string, int64, error) {
	if run != nil {
		gpuType := strings.TrimSpace(run.EffectiveGPUType)
		gpuCount := run.EffectiveGPUCount
		if gpuType != "" && gpuCount > 0 {
			return gpuType, gpuCount, nil
		}
	}
	env, err := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return "", 0, err
	}
	gpuType := strings.TrimSpace(env.GPUType)
	gpuCount := env.GPUCount
	if gpuType == "" || gpuCount <= 0 {
		return "", 0, errors.New("environment has no effective GPU configuration")
	}
	return gpuType, gpuCount, nil
}

func researchGPUHourlyPrice(gpuType string) (float64, error) {
	entries, err := fetchGpusByID()
	if err != nil {
		return 0, err
	}
	entry, ok := entries[strings.ToLower(strings.TrimSpace(gpuType))]
	if !ok {
		return 0, fmt.Errorf("GPU type %q is not available. Run `tahuna gpus list`.", gpuType)
	}
	if entry.PricePerHour <= 0 {
		return 0, fmt.Errorf("GPU type %q has no hourly price in /api/gpus", gpuType)
	}
	return entry.PricePerHour, nil
}

func researchEstimatedRunMinutes(session researchSession) float64 {
	if session.Baseline != nil {
		if run, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+session.Baseline.RunID, nil); err == nil {
			if duration := researchRunObservedDuration(run); duration > 0 {
				return duration.Minutes()
			}
		}
	}
	if session.Budget.MaxTrialMinutes > 0 {
		return float64(session.Budget.MaxTrialMinutes)
	}
	return 0
}

func researchRunObservedDuration(run runResponse) time.Duration {
	if run.UptimeMS > 0 {
		return time.Duration(run.UptimeMS) * time.Millisecond
	}
	if run.CreatedAt <= 0 {
		return 0
	}
	startedAt := time.UnixMilli(run.CreatedAt)
	if startedAt.IsZero() || startedAt.After(time.Now()) {
		return 0
	}
	return time.Since(startedAt)
}

func researchSpendUSD(pricePerHour float64, gpuCount int64, duration time.Duration) float64 {
	if pricePerHour <= 0 || gpuCount <= 0 || duration <= 0 {
		return 0
	}
	return pricePerHour * float64(gpuCount) * duration.Hours()
}

func monitorResearchTrialRun(session *researchSession, trialNumber int, runID string, interval int) error {
	const maxConsecutivePollErrors = 12
	fmt.Printf("%sFollowing logs for run %s (Ctrl+C to stop)%s\n", cAmpMuted, runID, cReset)

	seen := map[string]struct{}{}
	consecutivePollErrors := 0
	lastStatus := ""
	noLogsNoticePrinted := false
	for {
		statusResp, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				logWarn("unable to poll run status (%v); retrying in %ds (%d/%d)",
					err, interval, consecutivePollErrors, maxConsecutivePollErrors)
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf("run status polling failed %d times in a row: %w", consecutivePollErrors, err)
				}
				runLogsFollowSleep(time.Duration(interval) * time.Second)
				continue
			}
			return err
		}
		status := statusResp.Status
		if status == "" {
			status = "queued"
		}
		if status != lastStatus {
			fmt.Printf("Status: %s\n", status)
			lastStatus = status
			noLogsNoticePrinted = false
		}
		if researchTrialExceededMaxMinutes(*session, statusResp) {
			if _, err := doJSONAs[cancelRunResponse](http.MethodPost, "/runs/"+runID+"/cancel", map[string]any{"force": false}); err != nil {
				return err
			}
			recordResearchTrialSpend(session, trialNumber, statusResp)
			if err := finishInconclusiveResearchTrial(session, trialNumber, runID, "run exceeded --max-trial-minutes"); err != nil {
				return err
			}
			return nil
		}

		logResp, err := doJSONAs[runLogsResponse](http.MethodGet, "/runs/"+runID+"/logs", nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				logWarn("unable to poll run logs (%v); retrying in %ds (%d/%d)",
					err, interval, consecutivePollErrors, maxConsecutivePollErrors)
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf("run log polling failed %d times in a row: %w", consecutivePollErrors, err)
				}
				runLogsFollowSleep(time.Duration(interval) * time.Second)
				continue
			}
			return err
		}
		if consecutivePollErrors > 0 {
			logInfo("recovered run log polling")
			consecutivePollErrors = 0
		}
		for _, line := range parseRecentRunLogs(logResp.RecentLogs) {
			key := runtimeLogLineKey(line)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			fmt.Println(formatRuntimeLogLine(line))
		}
		if len(seen) == 0 && !noLogsNoticePrinted && !isTerminalRunStatus(status) {
			fmt.Printf("%sNo logs yet while run is %s.%s\n", cAmpMuted, status, cReset)
			noLogsNoticePrinted = true
		}

		if isTerminalRunStatus(status) {
			return nil
		}
		runLogsFollowSleep(time.Duration(interval) * time.Second)
	}
}

func researchTrialExceededMaxMinutes(session researchSession, run runResponse) bool {
	if session.Budget.MaxTrialMinutes <= 0 || isTerminalRunStatus(run.Status) {
		return false
	}
	return researchRunObservedDuration(run) >= time.Duration(session.Budget.MaxTrialMinutes)*time.Minute
}

func strconvFloat(value float64) string {
	return fmt.Sprintf("%.6f", value)
}

func researchGraph(args []string) {
	fs := flag.NewFlagSet("research graph", flag.ExitOnError)
	output := fs.String("output", "", "Output graph path")
	mustParseFlags(fs, reorderResearchGraphArgs(args))
	require(len(fs.Args()) == 1, "session_id is required (usage: tahuna research graph <session-id> [--output <path>])")
	session, err := loadResearchSession(fs.Args()[0])
	must(err)
	outputPath := strings.TrimSpace(*output)
	if outputPath == "" {
		outputPath = filepath.Join(researchSessionDir(session.SessionID), "progress.svg")
	}
	svg, err := renderResearchProgressSVG(session)
	must(err)
	if dir := filepath.Dir(outputPath); dir != "" && dir != "." {
		must(os.MkdirAll(dir, 0o755))
	}
	must(os.WriteFile(outputPath, []byte(svg), 0o644))
	fmt.Printf("Research session: %s\n", session.SessionID)
	fmt.Printf("Output: %s\n", outputPath)
}

func reorderResearchGraphArgs(args []string) []string {
	flags := make([]string, 0, len(args))
	positionals := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--output" {
			require(i+1 < len(args), "--output requires a path")
			flags = append(flags, arg, args[i+1])
			i++
			continue
		}
		if strings.HasPrefix(arg, "--output=") {
			flags = append(flags, arg)
			continue
		}
		positionals = append(positionals, arg)
	}
	return append(flags, positionals...)
}

type researchGraphMarker struct {
	Trial       int
	Value       float64
	Label       string
	NoValue     bool
	RunningBest float64
}

func renderResearchProgressSVG(session researchSession) (string, error) {
	if session.Baseline == nil || session.Baseline.Value == nil {
		return "", errors.New("research session has no baseline value; run a baseline before rendering a graph")
	}
	const (
		width      = 960.0
		height     = 560.0
		plotLeft   = 88.0
		plotTop    = 64.0
		plotRight  = 32.0
		plotBottom = 94.0
	)
	plotWidth := width - plotLeft - plotRight
	plotHeight := height - plotTop - plotBottom
	metricName := researchGraphMetricName(session)
	baselineValue := *session.Baseline.Value
	bestValue := baselineValue
	values := []float64{baselineValue}
	markers := make([]researchGraphMarker, 0, len(session.Trials))
	bestLine := []researchGraphMarker{{
		Trial:       0,
		Value:       baselineValue,
		RunningBest: baselineValue,
	}}
	maxTrial := 1
	for i, trial := range session.Trials {
		trialNumber := trial.Number
		if trialNumber <= 0 {
			trialNumber = i + 1
		}
		maxTrial = maxInt(maxTrial, trialNumber)
		label := researchGraphTrialLabel(trial)
		markerValue := bestValue
		noValue := trial.Value == nil
		if trial.Value != nil {
			markerValue = *trial.Value
			values = append(values, markerValue)
		}
		if trial.RunningBest != nil {
			bestValue = *trial.RunningBest
		} else if label == researchTrialLabelAccepted && trial.Value != nil {
			bestValue = *trial.Value
		}
		if noValue {
			markerValue = bestValue
		}
		values = append(values, markerValue, bestValue)
		markers = append(markers, researchGraphMarker{
			Trial:       trialNumber,
			Value:       markerValue,
			Label:       label,
			NoValue:     noValue,
			RunningBest: bestValue,
		})
		bestLine = append(bestLine, researchGraphMarker{
			Trial:       trialNumber,
			Value:       bestValue,
			RunningBest: bestValue,
		})
	}
	minValue, maxValue := researchGraphValueDomain(values)
	x := func(trial int) float64 {
		return plotLeft + (float64(trial)/float64(maxTrial))*plotWidth
	}
	y := func(value float64) float64 {
		return plotTop + ((maxValue - value) / (maxValue - minValue) * plotHeight)
	}

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%.0f" height="%.0f" viewBox="0 0 %.0f %.0f" role="img" aria-label="Tahuna research progress graph">`, width, height, width, height)
	b.WriteString("\n")
	b.WriteString(`<rect width="100%" height="100%" fill="#fbfaf7"/>` + "\n")
	fmt.Fprintf(&b, `<text x="%.0f" y="32" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="700" fill="#102326">Research progress: %s</text>`+"\n", plotLeft, svgText(metricName))
	fmt.Fprintf(&b, `<text x="%.0f" y="54" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#596965">Session %s - %s</text>`+"\n", plotLeft, svgText(session.SessionID), svgText(session.Direction))
	researchWriteGraphGrid(&b, plotLeft, plotTop, plotWidth, plotHeight, minValue, maxValue, y)
	researchWriteGraphXTicks(&b, plotLeft, plotTop, plotWidth, plotHeight, maxTrial, x)
	fmt.Fprintf(&b, `<text x="%.0f" y="%.0f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#364744" text-anchor="middle">trial number</text>`+"\n", plotLeft+plotWidth/2, height-24)
	fmt.Fprintf(&b, `<text x="18" y="%.0f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#364744" text-anchor="middle" transform="rotate(-90 18 %.0f)">%s</text>`+"\n", plotTop+plotHeight/2, plotTop+plotHeight/2, svgText(metricName))
	researchWriteRunningBestLine(&b, bestLine, x, y)
	researchWriteBaselineMarker(&b, x(0), y(baselineValue), baselineValue)
	for _, marker := range markers {
		researchWriteTrialMarker(&b, marker, x(marker.Trial), y(marker.Value))
	}
	researchWriteGraphLegend(&b, plotLeft+plotWidth-458, 28)
	b.WriteString("</svg>\n")
	return b.String(), nil
}

func researchGraphMetricName(session researchSession) string {
	if strings.TrimSpace(session.Metric.Name) != "" {
		return strings.TrimSpace(session.Metric.Name)
	}
	if strings.TrimSpace(session.Metric.Command) != "" {
		return "command metric"
	}
	return strings.TrimSpace(session.Metric.Type)
}

func researchGraphTrialLabel(trial researchTrial) string {
	label := strings.TrimSpace(trial.Label)
	if label == "" {
		label = strings.TrimSpace(trial.Status)
	}
	if trial.Value == nil && label != researchTrialLabelAccepted && label != researchTrialLabelRejected {
		return researchTrialLabelInconclusive
	}
	switch label {
	case researchTrialLabelAccepted, researchTrialLabelRejected, researchTrialLabelInconclusive:
		return label
	default:
		return researchTrialLabelInconclusive
	}
}

func researchGraphValueDomain(values []float64) (float64, float64) {
	minValue := values[0]
	maxValue := values[0]
	for _, value := range values[1:] {
		minValue = math.Min(minValue, value)
		maxValue = math.Max(maxValue, value)
	}
	if minValue == maxValue {
		pad := math.Abs(minValue) * 0.05
		if pad == 0 {
			pad = 1
		}
		return minValue - pad, maxValue + pad
	}
	pad := (maxValue - minValue) * 0.08
	return minValue - pad, maxValue + pad
}

func researchWriteGraphGrid(b *strings.Builder, left, top, width, height, minValue, maxValue float64, y func(float64) float64) {
	fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#2f3d3a" stroke-width="1.3"/>`+"\n", left, top+height, left+width, top+height)
	fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#2f3d3a" stroke-width="1.3"/>`+"\n", left, top, left, top+height)
	for i := 0; i <= 4; i++ {
		value := minValue + (maxValue-minValue)*float64(i)/4
		yy := y(value)
		fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e1ddd4" stroke-width="1"/>`+"\n", left, yy, left+width, yy)
		fmt.Fprintf(b, `<text x="78" y="%.1f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#596965" text-anchor="end" dominant-baseline="middle">%s</text>`+"\n", yy, svgText(strconvFloat(value)))
	}
}

func researchWriteGraphXTicks(b *strings.Builder, left, top, width, height float64, maxTrial int, x func(int) float64) {
	step := 1
	if maxTrial > 10 {
		step = int(math.Ceil(float64(maxTrial) / 10))
	}
	for trial := 0; trial <= maxTrial; trial += step {
		xx := x(trial)
		fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#2f3d3a" stroke-width="1"/>`+"\n", xx, top+height, xx, top+height+6)
		label := fmt.Sprintf("%d", trial)
		if trial == 0 {
			label = "baseline"
		}
		fmt.Fprintf(b, `<text x="%.1f" y="%.1f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#596965" text-anchor="middle">%s</text>`+"\n", xx, top+height+24, svgText(label))
	}
	if maxTrial%step != 0 {
		xx := x(maxTrial)
		fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#2f3d3a" stroke-width="1"/>`+"\n", xx, top+height, xx, top+height+6)
		fmt.Fprintf(b, `<text x="%.1f" y="%.1f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#596965" text-anchor="middle">%d</text>`+"\n", xx, top+height+24, maxTrial)
	}
	_ = left
	_ = width
}

func researchWriteRunningBestLine(b *strings.Builder, points []researchGraphMarker, x func(int) float64, y func(float64) float64) {
	if len(points) == 0 {
		return
	}
	b.WriteString(`<polyline fill="none" stroke="#2f6f73" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="`)
	for _, point := range points {
		fmt.Fprintf(b, "%.1f,%.1f ", x(point.Trial), y(point.RunningBest))
	}
	b.WriteString(`"/>` + "\n")
}

func researchWriteBaselineMarker(b *strings.Builder, x, y, value float64) {
	fmt.Fprintf(b, `<circle cx="%.1f" cy="%.1f" r="6" fill="#243735" stroke="#fbfaf7" stroke-width="2"/>`+"\n", x, y)
	fmt.Fprintf(b, `<text x="%.1f" y="%.1f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#243735" text-anchor="middle">baseline %s</text>`+"\n", x, y-13, svgText(strconvFloat(value)))
}

func researchWriteTrialMarker(b *strings.Builder, marker researchGraphMarker, x, y float64) {
	color := "#b76555"
	if marker.Label == researchTrialLabelAccepted {
		color = "#328760"
	} else if marker.Label == researchTrialLabelInconclusive {
		color = "#b4933f"
	}
	switch marker.Label {
	case researchTrialLabelRejected:
		fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.5" stroke-linecap="round"/>`+"\n", x-6, y-6, x+6, y+6, color)
		fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.5" stroke-linecap="round"/>`+"\n", x-6, y+6, x+6, y-6, color)
	case researchTrialLabelInconclusive:
		fmt.Fprintf(b, `<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s" stroke="#fbfaf7" stroke-width="1.5"/>`+"\n", x, y-7, x-7, y+6, x+7, y+6, color)
	default:
		fmt.Fprintf(b, `<circle cx="%.1f" cy="%.1f" r="6" fill="%s" stroke="#fbfaf7" stroke-width="2"/>`+"\n", x, y, color)
	}
	label := fmt.Sprintf("%d", marker.Trial)
	if marker.NoValue {
		label += " no value"
	}
	fmt.Fprintf(b, `<text x="%.1f" y="%.1f" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#364744" text-anchor="middle">%s</text>`+"\n", x, y-13, svgText(label))
}

func researchWriteGraphLegend(b *strings.Builder, x, y float64) {
	items := []struct {
		Label string
		Color string
		Kind  string
	}{
		{"baseline", "#243735", "circle"},
		{"accepted", "#328760", "circle"},
		{"rejected", "#b76555", "x"},
		{"inconclusive", "#b4933f", "triangle"},
		{"running best", "#2f6f73", "line"},
	}
	fmt.Fprintf(b, `<g font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#364744">`+"\n")
	for i, item := range items {
		xx := x + float64(i)*92
		switch item.Kind {
		case "line":
			fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.5" stroke-linecap="round"/>`+"\n", xx, y, xx+18, y, item.Color)
		case "x":
			fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2"/>`+"\n", xx+3, y-5, xx+13, y+5, item.Color)
			fmt.Fprintf(b, `<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2"/>`+"\n", xx+3, y+5, xx+13, y-5, item.Color)
		case "triangle":
			fmt.Fprintf(b, `<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>`+"\n", xx+8, y-6, xx+2, y+5, xx+14, y+5, item.Color)
		default:
			fmt.Fprintf(b, `<circle cx="%.1f" cy="%.1f" r="5" fill="%s"/>`+"\n", xx+8, y, item.Color)
		}
		fmt.Fprintf(b, `<text x="%.1f" y="%.1f" dominant-baseline="middle">%s</text>`+"\n", xx+22, y, svgText(item.Label))
	}
	b.WriteString("</g>\n")
}

func svgText(value string) string {
	return html.EscapeString(value)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
