package train

import (
	"errors"
	"io"
	"os"
	"reflect"
	"testing"

	"warden/internal/pythonenv"
)

func TestNormalizeCommandPassesThroughNonEmpty(t *testing.T) {
	input := []string{"bash", "-lc", "python train.py"}
	got, err := NormalizeCommand(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("unexpected normalized command: %#v", got)
	}
}

func TestNormalizeCommandRejectsEmpty(t *testing.T) {
	_, err := NormalizeCommand(nil)
	if err == nil {
		t.Fatal("expected error for nil command")
	}
	_, err = NormalizeCommand([]string{})
	if err == nil {
		t.Fatal("expected error for empty command")
	}
}

func TestResolveTrainEnvironmentInjectsRuntimeTokenForTahunaBaseURL(t *testing.T) {
	baseEnv := []string{
		"TAHUNA_RUNTIME_TOKEN=runtime-token-123",
		"WANDB_BASE_URL=https://api.tahuna.ai/api/monitoring/wandb",
		"PATH=/usr/bin",
	}

	resolved := resolveTrainEnvironment(baseEnv)

	value, ok := pythonenv.LookupEnvValue(resolved, "WANDB_API_KEY")
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

	value, ok := pythonenv.LookupEnvValue(resolved, "WANDB_API_KEY")
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

	if _, ok := pythonenv.LookupEnvValue(resolved, "WANDB_API_KEY"); ok {
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

func TestIsBenignStreamReadError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "os closed", err: os.ErrClosed, want: true},
		{name: "io closed pipe", err: io.ErrClosedPipe, want: true},
		{name: "message file already closed", err: errors.New("read |0: file already closed"), want: true},
		{name: "unexpected eof", err: errors.New("unexpected EOF"), want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isBenignStreamReadError(tc.err)
			if got != tc.want {
				t.Fatalf("isBenignStreamReadError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
