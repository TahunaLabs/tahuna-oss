# Spec: Project Initialization (`tahuna init`)

## Scope

Guided project setup that detects/scaffolds local project files, selects runtime configuration, and creates a remote environment linked to the local directory. One project directory = one environment.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| `.tahuna/` | Local directory | Project-local Tahuna state |
| `.tahuna/environment_id` | Local file | Links this project to a remote environment |
| `tahuna.toml` | Local file | Canonical local project config and synced runtime intent |
| `train.py` | Project file | Entrypoint script (default name, user can override) |
| `inference.py` | Project file | Optional serving entrypoint, scaffolded only when serving is enabled |
| `data/` | Project directory | Training data directory (default name, user can override) |
| `outputs/` | Project directory | Training output directory (default name, user can override) |
| `pyproject.toml` | Project file | Python project metadata + dependencies (uv source of truth) |
| `uv.lock` | Project file | Locked dependency + Python resolution for reproducible runtime |
| Remote environment | Backend record | Created in Convex `environments` table |

## Lifecycle

### Command Variants

| Command | Behavior |
|---------|----------|
| `tahuna init` | Defaults to current directory (`.`), same as `tahuna init .` |
| `tahuna init .` | Initialize current directory |
| `tahuna init <name>` | Create directory `<name>`, then initialize it |
| `tahuna up` | Alias for `tahuna init .` |

### Init Flow

```
1. AUTHENTICATION + CATALOG FETCH
   - Fetch GPU catalog and managed runtime image catalog up front
   - This doubles as the auth check before interactive prompts

2. DIRECTORY RESOLUTION
   - If arg is ".": use current directory
   - If arg is a name: create directory, cd into it
   - If no arg: default to "."

3. RE-INIT CHECK
   - If .tahuna/environment_id already exists:
     - interactive terminals: warn and offer overwrite
     - non-interactive terminals: fail and instruct the user to remove the link before re-running init

4. PROJECT FILE DETECTION
   For each canonical project item:

   a. Entrypoint (default: train.py)
      - Detect: look for train.py in project root
      - If found: keep it
      - If not found: scaffold train.py later

   b. Serving entrypoint (default: inference.py)
      - Detect: look for inference.py in project root
      - If found: serving is enabled
      - If not found: ask "Do you want to serve this project?"
      - If user answers yes: scaffold inference.py later
      - If user answers no: serving stays disabled and init must not scaffold inference.py or a `[serve]` config block

   c. Data directory (default: data/)
      - Detect: look for data/ directory
      - If found: offer keep / custom path / create new
      - If not found: offer create / custom path

   d. Output directory (default: outputs/)
      - Detect: look for outputs/ directory
      - If found: offer keep / custom path / create new
      - If not found: offer create / custom path

   e. UV project files (`pyproject.toml` + `uv.lock`)
      - Detect: look for pyproject.toml (required) and uv.lock (preferred)
      - If pyproject.toml missing: "Creating pyproject.toml."
      - If uv.lock missing: run `uv lock` and print "Creating uv.lock."
      - The default scaffolded `pyproject.toml` seeds `[dependency-groups].train` with `torch` or `tensorflow` and an empty `serve` group

5. FRAMEWORK + PYTHON DETECTION (single source of truth: uv files)
   - Parse pyproject.toml dependency groups for framework packages
   - Parse uv.lock (or pyproject `requires-python`) for Python version
   - Map "torch"/"pytorch" -> `pt`, "tensorflow"/"keras" -> `tf`
   - If ambiguous or not found: prompt user to select
   - Framework + version + Python version determine catalog filtering AND pod image

6. DEPENDENCY SELECTION
   - Parse `[dependency-groups]` from pyproject.toml
   - Resolve a training dependency selection and persist it into `tahuna.toml`
   - If a `train` group exists, preselect it
   - If no `train` group exists, prompt for:
     - one of the discovered dependency groups, or
     - base `[project.dependencies]`
   - If serving is enabled:
     - if dependency groups exist, resolve a serving dependency selection the same way, preselecting `serve` when present
     - if no dependency groups exist, serving silently defaults to base `[project.dependencies]`
   - `dependency_group = ""` in `tahuna.toml` means "use base `[project.dependencies]` only"

7. RUNTIME CONFIGURATION
   - Fetch GPU catalog from backend (GET /api/catalog)
   - Prompt: GPU type (from available list, filtered by framework)
   - Prompt: GPU count (default from shared config, max from catalog per GPU type)
   - Prompt: Volume size GB (default from shared config)

8. LOCAL FILE SCAFFOLDING
   - Create train.py if missing
   - Create inference.py only if serving is enabled and the file is missing
   - Create data/ and outputs/ if missing
   - Write root `tahuna.toml`

9. ENVIRONMENT CREATION
   - POST /api/environments with: name, framework, version,
     gpu_type, gpu_count, volume_gb
   - Save environment ID to .tahuna/environment_id
   - `command` and `output_dir` are created from resolved local config

10. INITIAL CONFIG SYNC
   - Run a config-only sync commit
   - Push resolved environment config, train command, train dependency selection, output dir, and optional serve snapshot
   - Do not upload code or data during init

11. SUCCESS OUTPUT
   - Print summary: project path, environment ID, GPU config
   - Print next steps: "Run `tahuna train` to start training."
```

