.DEFAULT_GOAL := help

.PHONY: help install-web run-web install-cli install-cli-tools run-cli lint-cli test-cli validate-cli

help:
	@echo "Available targets:"
	@echo "  install-web  Install web dependencies"
	@echo "  run-web      Run Convex + Next.js dev server"
	@echo "  install-cli  Install CLI dependencies"
	@echo "  install-cli-tools  Install pinned Go CLI lint tooling"
	@echo "  lint-cli     Run Go CLI formatting, vet, and lint checks"
	@echo "  test-cli     Run Go CLI tests"
	@echo "  validate-cli Run the full Go CLI validation stack"
	@echo "  run-cli      Run the CLI"

install-web:
	cd web && bun install

run-web:
	@trap 'kill 0' INT TERM EXIT; \
	cd web && bun run convex:dev & \
	cd web && bun run dev & \
	wait

install-cli:
	cd cli && go mod download

install-cli-tools:
	cd cli && GOBIN="$$(go env GOPATH)/bin" go install github.com/golangci/golangci-lint/cmd/golangci-lint@v1.64.8

lint-cli:
	cd cli && ./tests/run_go_lint.sh

test-cli:
	cd cli && ./tests/run_go_tests.sh

validate-cli: lint-cli test-cli

run-cli:
	@set -a; \
	if [ -f cli/.env.local ]; then . cli/.env.local; fi; \
	set +a; \
	cd cli && go run .
