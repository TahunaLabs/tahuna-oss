## Comprehensive Tahuna Analysis
Show less
Based on my thorough exploration of the codebase, here is a detailed understanding of Tahuna:
---
## 1. **WHAT DOES TAHUNA DO? (Product Overview)**
Tahuna is a **GPU provisioning and ML training orchestration platform** for data scientists. It simplifies the workflow of launching training jobs on cloud GPUs while managing code/data synchronization, dependency management, and execution tracking.
**Core value proposition:**
- One-command setup: `tahuna init` scaffolds a complete ML project
- One-command training: `tahuna train` syncs code/data and launches on GPU
- Reproducible runs: Code/data pinned to manifest hashes, ensuring reproducibility
- Integrated monitoring: View logs, metrics, and artifacts from CLI and dashboard
**Target user:** Data scientists who want frictionless GPU training without wrestling with Docker, K8s, or complex DevOps.
---
## 2. **ARCHITECTURE: Main Components**
### **Three-Part Monorepo Structure:**
#### **A. CLI (`/cli/` — Go)**
A standalone command-line tool that users install and run locally. Provides:
- Authentication (`tahuna login`) — browser-based OAuth flow
- Project initialization (`tahuna init .` or `tahuna init <project-name>`)
- Incremental sync of code/data to R2 storage
- Run lifecycle management (`train`, `run create/list/show/logs/cancel`)
- Interactive shell mode (`tahuna shell`)
- Environment management (`env list/show/update/delete`)
**Key files:**
- `main.go` — command routing & auth flow
- `commands_core.go` — init, train, environment commands
- `sync.go` — incremental manifest-based code/data sync
- `run_ops.go` — run creation, listing, monitoring
- `project.go` — project config collection and detection
#### **B. Web + Convex Backend (`/web/` — Next.js + TypeScript)**
A Next.js frontend + Convex serverless backend combo serving:
- **Dashboard** — environments, runs, data storage management
- **HTTP API** — REST endpoints for CLI integration at `/api/*`
- **Authentication** — Better Auth integration with email/OTP
- **Monitoring** — W&B-compatible monitoring API for metrics/logs
- **Data storage** — R2 integration for code/data blobs and artifacts
**Key Convex tables:**
- `environments` — project configs, GPU defaults, manifest pointers
- `runs` — training job records with status, pinned manifests, pod IDs
- `runEvents`, `runRuntimeLogs`, `runRuntimeMetrics` — audit trail & monitoring
- `wandbRuns`, `wandbMetrics` — W&B-compatible run data
**HTTP routes** (`/web/convex/http.ts`):
- `/api/environments/*` — CRUD for environments
- `/api/runs/*` — run lifecycle + runtime callbacks
- `/api/sync/*` — blob upload, manifest upload, commit
- `/api/catalog` — GPU availability from Runpod
- `/api/monitoring/wandb/*` — W&B-compatible monitoring
- `/api/auth/*` — Better Auth routes
#### **C. Runtime (`/runtime/` — Go)**
An embedded in-pod bootstrap orchestrator:
- **Warden** (`/runtime/warden/cmd/warden/main.go`) — single Go binary bundled into Tahuna Docker images
- **Image builds** (`/runtime/images/Dockerfile`) — embeds warden + framework-specific base images (PyTorch/TensorFlow)
- **Bootstrap packages**:
  - `config` — runtime config parsing
  - `bootstrap` — orchestrates materialization → install → training → artifacts
  - `materialize` — downloads code/data from R2 by manifest
  - `train` — executes user entrypoint, captures logs/metrics
  - `artifacts` — uploads `/workspace/outputs/*` to R2
  - `runtimeapi` — HTTP client for pod → backend callbacks
