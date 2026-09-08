# CLI UX

Last reviewed: 2026-05-07

## Current Behavior

The Tahuna CLI is a Go binary with human-readable output by default and JSON under `--verbose` or `-v` on commands that support it. Top-level commands are dispatched in `cli/main.go`.

Supported command groups:

- `login`
- `init`, `start`, `up`
- `sync`
- `train`
- `env` / `environment`
- `env_vars`
- `gpus`
- `data`
- `run`
- `serve`
- `shell`
- `version`

Command groups support `help`, `-h`, and `--help`. Unknown or missing subcommands print group usage and exit non-zero.

## Configuration

The CLI resolves:

- `TAHUNA_API_KEY`
- `TAHUNA_API_URL`
- `TAHUNA_BROWSER_URL`
- `TAHUNA_CONFIG_DIR`

Production defaults to `https://tahuna.app`. Development defaults to `http://localhost:3000`. The `tahuna` binary refuses localhost API targets; `tahuna-dev` refuses the production host.

Project state lives in `.tahuna/environment_id`. Project config lives in `tahuna.toml`.

## Output Style

- Default list/show commands print compact tables or summaries.
- `--verbose` prints raw JSON payloads.
- Run and serve logs print persisted runtime log lines.
- `train` and `run watch` poll run status; `train` also streams logs.

## Notable Commands

- `tahuna init .` creates or links a project, creates the backend environment, writes `tahuna.toml`, and runs sync.
- `tahuna sync [code|data]` uploads changed code and/or data manifests and commits the environment snapshot.
- `tahuna train [-d]` creates a run from the linked environment. Without `-d`, it watches and streams logs.
- `tahuna run create --name <name>` creates a named run; unnamed runs get generated names.
- `tahuna run rename <run_id|run_name> --name <new_name>` renames a run.
- `tahuna serve create` creates a serve from a completed run or storage prefix.

## Invariants

- Flags are parsed per subcommand with isolated `FlagSet`s.
- Human output is the default; JSON is opt-in.
- CLI API errors surface the backend `detail` message when it is safe for clients.
