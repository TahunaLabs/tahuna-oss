package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
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
	DataDir           string
	OutputDir         string
	ConfigYAMLPath    string
	TrainEntrypoint   string
	PythonProjectFile string
	UVLockFile        string
	Framework         string
	FrameworkVersion  string
	PythonVersion     string
}

type projectConfigYAML struct {
	Entrypoint        string `yaml:"entrypoint"`
	TrainEntrypoint   string `yaml:"train_entrypoint"`
	DataDir           string `yaml:"data_dir"`
	OutputDir         string `yaml:"output_dir"`
	ConfigFile        string `yaml:"config_file"`
	ConfigYAML        string `yaml:"config_yaml"`
	PythonProjectFile string `yaml:"python_project_file"`
	UVLockFile        string `yaml:"uv_lock_file"`
	Framework         string `yaml:"framework"`
	FrameworkVersion  string `yaml:"framework_version"`
	PythonVersion     string `yaml:"python_version"`
	Requirements      any    `yaml:"requirements"`
}

type projectConfigKeySpec struct {
	name    string
	aliases []string
}

var requiredProjectConfigKeys = []projectConfigKeySpec{
	{name: "entrypoint", aliases: []string{"entrypoint", "train_entrypoint"}},
	{name: "data_dir", aliases: []string{"data_dir"}},
	{name: "output_dir", aliases: []string{"output_dir"}},
	{name: "config_file", aliases: []string{"config_file", "config_yaml"}},
	{name: "python_project_file", aliases: []string{"python_project_file"}},
	{name: "uv_lock_file", aliases: []string{"uv_lock_file"}},
	{name: "framework", aliases: []string{"framework"}},
	{name: "python_version", aliases: []string{"python_version"}},
}

func collectProjectInitConfig() (projectConfig, string, error) {
	cfg := projectConfig{
		DataDir:           "data",
		OutputDir:         "outputs",
		ConfigYAMLPath:    "config.yaml",
		TrainEntrypoint:   "train.py",
		PythonProjectFile: "pyproject.toml",
		UVLockFile:        "uv.lock",
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
	return filepath.Join(projectStateDir, projectCfgFile)
}

func saveProjectConfig(cfg projectConfig) error {
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	body, err := yaml.Marshal(projectConfigYAML{
		Entrypoint:        cfg.TrainEntrypoint,
		DataDir:           cfg.DataDir,
		OutputDir:         cfg.OutputDir,
		ConfigFile:        cfg.ConfigYAMLPath,
		PythonProjectFile: cfg.PythonProjectFile,
		UVLockFile:        cfg.UVLockFile,
		Framework:         cfg.Framework,
		FrameworkVersion:  cfg.FrameworkVersion,
		PythonVersion:     cfg.PythonVersion,
	})
	if err != nil {
		return err
	}
	return os.WriteFile(projectConfigFilePath(), body, 0o600)
}

func loadProjectConfig() (projectConfig, error) {
	cfg := projectConfig{
		DataDir:           "data",
		OutputDir:         "outputs",
		ConfigYAMLPath:    "config.yaml",
		TrainEntrypoint:   "train.py",
		PythonProjectFile: "pyproject.toml",
		UVLockFile:        "uv.lock",
		PythonVersion:     "3.11",
	}

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return cfg, err
	}

	var parsed projectConfigYAML
	if err := yaml.Unmarshal(raw, &parsed); err != nil {
		return cfg, fmt.Errorf("failed to parse %s: %w", projectConfigFilePath(), err)
	}

	if value := strings.TrimSpace(parsed.Entrypoint); value != "" {
		cfg.TrainEntrypoint = filepath.Clean(value)
	} else if value := strings.TrimSpace(parsed.TrainEntrypoint); value != "" {
		cfg.TrainEntrypoint = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.DataDir); value != "" {
		cfg.DataDir = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.OutputDir); value != "" {
		cfg.OutputDir = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.ConfigFile); value != "" {
		cfg.ConfigYAMLPath = filepath.Clean(value)
	} else if value := strings.TrimSpace(parsed.ConfigYAML); value != "" {
		cfg.ConfigYAMLPath = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.PythonProjectFile); value != "" {
		cfg.PythonProjectFile = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.UVLockFile); value != "" {
		cfg.UVLockFile = filepath.Clean(value)
	}
	if value := strings.TrimSpace(parsed.Framework); value != "" {
		cfg.Framework = value
	}
	if value := strings.TrimSpace(parsed.FrameworkVersion); value != "" {
		cfg.FrameworkVersion = value
	}
	if value := strings.TrimSpace(parsed.PythonVersion); value != "" {
		cfg.PythonVersion = value
	}

	return cfg, nil
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
	if err := validateProjectConfigPathBinding("entrypoint", cfg.TrainEntrypoint, false); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigPathBinding("data_dir", cfg.DataDir, true); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigPathBinding("output_dir", cfg.OutputDir, true); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigPathBinding("config_file", cfg.ConfigYAMLPath, false); err != nil {
		return cfg, err
	}
	if err := validateProjectConfigPathBinding("python_project_file", cfg.PythonProjectFile, false); err != nil {
		return cfg, err
	}
	if filepath.Base(cfg.PythonProjectFile) != "pyproject.toml" {
		return cfg, fmt.Errorf("invalid python_project_file in %s: expected pyproject.toml filename", path)
	}
	if err := validateProjectConfigPathBinding("uv_lock_file", cfg.UVLockFile, false); err != nil {
		return cfg, err
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
	}

	return resolved, nil
}

func loadRawProjectConfigValues(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if err := yaml.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	values := map[string]string{}
	for key, rawValue := range parsed {
		switch value := rawValue.(type) {
		case nil:
			values[key] = ""
		case string:
			values[key] = strings.TrimSpace(value)
		default:
			values[key] = strings.TrimSpace(fmt.Sprintf("%v", value))
		}
	}
	return values, nil
}

func validateRequiredProjectConfigValues(path string, values map[string]string) error {
	missing := make([]string, 0, len(requiredProjectConfigKeys))
	empty := make([]string, 0, len(requiredProjectConfigKeys))
	for _, field := range requiredProjectConfigKeys {
		hasAlias := false
		hasValue := false
		for _, alias := range field.aliases {
			value, ok := values[alias]
			if !ok {
				continue
			}
			hasAlias = true
			if strings.TrimSpace(value) != "" {
				hasValue = true
				break
			}
		}
		if !hasAlias {
			missing = append(missing, field.name)
			continue
		}
		if !hasValue {
			empty = append(empty, field.name)
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

	// If framework_version is missing locally (older project), fetch from environment.
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

func validateProjectConfigPathBinding(field, value string, wantDir bool) error {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return fmt.Errorf("missing %s binding in %s", field, projectConfigFilePath())
	}
	info, err := os.Stat(cleaned)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%s binding points to missing path %q", field, cleaned)
		}
		return fmt.Errorf("failed to read %s binding path %q: %w", field, cleaned, err)
	}
	if wantDir {
		if !info.IsDir() {
			return fmt.Errorf("%s binding must point to a directory: %q", field, cleaned)
		}
		return nil
	}
	if info.IsDir() {
		return fmt.Errorf("%s binding must point to a file: %q", field, cleaned)
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
	if err := os.RemoveAll(projectStateDir); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
