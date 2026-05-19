#!/usr/bin/env bash
# sonar-check.sh — Run SonarQube analysis on specific Java files and wait for results.
#
# Usage:
#   ./cli/sonar-check.sh <file1.java> [file2.java] ...
#   ./cli/sonar-check.sh src/com/etendoerp/go/schemaforge/Widget*.java
#
# Required: SONAR_TOKEN and SONAR_HOST_URL must be defined in your shell profile
# (~/.zshrc or ~/.bashrc). The script sources them automatically.
#
# Options:
#   --project-key KEY   Override the auto-generated project key
#   --base-dir DIR      Override the base directory for analysis (default: auto-detected)
#   --timeout SECS      Max seconds to wait for report processing (default: 120)
#   --no-wait           Skip waiting for the report to be processed
#   --pr <NUM>          Run as PR analysis (auto-resolves base/branch via gh)
#   --branch <NAME>     Run as branch analysis on the given branch
#   --base <NAME>       Target branch for PR mode (default: gh pr view → main)
#   -q, --quiet         Suppress scanner output, only show results
#
# Auth: SONAR_TOKEN + SONAR_HOST_URL. The script sources them from your shell
# profile and validates the token; if missing/invalid it prints setup steps
# and exits. See docs/sonarqube-access.md for the full reference.

set -euo pipefail

# ── Bypass rtk proxy (use real binaries) ──────────────────────────────────────
# Remove rtk shims from PATH so curl, sonar-scanner etc. run directly
PATH="$(echo "$PATH" | tr ':' '\n' | grep -v 'rtk' | tr '\n' ':')"
export PATH="${PATH%:}"

# ── Defaults ──────────────────────────────────────────────────────────────────
PROJECT_KEY=""
BASE_DIR=""
TIMEOUT=120
WAIT=true
QUIET=false
FILES=()
PR=""
BRANCH=""
BASE=""

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-key) PROJECT_KEY="$2"; shift 2 ;;
    --base-dir)    BASE_DIR="$2"; shift 2 ;;
    --timeout)     TIMEOUT="$2"; shift 2 ;;
    --no-wait)     WAIT=false; shift ;;
    --pr)          PR="$2"; shift 2 ;;
    --branch)      BRANCH="$2"; shift 2 ;;
    --base)        BASE="$2"; shift 2 ;;
    -q|--quiet)    QUIET=true; shift ;;
    -h|--help)
      sed -n '2,/^$/{ s/^# //; s/^#//; p }' "$0"
      exit 0
      ;;
    -*)
      echo "Error: Unknown option: $1" >&2
      exit 1
      ;;
    *)
      FILES+=("$1"); shift ;;
  esac
done

# ── Detect shell rc file for setup hints ─────────────────────────────────────
detect_shell_rc() {
  case "${SHELL:-}" in
    */zsh)  echo "$HOME/.zshrc" ;;
    */bash)
      if [[ "$(uname)" == "Darwin" && -f "$HOME/.bash_profile" ]]; then
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    */fish) echo "$HOME/.config/fish/config.fish" ;;
    *)      echo "$HOME/.profile" ;;
  esac
}

# ── Source shell profile for SONAR_TOKEN / SONAR_HOST_URL ─────────────────────
if [[ -z "${SONAR_TOKEN:-}" || -z "${SONAR_HOST_URL:-}" ]]; then
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [[ -f "$rc" ]]; then
      eval "$(grep -E '^\s*export\s+(SONAR_TOKEN|SONAR_HOST_URL)=' "$rc" 2>/dev/null)" || true
    fi
  done
fi

# ── Validate prerequisites ────────────────────────────────────────────────────
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "Error: No files specified. Usage: $0 <file1.java> [file2.java] ..." >&2
  exit 1
fi

if [[ -z "${SONAR_TOKEN:-}" || -z "${SONAR_HOST_URL:-}" ]]; then
  rc_file="$(detect_shell_rc)"
  cat >&2 <<EOF
✗ SonarQube auth not configured.

Missing: $([[ -z "${SONAR_TOKEN:-}" ]] && echo -n 'SONAR_TOKEN ')$([[ -z "${SONAR_HOST_URL:-}" ]] && echo -n 'SONAR_HOST_URL')

Setup steps:
  1. Open https://sonar.etendo.cloud/account/security
     (log in with your Etendo account)
  2. Generate a "User Token" (not a Project Analysis Token)
  3. Append to your shell profile ($rc_file):
       export SONAR_HOST_URL=https://sonar.etendo.cloud
       export SONAR_TOKEN=<your-token>
  4. Reload:  source "$rc_file"
  5. Re-run your command.

Full reference: docs/sonarqube-access.md
EOF
  exit 1
fi

