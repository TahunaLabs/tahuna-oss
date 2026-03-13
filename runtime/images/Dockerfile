ARG BASE_IMAGE

FROM golang:1.22-alpine AS warden-builder
WORKDIR /src/runtime/warden
COPY runtime/warden/go.mod ./go.mod
COPY runtime/warden ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/warden ./cmd/warden

FROM ${BASE_IMAGE}
COPY --from=warden-builder /out/warden /usr/local/bin/warden
COPY monitor/tahuna /opt/tahuna-monitor/tahuna
COPY monitor/wandb /opt/tahuna-monitor/wandb
RUN chmod +x /usr/local/bin/warden
ENV PYTHONPATH=/opt/tahuna-monitor:${PYTHONPATH}
