#!/usr/bin/env bash
set -euo pipefail
TARGET_PATH=${1:-tools/app-shell/src}
COMMIT_FLAG=${2:-}
JSCODESHIFT_CMD="npx jscodeshift -t ./scripts/add-data-testid.cjs $TARGET_PATH --extensions=jsx --parser=babel --ignore-pattern='**/node_modules/**' --ignore-pattern='**/dist/**'"
echo "Applying data-testid codemod to: $TARGET_PATH"
eval "$JSCODESHIFT_CMD"
if git rev-parse --git-dir >/dev/null 2>&1; then
  CHANGED=$(git status --porcelain)
  if [ -n "$CHANGED" ]; then
    echo "Files modified:"; git --no-pager status --short
    if [ "$COMMIT_FLAG" = "--commit" ]; then
      git add -A
      git commit -m "Feature ETP-4208: Apply data-testid codemod"
      echo "Changes committed."
    else
      echo "Changes staged. Commit manually or re-run with --commit."
    fi
  else echo "No files changed."; fi
fi
