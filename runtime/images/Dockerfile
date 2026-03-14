ARG BASE_IMAGE
ARG WANDB_BASE_URL
ARG PREBAKE_FRAMEWORK
ARG PREBAKE_VERSION
ARG PREBAKE_PROTECTED_PACKAGES

FROM golang:1.22-alpine AS warden-builder
WORKDIR /src/runtime/warden
COPY runtime/warden/go.mod ./go.mod
COPY runtime/warden ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/warden ./cmd/warden

FROM ${BASE_IMAGE}
ARG WANDB_BASE_URL
ARG PREBAKE_FRAMEWORK
ARG PREBAKE_VERSION
ARG PREBAKE_PROTECTED_PACKAGES
ENV WANDB_BASE_URL=${WANDB_BASE_URL}
ENV UV_CACHE_DIR=/workspace/.uv-cache
ENV TAHUNA_PREBAKE_FRAMEWORK=${PREBAKE_FRAMEWORK}
ENV TAHUNA_PREBAKE_VERSION=${PREBAKE_VERSION}
ENV TAHUNA_PREBAKED_VENV=/opt/tahuna/venv
ENV TAHUNA_PREBAKED_PROTECTED_PACKAGES=${PREBAKE_PROTECTED_PACKAGES}
RUN python3 -m pip install --no-cache-dir uv \
    && mkdir -p /opt/tahuna \
    && uv venv --system-site-packages "${TAHUNA_PREBAKED_VENV}" \
    && printf '%s\n' "${TAHUNA_PREBAKED_PROTECTED_PACKAGES}" > /opt/tahuna/protected-packages.csv
COPY --from=warden-builder /out/warden /usr/local/bin/warden
RUN chmod +x /usr/local/bin/warden
