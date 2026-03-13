package bootstrap

import (
	"context"
	"errors"
	"fmt"

	"warden/internal/config"
	"warden/internal/runtimeapi"
)

var ErrNotImplemented = errors.New("warden runtime bootstrap is not implemented yet")

type State string

const (
	StateInit         State = "init"
	StateProvisioning State = "provisioning"
	StateMaterialize  State = "materialize"
	StateInstall      State = "install"
	StateTraining     State = "training"
	StateArtifacts    State = "artifacts"
	StateCompleted    State = "completed"
	StateFailed       State = "failed"
)

type Runner struct {
	state State
	api   *runtimeapi.Client
	cfg   config.Config
}

func NewRunner(cfg config.Config) *Runner {
	return &Runner{
		state: StateInit,
		api:   runtimeapi.New(cfg.APIBase, cfg.RunID, cfg.RuntimeToken, cfg.RequestTimeout()),
		cfg:   cfg,
	}
}

func (r *Runner) transition(next State) {
	r.state = next
}

func (r *Runner) Run(ctx context.Context) error {
	r.transition(StateProvisioning)
	if err := r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusProvisioning,
		Message: "warden bootstrap started",
	}); err != nil {
		return fmt.Errorf("emit provisioning status: %w", err)
	}
	if _, err := r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: "bootstrap: requesting materialization plan",
			Level:   "info",
			Source:  "bootstrap",
		},
	}); err != nil {
		return fmt.Errorf("emit startup log: %w", err)
	}

	if _, err := r.api.GetBootstrapPlan(ctx); err != nil {
		r.transition(StateFailed)
		_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
			Status:  runtimeapi.StatusFailed,
			Message: "bootstrap failed",
			Error:   err.Error(),
		})
		return fmt.Errorf("fetch bootstrap plan: %w", err)
	}

	r.transition(StateMaterialize)
	return r.failNotImplemented(ctx)
}

func (r *Runner) failNotImplemented(ctx context.Context) error {
	r.transition(StateFailed)
	_, _ = r.api.EmitLogs(ctx, []runtimeapi.LogLine{
		{
			Message: "bootstrap: materialization/execution steps not implemented yet",
			Level:   "error",
			Source:  "bootstrap",
		},
	})
	_ = r.api.EmitStatus(ctx, runtimeapi.StatusUpdate{
		Status:  runtimeapi.StatusFailed,
		Message: "bootstrap failed",
		Error:   ErrNotImplemented.Error(),
	})
	return ErrNotImplemented
}

func Run(ctx context.Context, cfg config.Config) error {
	return NewRunner(cfg).Run(ctx)
}
