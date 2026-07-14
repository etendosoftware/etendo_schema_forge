#!/usr/bin/env bash
# merge-block-check.sh — Merge-block pre-flight for a task across the 3 repos.
# Given a task key (ETP-XXXX), finds the feature/ETP-XXXX PR in each repo and
# prints a compact traffic-light table: base, draft, review, mergeable and a
# CI check summary (pass/fail/pending) with the names of any failing checks.
#
# Read-only. Never merges, never pushes, never touches PRs. It is the fast
# path Blockie's pre-flight would take; the actual authorized merge stays manual.
#
# Usage:   ./scripts/merge-block-check.sh <ETP-KEY> [ETP-KEY ...]
# Example: ./scripts/merge-block-check.sh ETP-4442
#          make merge-block-check TASK=ETP-4442
#          make merge-block-check TASK="ETP-4442 ETP-4445"

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <ETP-KEY> [ETP-KEY ...]" >&2
  echo "Example: $0 ETP-4442" >&2
  exit 1
fi

for cmd in gh jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
done

REPOS=(
  "etendosoftware/etendo_schema_forge"
  "etendosoftware/schema_forge_core"
  "etendosoftware/com.etendoerp.go"
)

# Local checkout paths, index-aligned with REPOS. Resolved relative to this
# script so it works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SF_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"          # etendo_schema_forge
DEV_ROOT="$(cd "${SF_ROOT}/.." && pwd)"            # etendo_develop
PATHS=(
  "${SF_ROOT}"
  "${DEV_ROOT}/schema_forge_core"
  "${DEV_ROOT}/modules/com.etendoerp.go"
)

# Current merge-block branch = whatever is checked out in the functional repo.
BLOCK_BRANCH="$(git -C "${SF_ROOT}" branch --show-current 2>/dev/null || echo '')"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Fetch one repo's PR data for a task into a temp file (run in parallel).
fetch_repo() {
  local repo="$1" key="$2" out="$3"
  gh pr list --repo "$repo" --head "feature/${key}" --state open \
    --json number,title,url,baseRefName,headRefName,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup \
    2>/dev/null > "$out" || echo '[]' > "$out"
}

