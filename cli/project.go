package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

func resolveEnvironmentID() (string, error) {
	linkedEnvironmentID, err := loadLinkedEnvironmentID()
	if err != nil {
		return "", err
	}
	if linkedEnvironmentID != "" {
		return linkedEnvironmentID, nil
	}

	resp, err := doJSONAs[environmentsResponse](http.MethodGet, "/environments", nil)
	if err != nil {
		return "", err
	}

	if len(resp.Environments) == 0 {
		return "", errors.New("no environments found; run `tahuna init .` first")
	}
	return "", errors.New("no linked environment in this project; run `tahuna init .` first")
}

func projectEnvironmentFilePath() string {
	return filepath.Join(projectStateDir, projectEnvIDFile)
}

type projectConfig struct {
	DataDir                      string
	OutputDir                    string
	Framework                    string
	FrameworkVersion             string
	PythonVersion                string
	GPUType                      string
	GPUCount                     int
	VolumeGB                     int
	TrainCommand                 []string
	TrainOutputModelPath         string
	ServeCommand                 []string
	ServePythonVersion           string
	ServeGPUType                 string
	ServeGPUCount                int
	ServeVolumeGB                int
	ServePort                    int
	ServeHealthPath              string
	ServeDefaultModelPath        string
	ServeStartupTimeoutSeconds   int
	ServeHealthIntervalSeconds   int
	ServeHealthTimeoutSeconds    int
	ServeHealthFailureThreshold  int
	ServeGracefulShutdownSeconds int
}

type parsedProjectConfig struct {
	cfg     projectConfig
	file    projectConfigFile
	defined map[string]struct{}
}

type projectConfigFile struct {
	Project     *projectConfigProjectSection     `toml:"project,omitempty"`
	Environment *projectConfigEnvironmentSection `toml:"environment,omitempty"`
	Train       *projectConfigTrainSection       `toml:"train,omitempty"`
	Serve       *projectConfigServeSection       `toml:"serve,omitempty"`
}

type projectConfigProjectSection struct {
	DataDir   string `toml:"data_dir,omitempty"`
	OutputDir string `toml:"output_dir,omitempty"`
}

type projectConfigEnvironmentSection struct {
	Framework        string `toml:"framework,omitempty"`
	FrameworkVersion string `toml:"version,omitempty"`
	PythonVersion    string `toml:"python_version,omitempty"`
	GPUType          string `toml:"gpu_type,omitempty"`
	GPUCount         int    `toml:"gpu_count,omitempty"`
	VolumeGB         int    `toml:"volume_gb,omitempty"`
}

type projectConfigTrainSection struct {
	Command         []string `toml:"command,omitempty"`
	OutputModelPath string   `toml:"output_model_path,omitempty"`
}

type projectConfigServeSection struct {
	Command                 []string `toml:"command,omitempty"`
	PythonVersion           string   `toml:"python_version,omitempty"`
	GPUType                 string   `toml:"gpu_type,omitempty"`
	GPUCount                int      `toml:"gpu_count,omitempty"`
	VolumeGB                int      `toml:"volume_gb,omitempty"`
	Port                    int      `toml:"port,omitempty"`
	HealthPath              string   `toml:"health_path,omitempty"`
	DefaultModelPath        string   `toml:"default_model_path,omitempty"`
	StartupTimeoutSeconds   int      `toml:"startup_timeout_seconds,omitempty"`
	HealthIntervalSeconds   int      `toml:"health_interval_seconds,omitempty"`
	HealthTimeoutSeconds    int      `toml:"health_timeout_seconds,omitempty"`
	HealthFailureThreshold  int      `toml:"health_failure_threshold,omitempty"`
	GracefulShutdownSeconds int      `toml:"graceful_shutdown_seconds,omitempty"`
}

func normalizeProjectPath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return filepath.ToSlash(filepath.Clean(trimmed))
}

func normalizeCommandTokens(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func defaultTrainOutputModelPath(outputDir string) string {
	resolvedOutputDir := normalizeProjectPath(outputDir)
	if resolvedOutputDir == "" {
		resolvedOutputDir = "outputs"
	}
	return normalizeProjectPath(filepath.Join(filepath.FromSlash(resolvedOutputDir), "model"))
}

func validateProjectRootRelativePath(field, value string) error {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return fmt.Errorf("%s is required", field)
	}
	if !isRelativeProjectPath(cleaned) {
		return fmt.Errorf("%s must be a workspace-relative path inside the project root: %q", field, cleaned)
	}
	return nil
}

func defaultProjectConfig() projectConfig {
	return projectConfig{
		DataDir:                      "data",
		OutputDir:                    "outputs",
		PythonVersion:                "3.11",
		TrainOutputModelPath:         defaultTrainOutputModelPath("outputs"),
		ServePort:                    8000,
		ServeHealthPath:              "/health",
		ServeDefaultModelPath:        defaultTrainOutputModelPath("outputs"),
		ServeStartupTimeoutSeconds:   900,
		ServeHealthIntervalSeconds:   5,
		ServeHealthTimeoutSeconds:    2,
		ServeHealthFailureThreshold:  3,
		ServeGracefulShutdownSeconds: 30,
	}
}

func applyProjectConfigDefaults(cfg projectConfig) projectConfig {
	defaults := defaultProjectConfig()
	return mergeProjectConfig(defaults, cfg)
}

