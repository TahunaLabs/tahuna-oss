#!/usr/bin/env bash
set -euo pipefail

OWNER="TahunaLabs"
REPO="tahuna-cli"
BINARY_NAME="tahuna"
DEFAULT_BIN_DIR="${HOME}/.local/bin"
CHANNELS_REPO_OWNER="TahunaLabs"
CHANNELS_REPO_NAME="tahuna-cli"
CHANNELS_CONFIG_PATH="releases/channels.conf"
DEFAULT_CHANNEL="stable"

VERSION=""
CHANNEL="${TAHUNA_RELEASE_CHANNEL:-$DEFAULT_CHANNEL}"
BIN_DIR="$DEFAULT_BIN_DIR"
MODIFY_PATH=true
CHANNELS_URL="${TAHUNA_CHANNELS_URL:-https://raw.githubusercontent.com/${CHANNELS_REPO_OWNER}/${CHANNELS_REPO_NAME}/main/${CHANNELS_CONFIG_PATH}}"

usage() {
  cat <<'EOF'
Install the Tahuna CLI from GitHub Releases.

Usage:
  install-tahuna.sh [--channel stable|nightly] [--version vX.Y.Z] [--bin-dir PATH]
  install-tahuna.sh --help

Options:
  --channel          Release channel to install from.
                     Default: stable
  --version          Install a specific release tag (for example: v0.1.0).
                     Overrides --channel when provided.
  --bin-dir          Destination directory for the tahuna binary.
                     Default: ~/.local/bin
  --no-modify-path   Do not modify shell profile to add bin dir to PATH.
  -h, --help         Show this help message.

Environment:
  TAHUNA_RELEASE_CHANNEL  Default channel override (stable|nightly)
  TAHUNA_CHANNELS_URL     Override channel config URL
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

resolve_channel_version() {
  local channel="$1"
  local config_path="$2"
  grep -E "^[[:space:]]*${channel}[[:space:]]*=" "$config_path" \
    || true
}

resolve_channel_version_value() {
  local channel="$1"
  local config_path="$2"
  resolve_channel_version "$channel" "$config_path" \
    | tail -n 1 \
    | cut -d '=' -f 2- \
    | tr -d '[:space:]'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      shift
      [[ $# -gt 0 ]] || die "missing value for --channel"
      CHANNEL="$1"
      ;;
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
    --no-modify-path)
      MODIFY_PATH=false
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

case "$CHANNEL" in
  stable|nightly) ;;
  *)
    die "unsupported channel: ${CHANNEL}. Supported: stable, nightly."
    ;;
esac

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

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

if [[ -z "$VERSION" ]]; then
  channels_path="${tmpdir}/channels.conf"
  info "Resolving channel ${CHANNEL}"
  download "$CHANNELS_URL" "$channels_path"
  VERSION="$(resolve_channel_version_value "$CHANNEL" "$channels_path")"
  [[ -n "$VERSION" ]] || die "could not resolve channel ${CHANNEL} from ${CHANNELS_URL}"
  info "Resolved ${CHANNEL} -> ${VERSION}"
fi

release_base="https://github.com/${OWNER}/${REPO}/releases/download/${VERSION}"
artifact_url="${release_base}/${artifact}"
checksums_url="${release_base}/checksums.txt"

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
    if [[ "$MODIFY_PATH" == "true" ]]; then
      path_line="export PATH=\"${BIN_DIR}:\$PATH\""
      block_open="# >>> tahuna >>>"
      block_close="# <<< tahuna <<<"
      path_block="${block_open}
${path_line}
${block_close}"

      shell_profile=""
      case "$(basename "${SHELL:-}")" in
        zsh)  shell_profile="${HOME}/.zshrc" ;;
        bash)
          if [[ -f "${HOME}/.bashrc" ]]; then
            shell_profile="${HOME}/.bashrc"
          else
            shell_profile="${HOME}/.profile"
          fi
          ;;
        fish) shell_profile="${HOME}/.config/fish/config.fish" ;;
        *)    shell_profile="${HOME}/.profile" ;;
      esac

      if [[ -n "$shell_profile" ]]; then
        if [[ -f "$shell_profile" ]] && grep -qF "$block_open" "$shell_profile" 2>/dev/null; then
          info "PATH already configured in ${shell_profile}"
        else
          echo >> "$shell_profile"
          echo "$path_block" >> "$shell_profile"
          info "Added ${BIN_DIR} to PATH in ${shell_profile}"
          echo "  Restart your shell or run: source ${shell_profile}"
        fi
      fi
    else
      echo
      echo "Note: ${BIN_DIR} is not in your PATH."
      echo "Add this to your shell profile:"
      echo "  export PATH=\"${BIN_DIR}:\$PATH\""
    fi
    ;;
esac
