package app

import (
	"context"
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

	fmt.Fprintf(stdout, "warden startup mode=%s id=%s workspace=%s\n", cfg.Mode, cfg.ResourceID(), cfg.WorkspaceRoot)
	if err := bootstrap.Run(ctx, cfg); err != nil {
		fmt.Fprintf(stderr, "warden bootstrap failed: %v\n", err)
		return 1
	}

	return 0
}
