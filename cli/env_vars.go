package main

import (
	"errors"
	"fmt"
	"net/http"
	neturl "net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/subosito/gotenv"
)

type envVarSetInput struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type envVarArgs struct {
	positionals []string
	verbose     bool
	fromFile    string
	value       string
	hasValue    bool
}

func handleEnvVars(args []string) {
	if len(args) == 0 {
		fmt.Println("missing env_vars subcommand")
		envVarsUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "-h", "--help", "help":
		envVarsUsage()
		return
	case "list":
		envVarList(args[1:])
	case "get":
		envVarGet(args[1:])
	case "set":
		envVarSet(args[1:])
	case "rm":
		envVarRemove(args[1:])
	default:
		fmt.Printf("unknown env_vars subcommand: %s\n", args[0])
		envVarsUsage()
		os.Exit(1)
	}
}

func envVarsUsage() {
	fmt.Print(`Env Vars:
  tahuna env_vars list [--verbose|-v]
  tahuna env_vars get <name> [--verbose|-v]
  tahuna env_vars set NAME=value [--verbose|-v]
  tahuna env_vars set NAME --value <value> [--verbose|-v]
  tahuna env_vars set [--from-file <path>] [--verbose|-v]
  tahuna env_vars rm <name> [--verbose|-v]

These commands target the linked environment in the current project.
If no NAME/value or --from-file path is provided, "set" loads .env.local first,
then .env from the current working directory.
`)
}

