#!/usr/bin/env bash
# pr-status.sh — List open PRs for schema_forge + com.etendoerp.go
# Usage: ./scripts/pr-status.sh

ME="$(gh api user --jq '.login' 2>/dev/null)"
if [[ -z "$ME" ]]; then
  echo "Error: not authenticated with gh. Run: gh auth login" >&2
  exit 1
fi
REPOS=(
  "etendosoftware/etendo_schema_forge"
  "etendosoftware/com.etendoerp.go"
)

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

printf "\n${CYAN}%-25s %-6s %-52s %-16s %-12s %-s${RESET}\n" \
  "Repo" "PR" "Title" "Author" "My review" "Status"
printf '%s\n' "$(printf '%.0s─' {1..130})"

for REPO in "${REPOS[@]}"; do
  SHORT="${REPO#etendosoftware/}"

  gh pr list --repo "$REPO" --state open \
    --json number,title,author,url,reviewDecision,reviews \
    --limit 50 | \
  jq -r --arg me "$ME" --arg repo "$SHORT" '
    .[] |
    . as $pr |
    ($pr.reviews | map(select(.author.login == $me)) | last) as $my |
    ($pr.reviewDecision // "PENDING") as $decision |
    (if $my == null then "❌ Sin review"
     elif $my.state == "APPROVED" then "✅ Aprobado"
     elif $my.state == "CHANGES_REQUESTED" then "⚠️  Changes req."
     else "💬 Comentado"
     end) as $myReview |
    (if $decision == "APPROVED" then "✅ Approved"
     elif $decision == "CHANGES_REQUESTED" then "⚠️  Changes req."
     elif $decision == "REVIEW_REQUIRED" then "🔍 Review needed"
     else "⏳ Pending"
     end) as $status |
    [$repo, ("#" + ($pr.number | tostring)), $pr.title[0:50], $pr.author.login, $myReview, $status, $pr.url] |
    @tsv
  ' | while IFS=$'\t' read -r repo num title author myreview status url; do
    printf "%-25s %-6s %-52s %-16s %-12s %-s\n  └─ ${CYAN}%s${RESET}\n" \
      "$repo" "$num" "$title" "$author" "$myreview" "$status" "$url"
  done
done

echo ""
