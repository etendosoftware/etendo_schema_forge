#!/usr/bin/env bash
# Runs the canonical pre-push hook in a persistent Kubernetes runner.
# Credentials are copied only to the runner pod's ephemeral /tmp volume.
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

REPO_DIR="$(git rev-parse --show-toplevel)"
KUBECONFIG_PATH="${PREPUSH_KUBECONFIG:-}"
DEVELOPER_EMAIL="${PREPUSH_DEVELOPER_EMAIL:-$(git -C "$REPO_DIR" config user.email 2>/dev/null || true)}"
DEVELOPER_SLUG="$(printf '%s' "$DEVELOPER_EMAIL" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//; s/-*$//')"
[[ -n "${PREPUSH_NAMESPACE:-}" || -n "$DEVELOPER_SLUG" ]] || \
  fail "Git user.email is required to derive the personal runner namespace; set PREPUSH_NAMESPACE to override it."
NAMESPACE="${PREPUSH_NAMESPACE:-prepush-$DEVELOPER_SLUG}"
DEPLOYMENT="${PREPUSH_DEPLOYMENT:-prepush-runner}"
KUBE_CONTEXT="${PREPUSH_KUBE_CONTEXT:-}"
USER_NPMRC="${PREPUSH_NPMRC:-}"
SONAR_ENV_FILE="${PREPUSH_SONAR_ENV_FILE:-$REPO_DIR/.env}"
GO_REPO="${PREPUSH_GO_REPO:-}"
SONAR_SCANNER_VERSION="7.1.0.4889"
RUN_ID="prepush-$(date -u +%Y%m%dT%H%M%SZ)"
ZERO_SHA="0000000000000000000000000000000000000000"
LOCAL_BUNDLE="${TMPDIR:-/tmp}/$RUN_ID.bundle"

command -v kubectl >/dev/null 2>&1 || fail "kubectl is not available in PATH."
command -v git >/dev/null 2>&1 || fail "git is not available in PATH."
[[ -n "$KUBECONFIG_PATH" ]] || fail "PREPUSH_KUBECONFIG is required in cloud mode."
[[ -f "$KUBECONFIG_PATH" ]] || fail "kubeconfig not found: $KUBECONFIG_PATH"
[[ -f "$SONAR_ENV_FILE" ]] || fail "Sonar environment file not found: $SONAR_ENV_FILE"

if [[ -z "$USER_NPMRC" ]]; then
  command -v npm >/dev/null 2>&1 || fail "PREPUSH_NPMRC is unset and npm is unavailable to resolve the global npmrc."
  USER_NPMRC="$(npm config get userconfig 2>/dev/null || true)"
  [[ "$USER_NPMRC" != "undefined" && "$USER_NPMRC" != "null" ]] || USER_NPMRC=""
fi
[[ -n "$USER_NPMRC" && -f "$USER_NPMRC" ]] || \
  fail "npm credentials file not found. Set PREPUSH_NPMRC or configure npm's global userconfig."

KUBECTL_ARGS=(--kubeconfig "$KUBECONFIG_PATH")
[[ -n "$KUBE_CONTEXT" ]] && KUBECTL_ARGS+=(--context "$KUBE_CONTEXT")
kube() { kubectl "${KUBECTL_ARGS[@]}" "$@"; }
RUNNER_STARTED=0
cleanup_local() {
  local exit_status=$?
  rm -f "$LOCAL_BUNDLE"
  if [[ "$RUNNER_STARTED" == "1" ]]; then
    echo "Releasing personal runner compute (PVC cache is retained)..."
    kube scale "deployment/$DEPLOYMENT" -n "$NAMESPACE" --replicas=0 >/dev/null || \
      echo "WARNING: could not scale down $NAMESPACE/$DEPLOYMENT; scale it manually." >&2
  fi
  return "$exit_status"
}
trap cleanup_local EXIT

ensure_runner_provisioned() {
  if kube get "deployment/$DEPLOYMENT" -n "$NAMESPACE" >/dev/null 2>&1; then
    return
  fi
  echo "      provisioning personal runner and persistent cache..."
  PREPUSH_KUBECONFIG="$KUBECONFIG_PATH" \
    PREPUSH_KUBE_CONTEXT="$KUBE_CONTEXT" \
    PREPUSH_NAMESPACE="$NAMESPACE" \
    PREPUSH_DEPLOYMENT="$DEPLOYMENT" \
    PREPUSH_DEVELOPER_EMAIL="$DEVELOPER_EMAIL" \
    PREPUSH_PVC="${PREPUSH_PVC:-runner-state}" \
    PREPUSH_CACHE_SIZE="${PREPUSH_CACHE_SIZE:-20Gi}" \
    "$REPO_DIR/scripts/provision-remote-prepush-runner.sh"
}

