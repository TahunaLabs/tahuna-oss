# Spec: CLI UX & Interactive Shell

## Scope

Command-line interface for all Tahuna operations. Provides human-readable output by default, standardized flag conventions, an interactive REPL shell, and clear error messages.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| `tahuna` binary | Go executable | Single binary, all commands built in |
| Interactive shell | REPL mode | `tahuna shell` — command loop without `tahuna` prefix |
| Config file | Local file | `~/.config/tahuna/config.env` |
| Project state | Local directory | `.tahuna/` in project root |

## Command Tree

```
tahuna
  login                          # Browser-based authentication
  init [. | <project-name>]      # Project setup + environment creation
  up                             # Alias: tahuna init .
  shell                          # Interactive REPL

  env
    list      [-v]               # List environments
    show      <id> [-v]          # Show environment details
    update    [<id>] [--gpu-type TYPE] [--gpu-count N] [--volume-gb N]
    specs                        # Alias: env update
    delete    <id>               # Delete environment (cascade)

  sync      [code | data]        # Manual sync

  train     [-d] [--gpu-type TYPE] [--gpu-count N] [--volume-gb N]
  run
    create   [-d] [--gpu-type TYPE] [--gpu-count N] [--volume-gb N]
    list     [-n N] [-a] [-v]
    show     <id> [-v]
    watch    <id> [--interval N]
    logs     <id> [-n N] [-f] [-v]
    cancel   <id> [-f]
    delete   <id>

  version                        # Print CLI version
```

## Standardized Flag Conventions

All commands follow these consistent flag rules:

| Flag | Long form | Meaning | Applies to |
|------|-----------|---------|------------|
| `-v` | `--verbose` | Show HTTP details + timing | All commands |
| `-n` | `--lines` | Number of items/lines to show (newest first) | `run list`, `run logs` |
| `-f` | `--follow` | Follow/stream output (like `docker logs -f`) | `run logs` |
| `-d` | `--detached` | Create and exit without monitoring | `train`, `run create` |
| `-a` | `--all` | Show all items (no limit) | `run list` |
| | `--gpu-type` | GPU type override | `train`, `run create`, `env update` |
| | `--gpu-count` | GPU count override | `train`, `run create`, `env update` |
| | `--volume-gb` | Volume size override | `train`, `run create`, `env update` |
| | `--interval` | Poll interval in seconds | `run watch` |
| | `--id` | Resource identifier | `env show`, `env delete` |

### Flag Rules

- Short flags use single dash + single letter: `-v`, `-n`, `-f`, `-d`, `-a`.
- Long flags use double dash + full word: `--verbose`, `--lines`, `--follow`.
- Flags that take values: `-n 10`, `--gpu-type "NVIDIA A100"`.
- Boolean flags: `-v`, `-f`, `-d`, `-a` (presence = true).
- Positional args: resource IDs come after the subcommand (`run show <id>`, not `run show --id <id>`). Exception: `env show --id <id>` for backward compatibility.

## Output Format

### Default: Human-Readable Tables

```
$ tahuna run list
 ID          STATUS      GPU TYPE         CREATED
 run_abc123  completed   NVIDIA A100 80GB 2 hours ago
 run_def456  running     NVIDIA H100 80GB 10 minutes ago
 run_ghi789  failed      NVIDIA A100 80GB 1 day ago
```

### Verbose: Adds HTTP details + extended fields

```
$ tahuna run list -v
 GET /api/runs (200, 142ms)
 ID          STATUS      GPU TYPE         GPU#  VOL    CODE HASH    CREATED
 run_abc123  completed   NVIDIA A100 80GB 1     80GB   a1b2c3d4     2h ago
 run_def456  running     NVIDIA H100 80GB 2     120GB  e5f6g7h8     10m ago
```

- Verbose shows: request URL, response code, duration, and extended columns.
- No raw JSON dump in verbose mode. Verbose is for debugging, not data export.

## Interactive Shell (`tahuna shell`)

### Purpose

Command REPL — type commands without the `tahuna` prefix.

### Behavior

```
$ tahuna shell
tahuna> run list
 ID          STATUS      GPU TYPE         CREATED
 run_abc123  completed   NVIDIA A100 80GB 2 hours ago

tahuna> train -d
Syncing code... done.
Syncing data... done.
Run created: run_xyz789 (detached)

tahuna> exit
$
```

- Prompt: `tahuna> `
- All commands available except `login`, `init`, `shell` (no nesting).
- `exit` or `quit` or Ctrl+D to leave.
- Command history (arrow keys) and basic line editing.
- No tab completion in v1.

## Error UX

### Default: User-Friendly Messages

```
$ tahuna train
Error: Not authenticated. Run `tahuna login` first.

$ tahuna train --gpu-type "INVALID"
Error: GPU type "INVALID" is not available. Run `tahuna env list -v` to see options.

$ tahuna run show nonexistent
Error: Run not found.
```

### Verbose: Adds Raw Details

```
$ tahuna train -v
 POST /api/environments/env_123/runs (401, 89ms)
 Response: {"error": "invalid_api_key", "message": "API key not found or revoked"}
Error: Not authenticated. Run `tahuna login` first.
```

### Error Message Mapping

| Backend Error | User-Facing Message |
|---------------|---------------------|
| 401 (any) | "Not authenticated. Run `tahuna login` first." |
| 401 (expired) | "Session expired. Run `tahuna login` to re-authenticate." |
| 403 | "Access denied." |
| 404 (environment) | "Environment not found." |
| 404 (run) | "Run not found." |
| 409 (no capacity) | "No GPU capacity for <type>." + alternate GPU prompt (interactive) |
| 400 (validation) | Forward the specific validation message from backend. |
| 500 | "Something went wrong. Try again or check status." |
| Network error | "Cannot reach Tahuna backend. Check your connection." |

## Config Resolution

### API URL Resolution Order

1. `TAHUNA_API_URL` environment variable
2. `CONVEX_SITE_URL` environment variable
3. `NEXT_PUBLIC_CONVEX_SITE_URL` environment variable
4. Default: `http://localhost:3000`

- If URL ends with `/api`, CLI does not double-prefix.
- CLI auto-prefixes requests with `/api`.

### Browser URL Resolution

1. `TAHUNA_BROWSER_URL` environment variable
2. Auto-detected and persisted on first `tahuna login`
3. Stored in `~/.config/tahuna/config.env`

## Invariants

- All commands use the same flag conventions (no command uses `-v` for something other than verbose).
- Default output is always human-readable tables. Never raw JSON by default.
- Verbose adds HTTP debugging info, not full JSON payloads.
- The shell is a local REPL only. It does not connect to a remote pod.
- Error messages are actionable: they tell the user what to do next.
- `-n` always means "number of items, newest first" (like `tail`).
- `-f` always means "follow/stream" (like `tail -f` or `docker logs -f`).

## Error States

| Condition | Behavior |
|-----------|----------|
| Unknown command | "Unknown command: <cmd>. Run `tahuna help` for usage." |
| Unknown flag | "Unknown flag: <flag>. Run `tahuna <cmd> --help` for usage." |
| Missing required arg | "Missing required argument: <arg>. Usage: tahuna <cmd> <arg>" |
| No project initialized | "No Tahuna project found. Run `tahuna init` first." (when .tahuna/ missing) |

## Dependencies

- Auth (API key for all API calls)
- Config file (`~/.config/tahuna/config.env`)
- Project state (`.tahuna/` directory)
