# Tenant Data-Fixes Framework — Design

- **Date:** 2026-06-10
- **Status:** Approved design — pending implementation plan
- **Related:** `docs/etendo-ad/onboarding-gaps.md` (the gaps this remediates), `docs/proposals/initial-organization-setup-accounting.md` (new-org accounting setup), `cli/src/migrations/` (the existing migration pattern this mirrors)

## 1. Problem

The onboarding/accounting setup works for **new** organizations: `GoInitialOrgSetupAccountingHandler` → `AccountingPackageCloner.cloneInto()` runs during the *Initial Org Setup* process. But:

- `cloneInto` is invoked **only** from that handler (new-org path) and has **no idempotency guards** — it cannot safely target an already-provisioned org.
- `MarkOrgReadyStep` only does `org.setReady(true)`; it never recomputes the denormalized legal-entity columns (finding D1).
- For **already-provisioned tenants**, the only correction today is the **manual SQL** in `onboarding-gaps.md` (A1/A2/C2/D1/E1). There is no automatic, tracked, idempotent remediation.

We need **a clear, repeatable method to author, run, and track data fixes/migrations across existing tenants** — where each fix carries its own (possibly non-trivial) logic, applied **client-by-client**, idempotently, and automatically at deploy time.

## 2. Approach

Mirror the repo's existing migration pattern (`cli/src/migrations/`: registry + self-contained units + runner with `--dry-run`/scope) but adapt the **tracking model** for live multi-tenant DB state.

| | `decisions.json` migrations (existing) | Tenant data-fixes (this design) |
|---|---|---|
| Target | a versioned file | live DB state, **N clients** |
| Ordering | sequential v1→v2→v3 | **independent** fixes, not a linear chain |
| Tracking | `version` field embedded in the file | **external per-client ledger** table |
| Fix logic | transform JSON | **arbitrary**: SQL, or webhook to the Java cloner |

It lives in the **Schema Forge pipeline** (Node, `cli/src/data-fixes/`), operator/CI-run like `push-to-neo` — no mandatory Java. Each fix decides *how* it remediates; the framework only orchestrates, tracks, and guarantees idempotency.

## 3. Components

### 3.1 Fix module (self-contained unit)

Mirrors `cli/src/migrations/v1-to-v2.js`. One file per fix:

```js
// cli/src/data-fixes/R1-chart-of-accounts.js
export const fix = {
  id: 'R1-chart-of-accounts',
  description: 'Backfill full chart of accounts for legal-entity orgs missing it',
  riskLevel: 'high',                 // 'low' | 'high' — informational/observability
  detect(org, ctx) { /* idempotent check → { needed: boolean, detail } */ },
  async apply(org, ctx) { /* its own logic: SQL, or webhook → AccountingPackageCloner */ },
};
```

The framework **does not assume fixes are trivial or uniform**. `detect()` is the idempotency primitive (a fix is only applied when `detect().needed === true`). `apply()` encapsulates whatever the fix requires.

Initial fixes (one per onboarding-gap finding):

| id | Gap | apply() strategy |
|---|---|---|
| `R1-chart-of-accounts` | A1 | webhook → Java cloner (single source of truth) |
| `R2-acct-defaults` | A2 | webhook → Java cloner |
| `R3-periodcontrol` | C2 | SQL (504 rows/year backfill) |
| `R4-org-tree` | B1 | SQL (`AD_ORG_TREE` rows) |
| `R5-legal-entity-denorm` | D1 | SQL (recompute via `ad_get_org_le_bu_treenode` / `ad_org_getcalendarownertn`) |
| `R6-user-session-org` | E1 | SQL (`AD_User.ad_org_id`) |

### 3.2 Registry

Mirrors `migrations/index.js`, but a flat set (not a version chain):

```js
// cli/src/data-fixes/index.js
export const FIXES = [R1, R2, R3, R4, R5, R6];
```

### 3.3 Per-client ledger — `ETGO_ORG_REMEDIATION`

The Liquibase-`DATABASECHANGELOG` analogue, keyed per tenant:

| Column | Role |
|---|---|
| `ad_client_id`, `ad_org_id` | which tenant/org |
| `fix_id` | e.g. `R3-periodcontrol` |
| `status` | `APPLIED` / `SKIPPED_NOT_NEEDED` / `FAILED` |
| `applied`, `detail` | timestamp + row count / error message |

