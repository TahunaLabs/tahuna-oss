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
