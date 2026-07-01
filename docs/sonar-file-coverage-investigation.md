# SonarQube Per-File Coverage — API Investigation

**Status:** IMPLEMENTED — see `cli/sonar-coverage.sh` and `make sonar-file-coverage`.
This document remains the design/reference. The shipped script follows the design below;
the deviations from the Section 7 reference implementation are noted in
[Section 9](#9-implementation-notes-deviations-from-the-section-7-reference).

**Goal:** A reusable CLI utility that, given a source file, queries SonarQube's HTTP API and
reports the file's current line coverage — specifically **which lines / line-ranges are NOT
covered by tests** — without opening the Sonar web UI.

---

## 1. Summary of findings

- **Is the API approach viable? YES** — SonarQube exposes per-line coverage through
  `GET /api/sources/lines`, which returns, for each line, `lineHits` (number of times the line
  was executed by tests) plus `conditions` / `coveredConditions` (branch coverage). A line with
  `lineHits == 0` is uncovered; a line with `conditions > coveredConditions` has partially
  uncovered branches. This is exactly the signal we need to compute uncovered ranges.
- **Verified against the live server? YES — VERIFIED 2026-06-18** against
  `https://sonar.etendo.cloud` with a User Token (`squ_…`, the token type required: analysis
  tokens `sqa_`/`sqp_` 403 on these endpoints). Confirmed live:
  - `/api/authentication/validate` → `{"valid":true}` (HTTP 200).
  - `/api/measures/component?metricKeys=coverage,uncovered_lines,lines_to_cover` → HTTP 200,
    project `coverage=69.9`.
  - `/api/measures/component_tree?...&strategy=leaves&qualifier=FIL&metricSort=uncovered_lines`
    → HTTP 200, returns real `FIL` components (e.g. `cli/src/push-to-neo.js` uncovered=584,
    `tools/app-shell/src/components/contract-ui/DetailView.jsx` uncovered=631). **Note:**
    `strategy=leaves` is REQUIRED — without it the tree returns directory (`DIR`) components, not
    files, even with `qualifier=FIL`.
  - `/api/sources/lines?key=<componentKey>&from=&to=` → HTTP 200. Each **executable** line carries
    `lineHits`, `conditions`, `coveredConditions`, **plus** `utLineHits`, `utConditions`,
    `utCoveredConditions` (unit-test breakdown), `code`, `isNew`, `duplicated`, scm fields.
    Real example: `DetailView.jsx` lines 200–240 → uncovered (`lineHits==0`): 205, 206, 207, 208,
    211, 212, 214, 215, 216, 217, 218.
  - **Critical gotcha (confirmed live):** the `lineHits` key is **absent** on non-executable lines
    (imports, JSX markup, blank/comment lines) — e.g. `DetailView.jsx` lines 1–40 returned objects
    with NO `lineHits` key at all. The range logic MUST treat "key absent" as "not executable /
    skip", distinct from `lineHits == 0` ("uncovered"). Using `l.get('lineHits') == 0` is correct
    (returns False when absent); never coerce absent → 0.

  The request shape, auth method, project keys, componentKey construction, and pagination/PR-scoping
  conventions below are also consistent with two working scripts in these repos
  (`cli/sonar-check.sh`, `../com.etendoerp.go/run-sonar.sh`). Section 6 retains the verify commands.
- **Coverage data must exist on the server.** Coverage is only present for files that were
  analyzed **with an LCOV/JaCoCo report attached**. For schema_forge this requires running
  `make sonar-coverage` (it generates the LCOV files declared in `sonar-project.properties →
  sonar.javascript.lcov.reportPaths`), not the bare `make sonar`. If a file was never covered by
  an analysis-with-coverage, `/api/sources/lines` will omit the `lineHits` field for its lines
  (treat "field absent" as "no coverage data", distinct from "covered = 0").

---

## 2. Project keys and componentKey construction

The `componentKey` is `<projectKey>:<path-relative-to-projectBaseDir>`. The relative path is the
same string that already appears as the `component` field (after the `:`) in the issues reports
both scripts produce, so this convention is confirmed by existing output.

| Repo | projectKey (source) | Example file (relative) | componentKey |
|------|---------------------|--------------------------|--------------|
| **schema_forge** (JS/JSX) | `etendosoftware_etendo_schema_forge_133209fc-d4ea-4f26-8699-8c76cb26648c`<br>from `sonar-project.properties` line 12 | `cli/src/push-to-neo.js` | `etendosoftware_etendo_schema_forge_133209fc-d4ea-4f26-8699-8c76cb26648c:cli/src/push-to-neo.js` |
| **com.etendoerp.go** (Java) | `etendosoftware_com.etendoerp.go_4f22c2cf-5ab2-4734-8244-f9eb74bbbb7a`<br>from its `sonar-project.properties` line 1 | `src/com/etendoerp/go/schemaforge/NeoServlet.java` | `etendosoftware_com.etendoerp.go_4f22c2cf-5ab2-4734-8244-f9eb74bbbb7a:src/com/etendoerp/go/schemaforge/NeoServlet.java` |

**Server host:** `https://sonar.etendo.cloud` (from `sonar-project.properties` line 11; also the
default `SONAR_HOST_URL`).

**Reading the projectKey programmatically** (mirrors `run-sonar.sh` line 18):

```bash
awk -F'=' '$1=="sonar.projectKey"{sub(/^[^=]*=/, ""); print; exit}' sonar-project.properties
```

**Path relativization:** Sonar paths are relative to `sonar.projectBaseDir` (the repo root for
both repos). To turn a user-supplied file path into the relative path, resolve it to an absolute
path then strip the git toplevel prefix — same approach as `cli/sonar-check.sh` lines 102–126:

```bash
abs="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
root="$(cd "$(dirname "$abs")" && git rev-parse --show-toplevel)"
rel="${abs#"$root"/}"
```

---

## 3. Authentication

Identical to both existing scripts: **token as the basic-auth username, empty password**.

```bash
curl -sf -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/..."
```

`SONAR_TOKEN` and `SONAR_HOST_URL` come from the shell profile (`~/.zshrc`). `cli/sonar-check.sh`
lines 55–62 show the fallback: if the vars are unset, grep the `export SONAR_TOKEN=` /
`export SONAR_HOST_URL=` lines out of `~/.zshrc` / `~/.bashrc` and `eval` them. `run-sonar.sh`
additionally falls back to `gradle.properties` keys `sonarHostUrl` / `sonarToken`.

> **Token-permission caveat (from `run-sonar.sh`):** analysis tokens (`sqa_`/`sqp_`) often get
> **HTTP 403** on `/api/measures/*` and `/api/hotspots/*`. `/api/sources/lines` requires the
> **"Browse" / "See Source Code"** project permission. If the util gets 403, instruct the user to
> use a **User Token (`squ_`)** from an account with Browse permission (run-sonar.sh lines 977–982
> document this exact failure mode).

---

## 4. Relevant endpoints (request + response shapes)

### 4.1 `GET /api/sources/lines` — PRIMARY (per-line coverage)  *(UNVERIFIED — shape from spec)*

Returns one object per source line. Coverage fields:

- `line` — line number.
- `lineHits` — times the line was executed by tests. **`0` = uncovered**, `>0` = covered.
  **Absent** = no coverage data for this file (not analyzed with coverage).
- `conditions` — number of branches on the line (e.g. an `if` with `&&` has several).
- `coveredConditions` — branches actually exercised. `coveredConditions < conditions` =
  partially-covered line (some branches untested).
- `isNew` — `true` if the line is in the new-code period (useful for "new code coverage" reports).
- `duplicated`, `scmAuthor`, `scmDate`, `code` — other metadata (we only need the first four).

**Pagination:** `from` / `to` are **1-based, inclusive**, and the endpoint returns **at most ~1000
lines per call** (Sonar caps the window). For files larger than 1000 lines, page with
`from=1&to=1000`, `from=1001&to=2000`, … until the returned array is empty/short.

```bash
curl -sf -u "$SONAR_TOKEN:" \
  "$SONAR_HOST_URL/api/sources/lines?key=<componentKey>&from=1&to=1000"
```

**Expected response (illustrative, UNVERIFIED):**

```json
{
  "sources": [
    { "line": 10, "code": "function push(spec) {", "lineHits": 3, "isNew": false },
    { "line": 11, "code": "  if (!spec) throw new Error();", "lineHits": 3,
      "conditions": 2, "coveredConditions": 1, "isNew": false },
    { "line": 12, "code": "  return spec.id;", "lineHits": 0, "isNew": true },
    { "line": 13, "code": "}", "isNew": false }
  ]
}
```

Interpretation: line 11 is a partially-covered branch (1 of 2 conditions), line 12 is fully
uncovered, line 13 has no `lineHits` (not an executable line — ignore it).

### 4.2 `GET /api/measures/component` — file-level coverage summary  *(shape pattern VERIFIED via run-sonar.sh)*

`run-sonar.sh` line 477 already calls this exact endpoint with `metricKeys` for project-level
metrics, so the request shape and the `component.measures[]` response shape are confirmed; only the
coverage-specific metric keys below are added.

```bash
curl -sf -u "$SONAR_TOKEN:" \
  "$SONAR_HOST_URL/api/measures/component?component=<componentKey>&metricKeys=coverage,line_coverage,uncovered_lines,lines_to_cover,uncovered_conditions,conditions_to_cover"
```

**Expected response (shape verified; values illustrative):**

```json
{
  "component": {
    "key": "<componentKey>",
    "qualifier": "FIL",
    "measures": [
      { "metric": "coverage",        "value": "72.4" },
      { "metric": "line_coverage",   "value": "75.0" },
      { "metric": "uncovered_lines", "value": "11"   },
      { "metric": "lines_to_cover",  "value": "44"   }
    ]
  }
}
```

Use this as a fast headline ("file is at 72.4% line coverage, 11 uncovered lines") **before** the
per-line scan. `uncovered_lines == 0` ⇒ skip the line scan entirely.

### 4.3 `GET /api/measures/component_tree` — discover file components  *(VERIFIED via run-sonar.sh line 508)*

Used only when the user gives a directory or wants to list which files even have coverage data:

```bash
curl -sf -u "$SONAR_TOKEN:" \
  "$SONAR_HOST_URL/api/measures/component_tree?component=<projectKey>&qualifier=FIL&metricKeys=coverage,uncovered_lines&ps=500&p=1"
```

`qualifier=FIL` restricts to files. Paginate with `ps` (max 500) + `p`. Each `components[].key`
is a full componentKey; the relative path is `key.split(':',1)[1]`.

### 4.4 Branch / Pull-Request scoping  *(VERIFIED pattern via run-sonar.sh)*

All read endpoints accept the same scoping query params the Java script already uses
(`run-sonar.sh` lines 327–328, 470–477):

- `&branch=<branchName>` — read a specific long-lived branch instead of the default branch.
- `&pullRequest=<prKey>` — read an ephemeral PR analysis (Sonar wants the branch **name**, not
  `origin/<name>`).

Omitting both reads the **default (main) branch** analysis. The util should expose an optional
`--branch` / `--pull-request` flag and append the param to every call.

---

## 5. Uncovered-line detection + range collapsing logic

1. **Decide the signal per line** from `/api/sources/lines`:
   - Skip lines with **no `lineHits` key** (non-executable / no coverage data).
   - `lineHits == 0` ⇒ **UNCOVERED**.
   - `lineHits > 0` **and** `conditions` present **and** `coveredConditions < conditions` ⇒
     **PARTIAL** (branch not fully covered). Report separately from fully-uncovered.
   - else ⇒ covered (ignore).
2. **Collapse consecutive line numbers into ranges.** Sort the uncovered line numbers; walk them,
   extending the current range while the next number is `prev + 1`, otherwise start a new range.
   Render `12` as `12` and `12,13,14` as `12-14`.
3. **Print** the file coverage % (from 4.2), then the uncovered ranges, then the partial-branch
   lines, e.g.:

   ```
   cli/src/push-to-neo.js — line coverage 75.0% (11 uncovered)
     Uncovered lines:   12-14, 28, 40-44
     Partial branches:  11 (1/2), 31 (2/3)
   ```

---

## 6. Verification commands (run these once Bash/curl is available)

These were **NOT executed** (Bash denied). Run them to confirm the UNVERIFIED endpoints and to
capture real responses, then update Section 4 with the real output.

```bash
# 0. Confirm env (do not print the full token)
printenv SONAR_HOST_URL
printenv SONAR_TOKEN | head -c 4; echo

PK="etendosoftware_etendo_schema_forge_133209fc-d4ea-4f26-8699-8c76cb26648c"
H="$SONAR_HOST_URL"

# 1. File-level coverage summary (fast smoke test — should return measures[])
curl -sf -u "$SONAR_TOKEN:" \
  "$H/api/measures/component?component=$PK:cli/src/push-to-neo.js&metricKeys=coverage,line_coverage,uncovered_lines,lines_to_cover" | jq .

# 2. Per-line coverage (the key call — look for lineHits in sources[])
curl -sf -u "$SONAR_TOKEN:" \
  "$H/api/sources/lines?key=$PK:cli/src/push-to-neo.js&from=1&to=80" \
  | jq '.sources[] | {line, lineHits, conditions, coveredConditions}'

# 3. List files that have coverage data (sanity check componentKey paths)
curl -sf -u "$SONAR_TOKEN:" \
  "$H/api/measures/component_tree?component=$PK&qualifier=FIL&metricKeys=coverage,uncovered_lines&ps=20" \
  | jq '.components[] | {key, measures}'
```

Pick a file you know is covered (run `make sonar-coverage` first if needed). If call #2 returns
`sources[]` objects **without** `lineHits`, that file has no coverage data on the server.

---

## 7. Proposed utility — ready-to-implement design

- **Location:** `cli/sonar-coverage.sh` (sibling of `cli/sonar-check.sh`, same style).
- **CLI signature:**
  ```
  ./cli/sonar-coverage.sh <path/to/File> [--branch <name>] [--pull-request <key>] \
                          [--project-key <key>] [--json] [-q|--quiet]
  ```
  Default project key is read from `sonar-project.properties` in the file's git root; default
  output is the human range report from Section 5; `--json` emits the raw uncovered data.
- **Style match:** rtk-bypass header, `set -euo pipefail`, env resolution from `~/.zshrc`, and a
  `python3` post-processor — all copied from `cli/sonar-check.sh` conventions.

> **Note:** the reference implementation below is written but **untested** (the coverage endpoints
> are UNVERIFIED). Run Section 6 first, adjust the field names if the real response differs, then
> commit. It is provided so a developer can lift it directly.

```bash
#!/usr/bin/env bash
# sonar-coverage.sh — Report which lines of a source file are NOT covered by tests,
# straight from SonarQube's API (no web UI).
#
# Usage:
#   ./cli/sonar-coverage.sh <path/to/File> [options]
#
# Options:
#   --branch NAME         Read a specific branch analysis (default: main/default branch)
#   --pull-request KEY    Read a pull-request analysis (branch name, not origin/<name>)
#   --project-key KEY     Override the project key (default: from sonar-project.properties)
#   --json                Emit raw uncovered/partial data as JSON instead of a text report
#   -q, --quiet           Suppress progress lines
#
# Required: SONAR_TOKEN and SONAR_HOST_URL (from ~/.zshrc / ~/.bashrc or env).

set -euo pipefail

# ── Bypass rtk proxy (use real binaries) ──────────────────────────────────────
PATH="$(echo "$PATH" | tr ':' '\n' | grep -v 'rtk' | tr '\n' ':')"
export PATH="${PATH%:}"

FILE=""
BRANCH=""
PR_KEY=""
PROJECT_KEY=""
AS_JSON=false
QUIET=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)       BRANCH="$2"; shift 2 ;;
    --pull-request) PR_KEY="$2"; shift 2 ;;
    --project-key)  PROJECT_KEY="$2"; shift 2 ;;
    --json)         AS_JSON=true; shift ;;
    -q|--quiet)     QUIET=true; shift ;;
    -h|--help)      sed -n '2,/^$/{ s/^# //; s/^#//; p }' "$0"; exit 0 ;;
    -*)             echo "Error: Unknown option: $1" >&2; exit 1 ;;
    *)              FILE="$1"; shift ;;
  esac
done

# ── Source shell profile for SONAR_TOKEN / SONAR_HOST_URL ─────────────────────
if [[ -z "${SONAR_TOKEN:-}" || -z "${SONAR_HOST_URL:-}" ]]; then
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    [[ -f "$rc" ]] && eval "$(grep -E '^\s*export\s+(SONAR_TOKEN|SONAR_HOST_URL)=' "$rc" 2>/dev/null)" || true
  done
fi
SONAR_HOST_URL="${SONAR_HOST_URL%/}"

# ── Validate prerequisites ────────────────────────────────────────────────────
errs=()
[[ -z "$FILE" ]] && errs+=("No file specified. Usage: $0 <path/to/File>")
[[ -n "$FILE" && ! -f "$FILE" ]] && errs+=("File not found: $FILE")
[[ -z "${SONAR_TOKEN:-}" ]] && errs+=("SONAR_TOKEN is not defined (add it to ~/.zshrc).")
[[ -z "${SONAR_HOST_URL:-}" ]] && errs+=("SONAR_HOST_URL is not defined (add it to ~/.zshrc).")
command -v curl &>/dev/null || errs+=("curl is not installed.")
command -v python3 &>/dev/null || errs+=("python3 is not installed.")
if [[ ${#errs[@]} -gt 0 ]]; then
  echo "Error: Prerequisites not met:" >&2
  for e in "${errs[@]}"; do echo "  - $e" >&2; done
  exit 1
fi

# ── Resolve file → git root → relative path ──────────────────────────────────
ABS="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
ROOT="$(cd "$(dirname "$ABS")" && git rev-parse --show-toplevel 2>/dev/null || dirname "$ABS")"
REL="${ABS#"$ROOT"/}"

# ── Resolve project key from sonar-project.properties in the git root ────────
if [[ -z "$PROJECT_KEY" ]]; then
  PROPS="$ROOT/sonar-project.properties"
  if [[ -f "$PROPS" ]]; then
    PROJECT_KEY="$(awk -F'=' '$1=="sonar.projectKey"{sub(/^[^=]*=/, ""); print; exit}' "$PROPS")"
  fi
fi
if [[ -z "$PROJECT_KEY" ]]; then
  echo "Error: Could not determine project key. Pass --project-key or add one to $ROOT/sonar-project.properties." >&2
  exit 1
fi

COMPONENT_KEY="${PROJECT_KEY}:${REL}"

# Scope query suffix (branch or pull-request), URL-encoded enough for typical names.
SCOPE=""
[[ -n "$BRANCH" ]] && SCOPE="&branch=${BRANCH}"
[[ -n "$PR_KEY"  ]] && SCOPE="&pullRequest=${PR_KEY}"

$QUIET || {
  echo "=== SonarQube File Coverage ==="
  echo "  Server:    $SONAR_HOST_URL"
  echo "  Project:   $PROJECT_KEY"
  echo "  File:      $REL"
  echo "  Component: $COMPONENT_KEY"
  [[ -n "$BRANCH" ]] && echo "  Branch:    $BRANCH"
  [[ -n "$PR_KEY"  ]] && echo "  PR:        $PR_KEY"
  echo ""
}

api() {
  # api <path-and-query>  → echoes JSON body, or empty + warns on HTTP error
  local path="$1"
  curl -sf -u "$SONAR_TOKEN:" "$SONAR_HOST_URL$path" 2>/dev/null || {
    echo "Error: request failed — $path (token may lack Browse permission; try a User Token squ_)." >&2
    return 1
  }
}

# ── 1. Headline measures (fast path) ─────────────────────────────────────────
MEASURES_JSON="$(api "/api/measures/component?component=${COMPONENT_KEY}&metricKeys=coverage,line_coverage,uncovered_lines,lines_to_cover${SCOPE}" || true)"

# ── 2. Determine file length, then page /api/sources/lines (≤1000 lines/page) ─
NLINES="$(wc -l < "$ABS" | tr -d ' ')"
SOURCES_JSON="$(mktemp)"; trap 'rm -f "$SOURCES_JSON"' EXIT
echo '{"sources":[]}' > "$SOURCES_JSON"

from=1
while [[ $from -le $NLINES ]]; do
  to=$(( from + 999 )); [[ $to -gt $NLINES ]] && to=$NLINES
  page="$(api "/api/sources/lines?key=${COMPONENT_KEY}&from=${from}&to=${to}${SCOPE}" || true)"
  [[ -z "$page" ]] && break
  # Merge this page's sources[] into the accumulator.
  python3 - "$SOURCES_JSON" <<PYEOF
import json, sys
acc_path = sys.argv[1]
acc = json.load(open(acc_path))
try:
    page = json.loads('''$page''')
except Exception:
    page = {"sources": []}
acc["sources"].extend(page.get("sources", []))
json.dump(acc, open(acc_path, "w"))
PYEOF
  from=$(( to + 1 ))
done

# ── 3. Compute uncovered ranges + partial branches and print ─────────────────
MEASURES_JSON="$MEASURES_JSON" AS_JSON="$AS_JSON" REL="$REL" \
python3 - "$SOURCES_JSON" <<'PYEOF'
import json, os, sys

sources = json.load(open(sys.argv[1])).get("sources", [])

# Headline measures
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
    hits = int(s["lineHits"])
    ln = s["line"]
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

rel = os.environ.get("REL", "")

if os.environ.get("AS_JSON") == "true":
    print(json.dumps({
        "file": rel,
        "hasCoverageData": has_coverage,
        "measures": measures,
        "uncoveredRanges": collapse(uncovered),
        "uncoveredLines": sorted(uncovered),
        "partialBranches": [{"line": l, "covered": c, "total": t} for (l, c, t) in partial],
    }, indent=2))
    sys.exit(0)

if not has_coverage:
    print(f"  {rel}: no coverage data on the server.")
    print("  (Analyzed without an LCOV/JaCoCo report? Run `make sonar-coverage` first,")
    print("   or check --branch / --pull-request scope.)")
    sys.exit(0)

cov = measures.get("coverage")
linecov = measures.get("line_coverage")
unc = measures.get("uncovered_lines")
headline = f"  {rel} — "
headline += f"coverage {cov}%" if cov is not None else "coverage n/a"
if linecov is not None: headline += f" (line {linecov}%)"
if unc is not None:     headline += f", {unc} uncovered"
print(headline)

if uncovered:
    print("    Uncovered lines:  " + ", ".join(collapse(uncovered)))
else:
    print("    Uncovered lines:  none")
if partial:
    print("    Partial branches: " + ", ".join(f"{l} ({c}/{t})" for (l, c, t) in partial))

sys.exit(1 if uncovered else 0)
PYEOF
```

---

## 8. Edge cases & gotchas

1. **File not analyzed / no coverage data** — `/api/sources/lines` returns `sources[]` whose
   objects have **no `lineHits`** key. The util reports "no coverage data" rather than "0%
   covered". Most common cause: ran `make sonar` (no coverage) instead of `make sonar-coverage`.
2. **Token permissions (403)** — `/api/sources/lines` needs **Browse / See Source Code**; analysis
   tokens (`sqa_`/`sqp_`) commonly 403 on source + measures endpoints. Use a **User Token (`squ_`)**.
   The util surfaces the 403 with a hint (mirrors `run-sonar.sh`'s handling).
3. **Pagination of `/api/sources/lines`** — capped at ~1000 lines per request. The util pages by
   `from`/`to` using the local file's line count (`wc -l`). `from`/`to` are 1-based inclusive.
4. **Large files** — paging keeps each call bounded; merging happens in `python3`, so memory is the
   only constraint (fine for ordinary source files).
5. **Branch vs PR vs default** — with neither flag the util reads the **default branch** analysis,
   which may be stale relative to a feature branch. Pass `--branch <name>` (long-lived branch) or
   `--pull-request <key>` (ephemeral PR analysis, branch name not `origin/<name>`) to scope.
   `run-sonar.sh` uses `local-<branch>` as its PR key convention.
6. **Path mismatch** — the componentKey path must match exactly what Sonar stored (relative to
   `sonar.projectBaseDir` = git root). If the file lives outside the configured `sonar.sources` or
   is in `sonar.coverage.exclusions` / `sonar.exclusions` (see schema_forge properties lines
   60–93), it will have no component and the call 404s/empties. Notable schema_forge coverage
   exclusions: tests, `e2e/**`, `tools/decision-panel/**`, `tools/ui-preview/**`,
   `packages/*/src/**`, config/token/style files.
7. **Non-executable lines** — braces, comments, blank lines have no `lineHits` and must be skipped,
   not counted as uncovered (the util skips any line missing `lineHits`).
8. **Partial branch coverage** — `lineHits > 0` does not mean fully covered: a line with
   `coveredConditions < conditions` has untested branches. Reported separately so it is not lost.
9. **URL-encoding** — componentKeys contain `:` and `.`; these are fine unencoded in practice (the
   existing scripts pass them raw). Branch names with `/` (e.g. `feature/ETP-4215`) should be
   URL-encoded if used with `--branch`; the reference script passes them raw and relies on curl —
   harden with `jq -sRr @uri` or `python3 urllib.parse.quote` if branch names break.
10. **rtk proxy** — like `sonar-check.sh`, the util strips `rtk` from `PATH` so real `curl` runs.
```

---

## 9. Implementation notes (deviations from the Section 7 reference)

The shipped `cli/sonar-coverage.sh` follows the Section 7 design but extends and tweaks it.
All endpoints, auth, range-collapsing, and the non-executable-line handling are exactly as
verified. Differences from the reference snippet:

- **Multi-repo, multi-file.** The CLI takes **one or more files** and auto-detects, per file,
  whether each lives under the schema_forge git root or under `../modules/com.etendoerp.go`
  (resolved relative to the script's own location). It reads the matching `sonar.projectKey`
  from that repo's `sonar-project.properties` and computes the path relative to THAT repo root.
  This replaces the single-file `--project-key` flag with a `--project schema-forge|etendo-go`
  override (used when the file isn't checked out locally; the file argument is then treated as a
  path already relative to that repo root).
- **`--new-only`** filters to `isNew == true` lines — the "coverage dropped in this PR" case.
- **`--partial`** is opt-in (off by default) to keep the default output focused; partial-branch
  lines are still computed but only printed with the flag.
- **Output format** matches the tool spec: a `<path>  (project: <name>)` header, a
  `coverage: X% · uncovered lines: N` summary (plus `new-coverage`/`new-uncovered` when present),
  the `Uncovered: <ranges>` line, an optional `Partial branches:` line, and a deep-link
  `component_measures` dashboard URL (with `&branch`/`&pullRequest` appended when scoped).
- **Measures metric keys**: `coverage,uncovered_lines,lines_to_cover,new_coverage,new_uncovered_lines`
  (added the `new_*` keys; dropped `line_coverage`/`uncovered_conditions` from the summary line).
- **Pagination** does not rely on a local `wc -l` (the file may not be on disk under `--project`):
  it pages `from/to` in 1000-line windows and stops when a window returns fewer than 1000 lines.
- **Exit codes**: `0` all-covered-in-scope, `1` uncovered lines found (CI-usable),
  `2` hard error (bad args, missing token, request failure). The reference used `1` for both
  "uncovered" and "error".
- **`--help`** uses an `awk` one-liner instead of the `sed -n '2,/^$/...'` trick, because BSD
  (macOS) sed chokes on `p }` on a single line — the existing `sonar-check.sh` has the same latent
  bug but masks it by exiting 0. The `awk` form is portable across BSD and GNU.
- **URL-encoding**: branch names, PR keys, and componentKeys are URL-encoded via
  `python3 urllib.parse.quote` so branch names like `feature/ETP-4215` work as `--branch`.

### Verified live (2026-06-18)

- `tools/app-shell/src/components/contract-ui/DetailView.jsx` → coverage 56.4%, 631 uncovered,
  ranges include `205-208, 211-212, 214-218` (the verified 205–218 block, split at the
  non-executable lines 209/210/213).
- `cli/src/push-to-neo.js` → coverage 49.9%, 584 uncovered (exercises pagination, >1000 lines).
- `src/com/etendoerp/go/schemaforge/NeoServlet.java` (auto-detected AND `--project etendo-go`) →
  resolves the com.etendoerp.go projectKey, HTTP 200, coverage 0.0%, 181 uncovered.
