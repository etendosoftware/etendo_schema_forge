#!/usr/bin/env bash
# sonar-coverage.sh — Report which lines of a source file are NOT covered by tests,
# straight from SonarQube's existing analysis on the server (no scan is run).
#
# Works for files in BOTH repos: schema_forge (JS/JSX) and com.etendoerp.go (Java).
# The repo + project key for each file are auto-detected from its location on disk.
#
# Usage:
#   ./cli/sonar-coverage.sh [options] <file> [<file> ...]
#   ./cli/sonar-coverage.sh tools/app-shell/src/components/contract-ui/DetailView.jsx
#   ./cli/sonar-coverage.sh --project etendo-go src/com/etendoerp/go/schemaforge/NeoServlet.java
#
# Options:
#   --project schema-forge|etendo-go   Force the project (skip auto-detect; lets you
#                                       query a file that is not checked out locally).
#   --new-only            Show only lines where isNew==true ("coverage dropped in this PR").
#   --branch NAME         Read a specific branch analysis (default: main/default branch).
#   --pull-request KEY    Read a pull-request analysis (branch name, not origin/<name>).
#                         Mutually exclusive with --branch.
#   --partial             Also list partially-covered lines (some branches untested).
#   -q, --quiet           Only print the ranges, no headers.
#   -h, --help            Show this help.
#
# Required: SONAR_TOKEN and SONAR_HOST_URL (from ~/.zshrc / ~/.bashrc or env).
# SONAR_TOKEN must be a User Token (squ_...) with Browse permission on the project.
#
# Exit codes: 0 = all requested files fully covered (in scope); 1 = uncovered lines
# found; 2 = hard error (bad args, missing token, request failure).

set -euo pipefail

# ── Bypass rtk proxy (use real binaries) ──────────────────────────────────────
PATH="$(echo "$PATH" | tr ':' '\n' | grep -v 'rtk' | tr '\n' ':')"
export PATH="${PATH%:}"

# ── Resolve repo locations relative to this script ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"                       # schema_forge git root
GO_ROOT="$(cd "$SF_ROOT/../modules/com.etendoerp.go" 2>/dev/null && pwd || echo "")"

# ── Defaults ──────────────────────────────────────────────────────────────────
FILES=()
FORCE_PROJECT=""
NEW_ONLY=false
BRANCH=""
PR_KEY=""
SHOW_PARTIAL=false
QUIET=false

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)      FORCE_PROJECT="$2"; shift 2 ;;
    --new-only)     NEW_ONLY=true; shift ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    --pull-request) PR_KEY="$2"; shift 2 ;;
    --partial)      SHOW_PARTIAL=true; shift ;;
    -q|--quiet)     QUIET=true; shift ;;
    -h|--help)
      # Print the leading comment block as help (portable across BSD/GNU sed/awk).
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    -*)
      echo "Error: Unknown option: $1" >&2
      exit 2
      ;;
    *)
      FILES+=("$1"); shift ;;
  esac
done

# ── Source shell profile for SONAR_TOKEN / SONAR_HOST_URL ─────────────────────
if [[ -z "${SONAR_TOKEN:-}" || -z "${SONAR_HOST_URL:-}" ]]; then
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [[ -f "$rc" ]]; then
      eval "$(grep -E '^\s*export\s+(SONAR_TOKEN|SONAR_HOST_URL)=' "$rc" 2>/dev/null)" || true
    fi
  done
fi
SONAR_HOST_URL="${SONAR_HOST_URL%/}"

