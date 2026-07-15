#!/usr/bin/env bash
# db-tunnel.sh
#
# Open an idempotent SSH tunnel to a remote Etendo database (typically an RDS
# instance living in a private VPC, reachable only through a bastion host) and
# run tooling against it — psql sessions or the tenant data-fixes runner.
#
# Connection details can be supplied two ways (mix freely — flags win):
#
#   1. Inline, via flags or env vars:
#        --ssh-host   / SSH_HOST      SSH alias/host of the bastion (e.g. etendo-go-staging)
#        --db-host    / DB_HOST       Remote DB host as seen FROM the bastion (RDS endpoint)
#        --db-port    / DB_PORT       Remote DB port                        (default 5432)
#        --db-name    / DB_NAME       Database name                         (default etendo)
#        --db-user    / DB_USER       DB user
#        --db-password/ DB_PASSWORD   DB password
#        --local-port / LOCAL_PORT    Local port to forward                 (default 15432)
#
#   2. A saved profile — an env file exporting the same vars, kept OUTSIDE the
#      repo so credentials are never committed:
#        ~/.config/schema-forge/remote/<profile>.env
#      Select it with --profile <name> or --env-file <path>. Flags/env override it.
#
# Usage:
#     scripts/db-tunnel.sh [connection flags] [--profile <name>] <command> [args]
#
# Commands:
#     up                 Open the tunnel (idempotent) and print connection info.
#     down               Close the tunnel for this profile.
#     status             Report whether the tunnel is up.
#     psql [-- args]     Open the tunnel and drop into an interactive psql.
#     run -- <cmd...>    Open the tunnel, point ETENDO_GRADLE_PROPERTIES at it,
#                        run <cmd...>, then close the tunnel if we opened it.
#
# Examples:
#     scripts/db-tunnel.sh --ssh-host etendo-go-staging --db-host my.rds.amazonaws.com \
#         --db-user postgres --db-password 'secret' psql
#     scripts/db-tunnel.sh --profile staging up
#     scripts/db-tunnel.sh --profile staging psql -- -c "SELECT count(*) FROM c_invoice;"
#     scripts/db-tunnel.sh --profile staging run -- node cli/src/data-fixes/run.js --dry-run

set -euo pipefail

# --- Defaults & argument parsing ---------------------------------------------

PROFILE="${SF_REMOTE_PROFILE:-}"
ENV_FILE="${SF_REMOTE_ENV:-}"

CONFIG_DIR="${SF_REMOTE_DIR:-$HOME/.config/schema-forge/remote}"

usage() {
  sed -n '2,55p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Inline overrides captured from flags — applied AFTER the profile loads so a
# flag always wins over a profile/env value. Empty = not overridden.
o_ssh_host="" o_db_host="" o_db_port="" o_db_name="" o_db_user="" o_db_password="" o_local_port=""
SOCK_KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)      PROFILE="$2"; shift 2 ;;
    --env-file)     ENV_FILE="$2"; shift 2 ;;
    --name)         SOCK_KEY="$2"; shift 2 ;;
    --ssh-host)     o_ssh_host="$2"; shift 2 ;;
    --db-host)      o_db_host="$2"; shift 2 ;;
    --db-port)      o_db_port="$2"; shift 2 ;;
    --db-name)      o_db_name="$2"; shift 2 ;;
    --db-user)      o_db_user="$2"; shift 2 ;;
    --db-password)  o_db_password="$2"; shift 2 ;;
    --local-port)   o_local_port="$2"; shift 2 ;;
    -h|--help)      usage 0 ;;
    up|down|status|psql|run) break ;;
    *) echo "Error: unknown option '$1'" >&2; usage 1 ;;
  esac
done

COMMAND="${1:-}"
[[ -z "$COMMAND" ]] && usage 1
shift || true

# --- Resolve connection: profile file (optional) then inline overrides -------

# If a profile/env-file is requested (or a default profile.env exists), load it.
[[ -z "$ENV_FILE" && -n "$PROFILE" ]] && ENV_FILE="$CONFIG_DIR/$PROFILE.env"

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: profile file not found: $ENV_FILE" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

# Inline flags override whatever the profile/env provided.
[[ -n "$o_ssh_host" ]]     && SSH_HOST="$o_ssh_host"
[[ -n "$o_db_host" ]]      && DB_HOST="$o_db_host"
[[ -n "$o_db_port" ]]      && DB_PORT="$o_db_port"
[[ -n "$o_db_name" ]]      && DB_NAME="$o_db_name"
[[ -n "$o_db_user" ]]      && DB_USER="$o_db_user"
[[ -n "$o_db_password" ]]  && DB_PASSWORD="$o_db_password"
[[ -n "$o_local_port" ]]   && LOCAL_PORT="$o_local_port"

if [[ -z "${SSH_HOST:-}${DB_HOST:-}${DB_USER:-}${DB_PASSWORD:-}" ]]; then
  cat >&2 <<EOF
Error: no connection details. Supply them inline, e.g.:

  $0 --ssh-host etendo-go-staging --db-host my.rds.amazonaws.com \\
     --db-user postgres --db-password 'secret' $COMMAND

...or save a profile at $CONFIG_DIR/<name>.env and pass --profile <name>.
EOF
  exit 1
fi

