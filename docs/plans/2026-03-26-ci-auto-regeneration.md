# CI Auto-Regeneration on Epic Merge

**Status:** PROPOSAL
**Date:** 2026-03-26
**Task:** ETP-3596

## Problem

When multiple developers work on the epic branch, changes to shared code (generator templates, shared components, decisions) can cause the generated output to be stale. Currently, each developer must manually regenerate + build + deploy locally.

## Goal

An automated CI pipeline that triggers on merges to the epic branch and regenerates all derived artifacts, builds the UI, and commits the results to both schema_forge and com.etendoerp.go.

---

## Two Approaches

### Approach A: GitHub Actions (no DB)

Runs only the offline pipeline steps (Node.js transforms on committed files).

**What it can do:**

| Step | Tool | Input | Output |
|------|------|-------|--------|
| Resolve curated | `resolve-curated.js` | `schema-raw.json` + `rules-raw.json` + `decisions.json` | in-memory curated |
| Generate contract | `generate-contract.js` | curated schema + rules | `contract.json` |
| Generate frontend | `generate-frontend.js` | `contract.json` | `artifacts/*/generated/` |
| Build UI | `vite build` | `tools/app-shell/` | `tools/app-shell/dist/` |
| Deploy | `make deploy` | `dist/` | files in etendo-go web dir |

**What it CANNOT do:**

| Step | Why |
|------|-----|
| `extract-from-db.js` | Needs live Etendo DB |
| `push-to-neo.js` | Needs live Etendo DB |
| `export.database` | Needs Etendo + Gradle |
| `pre-classify.js` (AI mode) | Needs Claude API |

**Blocker:** `schema-raw.json`, `rules-raw.json`, and `processes.json` are **gitignored**. Without them, `resolveCurated()` and `generateContract()` cannot run. Options:
1. Un-ignore and commit those raw files (adds ~50 files to the repo)
2. Fall back to regenerating only frontend from existing `contract.json` (no contract regeneration)

---

### Approach B: Jenkins + BD (full pipeline) — RECOMMENDED

Jenkins with a live Etendo instance (BD + Tomcat) can run the **complete** pipeline.

**What it can do (everything):**

| Step | Tool | What it gains over GH Actions |
|------|------|------|
| Extract fields | `extract-from-db.js` | Fresh metadata from DB — detects new columns, changed processes |
| Extract rules | `extract-from-db.js` | Updated callouts, display logic, read-only logic |
| Resolve curated | `resolve-curated.js` | Same |
| Generate contract | `generate-contract.js` | Contracts always in sync with DB reality |
| Push to NEO | `push-to-neo.js` | NEO Headless config updated in DB |
| `export.database` | `gradlew export.database` | Generates XML sourcedata for etendo-go repo |
| Generate frontend | `generate-frontend.js` | Same |
| Build UI | `vite build` | Same |
| Deploy to etendo-go | `make deploy` + commit | Frontend dist + XML sourcedata in one commit |
| Contract tests | `run-contract-tests.js` | Validates against live endpoints |

**Advantages over GH Actions:**

1. **Re-extraction of raw files** — If someone adds a column in Etendo AD, CI detects it automatically. No manual extraction needed.
2. **Push to NEO automatic** — NEO Headless config stays in sync with contracts.
3. **No need to track raw files** — They're extracted fresh from DB each time. The `.gitignore` stays as-is.
4. **`export.database`** — Generates the XML sourcedata files that go into etendo-go. This is the proper way to persist NEO config, not just the frontend dist.
5. **Drift detection** — If someone changed something in the Etendo DB and didn't update artifacts, CI catches it.
6. **Contract tests against live DB** — Real validation, not just JSON assertions.
7. **Single source of truth** — The DB is the authority; CI regenerates everything from it.

**Disadvantages:**

1. **More infrastructure** — Needs a Jenkins instance with Etendo (BD + Tomcat) running, or a Docker Compose setup that spins it up.
2. **Slower** — Full pipeline with DB takes minutes vs seconds for a pure Node.js build.
3. **DB maintenance** — The CI database must stay synchronized with the expected state (same dataset as dev environments).

---

## Recommended Flow (Jenkins + BD)

