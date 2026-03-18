#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/web"
CONFIRMATION_PHRASE="DELETE_ALL_CONVEX_DATA"

TARGET_ARGS=()
DRY_RUN="false"
BATCH_SIZE="200"
CONFIRM=""
ASSUME_YES="false"

usage() {
  cat <<'EOF'
Usage:
  scripts/cleanup-convex-db.sh [options]

Options:
  --prod                      Run against prod deployment
  --preview-name <name>       Run against preview deployment
  --deployment-name <name>    Run against a specific deployment
  --dry-run                   Only count records/objects, do not delete
  --batch-size <n>            Batch size per cleanup pass (default: 200, max: 1000)
  --confirm <phrase>          Required phrase: DELETE_ALL_CONVEX_DATA
  --yes                       Skip interactive confirmation prompt
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod)
      TARGET_ARGS+=(--prod)
      shift
      ;;
    --preview-name)
      if [[ $# -lt 2 ]]; then
        echo "error: --preview-name requires a value" >&2
        exit 1
      fi
      TARGET_ARGS+=(--preview-name "$2")
      shift 2
      ;;
    --deployment-name)
      if [[ $# -lt 2 ]]; then
        echo "error: --deployment-name requires a value" >&2
        exit 1
      fi
      TARGET_ARGS+=(--deployment-name "$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --batch-size)
      if [[ $# -lt 2 ]]; then
        echo "error: --batch-size requires a numeric value" >&2
        exit 1
      fi
      BATCH_SIZE="$2"
      shift 2
      ;;
    --confirm)
      if [[ $# -lt 2 ]]; then
        echo "error: --confirm requires a value" >&2
        exit 1
      fi
      CONFIRM="$2"
      shift 2
      ;;
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "${CONFIRM}" != "${CONFIRMATION_PHRASE}" ]]; then
  echo "error: --confirm must exactly be ${CONFIRMATION_PHRASE}" >&2
  exit 1
fi

if ! [[ "${BATCH_SIZE}" =~ ^[0-9]+$ ]]; then
  echo "error: --batch-size must be a positive integer" >&2
  exit 1
fi

ARGS=$(printf '{"confirm":"%s","dry_run":%s,"batch_size":%s}' \
  "${CONFIRM}" "${DRY_RUN}" "${BATCH_SIZE}")

echo "About to run Convex database cleanup (Convex tables only):"
echo "  dry_run=${DRY_RUN}"
echo "  batch_size=${BATCH_SIZE}"
echo "  target_args=${TARGET_ARGS[*]:-(default deployment)}"

if [[ "${ASSUME_YES}" != "true" ]]; then
  read -r -p "Continue? [y/N] " reply
  if [[ "${reply}" != "y" && "${reply}" != "Y" ]]; then
    echo "aborted"
    exit 1
  fi
fi

cd "${WEB_DIR}"
bunx convex run "${TARGET_ARGS[@]}" maintenance:cleanupDatabase "${ARGS}"