func envVarList(args []string) {
	parsed, err := parseEnvVarArgs(args, false, false)
	must(err)
	require(len(parsed.positionals) == 0, "usage: tahuna env_vars list [--verbose]")

	environmentID, err := resolveEnvironmentID()
	must(err)
	path := envVarsListPath(environmentID)

	if parsed.verbose {
		resp, err := doJSON(http.MethodGet, path, nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[envVarNamesResponse](http.MethodGet, path, nil)
	must(err)
	printEnvVarList(resp.EnvVars)
}

func printEnvVarList(envVars []envVarNameResponse) {
	if len(envVars) == 0 {
		fmt.Println("No env vars found.")
		return
	}

	fmt.Printf("%-32s\n", "NAME")
	for _, envVar := range envVars {
		fmt.Printf("%-32s\n", truncateRunListColumn(envVar.Name, 32))
	}
}

func envVarGet(args []string) {
	parsed, err := parseEnvVarArgs(args, false, false)
	must(err)
	require(len(parsed.positionals) == 1, "name is required (usage: tahuna env_vars get <name>)")

	environmentID, err := resolveEnvironmentID()
	must(err)
	path := envVarPath(environmentID, parsed.positionals[0])

	if parsed.verbose {
		resp, err := doJSON(http.MethodGet, path, nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[envVarValueResponse](http.MethodGet, path, nil)
	must(err)
	fmt.Printf("%s=%s\n", resp.Name, resp.Value)
}

func envVarSet(args []string) {
	parsed, err := parseEnvVarArgs(args, true, true)
	must(err)

	inputs, sourcePath, err := resolveEnvVarSetInputs(parsed.positionals, parsed.value, parsed.hasValue, parsed.fromFile)
	must(err)

	environmentID, err := resolveEnvironmentID()
	must(err)
	resp, err := doJSONAs[envVarNamesResponse](http.MethodPost, "/env_vars", map[string]any{
		"environment_id": environmentID,
		"env_vars":       inputs,
	})
	must(err)

	if parsed.verbose {
		printJSON(resp)
		return
	}
	if sourcePath != "" {
		fmt.Printf("Set %d env vars from %s\n", len(resp.EnvVars), sourcePath)
	} else if len(resp.EnvVars) == 1 {
		fmt.Printf("Set env var: %s\n", resp.EnvVars[0].Name)
	} else {
		fmt.Printf("Set %d env vars.\n", len(resp.EnvVars))
	}
	printEnvVarList(resp.EnvVars)
}

func resolveEnvVarSetInputs(args []string, value string, hasValue bool, fromFile string) ([]envVarSetInput, string, error) {
	if fromFile != "" {
		if hasValue || len(args) > 0 {
			return nil, "", errors.New("cannot combine --from-file with NAME=value or --value")
		}
		inputs, err := parseEnvVarFile(fromFile)
		if err != nil {
			return nil, "", err
		}
		return inputs, filepath.Clean(fromFile), nil
	}

	if hasValue {
		if len(args) != 1 {
			return nil, "", errors.New("usage: tahuna env_vars set NAME --value <value>")
		}
		name := strings.TrimSpace(args[0])
		if name == "" || strings.Contains(name, "=") {
			return nil, "", errors.New("usage: tahuna env_vars set NAME --value <value>")
		}
		return []envVarSetInput{{Name: name, Value: value}}, "", nil
	}

	switch len(args) {
	case 0:
		defaultPath, err := resolveDefaultEnvVarFile()
		if err != nil {
			return nil, "", err
		}
		inputs, err := parseEnvVarFile(defaultPath)
		if err != nil {
			return nil, "", err
		}
		return inputs, defaultPath, nil
	case 1:
		name, rawValue, ok := strings.Cut(strings.TrimSpace(args[0]), "=")
		if !ok || strings.TrimSpace(name) == "" {
			return nil, "", errors.New("usage: tahuna env_vars set NAME=value | NAME --value <value> | [--from-file <path>]")
		}
		return []envVarSetInput{{Name: strings.TrimSpace(name), Value: rawValue}}, "", nil
	default:
		return nil, "", errors.New("usage: tahuna env_vars set NAME=value | NAME --value <value> | [--from-file <path>]")
	}
}

func resolveDefaultEnvVarFile() (string, error) {
	for _, candidate := range []string{".env.local", ".env"} {
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return filepath.Clean(candidate), nil
		}
	}
	return "", errors.New("no env file found (looked for .env.local, then .env)")
}

func parseEnvVarFile(path string) ([]envVarSetInput, error) {
	env, err := gotenv.Read(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	if len(env) == 0 {
		return nil, errors.New("env file did not contain any env vars")
	}

	names := make([]string, 0, len(env))
	for name := range env {
		names = append(names, name)
	}
	sort.Strings(names)

	inputs := make([]envVarSetInput, 0, len(names))
	for _, name := range names {
		inputs = append(inputs, envVarSetInput{Name: name, Value: env[name]})
	}
	return inputs, nil
}

func envVarRemove(args []string) {
	parsed, err := parseEnvVarArgs(args, false, false)
	must(err)
	require(len(parsed.positionals) == 1, "name is required (usage: tahuna env_vars rm <name>)")

	environmentID, err := resolveEnvironmentID()
	must(err)
	resp, err := doJSONAs[envVarDeleteResponse](http.MethodDelete, envVarPath(environmentID, parsed.positionals[0]), nil)
	must(err)

	if parsed.verbose {
		printJSON(resp)
		return
	}
	fmt.Printf("Removed env var: %s\n", resp.Name)
}

func envVarsListPath(environmentID string) string {
	return "/env_vars?environment_id=" + neturl.QueryEscape(strings.TrimSpace(environmentID))
}

func envVarPath(environmentID, name string) string {
	return "/env_vars/" + neturl.PathEscape(strings.TrimSpace(name)) +
		"?environment_id=" + neturl.QueryEscape(strings.TrimSpace(environmentID))
}

func parseEnvVarArgs(args []string, allowFromFile, allowValue bool) (envVarArgs, error) {
	parsed := envVarArgs{}
	for index := 0; index < len(args); index += 1 {
		arg := strings.TrimSpace(args[index])
		switch {
		case arg == "", arg == "help", arg == "-h", arg == "--help":
			return parsed, errors.New("usage: tahuna env_vars list|get|set|rm ...")
		case arg == "-v" || arg == "--verbose":
			parsed.verbose = true
		case allowFromFile && arg == "--from-file":
			index += 1
			if index >= len(args) {
				return parsed, errors.New("flag needs an argument: --from-file")
			}
			parsed.fromFile = strings.TrimSpace(args[index])
		case allowValue && arg == "--value":
			index += 1
			if index >= len(args) {
				return parsed, errors.New("flag needs an argument: --value")
			}
			parsed.value = args[index]
			parsed.hasValue = true
		case allowFromFile && strings.HasPrefix(arg, "--from-file="):
			parsed.fromFile = inlineFlagValue(arg)
		case allowValue && strings.HasPrefix(arg, "--value="):
			parsed.value = inlineFlagValue(arg)
			parsed.hasValue = true
		case strings.HasPrefix(arg, "-"):
			return parsed, fmt.Errorf("unknown flag: %s", arg)
		default:
			parsed.positionals = append(parsed.positionals, arg)
		}
	}
	return parsed, nil
}

func inlineFlagValue(value string) string {
	_, rawValue, _ := strings.Cut(value, "=")
	return strings.TrimSpace(rawValue)
}
