#!/usr/bin/env bash
# Run the previous Playwright failures, or an explicit integration file set.
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -n "${E2E_FILES:-}" ]; then
  E2E_SUITE=integration exec "$REPO_DIR/scripts/run-e2e-full.sh"
else
  LAST_RUN_FILE="$REPO_DIR/e2e/test-results/.last-run.json"
  if [ ! -f "$LAST_RUN_FILE" ]; then
    echo "No Playwright last-run report found at $LAST_RUN_FILE." >&2
    echo "Run an E2E suite first, then retry with make test-e2e-last-failed." >&2
    exit 1
  fi
  E2E_SUITE=integration E2E_LAST_FAILED=1 exec "$REPO_DIR/scripts/run-e2e-full.sh"
fi
