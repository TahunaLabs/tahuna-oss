# Spec: Project Initialization (`tahuna init`)

## Scope

Guided project setup that detects/scaffolds local project files, selects runtime configuration, and creates a remote environment linked to the local directory. One project directory = one environment.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| `.tahuna/` | Local directory | Project-local Tahuna state |
| `.tahuna/environment_id` | Local file | Links this project to a remote environment |
| `.tahuna/project.yaml` | Local file | Local project config (entrypoint, data dir, config path, requirements, output dir) |
| `train.py` | Project file | Entrypoint script (default name, user can override) |
| `data/` | Project directory | Training data directory (default name, user can override) |
| `outputs/` | Project directory | Training output directory (default name, user can override) |
| `config.yaml` | Project file | Hyperparameter configuration |
| `requirements.txt` | Project file | Python dependencies (future: `pyproject.toml` with uv) |
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
   For each of the 5 mandatory files:

   a. Entrypoint (default: train.py)
      - Detect: look for train.py in project root
      - If found: "Detected train.py. Use this? [Y/n/custom path]"
      - If not found: "No entrypoint found. Creating train.py with template."
      - Template: minimal Python script with argparse + config loading

   b. Data directory (default: data/)
      - Detect: look for data/ directory
      - If found: "Detected data/. Use this? [Y/n/custom path]"
      - If not found: "Creating data/ directory."

   c. Output directory (default: outputs/)
      - Detect: look for outputs/ directory
      - If found: "Detected outputs/. Use this? [Y/n/custom path]"
      - If not found: "Creating outputs/ directory."

   d. Config file (default: config.yaml)
      - Detect: look for config.yaml or config.yml
      - If found: "Detected config.yaml. Use this? [Y/n/custom path]"
      - If not found: "Creating config.yaml with defaults."
      - Template: minimal YAML with learning_rate, epochs, batch_size

   e. Requirements file (default: requirements.txt)
      - Detect: look for requirements.txt
      - If found: "Detected requirements.txt. Use this? [Y/n/custom path]"
      - If not found: "Creating requirements.txt."
      - Template: torch or tensorflow (based on framework detection)

4. FRAMEWORK DETECTION (single source of truth: requirements file)
   - Parse requirements.txt for "torch"/"pytorch" -> PyTorch
   - Parse requirements.txt for "tensorflow"/"keras" -> TensorFlow
   - If ambiguous or not found: prompt user to select
   - Framework + version determines catalog filtering AND pod image

5. RUNTIME CONFIGURATION
   - Fetch GPU catalog from backend (GET /api/catalog)
   - Prompt: GPU type (from available list, filtered by framework)
   - Prompt: GPU count (default: 1, max from catalog per GPU type)
   - Prompt: Volume size GB (default: 80)

6. ENVIRONMENT CREATION
   - POST /api/environments with: name, framework, version,
     gpu_type, gpu_count, volume_gb
   - Save environment ID to .tahuna/environment_id
   - Save project config to .tahuna/project.yaml

7. SUCCESS OUTPUT
   - Print summary: project path, environment ID, GPU config
   - Print next steps: "Run `tahuna train` to start training."
```

### `.tahuna/project.yaml` Schema

```yaml
entrypoint: train.py
data_dir: data
output_dir: outputs
config_file: config.yaml
requirements: requirements.txt
framework: pytorch       # detected from requirements
```

## Invariants

- `.tahuna/` must not exist before init. Re-init is an error.
- All 5 project files (entrypoint, data dir, output dir, config, requirements) are mandatory. If not present, they are created from templates.
- One project directory maps to exactly one remote environment.
- Framework detection reads from `requirements.txt` only. No separate framework prompt unless detection fails.
- The environment ID file (`.tahuna/environment_id`) is the single link between local project and remote state.

## Error States

| Condition | Behavior |
|-----------|----------|
| `.tahuna/` already exists | Error: "Project already initialized." |
| Not authenticated | Error: "Not authenticated. Run `tahuna login` first." |
| Backend unreachable | Error: "Cannot reach Tahuna backend. Check your connection." |
| GPU catalog empty | Error: "No GPUs available. Try again later." |
| Directory creation fails | Error: "Cannot create directory: <reason>" |

## Dependencies

- Auth (valid API key required)
- Backend `/api/catalog` endpoint
- Backend `POST /api/environments` endpoint
