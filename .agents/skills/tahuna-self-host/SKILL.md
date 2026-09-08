---
name: tahuna-self-host
description: Starts and verifies a self-hosted Tahuna stack, authenticates the CLI, and runs the MNIST GPU example end to end. Use when setting up Tahuna from a fresh clone, testing RunPod callbacks through ngrok, or validating the OSS quickstart.
---

# Self-host Tahuna

Run the complete local Docker control plane, public callback tunnel, CLI login, and one remote MNIST GPU job.

## Guardrails

- Never print, commit, or copy secret values into chat or logs.
- Do not overwrite an existing `docker/.env` or `docker/.env.application`.
- The tunnel is HTTP/JSON, including W&B-compatible metrics; there is no gRPC service.
- RunPod is billable. Keep the tunnel up until the run is terminal and verify the pod terminates.
- Ask the user to complete email and verification-code entry during `tahuna-dev login`.

## 1. Check prerequisites

Require Git, Docker Compose v2, OpenSSL, Go, `uv`, and `ngrok`, plus credentials for RunPod, an S3-compatible bucket, Resend, and ngrok. Confirm the runtime repository exposes `pt-2.4.0-cu124-py3.11`.

```bash
git clone https://github.com/TahunaLabs/tahuna-oss.git
cd tahuna-oss
```

## 2. Configure without overwriting

```bash
test -f docker/.env || cp docker/.env.example docker/.env
test -f docker/.env.application || cp docker/.env.application.example docker/.env.application
chmod 600 docker/.env docker/.env.application
```

Keep the local defaults in `docker/.env`. In `docker/.env.application`, set `SITE_URL=http://localhost:3000`, `ENV=development`, and these required values:

- `RESEND_API_KEY`
- `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `TAHUNA_MANAGED_RUNPOD_API_KEY`
- `TAHUNA_RUNTIME_IMAGE_REPO`

Leave `BETTER_AUTH_SECRET` and `TAHUNA_CREDENTIALS_SECRET` blank initially; setup generates them. Validate required values without displaying them.

## 3. Start and verify

```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
make self-host-tunnel-up
make self-host-up
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
make self-host-tunnel-status
curl --fail http://localhost:3000/
curl --fail http://localhost:3211/api/health
```

Start ngrok before Docker so Convex receives its public callback origin. Do not continue until the app and callback health checks succeed.

## 4. Authenticate the CLI

```bash
make install-cli-dev
export TAHUNA_API_URL=http://localhost:3000
tahuna-dev login
```

Pause for the user's browser email/code flow. Continue only after the CLI prints `Login successful`.

## 5. Run MNIST

```bash
cd examples/mnist
uv run --script scripts/prepare_mnist_data.py
tahuna-dev init .
tahuna-dev train
```

Capture the printed run ID as `RUN_ID`, then verify it:

```bash
RUN_ID=replace-with-printed-run-id
tahuna-dev run show "$RUN_ID"
tahuna-dev run metrics --metric train/loss --metric eval/loss --tail 10 "$RUN_ID"
```

Require `completed`, CUDA training logs, persisted loss metrics, uploaded `model.pt` and `metrics.json`, and no remaining RunPod pod. If `cuda>=12.8` appears, use the checked-in CUDA 12.4/PyTorch 2.4 configuration.

## 6. Clean up

```bash
cd ../..
make self-host-tunnel-down
make self-host-down
```

Confirm no ngrok process or Tahuna Compose container remains. If a failed run left a RunPod pod, identify it exactly before terminating it. Preserve the Convex volume.

For production TLS, reverse proxies, and backups, read `docker/README.md`.
