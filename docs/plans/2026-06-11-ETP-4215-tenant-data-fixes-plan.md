# ETP-4215 — Tenant Data-Fixes Framework — Working Guide & Plan

- **Date:** 2026-06-11
- **Status:** Active — implementation planning
- **Branch:** `feature/ETP-4215` (both repos: `schema_forge` + `com.etendoerp.go`, off `epic/ETP-3504`)
- **Continuation of:** ETP-4213
- **Source documents (both now on this branch):**
  - `docs/etendo-ad/onboarding-gaps.md` — the field findings this framework remediates (from ETP-4213)
  - `docs/superpowers/specs/2026-06-10-tenant-data-fixes-framework-design.md` — the approved design spec (from ETP-4215)

This is our **single working guide** for the task: it consolidates both Jira descriptions, the relationship between them, the codebase grounding, and the implementation plan we will iterate on.

---

## 0. Execution roadmap — the steps we follow (in order)

We build this **incrementally, one step at a time**. Each step lands and is verified before the next begins.

| # | Step | What it produces | Done when |
|---|---|---|---|
| **0** | **Iterate on this plan** | Agreed design (this `.md`) | The framework shape, table, naming, and roadmap are all settled here — *we are here* |
| **1** | **History table + sys-admin window** ✅ | `ETGO_DATA_FIX_HISTORY` AD table + `Data-Fix History` window, registered in `com.etendoerp.go` | **DONE 2026-06-11** — System-only table (accesslevel `4`); rows owned by System (`ad_client_id='0'`), tenant in dedicated FK col `remediated_client_id`→AD_Client; `UNIQUE(remediated_client_id, fix_id)`; status List ref; elements. Window `5F0F3B5D…` (read-only tab) restricted to **System Administrator only**. Pending: user runs `export.database` so it travels with the module |
| **2** | **Execution point** ✅ | A **`make` target in `schema_forge`** that runs the data-fixes runner — *that is the only execution point for now* (no Jenkins/CI yet) | **DONE 2026-06-11** — `make data-fixes` / `make data-fixes-help` (vars `DRY_RUN`/`CLIENT`/`FIX`/`MARK_FIXED`/`REASON`); discovers `sql/`, sweeps baseline, applies, writes the ledger. Verified with a real dry-run (3 tenants→DETECTED, 4 processed, 0 halted) |
| **3** | **A test migration** ✅ | One trivial fixture `.sql` (`@check` + guarded `@apply`) proving the full loop end-to-end | **DONE 2026-06-11** — fixture proves apply→APPLIED, re-run→ledger-skip, non-applicable client→SKIPPED |
| **4** | **The gap migrations (R1–R6)** | The real corrective `.sql` fixes, authored against `onboarding-gaps.md` | **PENDING** — each gap needs a verified, idempotent, client-scoped `.sql` |
| **‖** | **(in parallel) Fix onboarding** | Preventive front — close each gap at the source so new tenants are never born broken | Each gap is fixed in the `OnboardingStep` pipeline + proven by test |

