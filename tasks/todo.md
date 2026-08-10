# ETP-4785 — Fiscal config: change the active SIF (WORKING PLAN)

> Jira synced (In Progress). Immediate model. Sequential A→B. Trigger in all 3 SIF modules.
> Full redefined spec is in Jira ETP-4785 (mirror kept at bottom of this file for reference).

## Dispatch plan

- [x] **0 — Branches (Clerk):** `feature/ETP-4785` off `epic/ETP-3504` in 4 repos:
      schema_forge · com.etendoerp.verifactu · com.smf.ticketbai · org.openbravo.module.sii.
      (com.etendoerp.go: NO change — resolution is client-side, classic resolvers untouched.)
- [x] **A — DB constraints (Dev slot 1):** DONE + Alex 🟢. Dropped `UNIQUE(org)` VF/SII; added
      `*_ONE_ACTIVE_CONFIG_TRG` + `*_One_Active_Config` AD_MESSAGE in all 3 modules (DB-first →
      export.database). Benign export drift KEPT (view no-op, whitespace, message re-sort — Alex
      verified byte-level). SQL-proven coexistence + rejection. Committed: VF 4c44d22 · TBAI 913073d · SII d428527 (not pushed).
- [x] **B — Go front-end (Dev slot 2):** DONE. Active-filter gate in `useFiscalConfig`+`useFiscalMonitor`
      (prefer active row → `activeOrNull` before `detectProfile`); new `ChangeSifDialog.jsx` deactivates
      via PUT `{active:false}` (never delete; sii+tbai both) → wizard reappears; per-SIF notices + soft
      warning; 14 i18n keys en/es. isReady intentionally NOT a block (matches INFORM design). Uncommitted.
      Open for QA: verify `active` present in live NEO JSON for the 3 specs. Pending: REVIEW→QA→tests→DOCS.
- [x] **B REVIEW (Alex):** 🟢 APPROVE, no blockers. W1 fixed (sii+tbai partial-state: honest comment +
      `fiscal.changeSif.err.partial` key en/es listing already-deactivated systems). N1 (unit tests) → Tester.
      DOCS required: `docs/generated-custom-windows/fiscal-config.md` → DOCS phase.
- [x] **C — Tests (Tester):** DONE. Unit (utils + ChangeSifDialog + 2 real-utils hook tests, covers N1)
      663 passed/0 failed; E2E mocked TC2/TC4/TC6 23 passed. TC1 covered by existing regression. No bugs.
- [x] **QA (Sentinel):** PASS. 596 tests green, 0 defects. 6 TCs pass. Item#2 (triggers) SQL-proven in 3
      modules; Item#1 (`active` in NEO JSON) confirmed via NeoFieldFilter.java:139-144 source guarantee
      (empirical real-row check deferred, low risk). Caveat: e2e needs `make dev` not `dev:mock`.
- [x] **DOCS (Sage):** DONE. `fiscal-config.md` Change SIF section (data model + triggers, button gate,
      deactivate-as-trace, sii+tbai partial-failure, wizard, INFORM notices, client-side resolution,
      testids) + `e2e-testing-guide.md` `make dev`-not-`dev:mock` note. Self-doc policy satisfied.
- [ ] **Clerk:** commit Task B on schema_forge; then PRs for all 4 repos → epic/ETP-3504 (on user OK).

## export.database drift policy (decided 2026-08-07)
If `export.database` produces drift beyond the intended constraint/trigger change:
- **Benign** (AD reorder/format, standard fields/values unrelated to SIF) → KEEP it, commit it with
  the change so it stops re-drifting in future exports.
- **Suspicious** (touches other SIF tables, deletes objects, unrecognized) → isolate + surface to
  coordinator/user before proceeding.

## Test cases (from Jira)
- TC1 edit+save persists (regression) · TC2 Change SIF deactivates + wizard reappears ·
  TC3 new active config after wizard, exactly one active, old stays inactive ·
  TC4 leave wizard = valid no-SIF state · TC5 inactive + active coexist ·
  TC6 Verifactu notice + isReady lock respected, change still allowed.

