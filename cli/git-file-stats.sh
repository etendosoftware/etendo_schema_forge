#!/usr/bin/env bash
#
# git-file-stats.sh — Rank files by how many commits touched them in a time window.
#
# Usage:
#   ./cli/git-file-stats.sh [options]
#
# Options:
#   -s, --since <when>     Time window start (default: "2 months ago")
#   -n, --top <N>          Show only the top N files (default: 20; use 0 for all)
#   -a, --all              Scan all branches instead of just the current one
#   -p, --path <glob>      Restrict to a path/glob (repeatable), e.g. -p 'cli/*' -p 'docs/*'
#   -e, --ext <ext>        Group by file extension instead of by file (e.g. js, java)
#   -c, --csv              Emit CSV (commits,file) instead of the aligned table
#   -h, --help             Show this help
#
# Examples:
#   ./cli/git-file-stats.sh
#   ./cli/git-file-stats.sh --since "3 weeks ago" --top 20
#   ./cli/git-file-stats.sh --all --path 'cli/*'
#   ./cli/git-file-stats.sh --ext --csv > by-ext.csv
#
set -euo pipefail

SINCE="2 months ago"
TOP=20
ALL=""
CSV=0
BY_EXT=0
PATHSPEC=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--since) SINCE="$2"; shift 2 ;;
    -n|--top)   TOP="$2"; shift 2 ;;
    -a|--all)   ALL="--all"; shift ;;
    -p|--path)  PATHSPEC+=("$2"); shift 2 ;;
    -e|--ext)   BY_EXT=1; shift ;;
    -c|--csv)   CSV=1; shift ;;
    -h|--help)  grep '^#' "$0" | sed 's/^#//; s/^ //'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

# --name-only with empty pretty prints each commit's changed files, one per line.
# We filter out blank lines (the per-commit separator) and tally occurrences.
raw_files() {
  git log $ALL --since="$SINCE" --name-only --pretty=format: -- "${PATHSPEC[@]+${PATHSPEC[@]}}" \
    | grep -v '^$'
}

TOTAL_COMMITS=$(git log $ALL --since="$SINCE" --oneline -- "${PATHSPEC[@]+${PATHSPEC[@]}}" | wc -l | tr -d ' ')

# Build "count<TAB>key" lines, sorted by count desc.
if [[ "$BY_EXT" -eq 1 ]]; then
  STATS=$(raw_files | sed -E 's/.*\.([A-Za-z0-9_]+)$/\1/; t; s/.*/(no-ext)/' \
            | sort | uniq -c | sort -rn)
  LABEL="extension"
else
  STATS=$(raw_files | sort | uniq -c | sort -rn)
  LABEL="file"
fi

if [[ "$TOP" -gt 0 ]]; then
  STATS=$(echo "$STATS" | awk -v n="$TOP" 'NR<=n')
fi

if [[ "$CSV" -eq 1 ]]; then
  echo "commits,$LABEL"
  echo "$STATS" | sed -E 's/^ *([0-9]+) +(.*)$/\1,\2/'
  exit 0
fi

UNIQUE=$(raw_files | sort -u | wc -l | tr -d ' ')

echo "Git file change stats"
echo "  window : since \"$SINCE\""
echo "  scope  : ${ALL:-current branch}${PATHSPEC[@]+  paths: ${PATHSPEC[*]}}"
echo "  commits: $TOTAL_COMMITS   unique files touched: $UNIQUE"
echo "  ranked by: number of commits that touched each $LABEL"
echo
printf "%8s  %s\n" "COMMITS" "$(echo "$LABEL" | tr '[:lower:]' '[:upper:]')"
printf "%8s  %s\n" "-------" "----"
echo "$STATS" | sed -E 's/^ *([0-9]+) +(.*)$/\1\t\2/' \
  | awk -F'\t' '{ printf "%8d  %s\n", $1, $2 }'
