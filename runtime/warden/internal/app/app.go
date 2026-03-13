package app

import (
	"context"
	"errors"
	"fmt"
	"io"

	"warden/internal/bootstrap"
	"warden/internal/config"
)

func Run(ctx context.Context, stdout, stderr io.Writer) int {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		fmt.Fprintf(stderr, "warden config error: %v\n", err)
		return 2
	}

	fmt.Fprintf(stdout, "warden startup run_id=%s workspace=%s\n", cfg.RunID, cfg.WorkspaceRoot)
	if err := bootstrap.Run(ctx, cfg); err != nil {
		if errors.Is(err, bootstrap.ErrNotImplemented) {
			fmt.Fprintln(stderr, "warden bootstrap not implemented yet")
			return 3
		}
		fmt.Fprintf(stderr, "warden bootstrap failed: %v\n", err)
		return 1
	}

	return 0
}
