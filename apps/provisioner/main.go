package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"tahuna-provisioner/pkg/provisioner"
)

func main() {
	if len(os.Args) < 2 {
		fatalf("usage: provisioner <launch|wait-running|wait-completion|terminate>")
	}

	apiKey, err := requiredEnv("RUNPOD_API_KEY")
	if err != nil {
		fatalf(err.Error())
	}
	client := &http.Client{Timeout: 60 * time.Second}
	ctx := context.Background()

	switch os.Args[1] {
	case "launch":
		req, err := parseLaunchArgs(os.Args[2:])
		if err != nil {
			fatalf(err.Error())
		}
		cfg, err := loadConfig()
		if err != nil {
			fatalf(err.Error())
		}
		podID, err := provisioner.Launch(ctx, client, apiKey, cfg, req)
		if err != nil {
			fatalf(err.Error())
		}
		mustPrintJSON(map[string]string{"pod_id": podID})
	case "wait-running":
		podID, timeoutSec, err := parseWaitArgs("wait-running", 1800, os.Args[2:])
		if err != nil {
			fatalf(err.Error())
		}
		pod, err := provisioner.WaitRunning(ctx, client, apiKey, podID, time.Duration(timeoutSec)*time.Second)
		if err != nil {
			fatalf(err.Error())
		}
		mustPrintJSON(pod)
	case "wait-completion":
		podID, timeoutSec, err := parseWaitArgs("wait-completion", 3600, os.Args[2:])
		if err != nil {
			fatalf(err.Error())
		}
		out, err := provisioner.WaitCompletion(ctx, client, apiKey, podID, time.Duration(timeoutSec)*time.Second)
		if err != nil {
			fatalf(err.Error())
		}
		mustPrintJSON(out)
	case "terminate":
		podID, err := parseTerminateArgs(os.Args[2:])
		if err != nil {
			fatalf(err.Error())
		}
		desired, err := provisioner.Terminate(ctx, client, apiKey, podID)
		if err != nil {
			fatalf(err.Error())
		}
		mustPrintJSON(map[string]string{"pod_id": podID, "desired_status": desired})
	default:
		fatalf("unknown subcommand %q", os.Args[1])
	}
}

func parseLaunchArgs(args []string) (provisioner.LaunchRequest, error) {
	fs := flag.NewFlagSet("launch", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	envArtifacts := fs.String("env-artifacts", "", "")
	inputPath := fs.String("input-path", "", "")
	outputPath := fs.String("output-path", "", "")
	logsPath := fs.String("logs-path", "", "")
	gpuType := fs.String("gpu-type", "", "")
	gpuCount := fs.Int("gpu-count", 1, "")
	volumeGB := fs.Int("volume-gb", 1, "")
	framework := fs.String("framework", "", "")
	version := fs.String("version", "", "")
	runID := fs.String("run-id", "", "")
	if err := fs.Parse(args); err != nil {
		return provisioner.LaunchRequest{}, err
	}

	return provisioner.LaunchRequest{
		EnvArtifacts: *envArtifacts,
		InputPath:    *inputPath,
		OutputPath:   *outputPath,
		LogsPath:     *logsPath,
		GPUType:      *gpuType,
		GPUCount:     *gpuCount,
		VolumeGB:     *volumeGB,
		Framework:    *framework,
		Version:      *version,
		RunID:        *runID,
	}, nil
}

func parseWaitArgs(name string, timeoutDefault int, args []string) (string, int, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	podID := fs.String("pod-id", "", "")
	timeoutSec := fs.Int("timeout", timeoutDefault, "")
	if err := fs.Parse(args); err != nil {
		return "", 0, err
	}
	if strings.TrimSpace(*podID) == "" {
		return "", 0, errors.New("--pod-id is required")
	}
	if *timeoutSec < 1 {
		return "", 0, errors.New("--timeout must be >= 1")
	}
	return *podID, *timeoutSec, nil
}

func parseTerminateArgs(args []string) (string, error) {
	fs := flag.NewFlagSet("terminate", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	podID := fs.String("pod-id", "", "")
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	if strings.TrimSpace(*podID) == "" {
		return "", errors.New("--pod-id is required")
	}
	return *podID, nil
}

func loadConfig() (provisioner.Config, error) {
	dockerUser, err := requiredEnv("DOCKER_USER")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Endpoint, err := requiredEnv("R2_ENDPOINT")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Access, err := requiredEnv("R2_ACCESS_KEY")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Secret, err := requiredEnv("R2_SECRET_KEY")
	if err != nil {
		return provisioner.Config{}, err
	}
	r2Bucket, err := requiredEnv("R2_BUCKET")
	if err != nil {
		return provisioner.Config{}, err
	}

	return provisioner.Config{
		DockerUser:  dockerUser,
		R2Endpoint:  r2Endpoint,
		R2AccessKey: r2Access,
		R2SecretKey: r2Secret,
		R2Bucket:    r2Bucket,
	}, nil
}

func requiredEnv(key string) (string, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return "", fmt.Errorf("%s is required", key)
	}
	return v, nil
}

func mustPrintJSON(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		fatalf(err.Error())
	}
	_, err = os.Stdout.Write(append(b, '\n'))
	if err != nil {
		fatalf(err.Error())
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