if ! command -v sonar-scanner &>/dev/null; then
  echo "Error: sonar-scanner CLI is not installed. Install via: brew install sonar-scanner" >&2
  exit 1
fi

# ── Validate token against the server (cheap call) ───────────────────────────
auth_resp="$(curl -sf -u "$SONAR_TOKEN:" "${SONAR_HOST_URL%/}/api/authentication/validate" 2>/dev/null || echo "")"
if [[ -z "$auth_resp" ]] || ! echo "$auth_resp" | grep -q '"valid":true'; then
  rc_file="$(detect_shell_rc)"
  cat >&2 <<EOF
✗ SonarQube token rejected by $SONAR_HOST_URL.

Your SONAR_TOKEN appears expired, revoked, or wrong for this host.

Fix:
  1. Generate a fresh token at https://sonar.etendo.cloud/account/security
  2. Update the export in $rc_file:
       export SONAR_TOKEN=<new-token>
  3. Reload:  source "$rc_file"

Full reference: docs/sonarqube-access.md
EOF
  exit 1
fi

# ── Resolve PR / branch mode ─────────────────────────────────────────────────
MODE_PARAMS=()
MODE="files"
if [[ -n "$PR" ]]; then
  MODE="pr"
  [[ -z "$BRANCH" ]] && BRANCH="$(git branch --show-current 2>/dev/null || echo '')"
  if [[ -z "$BASE" ]] && command -v gh &>/dev/null; then
    BASE="$(gh pr view "$PR" --json baseRefName -q .baseRefName 2>/dev/null || echo '')"
  fi
  [[ -z "$BASE" ]] && BASE="main"
  MODE_PARAMS+=(
    -Dsonar.pullrequest.key="$PR"
    -Dsonar.pullrequest.branch="$BRANCH"
    -Dsonar.pullrequest.base="$BASE"
  )
elif [[ -n "$BRANCH" ]]; then
  MODE="branch"
  MODE_PARAMS+=(-Dsonar.branch.name="$BRANCH")
fi

# ── Resolve files to absolute paths ──────────────────────────────────────────
RESOLVED_FILES=()
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Error: File not found: $f" >&2
    exit 1
  fi
  RESOLVED_FILES+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")")
done

# ── Detect base directory (common ancestor of all files) ─────────────────────
if [[ -z "$BASE_DIR" ]]; then
  # Find the git root of the first file
  BASE_DIR="$(cd "$(dirname "${RESOLVED_FILES[0]}")" && git rev-parse --show-toplevel 2>/dev/null || dirname "${RESOLVED_FILES[0]}")"

  # If all files share a deeper common path, use that
  COMMON_DIR="$(dirname "${RESOLVED_FILES[0]}")"
  for f in "${RESOLVED_FILES[@]:1}"; do
    dir="$(dirname "$f")"
    while [[ "$dir" != "/" && "$COMMON_DIR" != "$dir"* ]]; do
      COMMON_DIR="$(dirname "$COMMON_DIR")"
    done
  done

  # Don't go above the git root
  if [[ "$COMMON_DIR" == "$BASE_DIR"* ]]; then
    BASE_DIR="$COMMON_DIR"
  fi
fi

# ── Build inclusion patterns (relative to base dir) ──────────────────────────
INCLUSIONS=()
for f in "${RESOLVED_FILES[@]}"; do
  rel="${f#"$BASE_DIR"/}"
  INCLUSIONS+=("$rel")
done
INCLUSION_PATTERN="$(IFS=,; echo "${INCLUSIONS[*]}")"

# ── Auto-generate project key ────────────────────────────────────────────────
if [[ -z "$PROJECT_KEY" ]]; then
  # Use the base directory name + "sonar-check" as key
  dir_name="$(basename "$BASE_DIR")"
  PROJECT_KEY="${dir_name}-sonar-check"
fi

# ── Run sonar-scanner ────────────────────────────────────────────────────────
echo "=== SonarQube Analysis ($MODE) ==="
echo "  Server:   $SONAR_HOST_URL"
echo "  Project:  $PROJECT_KEY"
echo "  Base dir: $BASE_DIR"
case "$MODE" in
  pr)     echo "  Scope:    PR #$PR ($BRANCH → $BASE)" ;;
  branch) echo "  Scope:    Branch '$BRANCH'" ;;
esac
echo "  Files:    ${#RESOLVED_FILES[@]}"
for f in "${RESOLVED_FILES[@]}"; do
  echo "    - ${f#"$BASE_DIR"/}"
done
echo ""

SCANNER_ARGS=(
  -Dsonar.host.url="$SONAR_HOST_URL"
  -Dsonar.token="$SONAR_TOKEN"
  -Dsonar.projectKey="$PROJECT_KEY"
  -Dsonar.projectBaseDir="$BASE_DIR"
  -Dsonar.sources=.
  -Dsonar.inclusions="$INCLUSION_PATTERN"
  -Dsonar.java.binaries=.
  -Dsonar.sourceEncoding=UTF-8
  "${MODE_PARAMS[@]}"
)