### `tahuna.toml` Schema

```toml
[project]
data_dir = "data"
output_dir = "outputs"

[environment]
framework = "pt"
version = "2.8.0-cu128"
python_version = "3.11"
gpu_type = "NVIDIA A100 80GB"
gpu_count = 1
volume_gb = 80

[train]
command = ["uv", "run", "--active", "--no-sync", "python", "-u", "train.py"]
dependency_group = ""
output_model_path = "outputs/model"

[serve]
command = ["uv", "run", "--active", "--no-sync", "python", "-u", "inference.py"]
dependency_group = "serve"
python_version = "3.11"
gpu_type = "NVIDIA A100 80GB"
gpu_count = 1
volume_gb = 80
port = 8000
health_path = "/health"
default_model_path = "outputs/model"
startup_timeout_seconds = 900
health_interval_seconds = 5
health_timeout_seconds = 2
health_failure_threshold = 3
graceful_shutdown_seconds = 30
```

Notes:

- `[serve]` is optional and is omitted when serving is disabled during init.
- `dependency_group = ""` means "install only base `[project.dependencies]`".
- If a dependency group key is absent entirely, the selection has not been configured yet.

## Invariants

- `tahuna.toml` at the project root is the canonical local config file.
- `.tahuna/` stores local link/cache state only; it is not the source of runtime intent.
- `train.py`, `data/`, `outputs/`, `pyproject.toml`, and `uv.lock` are always created if missing.
- `inference.py` is created only when serving is enabled.
- One project directory maps to exactly one remote environment.
- Framework/Python detection reads from uv files only (`pyproject.toml`, `uv.lock`) unless detection fails.
- The environment ID file (`.tahuna/environment_id`) is the single link between local project and remote state.
- `tahuna init` always resolves a train dependency selection before finishing.

## Error States

| Condition | Behavior |
|-----------|----------|
| Existing linked environment in non-interactive init | Error: project already initialized; remove `.tahuna/environment_id` or rerun interactively |
| Not authenticated | Error: "Not authenticated. Run `tahuna login` first." |
| Backend unreachable | Error: "Cannot reach Tahuna backend. Check your connection." |
| GPU catalog empty | Error: "No GPUs available. Try again later." |
| `pyproject.toml` invalid | Error: "Cannot parse pyproject.toml." |
| Invalid configured dependency group | Error: dependency group not found in `pyproject.toml`; rerun `tahuna init .` or update `tahuna.toml` |
| uv resolution fails | Error: "`uv lock` failed. Fix dependency metadata and retry." |
| Directory creation fails | Error: "Cannot create directory: <reason>" |

## Dependencies

- Auth (valid API key required)
- Backend `/api/catalog` endpoint
- Backend `POST /api/environments` endpoint
- Backend `/api/sync/commit` endpoint for the init-time config sync