**Pod workflow:**
1. Pod starts with Warden as entrypoint
2. Fetch bootstrap plan (manifests + download URLs)
3. Materialize code/data from R2 to `/workspace/`
4. Install dependencies via `uv sync`
5. Execute user's training entrypoint
6. Extract metrics from stdout (regex fallback) or W&B SDK calls
7. Upload output artifacts to R2
8. Report completion/failure back to backend
---
## 3. **TECHNOLOGY STACK**
### **Languages & Frameworks:**
- **CLI:** Go 1.22 (single binary, cross-platform)
- **Web frontend:** Next.js 16 + React 19 + TypeScript 5.9
- **Backend:** Convex (serverless TypeScript backend)
- **Pod runtime:** Go (warden binary)
- **Styling:** Tailwind CSS 4 + shadcn/ui (Radix UI components)
### **Cloud Services & APIs:**
- **Compute:** Runpod (GPU pod provisioning via GraphQL API)
- **Storage:** Cloudflare R2 (code/data blobs, manifests, artifacts)
- **Auth:** Better Auth (email/OTP, API keys)
- **Email:** Resend (OTP delivery)
- **Monitoring (integration):** W&B-compatible GraphQL + file streaming API
### **Package Managers & Build Tools:**
- **Frontend:** Bun 1.1.20 (package manager & runtime)
- **Python in pods:** `uv` (ultra-fast Python package manager)
- **Docs:** Fumadocs (MDX-based documentation)
### **Infrastructure Dependencies:**
- **Local storage:** `.tahuna/` directory for project config, environment ID, sync cache
- **Config files:** `config.yaml`, `pyproject.toml`, `uv.lock` (declared by user or scaffolded)
- **Convex deployment:** Convex Cloud for serverless backend
---
## 4. **USER EXPERIENCE / WORKFLOW**
### **Workflow 1: New Project (Most Common)**
```bash
# 1. Authenticate once
tahuna login
  ↓ [Opens browser for OAuth]
  ↓ [Stores token in ~/.config/tahuna/config.env]
# 2. Initialize project
tahuna init .
  ↓ [Guided prompts: entrypoint, data dir, output dir, config file, framework]
  ↓ [Auto-detects framework from pyproject.toml or prompts]
  ↓ [Scaffolds: config.yaml, pyproject.toml, uv.lock, train.py if missing]
  ↓ [Creates .tahuna/environment_id linking project to backend]
  ↓ [Prompts for machine/GPU specs]
# 3. Sync (automatic before run, or manual)
tahuna sync           # sync code + data
tahuna sync code      # code only
tahuna sync data      # data only
# 4. Launch training (blocking)
tahuna train
  ↓ [Preflight: auto-syncs code/data]
  ↓ [Creates run record on backend]
  ↓ [Runpod provisions GPU pod]
  ↓ [Warden downloads code/data, installs deps, runs train.py]
  ↓ [CLI polls /api/runs/{run_id} every 5s, shows live logs]
  ↓ [On completion: pod uploads artifacts, displays summary]
# 5. Detached training
tahuna train -d       # launch & exit immediately
# 6. Monitor from CLI
tahuna run list       # show recent runs
tahuna run show <id>  # details + artifact keys
tahuna run logs <id>  # stream logs
tahuna run watch <id> # live status poll
tahuna run cancel <id> # graceful shutdown
```
### **Workflow 2: Existing Project with Git Repo (Future)**
- Connect GitHub repo, auto-detect framework
- Create environment from repo metadata
- Select default machine/GPU
- Run training from CLI or dashboard
### **Dashboard UX**
- **Environments view** — create/delete environments, update GPU specs
- **Runs view** — list runs with status, create new runs with GPU overrides
- **Storage view** — browse synced code/data blobs and artifacts, rename/delete items
- **Metrics** — view W&B-compatible run metrics/charts (future)
---
## 5. **KEY FEATURES**
### **Implemented (MVP Status):**
1. **Project Initialization** — Interactive scaffolding of config, entrypoint, dependency files
2. **Incremental Sync** — Content-addressed code/data uploads using SHA256 hashing and manifest diffing
3. **Manifest Versioning** — Code/data pinned to immutable manifest hashes for reproducibility
4. **Run Provisioning** — Direct Runpod integration to create GPU pods on-demand
5. **Pod Bootstrap** — Warden runtime materializes code/data, installs deps, executes training
6. **Metrics Extraction** — Stdout regex parsing for `metric=value` patterns (W&B SDK future)
7. **Artifact Upload** — Pod uploads `/workspace/outputs/*` to R2, committed to run record
8. **CLI Monitoring** — Real-time run status polling, log streaming, metrics display
9. **Interactive Shell** — `tahuna shell` for command-line repl mode
10. **Environment Management** — List/show/update/delete environments with GPU spec overrides
11. **Run Lifecycle** — Create/list/show/watch/logs/cancel/delete runs
12. **API Key Auth** — Persistent CLI auth tokens, per-user API key management
13. **W&B API Compatibility** — GraphQL endpoint, file streaming, metric upload hooks (wired but UI limited)
14. **Data Bindings** — Bind multiple data sources to environments
### **Partially Implemented:**
- **Dashboard monitoring** — UI exists but deep observability limited
- **W&B live charting** — Metrics ingested but UI needs richer streaming surfaces
- **Output artifact download** — Keys exposed but no download URL generation yet
- **Terminal UI** — Basic status panels, not full split static+interactive layout
### **Future (Post-MVP):**
- Git repo auto-detection and connection
- Queue system for no-capacity scenarios (vs. current error + interactive fallback)
- Tahuna tracking SDK (drop-in wandb replacement)
- Per-file artifact size limits
- Chunked upload for 100MB+ files
- Artifact history/versioning (beyond latest snapshot)
- Custom Docker image support
- Cross-account environment sharing
- Periodic output sync during training
---
## 6. **TRAINING / FINE-TUNING MODEL**
### **Not about model fine-tuning; about *training orchestration*:**
Tahuna doesn't provide fine-tuning itself. Instead, it orchestrates *any* Python training script:
1. **User writes** `train.py` (PyTorch, TensorFlow, etc.)
2. **Declares dependencies** in `pyproject.toml` and `uv.lock`
3. **Configures hyperparameters** in `config.yaml` (parsed by user code)
4. **Specifies entrypoint** in `config.yaml`: `command: uv run python -u train.py`
5. **Tahuna handles:**
   - Syncing code/data to R2
   - Selecting framework + Python version from `uv` files
   - Choosing Runpod image: `pytorch:2.8.0-cu128` or `pytorch:2.4.0-cu124` etc.
   - Provisioning GPU pod
   - Materializing code/data into pod
   - Running `uv sync` to install project deps
   - Executing entrypoint + capturing logs
   - Extracting metrics (regex or W&B SDK)
   - Uploading artifacts
### **Framework Support:**
Currently bundled images for:
- **PyTorch:** 2.8.0-cu128, 2.4.0-cu124, 2.2.0-cu121
- **TensorFlow:** (not yet in runtime-images.json, but architecture supports it)
- **Custom:** Future support for user-provided Docker images
---
## 7. **INTEGRATIONS**
### **W&B (Weights & Biases):**
- **W&B-compatible HTTP API** at `/api/monitoring/wandb/*`
- Supports:
  - GraphQL endpoint for run metadata (entity, project, config, requirements, summary)
  - File streaming (`wandb-history.jsonl`, `wandb-summary.json`)
  - Metric upload endpoint for python SDK