func collectProjectInitConfig() (projectConfig, string, error) {
	cfg := defaultProjectConfig()

	if fileExists("train.py") {
		fmt.Printf("✓ Found %strain.py%s\n", cAmpGold, cReset)
	} else {
		fmt.Printf("%s?%s No train.py found\n", cAmpGold, cReset)
	}

	if fileExists("inference.py") {
		fmt.Printf("✓ Found %sinference.py%s\n", cAmpGold, cReset)
	} else {
		fmt.Printf("%s?%s No inference.py found\n", cAmpGold, cReset)
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
	cfg.DataDir = normalizeProjectPath(cfg.DataDir)
	cfg.OutputDir = normalizeProjectPath(cfg.OutputDir)
	if err := validateProjectRootRelativePath("project.data_dir", cfg.DataDir); err != nil {
		return cfg, "", err
	}
	if err := validateProjectRootRelativePath("project.output_dir", cfg.OutputDir); err != nil {
		return cfg, "", err
	}
	cfg.TrainOutputModelPath = defaultTrainOutputModelPath(cfg.OutputDir)
	cfg.ServeDefaultModelPath = cfg.TrainOutputModelPath

	if fileExists("pyproject.toml") {
		fmt.Printf("✓ Found %spyproject.toml%s\n", cAmpGold, cReset)
	} else {
		fmt.Printf("%s?%s No pyproject.toml found\n", cAmpGold, cReset)
	}

	if fileExists("uv.lock") {
		fmt.Printf("✓ Found %suv.lock%s\n", cAmpGold, cReset)
	} else {
		fmt.Printf("%s?%s No uv.lock found\n", cAmpGold, cReset)
	}

	framework := detectFramework()
	if framework == "" {
		framework = promptChoice("No framework detected. PyTorch or TensorFlow?", []string{"pt", "tf"}, 0)
	} else {
		fmt.Printf("✓ Detected framework %s%s%s\n", cAmpGold, framework, cReset)
	}
	cfg.Framework = framework
	cfg.PythonVersion = detectPythonVersion()
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

func detectFramework() string {
	raw, err := os.ReadFile("pyproject.toml")
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

func detectPythonVersion() string {
	readAndExtract := func(path string) string {
		raw, err := os.ReadFile(path)
		if err != nil {
			return ""
		}
		return extractPythonVersionFromText(string(raw))
	}

	if version := readAndExtract("uv.lock"); version != "" {
		return version
	}
	return readAndExtract("pyproject.toml")
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
		for i := 0; i < len(value); i++ {
			ch := value[i]
			if ch < '0' || ch > '9' {
				continue
			}
			// Try to match major.minor where minor can be multi-digit (e.g. 3.11).
			segment := value[i:]
			dotIdx := strings.Index(segment, ".")
			if dotIdx < 1 {
				continue
			}
			major := segment[:dotIdx]
			rest := segment[dotIdx+1:]
			minorLen := 0
			for minorLen < len(rest) && rest[minorLen] >= '0' && rest[minorLen] <= '9' {
				minorLen++
			}
			if minorLen == 0 {
				continue
			}
			return major + "." + rest[:minorLen]
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
	return projectCfgFile
}

func saveProjectConfig(cfg projectConfig) error {
	path := projectConfigFilePath()
	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	rendered, err := renderProjectConfig(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, []byte(rendered), 0o600)
}

func readProjectConfigFile(path string) (parsedProjectConfig, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return parsedProjectConfig{}, err
	}
	parsed, err := parseProjectConfigTOML(string(raw))
	if err != nil {
		return parsedProjectConfig{}, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	return parsed, nil
}

func loadPersistedProjectConfig() (projectConfig, error) {
	parsed, err := readProjectConfigFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return projectConfig{}, nil
		}
		return projectConfig{}, err
	}
	return parsed.cfg, nil
}

func loadProjectConfig() (projectConfig, error) {
	cfg := defaultProjectConfig()

	parsed, err := readProjectConfigFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}

	return applyProjectConfigDefaults(parsed.cfg), nil
}

func validateProjectConfigBindings(environmentID string) (projectConfig, error) {
	path := projectConfigFilePath()
	parsed, err := readProjectConfigFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return projectConfig{}, fmt.Errorf("missing %s; run `tahuna init .` to restore project bindings", path)
		}
		return projectConfig{}, err
	}
	if err := validateRequiredProjectConfigValues(path, parsed.file, parsed.defined); err != nil {
		return parsed.cfg, err
	}
	cfg := applyProjectConfigDefaults(parsed.cfg)
	if err := validateProjectConfigRuntimeValues(path, cfg); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigDirectoryBinding("project.data_dir", cfg.DataDir); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigDirectoryBinding("project.output_dir", cfg.OutputDir); err != nil {
		return cfg, err
	}
	if err := validateCanonicalProjectFile("train.py"); err != nil {
		return cfg, err
	}
	if err := validateCanonicalProjectFile("inference.py"); err != nil {
		return cfg, err
	}
	if err := validateCanonicalProjectFile("pyproject.toml"); err != nil {
		return cfg, err
	}
	if err := validateCanonicalProjectFile("uv.lock"); err != nil {
		return cfg, err
	}
	if err := validateProjectSubpathBinding("train.output_model_path", cfg.TrainOutputModelPath, cfg.OutputDir); err != nil {
		return cfg, err
	}
	if strings.TrimSpace(cfg.ServeDefaultModelPath) != "" {
		if err := validateProjectSubpathBinding("serve.default_model_path", cfg.ServeDefaultModelPath, cfg.OutputDir); err != nil {
			return cfg, err
		}
	}
	if strings.TrimSpace(cfg.ServeGPUType) != "" {
		if cfg.ServeGPUCount < 1 {
			return cfg, fmt.Errorf("invalid serve.gpu_count in %s: expected a positive integer", path)
		}
		if cfg.ServeVolumeGB < 1 {
			return cfg, fmt.Errorf("invalid serve.volume_gb in %s: expected a positive integer", path)
		}
	} else if cfg.ServeGPUCount > 0 || cfg.ServeVolumeGB > 0 {
		return cfg, fmt.Errorf("serve.gpu_type, serve.gpu_count, and serve.volume_gb must be set together in %s", path)
	}
	if strings.TrimSpace(cfg.ServeGPUType) == "" && cfg.ServeGPUCount == 0 && cfg.ServeVolumeGB == 0 {
		// Serving is implemented in later PRs; allow migrated projects to omit explicit serve compute for now.
	} else if strings.TrimSpace(cfg.ServeGPUType) == "" || cfg.ServeGPUCount == 0 || cfg.ServeVolumeGB == 0 {
		return cfg, fmt.Errorf("serve.gpu_type, serve.gpu_count, and serve.volume_gb must be set together in %s", path)
	}
	if !strings.HasPrefix(strings.TrimSpace(cfg.ServeHealthPath), "/") {
		return cfg, fmt.Errorf("invalid serve.health_path in %s: expected an absolute HTTP path beginning with /", path)
	}
	if cfg.ServePort < 1 || cfg.ServePort > 65535 {
		return cfg, fmt.Errorf("invalid serve.port %d in %s: expected 1-65535", cfg.ServePort, path)
	}
	if cfg.ServeStartupTimeoutSeconds < 1 ||
		cfg.ServeHealthIntervalSeconds < 1 ||
		cfg.ServeHealthTimeoutSeconds < 1 ||
		cfg.ServeHealthFailureThreshold < 1 ||
		cfg.ServeGracefulShutdownSeconds < 1 {
		return cfg, fmt.Errorf("invalid serve timing values in %s: all serve timeouts and thresholds must be positive integers", path)
	}
	if strings.TrimSpace(cfg.ServePythonVersion) != "" && !isSimplePythonVersion(strings.TrimSpace(cfg.ServePythonVersion)) {
		return cfg, fmt.Errorf("invalid serve.python_version %q in %s: expected major.minor (for example 3.11)", cfg.ServePythonVersion, path)
	}
	if cfg.ServeHealthTimeoutSeconds > cfg.ServeHealthIntervalSeconds {
		return cfg, fmt.Errorf("invalid serve health timing in %s: health_timeout_seconds must be <= health_interval_seconds", path)
	}
	if cfg.ServeStartupTimeoutSeconds < cfg.ServeHealthIntervalSeconds {
		return cfg, fmt.Errorf("invalid serve.startup_timeout_seconds in %s: must be >= health_interval_seconds", path)
	}
	if cfg.ServeGracefulShutdownSeconds > cfg.ServeStartupTimeoutSeconds {
		return cfg, fmt.Errorf("invalid serve.graceful_shutdown_seconds in %s: must be <= startup_timeout_seconds", path)
	}
	if cfg.TrainOutputModelPath == "" {
		return cfg, fmt.Errorf("missing train.output_model_path binding in %s", path)
	}
	if cfg.ServeDefaultModelPath == "" {
		return cfg, fmt.Errorf("missing serve.default_model_path binding in %s", path)
	}
	if cfg.ServeHealthPath == "" {
		return cfg, fmt.Errorf("missing serve.health_path binding in %s", path)
	}
	if cfg.ServePort == 0 {
		return cfg, fmt.Errorf("missing serve.port binding in %s", path)
	}
	if cfg.ServeHealthIntervalSeconds == 0 ||
		cfg.ServeHealthTimeoutSeconds == 0 ||
		cfg.ServeHealthFailureThreshold == 0 ||
		cfg.ServeStartupTimeoutSeconds == 0 ||
		cfg.ServeGracefulShutdownSeconds == 0 {
		return cfg, fmt.Errorf("missing serve timing bindings in %s", path)
	}
	if cfg.ServePythonVersion == "" {
		cfg.ServePythonVersion = cfg.PythonVersion
	}
	if !isSimplePythonVersion(cfg.ServePythonVersion) {
		return cfg, fmt.Errorf("invalid serve.python_version %q in %s: expected major.minor (for example 3.11)", cfg.ServePythonVersion, path)
	}

	// Validate framework+version+python combo against the catalog.
	resolved, err := validateAndResolveRuntimeConfig(cfg, environmentID)
	if err != nil {
		return cfg, err
	}

	// If resolution changed the local config, save it.
	if resolved.Framework != cfg.Framework || resolved.FrameworkVersion != cfg.FrameworkVersion || resolved.PythonVersion != cfg.PythonVersion {
		if saveErr := saveProjectConfig(resolved); saveErr != nil {
			return resolved, fmt.Errorf("failed to save updated project config: %w", saveErr)
		}
	}

	// Sync runtime config to the remote environment if it differs.
	if environmentID != "" {
		needsUpdate := false
		if env, envErr := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil); envErr == nil {
			remoteFramework := strings.TrimSpace(env.Framework)
			remoteVersion := strings.TrimSpace(env.Version)
			remotePython := strings.TrimSpace(env.PythonVersion)
			needsUpdate = remoteFramework != resolved.Framework ||
				remoteVersion != resolved.FrameworkVersion ||
				remotePython != resolved.PythonVersion
		}
		if needsUpdate {
			payload := map[string]any{
				"python_version": resolved.PythonVersion,
				"framework":      resolved.Framework,
				"version":        resolved.FrameworkVersion,
			}
			if _, updateErr := doJSON(http.MethodPatch, "/environments/"+environmentID, payload); updateErr != nil {
				return resolved, fmt.Errorf("failed to update environment runtime config: %w", updateErr)
			}
			fmt.Printf("%s✓%s Environment updated: %s %s, Python %s\n", cAmpGreen, cReset, resolved.Framework, resolved.FrameworkVersion, resolved.PythonVersion)
		}
		if err := syncLinkedLocalProjectConfig(environmentID); err != nil {
			return resolved, fmt.Errorf("failed to refresh local project config: %w", err)
		}
	}

	return resolved, nil
}

