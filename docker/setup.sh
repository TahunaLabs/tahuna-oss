#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_ENV_FILE="$ROOT_DIR/docker/.env"
PLATFORM_ENV_EXAMPLE_FILE="$ROOT_DIR/docker/.env.example"
APPLICATION_ENV_FILE="$ROOT_DIR/docker/.env.application"
APPLICATION_ENV_EXAMPLE_FILE="$ROOT_DIR/docker/.env.application.example"
COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.yml"
CREDENTIALS_FILE=""

cleanup() {
  if [[ -n "$CREDENTIALS_FILE" && -f "$CREDENTIALS_FILE" ]]; then
    rm -f "$CREDENTIALS_FILE"
  fi
}
trap cleanup EXIT

read_env_var() {
  local file="$1"
  local key="$2"
  awk -v key="$key" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }' "$file"
}

set_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temporary_file
  temporary_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$file" > "$temporary_file"
  mv "$temporary_file" "$file"
  chmod 600 "$file"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required." >&2
    exit 1
  fi
}

require_value() {
  local file="$1"
  local key="$2"
  if [[ -z "$(read_env_var "$file" "$key")" ]]; then
    echo "Set $key in ${file#"$ROOT_DIR/"} before starting the stack." >&2
    exit 1
  fi
}

wait_for_backend() {
  local attempt
  for attempt in $(seq 1 60); do
    if docker compose --env-file "$PLATFORM_ENV_FILE" -f "$COMPOSE_FILE" exec -T convex-backend \
      curl -fsS http://localhost:3210/version >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "Convex backend did not become ready." >&2
  exit 1
}

require_command docker
require_command openssl

if [[ ! -f "$PLATFORM_ENV_FILE" ]]; then
  cp "$PLATFORM_ENV_EXAMPLE_FILE" "$PLATFORM_ENV_FILE"
  echo "Created docker/.env"
fi
if [[ ! -f "$APPLICATION_ENV_FILE" ]]; then
  cp "$APPLICATION_ENV_EXAMPLE_FILE" "$APPLICATION_ENV_FILE"
  echo "Created docker/.env.application"
fi
chmod 600 "$PLATFORM_ENV_FILE" "$APPLICATION_ENV_FILE"

if [[ -z "$(read_env_var "$APPLICATION_ENV_FILE" BETTER_AUTH_SECRET)" ]]; then
  set_env_var "$APPLICATION_ENV_FILE" BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
fi
if [[ -z "$(read_env_var "$APPLICATION_ENV_FILE" TAHUNA_CREDENTIALS_SECRET)" ]]; then
  set_env_var "$APPLICATION_ENV_FILE" TAHUNA_CREDENTIALS_SECRET "$(openssl rand -base64 32)"
fi

require_value "$PLATFORM_ENV_FILE" NEXT_PUBLIC_ASSETS_URL
require_value "$APPLICATION_ENV_FILE" RESEND_API_KEY
require_value "$APPLICATION_ENV_FILE" R2_BUCKET
require_value "$APPLICATION_ENV_FILE" R2_ENDPOINT
require_value "$APPLICATION_ENV_FILE" R2_ACCESS_KEY_ID
require_value "$APPLICATION_ENV_FILE" R2_SECRET_ACCESS_KEY
require_value "$APPLICATION_ENV_FILE" TAHUNA_MANAGED_RUNPOD_API_KEY
require_value "$APPLICATION_ENV_FILE" TAHUNA_RUNTIME_IMAGE_REPO

echo "Starting the Convex backend..."
docker compose --env-file "$PLATFORM_ENV_FILE" -f "$COMPOSE_FILE" up -d convex-backend
wait_for_backend

admin_key="$(docker compose --env-file "$PLATFORM_ENV_FILE" -f "$COMPOSE_FILE" exec -T convex-backend ./generate_admin_key.sh | tail -n 1 | tr -d '\r')"
if [[ -z "$admin_key" ]]; then
  echo "Failed to generate a Convex admin key." >&2
  exit 1
fi

CREDENTIALS_FILE="$(mktemp)"
chmod 600 "$CREDENTIALS_FILE"
printf 'CONVEX_SELF_HOSTED_URL=http://convex-backend:3210\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$admin_key" > "$CREDENTIALS_FILE"

echo "Building the deployment image..."
docker build --target deployer -f "$ROOT_DIR/docker/app.Dockerfile" -t tahuna-convex-deployer:local "$ROOT_DIR"

echo "Applying backend configuration and deploying Convex functions..."
docker run --rm --network tahuna_default \
  --mount "type=bind,src=$CREDENTIALS_FILE,dst=/run/secrets/convex.env,readonly" \
  --mount "type=bind,src=$APPLICATION_ENV_FILE,dst=/run/secrets/application.env,readonly" \
  tahuna-convex-deployer:local \
  sh -c 'set -a; . /run/secrets/convex.env; set +a; bunx convex env set --from-file /run/secrets/application.env --force && bunx convex deploy'

echo "Building and starting the app and dashboard..."
docker compose --env-file "$PLATFORM_ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo
echo "Tahuna:            $(read_env_var "$PLATFORM_ENV_FILE" NEXT_PUBLIC_SITE_URL)"
echo "Convex dashboard: http://localhost:$(read_env_var "$PLATFORM_ENV_FILE" DASHBOARD_PORT)"
echo "Convex backend:   $(read_env_var "$PLATFORM_ENV_FILE" NEXT_PUBLIC_CONVEX_URL)"
echo "Run 'make self-host-dashboard-key' to generate a dashboard login key."
