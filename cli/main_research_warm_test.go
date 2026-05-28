package main

import (
	"os"
	"strings"
	"testing"
)

func TestResearchRunCreatePayload_WarmBaselineAndTrial(t *testing.T) {
	session := researchSession{
		WarmCompute: &researchWarmComputeConfig{
			Enabled:         true,
			KeepWarmMinutes: 10,
		},
	}

	baseline := researchRunCreatePayload("research-baseline", session, true)
	if baseline["name"] != "research-baseline" {
		t.Fatalf("expected baseline name, got %v", baseline["name"])
	}
	if baseline["keep_warm_after_minutes"] != float64(10) {
		t.Fatalf("expected baseline keep warm payload, got %v", baseline)
	}
	if _, ok := baseline["warm"]; ok {
		t.Fatalf("baseline must start the warm session, got %v", baseline)
	}

	trial := researchRunCreatePayload("research-trial-1", session, false)
	if trial["name"] != "research-trial-1" {
		t.Fatalf("expected trial name, got %v", trial["name"])
	}
	if trial["warm"] != true {
		t.Fatalf("expected warm trial payload, got %v", trial)
	}
	if _, ok := trial["keep_warm_after_minutes"]; ok {
		t.Fatalf("trial must reuse the warm session, got %v", trial)
	}
}

func TestResearchKeepWarmMinutesRequiresExplicitResearchFlag(t *testing.T) {
	minutes, err := researchKeepWarmMinutes(researchRunOptions{})
	if err != nil {
		t.Fatalf("expected empty keep-warm flag to pass: %v", err)
	}
	if minutes != 0 {
		t.Fatalf("expected Auto-Research to ignore project train keep-warm defaults, got %v", minutes)
	}

	minutes, err = researchKeepWarmMinutes(researchRunOptions{keepWarmMinutes: "7.5"})
	if err != nil {
		t.Fatalf("expected explicit keep-warm flag to pass: %v", err)
	}
	if minutes != 7.5 {
		t.Fatalf("expected explicit keep-warm minutes, got %v", minutes)
	}
}

func TestValidateResearchRuntimeSpecUnchangedRejectsRuntimeChange(t *testing.T) {
	setupTestProject(t, false)
	session := researchSession{
		RuntimeSpec: researchRuntimeSpecFromConfig(projectConfig{
			Framework:        "pt",
			FrameworkVersion: "2.8.0-cu128",
			PythonVersion:    "3.11",
			GPUType:          "NVIDIA A100 80GB",
			GPUCount:         1,
			VolumeGB:         80,
		}),
	}

	if err := validateResearchRuntimeSpecUnchanged(session); err != nil {
		t.Fatalf("expected unchanged runtime spec to pass: %v", err)
	}

	raw, err := os.ReadFile(projectConfigFilePath())
	if err != nil {
		t.Fatalf("failed to read project config: %v", err)
	}
	next := strings.Replace(string(raw), `gpu_type = "NVIDIA A100 80GB"`, `gpu_type = "NVIDIA L40S"`, 1)
	if err := os.WriteFile(projectConfigFilePath(), []byte(next), 0o600); err != nil {
		t.Fatalf("failed to mutate project config: %v", err)
	}

	err = validateResearchRuntimeSpecUnchanged(session)
	if err == nil {
		t.Fatal("expected runtime spec change to fail")
	}
	if !strings.Contains(err.Error(), "research runtime spec changed") {
		t.Fatalf("unexpected error: %v", err)
	}
}
