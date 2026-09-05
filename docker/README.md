# Self-hosting Tahuna

This recipe runs the current Tahuna web application with a self-hosted Convex
backend and dashboard. It replaces the older `Standalone-OSS` prototype, whose
API and worker used process-local storage and a simulated compute provider.

## What remains external

Tahuna provisions GPU machines through RunPod, stores project data in an
S3-compatible R2 bucket, and sends login codes through Resend. You need accounts
and credentials for those services. The default runtime images are read from
Tahuna's public GHCR repository; build and publish your own copies if you want
to control that supply chain too.

The included Convex backend uses a persistent Docker volume with SQLite. That
is suitable for evaluation and a small trusted deployment. Use an external
database, durable backups, and a TLS reverse proxy for production.

## Requirements

- Docker Engine with Compose v2
- OpenSSL
- ngrok (only for local runs on remote GPU machines)
- A RunPod API key
- An R2 bucket and API credentials
- A Resend API key

## Start locally

```bash
cp docker/.env.example docker/.env
cp docker/.env.application.example docker/.env.application
chmod 600 docker/.env docker/.env.application
```

Fill the required blank values in `docker/.env.application`, then run:

```bash
make self-host-up
```

The setup script creates the application secrets, starts Convex, applies the
backend environment, deploys the functions, and builds the web app.

- Tahuna: `http://localhost:3000`
- Convex backend: `http://localhost:3210`
- Convex HTTP actions: `http://localhost:3211`
- Convex dashboard: `http://localhost:6791`

Generate a dashboard login key with `make self-host-dashboard-key`.

For the CLI, build the local-mode binary and point it at the app:

```bash
make install-cli-dev
TAHUNA_API_URL=http://localhost:3000 tahuna-dev login
```

## Remote compute callbacks

RunPod machines cannot reach loopback. For local evaluation with remote compute,
authenticate the ngrok CLI once, then start a temporary HTTPS tunnel and apply
its callback origin:

```bash
ngrok config add-authtoken YOUR_TOKEN
make self-host-tunnel-up
make self-host-up
```

Keep `ENV=development` in `docker/.env.application` for this arrangement so
runtime callbacks go directly to the Convex HTTP-actions origin. Runtime status,
logs, and fallback metrics use authenticated HTTP/JSON endpoints. Framework
metrics use the included W&B-compatible HTTP endpoints; there is no gRPC service
to expose.

Check or stop the tunnel with:

```bash
make self-host-tunnel-status
make self-host-tunnel-down
make self-host-up
```

Stopping restores the previous origins in `docker/.env`; the final
`self-host-up` applies them to Convex and the web app. Keep the tunnel running
until every remote run is terminal so its final metrics and artifacts can be
committed.

## Internet-facing deployment

Do not expose the included HTTP ports directly. Put the app and both Convex
origins behind HTTPS, change `TAHUNA_APP_BIND_ADDRESS` and
`TAHUNA_CONVEX_BIND_ADDRESS` only when your firewall and reverse proxy are
ready, leave `DO_NOT_REQUIRE_SSL` empty, and update all public URLs. Keep
`TAHUNA_DASHBOARD_BIND_ADDRESS=127.0.0.1`; its admin key can read and mutate all
deployment data.

Set `ENV=production` and use the public Tahuna app URL for `SITE_URL`. Runtime
callbacks then pass through the app's `/api` routes. Configure a verified Resend
sender before production use.

The default initial grant gives each new user $10,000 of virtual credits and
uses no compute markup. This does not pay RunPod: the self-hosting operator is
responsible for all provider charges. Set `TAHUNA_INITIAL_CREDIT_CENTS=0` and
configure Stripe if you want paid top-ups instead.

## Operations

```bash
make self-host-logs
make self-host-down
```

`make self-host-down` preserves the Convex data volume. Before upgrading the
pinned Convex images, back up that volume and read the upstream self-hosting
upgrade notes.