- **Backend tables:** `wandbRuns`, `wandbMetrics` store W&B run data
- **W&B SDK support:** Training code can `import wandb` and call `wandb.log()`, `wandb.init()`
- **Pod env var:** `WANDB_BASE_URL` injected to point pod to Tahuna's W&B-compatible endpoints
- **Status:** Metrics are ingested but live charting UI is minimal
### **Runpod:**
- **Pod provisioning** via Runpod GraphQL API
- **Specs:** Runpod SDK parses available GPUs, pricing, max counts
- **Fallback:** If no API key, uses hardcoded GPU list
- **Security:** Cloud type configurable (`SECURE` or `COMMUNITY`)
### **R2 (Cloudflare):**
- **Code blobs:** `{userId}/blobs/{sha256}`
- **Data blobs:** `{userId}/blobs/{sha256}`
- **Code manifests:** `{userId}/environment/{envId}/manifests/code/{hash}.json`
- **Data manifests:** `{userId}/data/{dataId}/manifests/{hash}.json`
- **Artifacts:** `runs/{envId}/{timestamp}/output/{filename}`
- **Convex R2 component** provides signed URL generation
### **Better Auth:**
- Email/OTP login
- API key generation/revocation
- Per-user scoping
### **Resend:**
- Sends OTP emails for CLI and dashboard login
---
## 8. **PRICING / BUSINESS MODEL**
**No explicit pricing visible in codebase.** Observations:
1. **Self-hosted MVP** — Current codebase is MIT/internal; no SaaS offering deployed yet
2. **Potential monetization vectors** (not implemented):
   - **Per-GPU-hour billing** (Runpod handles VM cost; Tahuna could add markup)
   - **Storage tiering** (R2 bandwidth costs passed through)
   - **Premium features:**
     - Artifact size limits
     - Run history retention
     - Advanced monitoring (W&B integration)
     - Priority queue / guaranteed capacity
