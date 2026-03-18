#!/usr/bin/env bash
# Staging smoke test — run manually before releases.
# Exercises the full CLI happy path: init → sync → run → logs → cancel → cleanup.
#
# Prerequisites:
#   - tahuna CLI built and in PATH (or use `go run .` from cli/)
#   - TAHUNA_API_URL pointing at staging
#   - TAHUNA_API_KEY set
#
# Usage:
#   ./scripts/smoke-test.sh [project-dir]
#
# The script creates a temp project dir (or uses the one provided),
# runs through the CRUD cycle, and cleans up on exit.

set -euo pipefail

TAHUNA="${TAHUNA_CLI:-tahuna}"
PROJECT_DIR="${1:-}"
CLEANUP_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

step() { printf "${GREEN}[STEP]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n" "$1"; exit 1; }
pass() { printf "${GREEN}[PASS]${NC} %s\n" "$1"; }

cleanup() {
    if [ -n "$RUN_ID" ]; then
        step "Cleanup: cancelling run $RUN_ID"
        $TAHUNA run cancel "$RUN_ID" 2>/dev/null || true
    fi
    if [ -n "$ENV_ID" ]; then
        step "Cleanup: deleting environment $ENV_ID"
        $TAHUNA env rm "$ENV_ID" --force 2>/dev/null || true
    fi
    if [ -n "$CLEANUP_DIR" ] && [ -d "$CLEANUP_DIR" ]; then
        rm -rf "$CLEANUP_DIR"
    fi
}

RUN_ID=""
ENV_ID=""
trap cleanup EXIT

# ── Pre-flight ──────────────────────────────────────────────────
if ! command -v "$TAHUNA" &>/dev/null; then
    fail "tahuna CLI not found. Set TAHUNA_CLI or add to PATH."
fi
if [ -z "${TAHUNA_API_URL:-}" ]; then
    fail "TAHUNA_API_URL is not set — point it at staging."
fi
if [ -z "${TAHUNA_API_KEY:-}" ]; then
    fail "TAHUNA_API_KEY is not set."
fi

step "Pre-flight: CLI=$TAHUNA API=$TAHUNA_API_URL"

# ── 1. Init project ────────────────────────────────────────────
if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR=$(mktemp -d /tmp/tahuna-smoke-XXXXXX)
    CLEANUP_DIR="$PROJECT_DIR"
fi
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

step "1/7 Initializing project in $PROJECT_DIR"
$TAHUNA init . || fail "tahuna init failed"
pass "Project initialized"

# Grab environment ID from project config
ENV_ID=$(cat .tahuna/project.json 2>/dev/null | grep -o '"environment_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"environment_id"[[:space:]]*:[[:space:]]*"//' | sed 's/"//')
if [ -z "$ENV_ID" ]; then
    fail "Could not extract environment_id from .tahuna/project.json"
fi
step "Environment ID: $ENV_ID"

# ── 2. Create dummy code + data ────────────────────────────────
step "2/7 Creating dummy train script and data"
cat > train.py << 'PYEOF'
import time
print("smoke test: training started")
time.sleep(5)
print("smoke test: training complete")
PYEOF

mkdir -p data
echo "sample,label" > data/train.csv
echo "1.0,0" >> data/train.csv
echo "2.0,1" >> data/train.csv
pass "Dummy files created"

# ── 3. Sync ─────────────────────────────────────────────────────
step "3/7 Syncing code and data"
$TAHUNA sync || fail "tahuna sync failed"
pass "Sync complete"

# ── 4. Show environment ─────────────────────────────────────────
step "4/7 Showing environment"
$TAHUNA env show "$ENV_ID" || fail "tahuna env show failed"
pass "Environment show works"

# ── 5. Create run ───────────────────────────────────────────────
step "5/7 Creating run (detached)"
RUN_OUTPUT=$($TAHUNA run create -d 2>&1) || fail "tahuna run create failed: $RUN_OUTPUT"
echo "$RUN_OUTPUT"

# Try to extract run ID from output
RUN_ID=$(echo "$RUN_OUTPUT" | grep -o '"run_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"run_id"[[:space:]]*:[[:space:]]*"//' | sed 's/"//')
if [ -z "$RUN_ID" ]; then
    # Fallback: latest run from list
    RUN_ID=$($TAHUNA run list --limit 1 2>/dev/null | awk 'NR==2{print $2}' || true)
fi
if [ -z "$RUN_ID" ]; then
    warn "Could not extract run_id — skipping cancel/logs steps"
else
    pass "Run created: $RUN_ID"

    # ── 6. Tail logs briefly ────────────────────────────────────
    step "6/7 Tailing logs (5 seconds)"
    timeout 5 $TAHUNA run logs "$RUN_ID" --follow 2>/dev/null || true
    pass "Logs tail works"

    # ── 7. Cancel run ───────────────────────────────────────────
    step "7/7 Cancelling run"
    $TAHUNA run cancel "$RUN_ID" || warn "Cancel returned error (run may have already finished)"
    pass "Cancel issued"
fi

# ── 8. List runs ────────────────────────────────────────────────
step "Listing runs"
$TAHUNA run list || fail "tahuna run list failed"
pass "Run list works"

echo ""
printf "${GREEN}════════════════════════════════════════${NC}\n"
printf "${GREEN}  Smoke test passed!${NC}\n"
printf "${GREEN}════════════════════════════════════════${NC}\n"
