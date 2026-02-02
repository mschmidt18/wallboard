#!/usr/bin/env bash
#
# Docker-based install.sh test runner
#
# Usage:
#   ./test-docker.sh                  # basic test (no display packages)
#   ./test-docker.sh --with-display   # includes Chromium/X install
#

set -e

IMAGE_NAME="wallboard-test"
CONTAINER_NAME="wallboard-test-run"

# Parse flags
INSTALL_FLAGS="--test"
for arg in "$@"; do
    case "$arg" in
        --with-display)
            INSTALL_FLAGS="--test --with-display"
            ;;
        *)
            echo "Unknown flag: $arg"
            echo "Usage: $0 [--with-display]"
            exit 1
            ;;
    esac
done

echo ""
echo "=== Building wallboard install test image ==="
echo "    INSTALL_FLAGS: $INSTALL_FLAGS"
echo ""

docker build \
    -f Dockerfile.test \
    --build-arg INSTALL_FLAGS="$INSTALL_FLAGS" \
    -t "$IMAGE_NAME" \
    .

echo ""
echo "=== Running verification tests ==="
echo ""

# Remove any previous test container
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

if docker run --name "$CONTAINER_NAME" "$IMAGE_NAME"; then
    echo ""
    echo "=== ALL TESTS PASSED ==="
    docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1
else
    EXIT_CODE=$?
    echo ""
    echo "=== TESTS FAILED (exit code: $EXIT_CODE) ==="
    echo ""
    echo "Container '$CONTAINER_NAME' preserved for debugging."
    echo "  Inspect: docker exec -it $CONTAINER_NAME /bin/bash"
    echo "  Remove:  docker rm -f $CONTAINER_NAME"
    exit "$EXIT_CODE"
fi
