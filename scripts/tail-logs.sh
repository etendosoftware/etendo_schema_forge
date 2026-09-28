#!/usr/bin/env bash
# Follow the read-only CloudWatch log stream for an Etendo GO environment.
set -euo pipefail

DEFAULT_PROFILE="go"
DEFAULT_REGION="eu-west-3"

ENV_NAME="${ETENDO_ENV:-experimental}"
SERVICE="${ETENDO_SERVICE:-etendo}"
LOG_GROUP="${ETENDO_LOG_GROUP:-}"
SINCE="10m"
PATTERN="duplicate"
FOLLOW=1
CHECK_ONLY=0
LIST_GROUPS=0

usage() {
  cat <<'EOF'
Usage: scripts/tail-logs.sh [options]

Follows the CloudWatch logs of an Etendo GO environment. Read-only: it never
writes to AWS.

Options:
  --env VALUE         Environment: experimental, production, demo1
                      (default: experimental)
  --service VALUE     Service: etendo (default), jsreport, report-server,
                      ai-bff, copilot, public-api, alb, cloudfront, rds,
                      rds-proxy
  --log-group VALUE   Explicit log group, overrides --env/--service
  --since VALUE       CloudWatch duration, e.g. 10m, 1h, or 1d (default: 10m)
  --pattern VALUE     CloudWatch filter pattern (default: duplicate)
  --all               Show all log messages instead of filtering
  --no-follow         Print the window and exit
  --list-groups       List the log groups visible to the profile, then exit
  --check             Verify the AWS CLI setup and exit (no logs read)
  -h, --help          Show this help

Environments (for the default --service etendo):
  experimental        /ecs/etendo-experimental   (go.experimental.etendo.cloud)
  production          /ecs/etendo-production     (go.etendo.cloud)
  demo1               /ecs/etendo-demo1

Not every service runs in every environment: ai-bff has no production group,
public-api is production-only, and alb/cloudfront/rds exist only for
experimental and production. Use --list-groups to see what is really there.

Environment variables:
  AWS_PROFILE         AWS profile (default: go)
  AWS_REGION          AWS region (default: eu-west-3)
  ETENDO_ENV          Default environment when --env is omitted
  ETENDO_SERVICE      Default service when --service is omitted
  ETENDO_LOG_GROUP    Default log group, overrides the --env mapping

AWS CLI setup:
  Run `scripts/tail-logs.sh --check` to validate the setup. If the profile is
  missing, configure it once with either of:

    aws configure sso --profile go        # SSO / IAM Identity Center
    aws configure --profile go            # static access keys

  Both need region eu-west-3. Account: 278186107973. The profile only needs
  read access to CloudWatch Logs (`logs:FilterLogEvents`,
  `logs:DescribeLogGroups`, `logs:DescribeLogStreams`).

Examples:
  scripts/tail-logs.sh
  scripts/tail-logs.sh --env production --since 1h
  scripts/tail-logs.sh --env production --since 30m --all --no-follow
  scripts/tail-logs.sh --service jsreport --env production --all
  scripts/tail-logs.sh --service rds --env production --pattern 'ERROR'
  scripts/tail-logs.sh --list-groups
EOF
}

# Explicit lookup: the group names do NOT follow one uniform pattern
# (compare /ecs/jsreport-experimental with /ecs/etendo-production/jsreport).
# Verified against `aws logs describe-log-groups` on 2026-09-22.
resolve_log_group() {
  local service="$1" env="$2"
  case "$service:$env" in
    etendo:experimental)        echo "/ecs/etendo-experimental" ;;
    etendo:production)          echo "/ecs/etendo-production" ;;
    etendo:demo1)               echo "/ecs/etendo-demo1" ;;

    jsreport:experimental)      echo "/ecs/jsreport-experimental" ;;
    jsreport:production)        echo "/ecs/etendo-production/jsreport" ;;
    jsreport:demo1)             echo "/ecs/jsreport-demo1" ;;

    report-server:experimental) echo "/ecs/report-server-experimental" ;;
    report-server:production)   echo "/ecs/report-server-production" ;;
    report-server:demo1)        echo "/ecs/report-server-demo1" ;;

    ai-bff:experimental)        echo "/ecs/ai-bff-experimental" ;;
    ai-bff:demo1)               echo "/ecs/ai-bff-demo1" ;;

    copilot:experimental)       echo "/ecs/copilot-experimental" ;;
    copilot:production)         echo "/ecs/copilot-production" ;;
    copilot:demo1)              echo "/ecs/copilot-demo1" ;;

    public-api:production)      echo "/ecs/etendo-public-api-production" ;;

    alb:experimental)           echo "/alb/etendo-experimental" ;;
    alb:production)             echo "/alb/etendo-production" ;;

    cloudfront:experimental)    echo "/cloudfront/etendo-experimental" ;;
    cloudfront:production)      echo "/cloudfront/etendo-production" ;;

    rds:experimental)           echo "/aws/rds/instance/etendo-experimental/postgresql" ;;
    # Renamed from etendo-production on 2026-09-22 when production moved to an
    # encrypted instance. The old group (and its -unencrypted sibling) is gone.
    rds:production)             echo "/aws/rds/instance/etendo-production-enc/postgresql" ;;

    rds-proxy:production)       echo "/aws/rds/proxy/etendo-production-proxy" ;;

    *)
      echo "ERROR: no log group for service '$service' in environment '$env'." >&2
      echo "" >&2
      echo "Environments: experimental, production, demo1" >&2
      echo "Services:     etendo (default), jsreport, report-server, ai-bff," >&2
      echo "              copilot, public-api, alb, cloudfront, rds, rds-proxy" >&2
      echo "" >&2
      echo "Not every service runs in every environment (e.g. ai-bff has no" >&2
      echo "production group, public-api is production-only)." >&2
      echo "Run --list-groups to see everything, or pass --log-group directly." >&2
      exit 2
      ;;
  esac
}

