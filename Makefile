.PHONY: \
	install run \
	install-web install-backend install-worker install-provisioner install-cli \
	run-web run-backend run-worker run-provisioner run-cli \
	web backend worker provisioner cli \
	infra-up infra-down build test fmt dev tree

install: install-web install-backend install-worker install-provisioner install-cli

run:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) run-backend & \
	$(MAKE) run-worker & \
	$(MAKE) run-web & \
	wait

install-web:
	cd apps/web && bun install

run-web:
	cd apps/web && bun run dev

install-backend:
	cd apps/backend && go mod download

run-backend:
	@set -a; \
	if [ -f apps/backend/.env.local ]; then . apps/backend/.env.local; fi; \
	set +a; \
	cd apps/backend && go run .

install-worker:
	cd apps/worker && go mod download

run-worker:
	@set -a; \
	if [ -f apps/worker/.env.local ]; then . apps/worker/.env.local; fi; \
	set +a; \
	cd apps/worker && go run .

install-provisioner:
	cd apps/provisioner && go mod download

run-provisioner:
	@set -a; \
	if [ -f apps/provisioner/.env.local ]; then . apps/provisioner/.env.local; fi; \
	set +a; \
	cd apps/provisioner && go run .

install-cli:
	cd cli && go mod download

run-cli:
	@set -a; \
	if [ -f cli/.env.local ]; then . cli/.env.local; fi; \
	set +a; \
	cd cli && go run .

web: run-web
backend: run-backend
worker: run-worker
provisioner: run-provisioner
cli: run-cli

infra-up:
	docker compose up -d

infra-down:
	docker compose down

build:
	cd apps/backend && go build .
	cd apps/worker && go build .
	cd apps/provisioner && go build .
	cd cli && go build .

test:
	cd apps/backend && go test ./...
	cd apps/worker && go test ./...
	cd apps/provisioner && go test ./...
	cd cli && go test ./...

fmt:
	cd apps/backend && gofmt -w *.go
	cd apps/worker && gofmt -w *.go
	cd apps/provisioner && gofmt -w *.go
	cd cli && gofmt -w *.go

dev: run-backend

tree:
	@echo "monorepo/"
	@echo "├── apps/"
	@echo "│   ├── web"
	@echo "│   ├── backend"
	@echo "│   ├── worker"
	@echo "│   └── provisioner"
	@echo "├── cli"
	@echo "├── libs"
	@echo "├── proto"
	@echo "└── infra"
