package train

import (
	"errors"
	"io"
	"os"
	"reflect"
	"testing"
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
