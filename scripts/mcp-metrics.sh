#!/usr/bin/env bash
# mcp-metrics.sh
#
# Usage metrics for the MCP / Copilot area of a deployed Etendo instance:
#
#   mcp_usage      rows in ETGO_MCP_USAGE with row_type = 'tool_call'
#   feedback       rows in ETGO_MCP_USAGE with row_type = 'feedback'
#   conversations  rows in ETCOP_CONVERSATION (Copilot chats)
#   messages       rows in ETCOP_MESSAGE     (Copilot chat messages)
#   avg_msgs_conv  messages of the conversations CREATED in the bucket divided
#                  by those conversations (so a long chat is not split across days)
#
# Every metric is bucketed by its own row's `created`. `isactive` is ignored on
# purpose: mcp-usage-dump.sh repurposes it as a "reviewed" flag, it does not
# mean the row is gone.
#
# Same connection model as mcp-usage-dump.sh (scripts/lib/remote-etendo-psql.sh):
# the target is a remote-connection profile (~/.config/schema-forge/remote/<name>.env
# with SSH_HOST + GRADLE_PROPERTIES) or a bare SSH alias; psql runs ON that host
# with the credentials of its own gradle.properties — the hop to the RDS happens
# there. Read-only: the script only runs SELECTs.
#
#   scripts/mcp-metrics.sh production
#   scripts/mcp-metrics.sh production --last-days 30 --daily
#
# Usage:
#     scripts/mcp-metrics.sh [options] <profile|ssh-host>
#
# Options:
#     --daily               One row per day (days with no activity included), plus a total
#     --last-days <n>       Only the last n days, today included (e.g. 30)
#     --since <date>        Only rows created on/after this date (YYYY-MM-DD)
#     --until <date>        Only rows created BEFORE this date (YYYY-MM-DD)
#     --client <name>       Only this tenant (AD_Client.Name, case-insensitive)
#     --csv                 CSV output instead of an aligned table
#     --gradle-properties <path>  gradle.properties on the host (overrides the profile)
#     -h, --help            This help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""
GRADLE_OVERRIDE=""
DAILY=0
CSV=0
LAST_DAYS=""
SINCE=""
UNTIL=""
CLIENT=""

die() { printf 'mcp-metrics: %s\n' "$1" >&2; exit 1; }
usage() { sed -n '3,37p' "$0" | sed 's/^# \{0,1\}//'; }
need_value() { [[ -n "${2:-}" ]] || die "$1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --daily)        DAILY=1; shift ;;
    --csv)          CSV=1; shift ;;
    --last-days)    need_value "$1" "${2:-}"; LAST_DAYS="$2"; shift 2 ;;
    --since)        need_value "$1" "${2:-}"; SINCE="$2"; shift 2 ;;
    --until)        need_value "$1" "${2:-}"; UNTIL="$2"; shift 2 ;;
    --client)       need_value "$1" "${2:-}"; CLIENT="$2"; shift 2 ;;
    --gradle-properties) need_value "$1" "${2:-}"; GRADLE_OVERRIDE="$2"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "unknown option: $1 (try --help)" ;;
    *)              [[ -z "$TARGET" ]] || die "only one profile/ssh host is accepted"; TARGET="$1"; shift ;;
  esac
done