## Environment note — update.database (2026-08-07)
Original "database has local changes" block (SIF modules `isindevelopment='N'` → per-module consistency
gate flagged our Task A DB objects) RESOLVED: flipped the 3 SIF modules to `'Y'` (LEFT at 'Y' per user),
smartbuild + export = 0 diffs. ETP-4785 integrity re-verified post-fix (triggers present, UNIQUEs gone,
messages present, rejection re-proven w/ rollback).
`update.database` still blocked by a SEPARATE, pre-existing, non-ETP-4785 cause: `OBUIAPP_PROCESS`
`31ED9333E46C419D92E9F1B10F821B91` (Clone process, module `com.smf.jobs.defaults`) — `ACCESSLEVEL` DB/XML
= 7 (correct, from ETP-1023 `c53a0630`) vs stale install dataset baseline = 3. Environment drift; user
resolves outside the pipeline. Standard DBSM fix = set jobs.defaults `'Y'` + export + update.

## Task A regression follow-up — isactive filter on non-OBCriteria config access (2026-08-07)
Dropping UNIQUE(org) exposed 5 config-table paths that bypass OBDal's active filter (native SQL /
JDBC / getSession HQL), keyed by org, previously safe only because UNIQUE guaranteed one row. Audit
found 5 MUST-FIX, ~20+ OBCriteria sites SAFE. Spike was right about OBCriteria reads; missed these.
- #1 VF `InvoiceSendingListener.java:95-98` native UPDATE system_startat/stopat → corrupts trace
- #2 VF `DocInvoiceVerifactu.java:1066-1076` getSession HQL existence → counts traces
- #3 VF `VerifactuDateOperationHook.java` JDBC JOIN by org → wrong baseline date
- #4 SII `SiiDateOperationHook.java` (same JOIN bug)
- #5 TBAI `TbaiDateOperationHook.java` (same JOIN bug)
Systemic: the 3 *DateOperationHook are near-identical copies → same `AND <alias>.isactive='Y'` fix.
Fixing all 5 → Alex review. (Real "external-backend-change" — note for /estimate calibration.)
- Fixes APPLIED (uncommitted): `and isactive='Y'` on the 2 VF native UPDATEs + `AND c.active=true` HQL
  + `AND <alias>.isactive='Y'` in the 3 DateOperationHook JOINs. VF compiled via Gradle; SII/TBAI legacy
  Ant (Gradle NO-SOURCE) → Alex signed off the 2 uncompiled files.
- Alex 🟢 APPROVE (no blockers). Key finding: the 3 DateOperationHook already gate on
  `oi.em_etsg_has_<x>_config='Y'` (WHERE) — so an org with only inactive traces was already excluded;
  the real bug was JOIN fan-out picking a stale trace baseline date. `isactive='Y'` restores 1-row
  cardinality; NOT a regression, no active org loses `em_etsg_date_operation`.
- TESTS DONE ✅: 10 OBBaseTest/JUnit across the 3 modules (VF listener+hasNotConfig DB tests, 3
  DateOperationHook SQL-shape tests) — BUILD SUCCESSFUL, 0 failures, no seed leak. (update.database
  block resolved by user via -Dforce=true; env up.) Not covered: DateOperationHook full e2e invoice
  path (needs 17-FK c_invoice + orginfo has_config='Y' — regression locked by SQL-shape tests instead).
- ALL uncommitted: Task B (front+tests+docs) in schema_forge; 5 backend fixes + 10 JUnit in the 3 SIF
  repos. Pending user OK → Clerk: commit + push + PRs → epic/ETP-3504.

## Add-scope — show Active field in classic config windows (2026-08-07)
Consequence of multi-row configs: users must see which config is Active in the CLASSIC windows.
Audit: SII already shows it (ISDISPLAYED=Y). TBAI + VF have the field but hidden. Scope = show it in
TBAI (AD_FIELD 25830F429C624300B8B6CD49214E44C1) + VF config tab (5B6DDBEDAAD74D7C95F042B11D3C7B91),
DB-first (UPDATE ad_field isdisplayed Y) → export.database. NOT touching SII; NOT adding to VF Emisor
tab (user decision). DONE: ISDISPLAYED N→Y both fields, DB-first + export, no drift. Alex 🟢 (0
findings) — manual activation guarded by `*_ONE_ACTIVE_CONFIG_TRG` (fires BEFORE ins/upd, rejects 2nd
active). Uncommitted. Optional follow-up: 1-line changelog in etendo_docs ES localization (not this repo).

