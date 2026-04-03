package main

import (
	"errors"
	"flag"
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
	Name  string
	Value string
}

type optionalStringFlag struct {
	value string
	set   bool
}

func (f *optionalStringFlag) String() string {
	return f.value
}

func (f *optionalStringFlag) Set(value string) error {
	f.value = value
	f.set = true
	return nil
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
	}

	switch args[0] {
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

If no NAME/value or --from-file path is provided, "set" loads .env.local first,
then .env from the current working directory.
`)
}

func envVarList(args []string) {
	fs := flag.NewFlagSet("env_vars list", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full env_vars payload")
	fs.BoolVar(verbose, "v", false, "Show full env_vars payload")
	mustParseFlags(fs, args)

	if *verbose {
		resp, err := doJSON(http.MethodGet, "/env_vars", nil)
		must(err)
		printJSON(resp)
		return
	}

	resp, err := doJSONAs[envVarNamesResponse](http.MethodGet, "/env_vars", nil)
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
	normalizedArgs, err := reorderEnvVarArgs(args, map[string]bool{})
	must(err)

	fs := flag.NewFlagSet("env_vars get", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full env_var payload")
	fs.BoolVar(verbose, "v", false, "Show full env_var payload")
	mustParseFlags(fs, normalizedArgs)

	require(len(fs.Args()) == 1, "name is required (usage: tahuna env_vars get <name>)")
	name := strings.TrimSpace(fs.Args()[0])
	require(name != "", "name is required (usage: tahuna env_vars get <name>)")

	path := "/env_vars/" + neturl.PathEscape(name)
	if *verbose {
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
	normalizedArgs, err := reorderEnvVarArgs(args, map[string]bool{
		"--from-file": true,
		"--value":     true,
	})
	must(err)

	fs := flag.NewFlagSet("env_vars set", flag.ExitOnError)
	var valueFlag optionalStringFlag
	fromFile := fs.String("from-file", "", "Load env vars from a dotenv file")
	verbose := fs.Bool("verbose", false, "Show full env_vars payload")
	fs.BoolVar(verbose, "v", false, "Show full env_vars payload")
	fs.Var(&valueFlag, "value", "Env var value")
	mustParseFlags(fs, normalizedArgs)

	inputs, sourcePath, err := resolveEnvVarSetInputs(fs.Args(), valueFlag, strings.TrimSpace(*fromFile))
	must(err)

	payload := make([]map[string]any, 0, len(inputs))
	for _, input := range inputs {
		payload = append(payload, map[string]any{
			"name":  input.Name,
			"value": input.Value,
		})
	}

	resp, err := doJSONAs[envVarNamesResponse](http.MethodPost, "/env_vars", map[string]any{
		"env_vars": payload,
	})
	must(err)

	if *verbose {
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

func resolveEnvVarSetInputs(args []string, valueFlag optionalStringFlag, fromFile string) ([]envVarSetInput, string, error) {
	if fromFile != "" {
		if valueFlag.set || len(args) > 0 {
			return nil, "", errors.New("cannot combine --from-file with NAME=value or --value")
		}
		inputs, err := parseEnvVarFile(fromFile)
		if err != nil {
			return nil, "", err
		}
		return inputs, filepath.Clean(fromFile), nil
	}

	if valueFlag.set {
		if len(args) != 1 {
			return nil, "", errors.New("usage: tahuna env_vars set NAME --value <value>")
		}
		name := strings.TrimSpace(args[0])
		if strings.Contains(name, "=") {
			return nil, "", errors.New("cannot combine NAME=value with --value")
		}
		if name == "" {
			return nil, "", errors.New("name is required")
		}
		return []envVarSetInput{{Name: name, Value: valueFlag.value}}, "", nil
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
		raw := strings.TrimSpace(args[0])
		if !strings.Contains(raw, "=") {
			return nil, "", errors.New("usage: tahuna env_vars set NAME=value | NAME --value <value> | [--from-file <path>]")
		}
		name, value, _ := strings.Cut(raw, "=")
		name = strings.TrimSpace(name)
		if name == "" {
			return nil, "", errors.New("name is required")
		}
		return []envVarSetInput{{Name: name, Value: value}}, "", nil
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
		inputs = append(inputs, envVarSetInput{
			Name:  name,
			Value: env[name],
		})
	}
	return inputs, nil
}

func envVarRemove(args []string) {
	normalizedArgs, err := reorderEnvVarArgs(args, map[string]bool{})
	must(err)

	fs := flag.NewFlagSet("env_vars rm", flag.ExitOnError)
	verbose := fs.Bool("verbose", false, "Show full env_var delete payload")
	fs.BoolVar(verbose, "v", false, "Show full env_var delete payload")
	mustParseFlags(fs, normalizedArgs)

	require(len(fs.Args()) == 1, "name is required (usage: tahuna env_vars rm <name>)")
	name := strings.TrimSpace(fs.Args()[0])
	require(name != "", "name is required (usage: tahuna env_vars rm <name>)")

	path := "/env_vars/" + neturl.PathEscape(name)
	resp, err := doJSONAs[envVarDeleteResponse](http.MethodDelete, path, nil)
	must(err)

	if *verbose {
		printJSON(resp)
		return
	}
	fmt.Printf("Removed env var: %s\n", resp.Name)
}

func reorderEnvVarArgs(args []string, valueFlags map[string]bool) ([]string, error) {
	flags := make([]string, 0, len(args))
	positionals := make([]string, 0, len(args))

	for index := 0; index < len(args); index += 1 {
		arg := args[index]
		switch {
		case arg == "-h" || arg == "--help" || arg == "-v" || arg == "--verbose":
			flags = append(flags, arg)
		case valueFlags[arg]:
			if index+1 >= len(args) {
				return nil, fmt.Errorf("flag needs an argument: %s", arg)
			}
			flags = append(flags, arg, args[index+1])
			index += 1
		case hasInlineValueFlag(arg, valueFlags):
			flags = append(flags, arg)
		case strings.HasPrefix(arg, "-"):
			return nil, fmt.Errorf("unknown flag: %s", arg)
		default:
			positionals = append(positionals, arg)
		}
	}

	return append(flags, positionals...), nil
}

func hasInlineValueFlag(arg string, valueFlags map[string]bool) bool {
	for name := range valueFlags {
		if strings.HasPrefix(arg, name+"=") {
			return true
		}
	}
	return false
}
