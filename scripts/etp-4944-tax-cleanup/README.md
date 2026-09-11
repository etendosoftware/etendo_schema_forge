# ETP-4944 — Spanish Fiscal Tax Rate Catalog Cleanup

Cleans up the Spanish fiscal tax rate reference-data shipped by
`com.etendoerp.go.localization.es.data` (`Spanish_Fiscal_Taxes_Go.xml`), and applies
the equivalent cleanup to already-provisioned environments via a companion SQL
data-fix.

## Background

A functional review of the 653 `FinancialMgmtTaxRate` records in
`Spanish_Fiscal_Taxes_Go.xml` (attached to
[ETP-4944](https://etendoproject.atlassian.net/browse/ETP-4944) as 3 CSVs) found:

- **405 KEEP** — unaffected.
- **246 DELETE** — obsolete/duplicate rates, no longer needed.
- **1 MODIFY** — a capitalization fix (`Adquisiciones bienes inversión 10%` →
  `Adquisición Bienes Inversión 10%`).
- **1 unaccounted record** — `IVA Normal`
  (`867FFFAC82CC44069FE6497E4C5C6348`), an already-inactive placeholder
  (`active=false`, `validFromDate=9999-01-01`) that the spreadsheet review never
  saw. Not in either CSV; added manually to the cleanup after being empirically
  found to be referenced by a live `c_invoiceline` row (see "The final policy"
  below).

This repo's tooling turns the 3 CSVs into a validated, machine-checked scope
(`resolved-scope.json`), which drives two outputs: (a) a rewritten reference-data
XML for new installs, and (b) a companion SQL data-fix for environments that
already imported the old data.

## The final policy: attempt-delete-with-runtime-fallback

The plan's first draft was a blanket delete of the 246 CSV DELETE ids. Two real
findings during implementation forced a per-id fallback policy instead:

1. **Sibling AEAT module overlap.** Three sibling modules
   (`org.openbravo.module.aeat303.es`, `aeat347apr.es`, `aeat390.es`) ship their
   **own** reference-data files that reference the same tax-rate ids (Modelo 303:
   95 hits, 347: 52 hits, 390: 97 hits — 102 distinct ids overlapping the 246
   CSV DELETE candidates). This ticket does not patch those 3 modules' files, so
   deleting any of these 102 ids from the shared tax-rate XML would orphan an FK
   on a fresh install of those modules.
2. **Real usage risk.** A dry run against local dev found `IVA Normal` blocked
   by a live `c_invoiceline` FK reference.

Blanket-deleting either class would either break a sibling module's install or
violate a live FK. The resolution, decided with the reporter, is a **per-id
fallback**, not a fixed delete/deactivate list:

- **The 102 sibling-overlap ids are a static, XML-derived deactivation** — they
  are never even attempted as a delete, on any environment. This is safe to fix
  once because it depends only on the 3 sibling modules' own shipped files, which
  are the same everywhere; it is not derived from any environment's live data.
- **The remaining 145 candidates** (144 CSV-derived, since 102 of the original
  246 moved to the static-deactivate set + `IVA Normal`, no longer
  special-cased) each get a **real delete attempt**, with a **per-id runtime
  fallback to deactivate on FK violation** — decided fresh, per environment, at
  the moment the SQL actually runs.

This distinction between the XML output and the SQL output is deliberate and is
the single most important thing to understand before touching this tooling:

| | `transform-xml.cjs` (the shipped XML) | `gen-delete-sql.cjs` (already-provisioned envs) |
|---|---|---|
| Decision basis | One-time, human-reviewed (local dev's own FK data) | Per-environment, decided at SQL execution time |
| Split | Fixed: 144 delete / 103 deactivate (102 overlap + IVA Normal) baked into `resolved-scope.json.deleteIds`/`.deactivateIds` | Dynamic: 145 delete-attempt `candidateIds` (144 CSV + IVA Normal) + 102 static `staticDeactivateIds` — the actual delete/deactivate split per id is decided at runtime inside a PL/pgSQL `DO` block (`01-apply-tax-cleanup.sql`), not read from `resolved-scope.json` |
| Why they differ | The XML is a single artifact shipped to every install — it can't branch at import time, so it must commit to one decision now | A different, already-provisioned environment can have different live FK references among the 145 candidates than local dev did — a fixed list derived from one environment's dry-run isn't valid on another |

Deactivation (both paths) means: `active`/`isactive = false`, `description` set
to the literal `Discarded Tax for EtendoGO`, and the record's
`Trl`/`Zone`/`OBTL_Tax_Parameter` rows left completely untouched (the parent row
still exists, so nothing is orphaned).

A second-order consequence of the delete/deactivate split: 52
`parentTaxRateBlockers` where a deactivate-bucket (surviving) record's
`parentTaxRate` pointed at a delete-bucket (removed) id. Auto-resolved via
`parentRepoints` (nulled) after confirming all 52 affected children are
themselves in the deactivate bucket, not live KEEP records — never applied to a
still-active KEEP rate, which would be a real business-meaning change requiring
explicit escalation instead.

## Matching key

The 3 CSVs (`tax-rates-DELETE.csv`, `-KEEP.csv`, `-MODIFY.csv`) carry **no id
column** — matching against the XML is by exact string match on the CSV's
`Nombre` column (`Nombre actual`/`Nombre corregido` for MODIFY) against the XML's
`<name>` element, both trimmed.

Trimming is not optional: **~20 XML `<FinancialMgmtTaxRate>` records carry a
trailing space** in `<name>` (e.g. `"Prestación servicios nacional 21% "`) that
the CSV's name does not. Matching without `.trim()` on both sides silently
misses these ~20 real records as "unmatched" — this was found and fixed during
Task 1's first real run against the reporter's actual CSVs.

Unlike ETP-4177's `(name, rate, sopotype)` composite key, ETP-4944's key is
`name` alone, since there is no rate/sopotype column in these CSVs.

## Files

| File | Role |
|------|------|
| `input/tax-rates-{DELETE,KEEP,MODIFY}.csv` | Reporter-supplied CSVs from the ETP-4944 attachments. **Not committed** — confidentiality caveat, see below. |
| `find-sibling-overlap.cjs` | Determines which CSV DELETE-bucket ids are also referenced by the 3 sibling AEAT modules' own reference data. Deliberately has **no dependency** on `resolved-scope.json` (it does its own minimal CSV/XML name matching) to avoid a circular dependency — see Procedure below. |
| `sibling-overlap.json` | Committed output of `find-sibling-overlap.cjs`: the 102 static-overlap ids, plus per-module hit counts (303: 95, 347: 52, 390: 97). |
| `reconcile-scope.cjs` | Reconciles the 3 CSVs against the source XML, folds in `sibling-overlap.json` and the manual `IVA Normal` addition, and applies the delete/deactivate split. Refuses (nonzero exit) if any ambiguity remains. |
| `resolved-scope.json` | Generated output of `reconcile-scope.cjs`. **Not committed** — regenerate locally from the CSVs before running any downstream script. |
| `transform-xml.cjs` | Applies the resolved DELETE/deactivate/MODIFY scope to `Spanish_Fiscal_Taxes_Go.xml`. Writes a sibling `.new` file; never edits in place. |
| `gen-delete-sql.cjs` | Generates **both** `01-apply-tax-cleanup.sql` (the companion data-fix) and `00-assess-usage.sql` (the pre-apply usage check) from `resolved-scope.json`. |
| `01-apply-tax-cleanup.sql` | Committed generated output. Dry-run by default (`ROLLBACK`); `-v do_commit=1` to apply. Environment-agnostic and idempotent — decides delete vs. deactivate per id, per run, against that environment's own data. |
| `00-assess-usage.sql` | Committed generated output. Read-only, belt-and-suspenders usage check across tables that don't have a hard FK (so a stale reference wouldn't throw at delete time but could silently break a report). Run **before** `01-apply-tax-cleanup.sql` on any target. |
| `gen-verify-sql.cjs` | Generates `verify.sql` from `resolved-scope.json`. |
| `verify.sql` | Committed generated output. Read-only post-apply verification — orphan checks, record-count reconciliation, and per-id outcome checks. Safe to re-run any number of times. |
| `backups/` | Pre-migration `pg_dump` (custom format) taken before any real apply. **Not committed** — see "Pre-migration backup" below. |

## Procedure

The real run order — note that `find-sibling-overlap.cjs` runs **before**
`reconcile-scope.cjs`, even though sibling-module overlap was originally a
later-numbered task in the plan: `reconcile-scope.cjs` needs
`sibling-overlap.json` as an input to compute `deactivateIds`, so
`find-sibling-overlap.cjs` cannot depend on `reconcile-scope.cjs`'s output
without creating a circular dependency. `find-sibling-overlap.cjs` therefore
duplicates a minimal, independent copy of the CSV/XML name-matching logic.

```bash
# 1. Place the reporter's 3 CSVs (see "Prerequisites" below)
#    scripts/etp-4944-tax-cleanup/input/tax-rates-{DELETE,KEEP,MODIFY}.csv

# 2. Determine the static sibling-AEAT-module overlap (writes sibling-overlap.json)
node scripts/etp-4944-tax-cleanup/find-sibling-overlap.cjs

# 3. Reconcile CSVs + XML + sibling-overlap.json into resolved-scope.json
#    Exits nonzero, refuses to let anything downstream run, until every
#    unmatched/ambiguous/unaccounted/parentTaxRateBlocker/conflictingBucket is 0.
node scripts/etp-4944-tax-cleanup/reconcile-scope.cjs

# 4. Apply the resolved scope to the source XML (one-time, fixed decision — never
#    overwrites in place, writes Spanish_Fiscal_Taxes_Go.xml.new for manual review)
node scripts/etp-4944-tax-cleanup/transform-xml.cjs
# diff, spot-check, then: mv Spanish_Fiscal_Taxes_Go.xml{.new,}
# rebuild so the WebContent staged copy regenerates: ./gradlew compile.complete smartbuild

# 5. Take a pre-migration backup of the TARGET environment (mandatory — see below)
pg_dump -Fc -h <host> -p <port> -U <user> -d <db> \
  -f scripts/etp-4944-tax-cleanup/backups/etp4944-pre-migration-$(date +%Y%m%d%H%M%S).dump

# 6. Generate the companion SQL (both files, from resolved-scope.json)
node scripts/etp-4944-tax-cleanup/gen-delete-sql.cjs
node scripts/etp-4944-tax-cleanup/gen-verify-sql.cjs

# 7. Run the read-only usage check FIRST, per target environment
psql -h <host> -p <port> -U <user> -d <db> -f scripts/etp-4944-tax-cleanup/00-assess-usage.sql

# 8. Dry run (executes everything, then ROLLBACK; prints the outcome summary)
psql -h <host> -p <port> -U <user> -d <db> -f scripts/etp-4944-tax-cleanup/01-apply-tax-cleanup.sql

# 9. Apply for real (single transaction; all-or-nothing)
psql -h <host> -p <port> -U <user> -d <db> -v do_commit=1 -f scripts/etp-4944-tax-cleanup/01-apply-tax-cleanup.sql

# 10. Verify
psql -h <host> -p <port> -U <user> -d <db> -f scripts/etp-4944-tax-cleanup/verify.sql
```

After applying the XML change, run `./gradlew export.database` in Etendo root —
without it, a DB-only apply won't survive a rebuild. The SQL data-fix itself
(steps 5–10) is client-transactional data, not AD metadata, so `export.database`
is not needed for it specifically.

## Verification evidence (local dev, 2026-09-03)

A pre-migration `pg_dump` (custom format,
`scripts/etp-4944-tax-cleanup/backups/etp4944-pre-migration-20260903175512.dump`)
was taken before the real apply.

- **`01-apply-tax-cleanup.sql -v do_commit=1`**: **144 real deletes**, **102
  static (sibling-overlap) deactivations**, **1 dynamic runtime-fallback
  deactivation** (`IVA Normal`, caught by the per-id `foreign_key_violation`
  handler exactly as predicted by the empirical dry-run finding) — 103
  deactivations total. 52 parent-repoint updates, 2 rename updates (`c_tax` +
  `c_tax_trl`).
- **`verify.sql`**: **13/13 checks clean** (orphan checks on
  `obtl_tax_parameter`/`c_tax_zone`/`parent_tax_id`; all 103 deactivated ids
  showing `isactive='N'` + the exact discarded description; all 103 surviving
  in `c_tax`; all 144 deleted ids fully gone from `c_tax` and every dependent
  table — `obtl_tax_parameter`, `c_tax_zone`, `c_tax_trl`, `c_tax_acct`,
  `parent_tax_id`; the MODIFY rename applied correctly in both `c_tax` and
  `c_tax_trl`). The record-count reconciliation step is informational, not
  counted among the 13 pass/fail checks.
- **Fresh `update.database`**: `BUILD SUCCESSFUL`, no errors referencing
  `Spanish_Fiscal_Taxes_Go` or reference-data import.
- **Modelo 303**: report generation confirmed healthy post-migration for KEPT
  tax rates. Caveat: this was a real-data spot-check, not an exhaustive
  box-by-box reconciliation — a KEPT rate resolving without error is confirmed,
  but not every AEAT box value was independently re-derived by hand.

## Prerequisites for a future operator on a new environment

Before running this against any environment beyond local dev (experimental,
staging, production):

1. **Place the reporter's 3 CSVs** in `scripts/etp-4944-tax-cleanup/input/` —
   they are **not committed** (confidentiality caveat: confirm with the
   reporter before committing them if that ever changes) and must be sourced
   fresh from the ETP-4944 Jira attachments each time.
2. **Take a fresh pre-apply backup** in
   `scripts/etp-4944-tax-cleanup/backups/` (`pg_dump -Fc`, same convention as
   local dev's `etp4944-pre-migration-<timestamp>.dump`) before any real
   (`-v do_commit=1`) apply on that environment. This is a standing
   requirement, not a one-off precaution for the first run.
3. **Run `00-assess-usage.sql` on that environment first**, even though
   `01-apply-tax-cleanup.sql` already has its own per-id runtime fallback — the
   usage check catches tables *without* an actual FK constraint, where a stale
   reference wouldn't throw at delete time but could silently break a report
   (VAT-book, `fact_acct`, `gl_journalline`-style risk) instead.
4. Regenerate `resolved-scope.json` locally from that run of the CSVs — it is
   never committed, so there is no stale copy to accidentally reuse across
   environments.

## Pre-existing, out-of-scope: 654 vs. 653 Trl/Rate mismatch

The source XML (`Spanish_Fiscal_Taxes_Go.xml`, pre-ETP-4944) contains **653**
`FinancialMgmtTaxRate` records but **654** `FinancialMgmtTaxTrl` records — one
`Trl` translation row has no matching `Rate` record. This is a **pre-existing
orphan in the shipped data, unrelated to this ticket** (flagged by Alex during
review); ETP-4944 does not introduce it and does not attempt to fix it. Don't
mistake it for a regression of this cleanup.
