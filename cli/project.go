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
	EnvironmentName   string
	DataDir           string
	OutputDir         string
	TrainEntrypoint   string
	EntrypointCommand string
	PythonProjectFile string
	UVLockFile        string
	Framework         string
	FrameworkVersion  string
	PythonVersion     string
	GPUType           string
	GPUCount          int
	VolumeGB          int
}

type projectConfigKeySpec struct {
	name string
}

var requiredProjectConfigKeys = []projectConfigKeySpec{
	{name: "entrypoint"},
	{name: "data_dir"},
	{name: "output_dir"},
	{name: "python_project_file"},
	{name: "uv_lock_file"},
	{name: "framework"},
	{name: "python_version"},
}

var tomlPositiveIntPattern = regexp.MustCompile(`^\d+$`)

func collectProjectInitConfig() (projectConfig, string, error) {
	cfg := projectConfig{
		DataDir:           "data",
		OutputDir:         "outputs",
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
	return os.WriteFile(projectConfigFilePath(), []byte(renderProjectConfig(cfg)), 0o600)
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
	cfg := projectConfig{
		DataDir:           "data",
		OutputDir:         "outputs",
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

	parsed, _, err := parseProjectConfigTOML(string(raw))
	if err != nil {
		return cfg, fmt.Errorf("failed to parse %s: %w", projectConfigFilePath(), err)
	}

	return mergeProjectConfig(cfg, parsed), nil
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
	if value := strings.TrimSpace(next.EnvironmentName); value != "" {
		base.EnvironmentName = value
	}
	if value := strings.TrimSpace(next.DataDir); value != "" {
		base.DataDir = filepath.Clean(value)
	}
	if value := strings.TrimSpace(next.OutputDir); value != "" {
		base.OutputDir = filepath.Clean(value)
	}
	if value := strings.TrimSpace(next.TrainEntrypoint); value != "" {
		base.TrainEntrypoint = filepath.Clean(value)
	}
	if value := strings.TrimSpace(next.EntrypointCommand); value != "" {
		base.EntrypointCommand = value
	}
	if value := strings.TrimSpace(next.PythonProjectFile); value != "" {
		base.PythonProjectFile = filepath.Clean(value)
	}
	if value := strings.TrimSpace(next.UVLockFile); value != "" {
		base.UVLockFile = filepath.Clean(value)
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
	return base
}

func hasEnvironmentSection(cfg projectConfig) bool {
	return strings.TrimSpace(cfg.EnvironmentName) != "" ||
		strings.TrimSpace(cfg.Framework) != "" ||
		strings.TrimSpace(cfg.FrameworkVersion) != "" ||
		strings.TrimSpace(cfg.PythonVersion) != "" ||
		strings.TrimSpace(cfg.GPUType) != "" ||
		cfg.GPUCount > 0 ||
		cfg.VolumeGB > 0
}

func hasProjectSection(cfg projectConfig) bool {
	return strings.TrimSpace(cfg.TrainEntrypoint) != "" ||
		strings.TrimSpace(cfg.EntrypointCommand) != "" ||
		strings.TrimSpace(cfg.DataDir) != "" ||
		strings.TrimSpace(cfg.OutputDir) != "" ||
		strings.TrimSpace(cfg.PythonProjectFile) != "" ||
		strings.TrimSpace(cfg.UVLockFile) != ""
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
		if value := strings.TrimSpace(cfg.TrainEntrypoint); value != "" {
			lines = append(lines, fmt.Sprintf("entrypoint = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.EntrypointCommand); value != "" {
			lines = append(lines, fmt.Sprintf("entrypoint_command = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.DataDir); value != "" {
			lines = append(lines, fmt.Sprintf("data_dir = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.OutputDir); value != "" {
			lines = append(lines, fmt.Sprintf("output_dir = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.PythonProjectFile); value != "" {
			lines = append(lines, fmt.Sprintf("python_project_file = \"%s\"", escapeProjectConfigValue(value)))
		}
		if value := strings.TrimSpace(cfg.UVLockFile); value != "" {
			lines = append(lines, fmt.Sprintf("uv_lock_file = \"%s\"", escapeProjectConfigValue(value)))
		}
	}
	if hasEnvironmentSection(cfg) {
		if len(lines) > 1 {
			lines = append(lines, "")
		}
		lines = append(lines, "[environment]")
		if value := strings.TrimSpace(cfg.EnvironmentName); value != "" {
			lines = append(lines, fmt.Sprintf("name = \"%s\"", escapeProjectConfigValue(value)))
		}
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
			if section != "project" && section != "environment" {
				return cfg, nil, fmt.Errorf("line %d: unsupported section [%s]", lineNumber, section)
			}
			continue
		}
		if section == "" {
			return cfg, nil, fmt.Errorf("line %d: expected [project] or [environment] section before config values", lineNumber)
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
			values[key] = strings.TrimSpace(value)
			switch key {
			case "entrypoint":
				cfg.TrainEntrypoint = value
			case "entrypoint_command":
				cfg.EntrypointCommand = value
			case "data_dir":
				cfg.DataDir = value
			case "output_dir":
				cfg.OutputDir = value
			case "python_project_file":
				cfg.PythonProjectFile = value
			case "uv_lock_file":
				cfg.UVLockFile = value
			default:
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [project]", lineNumber, key)
			}
		case "environment":
			switch key {
			case "name", "framework", "version", "python_version", "gpu_type":
				value, err := parseTomlStringValue(rawValue, lineNumber)
				if err != nil {
					return cfg, nil, err
				}
				values[key] = strings.TrimSpace(value)
				switch key {
				case "name":
					cfg.EnvironmentName = value
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
				values[key] = strconv.Itoa(value)
				if key == "gpu_count" {
					cfg.GPUCount = value
				} else {
					cfg.VolumeGB = value
				}
			default:
				return cfg, nil, fmt.Errorf("line %d: unsupported key %s in [environment]", lineNumber, key)
			}
		}
	}

	return cfg, values, nil
}

func validateRequiredProjectConfigValues(path string, values map[string]string) error {
	missing := make([]string, 0, len(requiredProjectConfigKeys))
	empty := make([]string, 0, len(requiredProjectConfigKeys))
	for _, field := range requiredProjectConfigKeys {
		value, ok := values[field.name]
		if !ok {
			missing = append(missing, field.name)
			continue
		}
		if strings.TrimSpace(value) == "" {
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

func defaultTrainCommand(entrypoint string) []string {
	resolvedEntrypoint := strings.TrimSpace(entrypoint)
	if resolvedEntrypoint == "" {
		resolvedEntrypoint = "train.py"
	}
	return []string{"uv", "run", "--active", "--no-sync", "python", "-u", resolvedEntrypoint}
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
		return nil, errors.New("unterminated double quote in entrypoint_command")
	}
	if inSingle {
		return nil, errors.New("unterminated single quote in entrypoint_command")
	}
	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}
	if len(tokens) == 0 {
		return nil, errors.New("entrypoint_command is empty after parsing")
	}
	return tokens, nil
}

func resolveTrainCommand(cfg projectConfig) ([]string, error) {
	if cmd := strings.TrimSpace(cfg.EntrypointCommand); cmd != "" {
		return parseShellCommand(cmd)
	}
	return defaultTrainCommand(cfg.TrainEntrypoint), nil
}

func projectConfigFromEnvironment(env environmentResponse) projectConfig {
	cfg := projectConfig{
		EnvironmentName:  strings.TrimSpace(env.Name),
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