func mergeProjectConfig(base, next projectConfig) projectConfig {
	if value := strings.TrimSpace(next.DataDir); value != "" {
		base.DataDir = normalizeProjectPath(value)
	}
	if value := strings.TrimSpace(next.OutputDir); value != "" {
		base.OutputDir = normalizeProjectPath(value)
	}
	if value := strings.TrimSpace(next.Framework); value != "" {
		base.Framework = value
	}
	if value := strings.TrimSpace(next.FrameworkVersion); value != "" {
		base.FrameworkVersion = value
	}
	if value := strings.TrimSpace(next.PythonVersion); value != "" {
		base.PythonVersion = value
	}
	if value := strings.TrimSpace(next.GPUType); value != "" {
		base.GPUType = value
	}
	if next.GPUCount > 0 {
		base.GPUCount = next.GPUCount
	}
	if next.VolumeGB > 0 {
		base.VolumeGB = next.VolumeGB
	}
	if len(next.TrainCommand) > 0 {
		base.TrainCommand = append([]string{}, normalizeCommandTokens(next.TrainCommand)...)
	}
	if value := strings.TrimSpace(next.TrainOutputModelPath); value != "" {
		base.TrainOutputModelPath = normalizeProjectPath(value)
	}
	if len(next.ServeCommand) > 0 {
		base.ServeCommand = append([]string{}, normalizeCommandTokens(next.ServeCommand)...)
	}
	if value := strings.TrimSpace(next.ServePythonVersion); value != "" {
		base.ServePythonVersion = value
	}
	if value := strings.TrimSpace(next.ServeGPUType); value != "" {
		base.ServeGPUType = value
	}
	if next.ServeGPUCount > 0 {
		base.ServeGPUCount = next.ServeGPUCount
	}
	if next.ServeVolumeGB > 0 {
		base.ServeVolumeGB = next.ServeVolumeGB
	}
	if next.ServePort > 0 {
		base.ServePort = next.ServePort
	}
	if value := strings.TrimSpace(next.ServeHealthPath); value != "" {
		base.ServeHealthPath = value
	}
	if value := strings.TrimSpace(next.ServeDefaultModelPath); value != "" {
		base.ServeDefaultModelPath = normalizeProjectPath(value)
	}
	if next.ServeStartupTimeoutSeconds > 0 {
		base.ServeStartupTimeoutSeconds = next.ServeStartupTimeoutSeconds
	}
	if next.ServeHealthIntervalSeconds > 0 {
		base.ServeHealthIntervalSeconds = next.ServeHealthIntervalSeconds
	}
	if next.ServeHealthTimeoutSeconds > 0 {
		base.ServeHealthTimeoutSeconds = next.ServeHealthTimeoutSeconds
	}
	if next.ServeHealthFailureThreshold > 0 {
		base.ServeHealthFailureThreshold = next.ServeHealthFailureThreshold
	}
	if next.ServeGracefulShutdownSeconds > 0 {
		base.ServeGracefulShutdownSeconds = next.ServeGracefulShutdownSeconds
	}
	return base
}

