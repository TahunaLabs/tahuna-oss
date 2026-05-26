package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
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
	researchSessionStatusRunning       = "running"
	researchSessionStatusRunningTrial  = "running_trial"

	researchTrialLabelAccepted     = "accepted"
	researchTrialLabelInconclusive = "inconclusive"
	researchTrialLabelRejected     = "rejected"
	researchTrialStatusRunning     = "running"
)

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
	SessionID      string               `json:"session_id"`
	CreatedAt      string               `json:"created_at"`
	Status         string               `json:"status"`
	Program        string               `json:"program"`
	Direction      string               `json:"direction"`
	Metric         researchMetricConfig `json:"metric"`
	Editable       []string             `json:"editable"`
	Budget         researchBudgetConfig `json:"budget"`
	EnvironmentID  string               `json:"environment_id,omitempty"`
	StartingCommit string               `json:"starting_commit,omitempty"`
	StartingPatch  string               `json:"starting_patch_sha256,omitempty"`
	Baseline       *researchRunResult   `json:"baseline,omitempty"`
	Incumbent      *researchIncumbent   `json:"incumbent,omitempty"`
	Trials         []researchTrial      `json:"trials"`
}

type researchWorktreeSnapshot struct {
	Diff         string
	SHA256       string
	HasUntracked bool
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
  tahuna research run --program <program.md> --metric final:<name> --minimize|--maximize --max-trials <N> --max-spend-usd <USD> --max-trial-minutes <N> --editable <path>
  tahuna research run --program <program.md> --metric-cmd <command> --minimize|--maximize --max-trials <N> --max-spend-usd <USD> --max-trial-minutes <N> --editable <path>
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
	fs.StringVar(&opts.metricCmd, "metric-cmd", "", "External metric command")
	fs.BoolVar(&opts.minimize, "minimize", false, "Minimize objective")
	fs.BoolVar(&opts.maximize, "maximize", false, "Maximize objective")
	fs.IntVar(&opts.maxTrials, "max-trials", 0, "Maximum trial count")
	fs.Float64Var(&opts.maxSpendUSD, "max-spend-usd", 0, "Maximum estimated spend in USD")
	fs.IntVar(&opts.maxTrialMinutes, "max-trial-minutes", 0, "Maximum minutes per trial")
	fs.IntVar(&opts.stopAfterNoImprovement, "stop-after-no-improvement", 0, "Stop after consecutive non-improving trials")
	fs.Float64Var(&opts.minImprovement, "min-improvement", 0, "Minimum absolute objective improvement")
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
		return errors.New("--metric-cmd scoring will be wired in the external scorer implementation slice")
	}
	environmentID, startingCommit, err := validateResearchProject(opts.editable, opts.allowDirty)
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
	if err := writeResearchPatchSnapshot(session.SessionID, "starting.patch", startingSnapshot.Diff); err != nil {
		return err
	}
	if err := saveResearchSession(session); err != nil {
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
		len(opts.editable) != 0 {
		return errors.New("--resume cannot be combined with new session flags")
	}
	return nil
}

func parseResearchMetric(metric, metricCmd string) (researchMetricConfig, error) {
	metric = strings.TrimSpace(metric)
	metricCmd = strings.TrimSpace(metricCmd)
	if (metric == "") == (metricCmd == "") {
		return researchMetricConfig{}, errors.New("exactly one of --metric or --metric-cmd is required")
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

func ensureGitWorkTree(dir string) error {
	raw, err := gitOutput(dir, "rev-parse", "--is-inside-work-tree")
	if err != nil || strings.TrimSpace(raw) != "true" {
		return errors.New("research must run inside a git repository")
	}
	return nil
}

func validateResearchDirtyFiles(dir string, editable []string) error {
	raw, err := gitOutput(dir, "status", "--porcelain", "--", ".")
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
	resp, err := createRunWithCapacityPrompt("/environments/"+session.EnvironmentID+"/runs", map[string]any{
		"name": runName,
	})
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
		Number:      trialNumber,
		Status:      researchTrialStatusRunning,
		PatchSHA256: candidate.SHA256,
		StartedAt:   time.Now().UTC().Format(time.RFC3339),
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
	resp, err := createRunWithCapacityPrompt("/environments/"+session.EnvironmentID+"/runs", map[string]any{
		"name": runName,
	})
	if err != nil {
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

	if err := monitorRunWithLogs(runID, 5); err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, fmt.Sprintf("run monitor failed: %v", err))
	}
	terminalRun, err := doJSONAs[runResponse](http.MethodGet, "/runs/"+runID, nil)
	if err != nil {
		return finishInconclusiveResearchTrial(session, trialNumber, runID, fmt.Sprintf("run status lookup failed: %v", err))
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
	diff, err := gitOutput(dir, "diff", "--binary", "HEAD", "--", ".")
	if err != nil {
		return researchWorktreeSnapshot{}, err
	}
	untracked, err := gitOutput(dir, "ls-files", "--others", "--exclude-standard", "--", ".")
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

func strconvFloat(value float64) string {
	return fmt.Sprintf("%.6f", value)
}

func researchGraph(args []string) {
	fs := flag.NewFlagSet("research graph", flag.ExitOnError)
	output := fs.String("output", "", "Output graph path")
	mustParseFlags(fs, args)
	require(len(fs.Args()) == 1, "session_id is required (usage: tahuna research graph <session-id> [--output <path>])")
	session, err := loadResearchSession(fs.Args()[0])
	must(err)
	fmt.Printf("Research session: %s\n", session.SessionID)
	if strings.TrimSpace(*output) != "" {
		fmt.Printf("Output: %s\n", strings.TrimSpace(*output))
	}
	must(errors.New("research graph rendering will be wired in the progress graph implementation slice"))
}
