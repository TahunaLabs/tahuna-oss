# Tahuna CLI

Standalone Go CLI for login, project init, sync, and run lifecycle management.

## Install released binary

```bash
curl -fsSL https://raw.githubusercontent.com/Pazuzzu/tahuna-cli/main/scripts/install-tahuna.sh | bash
```

Install nightly channel:

```bash
curl -fsSL https://raw.githubusercontent.com/Pazuzzu/tahuna-cli/main/scripts/install-tahuna.sh | bash -s -- --channel nightly
```

See the docs installation guide for manual tarball install and pinned versions:
`docs/content/docs/installation.mdx`.

## Run locally

```bash
cd cli
go mod download
go run .
```

## Common flow

```bash
go run . login
go run . init .
go run . train
go run . run list
go run . sync
```

`login` opens the browser auth flow and stores CLI credentials locally.

## Validation

From repo root:

```bash
make validate-cli
```

Or from `cli/`:

```bash
./tests/run_go_lint.sh
./tests/run_go_tests.sh
```
