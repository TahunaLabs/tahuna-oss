package bootstrap

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"warden/internal/runtimeapi"
)

const (
	sessionHeartbeatInterval = 15 * time.Second
	sessionPollInterval      = 5 * time.Second
)

func (r *Runner) runSession(ctx context.Context) error {
	if err := r.api.EmitSessionHeartbeat(ctx); err != nil {
		return fmt.Errorf("emit compute session heartbeat: %w", err)
	}

	go r.runSessionHeartbeatLoop(ctx, r.api)

	for {
		if err := r.pollAndRunSessionAssignment(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			_, _ = fmt.Fprintf(os.Stderr, "session assignment failed: %v\n", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(sessionPollInterval):
		}
	}
}

func (r *Runner) runSessionHeartbeatLoop(ctx context.Context, sessionAPI *runtimeapi.Client) {
	ticker := time.NewTicker(sessionHeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := sessionAPI.EmitSessionHeartbeat(ctx); err != nil {
				_, _ = fmt.Fprintf(os.Stderr, "session heartbeat failed: %v\n", err)
			}
		}
	}
}

func (r *Runner) pollAndRunSessionAssignment(ctx context.Context) error {
	assignment, err := r.api.GetSessionAssignment(ctx)
	if err != nil {
		return fmt.Errorf("poll compute session assignment: %w", err)
	}
	runID := strings.TrimSpace(assignment.RunID)
	if runID == "" {
		return nil
	}

	runAPI := runtimeapi.NewRun(r.cfg.APIBase, runID, r.cfg.RuntimeToken, r.cfg.RequestTimeout())
	runErr := r.runTrainingWithAPI(ctx, runAPI)
	idleErr := r.api.MarkSessionIdle(ctx, runID)
	if runErr != nil {
		return runErr
	}
	if idleErr != nil {
		return fmt.Errorf("mark compute session idle: %w", idleErr)
	}
	return nil
}
