#!/usr/bin/env bash
#
# Assembles the Docker build context for the `report-server` image.
#
# WHY THIS EXISTS
# ---------------
# `report-server` renders the HTML/PDF/XLSX/CSV output behind
# `POST /api/reports/:id/render`. It needs two halves that, since the
# 2026-07-01 repo split, live in DIFFERENT repositories:
#
#   * the server itself (server.js, its package.json, the shared report
#     helpers and the report descriptor) -> schema_forge_core
#   * the per-report artifacts it renders (artifacts/<id>/template.hbs,
#     report-contract.json, helpers.js)                -> this repo
#
# Neither repo can `docker build` on its own: schema_forge_core has no real
# artifacts/ (only two stray test fixtures), and this repo has no
# tools/report-server/. Because nothing reassembled the two halves, the
# deployed image stayed frozen on the artifacts baked into it in April 2026,
# so every server-rendered report silently kept its April template while the
# sidebar — served from a separate, always-fresh S3 manifest — showed the
# current contract. This script is the missing half of that build.
#
# TEMPLATE PRECEDENCE (do not reorder)
# ------------------------------------
# Both repos ship a `templates/reports/` tree and they are NOT identical:
# this repo's `report-html-helpers.js` carries the ETP-4898 "-0,00" guard and
# its `base.css` carries the tfoot padding / numeric header alignment fixes;
# the core's copy predates both. `server.js` imports the helpers and reads
# base.css from the assembled tree, so this repo's copy MUST land last and win.
# Copying the core's templates/ after this repo's would silently reintroduce
# an already-fixed rendering bug.
#
# USAGE
#   ./scripts/assemble-report-server-context.sh <output-dir> [--clean]
#   CORE_DIR=/path/to/schema_forge_core ./scripts/assemble-report-server-context.sh /tmp/ctx
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="${CORE_DIR:-$REPO_ROOT/../schema_forge_core}"

OUT_DIR="${1:-}"
CLEAN=0
for arg in "${@:2}"; do
  [ "$arg" = "--clean" ] && CLEAN=1
done

if [ -z "$OUT_DIR" ]; then
  echo "Usage: $0 <output-dir> [--clean]" >&2
  echo "       CORE_DIR=<path to schema_forge_core> may override the default (../schema_forge_core)" >&2
  exit 2
fi

if [ ! -d "$CORE_DIR/tools/report-server" ]; then
  echo "ERROR: schema_forge_core checkout not found at: $CORE_DIR" >&2
  echo "       Expected \$CORE_DIR/tools/report-server to exist." >&2
  echo "       Set CORE_DIR to a schema_forge_core checkout and retry." >&2
  exit 1
fi

# Files pulled from schema_forge_core. Paths are relative to each repo root and
# are reproduced verbatim in the context, because the Dockerfile COPYs them by
# these exact paths.
CORE_FILES=(
  "tools/report-server/package.json"
  "tools/report-server/server.js"
  "tools/report-server/Dockerfile"
  "cli/src/report-descriptor.js"
  "cli/src/extract-from-jasper.js"
)

for rel in "${CORE_FILES[@]}"; do
  if [ ! -f "$CORE_DIR/$rel" ]; then
    echo "ERROR: missing in schema_forge_core: $rel" >&2
    exit 1
  fi
done

if [ ! -d "$REPO_ROOT/artifacts" ] || [ -z "$(find "$REPO_ROOT/artifacts" -mindepth 2 -name report-contract.json -print -quit)" ]; then
  echo "ERROR: no report artifacts found under $REPO_ROOT/artifacts" >&2
  echo "       Expected at least one artifacts/<id>/report-contract.json." >&2
  exit 1
fi

if [ "$CLEAN" = "1" ] && [ -d "$OUT_DIR" ]; then
  rm -rf "$OUT_DIR"
fi
mkdir -p "$OUT_DIR"

echo ">> assembling report-server build context"
echo "   core:   $CORE_DIR"
echo "   local:  $REPO_ROOT"
echo "   output: $OUT_DIR"

# 1. Core halves first.
for rel in "${CORE_FILES[@]}"; do
  mkdir -p "$OUT_DIR/$(dirname "$rel")"
  cp "$CORE_DIR/$rel" "$OUT_DIR/$rel"
done

# 2. This repo's artifacts and templates last — see TEMPLATE PRECEDENCE above.
rm -rf "$OUT_DIR/artifacts" "$OUT_DIR/templates"
cp -R "$REPO_ROOT/artifacts" "$OUT_DIR/artifacts"
cp -R "$REPO_ROOT/templates" "$OUT_DIR/templates"

# 3. Drift guard.
#
# server.js reaches out of its own directory with `../../` imports. Every such
# import has to be COPYd by the Dockerfile, and that pairing has already
# drifted once: ETP-4899 added the `../../cli/src/report-descriptor.js` import
# on 2026-08-20, while the Dockerfile has not changed since 2026-04-16. A
# missing module there is a load-time crash, so the container would not even
# start. Fail here, at assembly time, with a message that names the file —
# rather than in a container log nobody reads.
missing=0
while IFS= read -r rel; do
  resolved="$(cd "$OUT_DIR/tools/report-server" 2>/dev/null && cd "$(dirname "$rel")" 2>/dev/null && pwd)/$(basename "$rel")" || resolved=""
  if [ -z "$resolved" ] || [ ! -f "$resolved" ]; then
    echo "ERROR: server.js imports '$rel' but it is not present in the context." >&2
    echo "       Add it to CORE_FILES in this script AND to the COPY lines in" >&2
    echo "       schema_forge_core/tools/report-server/Dockerfile." >&2
    missing=1
  fi
done < <(grep -oE "from '(\.\./)+[^']+'" "$OUT_DIR/tools/report-server/server.js" | sed "s/^from '//; s/'$//")

[ "$missing" = "0" ] || exit 1

reports="$(find "$OUT_DIR/artifacts" -mindepth 2 -name report-contract.json | wc -l | tr -d ' ')"
echo ">> context ready — $reports report contracts, templates from $REPO_ROOT"
