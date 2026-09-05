#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/docker/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/docker/.env.example"
STATE_DIR="$ROOT_DIR/docker/.ngrok-tunnel"
PID_FILE="$STATE_DIR/ngrok.pid"
LOG_FILE="$STATE_DIR/ngrok.log"
METADATA_FILE="$STATE_DIR/metadata.env"
NGROK_API_URL="http://127.0.0.1:4040/api/tunnels"

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

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created docker/.env"
  fi
}

process_is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

extract_public_url() {
  tr -d '\n' \
    | grep -Eo '"public_url":"https://[^\"]+"' \
    | sed -n '1s/^"public_url":"//; 1s/"$//; 1p'
}

wait_for_public_url() {
  local pid="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if ! process_is_running "$pid"; then
      echo "ngrok exited before publishing a URL." >&2
      tail -n 40 "$LOG_FILE" >&2 || true
      return 1
    fi
    local public_url
    public_url="$(curl -fsS "$NGROK_API_URL" 2>/dev/null | extract_public_url || true)"
    if [[ -n "$public_url" ]]; then
      printf '%s\n' "$public_url"
      return
    fi
    sleep 1
  done
  echo "Timed out waiting for ngrok to publish a URL." >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  return 1
}

write_metadata() {
  local public_url="$1"
  local local_port="$2"
  local previous_site_origin="$3"
  local previous_public_site_url="$4"
  printf '%s\n' \
    "NGROK_PUBLIC_URL=$public_url" \
    "LOCAL_PORT=$local_port" \
    "PREVIOUS_CONVEX_SITE_ORIGIN=$previous_site_origin" \
    "PREVIOUS_NEXT_PUBLIC_CONVEX_SITE_URL=$previous_public_site_url" \
    > "$METADATA_FILE"
  chmod 600 "$METADATA_FILE"
}

start_tunnel() {
  require_command curl
  require_command ngrok
  ensure_env_file
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"

  if [[ -f "$PID_FILE" ]]; then
    local existing_pid
    existing_pid="$(read_env_var "$PID_FILE" PID)"
    if process_is_running "$existing_pid"; then
      echo "ngrok tunnel is already running (pid=$existing_pid)."
      status_tunnel
      return
    fi
  fi

  local port
  port="$(read_env_var "$ENV_FILE" CONVEX_SITE_PORT)"
  port="${port:-3211}"
  local previous_site_origin
  previous_site_origin="$(read_env_var "$ENV_FILE" CONVEX_SITE_ORIGIN)"
  local previous_public_site_url
  previous_public_site_url="$(read_env_var "$ENV_FILE" NEXT_PUBLIC_CONVEX_SITE_URL)"

  : > "$LOG_FILE"
  nohup ngrok http "$port" --log=stdout --log-format=json > "$LOG_FILE" 2>&1 &
  local pid=$!
  printf 'PID=%s\n' "$pid" > "$PID_FILE"
  chmod 600 "$PID_FILE" "$LOG_FILE"

  local public_url
  if ! public_url="$(wait_for_public_url "$pid")"; then
    kill "$pid" >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
    exit 1
  fi

  set_env_var "$ENV_FILE" CONVEX_SITE_ORIGIN "$public_url"
  set_env_var "$ENV_FILE" NEXT_PUBLIC_CONVEX_SITE_URL "$public_url"
  write_metadata "$public_url" "$port" "$previous_site_origin" "$previous_public_site_url"

  echo "ngrok tunnel started: $public_url -> http://127.0.0.1:$port"
  echo "Run 'make self-host-up' to deploy the public runtime callback origin."
}

stop_tunnel() {
  ensure_env_file
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(read_env_var "$PID_FILE" PID)"
    if process_is_running "$pid"; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$PID_FILE"
  fi

  if [[ -f "$METADATA_FILE" ]]; then
    local previous_site_origin
    previous_site_origin="$(read_env_var "$METADATA_FILE" PREVIOUS_CONVEX_SITE_ORIGIN)"
    local previous_public_site_url
    previous_public_site_url="$(read_env_var "$METADATA_FILE" PREVIOUS_NEXT_PUBLIC_CONVEX_SITE_URL)"
    set_env_var "$ENV_FILE" CONVEX_SITE_ORIGIN "$previous_site_origin"
    set_env_var "$ENV_FILE" NEXT_PUBLIC_CONVEX_SITE_URL "$previous_public_site_url"
  fi

  echo "ngrok tunnel stopped and docker/.env origins restored."
  echo "Run 'make self-host-up' to apply the restored local origins."
}

status_tunnel() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(read_env_var "$PID_FILE" PID)"
  fi
  if process_is_running "$pid"; then
    echo "running pid=$pid"
  else
    echo "stopped"
  fi
  if [[ -f "$METADATA_FILE" ]]; then
    local public_url
    public_url="$(read_env_var "$METADATA_FILE" NGROK_PUBLIC_URL)"
    if [[ -n "$public_url" ]]; then
      echo "url=$public_url"
    fi
  fi
}

case "${1:-up}" in
  up)
    start_tunnel
    ;;
  down)
    stop_tunnel
    ;;
  status)
    status_tunnel
    ;;
  *)
    echo "Usage: $0 {up|down|status}" >&2
    exit 1
    ;;
esac
