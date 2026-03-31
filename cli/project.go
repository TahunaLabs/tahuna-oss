package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
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
	TrainOutputModelPath         string
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

type projectConfigKeySpec struct {
	section string
	name    string
}

var requiredProjectConfigKeys = []projectConfigKeySpec{
	{section: "project", name: "data_dir"},
	{section: "project", name: "output_dir"},
	{section: "environment", name: "framework"},
	{section: "environment", name: "version"},
	{section: "environment", name: "python_version"},
	{section: "environment", name: "gpu_type"},
	{section: "environment", name: "gpu_count"},
	{section: "environment", name: "volume_gb"},
}

var tomlPositiveIntPattern = regexp.MustCompile(`^\d+$`)

func (spec projectConfigKeySpec) fullKey() string {
	return spec.section + "." + spec.name
}

func normalizeProjectPath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return filepath.ToSlash(filepath.Clean(trimmed))
}

func defaultTrainOutputModelPath(outputDir string) string {
	resolvedOutputDir := normalizeProjectPath(outputDir)
	if resolvedOutputDir == "" {
		resolvedOutputDir = "outputs"
	}
	return normalizeProjectPath(filepath.Join(filepath.FromSlash(resolvedOutputDir), "model"))
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
	return os.WriteFile(path, []byte(renderProjectConfig(cfg)), 0o600)
}

func loadPersistedProjectConfig() (projectConfig, error) {
	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return projectConfig{}, nil
		}
		return projectConfig{}, err
	}

	parsed, _, err := parseProjectConfigTOML(string(raw))
	if err != nil {
		return projectConfig{}, fmt.Errorf("failed to parse %s: %w", projectConfigFilePath(), err)
	}
	return parsed, nil
}

func loadProjectConfig() (projectConfig, error) {
	cfg := defaultProjectConfig()

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}

	parsed, _, err := parseProjectConfigTOML(string(raw))
	if err != nil {
		return cfg, fmt.Errorf("failed to parse %s: %w", projectConfigFilePath(), err)
	}

	return applyProjectConfigDefaults(parsed), nil
}

func validateProjectConfigBindings(environmentID string) (projectConfig, error) {
	cfg, err := loadProjectConfig()
	if err != nil {
		return cfg, err
	}
	path := projectConfigFilePath()
	values, err := loadRawProjectConfigValues(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, fmt.Errorf("missing %s; run `tahuna init .` to restore project bindings", path)
		}
		return cfg, err
	}
	if err := validateRequiredProjectConfigValues(path, values); err != nil {
		return cfg, err
	}
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