func hasEnvironmentSection(cfg projectConfig) bool {
	return strings.TrimSpace(cfg.Framework) != "" ||
		strings.TrimSpace(cfg.FrameworkVersion) != "" ||
		strings.TrimSpace(cfg.PythonVersion) != "" ||
		strings.TrimSpace(cfg.GPUType) != "" ||
		cfg.GPUCount > 0 ||
		cfg.VolumeGB > 0
}

func hasProjectSection(cfg projectConfig) bool {
	return strings.TrimSpace(cfg.DataDir) != "" ||
		strings.TrimSpace(cfg.OutputDir) != ""
}

func hasTrainSection(cfg projectConfig) bool {
	return len(cfg.TrainCommand) > 0 || strings.TrimSpace(cfg.TrainOutputModelPath) != ""
}

func hasServeSection(cfg projectConfig) bool {
	return len(cfg.ServeCommand) > 0 ||
		strings.TrimSpace(cfg.ServePythonVersion) != "" ||
		strings.TrimSpace(cfg.ServeGPUType) != "" ||
		cfg.ServeGPUCount > 0 ||
		cfg.ServeVolumeGB > 0 ||
		cfg.ServePort > 0 ||
		strings.TrimSpace(cfg.ServeHealthPath) != "" ||
		strings.TrimSpace(cfg.ServeDefaultModelPath) != "" ||
		cfg.ServeStartupTimeoutSeconds > 0 ||
		cfg.ServeHealthIntervalSeconds > 0 ||
		cfg.ServeHealthTimeoutSeconds > 0 ||
		cfg.ServeHealthFailureThreshold > 0 ||
		cfg.ServeGracefulShutdownSeconds > 0
}

func escapeProjectConfigValue(value string) string {
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"\"", "\\\"",
		"\n", "\\n",
		"\r", "\\r",
		"\t", "\\t",
	)
	return replacer.Replace(value)
}

func renderTomlStringArray(values []string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, fmt.Sprintf("\"%s\"", escapeProjectConfigValue(value)))
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

