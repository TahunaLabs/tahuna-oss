---
name: tahuna-go-cli
description: Tahuna Go CLI implementation workflow. Use when modifying cli/ command parsing, command output, API calls, project state, sync internals, env vars, run/train/serve commands, or CLI tests and validation.
---

# Tahuna Go CLI

## Orientation

Use this skill with `$tahuna-repo-workflow`. Read [cli/README.md](../../cli/README.md), [CONTEXT.md](../../CONTEXT.md), and the relevant spec for the command family before changing behavior.

Important specs:

- [specs/sync.md](../../specs/sync.md) for sync behavior.
- [specs/run-lifecycle.md](../../specs/run-lifecycle.md) for train and run behavior.
- [specs/python-inference-app-contract.md](../../specs/python-inference-app-contract.md) for project files and commands.
- [specs/auth.md](../../specs/auth.md) for CLI login and serve inference auth expectations.

## File Ownership

Keep responsibilities in the existing files:

- Command parsing and human output stay in command files.
- HTTP helpers stay in `ui_api.go`.
- Project state stays in `project.go`.
- Sync internals stay in `sync.go`.

Search the whole repository before removing or renaming any CLI behavior because contracts may be referenced in docs, web handlers, tests, specs, or examples.

## Command Surface

Use one canonical subcommand verb per action. Do not add alias verbs unless requested.

Every command group must support:

- `-h`
- `--help`
- `help`

Unknown or missing subcommands should print group usage. Keep each subcommand `FlagSet` isolated.

Shared flags should have short and long forms, for example `-a` and `--all`. Put flags before positional args in tests.

Default output is human-readable. JSON or machine-oriented detail should be under `--verbose` only, matching existing command-family style.

## API And Errors

Use explicit contexts and timeouts for all networked calls. Preserve the existing error/output style for the command family being edited.

Keep CLI request paths and DTO keys aligned with Convex or backend handlers. If an API path, command, or DTO is renamed, update the CLI, backend, docs, and errors in the same change.

For auth and config resolution, remember:

- `tahuna` defaults to `https://tahuna.app`.
- `tahuna-dev` defaults to `http://localhost:3000`.
- `TAHUNA_API_URL` overrides the API base.
- `TAHUNA_BROWSER_URL` can override browser login URL.
- Credentials are stored under the matching `~/.config/tahuna*` directory.

## Tests

Do not add tests unless the user explicitly asks. When tests are requested or existing tests need updates:

- Use `httptest.NewServer` for mock servers.
- Put shared helpers in `test_helpers_test.go`.
- Test underlying error-returning functions instead of `must()` or `require()` paths that call `os.Exit`.
- Test non-interactive paths only for prompts that require a real terminal.
- Keep flags before positional args in test calls.

## Validation

Run from the repo root:

```bash
make validate-cli
```

This covers formatting, vetting, linting, and Go tests for the CLI.
