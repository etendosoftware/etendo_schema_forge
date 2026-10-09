#!/usr/bin/env bash
# mcp-usage-dump.sh
#
# Export the MCP usage telemetry table (ETGO_MCP_USAGE) from a deployed Etendo
# instance, and optionally mark the exported rows as reviewed.
#
# The instance is named by a remote-connection profile
# (~/.config/schema-forge/remote/<name>.env: SSH_HOST + GRADLE_PROPERTIES, the
# path of gradle.properties on that host) or by a bare SSH alias. The script
# reads that host's own gradle.properties for the DB credentials and runs psql
# there, so no credential ever travels to this machine or into a shell history
# (see CLAUDE.md: "Do NOT hardcode DB credentials"). Connection logic:
# scripts/lib/remote-etendo-psql.sh.
#
#   scripts/mcp-usage-dump.sh production
#   scripts/mcp-usage-dump.sh etendo-go-production --mark-reviewed
#
# REVIEWED = isactive 'N'
# ------------------------
# The table has no review column, so `isactive` is repurposed as one: the writer
# (McpUsageLogger) always inserts 'Y' and nothing in the module ever reads the
# column back, so flipping it to 'N' is inert for the runtime. It is a
# convention, not a constraint — if the table is ever surfaced as an AD window,
# the standard grid hides 'N' rows and anyone can flip them back.
#
# --mark-reviewed marks EXACTLY the rows it exported, in the same statement that
# reads them (UPDATE ... RETURNING), so a row can never be marked without having
# been written to the output file. If the file write fails, rerun with
# --include-reviewed to get them back.
#
# Output is JSONL — one JSON object per line, ordered by creation time. The
# `payload` column stays a string (it is JSON only on feedback rows); parse it
# with:  jq -r 'select(.row_type=="feedback") | .payload | fromjson'
#
# Usage:
#     scripts/mcp-usage-dump.sh [options] <profile|ssh-host>
#
# Options:
#     --mark-reviewed       Mark every exported row isactive='N' (writes to the DB)
#     --include-reviewed    Also export rows already marked reviewed (default: only unreviewed)
#     --since <date>        Only rows created on/after this date (YYYY-MM-DD)
#     --until <date>        Only rows created BEFORE this date (YYYY-MM-DD)
#     --row-type <type>     tool_call | feedback
#     --limit <n>           Export at most n rows (oldest first)
#     --out <file>          Output file (default mcp-usage/<host>-<timestamp>.jsonl)
#     --gradle-properties <path>  gradle.properties on the host (overrides the profile;
#                           default /opt/EtendoERP/gradle.properties)
#     --etendo-root <path>  Same, given as the Etendo directory
#     --count               Only report how many rows match; export nothing, write nothing
#     --yes                 Do not prompt before --mark-reviewed
#     -h, --help            This help

set -euo pipefail

# Dumps default into the repo's gitignored mcp-usage/ folder, whatever the cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET=""
GRADLE_OVERRIDE=""
OUT=""
MARK_REVIEWED=0
INCLUDE_REVIEWED=0
COUNT_ONLY=0
ASSUME_YES=0
SINCE=""
UNTIL=""
ROW_TYPE=""
LIMIT=""

die() { printf 'mcp-usage-dump: %s\n' "$1" >&2; exit 1; }
usage() { sed -n '3,51p' "$0" | sed 's/^# \{0,1\}//'; }

