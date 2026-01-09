#!/bin/bash
# Build and push templates from images.json
# Usage: ./build.sh <dockerhub-username>

set -e

USER=${1:?Usage: ./build.sh <dockerhub-username>}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read images.json and build each
jq -r 'to_entries[] | .key as $fw | .value | to_entries[] | "\($fw)-\(.key) \(.value)"' "$SCRIPT_DIR/images.json" | \
while read -r TAG BASE; do
    FULL_TAG="$USER/tahuna:$TAG"
    echo "Building $FULL_TAG from $BASE..."
    docker buildx build --platform linux/amd64 \
        --build-arg BASE_IMAGE="$BASE" \
        -t "$FULL_TAG" \
        --push "$SCRIPT_DIR"
done

echo "Done!"
