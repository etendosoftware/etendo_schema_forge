#!/usr/bin/env bash
# sonar-scan.sh — Run SonarQube whole-project analysis with overall / branch / PR modes.
#
# Modes (selected via env vars or auto-detection):
#   make sonar                        → overall (current branch, or main if checked out)
#   make sonar BRANCH=feature/x       → branch analysis on the given branch
#   make sonar PR=547                 → PR analysis (auto-resolves base + branch via gh)
#   make sonar PR=547 BASE=epic/x     → PR analysis with explicit base
#   make sonar-pr                     → forces PR auto-detect from current branch
#
# Env vars consumed:
#   PR        Pull request number. If set, runs in PR mode.
#   BRANCH    Source branch name. Defaults to current git branch.
#   BASE      Target branch for PR mode. Auto-resolved via `gh pr view` if absent.
#   AUTO_PR   If "1", try to auto-detect PR from the current branch (used by `make sonar-pr`).
#   COVERAGE  If "1", coverage reports must already be in coverage/ (caller's responsibility).
#
# Auth: SONAR_TOKEN + SONAR_HOST_URL. See docs/sonarqube-access.md for setup.

set -euo pipefail

# ── Bypass rtk proxy for real binaries (curl, sonar-scanner) ─────────────────
PATH="$(echo "$PATH" | tr ':' '\n' | grep -v 'rtk' | tr '\n' ':')"
export PATH="${PATH%:}"

# ── Locate repo root ──────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

# ── Preflight: validate Sonar auth ───────────────────────────────────────────
preflight_auth() {
  # If already set in environment, fine.
  if [[ -n "${SONAR_TOKEN:-}" && -n "${SONAR_HOST_URL:-}" ]]; then
    return 0
  fi

  # Try sourcing exports from common shell profiles.
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    [[ -f "$rc" ]] || continue
    eval "$(grep -E '^\s*export\s+(SONAR_TOKEN|SONAR_HOST_URL)=' "$rc" 2>/dev/null)" || true
  done

  if [[ -z "${SONAR_TOKEN:-}" || -z "${SONAR_HOST_URL:-}" ]]; then
    local rc; rc="$(detect_shell_rc)"
    cat >&2 <<EOF
✗ SonarQube auth not configured.

Missing: $([[ -z "${SONAR_TOKEN:-}" ]] && echo -n 'SONAR_TOKEN ')$([[ -z "${SONAR_HOST_URL:-}" ]] && echo -n 'SONAR_HOST_URL')

Setup steps:
  1. Open https://sonar.etendo.cloud/account/security
     (log in with your Etendo account)
  2. Generate a "User Token" (not a Project Analysis Token)
  3. Append to your shell profile ($rc):
       export SONAR_HOST_URL=https://sonar.etendo.cloud
       export SONAR_TOKEN=<your-token>
  4. Reload your shell:
       source "$rc"
  5. Re-run your command.

Full reference: docs/sonarqube-access.md
EOF
    exit 1
  fi
}

# ── Validate token works (cheap call) ────────────────────────────────────────
validate_token() {
  local resp
  resp="$(curl -sf -u "$SONAR_TOKEN:" "${SONAR_HOST_URL%/}/api/authentication/validate" 2>/dev/null || echo "")"
  if [[ -z "$resp" ]] || ! echo "$resp" | grep -q '"valid":true'; then
    local rc; rc="$(detect_shell_rc)"
    cat >&2 <<EOF
✗ SonarQube token rejected by $SONAR_HOST_URL.

The exported SONAR_TOKEN is not valid (expired, revoked, or wrong host).

Fix:
  1. Generate a fresh token at https://sonar.etendo.cloud/account/security
  2. Update the export in $rc:
       export SONAR_TOKEN=<new-token>
  3. Reload:  source "$rc"

Full reference: docs/sonarqube-access.md
EOF
    exit 1
  fi
}

# ── Resolve mode + parameters ────────────────────────────────────────────────
PR="${PR:-}"
BRANCH="${BRANCH:-}"
BASE="${BASE:-}"
AUTO_PR="${AUTO_PR:-0}"

[[ -z "$BRANCH" ]] && BRANCH="$(git branch --show-current 2>/dev/null || echo '')"

# AUTO_PR=1 → try to resolve PR from current branch via gh
if [[ "$AUTO_PR" == "1" && -z "$PR" ]]; then
  if command -v gh &>/dev/null; then
    PR="$(gh pr view --json number -q .number 2>/dev/null || echo '')"
  fi
  if [[ -z "$PR" ]]; then
    echo "✗ make sonar-pr: no open PR found for branch '$BRANCH'." >&2
    echo "  Use 'make sonar BRANCH=$BRANCH' for branch-mode analysis," >&2
    echo "  or open a PR first with: gh pr create" >&2
    exit 1
  fi
fi

MODE="overall"
SCANNER_PARAMS=()

if [[ -n "$PR" ]]; then
  MODE="pr"
  if [[ -z "$BASE" ]]; then
    if command -v gh &>/dev/null; then
      BASE="$(gh pr view "$PR" --json baseRefName -q .baseRefName 2>/dev/null || echo '')"
    fi
    [[ -z "$BASE" ]] && BASE="main"
  fi
  SCANNER_PARAMS+=(
    -Dsonar.pullrequest.key="$PR"
    -Dsonar.pullrequest.branch="$BRANCH"
    -Dsonar.pullrequest.base="$BASE"
  )
