#!/usr/bin/env bash
set -euo pipefail
TARGET_PATH=${1:-tools/app-shell/src}
JSCODESHIFT_CMD="npx jscodeshift -t ./scripts/add-data-testid.cjs $TARGET_PATH --extensions=jsx --parser=babel --ignore-pattern='**/node_modules/**' --ignore-pattern='**/dist/**' -d -p"
echo "Running data-testid codemod dry-run on: $TARGET_PATH"
OUTPUT=$(eval "$JSCODESHIFT_CMD" 2>&1) || RC=$?
RC=${RC:-0}
printf "%s\n" "$OUTPUT"
ERRORS=$(printf "%s" "$OUTPUT" | grep -Eo "^[[:space:]]*[0-9]+[[:space:]]+errors" | grep -Eo "[0-9]+" | head -n1 || true)
OK_COUNT=$(printf "%s" "$OUTPUT" | grep -Eo "^[[:space:]]*[0-9]+[[:space:]]+ok" | grep -Eo "[0-9]+" | head -n1 || true)
ERRORS=${ERRORS:-0}
OK_COUNT=${OK_COUNT:-0}
if [ "$ERRORS" -gt 0 ]; then echo "Errors detected."; exit 2; fi
if [ "$OK_COUNT" -gt 0 ]; then echo "Codemod would modify $OK_COUNT files."; exit 1; fi
echo "No modifications detected."
exit 0
