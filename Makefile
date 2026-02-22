.PHONY: web backend worker cli build test fmt dev tree

web:
	cd apps/web && npm run dev

backend:
	cd apps/backend && go run .

worker:
	cd apps/worker && go run .

cli:
	cd cli && go run .

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

dev: backend

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
