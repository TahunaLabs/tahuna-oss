#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

cd "${CLI_DIR}"
go test ./...
