#!/usr/bin/env bash
# epic-status.sh — Show tasks in a Jira epic with commit/PR info from GitHub
# Usage: ./scripts/epic-status.sh <EPIC-KEY>
# Example: ./scripts/epic-status.sh ETP-3504

set -euo pipefail

EPIC_KEY="${1:-}"
if [[ -z "$EPIC_KEY" ]]; then
  echo "Usage: $0 <EPIC-KEY>" >&2
  echo "Example: $0 ETP-3504" >&2
  exit 1
fi

# Verify tools
for cmd in jira gh jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
done

REPOS=(
  "etendosoftware/etendo_schema_forge"
  "etendosoftware/com.etendoerp.go"
)

# Colors
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${DIM}Fetching epic tasks and GitHub data...${RESET}"

# Collect all PRs into a single JSON file for lookup
PR_CACHE=$(mktemp)
trap 'rm -f "$PR_CACHE"' EXIT

echo '[]' > "$PR_CACHE"
for REPO in "${REPOS[@]}"; do
  SHORT="${REPO#etendosoftware/}"
  gh pr list --repo "$REPO" --state all --limit 200 \
    --json headRefName,number,state 2>/dev/null | \
    jq --arg repo "$SHORT" '[.[] | {branch: .headRefName, pr: ("#" + (.number|tostring)), state: .state, repo: $repo}]' \
    > "${PR_CACHE}.part" || echo '[]' > "${PR_CACHE}.part"
  jq -s '.[0] + .[1]' "$PR_CACHE" "${PR_CACHE}.part" > "${PR_CACHE}.new"
  mv "${PR_CACHE}.new" "$PR_CACHE"
  rm -f "${PR_CACHE}.part"
done

# Collect all remote branches for commit detection
BRANCHES_CACHE=$(mktemp)
trap 'rm -f "$PR_CACHE" "$BRANCHES_CACHE"' EXIT

echo '[]' > "$BRANCHES_CACHE"
for REPO in "${REPOS[@]}"; do
  SHORT="${REPO#etendosoftware/}"
  gh api "repos/${REPO}/git/matching-refs/heads/feature/" \
    --jq '[.[].ref | sub("^refs/heads/"; "")]' 2>/dev/null \
    > "${BRANCHES_CACHE}.part" || echo '[]' > "${BRANCHES_CACHE}.part"
  jq -s '.[0] + .[1]' "$BRANCHES_CACHE" "${BRANCHES_CACHE}.part" > "${BRANCHES_CACHE}.new"
  mv "${BRANCHES_CACHE}.new" "$BRANCHES_CACHE"
  rm -f "${BRANCHES_CACHE}.part"
done

# Print header
printf "\n${BOLD}${CYAN}Epic: %s${RESET}\n\n" "$EPIC_KEY"
printf "${CYAN}%-12s %-42s %-18s %-18s %-8s %-30s %-s${RESET}\n" \
  "Key" "Summary" "Status" "Assignee" "Branch" "PRs" "Warnings"
printf '%s\n' "$(printf '%.0s─' {1..160})"

# Fetch epic issues from Jira and enrich with GitHub data
jira epic list "$EPIC_KEY" --plain --no-headers --no-truncate \
  --columns key,summary,status,assignee \
  --delimiter $'\t' 2>/dev/null | \
while IFS=$'\t' read -r key summary status assignee; do
  [[ -z "$key" ]] && continue

  # Trim whitespace
  key="$(echo "$key" | xargs)"
  summary="$(echo "$summary" | xargs)"
  status="$(echo "$status" | xargs)"
  assignee="$(echo "$assignee" | xargs)"
  [[ -z "$assignee" ]] && assignee="—"

  # Truncate summary
  if [[ ${#summary} -gt 40 ]]; then
    summary="${summary:0:37}..."
  fi

  # Color status
  case "$status" in
    Finalizada|"READY TO PUBLISH") status_color="${GREEN}" ;;
    "En curso"|"In Progress")      status_color="${YELLOW}" ;;
    TBD|*"To Do"*)                 status_color="${DIM}" ;;
    *)                             status_color="" ;;
  esac

  # Check for branch existence
  branch_name="feature/${key}"
  has_branch=$(jq -r --arg b "$branch_name" 'if (. | index($b)) then "✅" else "—" end' "$BRANCHES_CACHE")

  # Check for PRs matching this branch
  pr_info=$(jq -r --arg b "$branch_name" '
    [.[] | select(.branch == $b) |
      .repo + .pr + "(" +
      (if .state == "OPEN" then "🟢"
       elif .state == "MERGED" then "🟣"
       else "🔴" end) + ")"]
    | if length == 0 then "—" else join(", ") end
  ' "$PR_CACHE")

  # Warnings
  warnings=""
  has_code="no"
  [[ "$has_branch" == "✅" || "$pr_info" != "—" ]] && has_code="yes"

  # TBD with assignee → should be Defined
  if [[ "$status" == "TBD" && "$assignee" != "—" ]]; then
    warnings="⚠️  TBD con asignado"
  fi

  # TBD or Defined with commits/PRs → work started but status not updated
  if [[ ("$status" == "TBD" || "$status" == "Defined") && "$has_code" == "yes" ]]; then
    if [[ -n "$warnings" ]]; then
      warnings="${warnings} | ⚠️  Commits sin En curso"
    else
      warnings="⚠️  Commits sin En curso"
    fi
  fi

  # Has code but no assignee
  if [[ "$has_code" == "yes" && "$assignee" == "—" ]]; then
    if [[ -n "$warnings" ]]; then
      warnings="${warnings} | ⚠️  Código sin asignado"
    else
      warnings="⚠️  Código sin asignado"
    fi
  fi

  # Print row
  printf "%-12s %-42s ${status_color}%-18s${RESET} %-18s %-8s %-30s ${RED}%s${RESET}\n" \
    "$key" "$summary" "$status" "$assignee" "$has_branch" "$pr_info" "$warnings"
done

echo ""
