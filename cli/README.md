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
export TAHUNA_API_KEY=<bootstrap-issued-key>
```

Bootstrap an API key (one-time):

```bash
curl -X POST "$TAHUNA_API_URL/auth/bootstrap" \
  -H "X-Bootstrap-Secret: $BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","name":"local-cli"}'
```

## Examples

```bash
go run . init
go run . env create --name demo --gpu-type "NVIDIA GeForce RTX 4090" --gpu-count 1 --volume-gb 80 --framework pt --version 2.8.0-cu128
go run . env list
go run . exp create --environment-id <environment_id> --name baseline
go run . run create --experiment-id <experiment_id> --watch
go run . run watch --id <run_id> --interval 5
```

## Homebrew

Use the provided formula template at `Formula/tahuna.rb`.
After replacing URLs/SHA256 with your release artifacts:

```bash
brew tap <your-org>/tap
brew install tahuna
```
