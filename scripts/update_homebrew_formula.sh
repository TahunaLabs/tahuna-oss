#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <tag> <checksums-file>" >&2
  exit 1
fi

TAG="$1"
CHECKSUMS_FILE="$2"
FORMULA_PATH="Formula/tahuna.rb"

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "tag must look like vX.Y.Z (got: $TAG)" >&2
  exit 1
fi

if [[ ! -f "$CHECKSUMS_FILE" ]]; then
  echo "checksums file not found: $CHECKSUMS_FILE" >&2
  exit 1
fi

if [[ ! -f "$FORMULA_PATH" ]]; then
  echo "formula not found: $FORMULA_PATH" >&2
  exit 1
fi

VERSION="${TAG#v}"

darwin_arm64_sha="$(awk '$2 ~ /tahuna_darwin_arm64\.tar\.gz$/ {print $1}' "$CHECKSUMS_FILE")"
darwin_amd64_sha="$(awk '$2 ~ /tahuna_darwin_amd64\.tar\.gz$/ {print $1}' "$CHECKSUMS_FILE")"
linux_amd64_sha="$(awk '$2 ~ /tahuna_linux_amd64\.tar\.gz$/ {print $1}' "$CHECKSUMS_FILE")"

if [[ -z "$darwin_arm64_sha" || -z "$darwin_amd64_sha" || -z "$linux_amd64_sha" ]]; then
  echo "missing one or more required checksums in $CHECKSUMS_FILE" >&2
  exit 1
fi

perl -0777 -i -pe '
  s/version "\d+\.\d+\.\d+"/version "'"$VERSION"'"/g;
  s|(url ".*/tahuna_darwin_arm64\.tar\.gz"\n\s+sha256 ")[^"]+|$1'"$darwin_arm64_sha"'|g;
  s|(url ".*/tahuna_darwin_amd64\.tar\.gz"\n\s+sha256 ")[^"]+|$1'"$darwin_amd64_sha"'|g;
  s|(url ".*/tahuna_linux_amd64\.tar\.gz"\n\s+sha256 ")[^"]+|$1'"$linux_amd64_sha"'|g;
' "$FORMULA_PATH"

echo "updated $FORMULA_PATH to version $VERSION"