for KEY in "$@"; do
  printf "\n${BOLD}${CYAN}Merge Block check — %s${RESET}\n" "$KEY"
  printf "${DIM}%s${RESET}\n" "$(printf '%.0s─' {1..118})"
  printf "${CYAN}%-26s %-7s %-16s %-6s %-18s %-11s %s${RESET}\n" \
    "repo" "PR" "base" "draft" "review" "mergeable" "CI (ok/fail/pend)"
  printf "${DIM}%s${RESET}\n" "$(printf '%.0s─' {1..118})"

  TMPDIR_RUN=$(mktemp -d)
  # Fetch all 3 repos in parallel.
  i=0
  for REPO in "${REPOS[@]}"; do
    fetch_repo "$REPO" "$KEY" "${TMPDIR_RUN}/${i}.json" &
    i=$((i + 1))
  done
  wait

  FAIL_DETAIL=""
  MERGE_CMDS=""
  i=0
  for REPO in "${REPOS[@]}"; do
    SHORT="${REPO#etendosoftware/}"
    REPO_PATH="${PATHS[$i]}"
    F="${TMPDIR_RUN}/${i}.json"
    i=$((i + 1))

    COUNT=$(jq 'length' "$F")
    if [[ "$COUNT" == "0" ]]; then
      printf "%-26s ${DIM}%-7s %-16s %-6s %-18s %-11s %s${RESET}\n" \
        "$SHORT" "—" "—" "—" "—" "—" "⚪ no open PR"
      continue
    fi

    # If >1 PR on the same head, take the first and flag it.
    MULTI=""
    [[ "$COUNT" -gt 1 ]] && MULTI=" ⚠️x${COUNT}"

    read -r PR BASE DRAFT REVIEW MERGEABLE MERGESTATE <<<"$(jq -r '.[0] |
      ("#" + (.number|tostring)) + " " +
      .baseRefName + " " +
      (if .isDraft then "yes" else "no" end) + " " +
      (.reviewDecision // "—") + " " +
      (.mergeable // "?") + " " +
      (.mergeStateStatus // "?")' "$F")"

    # CI rollup counts.
    read -r OK FAILN PEND <<<"$(jq -r '[.[0].statusCheckRollup[]?] as $c |
      ([$c[] | select((.conclusion // "") | test("SUCCESS|NEUTRAL|SKIPPED"))] | length | tostring) + " " +
      ([$c[] | select((.conclusion // "") | test("FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE"))] | length | tostring) + " " +
      ([$c[] | select(((.status // "") | test("QUEUED|IN_PROGRESS|PENDING|WAITING")) or ((.conclusion // "") == ""))] | length | tostring)' "$F")"

    # Base color: epic good, main/develop bad.
    case "$BASE" in
      epic/*)          BASE_C="${GREEN}" ;;
      main|develop)    BASE_C="${RED}" ;;
      *)               BASE_C="${YELLOW}" ;;
    esac
    # Review color.
    case "$REVIEW" in
      APPROVED)           REV_C="${GREEN}" ;;
      CHANGES_REQUESTED)  REV_C="${RED}" ;;
      *)                  REV_C="${YELLOW}" ;;
    esac
    # Mergeable color.
    case "$MERGEABLE" in
      MERGEABLE) MRG_C="${GREEN}" ;;
      CONFLICTING) MRG_C="${RED}" ;;
      *) MRG_C="${YELLOW}" ;;
    esac
    # CI color.
    if [[ "$FAILN" -gt 0 ]]; then CI_C="${RED}"; CI_ICON="❌"
    elif [[ "$PEND" -gt 0 ]]; then CI_C="${YELLOW}"; CI_ICON="⏳"
    else CI_C="${GREEN}"; CI_ICON="✅"; fi

    printf "%-26s %-7s ${BASE_C}%-16s${RESET} %-6s ${REV_C}%-18s${RESET} ${MRG_C}%-11s${RESET} ${CI_C}%s %s/%s/%s${RESET}%s\n" \
      "$SHORT" "$PR" "$BASE" "$DRAFT" "$REVIEW" "$MERGEABLE" "$CI_ICON" "$OK" "$FAILN" "$PEND" "$MULTI"

    # Collect failing check names for the detail block.
    if [[ "$FAILN" -gt 0 ]]; then
      NAMES=$(jq -r '[.[0].statusCheckRollup[]? |
        select((.conclusion // "") | test("FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE")) |
        (.name // .context // "check")] | join(", ")' "$F")
      FAIL_DETAIL="${FAIL_DETAIL}  ${SHORT} ${PR}: ${NAMES}\n"
    fi

    # Copy-paste merge command into the current block branch (per repo).
    HEAD_REF=$(jq -r '.[0].headRefName' "$F")
    if [[ "$CI_C" == "$GREEN" && "$REV_C" == "$GREEN" && "$MRG_C" == "$GREEN" ]]; then
      READY_TAG="${GREEN}# 🟢 ready${RESET}"
    else
      READY_TAG="${YELLOW}# ⚠️  not all green — review before merging${RESET}"
    fi
    MERGE_CMDS="${MERGE_CMDS}  ${DIM}# ${SHORT}${RESET}  ${READY_TAG}\n"
    MERGE_CMDS="${MERGE_CMDS}  git refresh ${HEAD_REF} && git merge --no-edit ${HEAD_REF}\n"
  done

  if [[ -n "$FAIL_DETAIL" ]]; then
    printf "\n${RED}${BOLD}Failing checks:${RESET}\n"
    printf "${RED}%b${RESET}" "$FAIL_DETAIL"
  fi

  if [[ -n "$MERGE_CMDS" ]]; then
    printf "\n${BOLD}Merge into block branch ${CYAN}%s${RESET}${BOLD} (copy-paste; assumes each repo is on the block branch):${RESET}\n" "${BLOCK_BRANCH:-<block-branch>}"
    printf "%b" "$MERGE_CMDS"
  fi

  rm -rf "$TMPDIR_RUN"
done

echo ""
echo -e "${DIM}Read-only pre-flight. The merge commands above run locally — nothing is pushed and no PR is touched.${RESET}"