Logical key `(ad_client_id, ad_org_id, fix_id)`. A row in `APPLIED` is never re-run. Requires full Etendo AD registration (`AD_TABLE`/`AD_COLUMN`/`AD_ELEMENT`, dbprefix, `export.database`) — UUIDs via `make uuid`.

### 3.4 Runner

Mirrors `migrate-all.js`:

```
node cli/src/data-fixes/run.js [--dry-run] [--client <id>] [--fix <id>]
```

For each (client/org × fix): check ledger → if not `APPLIED`, run `detect()` → if needed, run `apply()` in its **own transaction** → record result. Idempotent and resumable.

- `--dry-run` — emit the plan (what each client would get), write nothing.
- `--client <id>` — the explicit "client by client" control / single-tenant repair.
- `--fix <id>` — run/retry one fix (e.g. re-run a `FAILED`).

### 3.5 A1/A2 ↔ Java cloner

`R1`/`R2` do not reimplement the accounting clone in SQL (that would diverge from the new-org path). Instead the Java `AccountingPackageCloner` is **refactored to be idempotent and decoupled** from `InitialOrgSetupAccountingContext` so it can target an existing org, and exposed via a remediation **webhook** (same pattern as `push-to-neo`). The fix module calls that webhook. Single source of truth for the clone.

## 4. CI / Deploy Integration

Runs in the **backend/DB deploy pipeline** (Jenkins, `com.etendoerp.jenkins.pipelines`) — **not** the SPA `deploy-staging.yml` (that is S3/CloudFront only, no DB access).

**Gate: auto-apply, post-deploy, gated on green.** The runner is the **last** step and runs only after the full deploy succeeded:

1. Deploy frontend (S3/CloudFront).
2. Deploy backend module + `update.database` / `export.database`.
3. Health / smoke checks pass → "deploy landed".
4. **Then** `node cli/src/data-fixes/run.js` (apply mode) — idempotent; already-applied tenants → `SKIPPED`.
5. Record `APPLIED/SKIPPED/FAILED` per client in the ledger; print a summary to the deploy log; alert on `FAILED`.

**Invariants:**

- **Never runs against a half-deployed environment** — gated on all prior phases green (step 3).
- **Runs after schema update** (step 2) so the ledger table and any new AD tables exist.
- **Per-(client × fix) transaction** — one tenant's `FAILED` does not roll back others.
- **Deploy success ≠ remediation completeness** — a `FAILED` tenant is logged + alerted but does **not** roll back the (already-green) deploy; it resumes next deploy.
- **Credentials via env vars** — `db.js` must support `SF_DB_*` env vars (CI secrets) in addition to `gradle.properties`/explicit config (small gap to close).
- **Big-backfill safety** — `R1` (~1790 accounts) and `R3` (504 rows) × N clients: bounded batches; prefer a maintenance window.

## 5. Idempotency Model

Two layers: (a) the **ledger** skips anything already `APPLIED`; (b) `detect()` re-checks live state so even a ledger-less run is safe. Running the runner on every deploy is therefore a no-op once converged. `--dry-run` always shows the exact remaining plan.

## 6. Testing

- **Framework (Node):** Vitest/node:test for the runner (ledger skip logic, per-fix transaction isolation, `detect()`-gating, `--dry-run` writes nothing, `--client`/`--fix` scoping). Fixture fixes with deterministic detect/apply.
- **Each fix:** a test with a tenant that needs it and one that does not (asserts `APPLIED` vs `SKIPPED_NOT_NEEDED`, and re-run = `SKIPPED`).
- **Java cloner (R1/R2):** JUnit for the decoupled/idempotent `AccountingPackageCloner` (apply twice → no duplicates); OBBaseTest for the webhook entry point.

## 7. Risks

- **Prod data mutation from CI** — mitigated by the post-deploy green gate, per-tenant transactions, dry-run plan, and ledger audit trail.
- **Cloner refactor regressions** — the new-org path and the remediation path now share `AccountingPackageCloner`; both must be covered before rollout.
- **Ledger drift** — if a fix is applied out-of-band (manual SQL), `detect()` (not just the ledger) prevents double-apply.
- **Long locks** on large backfills — batching + maintenance window.
- **Secrets exposure** — prod DB creds in CI must come from the secret store, never a committed file.

## 8. Out of Scope

- Reversibility/rollback of individual fixes (the ledger is an audit trail, not an undo log). Risky fixes may capture before-state, but a generic undo is not in this iteration.
- Replacing native Liquibase for DDL — this framework is for **conditional, per-tenant data** remediation, not schema DDL.
