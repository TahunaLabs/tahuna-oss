.DEFAULT_GOAL := help

SELF_HOST_COMPOSE := docker/docker-compose.yml
SELF_HOST_ENV := docker/.env

.PHONY: help install-web run-web install-docs run-docs build-docs install-cli install-cli-dev install-cli-tools run-cli lint-cli test-cli validate-cli install-runtime-tools lint-warden test-warden validate-warden self-host-up self-host-down self-host-logs self-host-dashboard-key

help:
	@echo "Available targets:"
	@echo "  install-web  Install web dependencies"
	@echo "  run-web      Run Convex + Next.js dev server"
	@echo "  install-docs Install documentation dependencies"
	@echo "  run-docs     Run documentation dev server"
	@echo "  build-docs   Build documentation app"
	@echo "  install-cli  Install CLI dependencies"
	@echo "  install-cli-tools  Install pinned Go CLI lint tooling"
	@echo "  lint-cli     Run Go CLI formatting, vet, and lint checks"
	@echo "  test-cli     Run Go CLI tests"
	@echo "  validate-cli Run the full Go CLI validation stack"
	@echo "  install-runtime-tools  Install pinned Go runtime lint tooling"
	@echo "  lint-warden  Run Warden runtime formatting, vet, and lint checks"
	@echo "  test-warden  Run Warden runtime tests"
	@echo "  validate-warden Run the full Warden runtime validation stack"
	@echo "  install-cli-dev  Build and install CLI as tahuna-dev (local dev binary)"
	@echo "  self-host-up  Configure and start the self-hosted stack"
	@echo "  self-host-down  Stop the self-hosted stack"
	@echo "  self-host-logs  Follow self-hosted stack logs"
	@echo "  self-host-dashboard-key  Generate a Convex dashboard admin key"
	@echo "  run-cli      Run the CLI"

install-web:
	cd web && bun install

run-web:
	@trap 'kill 0' INT TERM EXIT; \
	cd web && bun run convex:dev & \
	cd web && bun run dev & \
	wait

install-docs:
	cd docs && bun install

run-docs:
	cd docs && bun run dev

build-docs:
	cd docs && bun run build

install-cli:
	cd cli && go mod download

install-cli-dev:
	@bin_dir="$$(go env GOPATH)/bin"; \
	go build -C cli -o "$$bin_dir/tahuna-dev.tmp" .; \
	mv -f "$$bin_dir/tahuna-dev.tmp" "$$bin_dir/tahuna-dev"; \
	echo "Installed tahuna-dev ✔ (standalone binary; no shell alias required)"

install-cli-tools:
	cd cli && GOBIN="$$(go env GOPATH)/bin" go install github.com/golangci/golangci-lint/cmd/golangci-lint@v1.64.8

lint-cli:
	cd cli && ./tests/run_go_lint.sh

test-cli:
	cd cli && ./tests/run_go_tests.sh

validate-cli: lint-cli test-cli

install-runtime-tools:
	cd runtime/warden && GOBIN="$$(go env GOPATH)/bin" go install github.com/golangci/golangci-lint/cmd/golangci-lint@v1.64.8

lint-warden:
	cd runtime/warden && ./tests/run_go_lint.sh

test-warden:
	cd runtime/warden && ./tests/run_go_tests.sh

validate-warden: lint-warden test-warden

run-cli:
	cd cli && go run .

self-host-up:
	./docker/setup.sh

self-host-down:
	@if [ ! -f $(SELF_HOST_ENV) ]; then cp $(SELF_HOST_ENV).example $(SELF_HOST_ENV); fi
	docker compose --env-file $(SELF_HOST_ENV) -f $(SELF_HOST_COMPOSE) down

self-host-logs:
	@if [ ! -f $(SELF_HOST_ENV) ]; then cp $(SELF_HOST_ENV).example $(SELF_HOST_ENV); fi
	docker compose --env-file $(SELF_HOST_ENV) -f $(SELF_HOST_COMPOSE) logs -f

self-host-dashboard-key:
	@if [ ! -f $(SELF_HOST_ENV) ]; then cp $(SELF_HOST_ENV).example $(SELF_HOST_ENV); fi
	docker compose --env-file $(SELF_HOST_ENV) -f $(SELF_HOST_COMPOSE) exec -T convex-backend ./generate_admin_key.sh
