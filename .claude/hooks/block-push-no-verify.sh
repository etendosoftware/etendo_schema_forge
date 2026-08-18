#!/usr/bin/env bash
# PreToolUse/Bash hook — denies `git push --no-verify` from the Bash tool.
#
# Rationale: --no-verify skips .githooks/pre-push, the only local gate that runs
# the test / coverage / Sonar checks before a branch reaches CI. Skipping it
# moves the failure into a 1h+ Jenkins run instead of catching it in seconds.
#
# Scope: `push` only. `git commit --no-verify` stays allowed (documented as OK
# for WIP commits). `git push -n` is --dry-run, not --no-verify, so it passes.
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

# Is this ONE shell segment a real `git push --no-verify` invocation?
# Returns 0 (deny) only for an actual command, never for the flag appearing as
# text — a commit message, doc string or grep pattern that mentions it must pass.
is_bypassing_push() {
  local seg="$1"

  # 1. Blank out quoted spans. `git commit -m "never git push --no-verify"` is a
  #    commit about the rule, not a use of it.
  seg=$(printf '%s' "$seg" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g')

  # 2. Drop leading whitespace and any VAR=value prefixes, so `HUSKY=0 git push
  #    --no-verify` is still seen as a git invocation.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//')

  # 3. The segment must actually START with git — this is what separates a
  #    command from a string that merely contains the words.
  case "$seg" in
    git | git[[:space:]]* | */git | */git[[:space:]]*) ;;
    *) return 1 ;;
  esac

  # 4. `push` as a bare word (not `--push-option`, not part of a path).
  printf '%s' "$seg" | grep -Eq '(^|[[:space:]])push([[:space:]]|$)' || return 1

  # 5. The bypass flag itself. `-n` is deliberately absent: on push that means
  #    --dry-run, which is harmless.
  printf '%s' "$seg" | grep -Eq '(^|[[:space:]])--no-verify([[:space:]]|=|$)' || return 1

  return 0
}

# Split on shell separators (; | & newline) so `cd x && git push --no-verify` is
# still caught, while `git push` and `--no-verify` landing in two unrelated
# segments of one command line is not a false positive.
SEGMENTS=$(printf '%s' "$CMD" | tr ';|&\n' '\n')

while IFS= read -r SEGMENT; do
  if is_bypassing_push "$SEGMENT"; then
    REASON="Blocked: 'git push --no-verify' skips the .githooks/pre-push gate.

Offending command:
  ${SEGMENT#"${SEGMENT%%[![:space:]]*}"}

That gate is the only local check that catches failing tests, coverage drops and
Sonar regressions before CI. Bypassing it turns a seconds-long local failure
into a long Jenkins cycle.

Do this instead:
  1. Run the push without --no-verify and read the gate's output.
  2. Fix what it reports (that IS the task, not an obstacle to the task).
  3. If the gate itself is broken, say so and stop — do not route around it.

If a bypass is genuinely required, the human runs it themselves in their own
terminal; this hook only restricts the Bash tool."

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
