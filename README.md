# boob-ai

GPU provisioning platform for ML training. Provision GPUs and run your code with minimal setup.

## Structure

```
├── backend/      # Provisioning service (Python)
├── sdk/          # Python SDK for users
└── frontend/     # Web dashboard (Next.js)
```

## Components

### Backend
The provisioning backend that handles GPU allocation via RunPod and storage via R2.

```bash
cd backend
uv sync
uv run python -m core.cli --help
```

### SDK
Python SDK for developers to provision GPUs and run training jobs programmatically.

```bash
cd sdk
pip install -e .
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
| SDK | PyPI | `sdk/` |
