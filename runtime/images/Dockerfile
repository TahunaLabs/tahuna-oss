ARG BASE_IMAGE
ARG WANDB_BASE_URL

FROM golang:1.22-alpine AS warden-builder
WORKDIR /src/runtime/warden
COPY runtime/warden/go.mod ./go.mod
COPY runtime/warden ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/warden ./cmd/warden

FROM ${BASE_IMAGE}
ENV WANDB_BASE_URL=${WANDB_BASE_URL}
COPY --from=warden-builder /out/warden /usr/local/bin/warden
RUN chmod +x /usr/local/bin/warden
