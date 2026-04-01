package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
)

type computeSelection struct {
	GPUType  string
	GPUCount int
	VolumeGB int
}

type environmentComputeSelections struct {
	Environment computeSelection
	Serve       computeSelection
}

type capacityPromptOptions[T any] struct {
	create           func(payload map[string]any) (T, error)
	resolveSelection func(payload map[string]any) (computeSelection, error)
	persistSelection func(selectedGPU string, selection computeSelection)
}

func createWithCapacityPrompt[T any](payload map[string]any, options capacityPromptOptions[T]) (T, error) {
	resp, err := options.create(payload)
	if err == nil || !isNoGPUCapacityCreateError(err) || !supportsInteractivePrompts() {
		return resp, err
	}

	gpus, _, _, gpusErr := fetchGpusAndImages()
	if gpusErr != nil || len(gpus) == 0 {
		var zero T
		return zero, err
	}

	selection := computeSelection{
		GPUType:  strings.TrimSpace(asString(payload["gpu_type"])),
		GPUCount: int(asInt64(payload["gpu_count"])),
		VolumeGB: int(asInt64(payload["volume_gb"])),
	}
	if options.resolveSelection != nil {
		if resolved, resolveErr := options.resolveSelection(payload); resolveErr == nil {
			if selection.GPUType == "" {
				selection.GPUType = strings.TrimSpace(resolved.GPUType)
			}
			if selection.GPUCount <= 0 && resolved.GPUCount > 0 {
				selection.GPUCount = resolved.GPUCount
				payload["gpu_count"] = resolved.GPUCount
			}
			if selection.VolumeGB <= 0 && resolved.VolumeGB > 0 {
				selection.VolumeGB = resolved.VolumeGB
				payload["volume_gb"] = resolved.VolumeGB
			}
		}
	}

	defaultIndex := 0
	if selection.GPUType != "" {
		for i, gpu := range gpus {
			if strings.EqualFold(strings.TrimSpace(gpu), selection.GPUType) {
				defaultIndex = i
				break
			}
		}
	}

	unavailable := map[string]struct{}{}
	if selection.GPUType != "" {
		unavailable[normalizeGPUChoice(selection.GPUType)] = struct{}{}
	}

	lastErr := err
	for {
		fmt.Printf("%sNo GPU capacity for current selection.%s\n", cAmpGold, cReset)
		candidates := availableGPUChoices(gpus, unavailable)
		if len(candidates) == 0 {
			var zero T
			return zero, fmt.Errorf("no GPU capacity currently available in listed GPUs; run `tahuna gpus list` and try again later")
		}
		if defaultIndex >= len(candidates) {
			defaultIndex = 0
		}
		nextGPU := promptChoice("Choose available GPU", candidates, defaultIndex)
		payload["gpu_type"] = nextGPU
		if selection.GPUCount > 0 {
			payload["gpu_count"] = selection.GPUCount
		}
		if selection.VolumeGB > 0 {
			payload["volume_gb"] = selection.VolumeGB
		}
		if selection.GPUCount > 0 {
			if err := validateGPUSelection(nextGPU, selection.GPUCount); err != nil {
				fmt.Printf("%s%s%s\n", cAmpGold, err.Error(), cReset)
				unavailable[normalizeGPUChoice(nextGPU)] = struct{}{}
				choice := promptChoice("Still unavailable", []string{"Try another GPU", "Cancel"}, 0)
				if choice == "Cancel" {
					var zero T
					return zero, lastErr
				}
				continue
			}
		}

		resp, err = options.create(payload)
		if err == nil {
			if options.persistSelection != nil {
				options.persistSelection(nextGPU, selection)
			}
			return resp, nil
		}
		lastErr = err
		if !isNoGPUCapacityCreateError(err) {
			var zero T
			return zero, err
		}

		unavailable[normalizeGPUChoice(nextGPU)] = struct{}{}
		choice := promptChoice("Still unavailable", []string{"Try another GPU", "Cancel"}, 0)
		if choice == "Cancel" {
			var zero T
			return zero, lastErr
		}
		defaultIndex = 0
		for i, gpu := range candidates {
			if strings.EqualFold(strings.TrimSpace(gpu), nextGPU) {
				defaultIndex = (i + 1) % len(candidates)
				break
			}
		}
	}
}

