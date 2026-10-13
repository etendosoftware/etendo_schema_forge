#!/usr/bin/env bash
# Runs only the unit tests a change can affect (ETP-5695): `make test-changed` for the inner loop,
# `make test-changed-coverage` for the pre-push, which hands the LCOV to Sonar. The selection is
# scripts/select-tests.js against BASE (default origin/develop); the full suite still runs in CI.
#
#   BASE=<ref>   what the change is measured against (three-dot diff: from the merge-base)
#   HEAD_REF=<ref>  the other end of that diff (default HEAD; the tests run from the checkout)
#   PLAN=1       print the selection and stop
#   --coverage   write coverage/<group>-lcov.info and coverage/merged-lcov.info, like
#                `make test-all-coverage` does for the whole suite
#
# The groups run one after another, not in parallel like `make test-all-coverage`: a selection is
# usually small, and running five Node test processes next to vitest saturates a laptop's CPU.
# Every selected group runs even when an earlier one fails; the exit status reports any failure.
set -uo pipefail

cd "$(dirname "$0")/.."
BASE="${BASE:-origin/develop}"
COVERAGE=0
[ "${1:-}" = "--coverage" ] && COVERAGE=1

WORK_DIR="tmp/test-changed"
PLAN_FILE="$WORK_DIR/plan.tsv"
mkdir -p "$WORK_DIR" coverage

node scripts/select-tests.js --base "$BASE" --head "${HEAD_REF:-HEAD}" --out "$PLAN_FILE" || exit 1
[ "${PLAN:-0}" = "1" ] && exit 0

if [ "$COVERAGE" = "1" ]; then
  rm -f coverage/*-lcov.info coverage/merged-lcov.info
fi

# Test files of one group in the plan, or "*" when the whole group was selected.
plan_files() {
  awk -F'\t' -v g="$1" '$1 == g { print $2 }' "$PLAN_FILE"
}

# The whole group, with the same find command `make test-all-coverage` uses.
whole_group() {
  case "$1" in
    cli) find cli/test -name '*.test.js' ;;
    appshell) find tools/app-shell/src -path '*/__tests__/*.test.js' ! -name 'useEntity-helpers.test.js' ;;
    appshell-test) find tools/app-shell/test -name '*.test.js' ;;
    artifacts) find artifacts -path '*/__tests__/*.test.js' ;;
    scripts) find scripts/__tests__ -name '*.test.js' ;;
  esac
}

FAILED=""

run_node_group() {
  local group="$1" files
  files="$(plan_files "$group")"
  [ -n "$files" ] || return 0
  [ "$files" = "*" ] && files="$(whole_group "$group")"
  local -a args=(--test --test-reporter=spec --test-reporter-destination=stdout)
  if [ "$COVERAGE" = "1" ]; then
    args=(--test --experimental-test-coverage --test-reporter=spec --test-reporter-destination=stdout
      --test-reporter=lcov "--test-reporter-destination=coverage/${group}-lcov.info")
  fi
  echo "=== Node tests: $group ($(printf '%s\n' "$files" | wc -l | tr -d ' ') file(s)) ==="
  # shellcheck disable=SC2046 # one test file per line, paths without spaces
  if ! node "${args[@]}" $(printf '%s\n' "$files") > "coverage/${group}.log" 2>&1; then
    echo "$group tests FAILED:"
    tail -30 "coverage/${group}.log"
    FAILED="$FAILED $group"
  fi
}

run_vitest() {
  local files
  files="$(plan_files vitest)"
  [ -n "$files" ] || return 0
  local -a filters=()
  # vitest filters match path substrings relative to tools/app-shell; none means the whole suite.
  [ "$files" != "*" ] && while IFS= read -r f; do filters+=("${f#tools/app-shell/}"); done <<< "$files"
  echo "=== Vitest ($([ "$files" = "*" ] && echo all || echo "${#filters[@]}") file(s)) ==="
  if [ "$COVERAGE" = "1" ]; then
    if ( cd tools/app-shell && npx vitest run --coverage --coverage.reporter=lcov ${filters[@]+"${filters[@]}"} ); then
      sed 's|^SF:src/|SF:tools/app-shell/src/|' tools/app-shell/coverage/vitest/lcov.info > coverage/vitest-lcov.info
    else
      FAILED="$FAILED vitest"
    fi
  else
    ( cd tools/app-shell && npx vitest run ${filters[@]+"${filters[@]}"} ) || FAILED="$FAILED vitest"
  fi
}

for group in cli appshell appshell-test artifacts scripts; do
  run_node_group "$group"
done
run_vitest

if [ ! -s "$PLAN_FILE" ]; then
  echo "test-changed: no unit test is affected by the changes since $BASE"
fi

if [ "$COVERAGE" = "1" ]; then
  if ls coverage/*-lcov.info >/dev/null 2>&1; then
    node scripts/merge-lcov.js 'coverage/*-lcov.info' coverage/merged-lcov.info
  else
    : > coverage/merged-lcov.info
  fi
fi

if [ -n "$FAILED" ]; then
  echo "test-changed: FAILED in:$FAILED"
  exit 1
fi
echo "test-changed: all selected unit tests passed"
