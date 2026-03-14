ARG BASE_IMAGE
ARG WANDB_BASE_URL
ARG PREBAKE_FRAMEWORK
ARG PREBAKE_VERSION
ARG PREBAKE_PYTHON_VERSION
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
ARG PREBAKE_PYTHON_VERSION
ARG PREBAKE_PROTECTED_PACKAGES
ENV WANDB_BASE_URL=${WANDB_BASE_URL}
ENV UV_CACHE_DIR=/workspace/.uv-cache
ENV TAHUNA_PREBAKE_FRAMEWORK=${PREBAKE_FRAMEWORK}
ENV TAHUNA_PREBAKE_VERSION=${PREBAKE_VERSION}
ENV TAHUNA_PREBAKED_PYTHON_VERSION=${PREBAKE_PYTHON_VERSION}
ENV TAHUNA_PREBAKED_VENV=/opt/tahuna/venv
ENV TAHUNA_PREBAKED_PROTECTED_PACKAGES=${PREBAKE_PROTECTED_PACKAGES}
ENV TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE=/opt/tahuna/protected-package-versions.json
RUN python3 -m pip install --no-cache-dir uv \
    && uv python install "${PREBAKE_PYTHON_VERSION}" \
    && mkdir -p /opt/tahuna \
    && uv venv --python "${PREBAKE_PYTHON_VERSION}" --system-site-packages "${TAHUNA_PREBAKED_VENV}" \
    && printf '%s\n' "${TAHUNA_PREBAKED_PROTECTED_PACKAGES}" > /opt/tahuna/protected-packages.csv \
    && "${TAHUNA_PREBAKED_VENV}/bin/python" - <<'PY'
import importlib.metadata as metadata
import json
import os

packages = [pkg.strip() for pkg in os.environ.get("TAHUNA_PREBAKED_PROTECTED_PACKAGES", "").split(",") if pkg.strip()]
versions = {}
for pkg in packages:
    try:
        versions[pkg.lower()] = metadata.version(pkg)
    except metadata.PackageNotFoundError:
        continue

target = os.environ.get("TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE", "/opt/tahuna/protected-package-versions.json")
with open(target, "w", encoding="utf-8") as handle:
    json.dump(versions, handle, sort_keys=True)
PY
COPY --from=warden-builder /out/warden /usr/local/bin/warden
RUN chmod +x /usr/local/bin/warden