: "${SSH_HOST:?SSH_HOST is required (--ssh-host or profile)}"
: "${DB_HOST:?DB_HOST is required (--db-host or profile)}"
: "${DB_USER:?DB_USER is required (--db-user or profile)}"
: "${DB_PASSWORD:?DB_PASSWORD is required (--db-password or profile)}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-etendo}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
PROFILE="${PROFILE:-default}"

# Managed databases (RDS, Cloud SQL, ...) require SSL. Over the tunnel the local
# endpoint is 127.0.0.1, so the server cert CN never matches — we encrypt the
# channel without hostname verification. The two clients spell that differently:
#   - libpq/psql : sslmode=require   (encrypt, no CA/host verification)
#   - node 'pg'  : sslmode=no-verify ({ rejectUnauthorized: false })
# Both read PGSSLMODE from the environment. Override either with SSLMODE=.
PSQL_SSLMODE="${SSLMODE:-require}"
PG_SSLMODE="${SSLMODE:-no-verify}"

PSQL_BIN="${PSQL_BIN:-$(command -v psql || true)}"
# The control-socket key defaults to the profile name, but --name lets a caller
# (e.g. the interactive TUI, driving a not-yet-saved connection) name the socket
# independently of any profile file.
SOCK_KEY="${SOCK_KEY:-$PROFILE}"
SOCK="$CONFIG_DIR/.$SOCK_KEY.control.sock"

# --- Tunnel primitives -------------------------------------------------------

tunnel_is_up() {
  [[ -S "$SOCK" ]] && ssh -S "$SOCK" -O check "$SSH_HOST" 2>/dev/null
}

tunnel_up() {
  if tunnel_is_up; then
    return 0
  fi
  # Stale socket from a dead master — clear it before reconnecting.
  [[ -S "$SOCK" ]] && rm -f "$SOCK"
  mkdir -p "$CONFIG_DIR"
  ssh -f -N -M -S "$SOCK" \
      -o ExitOnForwardFailure=yes \
      -o ControlPersist=yes \
      -o ConnectTimeout=15 \
      -L "${LOCAL_PORT}:${DB_HOST}:${DB_PORT}" \
      "$SSH_HOST"
}

tunnel_down() {
  if tunnel_is_up; then
    ssh -S "$SOCK" -O exit "$SSH_HOST" 2>/dev/null || true
  fi
  [[ -S "$SOCK" ]] && rm -f "$SOCK" || true
}

print_info() {
  cat <<EOF
Tunnel [$PROFILE] up:
  bastion    : $SSH_HOST
  remote db  : $DB_HOST:$DB_PORT/$DB_NAME
  local port : 127.0.0.1:$LOCAL_PORT
  psql       : PGPASSWORD=*** psql -h 127.0.0.1 -p $LOCAL_PORT -U $DB_USER -d $DB_NAME
EOF
}

# A temporary gradle.properties pointing the CLI at the local tunnel end.
# 600 perms + trap-cleanup so the password never lingers world-readable.
write_temp_gradle() {
  local f
  f="$(mktemp "${TMPDIR:-/tmp}/sf-remote-gradle.XXXXXX.properties")"
  chmod 600 "$f"
  cat > "$f" <<EOF
bbdd.rdbms=POSTGRE
bbdd.url=jdbc:postgresql://localhost:${LOCAL_PORT}/${DB_NAME}
bbdd.host=localhost
bbdd.port=${LOCAL_PORT}
bbdd.user=${DB_USER}
bbdd.password=${DB_PASSWORD}
bbdd.sid=${DB_NAME}
EOF
  echo "$f"
}

require_psql() {
  [[ -n "$PSQL_BIN" ]] || { echo "Error: psql not found (set PSQL_BIN)." >&2; exit 1; }
}

# --- Commands ----------------------------------------------------------------

case "$COMMAND" in
  up)
    tunnel_up
    print_info
    echo "(tunnel persists in the background — close it with: $0 --profile $PROFILE down)"
    ;;

  down)
    tunnel_down
    echo "Tunnel [$PROFILE] closed."
    ;;

  status)
    if tunnel_is_up; then
      echo "Tunnel [$PROFILE] is UP on 127.0.0.1:$LOCAL_PORT"
    else
      echo "Tunnel [$PROFILE] is DOWN"
      exit 1
    fi
    ;;

  psql)
    require_psql
    [[ "${1:-}" == "--" ]] && shift
    OPENED_HERE=0
    tunnel_is_up || { tunnel_up; OPENED_HERE=1; }
    trap '[[ "$OPENED_HERE" == "1" ]] && tunnel_down' EXIT
    PGPASSWORD="$DB_PASSWORD" PGSSLMODE="$PSQL_SSLMODE" \
      "$PSQL_BIN" -h 127.0.0.1 -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    ;;

  run)
    [[ "${1:-}" == "--" ]] && shift
    [[ $# -gt 0 ]] || { echo "Error: 'run' needs a command after '--'." >&2; exit 1; }
    OPENED_HERE=0
    tunnel_is_up || { tunnel_up; OPENED_HERE=1; }
    GRADLE_TMP="$(write_temp_gradle)"
    cleanup() {
      rm -f "$GRADLE_TMP"
      [[ "$OPENED_HERE" == "1" ]] && tunnel_down
    }
    trap cleanup EXIT
    ETENDO_GRADLE_PROPERTIES="$GRADLE_TMP" PGSSLMODE="$PG_SSLMODE" "$@"
    ;;

  *)
    echo "Error: unknown command '$COMMAND'" >&2
    usage 1
    ;;
esac
