package bootstrap

import (
	"context"
	"fmt"
	"strings"

	"warden/internal/config"
	"warden/internal/runtimeapi"
)

const maxURLRefreshRetries = 1

type State string

const (
	StateInit         State = "init"
	StateProvisioning State = "provisioning"
	StateMaterialize  State = "materialize"
	StateInstall      State = "install"
	StateTraining     State = "training"
	StateServing      State = "serving"
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
		api:   newRuntimeClient(cfg),
		cfg:   cfg,
	}
}

func newRuntimeClient(cfg config.Config) *runtimeapi.Client {
	if cfg.Mode == config.ModeServe {
		return runtimeapi.NewServe(cfg.APIBase, cfg.ServeID, cfg.RuntimeToken, cfg.RequestTimeout())
	}
	if cfg.Mode == config.ModeSession {
		return runtimeapi.NewSession(cfg.APIBase, cfg.ComputeSessionID, cfg.RuntimeToken, cfg.RequestTimeout())
	}
	return runtimeapi.NewRun(cfg.APIBase, cfg.RunID, cfg.RuntimeToken, cfg.RequestTimeout())
}

func (r *Runner) transition(next State) {
	r.state = next
}

func (r *Runner) Run(ctx context.Context) error {
	switch r.cfg.Mode {
	case config.ModeServe:
		return r.runServe(ctx)
	case config.ModeSession:
		return r.runSession(ctx)
	case config.ModeRun:
		return r.runTraining(ctx)
	default:
		return fmt.Errorf("unsupported runtime mode %q", strings.TrimSpace(string(r.cfg.Mode)))
	}
}

func Run(ctx context.Context, cfg config.Config) error {
	return NewRunner(cfg).Run(ctx)
}