elif [[ -n "$BRANCH" && "$BRANCH" != "main" && "$BRANCH" != "master" && "$BRANCH" != "develop" ]]; then
  MODE="branch"
  SCANNER_PARAMS+=(-Dsonar.branch.name="$BRANCH")
fi

# ── Run preflight ────────────────────────────────────────────────────────────
preflight_auth
validate_token

# ── Banner ───────────────────────────────────────────────────────────────────
echo "=== SonarQube Analysis ($MODE) ==="
echo "  Host:    $SONAR_HOST_URL"
case "$MODE" in
  overall) echo "  Scope:   Overall code (default project view)" ;;
  branch)  echo "  Scope:   Branch '$BRANCH'" ;;
  pr)      echo "  Scope:   PR #$PR ($BRANCH → $BASE)" ;;
esac
echo ""

# ── Run scanner ──────────────────────────────────────────────────────────────
SCANNER_OUTPUT="$(mktemp)"
trap "rm -f '$SCANNER_OUTPUT'" EXIT

sonar-scanner \
  -Dproject.settings=sonar-project.properties \
  -Dsonar.host.url="$SONAR_HOST_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  "${SCANNER_PARAMS[@]}" 2>&1 | tee "$SCANNER_OUTPUT"

scan_exit=${PIPESTATUS[0]}
if [[ $scan_exit -ne 0 ]]; then
  echo "✗ sonar-scanner failed with exit code $scan_exit" >&2
  exit $scan_exit
fi

# ── Wait for report processing ───────────────────────────────────────────────
TASK_ID="$(grep -o 'ce/task?id=[a-f0-9-]*' "$SCANNER_OUTPUT" | sed 's/.*id=//' | head -1 || echo "")"
PROJECT_KEY="$(grep -E '^sonar.projectKey=' sonar-project.properties | head -1 | cut -d= -f2)"

if [[ -z "$TASK_ID" ]]; then
  echo "Warning: could not extract task ID from scanner output. Skipping wait." >&2
  exit 0
fi

echo ""
echo "Waiting for report (task: ${TASK_ID:0:8}...)..."
deadline=$((SECONDS + 180))
while [[ $SECONDS -lt $deadline ]]; do
  sleep 3
  status="$(curl -sf -u "$SONAR_TOKEN:" \
    "${SONAR_HOST_URL%/}/api/ce/task?id=$TASK_ID" 2>/dev/null \
    | python3 -c "import sys,json
try:
  d=json.load(sys.stdin); print(d.get('task',{}).get('status','UNKNOWN'))
except: print('ERROR')" 2>/dev/null || echo "ERROR")"
  case "$status" in
    SUCCESS) break ;;
    FAILED|CANCELED)
      echo "✗ Report processing $status" >&2
      exit 1
      ;;
  esac
done

# ── Build issues query URL ───────────────────────────────────────────────────
ISSUES_URL="${SONAR_HOST_URL%/}/api/issues/search?componentKeys=$PROJECT_KEY&statuses=OPEN,CONFIRMED&ps=100"
DASH_URL="${SONAR_HOST_URL%/}/dashboard?id=$PROJECT_KEY"

case "$MODE" in
  pr)
    ISSUES_URL="${ISSUES_URL}&pullRequest=$PR"
    DASH_URL="${SONAR_HOST_URL%/}/dashboard?id=$PROJECT_KEY&pullRequest=$PR"
    ;;
  branch)
    ISSUES_URL="${ISSUES_URL}&branch=$BRANCH"
    DASH_URL="${SONAR_HOST_URL%/}/dashboard?id=$PROJECT_KEY&branch=$BRANCH"
    ;;
esac

# ── Fetch + format results ───────────────────────────────────────────────────
echo ""
echo "=== Results ==="
curl -sf -u "$SONAR_TOKEN:" "$ISSUES_URL" 2>/dev/null | python3 - "$DASH_URL" "$MODE" <<'PY'
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print("  Error: could not parse SonarQube response")
    sys.exit(2)

dash_url, mode = sys.argv[1], sys.argv[2]
total = data.get('total', 0)

if total == 0:
    label = "in this PR" if mode == "pr" else ("on this branch" if mode == "branch" else "overall")
    print(f"  ✓ No issues found {label}.")
    print()
    print(f"Dashboard: {dash_url}")
    sys.exit(0)

severity_order = {'BLOCKER': 0, 'CRITICAL': 1, 'HIGH': 2, 'MAJOR': 2, 'MEDIUM': 3, 'MINOR': 4, 'LOW': 4, 'INFO': 5}
issues = sorted(
    data.get('issues', []),
    key=lambda i: severity_order.get(
        (i.get('impacts') or [{}])[0].get('severity', i.get('severity', 'INFO')),
        99
    )
)

label = "in this PR" if mode == "pr" else ("on this branch" if mode == "branch" else "overall")
print(f"  {total} issue(s) found {label}:")
print()

for i in issues:
    impacts = i.get('impacts') or [{}]
    sev = impacts[0].get('severity') or i.get('severity', '?')
    component = i.get('component', '').split(':')[-1]
    line = i.get('line', '?')
    msg = i.get('message', '')
    rule = i.get('rule', '')
    print(f"  [{sev}] {component}:{line}")
    print(f"    {msg}")
    print(f"    Rule: {rule}")
    print()

print(f"Dashboard: {dash_url}")
# Non-zero exit only blocks if PR/branch mode → preserves "Clean as You Code"
sys.exit(1 if mode in ("pr", "branch") and total > 0 else 0)
PY