while (($# > 0)); do
  case "$1" in
    --env)
      [[ $# -ge 2 ]] || { echo "ERROR: --env requires a value" >&2; exit 2; }
      ENV_NAME="$2"
      LOG_GROUP=""
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || { echo "ERROR: --service requires a value" >&2; exit 2; }
      SERVICE="$2"
      LOG_GROUP=""
      shift 2
      ;;
    --log-group)
      [[ $# -ge 2 ]] || { echo "ERROR: --log-group requires a value" >&2; exit 2; }
      LOG_GROUP="$2"
      shift 2
      ;;
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
    --list-groups)
      LIST_GROUPS=1
      shift
      ;;
    --check)
      CHECK_ONLY=1
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

AWS_PROFILE_NAME="${AWS_PROFILE:-$DEFAULT_PROFILE}"
AWS_REGION_NAME="${AWS_REGION:-$DEFAULT_REGION}"
EXPLICIT_GROUP=0
if [[ -n "$LOG_GROUP" ]]; then
  EXPLICIT_GROUP=1
else
  LOG_GROUP="$(resolve_log_group "$SERVICE" "$ENV_NAME")"
fi

command -v aws >/dev/null 2>&1 || {
  cat >&2 <<EOF
ERROR: aws CLI is not installed or not on PATH.

Install it with:
  brew install awscli          # macOS
  # or see https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
EOF
  exit 1
}

AWS_ARGS=(--profile "$AWS_PROFILE_NAME" --region "$AWS_REGION_NAME")

if ! CALLER_ID="$(aws "${AWS_ARGS[@]}" sts get-caller-identity --query Arn --output text 2>&1)"; then
  cat >&2 <<EOF
ERROR: the AWS profile '$AWS_PROFILE_NAME' has no usable credentials in $AWS_REGION_NAME.

  $CALLER_ID

Configure it once with either of:
  aws configure sso --profile $AWS_PROFILE_NAME    # SSO / IAM Identity Center
  aws configure --profile $AWS_PROFILE_NAME        # static access keys

Use region $DEFAULT_REGION. If it is an SSO profile that simply expired, run:
  aws sso login --profile $AWS_PROFILE_NAME
EOF
  exit 1
fi

if ((CHECK_ONLY == 1)); then
  echo "OK: aws CLI found, profile=$AWS_PROFILE_NAME region=$AWS_REGION_NAME"
  echo "OK: authenticated as $CALLER_ID"
  echo "Target log group: $LOG_GROUP"
  exit 0
fi

if ((LIST_GROUPS == 1)); then
  exec aws "${AWS_ARGS[@]}" logs describe-log-groups \
    --query 'logGroups[].logGroupName' --output text
fi

TAIL_ARGS=("$LOG_GROUP" --since "$SINCE" --format short)
((FOLLOW == 1)) && TAIL_ARGS+=(--follow)
[[ -n "$PATTERN" ]] && TAIL_ARGS+=(--filter-pattern "$PATTERN")

if ((EXPLICIT_GROUP == 1)); then
  echo "Following $LOG_GROUP (profile=$AWS_PROFILE_NAME region=$AWS_REGION_NAME since=$SINCE)" >&2
else
  echo "Following $LOG_GROUP (service=$SERVICE env=$ENV_NAME profile=$AWS_PROFILE_NAME region=$AWS_REGION_NAME since=$SINCE)" >&2
fi
exec aws "${AWS_ARGS[@]}" logs tail "${TAIL_ARGS[@]}"
