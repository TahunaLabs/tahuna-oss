# Tahuna CLI

Standalone Go CLI for managing environments and runs.

## Setup

```bash
cd cli
go mod download
go run .
```

## Environment

```bash
export TAHUNA_API_URL=http://localhost:3000
```

## Common commands

```bash
go run . login
go run . init
go run . env create --name demo --gpu-type "NVIDIA GeForce RTX 4090" --gpu-count 1 --volume-gb 80 --framework pt --version 2.8.0-cu128
go run . env list
go run . run create --environment-id <environment_id> --watch
go run . run watch --id <run_id> --interval 5
```

`login` opens the browser, completes auth on the web app, then stores `TAHUNA_API_KEY` in `cli/.env.local`.
