#!/usr/bin/env bash
set -euo pipefail

OWNER="Pazuzzu"
REPO="tahuna-cli"
BINARY_NAME="tahuna"
DEFAULT_BIN_DIR="${HOME}/.local/bin"

VERSION=""
BIN_DIR="$DEFAULT_BIN_DIR"

usage() {
  cat <<'EOF'
Install the Tahuna CLI from GitHub Releases.

Usage:
  install-tahuna.sh [--version vX.Y.Z] [--bin-dir PATH]
  install-tahuna.sh --help

Options:
  --version   Install a specific release tag (for example: v0.1.1).
              Defaults to the latest release.
  --bin-dir   Destination directory for the tahuna binary.
              Default: ~/.local/bin
  -h, --help  Show this help message.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

download() {
  local url="$1"
  local output="$2"
  curl -fsSL --retry 3 --retry-delay 1 --connect-timeout 10 -o "$output" "$url"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      shift
      [[ $# -gt 0 ]] || die "missing value for --version"
      VERSION="$1"
      ;;
    --bin-dir)
      shift
      [[ $# -gt 0 ]] || die "missing value for --bin-dir"
      BIN_DIR="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
  shift
done

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$os" in
  darwin|linux) ;;
  *)
    die "unsupported OS: ${os}. Supported: darwin, linux."
    ;;
esac

raw_arch="$(uname -m)"
case "$raw_arch" in
  x86_64|amd64)
    arch="amd64"
    ;;
  arm64|aarch64)
    arch="arm64"
    ;;
  *)
    die "unsupported architecture: ${raw_arch}."
    ;;
esac

if [[ "$os" == "linux" && "$arch" == "arm64" ]]; then
  die "linux/arm64 is not supported yet. Please use linux/amd64."
fi

artifact="${BINARY_NAME}_${os}_${arch}.tar.gz"

if [[ -n "$VERSION" ]]; then
  release_base="https://github.com/${OWNER}/${REPO}/releases/download/${VERSION}"
else
  release_base="https://github.com/${OWNER}/${REPO}/releases/latest/download"
fi

artifact_url="${release_base}/${artifact}"
checksums_url="${release_base}/checksums.txt"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

archive_path="${tmpdir}/${artifact}"
checksums_path="${tmpdir}/checksums.txt"

info "Downloading ${artifact}"
download "$artifact_url" "$archive_path"

info "Downloading checksums.txt"
download "$checksums_url" "$checksums_path"

expected_checksum="$(awk -v file="$artifact" '$2 == file { print $1 }' "$checksums_path" | head -n 1)"
[[ -n "$expected_checksum" ]] || die "could not find checksum for ${artifact} in checksums.txt"

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$archive_path" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
else
  die "no SHA256 tool found (need sha256sum or shasum)"
fi

[[ "$actual_checksum" == "$expected_checksum" ]] || die "checksum mismatch for ${artifact}"

info "Extracting archive"
tar -xzf "$archive_path" -C "$tmpdir"
[[ -f "${tmpdir}/${BINARY_NAME}" ]] || die "archive did not contain ${BINARY_NAME}"

mkdir -p "$BIN_DIR"
install -m 0755 "${tmpdir}/${BINARY_NAME}" "${BIN_DIR}/${BINARY_NAME}"

echo
echo "Installed ${BINARY_NAME} to ${BIN_DIR}/${BINARY_NAME}"
"${BIN_DIR}/${BINARY_NAME}" version || true

case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *)
    echo
    echo "Note: ${BIN_DIR} is not in your PATH."
    echo "Add this to your shell profile:"
    echo "  export PATH=\"${BIN_DIR}:\$PATH\""
    ;;
esac
