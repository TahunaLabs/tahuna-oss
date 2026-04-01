ARG BASE_IMAGE
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
ARG PREBAKE_FRAMEWORK
ARG PREBAKE_VERSION
ARG PREBAKE_PYTHON_VERSION
ARG PREBAKE_PROTECTED_PACKAGES
ENV TAHUNA_PREBAKE_FRAMEWORK=${PREBAKE_FRAMEWORK}
ENV TAHUNA_PREBAKE_VERSION=${PREBAKE_VERSION}
ENV TAHUNA_PREBAKED_PYTHON_VERSION=${PREBAKE_PYTHON_VERSION}
ENV TAHUNA_PREBAKED_VENV=/opt/tahuna/venv
ENV TAHUNA_PREBAKED_PROTECTED_PACKAGES=${PREBAKE_PROTECTED_PACKAGES}
ENV TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE=/opt/tahuna/protected-package-versions.json
ENV UV_CACHE_DIR=/opt/tahuna/.uv-cache
RUN python3 -m pip install --no-cache-dir uv \
    && uv python install "${PREBAKE_PYTHON_VERSION}" \
    && mkdir -p /opt/tahuna \
    && uv venv --python "${PREBAKE_PYTHON_VERSION}" "${TAHUNA_PREBAKED_VENV}" \
    && printf '%s\n' "${TAHUNA_PREBAKED_PROTECTED_PACKAGES}" > /opt/tahuna/protected-packages.csv \
    && FW_VER="${PREBAKE_VERSION%%-*}" \
    && CUDA_TAG="${PREBAKE_VERSION##*-}" \
    && uv pip install \
    --no-cache \
    --python "${TAHUNA_PREBAKED_VENV}/bin/python" \
    --extra-index-url "https://download.pytorch.org/whl/${CUDA_TAG}" \
    "torch==${FW_VER}" torchvision torchaudio triton
COPY runtime/images/prebake/detect-versions.py /tmp/detect-versions.py
RUN "${TAHUNA_PREBAKED_VENV}/bin/python" /tmp/detect-versions.py && rm /tmp/detect-versions.py
COPY --from=warden-builder /out/warden /usr/local/bin/warden
RUN chmod +x /usr/local/bin/warden
