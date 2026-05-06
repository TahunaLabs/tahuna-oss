#!/bin/sh
set -eu

if [ -z "${TAHUNA_API_URL:-}" ]; then
  dir=$PWD
  while [ "$dir" != "/" ]; do
    env_file="$dir/web/.env.local"
    if [ -f "$env_file" ]; then
      tahuna_api_url=$(sed -n 's/^NEXT_PUBLIC_CONVEX_SITE_URL=//p' "$env_file" | tail -n 1)
      tahuna_api_url=${tahuna_api_url#\"}
      tahuna_api_url=${tahuna_api_url%\"}
      if [ -n "$tahuna_api_url" ]; then
        export TAHUNA_API_URL="$tahuna_api_url"
      fi
      break
    fi
    dir=$(dirname "$dir")
  done
fi

case "$0" in
  */*) bin_dir=$(dirname "$0") ;;
  *) bin_dir=$(dirname "$(command -v "$0")") ;;
esac

exec "$bin_dir/tahuna-dev-go-dev" "$@"
