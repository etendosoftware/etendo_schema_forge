#!/usr/bin/env bash
# scripts/run-e2e-full.sh
#
# Same Playwright invocation `.githooks/pre-push`'s run_playwright() uses for
# the "mocked" step and the "integration" step — same projects, same spec
# filter, same env var defaults — but unconditionally (no RUN_PW_MOCKED /
# RUN_PW_INTEGRATION relevance-gating: that's pre-push's optimization to skip
# suites an unrelated diff can't affect, not appropriate for an explicit
# `make test-e2e-headless` invocation where the caller wants everything run).
#
# Unlike pre-push (which assumes a developer's own `make dev` is already up on
# :3100), this script owns the whole server lifecycle: it builds a dedicated
# E2E_BUILD bundle (no PWA/service worker — see vite.config.js's E2E_BUILD
# comment for why that combination blanks the page), serves it with
# `vite preview` on its own port, waits for it, runs both suites against it,
# and always tears the server down on exit. A pre-built static bundle serves
# requests under Playwright's parallel load with far less CPU/memory than
# `vite dev`'s per-request transform + HMR — hence building once here instead
# of requiring a long-lived dev server.
#
# Overridable, same names as pre-push: E2E_PASSWORD, E2E_BACKEND_URL.
# E2E_PORT picks the dedicated server port (default 4173, Vite's own preview
# default) — deliberately NOT 3100, so this never fights a developer's own
# `make dev`/`make preview` running for manual testing.
# E2E_SUITE=mocked|integration|all (default all) restricts which suite(s) run —
# e.g. E2E_SUITE=integration to skip the mocked pass and go straight to the
# live-backend specs.
# E2E_FILES optionally selects one or more spec paths relative to e2e/,
# comma-separated. E2E_FILE is accepted as a singular alias.
# E2E_LAST_FAILED=1 passes --last-failed to Playwright and reruns only the
# failed tests recorded by the previous run for the selected project.
#
# No --workers CLI flag: each project in playwright.config.js sets its own,
# non-overridable via CLI, driven by E2E_WORKERS. mocked defaults to 4 (every
# mocked spec is fully intercepted, no shared backend state to race on).
# onboarding-setup/integration default to 1 — every *.integration.spec.js logs
# in with the SAME shared admin credentials against the SAME live
# Etendo/Postgres tenant, so raising E2E_WORKERS above 1 also raises theirs,
# an explicit accepted risk of cross-test data races (see playwright.config.js).
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SHELL_DIR="$REPO_DIR/tools/app-shell"
PASSWORD="${E2E_PASSWORD:-12345}"
BACKEND_URL="${E2E_BACKEND_URL:-http://localhost:8080/etendo}"
E2E_PORT="${E2E_PORT:-4173}"
BASE_URL="http://localhost:${E2E_PORT}"
SUITE="${E2E_SUITE:-all}"
FILES="${E2E_FILES:-${E2E_FILE:-}}"
LAST_FAILED="${E2E_LAST_FAILED:-0}"
case "$SUITE" in
  all|mocked|integration) ;;
  *) echo "❌ E2E_SUITE must be 'all', 'mocked', or 'integration' (got '$SUITE')." >&2; exit 1 ;;
esac