need_value() { [[ -n "${2:-}" ]] || die "$1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mark-reviewed)    MARK_REVIEWED=1; shift ;;
    --include-reviewed) INCLUDE_REVIEWED=1; shift ;;
    --count)            COUNT_ONLY=1; shift ;;
    --yes|-y)           ASSUME_YES=1; shift ;;
    --since)            need_value "$1" "${2:-}"; SINCE="$2"; shift 2 ;;
    --until)            need_value "$1" "${2:-}"; UNTIL="$2"; shift 2 ;;
    --row-type)         need_value "$1" "${2:-}"; ROW_TYPE="$2"; shift 2 ;;
    --limit)            need_value "$1" "${2:-}"; LIMIT="$2"; shift 2 ;;
    --out)              need_value "$1" "${2:-}"; OUT="$2"; shift 2 ;;
    --gradle-properties) need_value "$1" "${2:-}"; GRADLE_OVERRIDE="$2"; shift 2 ;;
    --etendo-root)      need_value "$1" "${2:-}"; GRADLE_OVERRIDE="${2%/}/gradle.properties"; shift 2 ;;
    -h|--help)          usage; exit 0 ;;
    -*)                 die "unknown option: $1 (try --help)" ;;
    *)                  [[ -z "$TARGET" ]] || die "only one profile/ssh host is accepted"; TARGET="$1"; shift ;;
  esac
done

[[ -n "$TARGET" ]] || { usage; exit 1; }

# shellcheck source=lib/remote-etendo-psql.sh
source "$REPO_ROOT/scripts/lib/remote-etendo-psql.sh"
resolve_remote_target "$TARGET" "$GRADLE_OVERRIDE" || die "cannot resolve target '$TARGET'"
[[ -z "$ROW_TYPE" || "$ROW_TYPE" == "tool_call" || "$ROW_TYPE" == "feedback" ]] \
  || die "--row-type must be tool_call or feedback"
[[ -z "$LIMIT" || "$LIMIT" =~ ^[1-9][0-9]*$ ]] || die "--limit must be a positive integer"
for d in "$SINCE" "$UNTIL"; do
  [[ -z "$d" || "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "dates must be YYYY-MM-DD (got '$d')"
done
[[ $MARK_REVIEWED -eq 1 && $COUNT_ONLY -eq 1 ]] && die "--count and --mark-reviewed are mutually exclusive"

# --- SQL ------------------------------------------------------------------

# Single-quote a value for SQL (there are no quotes in the validated inputs, but
# never build a literal without escaping).
sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }

WHERE="TRUE"
[[ $INCLUDE_REVIEWED -eq 1 ]] || WHERE="$WHERE AND u.isactive = 'Y'"
[[ -z "$SINCE" ]]    || WHERE="$WHERE AND u.created >= $(sql_lit "$SINCE")::date"
[[ -z "$UNTIL" ]]    || WHERE="$WHERE AND u.created <  $(sql_lit "$UNTIL")::date"
[[ -z "$ROW_TYPE" ]] || WHERE="$WHERE AND u.row_type = $(sql_lit "$ROW_TYPE")"

ORDER="ORDER BY u.created, u.etgo_mcp_usage_id"
LIMIT_CLAUSE=""
[[ -z "$LIMIT" ]] || LIMIT_CLAUSE="LIMIT $LIMIT"

# The exported shape, built from an alias `u` over etgo_mcp_usage.
ROW_JSON="json_build_object(
    'id', u.etgo_mcp_usage_id,
    'created', to_char(u.created, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS'),
    'reviewed', (u.isactive = 'N'),
    'ad_client_id', u.ad_client_id,
    'client', c.name,
    'session_key', u.session_key,
    'row_type', u.row_type,
    'tool_name', u.tool_name,
    'verb', u.verb,
    'target_entity', u.target_entity,
    'fields_touched', u.fields_touched,
    'outcome', u.outcome,
    'error_code', u.error_code,
    'duration_ms', u.duration_ms,
    'req_bytes', u.req_bytes,
    'resp_bytes', u.resp_bytes,
    'client_name', u.client_name,
    'client_version', u.client_version,
    'payload', u.payload
  )"

if [[ $COUNT_ONLY -eq 1 ]]; then
  SQL="SELECT count(*) FROM etgo_mcp_usage u WHERE $WHERE;"
elif [[ $MARK_REVIEWED -eq 1 ]]; then
  # Read and mark in ONE statement: the rows returned are exactly the rows
  # updated, so an export can never silently lose rows it just marked.
  SQL="WITH picked AS (
    SELECT u.etgo_mcp_usage_id FROM etgo_mcp_usage u WHERE $WHERE $ORDER $LIMIT_CLAUSE
  ), marked AS (
    UPDATE etgo_mcp_usage u SET isactive = 'N', updated = now()
    FROM picked p WHERE u.etgo_mcp_usage_id = p.etgo_mcp_usage_id
    RETURNING u.*
  )
  SELECT $ROW_JSON FROM marked u
  LEFT JOIN ad_client c ON c.ad_client_id = u.ad_client_id
  $ORDER;"
