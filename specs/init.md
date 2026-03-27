# Spec: Project Initialization (`tahuna init`)

## Scope

Guided project setup that detects/scaffolds local project files, selects runtime configuration, and creates a remote environment linked to the local directory. One project directory = one environment.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| `.tahuna/` | Local directory | Project-local Tahuna state |
| `.tahuna/environment_id` | Local file | Links this project to a remote environment |
| `.tahuna/tahuna.toml` | Local file | Local project config and linked environment defaults |
| `train.py` | Project file | Entrypoint script (default name, user can override) |
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
1. DIRECTORY RESOLUTION
   - If arg is ".": use current directory
   - If arg is a name: create directory, cd into it
   - If no arg: default to "."

2. GUARD: RE-INIT CHECK
   - If .tahuna/ already exists: ERROR "Project already initialized.
     To reconfigure, delete .tahuna/ and run init again."

3. PROJECT FILE DETECTION & SCAFFOLDING
   For each mandatory project item:

   a. Entrypoint (default: train.py)
      - Detect: look for train.py in project root
      - If found: "Detected train.py. Use this? [Y/n/custom path]"
      - If not found: "Creating train.py."
      - Template: minimal Python script with argparse + config loading

   b. Data directory (default: data/)
      - Detect: look for data/ directory
      - If found: "Detected data/. Use this? [Y/n/custom path]"
      - If not found: "Creating data/."
      - Also offer: "Bind existing Storage data now? [y/N]"

   c. Output directory (default: outputs/)
      - Detect: look for outputs/ directory
      - If found: "Detected outputs/. Use this? [Y/n/custom path]"
      - If not found: "Creating outputs/."

   d. UV project files (`pyproject.toml` + `uv.lock`)
      - Detect: look for pyproject.toml (required) and uv.lock (preferred)
      - If found: "Detected pyproject.toml/uv.lock. Use these? [Y/n/custom path]"
      - If pyproject.toml missing: "Creating pyproject.toml."
      - If uv.lock missing: run `uv lock` and print "Creating uv.lock."
      - Template/default deps: torch or tensorflow (based on framework detection)

4. FRAMEWORK + PYTHON DETECTION (single source of truth: uv files)
   - Parse pyproject.toml dependency groups for framework packages
   - Parse uv.lock (or pyproject `requires-python`) for Python version
   - Map "torch"/"pytorch" -> PyTorch, "tensorflow"/"keras" -> TensorFlow
   - If ambiguous or not found: prompt user to select
   - Framework + version + Python version determine catalog filtering AND pod image

5. RUNTIME CONFIGURATION
   - Fetch GPU catalog from backend (GET /api/catalog)
   - Prompt: GPU type (from available list, filtered by framework)
   - Prompt: GPU count (default from shared config, max from catalog per GPU type)
   - Prompt: Volume size GB (default from shared config)

6. ENVIRONMENT CREATION
   - POST /api/environments with: name, framework, version,
     gpu_type, gpu_count, volume_gb
   - Save environment ID to .tahuna/environment_id
   - Save project config to .tahuna/tahuna.toml

7. SUCCESS OUTPUT
   - Print summary: project path, environment ID, GPU config
   - Print next steps: "Run `tahuna train` to start training."
```

### `.tahuna/tahuna.toml` Schema

```toml
[project]
entrypoint = "train.py"
data_dir = "data"
output_dir = "outputs"
python_project_file = "pyproject.toml"
uv_lock_file = "uv.lock"

[environment]
name = "my-project"
framework = "pt"
version = "2.8.0-cu128"
python_version = "3.11"
gpu_type = "NVIDIA A100 80GB"
gpu_count = 1
volume_gb = 80
```

## Invariants

- `.tahuna/` must not exist before init. Re-init is an error.
- All mandatory project items (entrypoint, data dir, output dir, uv project files) are created if missing.
- One project directory maps to exactly one remote environment.
- Framework/Python detection reads from uv files only (`pyproject.toml`, `uv.lock`) unless detection fails.
- The environment ID file (`.tahuna/environment_id`) is the single link between local project and remote state.

## Error States

| Condition | Behavior |
|-----------|----------|
| `.tahuna/` already exists | Error: "Project already initialized." |
| Not authenticated | Error: "Not authenticated. Run `tahuna login` first." |
| Backend unreachable | Error: "Cannot reach Tahuna backend. Check your connection." |
| GPU catalog empty | Error: "No GPUs available. Try again later." |
| `pyproject.toml` invalid | Error: "Cannot parse pyproject.toml." |
| uv resolution fails | Error: "`uv lock` failed. Fix dependency metadata and retry." |
| Directory creation fails | Error: "Cannot create directory: <reason>" |

## Dependencies

- Auth (valid API key required)
- Backend `/api/catalog` endpoint
- Backend `POST /api/environments` endpoint
