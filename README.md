# tahuna

GPU provisioning platform for ML training. Provision GPUs and run your code with minimal setup.

## Structure

```
├── backend/      # Provisioning service (Python)
├── cli/          # Go CLI for users
└── frontend/     # Web dashboard (Next.js)
```

## Components

### Backend
The provisioning backend that handles GPU allocation via RunPod and storage via R2.

```bash
cd backend
uv sync
uv run uvicorn core.api:app --reload --port 8000
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

### Frontend
Web dashboard for monitoring and managing training runs.

```bash
cd frontend
npm install
npm run dev
```

## Deployment

| Component | Platform | Root Directory |
|-----------|----------|----------------|
| Backend | GCP Cloud Run | `backend/` |
| Frontend | Vercel | `frontend/` |
| CLI | GitHub Releases / Homebrew (planned) | `cli/` |
