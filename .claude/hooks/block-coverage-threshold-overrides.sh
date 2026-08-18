#!/usr/bin/env bash
# PreToolUse/Bash hook — prevents weakening the required coverage thresholds.
#
# `COVERAGE_MINIMUM` and `COVERAGE_TOLERANCE` are intentionally configurable
# for CI, but an override in an agent-run command can make `git push` bypass the
# local coverage gate. Threshold changes belong in the reviewed repository
# configuration, not in an ad-hoc shell environment.
#
# Requires: jq

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$CMD" ]; then
  exit 0
fi

# Return 0 only when a shell segment actually assigns or exports one of the
# protected variables. Anchoring command forms avoids matching prose, comments,
# grep patterns, or an argument such as `echo COVERAGE_MINIMUM=70`.
is_threshold_override() {
  local seg="$1"

  # A quoted mention is data, not a shell assignment.
  seg=$(printf '%s' "$seg" | sed -e "s/'[^']*'/''/g" -e 's/"[^\"]*"/""/g')
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*//')

  # Direct assignments, including `COVERAGE_MINIMUM=60 git push`.
  printf '%s' "$seg" | grep -Eq '^(COVERAGE_MINIMUM|COVERAGE_TOLERANCE)=' && return 0

  # `export` and `readonly` make the override available to a later push in the
  # same shell. `env` supplies it to its child process directly.
  printf '%s' "$seg" | grep -Eq '^(export|readonly)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*(COVERAGE_MINIMUM|COVERAGE_TOLERANCE)(=|[[:space:]]|$)' && return 0
  printf '%s' "$seg" | grep -Eq '^env([[:space:]]+[^[:space:]]+)*[[:space:]]+(COVERAGE_MINIMUM|COVERAGE_TOLERANCE)=' && return 0

  return 1
}

# Split shell chains so `export COVERAGE_MINIMUM=60; git push` is still caught.
SEGMENTS=$(printf '%s' "$CMD" | tr ';|&\n' '\n')

while IFS= read -r SEGMENT; do
  if is_threshold_override "$SEGMENT"; then
    REASON="Blocked: coverage thresholds cannot be overridden from an agent-run shell command.

Offending command:
  ${SEGMENT#"${SEGMENT%%[![:space:]]*}"}

COVERAGE_MINIMUM and COVERAGE_TOLERANCE protect the pre-push and Jenkins
coverage gate. Changing them in the environment can lower the required result
without a reviewed configuration change.

Do this instead:
  1. Add or improve tests until the configured gate passes.
  2. If the policy itself needs to change, update the reviewed default in
     run-sonar.sh and its documentation in a dedicated change.
  3. Do not use an environment override to bypass the gate.

This hook only restricts agent-run Bash commands."

    jq -cn --arg r "$REASON" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $r
      }
    }'
    exit 0
  fi
done <<EOF
$SEGMENTS
EOF

exit 0
