# SonarQube — quick access reference

Host: `https://sonar.etendo.cloud/`
Auth env vars (already exported in `~/.zshrc`): `SONAR_TOKEN` (Bearer), `SONAR_HOST_URL`.

## CRITICAL: bypass RTK for any curl to Sonar

RTK (Rust Token Killer, the shell proxy) intercepts curl responses and replaces JSON bodies with the SCHEMA shape (`{ key: string[84], components: [...] (10) }`) to save tokens. Any parser will fail silently because what looks like real JSON is actually a type sketch. Always prefix Sonar curls with `rtk proxy`:

```bash
rtk proxy curl -sS -H "Authorization: Bearer $SONAR_TOKEN" "${SONAR_HOST_URL%/}/api/..."
```

Without `rtk proxy` → schema sketch. With it → real JSON.

## Project keys for this repo

- **Schema Forge (full repo):** `etendosoftware_etendo_schema_forge_133209fc-d4ea-4f26-8699-8c76cb26648c`
- **com.etendoerp.go (runtime module):** `etendosoftware_com.etendoerp.go_4f22c2cf-5ab2-4734-8244-f9eb74bbbb7a`
- **Schema Forge sonar-check helper:** `schemaforge-sonar-check`

Project keys always end in a UUID. Never guess — list projects first.

## Useful endpoints

| Endpoint | Permission | Use |
|---|---|---|
| `api/system/status` | public | health check |
| `api/components/search_projects?ps=500&filter=query=%22schema%22` | public | list projects (use this, not `api/projects/search`) |
| `api/projects/search?q=...` | Administer System | returns empty for non-admins — avoid |
| `api/measures/component?component=<key>&metricKeys=ncloc,duplicated_lines,duplicated_lines_density,duplicated_blocks,cognitive_complexity,complexity,code_smells,bugs,sqale_index` | Browse project | metrics |
| `api/issues/search?componentKeys=<key>&types=CODE_SMELL,BUG&ps=100` | Browse project | issues list |
| `api/hotspots/search?projectKey=<key>` | Browse project | security hotspots |

Filter syntax for `search_projects`: `filter=query=%22<word>%22` (URL-encoded double quotes).

## Known limitation — Schema Forge metrics access

As of 2026-05-13, the user's `SONAR_TOKEN` can list projects but returns `Insufficient privileges` on `api/measures/component` for the Schema Forge project. Two paths forward:

1. Ask admin to grant "Browse" on Schema Forge → API queries unlock.
2. Use the local scanner fallback: `cli/sonar-check.sh <files>` runs `sonar-scanner` locally and prints issues inline — no API permissions required. See `CLAUDE.md → Static Analysis` for usage.

## Example: list duplication metrics (once permissions granted)

```bash
PROJ="etendosoftware_etendo_schema_forge_133209fc-d4ea-4f26-8699-8c76cb26648c"
rtk proxy curl -sS -H "Authorization: Bearer $SONAR_TOKEN" \
  "${SONAR_HOST_URL%/}/api/measures/component?component=$PROJ&metricKeys=duplicated_lines_density,duplicated_blocks,cognitive_complexity,code_smells" \
  | python3 -m json.tool
```

## Coverage-decrease gate ("Schema Forge Build / Coverage Decreased")

The Jenkins check **"Schema Forge Build"** with description **"Coverage Decreased"** is the
`Compare Coverage Results` stage in `com.etendoerp.jenkins.pipelines/etendo-go/SchemaForgeJenkinsfile`,
which calls `sonarUtils.compareCoverage(...)`. It compares the **overall project `coverage`
metric** of your branch against the base branch (`epic/ETP-3504`) and **fails on a strict `<`**
— i.e. any drop, even 0.1pp, blocks.

This is independent of the SonarQube **Quality Gate**, which only evaluates **new code**. Adding
new source files that are well-tested can still pass the QG yet *dilute* the overall percentage,
which is exactly what the Jenkins stage catches.

**Reproduce locally before pushing:** the pre-push hook (`.githooks/pre-push`, step 2) now runs
`run-sonar.sh ... --compare-coverage`, which mirrors the Jenkins comparison: current coverage comes
from this run's PR analysis (`sonar-reports/sonar-measures.json`), the base value is queried live
from Sonar, and the push is blocked when `current < base`.

```bash
# Manual one-off comparison (current branch vs epic/ETP-3504)
./run-sonar.sh --base-ref origin/epic/ETP-3504 --coverage --compare-coverage
# Override the comparison branch:
./run-sonar.sh --base-ref origin/develop --coverage --compare-coverage --compare-branch develop
```

If the base branch has no coverage on Sonar yet, the check skips without blocking (matching CI,
which treats a missing baseline as 0%). Bypass for WIP only: `git push --no-verify`.
