package train

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeCommandDefaultsToUVTrain(t *testing.T) {
	got := NormalizeCommand(nil)
	want := []string{"uv", "run", "python", "-u", "train.py"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected default command: %#v", got)
	}
}

func TestNormalizeCommandWrapsPythonWithUV(t *testing.T) {
	got := NormalizeCommand([]string{"python", "train.py"})
	want := []string{"uv", "run", "python", "-u", "train.py"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected normalized command: %#v", got)
	}
}

func TestLoadCommandFromConfigReadsYamlCommand(t *testing.T) {
	root := t.TempDir()
	content := "command:\n  - python\n  - train.py\n  - --epochs\n  - \"3\"\n"
	if err := os.WriteFile(filepath.Join(root, "config.yaml"), []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	command, source := LoadCommandFromConfig(root)
	want := []string{"python", "train.py", "--epochs", "3"}
	if !reflect.DeepEqual(command, want) {
		t.Fatalf("unexpected command: %#v", command)
	}
	if source == "" {
		t.Fatal("expected config source path")
	}
}

func TestResolveTrainEnvironmentInjectsRuntimeTokenForTahunaBaseURL(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.tahuna.ai/api/monitoring/wandb",
		"PATH=/usr/bin",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	value, ok := lookupEnvValue(resolved, "WANDB_API_KEY")
	if !ok {
		t.Fatal("expected WANDB_API_KEY to be injected")
	}
	if value != "runtime-token-123" {
		t.Fatalf("unexpected WANDB_API_KEY value: %q", value)
	}
}

func TestResolveTrainEnvironmentSkipsInjectionWhenWandbAPIKeyAlreadySet(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.tahuna.ai/api/monitoring/wandb",
		"WANDB_API_KEY=user-key",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	value, ok := lookupEnvValue(resolved, "WANDB_API_KEY")
	if !ok {
		t.Fatal("expected WANDB_API_KEY to remain set")
	}
	if value != "user-key" {
		t.Fatalf("expected user WANDB_API_KEY to win, got %q", value)
	}
}

func TestResolveTrainEnvironmentSkipsInjectionWhenBaseURLIsNonTahuna(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.wandb.ai",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	if _, ok := lookupEnvValue(resolved, "WANDB_API_KEY"); ok {
		t.Fatal("did not expect WANDB_API_KEY to be injected for non-Tahuna base URL")
	}
}

func TestIsTahunaWandbBaseURL(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{
			name:  "absolute URL with exact path",
			value: "https://api.tahuna.ai/api/monitoring/wandb",
			want:  true,
		},
		{
			name:  "absolute URL with trailing slash",
			value: "https://api.tahuna.ai/api/monitoring/wandb/",
			want:  true,
		},
		{
			name:  "relative path",
			value: "/api/monitoring/wandb",
			want:  true,
		},
		{
			name:  "different path",
			value: "https://api.tahuna.ai/api/monitoring/other",
			want:  false,
		},
		{
			name:  "wandb SaaS URL",
			value: "https://api.wandb.ai",
			want:  false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isTahunaWandbBaseURL(tc.value)
			if got != tc.want {
				t.Fatalf("isTahunaWandbBaseURL(%q) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}
