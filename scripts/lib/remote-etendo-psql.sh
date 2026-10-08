# remote-etendo-psql.sh — sourced helper, not executable on its own.
#
# Runs psql ON a deployed Etendo host over SSH, with the DB credentials of that
# host's own gradle.properties, so no credential ever travels to this machine or
# into a shell history. The hop to the RDS happens on the host.
#
# The target is either:
#   - a remote-connection profile, ~/.config/schema-forge/remote/<name>.env
#     (or $SF_REMOTE_DIR), read for two keys:
#         SSH_HOST            SSH alias of the host
#         GRADLE_PROPERTIES   path of gradle.properties ON that host
#                             (default /opt/EtendoERP/gradle.properties)
#     The DB_* keys of the profile belong to db-tunnel.sh and are ignored here.
#   - or, when no such profile exists, a bare SSH alias (default path applies).
#
# Usage from a script:
#     source "$REPO_ROOT/scripts/lib/remote-etendo-psql.sh"
#     resolve_remote_target "$TARGET" "$GRADLE_OVERRIDE"   # sets SSH_HOST, GRADLE_PROPERTIES
#     printf '%s\n' "$SQL" | remote_psql -At               # extra args go to psql

REMOTE_PROFILE_DIR="${SF_REMOTE_DIR:-$HOME/.config/schema-forge/remote}"
DEFAULT_GRADLE_PROPERTIES="/opt/EtendoERP/gradle.properties"

# Read one KEY from an env file without sourcing it, stripping optional quotes.
_profile_value() {
  sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" | tail -1 \
    | sed -e "s/^'\(.*\)'$/\1/" -e 's/^"\(.*\)"$/\1/'
}

# resolve_remote_target <profile|ssh-alias> [gradle.properties override]
resolve_remote_target() {
  local target="$1" override="${2:-}" file="$REMOTE_PROFILE_DIR/$1.env"
  if [[ -f "$file" ]]; then
    SSH_HOST="$(_profile_value "$file" SSH_HOST)"
    GRADLE_PROPERTIES="$(_profile_value "$file" GRADLE_PROPERTIES)"
    [[ -n "$SSH_HOST" ]] || { printf 'no SSH_HOST in profile %s\n' "$file" >&2; return 1; }
  else
    SSH_HOST="$target"
    GRADLE_PROPERTIES=""
  fi
  [[ -z "$override" ]] || GRADLE_PROPERTIES="$override"
  GRADLE_PROPERTIES="${GRADLE_PROPERTIES:-$DEFAULT_GRADLE_PROPERTIES}"
}

# Runs ON the remote host. Single-quoted so every expansion happens remotely;
# $0 is the gradle.properties path, the rest are psql arguments.
_REMOTE_PSQL_CMD='
set -eu
f="$0"
[ -f "$f" ] || { echo "no gradle.properties on the remote host at: $f" >&2; exit 1; }
prop() { sed -n "s/^$1=//p" "$f" | head -1 | tr -d "\r"; }
command -v psql >/dev/null 2>&1 || { echo "psql not found on the remote host" >&2; exit 1; }
PGPASSWORD="$(prop bbdd\.password)" \
exec psql -h "$(prop bbdd\.host)" -p "$(prop bbdd\.port)" -U "$(prop bbdd\.user)" \
     -d "$(prop bbdd\.sid)" -v ON_ERROR_STOP=1 -X "$@" -f -
'

# remote_psql [psql args...] — SQL on stdin, result on stdout.
remote_psql() {
  local quoted="" a
  for a in "$@"; do quoted+=" $(printf '%q' "$a")"; done
  ssh "$SSH_HOST" "bash -c '$_REMOTE_PSQL_CMD' $(printf '%q' "$GRADLE_PROPERTIES")$quoted"
}
