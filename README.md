# tahuna

GPU provisioning platform for ML training. Provision GPUs and run your code with minimal setup.

## Structure

```
├── apps/
│   ├── web/          # SvelteKit dashboard
│   ├── backend/      # Go API (users/envs/auth)
│   ├── worker/       # Go worker (queue consumer for runs)
│   └── provisioner/  # Internal RunPod orchestration package/ops tool
├── cli/              # Go CLI
├── libs/             # Shared libs (placeholder)
├── proto/            # gRPC contracts (placeholder)
└── infra/            # Infra definitions (placeholder)
```

## Components

### Make Targets

Install everything:

```bash
make install
```

Run core services (backend + worker + web):

```bash
make run
```

Per-component targets are also available:
- `make install-web` / `make run-web`
- `make install-backend` / `make run-backend`
- `make install-worker` / `make run-worker`
- `make install-provisioner` / `make run-provisioner`
- `make install-cli` / `make run-cli`

### Backend
Go backend API (Postgres + Redis + Asynq producer).

```bash
make install-backend
make run-backend
```

### Worker
Go worker service that consumes Redis/Asynq run jobs and executes provisioning.

```bash
make install-worker
make run-worker
```

### CLI
Go CLI for developers to provision GPUs and run training jobs programmatically.

```bash
make install-cli
make run-cli
```

### CLI Install (Homebrew)

Formula template is included at `Formula/tahuna.rb`.
Update release URL/SHA fields, publish artifacts, then install:

```bash
brew tap <your-org>/tap
brew install tahuna
```

### Web
Web dashboard for monitoring and managing training runs.

```bash
make install-web
make run-web
```

## Deployment

| Component | Platform | Root Directory |
|-----------|----------|----------------|
| Backend | GCP Cloud Run | `apps/backend/` |
| Worker | GCP Cloud Run job / worker VM | `apps/worker/` |
| Web | Vercel | `apps/web/` |
| CLI | GitHub Releases / Homebrew (planned) | `cli/` |

## Infra Prereqs

- PostgreSQL (`DATABASE_URL`)
- Redis (`REDIS_ADDR`) for queue and cache

Start local infra:

```bash
docker compose up -d
```

Stop local infra:

```bash
docker compose down
```
