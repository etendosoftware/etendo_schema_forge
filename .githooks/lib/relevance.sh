#!/usr/bin/env bash
# .githooks/lib/relevance.sh
#
# Single source of truth for "which checks does a change require?" in this repo.
# Sourced by BOTH commit-msg (to stamp the per-push `Checks:` trailer) and pre-push
# (to decide which steps to run), so the two can never drift apart.
#
#   relevance_checks : reads changed-file paths (one per line) on stdin and prints
#                      the required checks as space-separated tokens, a subset of:
#                        npm testid tests regen xml pw-mocked pw-integration
#                      Empty output = nothing to run (e.g. docs-only change).
#
# Buckets (repo-root-relative):
#   npm            ← package.json, package-lock.json
#   testid         ← tools/app-shell/src/**, the data-testid checker
#   tests          ← app-shell src+test, cli/**, **/__tests__/**, sonar-project.properties,
#                    package.json, package-lock.json (a dependency bump, e.g. the core's),
#                    and the repo tooling: scripts/**, .github/**, .claude/hooks/**. The tests
#                    step selects the tests that cover them (scripts/select-tests.js, which runs
#                    every unit group when its own infrastructure changes); CI validates the
#                    workflows themselves.
#   regen / xml    ← artifacts/**, cli/**, package-lock.json
#   pw-mocked      ← app-shell/src (UI), *.mocked.spec.js, shared e2e infra, e2e/quarantine.json,
#                    package.json, package-lock.json
#   pw-integration ← app-shell/src (UI), any non-mocked spec, shared e2e infra, package.json,
#                    package-lock.json
#
#   relevance_mocked_specs : the changed *.mocked.spec.js files when they alone call for the mocked
#                      suite, so the pre-push runs just those; nothing when the whole suite must run.
#   RUN-ALL (.githooks/**, run-sonar.sh, and the scripts that run the pre-push's Playwright
#     suites or the whole hook: scripts/run-e2e-full.sh, scripts/run-remote-prepush.sh) or any
#     UNRECOGNISED file → all of them.
#   SAFE (docs, images, Makefile, .gitignore) and the agent configuration and its mirrors
#     (.claude/ except hooks/, .codex/, .omp/, .opencode/, .agents/) → nothing.
# Generated code lives under artifacts/<window>/generated/, so tools/app-shell/src
# is hand-written source and does NOT trigger the regen/xml checks.

RELEVANCE_RE_RUN_ALL='^\.githooks/|^run-sonar\.sh$|^scripts/run-(e2e-full|remote-prepush)\.sh$'
RELEVANCE_RE_SAFE='(^|/)[^/]*\.md$|^docs/|(^|/)LICENSE|^\.gitignore$|^\.gitattributes$|\.(png|jpe?g|gif|svg|ico|webp)$|^Makefile$'
RELEVANCE_RE_NPM='^package\.json$|^package-lock\.json$'
RELEVANCE_RE_TESTID='^tools/app-shell/src/|^scripts/check-add-data-testid\.sh$'
RELEVANCE_RE_TESTS='^tools/app-shell/src/|^tools/app-shell/test/|^cli/|/__tests__/|^sonar-project\.properties$|^package\.json$|^package-lock\.json$|^scripts/|^\.github/|^\.claude/hooks/'
RELEVANCE_RE_REGEN='^artifacts/|^cli/|^package-lock\.json$'
RELEVANCE_RE_XML='^artifacts/|^cli/|^package-lock\.json$'
RELEVANCE_RE_E2E='^e2e/'
RELEVANCE_RE_AGENTS='^\.(claude|codex|omp|opencode|agents)/'
RELEVANCE_RE_KNOWN="${RELEVANCE_RE_RUN_ALL}|${RELEVANCE_RE_SAFE}|${RELEVANCE_RE_NPM}|${RELEVANCE_RE_TESTID}|${RELEVANCE_RE_TESTS}|${RELEVANCE_RE_REGEN}|${RELEVANCE_RE_XML}|${RELEVANCE_RE_E2E}|${RELEVANCE_RE_AGENTS}"

# relevance_checks < changed-files-on-stdin  → prints the token subset.
relevance_checks() {
  local files
  files="$(grep -Ev '^[[:space:]]*$' || true)"   # read stdin, drop blank lines
  [ -n "$files" ] || return 0                     # nothing changed → no checks

  # Golden rule: any file matching NO known bucket, OR a RUN-ALL tooling file →
  # run everything.
  if printf '%s\n' "$files" | grep -Evq "$RELEVANCE_RE_KNOWN" \
     || printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_RUN_ALL"; then
    printf 'npm testid tests regen xml pw-mocked pw-integration'
    return 0
  fi

  local out=""
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_NPM"    && out="$out npm"
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_TESTID" && out="$out testid"
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_TESTS"  && out="$out tests"
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_REGEN"  && out="$out regen"
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_XML"    && out="$out xml"

  # Playwright is split by suite. UI source drives both; a modified spec runs its
  # own suite (integration owns every non-mocked spec); shared e2e infra → both.
  local mocked=0 integ=0
  printf '%s\n' "$files" | grep -Eq '^tools/app-shell/src/' && { mocked=1; integ=1; }
  # A dependency change (a core bump above all) can break anything the app renders.
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_NPM" && { mocked=1; integ=1; }
  printf '%s\n' "$files" | grep -qE '^e2e/.*\.mocked\.spec\.js$' && mocked=1
  # Any non-mocked e2e spec → integration. The trailing `grep -q .` is required:
  # on empty input (no e2e spec at all) BSD grep's `-qv` returns 0 (false positive),
  # so we instead demand at least one line actually survive the inverse filter.
  printf '%s\n' "$files" | grep -E '^e2e/.*\.spec\.js$' | grep -vE '\.mocked\.spec\.js$' | grep -q . && integ=1
  printf '%s\n' "$files" | grep -qE '^e2e/(playwright\.config\.js|package\.json|tests/helpers/)' && { mocked=1; integ=1; }
  # The quarantine list changes which mocked tests gate (docs/testing/flaky-tests.md).
  printf '%s\n' "$files" | grep -qE '^e2e/quarantine\.json$' && mocked=1
  [ "$mocked" = 1 ] && out="$out pw-mocked"
  [ "$integ" = 1 ]  && out="$out pw-integration"

  printf '%s' "${out# }"
}

# relevance_mocked_specs < changed-files-on-stdin → the changed *.mocked.spec.js paths, one per line,
# when nothing but them calls for the mocked suite; nothing at all when the whole suite must run
# (UI source, e2e infrastructure, the quarantine list, dependencies, tooling or an unknown file).
relevance_mocked_specs() {
  local files
  files="$(grep -Ev '^[[:space:]]*$' || true)"
  [ -n "$files" ] || return 0
  printf '%s\n' "$files" | grep -Evq "$RELEVANCE_RE_KNOWN" && return 0
  printf '%s\n' "$files" | grep -Eq "$RELEVANCE_RE_RUN_ALL|$RELEVANCE_RE_NPM|^tools/app-shell/src/" && return 0
  printf '%s\n' "$files" | grep -Eq '^e2e/(playwright\.config\.js|package\.json|tests/helpers/|quarantine\.json$)' && return 0
  printf '%s\n' "$files" | grep -E '^e2e/.*\.mocked\.spec\.js$' || true
}