```
┌──────────────────────────────────────────────────────────────────┐
│  Jenkins Pipeline: auto-regenerate                               │
│                                                                  │
│  Trigger: merge to epic/ETP-* in schema_forge                   │
│  Condition: skip if commit message contains 'Auto-regenerate'   │
│                                                                  │
│  1. Checkout schema_forge (epic branch)                          │
│  2. Checkout com.etendoerp.go (same epic branch)                │
│  3. Setup Node.js 22 + npm install                               │
│  4. Start/verify Etendo (BD + Tomcat)                            │
│                                                                  │
│  ┌─ For each window with decisions.json: ──────────────────────┐│
│  │  5. extract-from-db.js  (DB → schema-raw + rules-raw)      ││
│  │  6. resolve-curated.js  (raw + decisions → curated)         ││
│  │  7. generate-contract.js (curated → contract.json)          ││
│  │  8. push-to-neo.js      (contract → ETGO_SF_* tables)      ││
│  │  9. generate-frontend.js (contract → React components)      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  10. make build             (Vite → dist/)                       │
│  11. run-contract-tests.js  (validate contracts)                 │
│                                                                  │
│  ┌─ Commit to schema_forge: ──────────────────────────────────┐ │
│  │  12. git add artifacts/*/contract.json                      │ │
│  │  13. git add artifacts/*/generated/                         │ │
│  │  14. git diff --cached → if changes, commit + push          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Commit to etendo-go: ─────────────────────────────────────┐ │
│  │  15. gradlew export.database (DB → XML sourcedata)          │ │
│  │  16. make deploy (dist/ → module web dir)                   │ │
│  │  17. git add . → if changes, commit + push                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### D1: Which windows to process?

Only windows with `decisions.json` (currently 8). These are the "worked" windows with human curation. Windows without decisions only have raw data and can't produce meaningful contracts.

### D2: Commit identity

```
git config user.name "schema-forge-bot"
git config user.email "schema-forge-bot@etendosoftware.com"
```

Commit message format:
```
Auto-regenerate: contracts + frontend + build

Triggered by: <commit-sha>
```

### D3: Preventing infinite loops

Skip the pipeline if the triggering commit message contains `Auto-regenerate`.

### D4: Branch strategy for etendo-go

The pipeline assumes the same `epic/ETP-XXXX` branch exists in both repos. If the branch doesn't exist in etendo-go, the deploy step should fail loudly (not silently skip).

### D5: What gets committed where?

| Repo | Files committed |
|------|----------------|
| schema_forge | `artifacts/*/contract.json`, `artifacts/*/generated/**` |
| etendo-go | `web/com.etendoerp.go/**` (built UI), `src-db/database/sourcedata/**` (NEO config XML) |

### D6: Failure handling

If any step fails (extraction, generation, tests):
- Pipeline stops, does NOT commit partial results
- Jenkins marks the build as failed
- Team gets notified (Slack, email, etc.)

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `cli/src/regenerate-all.js` | **CREATE** | Batch script: loops decisions.json windows, runs offline steps (F4→F6→F8) |
| `Jenkinsfile` or `.github/workflows/auto-regenerate.yml` | **CREATE** | CI pipeline definition |

The `regenerate-all.js` script is needed for both approaches — it encapsulates the loop logic regardless of CI platform.

## Implementation Phases

### Phase 1: `regenerate-all.js` script
- Create the batch script that iterates windows with decisions
- Supports `--dry-run`, `--window <name>`, `--skip-extract` (for offline mode)
- Test locally against the dev DB
- Verify output matches what the full pipeline produces

### Phase 2: CI pipeline (depends on infra decision)
- **If Jenkins:** Create Jenkinsfile with full pipeline (extract + push-to-neo + export.database)
- **If GitHub Actions (fallback):** Create workflow with offline-only steps (requires committing raw files)

### Phase 3: Cross-repo commit to etendo-go
- Configure credentials (Jenkins credentials store or GitHub PAT)
- Add checkout + deploy + commit steps
- Test end-to-end

### Phase 4: Notifications + monitoring
- Slack/email on failure
- Dashboard showing last regeneration status per window

## Open Questions

1. **Jenkins infra:** Is there an existing Jenkins with Etendo (DB + Tomcat), or does it need to be set up? Is there a Docker Compose that can spin up the full environment?
2. **DB dataset:** Which dataset should the CI environment use? Same as dev (F&B demo data)?
3. **Branch naming:** Does etendo-go use the same `epic/ETP-XXXX` branch name as schema_forge?
4. **Tomcat warm-up:** Does the pipeline need to wait for Tomcat to be fully ready before running `push-to-neo.js` (which uses webhooks)?
5. **Parallel execution:** Could the pipeline process multiple windows in parallel, or should it be sequential to avoid DB contention?