3. **Current deployment:** Convex Cloud (serverless, scalable)
4. **No subscription/freemium logic** visible in code; no usage tracking/metering
**Inference:** This is an MVP product designed for early adopters; revenue model TBD.
---
## 9. **WHAT MAKES IT UNIQUE TECHNICALLY**
### **1. Incremental Content-Addressed Sync**
- **Not a tarball** — Uses git-style hashing (SHA256 per file)
- **Manifest diffing** — Only uploads changed files
- **Deduplication** — Same code file across users/envs stored once in R2
- **Deterministic ordering** — Manifests sorted by path for reproducible hashes
- **Clever zero-change detection** — Compares manifest hash to cache; if identical, skips blob upload but still commits (to refresh timestamp)
### **2. Pod-Side Manifest Materialization**
- **Reproducibility** — Warden reconstructs `/workspace/` exclusively from pinned manifest hashes
- **Integrity** — SHA256 verified on every downloaded file
- **No mutable state** — Pod is ephemeral; code/data always comes from R2
### **3. W&B-Compatible API Surface**
- **Not just forwarding to W&B** — Tahuna implements its own GraphQL endpoint + file streaming
- **Pod can log metrics** via W&B SDK without W&B account
- **Metrics stored locally** in Convex for future historical analysis
### **4. Runtime Token Isolation**
- **Per-run credential** — Pod gets unique bearer token valid only for that run
- **SHA256 hashing** — Token hash stored on run record (never the token itself)
- **Automatic cleanup** — Token invalid after run terminal state
### **5. Atomic Preflight Sync**
- **Before run creation** — `tahuna train` auto-syncs code/data
- **Zero-change smart** — If code hasn't changed since last sync, skips blob re-upload
- **Fail-fast** — If env has no synced code, run creation fails immediately (409 with rollback)
### **6. Interactive No-Capacity Fallback**
- **Not just "error"** — If no GPU capacity, CLI (interactive mode) prompts user to pick alternate GPU and retries
- **Live catalog** — Fetches GPU list from Runpod on-demand
- **Non-interactive mode** — Returns 409, exits (for scripts)
### **7. Artifact Versioning Sans History**
- **Upload on success** — Artifacts uploaded only if entrypoint exits 0
- **Last-write snapshot** — Output dir contents uploaded as latest state (no rollback)
- **Upload failures don't fail run** — Artifact upload errors emit warnings but don't change run status
---
## 10. **ARCHITECTURE DIAGRAM (Conceptual)**
```
┌─────────────────────────────────────────────────────────────────┐
│                         Local Machine                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  tahuna CLI (Go binary)                                  │  │
│  │  - login → ~/.config/tahuna/config.env                  │  │
│  │  - init → .tahuna/environment_id                         │  │
│  │  - sync → R2 blobs + manifests                           │  │
│  │  - train → run creation + polling                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│       │                                                          │
│       │ HTTP (REST)                                            │
│       v                                                          │
└─────────────────────────────────────────────────────────────────┘
         │
         v
┌────────────────────────────────────────────────────────────────┐
│                    Convex Serverless Backend                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  HTTP Router (/api/*)                                    │ │
│  │  - /environments/{id} → CRUD + manifest pointers         │ │
│  │  - /runs/{id} → lifecycle + status polling               │ │
│  │  - /sync/* → blob/manifest upload, commit                │ │
│  │  - /catalog → Runpod GPU list                            │ │
│  │  - /monitoring/wandb/* → W&B-compatible API              │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Database (Convex tables)                                │ │
│  │  - environments (code/data manifest pointers)            │ │
│  │  - runs (status, pod ID, pinned manifests)              │ │
│  │  - runEvents, runRuntimeLogs, runRuntimeMetrics         │ │
│  │  - wandbRuns, wandbMetrics                               │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Auth & API Keys (Better Auth)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
         │           │           │
         v           v           v
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  R2 Storage │  │  Runpod API      │  │  Dashboard UI    │
│  (blobs,    │  │  (GPU pod        │  │  (Next.js)       │
│  manifests, │  │   provisioning)  │  │                  │
│  artifacts) │  │                  │  │                  │
└─────────────┘  └──────────────────┘  └──────────────────┘
         │            │
         │            v
         │    ┌──────────────────────────────────────┐
         │    │     Runpod GPU Pod (Ephemeral)      │
         │    │  ┌────────────────────────────────┐ │
         │    │  │ Tahuna Runtime (Warden Go)      │ │
         │    │  │ 1. Fetch bootstrap plan         │ │
         │    │  │ 2. Materialize code/data from   │ │
         │    │  │    R2 blobs via manifest        │ │
         │    │  │ 3. uv sync (dependencies)       │ │
         │    │  │ 4. Run train.py (user script)  │ │
         │    │  │ 5. Extract metrics (logs)       │ │
         │    │  │ 6. Upload artifacts to R2       │ │
         │    │  │ 7. Report status back           │ │
         │    │  └────────────────────────────────┘ │
         │    │         (Pod stdout/stderr)         │
         └────┤──→ Calls runtime API endpoints     │
              │     /api/runs/{id}/runtime/*       │
              └──────────────────────────────────────┘
```
---
## 11. **KEY FILES REFERENCE**
| Component | File | Purpose |
|-----------|------|---------|
| **CLI** | `/cli/main.go` | Command routing, login, shell |
| | `/cli/commands_core.go` | init, train, env, sync handlers |
| | `/cli/sync.go` | Incremental manifest-based sync |
| | `/cli/project.go` | Project config scaffolding |
| | `/cli/run_ops.go` | Run create/list/show/logs |
| **Backend** | `/web/convex/http.ts` | HTTP route registration |
| | `/web/convex/schema.ts` | Database tables |
| | `/web/convex/runs.ts` | Run lifecycle (56KB, 1000+ lines) |
| | `/web/convex/environments.ts` | Environment CRUD |
| | `/web/convex/storage.ts` | R2 artifact browsing |
| | `/web/convex/monitoring/wandb.ts` | W&B-compatible endpoints |
| **Frontend** | `/web/app/dashboard/page.tsx` | Main dashboard UI |
| | `/web/config.ts` | Shared config (timeouts, limits) |
| **Runtime** | `/runtime/warden/cmd/warden/main.go` | Pod entrypoint |
| | `/runtime/warden/internal/bootstrap/` | Bootstrap orchestration |
| | `/runtime/images/Dockerfile` | Warden + base image build |
| **Specs** | `/specs/pod-bootstrap.md` | Pod startup lifecycle |
| | `/specs/run-lifecycle.md` | Run state machine |
| | `/specs/sync.md` | Incremental sync algorithm |
| | `/specs/environments.md` | Environment model |
---
## Summary
**Tahuna** is a polished, MVP-ready GPU training orchestration platform that eliminates friction from the train-on-cloud workflow. Its technical differentiator is **incremental content-addressed sync** (manifest-based, not tarball), ensuring reproducibility and deduplication. The architecture cleanly separates CLI (Go), backend (Convex), and runtime (Go-embedded warden), with tight integration to Runpod for GPU provisioning and R2 for durable artifact storage. Early W&B integration hints at future rich monitoring, but current UX is solid for CLI-first users. No explicit pricing model; positioned as internal MVP for early adopter feedback.
agentId: ab8cc09ce8b33c637 (for resuming to continue this agent's work if needed)
<usage>total_tokens: 114701
tool_uses: 51
duration_ms: 356171</usage>
Agent
Read Tahuna documentation site
Perfect! Now I have a comprehensive understanding of the product. Let me create a thorough summary of my findings.
## Comprehensive Documentation Summary: Tahuna
Show less
Based on my thorough exploration of all documentation, specifications, and marketing materials in the codebase, here is what Tahuna is and how it positions itself:
---
### **Product Identity & Positioning**
**Tahuna** is described in the metadata as **"The RL Training Substrate"** with the tagline: *"Where AI agents practice, adapt, and improve through experience — no research lab required."*
The product positions itself as engineered for frontier AI work: **"Engineered For The Frontier"** — a frontier training substrate that lets users wield the full power of leading models.
**Core Value Proposition:**
- "Tahuna is the frontier training substrate that lets you wield the full power of leading models."
- "Pay as you go, with no markup for individuals."
---
### **What Tahuna Actually Does**
Tahuna is a **GPU provisioning and ML training orchestration product** that helps users:
1. **Manage compute environments** - Configure GPU type, GPU count, and storage volume
2. **Launch and monitor training runs** - Execute workloads on GPU pods and track logs, metrics, and artifacts
3. **Manage code and data** - Upload, organize, and sync training data and code to R2 object storage
4. **Monitor everything from CLI and dashboard** - Unified management interface across command-line and web UI
### **User Personas & Target Markets**
Tahuna explicitly targets:
- **AI labs and infra teams** building specific, high-performance agentic workflows
- **Ambitious startups** working on agents
- **Individuals** training agents and models with no research lab infrastructure
- **Data scientists** needing quick GPU provisioning without vendor lock-in
From the waitlist signup form: *"We are a service for fine-tuning agents. We work with AI labs, infra teams, and ambitious startups to build specific, high-performance agentic workflows."*
---
### **Core Workflows Supported**
#### **Workflow 1: New Project Setup & Training**
1. `tahuna init [. | <project-name>]` - Set up project with guided configuration
2. Detect/scaffold local project files (entrypoint, data directory, config, dependencies)
3. Create environment with GPU/framework configuration
4. `tahuna train` - Automatically sync and launch training
5. Monitor runs from CLI or dashboard
#### **Workflow 2: Existing Repository Connection**
1. Connect Git repo (future feature, not yet implemented)
2. Select machine & default configuration
3. Auto-detect framework from repository
4. Create environment
5. Create runs from existing environment + data
6. Monitor via dashboard
---
### **Key Product Features & Capabilities**
#### **CLI Commands** (`tahuna` binary)
- `tahuna login` - Browser-based authentication
- `tahuna init` - Project setup with environment creation
- `tahuna train [-d]` - Launch training run with optional detached mode
- `tahuna run create/list/show/watch/logs/cancel/delete` - Full run lifecycle management
- `tahuna run rename` - Rename runs
- `tahuna env list/show/update/delete` - Environment management
- `tahuna env data bind/unbind` - Attach/detach datasets
- `tahuna catalog gpus` - List available GPUs
- `tahuna data list/show` - List available datasets
- `tahuna sync [code | data]` - Manual code/data synchronization
- `tahuna shell` - Interactive REPL mode
#### **Dashboard (Web UI)**
- Environments view - Create, configure, delete environments
- Runs view - Monitor run status, logs, and metrics
- Storage view - Upload files, manage artifacts, rename outputs
- Runs detail page with real-time streaming logs/metrics (in development)
- Environment configuration editing
- Data binding UI
- Machine/session management page (future)
#### **Data & Artifact Management**
- Upload training data to cloud storage (R2)
- Bind multiple datasets to environments
- Automatic artifact capture from `/workspace/outputs/`
- Artifact renaming and lifecycle management
- Unified storage interface for data and run outputs
#### **Infrastructure & Runtime**
- GPU provisioning via Runpod API
- Support for multiple GPU types (NVIDIA A100, H100, etc.)
- Configurable GPU count per run
- Volume storage configuration
- Framework detection (PyTorch, TensorFlow)
- Python version management
- Pod workspace materialization (automatic code/data reconstruction)
- Runtime logs, metrics, and status ingestion
---
### **Philosophy & Design Principles**
From the **Manifesto** section on the landing page:
**"A gentler control plane."**
> "Not another infrastructure hell. Not a wall of knobs. More like a quiet field where models learn to move with you. You point, it listens. You shift, it follows. Push code, the training follows. The heavy machinery stays out of sight, no headaches, no config spirals. Just progress arriving in small, inevitable waves. Fast starts. Calm loops. A little room for whims."
**The workflow metaphor:** `init > align > converge > emerge`
This reflects a philosophy of:
- **Simplicity** - Avoid complexity and configuration hell
- **Responsiveness** - System adapts to user needs
- **Transparency** - Machinery stays hidden, focus on progress
- **Iteration** - Quick starts, calm development loops
- **Flexibility** - Room for experimentation
---
### **Technical Architecture Overview**
**Three Main Components:**
1. **CLI** (`cli/`) - Go-based command-line interface for login, project init, sync, and run lifecycle
2. **Web** (`web/`) - Next.js frontend + Convex backend providing dashboard UI, auth, and API routes
3. **Runtime** (`runtime/`) - In-pod binary (`warden`) handling workspace setup, execution, logs, metrics, and artifact upload
**Core Operations:**
- Incremental sync using git-style content hashing (code/data → R2)
- Manifest-based reproducibility (pinned code/data versions per run)
- Streaming logs and metrics collection from pods
- Artifact persistence from training outputs
---
### **Getting Started / Onboarding Copy**
The landing page provides clear entry points:
**Installation:**
```bash
# Mac/Linux
curl -fsSL https://Tahuna.dev/install | sh
# Windows
irm https://Tahuna.dev/install | iex
```
**Quick Start Sequence:**
1. `tahuna login` - Browser auth flow
2. `tahuna init .` - Initialize current project
3. `tahuna train` - Launch first training run
---
### **Positioning vs. Competitors**
Tahuna differentiates on:
- **No markup for individuals** - Fair pricing model without artificial markups
- **Frontier-focused** - Designed specifically for cutting-edge agentic AI work, not generic ML
- **Simplicity-first** - Deliberately avoids "infrastructure hell" and configuration complexity
- **Full control** - Wield full power of leading models without restrictions
- **Pay-as-you-go** - Transparent, flexible billing
---
### **Documentation Files Location**
All documentation files are located at:
- **User-facing docs:** `/Users/mounselam/Developer/tahuna/web/content/docs/` (MDX files for on-site docs)
- **Specifications:** `/Users/mounselam/Developer/tahuna/specs/` (detailed technical specs)
- **Landing page copy:** `/Users/mounselam/Developer/tahuna/web/components/` (hero, manifesto, terminal sections)
- **Project context:** `/Users/mounselam/Developer/tahuna/CONTEXT.md`, `/Users/mounselam/Developer/tahuna/prompt.md`
---
### **Key Specification Documents**
- `specs/cli-ux.md` - CLI command tree, flag conventions, output formatting, error messages
- `specs/init.md` - Project initialization workflow, project config schema, detection logic
- `specs/environments.md` - Environment lifecycle, GPU configuration, data bindings
- `specs/run-lifecycle.md` - Run state machine, creation flow, provisioning, monitoring
- `specs/sync.md` - Incremental code/data sync, manifest model, deduplication
- `specs/pod-bootstrap.md` - In-pod runtime setup, workspace materialization, execution
- `specs/dashboard.md` - Web UI views, environment/run/storage management
- `specs/gap-analysis.md` - Comprehensive audit of spec vs. implementation gaps (P0-P3 prioritized)
This is a comprehensive, well-architected product with clear positioning, defined workflows, and methodical technical specifications.
agentId: ad3a4f66b1571bd08 (for resuming to continue this agent's work if needed)
<usage>total_tokens: 95742
tool_uses: 41
duration_ms: 301062</usage>
Agent
Research competitors deeply
Here is a comprehensive research report on each competitor in the post-training / fine-tuning as a service market.
---
Show less
## 1. Prime Intellect
**What they do:** Prime Intellect is a decentralized AI training platform that aggregates GPU resources from 12+ cloud providers into a unified compute exchange, enabling distributed training across fragmented infrastructure.
**Key value proposition:** Democratizing large-scale AI training through decentralization. They enable training across heterogeneous, geographically distributed GPUs -- including permissionless, asynchronous reinforcement learning (demonstrated by INTELLECT-2, a 32B model, and INTELLECT-3, a 106B MoE model trained on 512 H200s across 64 nodes).
**Pricing model:** Not publicly disclosed. They offer on-demand access to 1-256 GPUs and large-scale clusters of 5,000+ GPUs. Users request quotes through their dashboard. H100s offered at competitive rates without long-term contracts.
**Target audience:** AI researchers, teams training custom agentic models, organizations needing large-scale distributed RL training infrastructure.
**Technical approach:** Three-layer stack: (1) Prime Compute (meta-cloud GPU aggregation), (2) Lab (hosted RL training, evaluation, deployment with LoRA support), (3) Protocol (peer-to-peer compute network with tokenized model ownership). Open-source PRIME-RL framework for async RL. DiLoCo-based distributed training.
**Funding:** $20M+ total (seed + extension). Backed by Founders Fund, Menlo Ventures, with angels including Andrej Karpathy, Clem Delangue, and Tri Dao.
Sources:
- [Prime Intellect](https://www.primeintellect.ai/)
- [InfoQ - INTELLECT-2](https://www.infoq.com/news/2025/05/prime-intellect-2/)
- [Fortune - $5.5M raise](https://fortune.com/2024/04/23/coinfund-distributed-global-prime-intellect-artificial-intelligence-ai-development/)
- [Sacra - Prime Intellect](https://sacra.com/c/prime-intellect/)
---
## 2. Amazon SageMaker (Fine-Tuning Capabilities)
**What they do:** AWS's fully managed ML platform with comprehensive fine-tuning capabilities for LLMs, including a new serverless model customization feature announced at re:Invent 2025.
**Key value proposition:** Enterprise-grade, fully managed fine-tuning integrated into the AWS ecosystem, with support for distributed training, Hugging Face integration, and automatic infrastructure scaling. Serverless customization means developers don't need to think about compute resources.
**Pricing model:** Pay-as-you-go based on instance type and duration. No minimum fees. AWS Savings Plans available for committed usage. ~20-30% premium over raw EC2 costs for the managed service. Free tier available.
**Target audience:** Enterprises already in the AWS ecosystem. Data science teams needing managed infrastructure for training pipelines.
**Technical approach:** Supports SFT, LoRA, QLoRA, RLHF, DPO. Deep Hugging Face Transformers integration (as of Feb 2026). FSDP for distributed training. Continuous self-instruct fine-tuning framework with synthetic data generation. Supports Nova models, DeepSeek, Llama, and other open-source models.
Sources:
- [AWS - Scale LLM fine-tuning with HF and SageMaker](https://aws.amazon.com/blogs/machine-learning/scale-llm-fine-tuning-with-hugging-face-and-amazon-sagemaker-ai/)
- [SageMaker Pricing](https://aws.amazon.com/sagemaker/pricing/)
- [TechCrunch - AWS re:Invent 2025](https://techcrunch.com/2025/12/03/aws-doubles-down-on-custom-llms-with-features-meant-to-simplify-model-creation/)
- [TrueFoundry - SageMaker Review 2026](https://www.truefoundry.com/blog/amazon-sagemaker-review-features-pricing-pros-and-cons-better-alternative)
---
## 3. Tinker by Thinking Machines
**What they do:** A low-level training API for post-training (fine-tuning and RL) of open-source LLMs. First product from Thinking Machines, the AI lab founded by former OpenAI executive Mira Murati.
**Key value proposition:** Full algorithmic control without infrastructure management. Unlike "black box" fine-tuning APIs, Tinker exposes low-level primitives (`forward_backward`, `optim_step`, `sample`) so researchers can implement custom training loops -- including custom async off-policy RL -- while Tinker handles distributed GPU scheduling, resource allocation, and failure recovery.
**Pricing model:** Free to start; usage-based pricing in USD per million tokens. LoRA-based approach allows sharing compute across multiple training runs, lowering costs. Specific per-token rates not yet publicly detailed.
**Target audience:** ML researchers and developers who want programmatic control over training algorithms. Early adopters include groups at Princeton, Stanford, Berkeley, and Redwood Research.
**Technical approach:** LoRA-only fine-tuning (their research shows LoRA matches full fine-tuning for most post-training use cases, especially RL). Runs on Thinking Machines' internal GPU clusters. Supports models from Llama-3.2-1B to Qwen3.5-397B-A17B MoE, plus VLMs like Qwen3-VL. Open-source "Tinker Cookbook" with implementations of common post-training methods. Portable adapter weights.
**Funding context:** Thinking Machines raised $2 billion from a16z, NVIDIA, Accel, and others.
Sources:
- [Thinking Machines - Announcing Tinker](https://thinkingmachines.ai/blog/announcing-tinker/)
- [VentureBeat - Tinker launch](https://venturebeat.com/ai/thinking-machines-first-official-product-is-here-meet-tinker-an-api-for)
- [MarkTechPost - Tinker](https://www.marktechpost.com/2025/10/02/thinking-machines-launches-tinker-a-low-level-training-api-that-abstracts-distributed-llm-fine-tuning-without-hiding-the-knobs/)
- [Tinker Docs](https://tinker-docs.thinkingmachines.ai/)
---
## 4. Together AI
**What they do:** An AI-native cloud platform providing inference, fine-tuning, and model serving for open-source LLMs through a unified API.
**Key value proposition:** Simple, affordable fine-tuning of large open-source models (including 100B+ parameter models like DeepSeek-R1, Qwen3-235B, Llama 4 Maverick) without managing infrastructure. Recently expanded context lengths 2-4x at no additional cost.
**Pricing model:** Token-based pricing. Cost = (epochs x training tokens) + (evals x validation tokens). Rates vary by model size, fine-tuning type (SFT vs DPO), and method (LoRA vs full). No minimum price. Cost estimator available in UI/CLI. Ranked among top 5 cheapest fine-tuning providers of 2026.
**Target audience:** Developers and startups building AI applications who want API-level simplicity for fine-tuning. Teams that want to fine-tune and serve models from the same platform.
**Technical approach:** Supports SFT and DPO. Both LoRA and full fine-tuning. Extended context lengths (up to 131k tokens for some models). GPU instances include H100 SXM (~$1.75/hr) and A100 PCIe (~$1.30/hr).
Sources:
- [Together AI Pricing](https://www.together.ai/pricing)
- [Together AI Fine-Tuning](https://www.together.ai/fine-tuning)
- [Together AI Fine-Tuning Pricing Docs](https://docs.together.ai/docs/fine-tuning-pricing)
- [Together AI Platform Updates Sept 2025](https://www.together.ai/blog/fine-tuning-updates-sept-2025)
---
## 5. Anyscale / Ray
**What they do:** Anyscale is the managed platform for Ray, an open-source distributed computing framework. Provides infrastructure for distributed training, fine-tuning, inference, and data processing at scale.
**Key value proposition:** A general-purpose distributed computing platform, not just a fine-tuning API. Gives maximum control over distributed training orchestration. LLMForge (part of RayTurbo) is described as one of the most comprehensive LLM refinement libraries. Can be self-hosted (open-source Ray) or managed (Anyscale).
**Pricing model:** Usage-based, per-hour compute charges based on GPU type. No monthly fixed fees. Volume discounts available. Deployment options: Hosted (Anyscale manages infra) or BYOC (deploy in your own cloud). Example: end-to-end LLM fine-tuning workflow starting at ~$5. RayTurbo claims up to 90% lower costs via elastic training and spot instances.
**Target audience:** Platform/ML engineering teams at enterprises who need full control over distributed training infrastructure. Organizations with existing cloud GPU reservations. Teams running Ray already.
**Technical approach:** Ray Train V2 (Nov 2025) for unified distributed training. KubeRay for Kubernetes orchestration. Supports LoRA fine-tuning, hyperparameter search (Ray Tune), multi-node training. CoreWeave partnership for BYOC. RayTurbo optimized runtime with 4.5x faster data workloads.
Sources:
- [Anyscale Pricing](https://www.anyscale.com/pricing)
- [Ray Train V2](https://www.anyscale.com/blog/ray-train-v2-unified-distributed-training-on-ray)
- [CoreWeave + Anyscale](https://www.coreweave.com/blog/distributed-ai-on-coreweave-with-ray-anyscale)
- [Anyscale RayTurbo](https://www.anyscale.com/blog/announcing-anyscale-rayturbo)
---
## 6. Modal
**What they do:** Serverless cloud compute platform for AI/ML workloads. Provides on-demand GPU access with per-second billing and Python-native developer experience.
**Key value proposition:** Zero infrastructure management with instant GPU provisioning (~1 second container spin-up). Python decorators transform local scripts into cloud functions. Pay only for actual compute seconds used -- no idle time charges. Ideal for bursty, intermittent workloads.
**Pricing model:** Per-second billing. H100: ~$3.95/hr, A100 80GB: ~$2.50/hr, A100 40GB: ~$2.10/hr, A10: ~$1.10/hr. Free tier: $30/month in credits. Team plan: $250/month + compute. Higher per-hour rates than bare-metal providers, but serverless model eliminates idle costs.
**Target audience:** ML engineers and data scientists who want to run fine-tuning experiments without DevOps overhead. Teams with sporadic rather than continuous fine-tuning needs.
**Technical approach:** Serverless containers with GPU attachment. Supports multi-GPU and multi-node distributed training. Python-native workflow (decorators, not YAML). Auto-scaling. Spot GPU instances with automatic failover (50-80% cost savings). Not a fine-tuning-specific platform -- it's general-purpose GPU compute.
Sources:
- [Modal](https://modal.com/)
- [Modal Pricing](https://modal.com/pricing)
- [RunPod - Top Serverless GPU Clouds 2026](https://www.runpod.io/articles/guides/top-serverless-gpu-clouds)
- [DigitalOcean - Modal Alternatives](https://www.digitalocean.com/resources/articles/serverless-modal-alt)
---
## 7. Replicate (now Cloudflare)
**What they do:** A platform to run and fine-tune open-source ML models via API. Acquired by Cloudflare in November 2025 for undisclosed terms.
**Key value proposition:** Simplest possible API for running and fine-tuning models. Upload data (e.g., zip of images), run training, get a personalized model. 50,000+ model catalog. Post-acquisition, fine-tuning will be available directly on Cloudflare Workers AI with global edge distribution.
**Pricing model:** Metered, per-second billing based on hardware selected. "Fast booting fine-tunes" only bill for active processing time (no idle charges). Private/dedicated models bill for all uptime (setup, idle, active). No charge for failed runs. Multi-GPU A100 capacity available with committed spend.
**Target audience:** Developers who want the simplest possible path to fine-tuning (especially image models like Stable Diffusion). Hobbyists and small teams. Post-acquisition, also targets Cloudflare's developer base.
**Technical approach:** Containerized model library. API-driven fine-tuning. Supports LoRA for image models (SDXL, Flux). Auto-scaling. Post-acquisition integration with Cloudflare Workers for serverless, globally-distributed model serving.
**Funding:** Raised $23M+ from Y Combinator, Sequoia Capital before Cloudflare acquisition.
Sources:
- [Replicate Pricing](https://replicate.com/pricing)
- [Cloudflare - Replicate Acquisition](https://www.cloudflare.com/press/press-releases/2025/cloudflare-to-acquire-replicate-to-build-the-most-seamless-ai-cloud-for-developers/)
- [Replicate Blog - Joining Cloudflare](https://replicate.com/blog/replicate-cloudflare)
---
## 8. OpenPipe
**What they do:** Originally a supervised fine-tuning platform for distilling expensive LLM calls into cheaper, smaller models. Now pivoted heavily to reinforcement learning for multi-turn AI agents. Acquired by CoreWeave in 2025.
**Key value proposition:** Train AI agents using RL (not just SFT) to dramatically improve reliability on real-world tasks. Their open-source ART (Agent Reinforcement Trainer) framework uses GRPO to train multi-step agents. Demonstrated a 14B model outperforming o3 on email tasks with 96% accuracy, 1s latency (vs 5.5s), at lower cost.
**Pricing model:** Token-based pricing for fine-tuning. Training costs: ~$0.48/M tokens (8B and smaller), ~$1.90/M tokens (32B), ~$2.90/M tokens (70B+). Inference: $0.40-$0.45/M tokens. Most training runs under $100. 30-day free trial. Enterprise plans with volume discounts available.
**Target audience:** Developers building LLM-powered agents who need reliability beyond prompt engineering. Teams wanting to distill expensive model calls into cheaper, fine-tuned alternatives.
**Technical approach:** ART framework (open-source) uses GRPO for multi-turn RL training. Client-server architecture: agent code runs on your machine, RL training loop runs on GPU backend. Supports Qwen3.5, GPT-OSS, Llama, and more. Also supports SFT with LLM-as-judge evaluation. Portable weights (download or host on-platform).
**Funding:** $6.7M seed from Costanoa Ventures and Y Combinator. Subsequently acquired by CoreWeave.
Sources:
- [OpenPipe - RL For Agents](https://openpipe.ai/)
- [OpenPipe ART on GitHub](https://github.com/OpenPipe/ART)
- [OpenPipe Fine-Tuning Platform](https://openpipe.ai/fine-tuning)
- [MarkTechPost - ART-E](https://www.marktechpost.com/2025/04/29/reinforcement-learning-for-email-agents-openpipes-art%C2%B7e-outperforms-o3-in-accuracy-latency-and-cost/)
- [OpenPipe Pricing](https://docs.openpipe.ai/pricing/pricing)
---
## 9. Fireworks AI
**What they do:** A generative AI platform-as-a-service for building, fine-tuning, and deploying AI applications. Founded by the team behind PyTorch.
**Key value proposition:** Fastest inference combined with flexible fine-tuning. Process 10T+ tokens/day for 10,000+ customers. Serve fine-tuned models at base model prices. Multi-LoRA deployment (up to 100 LoRA models on a single base model). Recently expanded into voice agent infrastructure.
**Pricing model:** Usage-based across three tiers: (1) Serverless inference (per-token), (2) Fine-tuning (per-training-token, starting at $0.50/M tokens for models up to 16B; DPO at 2x SFT price), (3) On-demand dedicated GPU (per-second). RL fine-tuning billed per GPU hour. Fine-tuned LoRA models require dedicated deployment (per-GPU-second + per-token).
**Target audience:** Developers and enterprises building production AI applications. Notable customers include Cursor, Uber, DoorDash, and Shopify.
**Technical approach:** Supports SFT, DPO, and reinforcement fine-tuning. LoRA-based with live-merge deployment or multi-LoRA serving. VLM fine-tuning supported. Reasoning trace fine-tuning supported. Hundreds of open-source models available.
**Funding:** $327M total. Series C: $250M at $4B valuation (Oct 2025, led by Lightspeed, Index, Evantic). ~$280M ARR. 148 employees.
Sources:
- [Fireworks AI Pricing](https://fireworks.ai/pricing)
- [Fireworks AI - Series C](https://fireworks.ai/blog/series-c)
- [Fireworks AI Fine-Tune Launch](https://fireworks.ai/blog/fine-tune-launch)
- [Sacra - Fireworks AI](https://sacra.com/c/fireworks-ai/)
---
## 10. Hugging Face AutoTrain
**What they do:** An open-source, no-code/low-code platform for automated model fine-tuning across NLP, computer vision, and tabular data tasks.
**Key value proposition:** Lowest barrier to entry. No-code UI or Python API for fine-tuning. Completely open-source. Backed by the largest model/dataset ecosystem (2M+ models, 500K+ datasets). Can run locally (free) or on Hugging Face Spaces (pay for GPU only).
**Pricing model:** AutoTrain itself is free. You pay only for GPU compute when running on HF Spaces. When running locally, zero cost. No managed service premium.
**Target audience:** Beginners and practitioners who want AutoML-like fine-tuning without writing training loops. Enterprises already in the HF ecosystem. Teams wanting maximum flexibility between cloud and on-prem.
**Technical approach:** Supports LLM fine-tuning (SFT), sentence transformers, VLM fine-tuning, text/image classification, token classification, seq2seq. Builds on Hugging Face Transformers, TRL, PEFT libraries. Automatic hyperparameter tuning. Docker-based deployment on Spaces. Requires Python >= 3.10.
Sources:
- [Hugging Face AutoTrain Docs](https://huggingface.co/docs/autotrain/en/index)
- [AutoTrain GitHub](https://github.com/huggingface/autotrain-advanced)
- [Hugging Face Review 2026](https://hackceleration.com/hugging-face-review/)
---
## Market Landscape Summary
**Market size:** The broader AI-as-a-Service market is projected to grow from $20.26B (2025) to $91.20B (2030) at 35% CAGR. Enterprise LLM spending averaged $18M in 2024 (2.5x from 2023). 60% of enterprise leaders are interested in open-source fine-tuning.
**Key trends:**
- **Post-training is the new scaling law.** 2025 revealed three multiplicative scaling laws: base model scale, post-training quality, and inference-time compute. This makes post-training services increasingly strategic.
- **RL is overtaking SFT.** Companies like OpenPipe, Tinker, and Prime Intellect are investing heavily in RL-based post-training, not just supervised fine-tuning.
- **Consolidation is happening.** Replicate was acquired by Cloudflare, OpenPipe by CoreWeave. Expect more acquisitions as cloud/infra companies seek fine-tuning capabilities.
- **LoRA dominance.** Nearly all platforms default to LoRA/QLoRA for efficiency. Tinker's research explicitly argues LoRA matches full fine-tuning for post-training.
- **Budget GPU competition.** H100 prices are converging toward $2-3/hr across providers, with A100s under $1.50/hr. The cheapest providers in 2026: SiliconFlow, Vast.ai, Together AI, Hyperstack.
Sources:
- [Foundation Capital - Where AI is headed in 2026](https://foundationcapital.com/ideas/where-ai-is-headed-in-2026)
- [Fine-Tuning Landscape 2025 (Medium)](https://medium.com/@pradeepdas/the-fine-tuning-landscape-in-2025-a-comprehensive-analysis-d650d24bed97)
- [SiliconFlow - Best Fine-Tuning Platforms 2026](https://www.siliconflow.com/articles/en/the-best-fine-tuning-platforms-of-open-source-llm)
- [SiliconFlow - Cheapest Fine-Tuning Providers 2026](https://www.siliconflow.com/articles/en/the-cheapest-model-fine-tuning-provider)
- [NStarX - Fine-Tuning as a Service](https://nstarxinc.com/blog/fine-tuning-as-a-service-the-essential-ai-strategy-for-enterprise-success/)
agentId: ad5143ea88729adf0 (for resuming to continue this agent's work if needed)
<usage>total_tokens: 45319