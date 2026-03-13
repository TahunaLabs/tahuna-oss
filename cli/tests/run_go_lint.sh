#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)

cd "${CLI_DIR}"

UNFORMATTED=$(gofmt -l .)
if [[ -n "${UNFORMATTED}" ]]; then
  echo "gofmt check failed for:"
  echo "${UNFORMATTED}"
  exit 1
fi

go vet ./...

GOLANGCI_LINT_BIN=""
if command -v golangci-lint >/dev/null 2>&1; then
  GOLANGCI_LINT_BIN=$(command -v golangci-lint)
else
  GO_BIN_DIR="$(go env GOPATH)/bin"
  if [[ -x "${GO_BIN_DIR}/golangci-lint" ]]; then
    GOLANGCI_LINT_BIN="${GO_BIN_DIR}/golangci-lint"
  fi
fi

if [[ -z "${GOLANGCI_LINT_BIN}" ]]; then
  echo "golangci-lint is required. Install it with:"
  echo "  make install-cli-tools"
  exit 1
fi

"${GOLANGCI_LINT_BIN}" run ./...
