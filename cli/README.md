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

## Release

Nightly (tracks `main`):

1. Push commits to `main`.
2. `Release CLI Nightly` runs on each `main` push and updates the `nightly` release in `Pazuzzu/tahuna-cli`.

Stable:

1. Ensure the release commit is on `main`.
2. Create and push a semver tag from `main`.

```bash
git checkout main
git pull --ff-only origin main
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin v0.1.1
```

3. `Release CLI` publishes release assets to `Pazuzzu/tahuna-cli`.
4. Promote stable by updating `releases/channels.conf` (`stable=vX.Y.Z`) and pushing `main`.

## Dev binary (tahuna-dev)

To work with both prod and dev CLIs side by side, install the dev build as a separate `tahuna-dev` binary:

```bash
make install-cli-dev
```

The target builds a standalone `tahuna-dev` binary (no shell alias required). Then log in once:

```bash
tahuna-dev login
```

After that you can use both side by side:

```bash
tahuna env list       # prod → https://tahuna.app   (config: ~/.config/tahuna/)
tahuna-dev env list   # dev  → http://localhost:3000 (config: ~/.config/tahuna-dev/)
```

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
