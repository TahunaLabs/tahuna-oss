package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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
	DataDir           string
	OutputDir         string
	ConfigYAMLPath    string
	TrainEntrypoint   string
	PythonProjectFile string
	UVLockFile        string
	Framework         string
	PythonVersion     string
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

func validateProjectConfigBindings() error {
	cfg, err := loadProjectConfig()
	if err != nil {
		return err
	}
	path := projectConfigFilePath()
	values, err := loadRawProjectConfigValues(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("missing %s; run `tahuna init .` to restore project bindings", path)
		}
		return err
	}
	if err := validateRequiredProjectConfigValues(path, values); err != nil {
		return err
	}
	if err := validateProjectConfigRuntimeValues(path, cfg); err != nil {
		return err
	}
	if err := validateProjectConfigPathBinding("entrypoint", cfg.TrainEntrypoint, false); err != nil {
		return err
	}
	if err := validateProjectConfigPathBinding("data_dir", cfg.DataDir, true); err != nil {
		return err
	}
	if err := validateProjectConfigPathBinding("output_dir", cfg.OutputDir, true); err != nil {
		return err
	}
	if err := validateProjectConfigPathBinding("config_file", cfg.ConfigYAMLPath, false); err != nil {
		return err
	}
	if err := validateProjectConfigPathBinding("python_project_file", cfg.PythonProjectFile, false); err != nil {
		return err
	}
	if filepath.Base(cfg.PythonProjectFile) != "pyproject.toml" {
		return fmt.Errorf("invalid python_project_file in %s: expected pyproject.toml filename", path)
	}
	if err := validateProjectConfigPathBinding("uv_lock_file", cfg.UVLockFile, false); err != nil {
		return err
	}
	return nil
}

func loadRawProjectConfigValues(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	values := map[string]string{}
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
		values[key] = strings.TrimSpace(value)
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
	if err := os.Remove(projectEnvironmentFilePath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