SCANNER_OUTPUT_FILE="$(mktemp)"
trap "rm -f '$SCANNER_OUTPUT_FILE'" EXIT

if $QUIET; then
  sonar-scanner "${SCANNER_ARGS[@]}" >"$SCANNER_OUTPUT_FILE" 2>&1
  scan_exit=$?
else
  sonar-scanner "${SCANNER_ARGS[@]}" 2>&1 | tee "$SCANNER_OUTPUT_FILE"
  scan_exit=${PIPESTATUS[0]}
fi

if [[ $scan_exit -ne 0 ]]; then
  echo "Error: sonar-scanner failed with exit code $scan_exit" >&2
  $QUIET && cat "$SCANNER_OUTPUT_FILE" >&2
  exit $scan_exit
fi

echo ""

# ── Wait for report processing ───────────────────────────────────────────────
if ! $WAIT; then
  echo "Dashboard: $SONAR_HOST_URL/dashboard?id=$PROJECT_KEY"
  exit 0
fi

# Extract the task ID from scanner output to poll ce/task/{id}
TASK_ID="$(grep -o 'ce/task?id=[a-f0-9-]*' "$SCANNER_OUTPUT_FILE" | sed 's/.*id=//' | head -1 || echo "")"

if [[ -z "$TASK_ID" ]]; then
  echo "Warning: Could not extract task ID from scanner output. Waiting 10s then fetching results..." >&2
  sleep 10
else
  echo "Waiting for report to be processed (task: ${TASK_ID:0:8}...)..."

  deadline=$((SECONDS + TIMEOUT))
  while [[ $SECONDS -lt $deadline ]]; do
    sleep 3

    status="$(curl -sf -u "$SONAR_TOKEN:" \
      "$SONAR_HOST_URL/api/ce/task?id=$TASK_ID" 2>/dev/null \
      | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('task', {}).get('status', 'UNKNOWN'))
except:
    print('ERROR')
" 2>/dev/null)"

    case "$status" in
      SUCCESS)
        break
        ;;
      FAILED|CANCELED)
        echo "Error: Report processing $status" >&2
        echo "Dashboard: $SONAR_HOST_URL/dashboard?id=$PROJECT_KEY"
        exit 1
        ;;
      *)
        # Still processing (PENDING / IN_PROGRESS)
        ;;
    esac
  done

  if [[ $SECONDS -ge $deadline ]]; then
    echo "Warning: Timed out waiting for report (${TIMEOUT}s). Check manually:" >&2
    echo "Dashboard: $SONAR_HOST_URL/dashboard?id=$PROJECT_KEY"
    exit 1
  fi
fi

# ── Fetch and display results ────────────────────────────────────────────────
echo ""
echo "=== Results ==="

ISSUES_URL="$SONAR_HOST_URL/api/issues/search?componentKeys=$PROJECT_KEY&statuses=OPEN,CONFIRMED&ps=100"
DASH_URL="$SONAR_HOST_URL/dashboard?id=$PROJECT_KEY"
case "$MODE" in
  pr)
    ISSUES_URL="${ISSUES_URL}&pullRequest=$PR"
    DASH_URL="${DASH_URL}&pullRequest=$PR"
    ;;
  branch)
    ISSUES_URL="${ISSUES_URL}&branch=$BRANCH"
    DASH_URL="${DASH_URL}&branch=$BRANCH"
    ;;
esac

curl -sf -u "$SONAR_TOKEN:" \
  "$ISSUES_URL" 2>/dev/null \
  | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
except:
    print('  Error: Could not parse SonarQube response')
    sys.exit(1)

total = data.get('total', 0)

if total == 0:
    print('  No issues found. All clean!')
    print()
    print(f'Dashboard: {sys.argv[1]}')
    sys.exit(0)

print(f'  {total} issue(s) found:')
print()

severity_order = {'BLOCKER': 0, 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4, 'INFO': 5}
issues = sorted(data.get('issues', []),
    key=lambda i: severity_order.get(i.get('impacts', [{}])[0].get('severity', 'INFO'), 99))

for i in issues:
    sev = i.get('impacts', [{}])[0].get('severity', '?')
    component = i.get('component', '').split(':')[-1]
    line = i.get('line', '?')
    msg = i.get('message', '')
    rule = i.get('rule', '')
    print(f'  [{sev}] {component}:{line}')
    print(f'    {msg}')
    print(f'    Rule: {rule}')
    print()

print(f'Dashboard: {sys.argv[1]}')
sys.exit(1 if total > 0 else 0)
" "$DASH_URL"
