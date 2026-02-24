# tahuna CLI (Go)

This CLI consumes the backend HTTP API.
It uses arrow-key interactive prompts with a colored terminal UI.

## Build

```bash
cd cli
go run .
```

## Configure

```bash
export TAHUNA_API_URL=http://localhost:8000
export TAHUNA_API_KEY=<api-key-from-api-key-manager>
```

Create an API key:

```bash
# 1) Sign up / sign in in the web app
# 2) Open "Get API Key"
# 3) Create key and copy it into TAHUNA_API_KEY
```

## Examples

```bash
go run . init
go run . env create --name demo --gpu-type "NVIDIA GeForce RTX 4090" --gpu-count 1 --volume-gb 80 --framework pt --version 2.8.0-cu128
go run . env list
go run . run create --environment-id <environment_id> --watch
go run . run watch --id <run_id> --interval 5
```

## Homebrew

Use the provided formula template at `Formula/tahuna.rb`.
After replacing URLs/SHA256 with your release artifacts:

```bash
brew tap <your-org>/tap
brew install tahuna
```
