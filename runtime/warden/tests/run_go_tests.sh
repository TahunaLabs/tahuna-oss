#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WARDEN_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

cd "${WARDEN_DIR}"
go test ./...
