.PHONY: web backend provisioner cli build test fmt dev tree

web:
	cd apps/web && npm run dev

backend:
	cd apps/backend && go run .

provisioner:
	@if [ -z "$(ARGS)" ]; then \
		echo "usage: make provisioner ARGS='<subcommand and flags>'"; \
		echo "example: make provisioner ARGS='terminate --pod-id <pod_id>'"; \
		echo "subcommands: launch | wait-running | wait-completion | terminate"; \
	else \
		cd apps/provisioner && go run . $(ARGS); \
	fi

cli:
	cd cli && go run .

build:
	cd apps/backend && go build .
	cd apps/provisioner && go build .
	cd cli && go build .

test:
	cd apps/backend && go test ./...
	cd apps/provisioner && go test ./...
	cd cli && go test ./...

fmt:
	cd apps/backend && gofmt -w *.go
	cd apps/provisioner && gofmt -w *.go
	cd cli && gofmt -w *.go

dev: backend

tree:
	@echo "monorepo/"
	@echo "├── apps/"
	@echo "│   ├── web"
	@echo "│   ├── backend"
	@echo "│   └── provisioner"
	@echo "├── cli"
	@echo "├── libs"
	@echo "├── proto"
	@echo "└── infra"