## Add-scope — seal "Parada del Sistema" (system_stopat) on VF deactivation — REVERTED (2026-08-10)
Initial design: DAL EventHandler writing system_stopat on Y→N active transition. REVERTED: user
clarified that system_startat/system_stopat are server-lifecycle fields (Tomcat listener start/stop
for diagnostics), NOT config-lifecycle fields. Writing them on deactivation was semantically wrong.
`InvoiceSendingListener` remains the sole owner of those fields (contextInitialized / contextDestroyed).
`VerifactuConfigDeactivationObserver.java` + its OBBaseTest deleted. Java suite is now 10/10
(Etp4785ActiveConfigFilterTest 4/4 + 6/6 SQL-shape).

## Fix — SII AD_MESSAGE language (2026-08-07)
`AEATSII_One_Active_Config` was wrongly Spanish; SII module authors messages in ENGLISH base + es_ES TRL
(unlike VF/TBAI which are Spanish). Fixed DB-first + export: base MSGTEXT → English, es_ES TRL keeps the
Spanish text with istranslated flipped N→Y (matches siblings AEATSII_CINVREV_CHECK1 etc). One-line XML
diff; VF/TBAI untouched. Lesson saved: SIF modules don't share one message language — grep siblings first.
- SII es_ES translation lives in a SEPARATE module `org.openbravo.module.sii.es_es` (cloned by user,
  branch master → 5th repo for ETP-4785). export.translation dragged in ~48 unrelated drift entries;
  user cleaned it up manually → final diff is ONLY our entry (row id 5BD3D6CA..., 4 insertions, 0
  deletions). VF/TBAI Spanish intact. DONE.

## Decision — pending-invoice block on deactivation (2026-08-10)
Verifactu already blocks deactivating/deleting its config when there are unsent invoices, via existing
`ETVFAC_VFACTU_CONFIG_BLOCK_TRG` (fires on DELETE **and** on isactive change → already covers our
Change-SIF deactivation; AD msg `ETVFAC_cfg_verifactu_block` worded for "desactivar/eliminar"). SII and
TBAI have NO equivalent block trigger (only *_ONE_ACTIVE_CONFIG_TRG + *_CHECK_SIFS_CONFIGS_TRG). User
decided (2026-08-10) NOT to add the equivalent to SII/TBAI — leave only Verifactu. Conscious scope
decision, not an oversight (each SIF has its own normativa/flow).

## Regression #2 — AD dictionary scalar subqueries break invoice creation (2026-08-10)
User hit "could not extract ResultSet" creating an invoice in Go. Root: PostgreSQL "more than one row
returned by a subquery" at NeoDefaultsService.injectMandatoryDefaultForColumn:905. Cause = dropping
UNIQUE(org) → AD SQL expressions doing scalar subquery `SELECT x FROM <config> WHERE ad_org_id=...`
now return N rows. Known so far: 7 SII AD_COLUMN defaults on C_Invoice (EM_Aeatsii_*) + 1 val rule
("Situación Inmueble IGIC"), all missing isactive filter. NOTE: fires on ANY C_Invoice create incl.
CLASSIC, not just Go → broad impact. This is the AD-SQL layer the spike flagged as "verify manually"
and we didn't close. Fix = add `AND isactive='Y'` (DB-first + export in owning module). Running a DEEP
audit of the whole dictionary+DB (views/functions/triggers/refs) across 3 modules + core first, then
fix all, then test invoice creation.

## Review section
_(filled on completion)_

---

## Jira description (reference mirror)
See https://etendoproject.atlassian.net/browse/ETP-4785 — synced 2026-08-07.
    