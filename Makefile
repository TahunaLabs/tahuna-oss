.DEFAULT_GOAL := help

.PHONY: help install-web run-web install-cli run-cli

help:
	@echo "Available targets:"
	@echo "  install-web  Install web dependencies"
	@echo "  run-web      Run Convex + Next.js dev server"
	@echo "  install-cli  Install CLI dependencies"
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

run-cli:
	@set -a; \
	if [ -f cli/.env.local ]; then . cli/.env.local; fi; \
	set +a; \
	cd cli && go run .
