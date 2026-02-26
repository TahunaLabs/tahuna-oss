.PHONY: install run install-web install-cli run-web run-web-app run-convex run-cli web cli build test fmt dev tree

install: install-web install-cli

run:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) run-convex & \
	$(MAKE) run-web-app & \
	wait

install-web:
	cd web && bun install

run-web:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) run-convex & \
	$(MAKE) run-web-app & \
	wait

run-web-app:
	cd web && bun run dev

run-convex:
	cd web && bun run convex:dev

install-cli:
	cd cli && go mod download

run-cli:
	@set -a; \
	if [ -f cli/.env.local ]; then . cli/.env.local; fi; \
	set +a; \
	cd cli && go run .

web: run-web
cli: run-cli

build:
	cd web && bun run build
	cd cli && go build .

test:
	cd cli && go test ./...

fmt:
	cd cli && gofmt -w *.go

dev: run-web

tree:
	@echo "monorepo/"
	@echo "├── web (Next.js + Convex)"
	@echo "├── cli (standalone Go CLI)"
	@echo "├── libs"
	@echo "├── proto"
	@echo "└── infra"