func renderProjectConfig(cfg projectConfig) (string, error) {
	lines := []string{"# Generated from local Tahuna project state."}
	if hasProjectSection(cfg) {
		lines = append(lines, "[project]")
		if value := strings.TrimSpace(cfg.DataDir); value != "" {
			lines = append(lines, fmt.Sprintf("data_dir = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.OutputDir); value != "" {
			lines = append(lines, fmt.Sprintf("output_dir = \"%s\"", escapeProjectConfigValue(value)))
		}
	}
	if hasEnvironmentSection(cfg) {
		if len(lines) > 1 {
			lines = append(lines, "")
		}
		lines = append(lines, "[environment]")
		if value := strings.TrimSpace(cfg.Framework); value != "" {
			lines = append(lines, fmt.Sprintf("framework = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.FrameworkVersion); value != "" {
			lines = append(lines, fmt.Sprintf("version = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.PythonVersion); value != "" {
			lines = append(lines, fmt.Sprintf("python_version = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.GPUType); value != "" {
			lines = append(lines, fmt.Sprintf("gpu_type = \"%s\"", escapeProjectConfigValue(value)))
		}
		if cfg.GPUCount > 0 {
			lines = append(lines, fmt.Sprintf("gpu_count = %d", cfg.GPUCount))
		}
		if cfg.VolumeGB > 0 {
			lines = append(lines, fmt.Sprintf("volume_gb = %d", cfg.VolumeGB))
		}
	}
	if hasTrainSection(cfg) {
		if len(lines) > 1 {
			lines = append(lines, "")
		}
		lines = append(lines, "[train]")
		if len(cfg.TrainCommand) > 0 {
			lines = append(lines, fmt.Sprintf("command = %s", renderTomlStringArray(cfg.TrainCommand)))
		}
		if value := strings.TrimSpace(cfg.TrainOutputModelPath); value != "" {
			lines = append(lines, fmt.Sprintf("output_model_path = \"%s\"", escapeProjectConfigValue(value)))
		}
	}
	if hasServeSection(cfg) {
		defaults := defaultProjectConfig()
		if len(lines) > 1 {
			lines = append(lines, "")
		}
		lines = append(lines, "[serve]")
		if len(cfg.ServeCommand) > 0 {
			lines = append(lines, fmt.Sprintf("command = %s", renderTomlStringArray(cfg.ServeCommand)))
		}
		if value := strings.TrimSpace(cfg.ServePythonVersion); value != "" && value != strings.TrimSpace(cfg.PythonVersion) {
			lines = append(lines, fmt.Sprintf("python_version = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.ServeGPUType); value != "" {
			lines = append(lines, fmt.Sprintf("gpu_type = \"%s\"", escapeProjectConfigValue(value)))
		}
		if cfg.ServeGPUCount > 0 {
			lines = append(lines, fmt.Sprintf("gpu_count = %d", cfg.ServeGPUCount))
		}
		if cfg.ServeVolumeGB > 0 {
			lines = append(lines, fmt.Sprintf("volume_gb = %d", cfg.ServeVolumeGB))
		}
		if cfg.ServePort > 0 && cfg.ServePort != defaults.ServePort {
			lines = append(lines, fmt.Sprintf("port = %d", cfg.ServePort))
		}
		if value := strings.TrimSpace(cfg.ServeHealthPath); value != "" && value != defaults.ServeHealthPath {
			lines = append(lines, fmt.Sprintf("health_path = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.ServeDefaultModelPath); value != "" && value != defaults.ServeDefaultModelPath {
			lines = append(lines, fmt.Sprintf("default_model_path = \"%s\"", escapeProjectConfigValue(value)))
		}
		if cfg.ServeStartupTimeoutSeconds > 0 && cfg.ServeStartupTimeoutSeconds != defaults.ServeStartupTimeoutSeconds {
			lines = append(lines, fmt.Sprintf("startup_timeout_seconds = %d", cfg.ServeStartupTimeoutSeconds))
		}
		if cfg.ServeHealthIntervalSeconds > 0 && cfg.ServeHealthIntervalSeconds != defaults.ServeHealthIntervalSeconds {
			lines = append(lines, fmt.Sprintf("health_interval_seconds = %d", cfg.ServeHealthIntervalSeconds))
		}
		if cfg.ServeHealthTimeoutSeconds > 0 && cfg.ServeHealthTimeoutSeconds != defaults.ServeHealthTimeoutSeconds {
			lines = append(lines, fmt.Sprintf("health_timeout_seconds = %d", cfg.ServeHealthTimeoutSeconds))
		}
		if cfg.ServeHealthFailureThreshold > 0 && cfg.ServeHealthFailureThreshold != defaults.ServeHealthFailureThreshold {
			lines = append(lines, fmt.Sprintf("health_failure_threshold = %d", cfg.ServeHealthFailureThreshold))
		}
		if cfg.ServeGracefulShutdownSeconds > 0 && cfg.ServeGracefulShutdownSeconds != defaults.ServeGracefulShutdownSeconds {
			lines = append(lines, fmt.Sprintf("graceful_shutdown_seconds = %d", cfg.ServeGracefulShutdownSeconds))
		}
	}
	return strings.Join(lines, "\n") + "\n", nil
}

func parseProjectConfigTOML(text string) (parsedProjectConfig, error) {
	var file projectConfigFile
	meta, err := toml.Decode(text, &file)
	if err != nil {
		return parsedProjectConfig{}, err
	}
	if undecoded := meta.Undecoded(); len(undecoded) > 0 {
		return parsedProjectConfig{}, fmt.Errorf("unsupported key in %s: %s", projectConfigFilePath(), formatUndecodedTomlKeys(undecoded))
	}
	defined := collectDefinedTomlKeys(meta)
	if err := validateProjectConfigFile(file, defined); err != nil {
		return parsedProjectConfig{}, err
	}
	return parsedProjectConfig{
		cfg:     projectConfigFromFile(file),
		file:    file,
		defined: defined,
	}, nil
}

func validateRequiredProjectConfigValues(path string, file projectConfigFile, defined map[string]struct{}) error {
	missing := []string{}
	empty := []string{}
	appendRequiredStringBinding(defined, &missing, &empty, "project.data_dir", file.ProjectValue().DataDir)
	appendRequiredStringBinding(defined, &missing, &empty, "project.output_dir", file.ProjectValue().OutputDir)
	appendRequiredStringBinding(defined, &missing, &empty, "environment.framework", file.EnvironmentValue().Framework)
	appendRequiredStringBinding(defined, &missing, &empty, "environment.version", file.EnvironmentValue().FrameworkVersion)
	appendRequiredStringBinding(defined, &missing, &empty, "environment.python_version", file.EnvironmentValue().PythonVersion)
	appendRequiredStringBinding(defined, &missing, &empty, "environment.gpu_type", file.EnvironmentValue().GPUType)
	appendRequiredBinding(defined, &missing, "environment.gpu_count")
	appendRequiredBinding(defined, &missing, "environment.volume_gb")
	if len(missing) > 0 {
		return fmt.Errorf("%s is missing required binding keys: %s; run `tahuna init .` to restore project bindings", path, strings.Join(missing, ", "))
	}
	if len(empty) > 0 {
		return fmt.Errorf("%s has empty required binding values: %s; run `tahuna init .` to restore project bindings", path, strings.Join(empty, ", "))
	}
	return nil
}

func projectConfigFromFile(file projectConfigFile) projectConfig {
	cfg := projectConfig{}
	if file.Project != nil {
		cfg.DataDir = normalizeProjectPath(file.Project.DataDir)
		cfg.OutputDir = normalizeProjectPath(file.Project.OutputDir)
	}
	if file.Environment != nil {
		cfg.Framework = file.Environment.Framework
		cfg.FrameworkVersion = file.Environment.FrameworkVersion
		cfg.PythonVersion = file.Environment.PythonVersion
		cfg.GPUType = file.Environment.GPUType
		cfg.GPUCount = file.Environment.GPUCount
		cfg.VolumeGB = file.Environment.VolumeGB
	}
	if file.Train != nil {
		cfg.TrainCommand = normalizeCommandTokens(file.Train.Command)
		cfg.TrainOutputModelPath = normalizeProjectPath(file.Train.OutputModelPath)
	}
	if file.Serve != nil {
		cfg.ServeCommand = normalizeCommandTokens(file.Serve.Command)
		cfg.ServePythonVersion = file.Serve.PythonVersion
		cfg.ServeGPUType = file.Serve.GPUType
		cfg.ServeGPUCount = file.Serve.GPUCount
		cfg.ServeVolumeGB = file.Serve.VolumeGB
		cfg.ServePort = file.Serve.Port
		cfg.ServeHealthPath = file.Serve.HealthPath
		cfg.ServeDefaultModelPath = normalizeProjectPath(file.Serve.DefaultModelPath)
		cfg.ServeStartupTimeoutSeconds = file.Serve.StartupTimeoutSeconds
		cfg.ServeHealthIntervalSeconds = file.Serve.HealthIntervalSeconds
		cfg.ServeHealthTimeoutSeconds = file.Serve.HealthTimeoutSeconds
		cfg.ServeHealthFailureThreshold = file.Serve.HealthFailureThreshold
		cfg.ServeGracefulShutdownSeconds = file.Serve.GracefulShutdownSeconds
	}
	return cfg
}

func validateProjectConfigFile(file projectConfigFile, defined map[string]struct{}) error {
	if file.Train != nil && tomlKeyDefined(defined, "train.command") {
		if len(file.Train.Command) == 0 {
			return fmt.Errorf("invalid train.command in %s: expected at least one command token", projectConfigFilePath())
		}
		for _, token := range file.Train.Command {
			if strings.TrimSpace(token) == "" {
				return fmt.Errorf("invalid train.command in %s: command tokens must be non-empty strings", projectConfigFilePath())
			}
		}
	}
	if file.Environment != nil {
		if err := validateConfiguredPositiveInt(defined, "environment.gpu_count", file.Environment.GPUCount); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "environment.volume_gb", file.Environment.VolumeGB); err != nil {
			return err
		}
	}
	if file.Serve != nil {
		if tomlKeyDefined(defined, "serve.command") {
			if len(file.Serve.Command) == 0 {
				return fmt.Errorf("invalid serve.command in %s: expected at least one command token", projectConfigFilePath())
			}
			for _, token := range file.Serve.Command {
				if strings.TrimSpace(token) == "" {
					return fmt.Errorf("invalid serve.command in %s: command tokens must be non-empty strings", projectConfigFilePath())
				}
			}
		}
		if err := validateConfiguredPositiveInt(defined, "serve.gpu_count", file.Serve.GPUCount); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.volume_gb", file.Serve.VolumeGB); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.port", file.Serve.Port); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.startup_timeout_seconds", file.Serve.StartupTimeoutSeconds); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.health_interval_seconds", file.Serve.HealthIntervalSeconds); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.health_timeout_seconds", file.Serve.HealthTimeoutSeconds); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.health_failure_threshold", file.Serve.HealthFailureThreshold); err != nil {
			return err
		}
		if err := validateConfiguredPositiveInt(defined, "serve.graceful_shutdown_seconds", file.Serve.GracefulShutdownSeconds); err != nil {
			return err
		}
	}
	return nil
}

func validateConfiguredPositiveInt(defined map[string]struct{}, field string, value int) error {
	if tomlKeyDefined(defined, field) && value < 1 {
		return fmt.Errorf("invalid %s in %s: expected a positive integer", field, projectConfigFilePath())
	}
	return nil
}

func appendRequiredBinding(defined map[string]struct{}, missing *[]string, fullKey string) {
	if !tomlKeyDefined(defined, fullKey) {
		*missing = append(*missing, fullKey)
	}
}

func appendRequiredStringBinding(defined map[string]struct{}, missing, empty *[]string, fullKey, value string) {
	if !tomlKeyDefined(defined, fullKey) {
		*missing = append(*missing, fullKey)
		return
	}
	if strings.TrimSpace(value) == "" {
		*empty = append(*empty, fullKey)
	}
}

func (file projectConfigFile) ProjectValue() projectConfigProjectSection {
	if file.Project == nil {
		return projectConfigProjectSection{}
	}
	return *file.Project
}

func (file projectConfigFile) EnvironmentValue() projectConfigEnvironmentSection {
	if file.Environment == nil {
		return projectConfigEnvironmentSection{}
	}
	return *file.Environment
}

func formatUndecodedTomlKeys(keys []toml.Key) string {
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key.String())
	}
	return strings.Join(parts, ", ")
}

func collectDefinedTomlKeys(meta toml.MetaData) map[string]struct{} {
	defined := make(map[string]struct{}, len(meta.Keys()))
	for _, key := range meta.Keys() {
		defined[key.String()] = struct{}{}
	}
	return defined
}

func tomlKeyDefined(defined map[string]struct{}, key string) bool {
	_, ok := defined[key]
	return ok
}

func validateProjectConfigRuntimeValues(path string, cfg projectConfig) error {
	framework := strings.ToLower(strings.TrimSpace(cfg.Framework))
	switch framework {
	case "pt", "tf":
	default:
		return fmt.Errorf("invalid framework in %s: expected pt or tf", path)
	}

	version := strings.TrimSpace(cfg.PythonVersion)
	if !isSimplePythonVersion(version) {
		return fmt.Errorf("invalid python_version %q in %s: expected major.minor (for example 3.11)", cfg.PythonVersion, path)
	}
	return nil
}

// validateAndResolveRuntimeConfig checks whether the project's framework, framework
// version, and python version form a supported combination. When the combination is
// invalid and the session is interactive, the user is prompted to pick a valid one.
// Returns the (possibly updated) project config.
func validateAndResolveRuntimeConfig(cfg projectConfig, environmentID string) (projectConfig, error) {
	_, versionsByFramework, pythonsByFrameworkVersion, err := fetchGpusAndImages()
	if err != nil {
		// If the catalog is unreachable, skip combo validation. The backend will
		// still reject unsupported combinations at environment/run creation time.
		return cfg, nil
	}

	framework := strings.TrimSpace(cfg.Framework)
	frameworkVersion := strings.TrimSpace(cfg.FrameworkVersion)
	pythonVersion := strings.TrimSpace(cfg.PythonVersion)

	// If version is missing locally (older project), fetch from environment.
	if frameworkVersion == "" && environmentID != "" {
		env, envErr := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil)
		if envErr == nil {
			frameworkVersion = strings.TrimSpace(env.Version)
			cfg.FrameworkVersion = frameworkVersion
		}
	}

	// Validate framework exists in catalog.
	versions, frameworkOK := versionsByFramework[framework]
	if !frameworkOK {
		if !supportsInteractivePrompts() {
			return cfg, fmt.Errorf("unsupported framework %q; supported: %s", framework, strings.Join(sortedKeys(versionsByFramework), ", "))
		}
		fmt.Printf("\n%sUnsupported framework %q.%s\n", cAmpGold, framework, cReset)
		framework = promptChoice("Select framework", sortedKeys(versionsByFramework), 0)
		cfg.Framework = framework
		versions = versionsByFramework[framework]
		frameworkVersion = ""
		pythonVersion = ""
	}

	// Validate framework version exists in catalog.
	pythons := pythonsByFrameworkVersion[framework][frameworkVersion]
	if len(pythons) == 0 {
		if !supportsInteractivePrompts() {
			return cfg, fmt.Errorf("unsupported framework version %q for %s; supported: %s", frameworkVersion, framework, strings.Join(versions, ", "))
		}
		if frameworkVersion != "" {
			fmt.Printf("\n%sFramework version %q is not available for %s.%s\n", cAmpGold, frameworkVersion, framework, cReset)
		} else {
			fmt.Printf("\n%sNo framework version configured for %s.%s\n", cAmpGold, framework, cReset)
		}
		frameworkVersion = promptChoice("Select framework version", versions, 0)
		cfg.FrameworkVersion = frameworkVersion
		pythons = pythonsByFrameworkVersion[framework][frameworkVersion]
		pythonVersion = ""
	}

	// Validate python version is supported for this framework+version combo.
	if pythonVersion != "" {
		found := false
		for _, py := range pythons {
			if py == pythonVersion {
				found = true
				break
			}
		}
		if !found {
			if !supportsInteractivePrompts() {
				return cfg, fmt.Errorf("unsupported python version %q for %s %s; supported: %s", pythonVersion, framework, frameworkVersion, strings.Join(pythons, ", "))
			}
			fmt.Printf("\n%sPython %s is not supported for %s %s.%s\n", cAmpGold, pythonVersion, framework, frameworkVersion, cReset)
			fmt.Printf("Supported Python versions: %s\n", strings.Join(pythons, ", "))
			pythonVersion = promptChoice("Select Python version", pythons, 0)
			cfg.PythonVersion = pythonVersion
		}
	} else {
		if !supportsInteractivePrompts() {
			return cfg, fmt.Errorf("python version is required; supported for %s %s: %s", framework, frameworkVersion, strings.Join(pythons, ", "))
		}
		pythonVersion = promptChoice("Select Python version", pythons, 0)
		cfg.PythonVersion = pythonVersion
	}

	return cfg, nil
}

func isRelativeProjectPath(value string) bool {
	cleaned := filepath.Clean(filepath.FromSlash(strings.TrimSpace(value)))
	if cleaned == "." {
		return true
	}
	return !filepath.IsAbs(cleaned) && cleaned != ".." && !strings.HasPrefix(cleaned, ".."+string(filepath.Separator))
}

func validateProjectConfigDirectoryBinding(field, value string) error {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return fmt.Errorf("missing %s binding in %s", field, projectConfigFilePath())
	}
	if !isRelativeProjectPath(cleaned) {
		return fmt.Errorf("%s must be a workspace-relative path inside the project root: %q", field, cleaned)
	}
	info, err := os.Stat(filepath.FromSlash(cleaned))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%s binding points to missing path %q", field, cleaned)
		}
		return fmt.Errorf("failed to read %s binding path %q: %w", field, cleaned, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s binding must point to a directory: %q", field, cleaned)
	}
	return nil
}

func validateCanonicalProjectFile(path string) error {
	if !fileExists(path) {
		return fmt.Errorf("missing required project file %q", path)
	}
	return nil
}

func validateProjectSubpathBinding(field, value, root string) error {
	cleanedValue := strings.TrimSpace(value)
	cleanedRoot := strings.TrimSpace(root)
	if cleanedValue == "" {
		return fmt.Errorf("missing %s binding in %s", field, projectConfigFilePath())
	}
	if !isRelativeProjectPath(cleanedValue) {
		return fmt.Errorf("%s must be a workspace-relative path inside the project root: %q", field, cleanedValue)
	}
	if !isRelativeProjectPath(cleanedRoot) {
		return fmt.Errorf("invalid project.output_dir binding %q", cleanedRoot)
	}
	rel, err := filepath.Rel(filepath.FromSlash(cleanedRoot), filepath.FromSlash(cleanedValue))
	if err != nil {
		return fmt.Errorf("failed to validate %s %q: %w", field, cleanedValue, err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("%s must stay under project.output_dir (%q): %q", field, cleanedRoot, cleanedValue)
	}
	return nil
}

func isSimplePythonVersion(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
		for _, r := range part {
			if r < '0' || r > '9' {
				return false
			}
		}
	}
	return true
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

func defaultPyProjectTemplate(framework string) string {
	dependency := "torch"
	if framework == "tf" {
		dependency = "tensorflow"
	}
	return fmt.Sprintf(`[project]
name = %q
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []

[dependency-groups]
train = [
  %q,
]
serve = []
`, filepath.Base(mustGetwd()), dependency)
}

func ensureUVLockFile() error {
	if fileExists("uv.lock") {
		return nil
	}
	if !fileExists("pyproject.toml") {
		return errors.New("pyproject.toml not found; rerun `tahuna init`")
	}

	cmd := exec.Command("uv", "lock", "--project", ".")
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
	return nil
}

func defaultTrainEntrypointTemplate(cfg projectConfig) string {
	return fmt.Sprintf("print(\"Tahuna training entrypoint\")\nprint(\"data dir: %s\")\n", cfg.DataDir)
}

func defaultInferenceEntrypointTemplate(cfg projectConfig) string {
	healthPath := strings.TrimSpace(cfg.ServeHealthPath)
	if healthPath == "" {
		healthPath = "/health"
	}
	modelPath := strings.TrimSpace(cfg.ServeDefaultModelPath)
	if modelPath == "" {
		modelPath = defaultTrainOutputModelPath(cfg.OutputDir)
	}
	if modelPath == "" {
		modelPath = "outputs/model"
	}
	return fmt.Sprintf(`import json
import logging
import os
import signal
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("TAHUNA_SERVE_PORT", "%d"))
HEALTH_PATH = os.environ.get("TAHUNA_SERVE_HEALTH_PATH", %q)
MODEL_ROOT = Path(os.environ.get("TAHUNA_MODEL_ROOT", %q)).resolve()
PREDICT_PATH = "/predict"

logging.basicConfig(
    level=os.environ.get("TAHUNA_LOG_LEVEL", "INFO").upper(),
    format="%%(asctime)s %%(levelname)s %%(message)s",
)
LOGGER = logging.getLogger("tahuna.inference")


class ModelServer:
    def __init__(self):
        self.ready = False
        self.startup_error = ""
        self.model_root = MODEL_ROOT
        self.model_example_file = ""

    def load(self):
        if not self.model_root.exists():
            raise RuntimeError(
                f"model root not found: {self.model_root}. "
                "Tahuna mounts the pinned serve snapshot at TAHUNA_MODEL_ROOT."
            )
        first_file = next((path for path in self.model_root.rglob("*") if path.is_file()), None)
        if first_file is None:
            raise RuntimeError(
                f"model root is empty: {self.model_root}. "
                "Check train.output_model_path and serve.default_model_path."
            )
        self.model_example_file = str(first_file.relative_to(self.model_root))
        self.ready = True
        LOGGER.info("model_root=%%s example_file=%%s", self.model_root, self.model_example_file)

    def predict(self, payload):
        raise NotImplementedError(
            "replace ModelServer.predict with model inference logic that reads from TAHUNA_MODEL_ROOT"
        )


APP = ModelServer()


class Handler(BaseHTTPRequestHandler):
    server_version = "TahunaInference/0.1"

    def log_message(self, format, *args):
        LOGGER.info("http %%s - " + format, self.address_string(), *args)

    def _write_json(self, status, payload):
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        if self.path == "/":
            self._write_json(
                HTTPStatus.OK,
                {
                    "service": "tahuna-inference",
                    "health_path": HEALTH_PATH,
                    "predict_path": PREDICT_PATH,
                    "model_root": str(APP.model_root),
                },
            )
            return
        if self.path == HEALTH_PATH:
            payload = {
                "status": "ok" if APP.ready else "starting",
                "model_root": str(APP.model_root),
                "model_example_file": APP.model_example_file,
                "predict_path": PREDICT_PATH,
            }
            if APP.startup_error:
                payload["error"] = APP.startup_error
            self._write_json(HTTPStatus.OK if APP.ready else HTTPStatus.SERVICE_UNAVAILABLE, payload)
            return
        self._write_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})

    def do_POST(self):
        if self.path != PREDICT_PATH:
            self._write_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})
            return
        if not APP.ready:
            self._write_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {
                    "detail": "model is not ready yet",
                    "error": APP.startup_error or "",
                },
            )
            return
        try:
            payload = self._read_json()
        except json.JSONDecodeError as err:
            self._write_json(HTTPStatus.BAD_REQUEST, {"detail": f"invalid JSON body: {err.msg}"})
            return
        try:
            result = APP.predict(payload)
        except NotImplementedError as err:
            self._write_json(HTTPStatus.NOT_IMPLEMENTED, {"detail": str(err)})
            return
        except ValueError as err:
            self._write_json(HTTPStatus.BAD_REQUEST, {"detail": str(err)})
            return
        except Exception:
            LOGGER.exception("prediction failed")
            self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"detail": "prediction failed"})
            return
        self._write_json(HTTPStatus.OK, {"result": result})


def install_signal_handlers(server):
    def _handle_signal(signum, _frame):
        LOGGER.info("received signal=%%s, shutting down", signum)
        server.shutdown()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)


if __name__ == "__main__":
    try:
        APP.load()
    except Exception as err:
        APP.startup_error = str(err)
        LOGGER.exception("startup failed")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    install_signal_handlers(server)
    LOGGER.info("listening on 0.0.0.0:%%s", PORT)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        LOGGER.info("server stopped")
`, cfg.ServePort, healthPath, modelPath)
}

func defaultTrainCommand() []string {
	return []string{"uv", "run", "--active", "--no-sync", "python", "-u", "train.py"}
}

func defaultServeCommand() []string {
	return []string{"uv", "run", "--active", "--no-sync", "python", "-u", "inference.py"}
}

// normalizeCommandString collapses backslash-newline continuations and
// redundant whitespace so pasted multi-line shell commands become one line.
func normalizeCommandString(s string) string {
	s = strings.ReplaceAll(s, "\\\r\n", " ")
	s = strings.ReplaceAll(s, "\\\n", " ")
	return strings.Join(strings.Fields(s), " ")
}

// parseShellCommand splits a shell-like command string into tokens,
// respecting single-quoted and double-quoted spans and backslash escapes.
func parseShellCommand(s string) ([]string, error) {
	var tokens []string
	var current strings.Builder
	inDouble := false
	inSingle := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case inDouble:
			if c == '\\' && i+1 < len(s) {
				next := s[i+1]
				if next == '"' || next == '\\' || next == '$' || next == '`' || next == '\n' {
					current.WriteByte(next)
					i++
				} else {
					current.WriteByte(c)
				}
			} else if c == '"' {
				inDouble = false
			} else {
				current.WriteByte(c)
			}
		case inSingle:
			if c == '\'' {
				inSingle = false
			} else {
				current.WriteByte(c)
			}
		case c == '"':
			inDouble = true
		case c == '\'':
			inSingle = true
		case c == '\\' && i+1 < len(s):
			current.WriteByte(s[i+1])
			i++
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(c)
		}
	}

	if inDouble {
		return nil, errors.New("unterminated double quote in entrypoint command")
	}
	if inSingle {
		return nil, errors.New("unterminated single quote in entrypoint command")
	}
	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}
	if len(tokens) == 0 {
		return nil, errors.New("entrypoint command is empty after parsing")
	}
	return tokens, nil
}

func resolveTrainCommand(cfg projectConfig) ([]string, error) {
	if len(cfg.TrainCommand) > 0 {
		return append([]string{}, cfg.TrainCommand...), nil
	}
	return defaultTrainCommand(), nil
}

func resolveServeCommand(cfg projectConfig) ([]string, error) {
	if len(cfg.ServeCommand) > 0 {
		return append([]string{}, cfg.ServeCommand...), nil
	}
	return defaultServeCommand(), nil
}

func projectConfigFromEnvironment(env environmentResponse) projectConfig {
	cfg := projectConfig{
		Framework:        strings.TrimSpace(env.Framework),
		FrameworkVersion: strings.TrimSpace(env.Version),
		PythonVersion:    strings.TrimSpace(env.PythonVersion),
		GPUType:          strings.TrimSpace(env.GPUType),
	}
	if env.GPUCount > 0 {
		cfg.GPUCount = int(env.GPUCount)
	}
	if env.VolumeGB > 0 {
		cfg.VolumeGB = int(env.VolumeGB)
	}
	if command := normalizeCommandTokens(env.Command); len(command) > 0 {
		cfg.TrainCommand = command
	}
	if outputDir := strings.TrimSpace(env.OutputDir); outputDir != "" && outputDir != "outputs" {
		cfg.OutputDir = outputDir
	}
	return cfg
}

func syncLocalProjectConfig(environmentID string) error {
	environmentID = strings.TrimSpace(environmentID)
	if environmentID == "" {
		return errors.New("environment id is empty")
	}
	env, err := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return err
	}
	cfg, err := loadPersistedProjectConfig()
	if err != nil {
		return err
	}
	if !hasProjectSection(cfg) {
		return fmt.Errorf("local project config %s is missing [project]; run `tahuna init .` to restore project bindings", projectConfigFilePath())
	}
	cfg = applyProjectConfigDefaults(cfg)
	return saveProjectConfig(mergeProjectConfig(cfg, projectConfigFromEnvironment(env)))
}

func syncLinkedLocalProjectConfig(environmentID string) error {
	environmentID = strings.TrimSpace(environmentID)
	if environmentID == "" {
		return nil
	}
	linkedEnvironmentID, err := loadLinkedEnvironmentID()
	if err != nil {
		return err
	}
	if linkedEnvironmentID == "" || linkedEnvironmentID != environmentID {
		return nil
	}
	return syncLocalProjectConfig(environmentID)
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
	if err := os.RemoveAll(projectStateDir); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