# Git calls a pre-push hook with one line per ref on stdin. Cloud mode supports
# exactly one branch update: a multi-ref push must be split so every invocation
# has an unambiguous checkout and log. A terminal invocation is a manual run.
if [[ -t 0 ]]; then
  BRANCH="$(git -C "$REPO_DIR" branch --show-current)"
  [[ -n "$BRANCH" ]] || fail "a named Git branch is required."
  LOCAL_REF="refs/heads/$BRANCH"
  LOCAL_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"
  REMOTE_REF="$LOCAL_REF"
  REMOTE_SHA="$(git -C "$REPO_DIR" rev-parse --verify "refs/remotes/origin/$BRANCH" 2>/dev/null || true)"
else
  IFS=' ' read -r LOCAL_REF LOCAL_SHA REMOTE_REF REMOTE_SHA || fail "expected Git pre-push ref input."
  if IFS= read -r extra_ref; then
    fail "cloud pre-push supports one ref update per push; push refs separately."
  fi
  BRANCH="${LOCAL_REF#refs/heads/}"
  [[ "$LOCAL_REF" == refs/heads/* && -n "$BRANCH" ]] || fail "only named branch updates are supported in cloud mode."
fi
[[ -n "${REMOTE_SHA:-}" ]] || REMOTE_SHA="$ZERO_SHA"
[[ "$LOCAL_SHA" != "$ZERO_SHA" ]] || fail "branch deletion is not a validation target."

if [[ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=all)" ]]; then
  fail "the canonical pre-push requires a clean worktree; commit or stash changes first."
fi

wait_for_runner() {
  ensure_runner_provisioned
  echo "      starting personal runner..."
  kube scale "deployment/$DEPLOYMENT" -n "$NAMESPACE" --replicas=1 >/dev/null
  RUNNER_STARTED=1
  kube rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=300s >/dev/null
}

resolve_runner_pod() {
  local pod deadline=$((SECONDS + 300))
  while (( SECONDS < deadline )); do
    # A prior pod may still be Terminating while its RWO PVC detaches. Select
    # the newest Running pod, not the first label match, then wait on that exact
    # pod so an old Ready pod can never receive the transient bundle/credentials.
    pod="$(kube get pods -l "app.kubernetes.io/name=$DEPLOYMENT" \
      --field-selector=status.phase=Running -n "$NAMESPACE" \
      --sort-by=.metadata.creationTimestamp -o name 2>/dev/null | tail -n 1 | sed 's#pod/##' || true)"
    if [[ -n "$pod" ]] && kube wait --for=condition=Ready "pod/$pod" -n "$NAMESPACE" --timeout=10s >/dev/null 2>&1; then
      printf '%s\n' "$pod"
      return
    fi
    sleep 2
  done
  fail "no running runner pod was available after 300 seconds."
}

echo "[1/8] Checking the Kubernetes runner..."
wait_for_runner
RUNNER_POD="$(resolve_runner_pod)"
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu 'node --version | grep -Eq "^v22\\."' || \
  fail "the remote runner must use Node.js 22."

echo "[2/8] Creating a Git bundle with the branch and required base refs..."
BUNDLE_REFS=("$LOCAL_REF")
for candidate in "refs/remotes/origin/$BRANCH" "refs/remotes/origin/epic/ETP-3504" \
  "refs/remotes/origin/develop" "refs/remotes/origin/main"; do
  git -C "$REPO_DIR" rev-parse --verify --quiet "$candidate" >/dev/null && BUNDLE_REFS+=("$candidate")
done
git -C "$REPO_DIR" bundle create "$LOCAL_BUNDLE" "${BUNDLE_REFS[@]}"
echo "      bundle size: $(du -h "$LOCAL_BUNDLE" | cut -f1)"

echo "[3/8] Uploading bundle and ephemeral credentials..."
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu '
  rm -rf /state/source
  mkdir -p /state/source /state/npm-cache /state/sonar-cache "/state/runs/$1" /state/tools
  rm -f /tmp/prepush-repo.bundle /tmp/prepush-user.npmrc /tmp/prepush-sonar.env
' sh "$RUN_ID"
kube exec -i -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu 'umask 077; cat > /tmp/prepush-repo.bundle' < "$LOCAL_BUNDLE"
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu 'test -s /tmp/prepush-repo.bundle' || \
  fail "bundle upload did not reach the selected runner pod."
kube exec -i -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu 'umask 077; cat > /tmp/prepush-user.npmrc' < "$USER_NPMRC"
awk -F= '$1 == "SONAR_HOST_URL" || $1 == "SONAR_TOKEN" { print }' "$SONAR_ENV_FILE" |
  kube exec -i -n "$NAMESPACE" "pod/$RUNNER_POD" -- sh -ceu 'umask 077; cat > /tmp/prepush-sonar.env'

echo "[4/8] Cloning the exact Git state inside the runner..."
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- bash -ceu '
  git clone -q /tmp/prepush-repo.bundle /state/source
  cd /state/source
  git checkout -q -B "$1" "$2"
  if [[ "$3" == "$4" ]]; then git update-ref -d "refs/remotes/origin/$1" || true
  else git update-ref "refs/remotes/origin/$1" "$3"; fi
' bash "$BRANCH" "$LOCAL_SHA" "$REMOTE_SHA" "$ZERO_SHA"

echo "[5/8] Uploading optional com.etendoerp.go sourcedata..."
GO_SOURCE_DIR=""
if [[ -n "$GO_REPO" ]]; then
  [[ "$GO_REPO" = /* ]] || GO_REPO="$REPO_DIR/$GO_REPO"
  GO_CANDIDATES=("$GO_REPO" "$GO_REPO/modules/com.etendoerp.go")
else
  # The validating checkout may be a Git worktree. Its companion Etendo module
  # is configured beside the primary worktree, not inside every child worktree.
  PRIMARY_REPO_DIR="$(git -C "$REPO_DIR" worktree list --porcelain | awk '$1 == "worktree" { print substr($0, 10); exit }')"
  GO_CANDIDATES=(
    "$REPO_DIR/etendo_core/modules/com.etendoerp.go"
    "$PRIMARY_REPO_DIR/etendo_core/modules/com.etendoerp.go"
  )
fi
for candidate in "${GO_CANDIDATES[@]}"; do
  if [[ -d "$candidate/src-db/database/sourcedata" ]]; then
    GO_SOURCE_DIR="$candidate"
    break
  fi
done
[[ -n "$GO_SOURCE_DIR" ]] || \
  fail "com.etendoerp.go sourcedata not found in the current or primary Git worktree. Set PREPUSH_GO_REPO only for a non-standard layout."

kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- mkdir -p /state/source/etendo_core/modules/com.etendoerp.go
tar -C "$GO_SOURCE_DIR" -cf - src-db/database/sourcedata |
  kube exec -i -n "$NAMESPACE" "pod/$RUNNER_POD" -- tar -xf - -C /state/source/etendo_core/modules/com.etendoerp.go
echo "      com.etendoerp.go sourcedata uploaded."

echo "[6/8] Ensuring the pinned SonarScanner is available..."
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- bash -ceu '
  target="/state/tools/sonar-scanner-$1-linux-x64"
  if [[ ! -x "$target/bin/sonar-scanner" ]]; then
    archive=/tmp/sonar-scanner.zip
    curl --fail --silent --show-error --location \
      "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$1-linux-x64.zip" --output "$archive"
    rm -rf "$target"; unzip -q "$archive" -d /state/tools; rm -f "$archive"
  fi
  "$target/bin/sonar-scanner" --version >/dev/null
' bash "$SONAR_SCANNER_VERSION"

echo "[7/8] Running the repository's canonical .githooks/pre-push..."
set +e
kube exec -n "$NAMESPACE" "pod/$RUNNER_POD" -- bash -ceu '
  run_dir="/state/runs/$1"
  cleanup_secrets() { rm -f /tmp/prepush-user.npmrc /tmp/prepush-sonar.env /tmp/prepush-repo.bundle; }
  trap cleanup_secrets EXIT
  set -a; source /tmp/prepush-sonar.env; set +a
  export NPM_CONFIG_USERCONFIG=/tmp/prepush-user.npmrc NPM_CONFIG_CACHE=/state/npm-cache SONAR_USER_HOME=/state/sonar-cache
  export VITE_CACHE_DIR=/state/vite-cache/schema-forge
  export LANG=C.UTF-8 LC_ALL=C.UTF-8 PRE_PUSH_CACHE=0 HOOKS_VERIFY_SKIP=1
  export PATH="/state/tools/sonar-scanner-$7-linux-x64/bin:$PATH"
  cd /state/source
  set +e; set -o pipefail
  printf "%s %s %s %s\n" "$3" "$4" "$5" "$6" | bash .githooks/pre-push origin unused 2>&1 | tee "$run_dir/pre-push.log"
  status=${PIPESTATUS[1]}
  set -e
  printf "%s\n" "$status" > "$run_dir/status"
  printf "%s\n" "$4" > "$run_dir/schema-forge.sha"
  printf "%s\n" "$2" > "$run_dir/schema-forge.branch"
  [[ -d sonar-reports ]] && cp -R sonar-reports "$run_dir/" || true
  exit "$status"
' bash "$RUN_ID" "$BRANCH" "$LOCAL_REF" "$LOCAL_SHA" "$REMOTE_REF" "$REMOTE_SHA" "$SONAR_SCANNER_VERSION"
PREPUSH_STATUS=$?
set -e

echo "[8/8] Canonical pre-push result..."
if [[ "$PREPUSH_STATUS" -ne 0 ]]; then
  echo "FAIL: canonical pre-push exited with status $PREPUSH_STATUS." >&2
  echo "Remote log: /state/runs/$RUN_ID/pre-push.log" >&2
  exit "$PREPUSH_STATUS"
fi
printf '\nPASS: canonical cloud pre-push passed.\nRun: %s\nRunner pod: %s\nRemote log: /state/runs/%s/pre-push.log\n' \
  "$RUN_ID" "$RUNNER_POD" "$RUN_ID"