PREVIEW_PID=""
cleanup() {
  if [ -n "$PREVIEW_PID" ] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# The port is this script's own ephemeral resource (unlike :3100, which a
# developer may have a real `make dev`/`make preview` on) — safe to clear any
# leftover from a previous run that didn't exit cleanly.
existing_pid="$(lsof -tiTCP:"$E2E_PORT" -sTCP:LISTEN 2>/dev/null || true)"
[ -n "$existing_pid" ] && kill $existing_pid 2>/dev/null || true

mkdir -p "$REPO_DIR/tmp"
PREVIEW_LOG="$REPO_DIR/tmp/e2e-preview.log"

echo "==> Building E2E bundle (no PWA/service worker; log: tmp/e2e-build.log)..."
BUILD_LOG="$REPO_DIR/tmp/e2e-build.log"
if ! ( cd "$APP_SHELL_DIR" && npm run build:e2e ) > "$BUILD_LOG" 2>&1; then
  echo "❌ Build failed. Last 40 lines of $BUILD_LOG:" >&2
  tail -n 40 "$BUILD_LOG" >&2
  exit 1
fi

echo "==> Starting preview server on :${E2E_PORT} (log: tmp/e2e-preview.log)..."
( cd "$APP_SHELL_DIR" && exec npm run preview:e2e -- --port "$E2E_PORT" --strictPort ) > "$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!

ready=0
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null --max-time 2 "$BASE_URL" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done
if [ "$ready" -ne 1 ]; then
  echo "❌ Preview server did not come up on ${BASE_URL} in time. Last 40 lines of $PREVIEW_LOG:" >&2
  tail -n 40 "$PREVIEW_LOG" >&2
  exit 1
fi

if [ "$SUITE" != "integration" ]; then
  echo "==> Playwright E2E — mocked specs (${E2E_WORKERS:-4} workers — override with E2E_WORKERS)..."
  ( cd "$REPO_DIR/e2e" && CI=true E2E_USE_MOCK=1 BASE_URL="$BASE_URL" \
      npx playwright test --project=mocked )
else
  echo "==> Playwright E2E — mocked specs... SKIPPED (E2E_SUITE=integration)"
fi

if [ "$SUITE" != "mocked" ]; then
  if ! curl -sf -o /dev/null --max-time 10 "$BACKEND_URL" 2>/dev/null; then
    echo "❌ Etendo backend is not reachable at $BACKEND_URL." >&2
    echo "   Bring up Tomcat + PostgreSQL (set E2E_BACKEND_URL if your context path differs), then retry." >&2
    exit 1
  fi

  integration_workers="${E2E_WORKERS:-1}"
  integration_note=""
  [ "$integration_workers" != "1" ] && integration_note=" — ⚠️  shared admin/backend, data-race risk accepted via E2E_WORKERS"
  # onboarding-setup is a real dependency of integration (see playwright.config.js)
  # and both are listed explicitly here — matches the pipelines' own invocation
  # exactly. No --no-deps in the default path: it disables Playwright's ordering
  # guarantee even for explicitly-listed dependencies, so onboarding-setup and
  # integration end up running IN PARALLEL instead of onboarding-setup completing
  # first — the integration specs that rely on onboarding's setup data then fail.
  # --no-deps stays opt-in for the targeted modes below (E2E_FILES/--last-failed),
  # where skipping the full onboarding flow on every quick rerun is the point.
  integration_test_args=(npx playwright test --project=onboarding-setup --project=integration)
  if [ "$LAST_FAILED" = "1" ]; then
    integration_test_args+=(--no-deps --last-failed)
    selection_note=" — last failed"
  elif [ -n "$FILES" ]; then
    integration_test_args+=(--no-deps)
    IFS=',' read -r -a selected_files <<< "$FILES"
    for selected_file in "${selected_files[@]}"; do
      [ -n "$selected_file" ] && integration_test_args+=("$selected_file")
    done
    selection_note=" — files: $FILES"
  else
    integration_test_args+=("integration.spec")
    selection_note=""
  fi
  echo "==> Playwright E2E — integration specs (${integration_workers} workers${integration_note}${selection_note})..."
  # ETP-4798: the email sink is on by default for the integration suite. Registration now stops at
  # the confirm-your-email wall, and the only way past it is to read the link out of the mail the
  # backend actually sent — which means the Etendo Go instance must have
  # etendo.go.email.provider.baseUrl pointed at this sink. See docs/e2e-testing-guide.md.
  # Set E2E_EMAIL_SINK=0 to run against an already-running sink (Playwright will not manage it).
  ( cd "$REPO_DIR/e2e" && CI=true E2E_USE_MOCK=0 E2E_PASSWORD="$PASSWORD" BASE_URL="$BASE_URL" \
      E2E_EMAIL_SINK="${E2E_EMAIL_SINK:-1}" \
      E2E_ONBOARDING_INTEGRATION=1 E2E_SALES_INTEGRATION=1 E2E_FINANCE_INTEGRATION=1 \
      "${integration_test_args[@]}" )
else
  echo "==> Playwright E2E — integration specs... SKIPPED (E2E_SUITE=mocked)"
fi

echo "==> Playwright E2E tests... SUCCESS ✅"