else
  SQL="SELECT $ROW_JSON FROM etgo_mcp_usage u
  LEFT JOIN ad_client c ON c.ad_client_id = u.ad_client_id
  WHERE $WHERE $ORDER $LIMIT_CLAUSE;"
fi

# --- Remote psql ----------------------------------------------------------

run_remote() { remote_psql -At; }

scope_note() {
  local s="rows"
  [[ $INCLUDE_REVIEWED -eq 1 ]] && s="$s (reviewed included)" || s="unreviewed $s"
  [[ -n "$ROW_TYPE" ]] && s="$ROW_TYPE $s"
  [[ -n "$SINCE" ]] && s="$s since $SINCE"
  [[ -n "$UNTIL" ]] && s="$s before $UNTIL"
  [[ -n "$LIMIT" ]] && s="$s, capped at $LIMIT"
  printf '%s' "$s"
}

# --- Count ----------------------------------------------------------------

if [[ $COUNT_ONLY -eq 1 ]]; then
  MATCHING="$(printf '%s\n' "$SQL" | run_remote)" || die "the remote count failed"
  printf '%s on %s: %s\n' "$(scope_note)" "$SSH_HOST" "$MATCHING"
  exit 0
fi

# --- Confirm the write ----------------------------------------------------
# Only the marking path asks: it is the only one that changes the remote DB.

if [[ $MARK_REVIEWED -eq 1 && $ASSUME_YES -eq 0 ]]; then
  COUNT_SQL="SELECT count(*) FROM etgo_mcp_usage u WHERE $WHERE;"
  PENDING="$(printf '%s\n' "$COUNT_SQL" | run_remote)" || die "the remote count failed"
  [[ -n "$LIMIT" && "$PENDING" -gt "$LIMIT" ]] && PENDING="$LIMIT"
  [[ "$PENDING" -eq 0 ]] && { printf 'Nothing to export: 0 %s on %s.\n' "$(scope_note)" "$SSH_HOST"; exit 0; }
  [[ -t 0 ]] || die "--mark-reviewed writes to $SSH_HOST and stdin is not a terminal; pass --yes to proceed"
  printf 'About to export and MARK AS REVIEWED %s %s on %s.\n' "$PENDING" "$(scope_note)" "$SSH_HOST"
  read -r -p 'Proceed? [y/N] ' reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { printf 'Aborted, nothing written.\n'; exit 1; }
fi

# --- Export ---------------------------------------------------------------

if [[ -z "$OUT" ]]; then
  OUT="$REPO_ROOT/mcp-usage/${SSH_HOST}-$(date +%Y%m%dT%H%M%S).jsonl"
fi
mkdir -p "$(dirname "$OUT")"

printf '%s\n' "$SQL" | run_remote > "$OUT" || die "the remote export failed; nothing was marked"

ROWS="$(wc -l < "$OUT" | tr -d ' ')"
printf '%s rows → %s\n' "$ROWS" "$OUT" >&2
[[ $MARK_REVIEWED -eq 1 ]] && printf 'Marked reviewed (isactive=N) on %s: %s rows.\n' "$SSH_HOST" "$ROWS" >&2

if [[ "$ROWS" -gt 0 ]]; then
  {
    printf '\n'
    jq -r '.row_type' "$OUT" 2>/dev/null | sort | uniq -c | sed 's/^/  by row_type: /' || true
    jq -r '.outcome'  "$OUT" 2>/dev/null | sort | uniq -c | sed 's/^/  by outcome:  /' || true
  } >&2
fi

exit 0
