#!/usr/bin/env bash
# Follow the read-only CloudWatch log stream for go.experimental.etendo.cloud.
set -euo pipefail

AWS_PROFILE_NAME="${AWS_PROFILE:-go}"
AWS_REGION_NAME="${AWS_REGION:-eu-west-3}"
LOG_GROUP="${ETENDO_LOG_GROUP:-/ecs/etendo-experimental}"
SINCE="10m"
PATTERN="duplicate"
FOLLOW=1

usage() {
  cat <<'EOF'
Usage: scripts/tail-experimental-logs.sh [options]

Options:
  --since VALUE       CloudWatch duration, e.g. 10m, 1h, or 1d (default: 10m)
  --pattern VALUE     CloudWatch filter pattern (default: duplicate)
  --all               Show all log messages instead of filtering
  --no-follow         Print the window and exit
  -h, --help          Show this help

Environment:
  AWS_PROFILE         AWS profile (default: go)
  AWS_REGION          AWS region (default: eu-west-3)
  ETENDO_LOG_GROUP    Log group (default: /ecs/etendo-experimental)

Examples:
  scripts/tail-experimental-logs.sh
  scripts/tail-experimental-logs.sh --since 1h --pattern 'contact'
  scripts/tail-experimental-logs.sh --since 30m --all --no-follow
EOF
}

while (($# > 0)); do
  case "$1" in
    --since)
      [[ $# -ge 2 ]] || { echo "ERROR: --since requires a value" >&2; exit 2; }
      SINCE="$2"
      shift 2
      ;;
    --pattern)
      [[ $# -ge 2 ]] || { echo "ERROR: --pattern requires a value" >&2; exit 2; }
      PATTERN="$2"
      shift 2
      ;;
    --all)
      PATTERN=""
      shift
      ;;
    --no-follow)
      FOLLOW=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v aws >/dev/null 2>&1 || {
  echo "ERROR: aws CLI is not installed or not on PATH." >&2
  exit 1
}

AWS_ARGS=(--profile "$AWS_PROFILE_NAME" --region "$AWS_REGION_NAME")
TAIL_ARGS=("$LOG_GROUP" --since "$SINCE" --format short)
(( FOLLOW == 1 )) && TAIL_ARGS+=(--follow)
[[ -n "$PATTERN" ]] && TAIL_ARGS+=(--filter-pattern "$PATTERN")

echo "Following $LOG_GROUP (profile=$AWS_PROFILE_NAME region=$AWS_REGION_NAME since=$SINCE)" >&2
exec aws "${AWS_ARGS[@]}" logs tail "${TAIL_ARGS[@]}"