[[ -n "$TARGET" ]] || { usage; exit 1; }
[[ -z "$LAST_DAYS" || "$LAST_DAYS" =~ ^[1-9][0-9]*$ ]] || die "--last-days must be a positive integer"
[[ -n "$LAST_DAYS" && -n "$SINCE" ]] && die "--last-days and --since are mutually exclusive"
for d in "$SINCE" "$UNTIL"; do
  [[ -z "$d" || "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "dates must be YYYY-MM-DD (got '$d')"
done

# --- SQL ------------------------------------------------------------------

sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }

# Period bounds as SQL expressions: [FROM_EXPR, TO_EXPR). NULL = unbounded.
FROM_EXPR="NULL::date"
TO_EXPR="NULL::date"
[[ -z "$LAST_DAYS" ]] || FROM_EXPR="(current_date - ($LAST_DAYS - 1))"
[[ -z "$SINCE" ]]     || FROM_EXPR="$(sql_lit "$SINCE")::date"
[[ -z "$UNTIL" ]]     || TO_EXPR="$(sql_lit "$UNTIL")::date"

CLIENT_EXPR="NULL::varchar"
[[ -z "$CLIENT" ]] || CLIENT_EXPR="$(sql_lit "$CLIENT")"

# Rows of each source reduced to (bucket day, metric). One scan per table.
SQL="
WITH params AS (
  SELECT $FROM_EXPR AS d_from, $TO_EXPR AS d_to, $CLIENT_EXPR AS client
), clients AS (
  SELECT c.ad_client_id FROM ad_client c, params p
  WHERE p.client IS NULL OR lower(c.name) = lower(p.client)
), mcp AS (
  SELECT u.created::date AS day,
         count(*) FILTER (WHERE u.row_type = 'tool_call') AS mcp_usage,
         count(*) FILTER (WHERE u.row_type = 'feedback')  AS feedback
  FROM etgo_mcp_usage u, params p
  WHERE u.ad_client_id IN (SELECT ad_client_id FROM clients)
    AND (p.d_from IS NULL OR u.created >= p.d_from)
    AND (p.d_to   IS NULL OR u.created <  p.d_to)
  GROUP BY 1
), msg AS (
  SELECT m.created::date AS day, count(*) AS messages
  FROM etcop_message m, params p
  WHERE m.ad_client_id IN (SELECT ad_client_id FROM clients)
    AND (p.d_from IS NULL OR m.created >= p.d_from)
    AND (p.d_to   IS NULL OR m.created <  p.d_to)
  GROUP BY 1
), conv AS (
  SELECT c.created::date AS day,
         count(*) AS conversations,
         sum((SELECT count(*) FROM etcop_message m
              WHERE m.etcop_conversation_id = c.etcop_conversation_id)) AS conv_msgs
  FROM etcop_conversation c, params p
  WHERE c.ad_client_id IN (SELECT ad_client_id FROM clients)
    AND (p.d_from IS NULL OR c.created >= p.d_from)
    AND (p.d_to   IS NULL OR c.created <  p.d_to)
  GROUP BY 1
), bounds AS (
  SELECT coalesce(p.d_from, least((SELECT min(day) FROM mcp), (SELECT min(day) FROM msg), (SELECT min(day) FROM conv))) AS d0,
         coalesce(p.d_to - 1, current_date) AS d1
  FROM params p
), days AS (
  SELECT generate_series(d0, d1, interval '1 day')::date AS day FROM bounds WHERE d0 IS NOT NULL
), per_day AS (
  SELECT d.day,
         coalesce(mcp.mcp_usage, 0)     AS mcp_usage,
         coalesce(mcp.feedback, 0)      AS feedback,
         coalesce(conv.conversations, 0) AS conversations,
         coalesce(msg.messages, 0)      AS messages,
         coalesce(conv.conv_msgs, 0)    AS conv_msgs
  FROM days d
  LEFT JOIN mcp  ON mcp.day  = d.day
  LEFT JOIN msg  ON msg.day  = d.day
  LEFT JOIN conv ON conv.day = d.day
), report AS (
  SELECT 0 AS ord, to_char(day, 'YYYY-MM-DD') AS period,
         mcp_usage, feedback, conversations, messages,
         round(conv_msgs::numeric / nullif(conversations, 0), 1) AS avg_msgs_conv
  FROM per_day WHERE $DAILY = 1
  UNION ALL
  SELECT 1, 'TOTAL ' || coalesce(to_char(min(day), 'YYYY-MM-DD') || ' → ' || to_char(max(day), 'YYYY-MM-DD'), '(no data)'),
         coalesce(sum(mcp_usage), 0), coalesce(sum(feedback), 0),
         coalesce(sum(conversations), 0), coalesce(sum(messages), 0),
         round(sum(conv_msgs)::numeric / nullif(sum(conversations), 0), 1)
  FROM per_day
)
SELECT period, mcp_usage, feedback, conversations, messages, avg_msgs_conv
FROM report ORDER BY ord, period;
"

# --- Remote psql ----------------------------------------------------------

# shellcheck source=lib/remote-etendo-psql.sh
source "$REPO_ROOT/scripts/lib/remote-etendo-psql.sh"
resolve_remote_target "$TARGET" "$GRADLE_OVERRIDE" || die "cannot resolve target '$TARGET'"

PSQL_FMT=(-q -P footer=off)
[[ $CSV -eq 0 ]] || PSQL_FMT=(-q --csv)

SCOPE="all time"
[[ -z "$LAST_DAYS" ]] || SCOPE="last $LAST_DAYS days"
[[ -z "$SINCE" ]]     || SCOPE="since $SINCE"
[[ -z "$UNTIL" ]]     || SCOPE="$SCOPE, before $UNTIL"
[[ -z "$CLIENT" ]]    || SCOPE="$SCOPE, client '$CLIENT'"
printf 'MCP / Copilot metrics on %s (%s)\n' "$SSH_HOST" "$SCOPE" >&2

printf '%s\n' "$SQL" | remote_psql "${PSQL_FMT[@]}" || die "the remote query failed"