> **Execution point — current decision:** the runner is invoked **only** via a `make` target in `schema_forge`. Jenkins / post-deploy CI integration is **deferred** (see the note in §3 "CI / deploy integration" and open decision #2) — we add it later, once the `make`-driven loop is proven. Step 4's gap migrations and the parallel onboarding fixes are the last and largest stretch.

---

## 1. The two tasks and how they relate

| | **ETP-4213** (done — documentation) | **ETP-4215** (this task — build it) |
|---|---|---|
| Title | Document Etendo GO onboarding gaps when provisioning a new client | Tenant data-fixes framework for existing-client remediation |
| Nature | Field-findings document | Design spec → **implementation** |
| Output | `docs/etendo-ad/onboarding-gaps.md` (the 5 gap areas A–E) | A runnable, tracked, idempotent remediation framework |

**The link:** ETP-4213 documented *what is broken* when a client is provisioned and *how to fix it by hand* (manual SQL). ETP-4215 implements the fixes.

### THE TWO FRONTS (core principle — both are in scope for ETP-4215)

Every gap must be closed on **two fronts at once**:

| Front | Goal | Audience | Where it lives | Without it… |
|---|---|---|---|---|
| **① Preventive (root cause)** | Fix the onboarding flow so the gap never happens again | **New** clients (from now on) | Onboarding code — the `OnboardingStep` pipeline in `com.etendoerp.go` (Java) + the `AD_Org_Ready` / accounting setup | every new client is born broken |
| **② Corrective (remediation)** | Fix the already-broken state | **Existing** clients (already onboarded) | The `.sql` data-fixes framework we are building (Node + SQL) | current clients stay broken forever |

The corrective `.sql` and the preventive onboarding fix for a given gap are **siblings**: same diagnosis, two delivery points. The data-fix is SQL-only and decoupled from onboarding; the preventive fix lives inside onboarding (and *that* is where Java may be touched — e.g. accounting setup, `MarkOrgReadyStep`).

---

## 2. The gaps — symptom, preventive home, corrective SQL (from ETP-4213)

| Gap | Area | Symptom | ① Preventive (onboarding) | ② Corrective (`.sql` data-fix) |
|---|---|---|---|---|
| A1 | Accounting | Posting fails — chart of accounts missing | Add accounting setup to onboarding (`initial-organization-setup-accounting.md` proposal) | Clone full chart ~1790 `c_elementvalue` from GOOrg |
| A2 | Accounting | "Account Not Defined" — `*_acct` tables empty | Same accounting setup step populates `*_acct` from `c_acctschema_default` | Populate per-schema accounting defaults |
| B1 | Org hierarchy | "Lines org does not depend on header org" | Ensure `AD_Org_Ready` (in `MarkOrgReadyStep`) populates `AD_ORG_TREE` | Insert `AD_ORG_TREE` rows |
| C1/C2 | Period control | *Open/Close Period Control* empty; posting fails | Set `isperiodcontrolallowed`/calendar before period creation in onboarding | Set org flags + backfill `c_periodcontrol` (504 rows/yr) |
| D1 | Legal entity | SII fields empty; `AD_GET_ORG_LE_BU` returns NULL | `MarkOrgReadyStep` recompute LE columns after `AD_Org_Ready` (ETP-4177) | Recompute denormalized LE columns |
| E1 | Session/user | Session org stuck at `'0'` / `*` | `CreateOrgAdminStep`/`CreateClientAdminStep` set `AD_User.ad_org_id` to tenant org | Set `AD_User.ad_org_id` to tenant org |

> Onboarding pipeline today (`com.etendoerp.go/.../onboarding/steps/`): `CreateClientStep → CreateClientAdminStep → CreateOrgStep → CreateOrgAdminStep → CreateRoleStep → CreateDocTypesStep → SeedReferenceDataStep → MarkOrgReadyStep`. **There is no accounting step** — A1/A2's preventive fix means adding one (per the accounting proposal). The other preventive fixes slot into existing steps.

---

## 3. Framework design — the shape we will build

**DECISION (2026-06-11):** Each fix is a **plain `.sql` file** (Liquibase/Flyway-style), not a JS module. The runner discovers the `.sql` files, reads their header metadata, applies them in order, and records each in the per-client ledger. Idempotency is achieved with **defensive SQL** (`WHERE NOT EXISTS` / guarded `INSERT…SELECT`) so re-running a fix is a no-op. This keeps each fix readable and writable by a DBA without touching JS.

**DECISION (2026-06-11) — TENANT SCOPING IS MANDATORY:** The unit of remediation is the **tenant = `ad_client_id`**. Every fix `.sql` MUST be scoped by `ad_client_id` and MUST be executable for a single client in isolation — it can never touch rows of another tenant. Every Etendo table carries `ad_client_id`, so this is always enforceable. The runner **always** binds `:client_id` and the SQL must filter/insert with `ad_client_id = :client_id`. A fix that cannot be expressed scoped to one client is invalid. (Org-level filtering, `:org_id`, is *secondary* — used only when a fix targets a specific org within the client; the client filter is non-negotiable.)

**Approach:** still mirror the repo's existing `cli/src/migrations/` pattern for the **runner + ledger + scope flags**, but the *units* are SQL files rather than JS modules.

### Components
   
1. **Fix file** — one `.sql` file per fix in `cli/src/data-fixes/sql/`, named with a UTC timestamp prefix (see §2 below), e.g. `20260611T143000Z__R3  -periodcontrol.sql`. It has **two labeled sections** plus a metadata header. The `@check` section is the explicit "does this fix apply?" gate (Liquibase `preConditions` analogue); the `@apply` section does the work:
   ```sql
   -- @id: R3-periodcontrol
   -- @gap: C2
   -- @risk: medium
   -- @description: Backfill c_periodcontrol rows for the org's calendar

   -- @check
   -- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED (apply never runs).
   SELECT 1
   FROM ad_org o
   WHERE o.ad_client_id = :client_id
     AND NOT EXISTS (SELECT 1 FROM c_periodcontrol pc WHERE pc.ad_org_id = o.ad_org_id);

   -- @apply
   INSERT INTO c_periodcontrol (...)
   SELECT ...
   FROM ad_org o
   WHERE o.ad_client_id = :client_id
     AND NOT EXISTS (SELECT 1 FROM c_periodcontrol pc WHERE pc.ad_org_id = o.ad_org_id);
   ```
   The SQL is parameterized by `:client_id` (mandatory tenant scope) and optionally `:org_id`, bound by the runner per tenant. **Every statement (both `@check` and `@apply`) must filter by `ad_client_id = :client_id`.**

   **Two-layer idempotency:** (1) the `@check` query decides up front whether to run at all — this is the explicit "si aplica"; (2) the `@apply` body is *also* defensively guarded (`WHERE NOT EXISTS`) so even a concurrent/partial state is safe. The runner records `rows_affected` from `@apply`.

2. **Naming & ordering (chronological, UTC)** — fixes are named with a **UTC timestamp prefix** that defines their chronological execution order (Flyway/Rails-migration style):
   ```
   <UTC timestamp>__<slug>.sql
   e.g.  20260611T143000Z__periodcontrol-backfill.sql
   ```
   The runner globs `sql/*.sql` and sorts **lexicographically by the timestamp prefix** — because the prefix is UTC `YYYYMMDDThhmmssZ`, lexical order == chronological order, with no timezone ambiguity. New migrations always sort after older ones.
   The **`R1..R6` fixes are not a separate numbering scheme** — they are the *known initial exceptions* (the documented onboarding gaps). Each one gets a real timestamp prefix too; the `Rn` label survives only in the `-- @id:` header for traceability to `onboarding-gaps.md`, e.g. `20260611T143000Z__R3-periodcontrol.sql` with `-- @id: R3-periodcontrol`.
   No JS registry to maintain; adding a migration = dropping a timestamped `.sql` file.

3. **Per-tenant history table** — new AD table `ETGO_DATA_FIX_HISTORY` (the Flyway `flyway_schema_history` analogue). **System-owned ledger, one row per `(remediated_client_id, fix_id)`** — NO org column (fixes are client-scoped). It is a **System-only table (accesslevel `4`)** so that ONLY the System Administrator opens it and sees *every* tenant's history in one grid; therefore each row's audit `ad_client_id` is always `'0'` (System) and the **actual remediated tenant lives in a dedicated FK column `remediated_client_id`** (→ AD_Client). (Why not just `ad_client_id` = tenant? Because a `userlevel='S'` role only *reads* its own client `'0'`, so a client-level table would hide other tenants from the sys admin. See the access-levels note in `docs/etendo-ad/tenant-remediation-knowledge.md`.) Other columns: `status ∈ {APPLIED, SKIPPED_NOT_NEEDED, FAILED}`, `applied_utc` timestamp, `rows_affected`, `checksum` (of the `.sql`, to detect an edited fix Flyway-style), `detail`, `description` (mirrors the `.sql` `@description`).
   - **`fix_id` = the full filename without `.sql`** (e.g. `20260611T143000Z__R3-periodcontrol`). The timestamp guarantees uniqueness; the slug keeps the audit readable. Rule (Flyway-style): an applied migration is never renamed or edited — the stored `checksum` detects violations (content changed under the same `fix_id` ⇒ runner warns, does not silently re-apply). The `-- @id:` header is human traceability to `onboarding-gaps.md` only. The catalog of migrations lives as `.sql` files in git (`cli/src/data-fixes/sql/`); the table stores only application state, never the SQL itself.
   - The runner decides whether to run a migration by **`fix_id` presence**, NOT by a date watermark — this is robust to **out-of-order migrations** (two branches authored same-day, merged in a different order than their timestamps imply; a single high-water-mark would silently skip the one "below the mark").
   - The **"how far has this client been migrated" watermark is a derived query**, not a stored field: `SELECT MAX(applied_utc) FROM ETGO_DATA_FIX_HISTORY WHERE remediated_client_id = :client_id` (the ledger's `ad_client_id` is always `'0'`; the tenant is `remediated_client_id`). Best of both: per-fix robustness + a quick "up to where" when needed.
   - An `APPLIED` row is never re-run.

3b. **Baseline model — the per-tenant cutoff (5 statuses).** Premise: **every data-fix originates from an onboarding correction**, so a tenant born *after* that correction never had the gap and must not receive the fix. Each tenant carries ONE baseline row (`fix_id='__baseline__'`) marking its cutoff:
   - **`BASELINE`** — written by the **onboarding pipeline** when a new tenant finishes provisioning. `applied_utc = now()`. "Born clean; only fixes newer than this apply." Onboarding (Java) inserts just one timestamped row — no need to know the `.sql` catalog (deliberate decoupling).
   - **`DETECTED`** — written by the **runner's sweep** for a pre-existing tenant with no ledger row. `applied_utc = '2026-01-01'` (ancient). "Legacy tenant, never remediated; all fixes are candidates."
   - **Cutoff rule:** a fix applies to a tenant only if `fix.timestamp > tenant_baseline.applied_utc`. `BASELINE`(now) ⇒ existing fixes are below the cutoff ⇒ skipped as not-applicable; `DETECTED`(2026-01-01) ⇒ all fixes are above ⇒ all run their `@check`. The `@check` stays the correctness backstop.

4. **Runner** — `cli/src/data-fixes/run.js`, mirroring `migrate-all.js`:
   `node cli/src/data-fixes/run.js [--dry-run] [--client <id>] [--fix <id>]`
   - **Step 0 — sweep/baseline detection:** for every real tenant (`ad_client_id <> '0'`) with ZERO rows in `ETGO_DATA_FIX_HISTORY`, insert a `DETECTED` baseline row (`applied_utc='2026-01-01'`, `remediated_client_id=<client>`). Onboarded tenants already have a `BASELINE` row, so they're skipped — `BASELINE`/`DETECTED` are mutually exclusive per tenant.
   - **Step 1 — apply:** per (client × fix): if a `__baseline__` cutoff makes the fix predate the tenant's birth ⇒ not applicable, skip. Else if ledger already `APPLIED` ⇒ skip. Else run the **`@check`** query (bound to `:client_id`) → 0 rows ⇒ record `SKIPPED_NOT_NEEDED`, never run `@apply`; rows ⇒ execute **`@apply`** in its **own transaction** → record `rows_affected` + `APPLIED`. Idempotent + resumable. `--dry-run` runs `@check` (and optionally `@apply` inside a rolled-back transaction) and reports what *would* run, without committing.

5. **Fix `@type` selects the `@apply` path — and encodes the SQL-first decision criterion.**
   - **`@type: sql`** (default, preferred) — runner executes the `@apply` body as SQL.
   - **`@type: webhook`** — runner POSTs to a remediation webhook backed by **a single Java implementation that serves BOTH fronts** (new-client onboarding step *and* existing-client remediation). Use this only when the fix is too complex/stateful for hand SQL.

   **Decision criterion (per gap) — ALWAYS TRY SQL FIRST:**
   1. Can the fix be expressed as idempotent SQL (`@check` + guarded `@apply`)? → **`@type: sql`**. This is the default and covers most gaps.
   2. Is it complex/stateful enough that hand-SQL would duplicate non-trivial logic, or is the preventive fix already a substantial new onboarding **step**? → write the logic **once in Java** and expose it via a webhook the data-fix calls (**`@type: webhook`**). One implementation, two fronts (the "Java-ambivalent" approach), no SQL↔Java divergence.

   **Applied to A1/A2:** the corrective SQL for A1/A2 already exists and is idempotent (`onboarding-gaps.md`), so the *data-fix* stays `@type: sql`. BUT the *preventive* front (Track A) needs a real onboarding accounting **step** anyway — if that step's logic is non-trivial, it may be worth making it the shared Java implementation and having the data-fix call it via webhook instead of duplicating the clone in SQL. **To be decided per-gap during implementation; SQL is the default, webhook is the escape hatch with criterion above.**

### Fix → gap mapping

All fixes are `@type: sql`. Source SQL already drafted/verified in `onboarding-gaps.md`.

| id | Gap | Strategy (all SQL) |
|---|---|---|
| `R1-chart-of-accounts` | A1 | Clone `c_element` + ~1790 `c_elementvalue` from GOOrg source client; wire AC dimension default. Guarded by `NOT EXISTS` |
| `R2-acct-defaults` | A2 | Populate `*_acct` tables (`c_bp_group_acct`, `m_product_category_acct`, `c_bp_customer_acct`, `c_bp_vendor_acct`, `m_product_acct`) from `c_acctschema_default`. Guarded |
| `R3-periodcontrol` | C2 | 504 rows/yr backfill, guarded by `WHERE NOT EXISTS` |
| `R4-org-tree` | B1 | `AD_ORG_TREE` rows, guarded |
| `R5-legal-entity-denorm` | D1 | `ad_get_org_le_bu_treenode` / `ad_org_getcalendarownertn` recompute |
| `R6-user-session-org` | E1 | `UPDATE AD_User.ad_org_id` where stuck at `'0'` |

### Execution point / CI
**Current (this task):** the **only** execution point is a **`make` target in `schema_forge`** (Step 2 of §0) that invokes `cli/src/data-fixes/run.js` for a given `--client`. Run by hand. This is deliberately the whole story for now — prove the `make`-driven loop first.

**Deferred (later task):** wiring the runner into the **backend/Jenkins deploy pipeline** (not the SPA `deploy-staging.yml` — no DB access there), as the last step **after** `update.database`/`export.database` and health checks pass. Per-(client×fix) transaction; a `FAILED` tenant is logged + alerted but never rolls back the (already-green) deploy; resumes next deploy. Not in scope until the `make` loop is solid (open decision #2).

---

## 4. Codebase grounding (verified 2026-06-11)

**Schema Forge (`schema_forge`):**
- `cli/src/migrations/` exists — `index.js` (136 L), `migrate-all.js` (117 L), `v1-to-v2.js` (125 L). This is the exact pattern to mirror. **Read these first.**
- `cli/src/data-fixes/` does **not** exist yet — this is the new directory.
- `cli/src/db.js` **already supports env-var DB credentials** (`ETENDO_DB_HOST/PORT/USER/PASSWORD/NAME`, plus `ETENDO_GRADLE_PROPERTIES`). The spec's "`SF_DB_*` gap" is largely already closed — confirm naming/secret wiring rather than building from scratch.

**Etendo GO (`com.etendoerp.go`):**
- `src/com/etendoerp/go/onboarding/AccountingPackageCloner.java` — **NOT touched by this task** (it clones taxes/combinations on the new-org path, not the chart of accounts). Listed only to note we deliberately do not couple to it; R1/R2 use SQL instead. Audited 2026-06-11.
- `src/com/etendoerp/go/onboarding/steps/MarkOrgReadyStep.java` + `OnboardingMarkOrgReadyService.java` — where D1 originates (only does `setReady(true)`, never recomputes LE columns). Relevant only if we decide to fix D1 at the source (open decision #5); the data-fixes framework itself needs no Java.

---

## 5. Proposed implementation plan (DRAFT — to refine together)

Two parallel tracks (the two fronts of §1). **Track B (corrective)** and **Track A (preventive)** can largely proceed independently; per gap, the diagnosis is shared so they should be authored together. DEV → REVIEW → QA → DOCS per pipeline.

### Track B — Corrective: the `.sql` data-fixes framework (Node + SQL)

**B0 — Foundations**
- Confirm `db.js` CI credential story (env vars present; just wire secrets / confirm naming).
- Create & register the `ETGO_DATA_FIX_HISTORY` AD table (table/columns/element, dbprefix, `make uuid`, `export.database`). Key `(ad_client_id, fix_id)`; columns `status, applied_utc, rows_affected, checksum, detail`.

**B1 — Framework skeleton (Node)**
- `cli/src/data-fixes/run.js` (runner) + `.sql` discovery/header-parser + ledger read/write helpers.
- Runner orchestration: glob+sort `sql/*.sql`, parse `-- @id/@gap/@risk/@type` + split `@check`/`@apply` sections, ledger-skip, run `@check` gate, per-fix transaction on `@apply`, param binding (`:client_id` mandatory, `:org_id` optional), `rows_affected` → APPLIED/SKIPPED, `--dry-run`, `--client`/`--fix`. Use a fixture `.sql` for tests — no real fixes yet.

**B2 — The fixes, all SQL (no Java, no webhook)**
- `R3-periodcontrol`, `R4-org-tree`, `R5-legal-entity-denorm`, `R6-user-session-org` — adapt the verified SQL from `onboarding-gaps.md`.
- `R1-chart-of-accounts`, `R2-acct-defaults` — also SQL: clone from the GOOrg source client, guarded by `NOT EXISTS`. The heaviest (R1 ≈ 1790 rows) but the SQL is already drafted/verified.
- Each `.sql`: own `@check` gate + guarded `@apply`, scoped by `ad_client_id`. Test each: "needs it → check returns rows → APPLIED with N rows" / "doesn't need it → check returns 0 → SKIPPED, apply never runs" / "re-run → ledger-skip".

**B3 — CI/deploy integration**
- Add the runner as the gated post-deploy step in the Jenkins backend pipeline.

### Track A — Preventive: close each gap at the source in onboarding (Java)

Per-gap, slot the root-cause fix into the `OnboardingStep` pipeline so **new** clients are never born broken. Each needs investigation against the current step code + a JUnit/OBBaseTest proving a freshly-onboarded client has no gap.

**A1/A2 — Accounting setup step (the big one)**
- There is **no accounting step** in the pipeline today. Add one per `docs/proposals/initial-organization-setup-accounting.md` (`resolveAccountingPackage` → `applyAccountingPackageWiring` → `validateAccountingPackage`) so the chart of accounts + `*_acct` tables are populated before `AD_Org_Ready`. *(This is where the existing `AccountingPackageCloner` legitimately belongs — preventive front, not the SQL data-fix.)*

**B1 — `AD_ORG_TREE`** — verify/fix that `MarkOrgReadyStep`'s `AD_Org_Ready` actually populates `AD_ORG_TREE` in the GO onboarding path.

**C1/C2 — Period control** — set `isperiodcontrolallowed`/calendar fields in the relevant step before periods are created.

**D1 — Legal-entity columns** — recompute denormalized LE columns in `MarkOrgReadyStep` after `AD_Org_Ready` (ties to ETP-4177). Also the root-cause investigation (transaction split vs. Hibernate cache).

**E1 — User org** — `CreateOrgAdminStep`/`CreateClientAdminStep` set `AD_User.ad_org_id` to the tenant org at creation.

### Shared

**S — Docs**
- Author/run guide for the data-fixes framework + the onboarding fixes; update `onboarding-gaps.md` to mark each gap "preventive ✅ / corrective ✅" with cross-links.

---

## 6. Open decisions to resolve before coding

1. **`ETGO_DATA_FIX_HISTORY` ownership** — does the table live in `com.etendoerp.go` (so it ships with the module + `export.database`) or is it Schema-Forge-managed? (Leaning `com.etendoerp.go` — `ETGO_` prefix, travels with `export.database`.)
2. **CI target** — confirm the exact Jenkins pipeline/repo (`com.etendoerp.jenkins.pipelines`) and whether we have access to edit it in this task or it's a separate hand-off.
3. **D1 root cause mechanism** — onboarding doc flags it as unconfirmed (transaction split vs. Hibernate cache). Corrective R5 recomputes via SQL regardless; preventive A-track must find and fix the actual mechanism in `MarkOrgReadyStep`. Needs investigation.
4. **Track A sequencing & risk** — the preventive accounting step (A1/A2) touches the live new-org provisioning path and is the largest piece. Do both tracks land in one PR, or Track B (corrective, lower risk) first and Track A per-gap after? Even within "both fronts in scope", the *delivery* can be staged.
5. **A1/A2 preventive vs. the cloner** — the accounting setup step is where `AccountingPackageCloner` legitimately lives. Confirm we build the accounting step per the proposal (reusing/refactoring the cloner) vs. another approach.

**Resolved:**
- ~~Webhook vs. direct for R1/R2 (corrective)~~ — resolved: the **data-fix** R1/R2 are plain SQL cloning from GOOrg; the framework is decoupled from onboarding. `@type: webhook` is a reserved, unused runner capability. (The cloner reappears only on the *preventive* front — a separate concern.)
- ~~R1/R2 form within the SQL-file model~~ — resolved: ordinary `@type: sql` fixes.

> **Scope note:** "both fronts" means ETP-4215 includes Java work (Track A / onboarding), not just Node+SQL. The *data-fixes framework itself* is still Node+SQL only.

---

## 7. Working log / decisions made

- 2026-06-11 — Branches `feature/ETP-4215` created in both repos off `epic/ETP-3504`; `feature/ETP-4213` merged into `feature/ETP-4215` in `schema_forge` (merge `73ce33f7`) to bring in `onboarding-gaps.md`. This guide created.
- 2026-06-11 — **Decision: fixes are plain `.sql` files** (not JS modules) + runner/ledger. Idempotency via defensive SQL.
- 2026-06-11 — **Decision: mandatory `ad_client_id` (tenant) scoping.** Every fix must filter by `ad_client_id = :client_id` and run for one client in isolation. Runner always binds `:client_id`; ledger key includes it. `:org_id` is secondary.
- 2026-06-11 — **Decision: each fix has an explicit `@check` gate.** The `.sql` is split into `@check` (returns rows ⇒ fix applies) and `@apply` (guarded). Runner runs `@check` first; 0 rows ⇒ SKIPPED, apply never runs. Two-layer idempotency (check + guarded apply).
- 2026-06-11 — **Decision: chronological UTC-timestamp naming** (`YYYYMMDDThhmmssZ__slug.sql`). Lexical sort == chronological execution order, no TZ ambiguity. `R1..R6` are the known initial exceptions — they also get a timestamp prefix; the `Rn` label lives only in `-- @id:` for traceability. No per-org scope.
- 2026-06-11 — **Decision: keep the history table, renamed `ETGO_DATA_FIX_HISTORY`** (was `ETGO_ORG_REMEDIATION`). One row per `(ad_client_id, fix_id)`. Runner gates on `fix_id` presence (robust to out-of-order migrations), NOT a date watermark; the "up to where" is a derived `MAX(applied_utc)` query. Columns: status, applied_utc, rows_affected, checksum, detail.
- 2026-06-11 — **Decision: `fix_id` = full filename without `.sql`** (`20260611T143000Z__R3-periodcontrol`). Catalog of migrations = `.sql` files in git; table stores application state only, never the SQL. Applied migrations are immutable (never rename/edit); `checksum` detects violations.
- 2026-06-11 — **Decision: SQL-first criterion with a Java-ambivalent escape hatch.** Per gap: try idempotent SQL first (`@type: sql`, default). If too complex/stateful — or the preventive onboarding fix is a substantial new step — write the logic ONCE in Java and expose it via a webhook the data-fix calls (`@type: webhook`), so one implementation serves both new-client onboarding and existing-client remediation. `@type` is decided per-gap at implementation time, not globally.
- 2026-06-11 — **Decision: TWO FRONTS, both in scope for ETP-4215.** Every gap is closed both preventively (root cause in the onboarding `OnboardingStep` pipeline — Java) AND correctively (`.sql` data-fix for existing clients). The data-fix framework stays Node+SQL & decoupled; the preventive front is where onboarding Java (incl. the accounting setup step / cloner) lives. Plan reorganized into Track A (preventive) + Track B (corrective).
- 2026-06-11 — **Step 1 DONE: `ETGO_DATA_FIX_HISTORY` created** via `/etendo:alter-db` (webhooks + SQL). `AD_TABLE_ID=6CAC0646DBDE44E28B3F84010F416594`, module `com.etendoerp.go` (`94E1B433CF55451EABB764750AC5902A`), DataAccessLevel 4. 7 custom cols (incl. new `description` mirroring the `.sql` `@description` header), `status` as List ref (APPLIED/SKIPPED_NOT_NEEDED/FAILED), `UNIQUE(ad_client_id, fix_id)`, all elements linked. Resolved open decision #1 → table lives in `com.etendoerp.go`. Two skill snags documented in `.etendo/skill-feedback.md` + `docs/etendo-ad/tenant-remediation-knowledge.md` (context.json wrong javapackage; SyncTerms global failure → manual element-sync with module-in-development). **User still needs to run `export.database -Dmodule=com.etendoerp.go`** so the table ships in the module XML.
- 2026-06-11 — **Decision: execution point is a `make` target in `schema_forge` — and only that, for now.** Jenkins/post-deploy CI integration is **deferred** to a later task; we prove the `make`-driven loop first. Added §0 "Execution roadmap" with the ordered steps: (0) iterate on plan → (1) history table → (2) `make` execution point → (3) one test migration → (4) the R1–R6 gap migrations, with the preventive onboarding fixes proceeding in parallel. We go step by step, landing and verifying each before the next.
- 2026-06-11 — **Step 1 EXTENDED: System-owned ledger + sys-admin window (supersedes the ledger-key details in the entries above).** Requirement clarified with the user: *only* the System Administrator opens the history and must see **every tenant** in one grid. Since a `userlevel='S'` role only reads its own client `'0'`, a client-level table would hide other tenants — so the table is **System-only (accesslevel `4`)**, rows owned by System (`ad_client_id='0'`), and the remediated tenant moved to a dedicated mandatory FK column **`remediated_client_id`** (→ AD_Client, Table-ref `129`). UNIQUE swapped: dropped `etgo_dfh_client_fix_un (ad_client_id, fix_id)` → added **`etgo_dfh_tenant_fix_un (remediated_client_id, fix_id)`**. Created the **`Data-Fix History` window** (`AD_WINDOW_ID=5F0F3B5D0C374C62A4EC4E3DDBFA7DB9`, tab `5FB435324A1C49A287A08882BBD45F18`, read-only) restricted to **System Administrator only** (deleted the 15 auto-granted client/org role accesses; accesslevel `4` already enforces it since that's the only `userlevel='S'` role). The corrective-SQL principle is unchanged — fixes still filter the *target* tables by `ad_client_id = :client_id`; only the ledger's own tenant column is named `remediated_client_id`. Gotchas logged in `tenant-remediation-knowledge.md` (FK-name collision → SQL; `CheckTablesColumnHook` needs `ModuleID`; `RegisterTab IsReadOnly` no-op). **User still needs `export.database -Dmodule=com.etendoerp.go`** for both the column and the window to ship.
- 2026-06-11 — **Decision: drop the `AccountingPackageCloner` / webhook route from the corrective front.** (It still belongs on the *preventive* front — the onboarding accounting step.) Audited the cloner (`com.etendoerp.go/.../AccountingPackageCloner.java`): it clones taxes/combinations on the new-org path, NOT the ~1790 `c_elementvalue` chart-of-accounts rows A1 needs. `onboarding-gaps.md` already has verified idempotent SQL for A1 + A2. So R1/R2 become plain SQL (clone from GOOrg, `NOT EXISTS`-guarded), the framework stays fully decoupled from onboarding Java, and the risky "Phase 3 — Java cloner refactor" is removed. Closes the old open decisions on scope/webhook. Framework = Node + SQL only.
