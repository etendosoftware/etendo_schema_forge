#!/usr/bin/env bash
#
# Boots a freshly built report-server image and asserts it actually carries the
# artifacts currently in this working tree.
#
# WHY A CHECKSUM COMPARISON AND NOT A GREP
# ----------------------------------------
# The failure this guards against is silent staleness: the deployed image kept
# rendering April 2026 templates for months while the sidebar — served from a
# separate, always-fresh S3 manifest — showed the current contract, so nothing
# looked broken until someone opened a report and compared it against local.
# Grepping for known-stale markers only catches the one drift we already know
# about. Comparing every template/contract byte-for-byte against the working
# tree catches any drift, including the next one.
#
# Usage: ./scripts/verify-report-server-image.sh [image-tag]
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:-report-server:local}"
CONTAINER="report-server-verify-$$"
PORT="${VERIFY_PORT:-3011}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo ">> booting $IMAGE"
docker run -d --name "$CONTAINER" -p "$PORT:3001" "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/reports" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done

if [ "$ready" != "1" ]; then
  echo "ERROR: container never answered GET /api/reports. Startup log:" >&2
  docker logs "$CONTAINER" 2>&1 | tail -30 >&2
  exit 1
fi

count="$(curl -s "http://localhost:$PORT/api/reports" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
if [ "$count" -lt 1 ]; then
  echo "ERROR: the report catalog is empty — artifacts/ did not make it into the image." >&2
  exit 1
fi
echo ">> catalog served: $count reports"

# Every artifact file the renderer reads must be byte-identical to this tree.
drift=0
checked=0
while IFS= read -r local_path; do
  rel="${local_path#"$REPO_ROOT"/}"
  local_sum="$(shasum -a 256 "$local_path" | cut -d' ' -f1)"
  image_sum="$(docker exec "$CONTAINER" sha256sum "/app/$rel" 2>/dev/null | cut -d' ' -f1 || true)"
  checked=$((checked + 1))
  if [ -z "$image_sum" ]; then
    echo "STALE: missing in image -> $rel" >&2
    drift=1
  elif [ "$local_sum" != "$image_sum" ]; then
    echo "STALE: differs from working tree -> $rel" >&2
    drift=1
  fi
done < <(find "$REPO_ROOT/artifacts" -mindepth 2 \
           \( -name 'template*.hbs' -o -name 'report-contract.json' -o -name 'helpers.js' \) )

if [ "$drift" != "0" ]; then
  echo "ERROR: the image does not carry the current artifacts. Rebuild the context." >&2
  exit 1
fi

echo ">> $checked artifact files verified identical to the working tree"
echo ">> report-server image OK"
