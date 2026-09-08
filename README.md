# Tahuna

Tahuna is a monorepo for GPU provisioning and ML training orchestration.

Tahuna is open-source software licensed under the
[GNU Affero General Public License v3.0 only](LICENSE.md). Commercial use is
permitted. If you modify Tahuna and make that version available to users over
a network, the license requires you to offer those users the corresponding
source code.

## Self-hosted quickstart

This path starts Tahuna from a fresh clone for local evaluation with real
RunPod GPU jobs. It uses ngrok for remote runtime callbacks. You do not need
Nginx for this local setup; use Nginx, Caddy, or another TLS reverse proxy only
for a permanent internet-facing deployment.

### 1. Install the prerequisites

Install:

- Git
- Docker Engine with Docker Compose v2
- OpenSSL
- [ngrok](https://ngrok.com/download)
- Go, to build the local CLI
- [uv](https://docs.astral.sh/uv/getting-started/installation/), to prepare and run the example

Create accounts and credentials for:

- RunPod, for GPU compute
- Cloudflare R2 or another S3-compatible bucket, for code, data, and artifacts
- Resend, for login codes
- ngrok, for the temporary public callback URL

### 2. Clone and configure Tahuna

```bash
git clone https://github.com/TahunaLabs/tahuna.git
cd tahuna
cp docker/.env.example docker/.env
cp docker/.env.application.example docker/.env.application
chmod 600 docker/.env docker/.env.application
```

The defaults in `docker/.env` bind the application, Convex backend, HTTP
actions, and dashboard to localhost. Leave them unchanged for this quickstart.

Open `docker/.env.application` and fill in the required values:

```dotenv
SITE_URL=http://localhost:3000
ENV=development

# Leave these blank; docker/setup.sh generates them on first start.
BETTER_AUTH_SECRET=
TAHUNA_CREDENTIALS_SECRET=

# Required external services.
RESEND_API_KEY=re_your_resend_key
R2_BUCKET=your-bucket
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
TAHUNA_MANAGED_RUNPOD_API_KEY=rpa_your_runpod_key
TAHUNA_RUNTIME_IMAGE_REPO=ghcr.io/tahunalabs/tahuna
```

Do not commit either env file. The remaining values in
`docker/.env.application` are optional bookkeeping, social-login, and Stripe
settings and can keep their defaults.

### 3. Start the callback tunnel and Docker stack

Authenticate ngrok once, start the tunnel, then start Tahuna:

```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
make self-host-tunnel-up
make self-host-up
```

`self-host-tunnel-up` writes its temporary HTTPS URL to the two callback-origin
fields in `docker/.env`. `self-host-up` then:

1. Starts the self-hosted Convex backend and persistent database volume.
2. Generates the missing application secrets.
3. Applies the backend environment and deploys the Convex functions.
4. Builds and starts the current Tahuna web application and Convex dashboard.

Open:

- Tahuna: <http://localhost:3000>
- Convex dashboard: <http://localhost:6791>
- Convex health endpoint: <http://localhost:3211/api/health>

Check the containers and tunnel with:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
make self-host-tunnel-status
```

Keep the tunnel running while remote jobs are active. It carries authenticated
HTTP status, log, metric, and artifact callbacks from RunPod to the local Convex
HTTP-actions service.

### 4. Build the CLI and sign in

```bash
make install-cli-dev
export TAHUNA_API_URL=http://localhost:3000
tahuna-dev login
```

The login flow opens the local application and sends a verification code using
the configured Resend account.

### 5. Run the MNIST example

The checked-in example uses one RunPod L4 GPU and therefore incurs charges on
the configured RunPod account.

```bash
cd examples/mnist
uv run --script scripts/prepare_mnist_data.py
tahuna-dev init .
tahuna-dev train
```

`train` synchronizes the example and prepared dataset to R2, provisions the
GPU, streams logs and metrics, uploads the files written under `outputs/`, and
terminates the GPU after the run reaches a terminal state.

Inspect the result with:

```bash
tahuna-dev run list
tahuna-dev run show <run-id>
tahuna-dev run metrics --metric train/loss --metric eval/loss --tail 10 <run-id>
```

### 6. Stop or reset the local setup

From the repository root:

```bash
make self-host-tunnel-down
make self-host-down
```

`self-host-tunnel-down` restores the localhost callback origins.
`self-host-down` stops the containers but preserves the Convex data volume. If
you want to keep the local stack running without the tunnel, run
`make self-host-up` again after stopping the tunnel.

For production domains, TLS, reverse-proxy guidance, backups, and operational
commands, see [`docker/README.md`](docker/README.md).

## Subrepos

- [`cli/README.md`](cli/README.md): Go CLI used by end users (`tahuna login/init/train/run/sync`).
- [`web/README.md`](web/README.md): Next.js + Convex app and API surface.
- [`runtime/README.md`](runtime/README.md): in-pod runtime (`warden`) and image build assets.

## Project context

- [`CONTEXT.md`](CONTEXT.md): current product status, architecture, and decisions.
- [`AGENTS.md`](AGENTS.md): repository guardrails and implementation constraints.

## Quick local dev

```bash
make install-web
make install-cli
make run-web
make run-cli
```

## Self-hosting

The supported self-hosting recipe runs the current web app with a self-hosted
Convex backend. See [`docker/README.md`](docker/README.md) for requirements,
security boundaries, and setup instructions.