func loadEnvironmentComputeSelections(environmentID string) (environmentComputeSelections, error) {
	if strings.TrimSpace(environmentID) == "" {
		return environmentComputeSelections{}, errors.New("environment_id is required")
	}
	env, err := doJSONAs[environmentResponse](http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return environmentComputeSelections{}, err
	}

	environment := computeSelection{
		GPUType:  strings.TrimSpace(env.GPUType),
		GPUCount: int(env.GPUCount),
		VolumeGB: int(env.VolumeGB),
	}
	serve := environment
	if env.ServeSnapshot != nil {
		if value := strings.TrimSpace(env.ServeSnapshot.GPUType); value != "" {
			serve.GPUType = value
		}
		if value := int(env.ServeSnapshot.GPUCount); value > 0 {
			serve.GPUCount = value
		}
		if value := int(env.ServeSnapshot.VolumeGB); value > 0 {
			serve.VolumeGB = value
		}
	}

	return environmentComputeSelections{
		Environment: environment,
		Serve:       serve,
	}, nil
}

func normalizeGPUChoice(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func availableGPUChoices(gpus []string, unavailable map[string]struct{}) []string {
	if len(gpus) == 0 {
		return nil
	}
	choices := make([]string, 0, len(gpus))
	seen := map[string]struct{}{}
	for _, gpu := range gpus {
		trimmed := strings.TrimSpace(gpu)
		if trimmed == "" {
			continue
		}
		key := normalizeGPUChoice(trimmed)
		if _, blocked := unavailable[key]; blocked {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		choices = append(choices, trimmed)
	}
	return choices
}

func persistFallbackProjectCompute(environmentID, gpuType, resource string, apply func(cfg *projectConfig, selectedGPU string)) {
	selectedGPU := strings.TrimSpace(gpuType)
	if strings.TrimSpace(environmentID) == "" || selectedGPU == "" {
		return
	}
	cfg, err := loadPersistedProjectConfig()
	if err != nil {
		logWarn("%s created with fallback GPU %q but failed to load local project config for %s: %v", resource, selectedGPU, environmentID, err)
		return
	}
	apply(&cfg, selectedGPU)
	if err := saveProjectConfig(cfg); err != nil {
		logWarn("%s created with fallback GPU %q but failed to save local project config for %s: %v", resource, selectedGPU, environmentID, err)
		return
	}
	if err := syncIncremental(environmentID, syncScope{}, syncOptions{}); err != nil {
		logWarn("%s created with fallback GPU %q but failed to sync environment %s: %v", resource, selectedGPU, environmentID, err)
	}
}

func persistFallbackEnvironmentGPU(path, gpuType string) {
	environmentID, err := environmentIDFromRunsPath(path)
	if err != nil {
		return
	}
	persistFallbackProjectCompute(environmentID, gpuType, "run", func(cfg *projectConfig, selectedGPU string) {
		cfg.GPUType = selectedGPU
	})
}

func persistFallbackServeCompute(environmentID, gpuType string, gpuCount, volumeGB int) {
	persistFallbackProjectCompute(environmentID, gpuType, "serve", func(cfg *projectConfig, selectedGPU string) {
		cfg.ServeGPUType = selectedGPU
		if gpuCount > 0 {
			cfg.ServeGPUCount = gpuCount
		}
		if volumeGB > 0 {
			cfg.ServeVolumeGB = volumeGB
		}
	})
}

func isNoGPUCapacityCreateError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "no gpu capacity currently available") ||
		strings.Contains(text, "no instances currently available") ||
		strings.Contains(text, "insufficient capacity")
}

func supportsInteractivePrompts() bool {
	in, inErr := os.Stdin.Stat()
	out, outErr := os.Stdout.Stat()
	if inErr != nil || outErr != nil {
		return false
	}
	return (in.Mode()&os.ModeCharDevice) != 0 && (out.Mode()&os.ModeCharDevice) != 0
}

func environmentIDFromRunsPath(path string) (string, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 || parts[0] != "environments" || parts[2] != "runs" {
		return "", errors.New("environment id not found in path")
	}
	environmentID := strings.TrimSpace(parts[1])
	if environmentID == "" {
		return "", errors.New("environment id is empty")
	}
	return environmentID, nil
}