func loadRawProjectConfigValues(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	_, values, err := parseProjectConfigTOML(string(raw))
	if err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	return values, nil
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
	if value := strings.TrimSpace(next.TrainOutputModelPath); value != "" {
		base.TrainOutputModelPath = normalizeProjectPath(value)
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
	return strings.TrimSpace(cfg.TrainOutputModelPath) != ""
}

func hasServeSection(cfg projectConfig) bool {
	return strings.TrimSpace(cfg.ServePythonVersion) != "" ||
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

func renderProjectConfig(cfg projectConfig) string {
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
		if value := strings.TrimSpace(cfg.TrainOutputModelPath); value != "" {
			lines = append(lines, fmt.Sprintf("output_model_path = \"%s\"", escapeProjectConfigValue(value)))
		}
	}
	if hasServeSection(cfg) {
		if len(lines) > 1 {
			lines = append(lines, "")
		}
		lines = append(lines, "[serve]")
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
		if cfg.ServePort > 0 && cfg.ServePort != defaultProjectConfig().ServePort {
			lines = append(lines, fmt.Sprintf("port = %d", cfg.ServePort))
		}
		if value := strings.TrimSpace(cfg.ServeHealthPath); value != "" && value != defaultProjectConfig().ServeHealthPath {
			lines = append(lines, fmt.Sprintf("health_path = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.ServeDefaultModelPath); value != "" && value != defaultProjectConfig().ServeDefaultModelPath {
			lines = append(lines, fmt.Sprintf("default_model_path = \"%s\"", escapeProjectConfigValue(value)))
		}
		if cfg.ServeStartupTimeoutSeconds > 0 && cfg.ServeStartupTimeoutSeconds != defaultProjectConfig().ServeStartupTimeoutSeconds {
			lines = append(lines, fmt.Sprintf("startup_timeout_seconds = %d", cfg.ServeStartupTimeoutSeconds))
		}
		if cfg.ServeHealthIntervalSeconds > 0 && cfg.ServeHealthIntervalSeconds != defaultProjectConfig().ServeHealthIntervalSeconds {
			lines = append(lines, fmt.Sprintf("health_interval_seconds = %d", cfg.ServeHealthIntervalSeconds))
		}
		if cfg.ServeHealthTimeoutSeconds > 0 && cfg.ServeHealthTimeoutSeconds != defaultProjectConfig().ServeHealthTimeoutSeconds {
			lines = append(lines, fmt.Sprintf("health_timeout_seconds = %d", cfg.ServeHealthTimeoutSeconds))
		}
		if cfg.ServeHealthFailureThreshold > 0 && cfg.ServeHealthFailureThreshold != defaultProjectConfig().ServeHealthFailureThreshold {
			lines = append(lines, fmt.Sprintf("health_failure_threshold = %d", cfg.ServeHealthFailureThreshold))
		}
		if cfg.ServeGracefulShutdownSeconds > 0 && cfg.ServeGracefulShutdownSeconds != defaultProjectConfig().ServeGracefulShutdownSeconds {
			lines = append(lines, fmt.Sprintf("graceful_shutdown_seconds = %d", cfg.ServeGracefulShutdownSeconds))
		}
	}
	return strings.Join(lines, "\n") + "\n"
}

func parseTomlStringValue(raw string, lineNumber int) (string, error) {
	if len(raw) < 2 {
		return "", fmt.Errorf("line %d: expected quoted string value", lineNumber)
	}
	quote := raw[0]
	if (quote != '"' && quote != '\'') || raw[len(raw)-1] != quote {
		return "", fmt.Errorf("line %d: expected quoted string value", lineNumber)
	}
	inner := raw[1 : len(raw)-1]
	if quote == '\'' {
		return inner, nil
	}
	return strings.NewReplacer(
		`\\`, `\`,
		`\"`, `"`,
		`\n`, "\n",
		`\r`, "\r",
		`\t`, "\t",
	).Replace(inner), nil
}

func parseTomlPositiveIntValue(raw string, lineNumber int) (int, error) {
	if !tomlPositiveIntPattern.MatchString(raw) {
		return 0, fmt.Errorf("line %d: expected a positive integer", lineNumber)
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return 0, fmt.Errorf("line %d: expected a positive integer", lineNumber)
	}
	return value, nil
}

func parseProjectConfigTOML(text string) (projectConfig, map[string]string, error) {
	cfg := projectConfig{}
	values := map[string]string{}
	seen := map[string]struct{}{}
	section := ""

	for index, rawLine := range strings.Split(text, "\n") {
		lineNumber := index + 1
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.TrimSpace(line[1 : len(line)-1])
			if section != "project" && section != "environment" && section != "train" && section != "serve" {
				return cfg, nil, fmt.Errorf("line %d: unsupported section [%s]", lineNumber, section)
			}
			continue
		}
		if section == "" {
			return cfg, nil, fmt.Errorf("line %d: expected [project], [environment], [train], or [serve] section before config values", lineNumber)
		}

		separator := strings.Index(line, "=")
		if separator < 0 {
			return cfg, nil, fmt.Errorf("line %d: expected key = value", lineNumber)
		}
		key := strings.TrimSpace(line[:separator])
		rawValue := strings.TrimSpace(line[separator+1:])
		fullKey := section + "." + key
		if _, exists := seen[fullKey]; exists {
			return cfg, nil, fmt.Errorf("line %d: duplicate key %s", lineNumber, fullKey)
		}
		seen[fullKey] = struct{}{}

		switch section {
		case "project":
			value, err := parseTomlStringValue(rawValue, lineNumber)
			if err != nil {
				return cfg, nil, err
			}
			switch key {
			case "data_dir":
				cfg.DataDir = normalizeProjectPath(value)
			case "output_dir":
				cfg.OutputDir = normalizeProjectPath(value)
			default:
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [project]", lineNumber, key)
			}
			values[fullKey] = strings.TrimSpace(value)
		case "environment":
			switch key {
			case "framework", "version", "python_version", "gpu_type":
				value, err := parseTomlStringValue(rawValue, lineNumber)
				if err != nil {
					return cfg, nil, err
				}
				values[fullKey] = strings.TrimSpace(value)
				switch key {
				case "framework":
					cfg.Framework = value
				case "version":
					cfg.FrameworkVersion = value
				case "python_version":
					cfg.PythonVersion = value
				case "gpu_type":
					cfg.GPUType = value
				}
			case "gpu_count", "volume_gb":
				value, err := parseTomlPositiveIntValue(rawValue, lineNumber)
				if err != nil {
					return cfg, nil, err
				}
				values[fullKey] = strconv.Itoa(value)
				if key == "gpu_count" {
					cfg.GPUCount = value
				} else {
					cfg.VolumeGB = value
				}
			default:
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [environment]", lineNumber, key)
			}
		case "train":
			value, err := parseTomlStringValue(rawValue, lineNumber)
			if err != nil {
				return cfg, nil, err
			}
			if key != "output_model_path" {
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [train]", lineNumber, key)
			}
			cfg.TrainOutputModelPath = normalizeProjectPath(value)
			values[fullKey] = strings.TrimSpace(value)
		case "serve":
			switch key {
			case "python_version", "gpu_type", "health_path", "default_model_path":
				value, err := parseTomlStringValue(rawValue, lineNumber)
				if err != nil {
					return cfg, nil, err
				}
				values[fullKey] = strings.TrimSpace(value)
				switch key {
				case "python_version":
					cfg.ServePythonVersion = value
				case "gpu_type":
					cfg.ServeGPUType = value
				case "health_path":
					cfg.ServeHealthPath = value
				case "default_model_path":
					cfg.ServeDefaultModelPath = normalizeProjectPath(value)
				}
			case "gpu_count", "volume_gb", "port", "startup_timeout_seconds", "health_interval_seconds", "health_timeout_seconds", "health_failure_threshold", "graceful_shutdown_seconds":
				value, err := parseTomlPositiveIntValue(rawValue, lineNumber)
				if err != nil {
					return cfg, nil, err
				}
				values[fullKey] = strconv.Itoa(value)
				switch key {
				case "gpu_count":
					cfg.ServeGPUCount = value
				case "volume_gb":
					cfg.ServeVolumeGB = value
				case "port":
					cfg.ServePort = value
				case "startup_timeout_seconds":
					cfg.ServeStartupTimeoutSeconds = value
				case "health_interval_seconds":
					cfg.ServeHealthIntervalSeconds = value
				case "health_timeout_seconds":
					cfg.ServeHealthTimeoutSeconds = value
				case "health_failure_threshold":
					cfg.ServeHealthFailureThreshold = value
				case "graceful_shutdown_seconds":
					cfg.ServeGracefulShutdownSeconds = value
				}
			default:
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [serve]", lineNumber, key)
			}
		}
	}

	return cfg, values, nil
}

func validateRequiredProjectConfigValues(path string, values map[string]string) error {
	missing := make([]string, 0, len(requiredProjectConfigKeys))
	empty := make([]string, 0, len(requiredProjectConfigKeys))
	for _, field := range requiredProjectConfigKeys {
		fullKey := field.fullKey()
		value, ok := values[fullKey]
		if !ok {
			missing = append(missing, fullKey)
			continue
		}
		if strings.TrimSpace(value) == "" {
			empty = append(empty, fullKey)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("%s is missing required binding keys: %s; run `tahuna init .` to restore project bindings", path, strings.Join(missing, ", "))
	}
	if len(empty) > 0 {
		return fmt.Errorf("%s has empty required binding values: %s; run `tahuna init .` to restore project bindings", path, strings.Join(empty, ", "))
	}
	return nil
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
	return fmt.Sprintf("[project]\nname = %q\nversion = \"0.1.0\"\nrequires-python = \">=3.11\"\ndependencies = [\n  %q,\n]\n", filepath.Base(mustGetwd()), dependency)
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
	return fmt.Sprintf(`import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("TAHUNA_SERVE_PORT", "%d"))
HEALTH_PATH = os.environ.get("TAHUNA_SERVE_HEALTH_PATH", "%s")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == HEALTH_PATH:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"listening on 0.0.0.0:{PORT}")
    server.serve_forever()
`, cfg.ServePort, healthPath)
}

func defaultTrainCommand() []string {
	return []string{"uv", "run", "--active", "--no-sync", "python", "-u", "train.py"}
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