# ── Validate prerequisites ────────────────────────────────────────────────────
errors=()
[[ ${#FILES[@]} -eq 0 ]] && errors+=("No file specified. Usage: $0 [options] <file> [<file> ...]")
[[ -z "${SONAR_TOKEN:-}" ]] && errors+=("SONAR_TOKEN is not defined. Add 'export SONAR_TOKEN=...' to ~/.zshrc or ~/.bashrc (must be a User Token squ_).")
[[ -z "${SONAR_HOST_URL:-}" ]] && errors+=("SONAR_HOST_URL is not defined. Add 'export SONAR_HOST_URL=...' to ~/.zshrc or ~/.bashrc (e.g. https://sonar.etendo.cloud).")
command -v curl &>/dev/null || errors+=("curl is not installed.")
command -v python3 &>/dev/null || errors+=("python3 is not installed.")
if [[ -n "$BRANCH" && -n "$PR_KEY" ]]; then
  errors+=("--branch and --pull-request are mutually exclusive.")
fi
if [[ -n "$FORCE_PROJECT" && "$FORCE_PROJECT" != "schema-forge" && "$FORCE_PROJECT" != "etendo-go" ]]; then
  errors+=("--project must be 'schema-forge' or 'etendo-go' (got: $FORCE_PROJECT).")
fi
if [[ ${#errors[@]} -gt 0 ]]; then
  echo "Error: Prerequisites not met:" >&2
  for e in "${errors[@]}"; do echo "  - $e" >&2; done
  exit 2
fi

# ── Read a project key from a repo's sonar-project.properties ─────────────────
project_key_of() {
  # project_key_of <repo-root>  → echoes sonar.projectKey
  local root="$1"
  local props="$root/sonar-project.properties"
  [[ -f "$props" ]] || return 1
  awk -F'=' '$1=="sonar.projectKey"{sub(/^[^=]*=/, ""); print; exit}' "$props"
}

# ── URL-encode a value (branch names may contain '/') ─────────────────────────
urlencode() {
  python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# Scope query suffix (branch or pull-request).
SCOPE=""
[[ -n "$BRANCH" ]] && SCOPE="&branch=$(urlencode "$BRANCH")"
[[ -n "$PR_KEY"  ]] && SCOPE="&pullRequest=$(urlencode "$PR_KEY")"

# Dashboard scope suffix (human URL).
DASH_SCOPE=""
[[ -n "$BRANCH" ]] && DASH_SCOPE="&branch=$(urlencode "$BRANCH")"
[[ -n "$PR_KEY"  ]] && DASH_SCOPE="&pullRequest=$(urlencode "$PR_KEY")"

api() {
  # api <path-and-query> → echoes JSON body; non-zero on HTTP error.
  curl -sf -u "$SONAR_TOKEN:" "$SONAR_HOST_URL$1" 2>/dev/null
}

# ── Resolve a file → (project name, project key, relative path) ───────────────
# Echoes three tab-separated fields; returns 1 if it cannot be resolved.
resolve_file() {
  local file="$1"
  local proj_name proj_key root rel abs

  if [[ -n "$FORCE_PROJECT" ]]; then
    proj_name="$FORCE_PROJECT"
    if [[ "$proj_name" == "schema-forge" ]]; then root="$SF_ROOT"; else root="$GO_ROOT"; fi
  fi

  # Resolve to an absolute path when the file exists on disk.
  if [[ -e "$file" ]]; then
    abs="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
  elif [[ "$file" = /* ]]; then
    abs="$file"
  else
    abs=""
  fi

  if [[ -z "$FORCE_PROJECT" ]]; then
    # Auto-detect repo from the absolute path.
    if [[ -z "$abs" ]]; then
      echo "Error: File not found: $file (pass --project to query a file not on disk)." >&2
      return 1
    fi
    if [[ -n "$GO_ROOT" && "$abs" == "$GO_ROOT/"* ]]; then
      proj_name="etendo-go"; root="$GO_ROOT"
    elif [[ "$abs" == "$SF_ROOT/"* ]]; then
      proj_name="schema-forge"; root="$SF_ROOT"
    else
      echo "Error: $file is not inside schema_forge or com.etendoerp.go." >&2
      return 1
    fi
  fi

  if [[ -z "$root" || ! -d "$root" ]]; then
    echo "Error: Could not locate the $proj_name repo root." >&2
    return 1
  fi

  proj_key="$(project_key_of "$root" || true)"
  if [[ -z "$proj_key" ]]; then
    echo "Error: Could not read sonar.projectKey from $root/sonar-project.properties." >&2
    return 1
  fi

  # Compute path relative to the repo root.
  if [[ -n "$abs" ]]; then
    rel="${abs#"$root"/}"
  else
    # --project given for an off-disk file: treat the argument as already relative.
    rel="$file"
  fi

  printf '%s\t%s\t%s\n' "$proj_name" "$proj_key" "$rel"
}

OVERALL_EXIT=0

process_file() {
  local file="$1"
  local resolved proj_name proj_key rel component_key
  if ! resolved="$(resolve_file "$file")"; then
    OVERALL_EXIT=2
    return
  fi
  IFS=$'\t' read -r proj_name proj_key rel <<<"$resolved"
  component_key="${proj_key}:${rel}"

  # 1. File-level measures.
  local measures_json
  measures_json="$(api "/api/measures/component?component=$(urlencode "$component_key")&metricKeys=coverage,uncovered_lines,lines_to_cover,new_coverage,new_uncovered_lines${SCOPE}" || true)"

  # 2. Page /api/sources/lines until a window returns no sources.
  local sources_json from to page
  sources_json="$(mktemp)"
  echo '{"sources":[]}' > "$sources_json"
  from=1
  while :; do
    to=$(( from + 999 ))
    page="$(api "/api/sources/lines?key=$(urlencode "$component_key")&from=${from}&to=${to}${SCOPE}" || true)"
    if [[ -z "$page" ]]; then
      break
    fi
    local count
    count="$(python3 - "$sources_json" "$page" <<'PYEOF'
import json, sys
acc_path = sys.argv[1]
acc = json.load(open(acc_path))
try:
    page = json.loads(sys.argv[2])
except Exception:
    page = {"sources": []}
src = page.get("sources", [])
acc["sources"].extend(src)
json.dump(acc, open(acc_path, "w"))
print(len(src))
PYEOF
)"
    [[ "$count" -eq 0 ]] && break
    [[ "$count" -lt 1000 ]] && break
    from=$(( to + 1 ))
  done

  # 3. Compute + print.
  local dashboard_url file_exit
  dashboard_url="${SONAR_HOST_URL}/component_measures?id=$(urlencode "$proj_key")&selected=$(urlencode "$component_key")&metric=uncovered_lines${DASH_SCOPE}"

  set +e
  MEASURES_JSON="$measures_json" REL="$rel" PROJ="$proj_name" \
  DASHBOARD_URL="$dashboard_url" NEW_ONLY="$NEW_ONLY" SHOW_PARTIAL="$SHOW_PARTIAL" QUIET="$QUIET" \
  python3 - "$sources_json" <<'PYEOF'
import json, os, sys

sources = json.load(open(sys.argv[1])).get("sources", [])
rel = os.environ.get("REL", "")
proj = os.environ.get("PROJ", "")
dashboard_url = os.environ.get("DASHBOARD_URL", "")
new_only = os.environ.get("NEW_ONLY") == "true"
show_partial = os.environ.get("SHOW_PARTIAL") == "true"
quiet = os.environ.get("QUIET") == "true"

measures = {}
mj = os.environ.get("MEASURES_JSON", "")
if mj:
    try:
        for m in json.loads(mj).get("component", {}).get("measures", []):
            measures[m["metric"]] = m.get("value")
    except Exception:
        pass

has_coverage = any("lineHits" in s for s in sources)

uncovered, partial = [], []
for s in sources:
    if "lineHits" not in s:
        continue
    if new_only and not s.get("isNew"):
        continue
    hits = s.get("lineHits")
    ln = s.get("line")
    if hits == 0:
        uncovered.append(ln)
    else:
        cond = s.get("conditions")
        cov = s.get("coveredConditions")
        if cond is not None and cov is not None and cov < cond:
            partial.append((ln, cov, cond))

def collapse(nums):
    nums = sorted(nums)
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f"{nums[i]}-{nums[j]}")
        i = j + 1
    return out

if not quiet:
    print(f"{rel}  (project: {proj})")
    if not new_only:
        cov = measures.get("coverage")
        unc = measures.get("uncovered_lines")
        summary = f"  coverage: {cov}%" if cov is not None else "  coverage: n/a"
        if unc is not None:
            summary += f" · uncovered lines: {unc}"
        ncov = measures.get("new_coverage")
        nunc = measures.get("new_uncovered_lines")
        if ncov is not None or nunc is not None:
            new_part = []
            if ncov is not None:
                new_part.append(f"new-coverage: {ncov}%")
            if nunc is not None:
                new_part.append(f"new-uncovered: {nunc}")
            summary += "\n  " + " · ".join(new_part)
        print(summary)

if not has_coverage:
    print("  no coverage data on server — was it analyzed with `make sonar-coverage`?")
    if not quiet:
        print(f"  {dashboard_url}")
    sys.exit(0)

label = "New uncovered" if new_only else "Uncovered"
if uncovered:
    print(f"  {label}: " + ", ".join(collapse(uncovered)))
else:
    print(f"  {label}: none")

if show_partial:
    if partial:
        print("  Partial branches: " + ", ".join(f"{l} ({c}/{t})" for (l, c, t) in partial))
    else:
        print("  Partial branches: none")

if not quiet:
    print(f"  {dashboard_url}")

sys.exit(1 if uncovered else 0)
PYEOF
  file_exit=$?
  set -e
  rm -f "$sources_json"

  if [[ $file_exit -eq 1 && $OVERALL_EXIT -eq 0 ]]; then
    OVERALL_EXIT=1
  elif [[ $file_exit -gt 1 ]]; then
    OVERALL_EXIT=2
  fi
}

first=true
for f in "${FILES[@]}"; do
  $first || { $QUIET || echo ""; }
  first=false
  process_file "$f"
done

exit $OVERALL_EXIT
