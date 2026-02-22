# tahuna

GPU provisioning platform for ML training. Provision GPUs and run your code with minimal setup.

## Structure

```
├── apps/
│   ├── web/          # Next.js dashboard
│   ├── backend/      # Go API (users/sessions/envs/auth)
│   └── provisioner/  # Go RunPod orchestration runtime
├── cli/              # Go CLI
├── libs/             # Shared libs (placeholder)
├── proto/            # gRPC contracts (placeholder)
└── infra/            # Infra definitions (placeholder)
```

## Components

### Backend
Go backend API.

```bash
cd apps/backend
go run .
```

### Provisioner
Go provisioner service/runtime for RunPod orchestration.

```bash
cd apps/provisioner
go run .
```

### CLI
Go CLI for developers to provision GPUs and run training jobs programmatically.

```bash
cd cli
go run . init
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
cd apps/web
npm install
npm run dev
```

## Deployment

| Component | Platform | Root Directory |
|-----------|----------|----------------|
| Backend | GCP Cloud Run | `apps/backend/` |
| Provisioner | GCP Cloud Run / worker | `apps/provisioner/` |
| Web | Vercel | `apps/web/` |
| CLI | GitHub Releases / Homebrew (planned) | `cli/` |
