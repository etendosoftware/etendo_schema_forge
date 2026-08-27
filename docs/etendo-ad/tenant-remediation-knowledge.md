# Tenant Remediation — Living Knowledge Base

**Owner:** Remedy (`.claude/agents/tenant-fixer.md`)
**Purpose:** Institutional memory for closing Etendo GO provisioning gaps. Read this FIRST before diagnosing or writing any fix; append durable facts and corrected misinterpretations so they never recur.

**How to use:**
- One dated bullet under the right heading: *symptom / wrong assumption → verified fact → how to apply it.*
- Keep entries terse and queryable. Never delete a correction — supersede it with a newer dated note.
- AD findings live here (not in per-window artifacts). Bugs/blockers go in `docs/feedback.md`.

**See also:** `docs/etendo-ad/onboarding-and-datafixes-map.md` — the path-first "where things live & how to extend them" map (live onboarding service chain + extension recipe, the inert `OnboardingStep` abstraction, the data-fix authoring recipe/skeleton/commands, two-fronts-per-gap table). This knowledge base holds the *facts/quirks*; the map holds the *layout/how-to*.

---

## Corrected misinterpretations

- **2026-06-11 — `AccountingPackageCloner` is NOT the chart-of-accounts generator.** Wrong assumption (from the design spec): "R1/R2 reuse the cloner via webhook as single source of truth." Verified by reading `com.etendoerp.go/.../onboarding/AccountingPackageCloner.java`: it clones **tax categories, taxes, tax zones, tax accounts, and accounting combinations** — NOT the ~1790 `c_elementvalue` chart rows that gap A1 needs. **Apply:** for the corrective A1 data-fix, clone the chart from the GOOrg source client in SQL; do not route A1 to this cloner. The cloner belongs to the *preventive* front (onboarding accounting step) only.
- **2026-06-11 — The cloner is only partially idempotent.** `ensureOrganizationAcctSchema` checks existence and returns early, but `cloneTaxCategories` / `cloneBusinessPartnerTaxCategories` / `cloneTaxes` / `cloneTaxZones` / `cloneTaxAccounts` iterate the source and `DalUtil.copy`+save unconditionally → **running twice duplicates** all of them. It assumes a fresh, empty org. **Apply:** if ever reused for remediation, it must be refactored to check existence per entity first.

---

## Table & column quirks

- **2026-06-11 — `c_element`** has **no** `balancingfactor` column (the flag is `ISBALANCING`) and **no** `c_acctschema_id` column. The schema↔element link lives in **`c_acctschema_element`** (resolve the source element via the schema's `AC` dimension, not a direct FK). Verified against core `C_ELEMENT.xml`.
- **2026-06-11 — `c_elementvalue` UNIQUE constraint** `C_ELEMENTVALUE_VALUE` = `UNIQUE(c_element_id, value)`. **Apply:** the A1 clone must guard with `NOT EXISTS (... WHERE x.c_element_id = <new> AND x.value = ev.value)` to be re-runnable.
- **All `_ID` columns are VARCHAR** (legacy numeric-looking like `'19'`, newer UUIDs). Always quote: `IN ('18','19')`, never `IN (18,19)`.
- **2026-07-06 — `c_acctschema_default.*_acct` columns are FKs to `C_VALIDCOMBINATION`, NOT directly to `c_elementvalue`.** `c_validcombination.account_id` is the real link to the account. A query joining these FKs straight to `c_elementvalue` returns zero rows — pivot through `c_validcombination` first. The tenant's populated columns all point to a combination with EVERY optional dimension column NULL (`m_product_id`, `c_bpartner_id`, `c_project_id`, `c_campaign_id`, `c_activity_id`, `ad_orgtrx_id`, `c_locfrom_id`, `c_locto_id`, `c_salesregion_id`, `user1_id`, `user2_id`) — the "plain" dimensionless posting combination, scoped per `c_acctschema_id`. **Apply:** any fix populating these columns must resolve `c_validcombination_id` (filtered to all-dims-NULL, scoped to the tenant's own schema), never a raw `c_elementvalue_id`.

---

## Confirmed DB facts

- **2026-06-11 — Chart of accounts size:** the full GOOrg tree has **~1790 accounts** (`c_elementvalue`). Common mistake: cloning only the ~30 accounts referenced by `c_acctschema_gl` / `c_acctschema_default`. Copy them ALL.
- **2026-06-11 — AC dimension default account:** the ledger's `AC` dimension "Account" field must point to the chart default (`90030` in GOOrg). Without it, posting fails. Set `c_acctschema_element.c_elementvalue_id` for `elementtype='AC'`.
- **2026-06-11 — Period control backfill:** ~**504 `c_periodcontrol` rows per year** expected.
- **2026-06-11 — `AD_ISORGINCLUDED(org, org, client)`** returns `-1` when `AD_ORG_TREE` is empty (the B1 symptom); must return `1` for same-org. `AD_ORG_TREE` is populated by the `AD_Org_Ready` process.

---

## ETP-4402 — "Anticipo de acreedores" account (417/4170/41700000)

- **2026-07-02 — `c_elementvalue` has NO `parent_id` column.** The chart hierarchy lives ENTIRELY in
  `AD_TREENODE` (`ad_tree_id`, `node_id`, `parent_id`) — never on the `C_ELEMENTVALUE` row itself.
  Corrects an assumption in the ETP-4402 task brief that asked to "read the chain's `parent_id`
  values" — there is no such column; the parent linkage must be read/written via `AD_TREENODE` joined
  on `node_id = c_elementvalue_id`.
- **2026-07-02 — `c_elementvalue_trg()` (standard core trigger) auto-handles 3 things on INSERT.**
  Verified by reading `pg_get_functiondef`: (1) creates one `C_ElementValue_Trl` row per active
  language; (2) when the new row is `elementlevel='S'` (a postable leaf — never `'C'`/`'D'` summary),
  auto-creates ONE `C_VALIDCOMBINATION` row per `C_AcctSchema` wired to that `C_ELEMENT_ID` via
  `C_AcctSchema_Element` — the exact same "trigger does it, don't insert it by hand" pattern as
  `c_bp_group_trg()` for `C_BP_Group_Acct` (already documented above); (3) auto-inserts ONE
  `AD_TREENODE` row, but ALWAYS attached to the tree's ROOT node (the row with `parent_id IS NULL`),
  never the semantically correct parent. **Apply:** after inserting a new `C_ELEMENTVALUE` row via SQL
  (data-fix or onboarding), the row's `C_VALIDCOMBINATION` needs NO manual insert, but its
  `AD_TREENODE` parent DOES need a follow-up guarded `UPDATE` to re-parent it correctly (mirror a
  sibling account's own parent).
- **2026-07-02 — GOClient has TWO `C_Element` rows sharing the SAME `AD_Tree_ID`, but only ONE is
  load-bearing.** `91D04C02EF8F4975B9E4F5E07543B6EA` ("GOOrg Account Tree") and
  `BB9B64C5B6534A40A36F7C0F45C2CC0B` ("Arbol de cuentas GO") both point at `AD_Tree_ID
  D937A98591DC4F6386C8130D350B17C7`. On the LIVE DB, `91D04...` has **zero** `issummary='N'` rows
  (1132 rows, 100% summary) and is **not** referenced by any `C_AcctSchema_Element` — it is a
  legacy/orphan element, not load-bearing for posting. `BB9B64...` is the ONLY element wired via
  `C_AcctSchema_Element.elementtype='AC'` to the client's `C_AcctSchema`, and the only one with
  postable leaves (658 `issummary='N'` rows) and any `C_ValidCombination` rows. **Apply:** when adding
  a new account to an EXISTING tenant's chart via a corrective fix, resolve the target element
  dynamically via `C_AcctSchema_Element` (never hardcode which of a tenant's `C_Element` rows to use)
  — do not blindly duplicate into a second element just because a sibling account happens to exist
  there too. NOTE: the bundled ONBOARDING sampledata XML (`referencedata/sampledata/GOClient/
  C_ELEMENTVALUE.xml`) DOES carry full postable-leaf rows under BOTH elements (e.g. `40700000`
  appears twice, once per element, with different ids) — the live-DB asymmetry is drift between the
  frozen sampledata snapshot and GOClient's current live state, not evidence that new tenants only
  get one element. For the PREVENTIVE front (sampledata), mirror the existing dual-block pattern; for
  the CORRECTIVE front (already-provisioned tenants), resolve dynamically per the tenant's actual
  live state.
- **2026-07-02 — `C_BP_Group_Acct.notinvoicedreceipts_acct` vs `.notinvoicedreceivables_acct` are
  DIFFERENT columns — do not confuse them.** Confirmed via `ad_element`/`ad_element_trl`:
  `notinvoicedreceipts_acct` = "Non-Invoiced Receipts" / "Recibos no facturados" (Account for
  not-invoiced Material Receipts — the AP/creditor-side GRNI concept). `notinvoicedreceivables_acct` =
  "Non-Invoiced Receivables" / "Cuenta pendiente no facturable" (Account for not-invoiced
  Receivables — an AR/customer-side concept, unbilled revenue). **Bug found+fixed:** an earlier
  revision of `OnboardingAccountingWiringService.overrideAcreedorGroupAccounts` (Java, preventive
  front) wired the wrong one (`notinvoicedreceivables_acct`) for the "Acreedor" (vendor/creditor)
  group's "Recibos no facturados" account, while the sibling corrective data-fix
  (`R9-bp-category-seed.sql`) already had the correct column (`notinvoicedreceipts_acct`). Always
  verify BOTH fronts use the identical column name for the same named account — a silent column-name
  mismatch between corrective and preventive is easy to miss since both compile/run fine, they just
  write to different columns.
- **2026-07-02 — `C_BP_Group_Acct.v_prepayment_acct` vs `.v_liability_services_acct` — pick by
  semantic fit, not name-similarity.** `v_liability_services_acct` = "Vendor Service Liability" /
  "Pasivo de servicio del proveedor" — a SECOND liability slot for service-type vendor invoices,
  unrelated to an advance. `v_prepayment_acct` = "Vendor Prepayment" / "Pagos por adelantado del
  proveedor" — literally "advance payment to a vendor", the correct fit for "Anticipo de acreedores".
  Confirmed empirically on GOClient: `C_ACCTSCHEMA_DEFAULT` defaults `v_prepayment_acct` to a generic
  long-term-payables account (`40001000`, "Proveedores (euros) a largo plazo") for every
  `C_BP_Group` — NOT an advances/anticipo account — so overriding it for a specific group is a
  deliberate, meaningful correction, not a no-op.
- **2026-07-02 — `referencedata/sampledata/GOClient/*.xml` IS the live onboarding source, confirmed
  by literal id match.** `tasks.gradle`'s `prepareOnboardingSampledata` task copies every `*.xml` file
  from this directory VERBATIM into the classpath resource path
  (`com/etendoerp/go/onboarding/sampledata/GOClient`) that `OnboardingAccountingWiringService` reads
  from at runtime for new-tenant provisioning — it is a required dependency of every WAR-packaging
  task. Confirmed empirically: the `C_ELEMENTVALUE_ID` for account `40700000` in the sampledata XML
  (`54823C0EB1F941C689DFED85EF3A9B81`) is the EXACT SAME id as on the live GOClient DB — the XML is a
  literal dump of GOClient's own historical state, not a separate hand-authored template. **Apply:**
  when a new account/entity needs to reach NEW tenants, add it to this XML (matching the exact
  existing block shape/column set for a sibling row) rather than assuming a webhook or Java-only path
  — the files end with a `</data>` closing tag; new blocks can be appended just before it (row order
  in these dumps is not semantically significant, only ids matter).
- **2026-07-02 — Editing an unshipped `.sql` data-fix in place is acceptable within the SAME
  in-flight ticket/branch.** The "applied migrations are immutable" rule (mandatory framework rule)
  protects fixes already applied to real tenant DBs (tracked in `ETGO_DATA_FIX_HISTORY`) — it does
  NOT forbid revising a `.sql` file that is still on a feature branch and has zero ledger rows
  anywhere (verified via `SELECT count(*) FROM etgo_data_fix_history WHERE fix_id LIKE '%<fix>%'` = 0
  before editing). Extending `R9-bp-category-seed.sql` in place for ETP-4402's 3rd account (rather
  than shipping a new dated file) kept the `OnboardingBaselineService.ONBOARDING_PROVISIONED_THROUGH`
  CUT untouched (still equal to R9's own filename timestamp) — no CUT bump needed since no new
  `.sql` file was added.

## ETP-4743 — A2c: FIN_Financial_Account_Acct / M_Warehouse_Acct backfill (2026-08-05)

- **2026-08-05 — In-flight branch discovered R21 already claimed on an UNMERGED sibling
  branch — verify against the ACTUAL checked-out branch, not just what the task brief
  claims.** The task brief said "latest fix is R21, CUT is `2026-08-05T12:00:00Z`" (from
  `feature/ETP-4720`, ETP-4720), but `git merge-base feature/ETP-4743 feature/ETP-4720` showed
  `feature/ETP-4720` is ONE commit ahead of `feature/ETP-4743`'s base (both repos) — i.e. ETP-4720
  had NOT been merged into `epic/ETP-3504` yet when Clerk branched `feature/ETP-4743` off it. On
  the actual `feature/ETP-4743` checkout, `cli/src/data-fixes/sql/` tops out at R20
  (`20260803T180000Z`) and `OnboardingBaselineService.ONBOARDING_PROVISIONED_THROUGH` was still
  `2026-08-03T18:00:00Z`, not `2026-08-05T12:00:00Z`. **Apply generally:** a task brief's "here's
  the current state" section is a snapshot from whenever it was written, not a live fact for THIS
  branch — always re-run the orientation checklist's own verification (`ls cli/src/data-fixes/sql/`,
  `grep ONBOARDING_PROVISIONED_THROUGH`, `git rev-list --all` for the claimed label) against the
  actually-checked-out branch before trusting a stated CUT/latest-fix value. Chose `R22` (skipping
  the already-claimed `R21`) and timestamp `2026-08-05T14:00:00Z` — strictly after BOTH R20 (this
  branch's actual latest) and R21's `2026-08-05T12:00:00Z` (the sibling branch's claim) — so no
  collision occurs regardless of which branch merges into the epic first, per the established
  "always resolve to the later timestamp" convention for these merge conflicts (R9/R10, R19/R20).
- **2026-08-05 — Gap confirmed corrective-only for the CUT-bump timing, not for the preventive
  front itself.** ETP-4565 already shipped the preventive Java fix (`FIN_FINANCIAL_ACCOUNT_ACCT_SQL`
  / `WAREHOUSE_ACCT_SQL` in `OnboardingAccountingWiringService`, called from
  `provisionEntityPostingAccounts`) — new tenants onboarded today are already born correct. What
  was missing was (a) the corrective `.sql` for tenants onboarded BEFORE ETP-4565 shipped, and (b)
  the CUT bump, which ETP-4565 deliberately deferred because bumping a CUT without its matching
  `.sql` already in the repo would silently skip the gap for legacy tenants that still need it
  (the framework's own "never bump CUT without matching .sql" rule). This ticket is the two-fronts
  workflow's steps 2+4 only (corrective SQL + CUT bump) — a valid, explicitly-called-out deviation
  from "ship all three deliverables together" when the preventive front already shipped separately.
- **2026-08-05 — Live sweep: every tenant except GOClient itself has the gap.** Query joining
  `fin_financial_account`/`m_warehouse` against `c_acctschema` with a `NOT EXISTS` on the matching
  `*_acct` table (see the `.sql` file's own header for the exact query) found GOClient at 0 missing
  pairs (already correct — its rows were wired at some point outside this framework) and every
  other real tenant with at least one missing pair. F&B International Group has an unusually large
  count (343 financial-account pairs, 96 warehouse pairs missing) simply because it owns **26**
  separate `c_acctschema` rows (most tenants own 1-2) — the corrective fix's per-schema join
  (`JOIN c_acctschema s ON s.ad_client_id = :client_id`, mirroring `R7-tax-accounts`'s
  generalization of the single-schema Java constant) is what makes it correctly cover every ledger
  a multi-schema tenant owns, rather than just one.
- **2026-08-05 — `m_warehouse_acct.w_differences_acct` is the ONLY `NOT NULL` target column across
  both tables.** Verified via `\d fin_financial_account_acct` / `\d m_warehouse_acct`: every other
  `*_acct` column on both tables is nullable, but `w_differences_acct` has no default and is
  `NOT NULL`. On this DB every tenant's `c_acctschema_default.w_differences_acct` is already
  populated (confirmed via a `count(*) FILTER (WHERE ... IS NULL)` sweep across all schemas, all
  zero), so the corrective fix's defensive `d.w_differences_acct IS NOT NULL` guard is currently a
  no-op safety net, not something actively excluding any live tenant — kept anyway so a future
  tenant with an incomplete schema default degrades to a safe skip instead of an INSERT failure.
- **2026-08-05 — Live-validated end-to-end on a real tenant, not just a rolled-back transaction.**
  Ran the actual fix through the runner (`node cli/src/data-fixes/run.js --fix
  20260805T140000Z__R22-fin-account-warehouse-acct --client D94AED60C3E0494AAFD44B8A05BB5CFC`)
  against `acreedortest`: dry-run → `WOULD_APPLY`; real run → `APPLIED (4 rows)` (2 financial
  accounts + 2 warehouses, its only accounting schema); re-run → `SKIPPED_NOT_NEEDED — kept prior
  success state`, confirming idempotency against the tables' own UNIQUE constraints
  (`fin_finacc_acct_acctschema_un` / `m_warehouse_acct_warehouse__un`). This is a REAL, committed
  change to the shared dev DB (not rolled back) — consistent with precedent (R7/R10/R11/R12 etc.
  were similarly applied for real against GOClient during their own validation passes) since the
  whole point of this fix is to actually repair legacy tenants; a rolled-back transaction alone
  would not have proven the runner's ledger-write path end-to-end.

## ETP-4743 — QA rejection cycle 1 (Sentinel): @check/@apply join asymmetry (2026-08-05)

- **2026-08-05 — A "theoretical, negligible-risk" REVIEW note became a proven, live bug in QA —
  never downgrade an asymmetry between `@check` and `@apply` without actually querying for it.**
  Alex (REVIEW) flagged that R22's `@check` financial-account branch didn't join
  `c_acctschema_default` while `@apply`'s INSERT did, but called it theoretical/negligible. Sentinel
  (QA) ran the actual join against the live DB and found 24 of F&B International Group's 26
  `c_acctschema` rows have NO `c_acctschema_default` row — so `@check` was counting 343
  "needs fix" pairs for that tenant while `@apply`'s `INNER JOIN c_acctschema_default` could only
  ever insert 7 of them. The other 336 pairs would show `APPLIED (rows_affected≈7)` on a real run
  (looking like full success) yet `@check` would keep matching >0 rows forever on every future
  run — a SILENT, NON-CONVERGENT fix (never reaches `SKIPPED_NOT_NEEDED`), the worst kind of
  idempotency bug because it looks like it worked. **Apply generally:** any time `@check` and
  `@apply` don't join the exact same tables, actually query the live DB for a case where the
  extra/missing join changes the result set (don't reason from the schema alone) before deciding
  the asymmetry is safe to leave — "@check must be able to deliver at least as much as @apply
  claims, and @apply must be able to close everything @check flags" is the correct symmetry
  invariant, and it is cheap to verify with one query per branch.
- **2026-08-05 — Fix: add the missing `JOIN c_acctschema_default d ON d.c_acctschema_id =
  s.c_acctschema_id` to `@check`'s financial-account branch**, mirroring the branch's own `@apply`
  INSERT and the warehouse branch (which was already symmetric in both `@check` and `@apply`).
  Verified: (a) a temporary revert of just this join reproduces a test failure in the new
  regression tests (proves the tests actually catch the regression, not just pass trivially); (b)
  post-fix, a direct SQL count against F&B International Group confirms exactly 7
  genuinely-fixable financial-account pairs (2 of 26 schemas have a `c_acctschema_default` row);
  (c) `--dry-run` only against F&B International Group (per QA's explicit instruction — no writes
  to that tenant, to keep its untouched state available for any further investigation of the new
  A2d gap); (d) re-ran the already-applied `acreedortest` fix — still `SKIPPED_NOT_NEEDED`, so the
  join addition caused no regression on tenants where every schema already has a default row.
- **2026-08-05 — New prerequisite gap discovered as a byproduct of the QA fix, NOT fixed, filed as
  A2d.** F&B International Group's 24 defaultless schemas are a real, previously-undocumented gap
  — any fix keyed on `c_acctschema_default` (A2, A2c, and now this one) silently cannot reach them.
  Root cause not investigated (candidates: bulk/test-data creation path that skipped the
  accounting-setup wiring; or these schemas were never meant to post at all — F&B is a QA/demo
  tenant with an unusually high schema count, 26 vs. 1-2 for every other tenant on this DB).
  **Apply generally:** when a QA/regression investigation surfaces a genuine NEW gap that is
  upstream of / a prerequisite for the ticket's own fix, the correct move is to (1) fix the ticket's
  own bug so it degrades safely (doesn't over-claim what it can deliver), (2) document the new gap
  with its own ID (here A2d) so it doesn't silently disappear, and (3) explicitly NOT try to fix it
  in the same PR unless it's trivial — scope creep here would have meant investigating why 24
  schemas on a QA tenant have no default row, a genuinely separate research task.

## c_elementvalue code structure (GOClient chart of accounts)

- **2026-06-26 — Numeric codes are strictly hierarchical and 3/4/5 digits:** `issummary='Y'` rows carry 3-digit (584 rows) and 4-digit (1140 rows) group codes; `issummary='N'` rows carry 5-digit posting codes (1312 rows). Non-numeric codes (1088 rows: section labels like `A`, `PYG`, `A.B.II.1`, `P.G.D`) also exist in both element trees and must never be padded.
- **2026-06-26 — Naive RPAD(value, 8, '0') on all numeric codes causes 1140 UNIQUE violations:** `100`, `1000`, and `10000` share the prefix `10000000` under the same `c_element_id`. The UNIQUE constraint is `C_ELEMENTVALUE_VALUE (c_element_id, value)`. **Apply:** always scope right-padding to `issummary='N'` AND `value ~ '^[0-9]+$'`. This yields 0 collisions (confirmed by query).
- **2026-06-26 — Two element trees for GOClient, both with 1790 rows each:** "Arbol de cuentas GO" (`BB9B64C5B6534A40A36F7C0F45C2CC0B`) and "GOOrg Account Tree" (`91D04C02EF8F4975B9E4F5E07543B6EA`). The 1312 posting-account count is the total across both trees (656 per tree). The UNIQUE constraint is per element, not per client — codes are safe to update in one pass scoped by `ad_client_id`.
- **2026-06-26 — ETP-4247 requires all posting account codes to be 8 digits.** Corrective: R8 data-fix (`20260626T120000Z__R8-account-codes-8digits.sql`). Preventive: the A1 onboarding step (when built) must seed 8-digit codes from the start.
- **2026-07-02 — Bug found+fixed: `c_elementvalue_trg()`'s `C_VALIDCOMBINATION` auto-creation is NOT
  reliably visible across the Java onboarding chain's multiple sequential native-query calls, even
  though it IS reliable within a single plain-SQL transaction (the corrective data-fix runner's
  execution model).** Live evidence on a REAL new tenant (client `D94AED60C3E0494AAFD44B8A05BB5CFC`,
  "acreedortest", onboarded via the normal REST flow): `OnboardingAccountingWiringService
  .ensureAcreedorPrepaymentAccount` successfully inserted the `41700000` leaf (confirmed:
  `elementlevel='S'`, `isactive='Y'`, correctly parented in `AD_TREENODE`), but its
  `C_VALIDCOMBINATION` row was NEVER created — confirmed via `SELECT * FROM c_validcombination WHERE
  account_id = <the leaf's id>` returning ZERO rows, with no client/schema filter at all. Because
  `overrideAcreedorGroupAccounts`'s `UPDATE` INNER-JOINs all 3 target accounts' combinations in one
  statement, the missing 41700000 combination zeroed out the WHOLE update — the tenant's Acreedor
  `C_BP_Group_Acct` row silently kept ALL 3 `C_AcctSchema_Default`-derived generic accounts (not just
  the unresolvable one). Verified by contrast: the SAME account/override logic, run as the sibling
  `R9-bp-category-seed.sql` corrective fix against GOClient (plain SQL, one Postgres transaction via
  the data-fix runner), worked perfectly — GOClient's Acreedor row shows all 3 correct accounts
  (41000000/41090000/41700000) after R9 applied. **Root cause is NOT the SQL logic** (identical logic
  works in one context, fails in the other) **— it is that the Java onboarding path cannot guarantee
  the DB trigger's cascade is visible to the very next `createNativeQuery(...).executeUpdate()` call**
  across `OnboardingAccountingWiringService`'s several sequential native-query calls spanning
  multiple onboarding service steps (exact mechanism not fully pinned down — candidates include
  session/connection handling around `OBContext` admin-mode switches and `applyExecutionContext`;
  not worth over-investigating further since the fix does not depend on knowing why). **Fix applied
  (commit on `feat/bp-category-preventive`):** `ensureAcreedorPrepaymentAccount` now ALSO explicitly,
  defensively `INSERT`s the `C_VALIDCOMBINATION` row itself (idempotent via `NOT EXISTS` on
  `(account_id, c_acctschema_id)` — the same key the trigger itself relies on), instead of trusting
  the trigger alone. `overrideAcreedorGroupAccounts` now also `log.warn`s on a 0-row outcome instead
  of staying silent, so a future recurrence is diagnosable without manually inspecting
  `C_BP_Group_Acct` on a live tenant. **Apply generally:** any onboarding Java code that inserts a
  business-trigger-bearing row via raw native SQL and depends on that trigger's cascading side
  effects (extra rows in OTHER tables) for a LATER native-SQL statement to join against, in a
  multi-step onboarding chain, should not assume the cascade is visible — insert the derived row
  explicitly and idempotently too. This class of bug does NOT affect the `.sql` corrective front
  (single-transaction execution model makes the trigger cascade reliable there) — `R9-bp-category-seed.sql`
  needed NO change. **Live-client retroactive fix:** ran a one-off transaction (BEGIN → verify
  BEFORE state → the same 2 statements (VALIDCOMBINATION insert + override UPDATE) → verify AFTER
  state matches `41000000`/`41090000`/`41700000` → COMMIT) directly against "acreedortest"; confirmed
  by an independent re-read after commit. Not run through the data-fixes framework (no new `.sql`
  file shipped) since this specific tenant's gap was closed directly and the framework fix (R9) was
  unaffected.
- **2026-07-01 — GOClient's real chart has NO `417%` account (PGC "Anticipos de acreedores").** Confirmed empty across every tenant checked (GOClient, F&B International Group, QA Testing, TaxesOrg) — `SELECT DISTINCT value FROM c_elementvalue WHERE value LIKE '417%'` returns 0 rows anywhere. GOClient's `41x` subgroups are only `410`/`411`/`419`. The nearby `407` "Anticipos a proveedores" is a different group (Proveedores, not Acreedores) and is not a substitute. **Apply:** any future ticket asking for a "creditor advance" / "anticipo de acreedores" account must either (a) add `41700000` to the bundled chart (an A1-adjacent change touching `C_ELEMENTVALUE.xml` + the R1/R8 chain) or (b) explicitly accept the account as unset — never fabricate a combination id. ETP-4402 (R9-bp-category-seed) hit this and shipped with 2/3 requested accounts, flagged for follow-up.

## Corrected misinterpretations (accounting FK targets)

- **2026-07-01 — `C_BP_Group_Acct`'s (and `C_AcctSchema_Default`'s) `*_acct` columns are FKs to `C_VALIDCOMBINATION`, NOT directly to `C_ElementValue`.** Wrong assumption made mid-investigation on ETP-4402: joining `c_bp_group_acct.v_liability_acct`/`notinvoicedreceipts_acct`/etc. straight against `c_elementvalue.c_elementvalue_id` always resolved to NULL for every column, on every tenant checked — this looked exactly like a systemic "every account pointer in the environment is dangling" bug, but it was purely the wrong join target. Confirmed via `pg_constraint`: e.g. `c_bp_group_acct_v_liability_ac` -> `c_validcombination(c_validcombination_id)`. **Apply:** the correct resolution path is `c_bp_group_acct.<col> -> c_validcombination.c_validcombination_id -> c_validcombination.account_id -> c_elementvalue.c_elementvalue_id`. This applies to every `*_acct` column on `C_BP_Group_Acct`, `C_BP_Customer_Acct`, `C_BP_Vendor_Acct`, `M_Product_Acct`, `M_Product_Category_Acct`, `C_Tax_Acct`, and `C_AcctSchema_Default` -- none of them point at `C_ElementValue` directly. `C_ValidCombination` has one row per (posting account x accounting schema) already provisioned by the chart-of-accounts import (658 rows for GOClient, matching its 656-per-tree posting-account count + 2 extra); a fix needing "the combination for account X" should join `c_elementvalue` (by `value`) -> `c_validcombination` (by `account_id` + `c_acctschema_id`), never assume one needs to be minted.
- **2026-07-01 — `C_BP_Group` has a standard core AD trigger, `c_bp_group_trg()` (`C_BP_Group_Trg.sql`, Compiere/Openbravo native), that auto-creates the matching `C_BP_Group_Acct` row(s) on `INSERT`.** It loops every `C_AcctSchema_Default` row applicable to the org and inserts a full `C_BP_Group_Acct` row copying all its defaults -- the exact same defaulting behavior `OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL` / R1 step 11 replicate manually (for tenants where the manual path is needed, e.g. bulk `INSERT ... SELECT` with `ad_disable_triggers()` active, or historical rows created before the trigger/table existed). **Apply:** any fix that does `INSERT INTO c_bp_group (...)` via plain SQL (triggers enabled) does NOT also need to manually `INSERT INTO c_bp_group_acct` -- the trigger already did it in the same statement/transaction. A fix that needs to override specific accounts on that row (rather than accepting the schema defaults) should `UPDATE` the trigger-created row, not attempt an `INSERT ... WHERE NOT EXISTS` (which will always find the row already present and silently no-op, not fail -- a subtle idempotency trap if you don't realize the trigger got there first).
- **2026-07-01 — `C_BP_Group` has NO `iscustomer`/`isvendor` columns.** It is a plain generic grouping/accounting-defaults table (`value`, `name`, `isdefault`), not a customer/vendor-flagged table -- those flags live on `C_BPartner`. `OnboardingDefaultCustomerService.resolveBusinessPartnerGroup` picks the default customer's group by `ORDER BY name ASC LIMIT 1` (alphabetically first), which is a landmine: adding any new `C_BP_Group` row whose name sorts before the tenant's intended default (e.g. adding "Acreedor" when the default group was previously alphabetically first) silently reassigns the seeded default customer to the wrong category. **Apply:** before adding any new default `C_BP_Group` row in a fix or the onboarding dataset, check whether its name would win alphabetically against the existing groups for every tenant shape in the fleet, and if so, guard `resolveBusinessPartnerGroup` to prefer `ISDEFAULT='Y'` first (column already exists, unused before ETP-4402) rather than relying on alphabetical luck.
- **2026-07-01 — ETP-4402 final approach: rename "Consumidor Final" -> "Cliente" IN PLACE, not add a separate row.** Initial drafts added a brand-new "Cliente" `C_BP_Group` row alongside the existing "Consumidor Final" one; the product decision (confirmed: no code anywhere hardcodes the literal string "Consumidor Final") was instead to `UPDATE` the existing row's `value`/`name` to "Cliente" and set `isdefault='Y'`, keeping the same `C_BP_GROUP_ID`. **Apply:** because only the label changes (not the PK), every Business Partner already pointing at that row's ID is automatically relabeled with no separate `C_BPartner` update needed -- 8 BPs on GOClient at the time of writing kept their FK unchanged and now show "Cliente". A fallback `INSERT ... WHERE NOT EXISTS` handles tenants that never had a "Consumidor Final" row to rename.

## Idempotency gotchas

- **2026-06-11 — Two-layer rule.** A fix's `@check` query gates whether `@apply` runs at all; the `@apply` body must ALSO be guarded (`WHERE NOT EXISTS`). Don't rely on only one layer — partial/interrupted runs leave inconsistent state otherwise.
- **2026-06-11 — Tenant isolation.** Every statement must filter `ad_client_id = :client_id`. A `@check` that forgets the client filter will give false positives/negatives across tenants.
- **2026-08-12 — NEW PATTERN: a data-fix can be a pure SYSTEM-LEVEL singleton seed (no `:client_id` filter at all) when — and only when — its preventive twin is itself a `ModuleScript` (a per-instance, not per-tenant, `update.database` hook), not a per-tenant onboarding step.** `R23-system-role-templates-fallback` (ETP-4852, fallback for `EnsureSystemRoleTemplatesScript.java`) inserts only `ad_client_id='0'` rows (4 literal `AD_Role` ids + 8 literal `AD_Role/AD_Window` `AD_Window_Access` pairs) — every row is identical regardless of which tenant triggers the run, so there is no tenant data to scope by `:client_id`; the "never touch another tenant's rows" invariant is trivially satisfied because zero tenant-owned rows are ever touched. The runner still applies it once per tenant in its normal chain sweep (no "run once globally" mode exists), which is harmless: whichever tenant is processed first performs the real INSERTs (guarded by `NOT EXISTS` on the literal ids, mirroring the Java's `ensureRole`/`ensureWindowAccess` checks byte-for-byte), and every subsequent tenant's `@check` returns 0 rows immediately (`SKIPPED_NOT_NEEDED`) — so each tenant still gets its own ledger row, while the underlying side effect converges exactly once. **No CUT bump** for this shape either: `ONBOARDING_PROVISIONED_THROUGH` gates per-tenant onboarding birth dates, and a system-level `ModuleScript` seed has no relationship to any tenant's birth date at all (bumping it would be a category error, not merely redundant like R16's case). **Apply generally:** before reflexively adding a `:client_id` filter to every statement, check what the *preventive* front actually is — if it's a `ModuleScript`/instance-level hook rather than a step in the per-tenant onboarding chain, the corrective twin should mirror that shape (system-level, unscoped) rather than forcing an artificial tenant filter onto data that has no tenant. Verified idempotent by running `@apply` twice inside one `BEGIN`/`ROLLBACK` transaction against the local dev DB (`etendogoclean`): first run inserted 4 roles + 8 window-access rows, second run inserted 0/0 with no duplicates, then rolled back — confirmed by `SELECT count(*)` before/after the `ROLLBACK`.

---

## AD tooling facts (creating the framework's own tables)

- **2026-06-11 — BASELINE MODEL (Flyway-style cutoff). Status list now has 5 values:** `APPLIED`, `SKIPPED_NOT_NEEDED`, `FAILED`, **`BASELINE`**, **`DETECTED`** (ref `B2F9A0ED913348AA8C16728D437C353D`, seqno 10–50). Premise: **every data-fix originates from an onboarding correction** → a tenant born *after* that correction does not have the gap, so the fix must not apply. We mark each tenant's cutoff with ONE baseline row (`fix_id='__baseline__'`, UNIQUE(remediated_client_id, fix_id) guarantees one per tenant):
  - **`BASELINE`** — stamped by the onboarding pipeline when a NEW tenant finishes provisioning. `applied_utc = now()`. Meaning: "born clean; only fixes newer than this apply." Onboarding (Java) only needs to insert ONE row with a timestamp — it does NOT need access to the schema_forge `.sql` catalog (that decoupling is why we use a single timestamped sentinel row, not per-fix rows).
  - **`DETECTED`** — stamped by the RUNNER's sweep (its Step 0) for any pre-existing tenant that has NO ledger row. `applied_utc = '2026-01-01'` (intentionally ancient). Meaning: "legacy tenant, never remediated; ALL known fixes are candidates."
  - **Single cutoff mechanic:** a fix applies to a tenant only if `fix.timestamp > tenant_baseline.applied_utc`. BASELINE(now) ⇒ pre-existing fixes fall below the cutoff ⇒ not applicable. DETECTED(2026-01-01) ⇒ every fix is newer ⇒ all run their `@check`. The per-fix `@check` remains the correctness backstop (a healthy tenant yields `SKIPPED_NOT_NEEDED` even if the cutoff were wrong).
  - **Runner Step 0 (sweep):** before applying anything, `INSERT` a `DETECTED` row (`applied_utc='2026-01-01'`, `remediated_client_id=<client>`) for every real tenant (`ad_client_id <> '0'`) that has zero rows in `ETGO_DATA_FIX_HISTORY`. A freshly-onboarded tenant already has its `BASELINE` row, so the sweep skips it — `BASELINE` and `DETECTED` are mutually exclusive per tenant.
  - **Reconciles with the earlier "gate on fix_id presence, not a date watermark" decision:** that rule governs *applying* fixes among existing tenants (out-of-order robustness); the baseline cutoff governs only a tenant's *birth point*. They coexist. Runner decision per (tenant, fix): (1) APPLIED row exists ⇒ skip; (2) fix predates the tenant's baseline ⇒ not applicable; (3) else run `@check` → `SKIPPED_NOT_NEEDED` or `@apply` → `APPLIED`/`FAILED`.
- **2026-06-11 — CANONICAL LEDGER ROW SHAPE (final, user-confirmed + empirically tested):** every `ETGO_DATA_FIX_HISTORY` row MUST have **`ad_client_id='0'`** (System — the only client a sys admin can see), **`ad_org_id='0'`** (`*` — meaningless for the ledger, field hidden), and **`remediated_client_id` = the fixed tenant**. The runner hardcodes `ad_client_id='0'` and `ad_org_id='0'` on every insert; only `remediated_client_id` varies (bound from `:client_id`). Tested both axes in the UI: a row with `ad_client_id≠'0'` is INVISIBLE to the sys admin even when its `remediated_client_id` is correct; `ad_org_id` does not affect visibility.
- **2026-06-11 — DESIGN RULE: the ledger's `ad_org_id` is ALWAYS `'0'` (`*`).** The ledger is System-owned (`ad_client_id='0'`); org has no meaning for it (the tenant is `remediated_client_id`, fixes are client-scoped not org-scoped). The runner must always insert `ad_org_id='0'`, and the `Organization` field is hidden from the window (it would always show `*` — pure noise).
- **2026-06-11 — EMPIRICALLY CONFIRMED: a System Administrator sees ONLY `ad_client_id='0'` rows.** Test on `ETGO_DATA_FIX_HISTORY` (accesslevel `4`): inserted two rows, one with `ad_client_id='0'` and one with `ad_client_id=<GOClient>`. In the `Data-Fix History` window the sys admin saw **only the `'0'` row** — the client-owned row was invisible. This validates the "readable clients = `{'0'}`" model and the option-A design (System-owned ledger + `remediated_client_id` for the tenant). The visible row correctly showed `Remediated Client = GOClient`, proving the sys admin can see *which* tenant was remediated while the row stays System-owned.
- **2026-06-11 — AD table access levels (authoritative, from `ad_ref_list` ref `5`):** `1`=Organization, `3`=Client/Organization, `4`=**System only**, `6`=System/Client, `7`=All. The dev-assistant skill doc is WRONG (it claims 4=Client/Org). Two independent gates decide window visibility: **(a) can the role open it** = role `userlevel` must include the table's level (a `userlevel='S'` role can open `4`/`6`/`7`, never `3`/`1`); **(b) which rows it sees** = the role's *readable clients*. A `userlevel='S'` role (System Administrator, role `'0'`) has readable clients `{'0'}` → it sees ONLY `ad_client_id='0'` rows, regardless of access level. So accesslevel `6` lets a System role *open* a table that also holds client rows, but it still does NOT let that role *see* other clients' rows.
- **2026-06-11 — `ETGO_DATA_FIX_HISTORY` created — DESIGN: System-owned ledger + dedicated tenant column (option A).** `AD_TABLE_ID = 6CAC0646DBDE44E28B3F84010F416594`, module `com.etendoerp.go` (`AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A`, prefix `ETGO`), **DataAccessLevel `4` (System only)**. Because the requirement is "ONLY the System Administrator opens it and sees EVERY tenant's history in one grid", every row is owned by System (`ad_client_id='0'`) and the remediated tenant lives in a dedicated FK column **`remediated_client_id`** (Table ref `18`→`129` AD_Client, mandatory, NOT NULL, fieldlength 32). **This SUPERSEDES the earlier note** that said `ad_client_id` = tenant / "no separate column needed" — that only holds for accesslevel `3`/`7` tables, which would have prevented the sys-admin-only single-pane view. UNIQUE constraint is now **`etgo_dfh_tenant_fix_un (remediated_client_id, fix_id)`** (old `etgo_dfh_client_fix_un (ad_client_id, fix_id)` was dropped — `ad_client_id` is always `'0'`). Other columns unchanged: `fix_id` (String 200, mandatory), `status` (List ref `B2F9A0ED913348AA8C16728D437C353D` → APPLIED / SKIPPED_NOT_NEEDED / FAILED, mandatory), `applied_utc` (DateTime), `rows_affected` (Integer), `checksum` (String 200), `detail` (Text), `description` (Text, mirrors the `.sql` `@description`). **Runner semantics:** `remediated_client_id` = the runner's `:client_id`; per-client watermark = `MAX(applied_utc) WHERE remediated_client_id = :client_id`; target-table statements still filter the *target* rows by `ad_client_id = :client_id`.
- **2026-06-11 — FK to AD_Client via webhook collides — use SQL.** `CreateColumn` with a Table ref to AD_Client auto-generates the FK constraint name `etgo_atafixhistory_dclient_fk`, which already exists for the audit `ad_client_id` FK → `constraint already exists`, whole column rolled back. **Apply:** create the second FK to AD_Client with `ALTER TABLE … ADD CONSTRAINT <distinct-name> FOREIGN KEY …` in SQL (here `etgo_dfh_remclient_fk`), then `CheckTablesColumnHook` to register the AD_COLUMN, then fix it (it lands as TableDir `19` and errors — set `ad_reference_id='18'`, `ad_reference_value_id='129'`, `ismandatory='Y'`, `fieldlength=32`) and create+link the AD_ELEMENT in the dev module. Reuse existing table-ref `129` (name "AD_Client", display=name) instead of building a new reference.
- **2026-06-11 — `CheckTablesColumnHook` needs `ModuleID`** (the skill doc shows only `TableID`) — without it returns `Missing parameter: "ModuleID"`.
- **2026-06-11 — `Data-Fix History` window created** `AD_WINDOW_ID = 5F0F3B5D0C374C62A4EC4E3DDBFA7DB9`, tab `5FB435324A1C49A287A08882BBD45F18` over `etgo_data_fix_history`. **Restricted to System Administrator only:** `RegisterWindow` auto-grants `AD_WINDOW_ACCESS` to all 16 `ismanual='N'` roles; 15 are `CO`/`O` level (inert against a System-only table) — deleted them, kept only role `'0'`. Only ONE role in this env has `userlevel` containing `S` (System Administrator), so accesslevel `4` already enforces sys-admin-only by itself; the grant cleanup just makes the metadata explicit. **`RegisterTab` `IsReadOnly:"true"` param does NOT apply** — set `ad_tab.isreadonly='Y'` via SQL afterward. The ledger tab is read-only (written by the runner, never by hand).
- **2026-06-11 — `com.etendoerp.go` module is the real ETGO owner.** `.etendo/context.json` originally said `com.etendoerp.etendogo` (did not resolve) — **fixed 2026-06-11** to `com.etendoerp.go` / `modules/com.etendoerp.go`. If a javapackage ever fails to resolve, fall back to DB prefix: `SELECT m.ad_module_id, m.javapackage FROM ad_module_dbprefix p JOIN ad_module m ON m.ad_module_id=p.ad_module_id WHERE p.name='ETGO';`. Local env: Docker DB `etendo-db-1`, sid `etendo34`, user `tad`; Etendo root `/Users/futit/Workspace/etendo_develop`.
- **2026-06-11 — `SyncTerms` webhook fails globally** here with `null value in column "name" of relation "ad_menu"` — a pre-existing AD-wide issue, not caused by the new table (rolls back; no leftover null-name menu). Consequence: it does NOT create the new columns' `AD_ELEMENT` rows, so do it manually.
- **2026-06-11 — `ad_element_mod_trg` blocks element INSERT in core.** Creating an `AD_ELEMENT` raises `@20533@` ("Cannot insert/delete objects in a module not in development") if it lands in module `'0'`. **Apply:** set `ad_module_id` to the in-development owning module on the INSERT. Columns whose name matches a shared core element (`status`, `description`, `checksum`, all audit cols) auto-link to those — leave them; only create dedicated elements for the genuinely new column names (`fix_id`, `applied_utc`, `rows_affected`, `detail`, PK).
- **2026-06-11 — `CreateColumn` leaves `fieldlength=0`** for several reference types (DateTime, Integer, Text). `0` makes the field uneditable in the UI — set explicitly: DateTime→19, Integer→10, Text→2000, String→match VARCHAR. List columns: create as String (ref 10) then `UPDATE ad_column SET ad_reference_id='17', ad_reference_value_id=<ref>` (the webhook does not accept `referenceValueID`).

## Onboarding pipeline facts

> Layout & extension recipes for everything below live in `docs/etendo-ad/onboarding-and-datafixes-map.md` §1–§2.

- **2026-06-11 — Step order** (`com.etendoerp.go/.../onboarding/steps/`): `CreateClientStep → CreateClientAdminStep → CreateOrgStep → CreateOrgAdminStep → CreateRoleStep → CreateDocTypesStep → SeedReferenceDataStep → MarkOrgReadyStep`. **No accounting step exists** — A1/A2 preventive fix means adding one (per `docs/proposals/initial-organization-setup-accounting.md`).
- **2026-06-11 — `MarkOrgReadyStep`** resolves the `AD_Org_Ready` process by search key (`"AD_Org_Ready"`, never hardcoded ID), runs it via `PInstanceProcessData` + `ProcessRunner`, then defensively sets `org.ready=true`. It does NOT recompute legal-entity columns (D1 origin).
- **2026-06-11 — CRITICAL: the `OnboardingStep` chain is NOT the live onboarding path.** Wrong assumption (from the agent spec): "the onboarding pipeline runs `CreateClientStep → … → MarkOrgReadyStep` in production." Verified by grepping the whole `com.etendoerp.go` module: there is **no production orchestrator** that builds a `List<OnboardingStep>` or calls `step.execute(ctx)` — the only place doing `for (step : steps) step.execute(ctx)` is `src-test/.../onboarding/OnboardingTest.java` (a unit test that builds the list by hand). The `OnboardingStep` classes + `OnboardingContext`/`OnboardingState` are a clean, fully-unit-tested abstraction that has **not yet been wired into the live request path**. **The real live path is `EtendoGoJwtServlet.handleOnboarding`** (`src/com/etendoerp/go/rest/`), a chain of direct `*Service` calls inside `ensureOnboardingDataset(...)`: `importOnboardingDataset → generateOnboardingSequences → markOrgReady → setupFiscalData → ensureDefaultCustomer`, then `EtendoGoDalHelper.commitDalChanges("onboarding")` (line ~844) → `finalize`/`sendFinalResult`. Each service mirrors a step (e.g. `OnboardingMarkOrgReadyService` ↔ `MarkOrgReadyStep`). **Apply:** "register the step LAST" has two delivery points — (a) the `OnboardingStep` named `RegisterBaselineStep` (created here, ready for when the chain is wired), and (b) the live wiring, which must be a final call inside `ensureOnboardingDataset` (after `ensureDefaultCustomer`, **before** `commitDalChanges` so the baseline commits atomically with provisioning). Do NOT fabricate an `OnboardingStep` orchestrator just to host the step.
- **2026-06-11 — BASELINE NOW WIRED LIVE via `OnboardingBaselineService` (step 6).** The live wiring decision (Option A) was applied: a new `OnboardingBaselineService.java` (`com.etendoerp.go/.../onboarding/`, `new`-instantiated field like the other `*Service`, NOT `@Inject`) holds the `registerBaseline(String clientId)` method with the same `ON CONFLICT … DO NOTHING` SQL. It is called by a `registerBaseline(writer, clientId)` helper in `EtendoGoJwtServlet`, wired as the LAST action in `ensureOnboardingDataset` (after `ensureDefaultCustomer`, before `commitDalChanges` ~844) so the BASELINE row lands in the same atomic onboarding commit. `RegisterBaselineStep.java` was later REMOVED (see the "BASELINE NOW WIRED LIVE" entry below) — it duplicated the service's SQL and was never wired; `OnboardingBaselineService` is the single source. **Shared-connection failure semantics (the key learning):** the baseline runs on the SAME DAL connection the onboarding commits via `OBDal.commitAndClose()`. In PostgreSQL a statement error aborts the whole tx, so "catch and continue" on that connection would POISON the final commit and abort an otherwise-healthy onboarding. Therefore `registerBaseline` deliberately does NOT mirror the other helpers' catch-return-false: a genuine SQL error PROPAGATES (the service rethrows as `OBException`, the helper has no try/catch) so `handleOnboarding`'s outer catch does a clean `rollbackDalChanges`. The expected `ON CONFLICT`→0-rows outcome never throws (DETECTED conserved, logged INFO). **Rule for any future "last action on the shared tx": never swallow a SQL error on the shared connection — rethrow and let the outer handler roll back.** The strictly-non-fatal alternative (separate JDBC connection) was rejected because it would break atomicity with the onboarding commit.
- **2026-06-11 — Native SQL with `ON CONFLICT … DO NOTHING` is the right insert for the baseline, not OBDal entity persistence.** A generated DAL entity exists (`src-gen/.../com/etendoerp/go/data/DataFixHistory.java`), but OBDal `save()` cannot express "insert only if absent" against the `etgo_dfh_tenant_fix_un (remediated_client_id, fix_id)` UNIQUE constraint — it would throw on conflict instead of conserving the existing (possibly DETECTED) row. The module already has the native pattern: `Connection conn = OBDal.getInstance().getConnection(); try (PreparedStatement ps = conn.prepareStatement(sql)) { … }` (see `OAuth2Servlet`). **Apply:** insert via `INSERT … VALUES (get_uuid(), …) ON CONFLICT ON CONSTRAINT etgo_dfh_tenant_fix_un DO NOTHING`; PK is DB-side `get_uuid()` (never Java-generated nor hand-typed). `executeUpdate()==0` ⇒ a baseline row already existed and was conserved (expected, not an error). `RegisterBaselineStep` reads the new tenant from `ctx.getClientId()` (inherited from `OnboardingState`, same getter `MarkOrgReadyStep` uses), and hardcodes `ad_client_id='0'`, `ad_org_id='0'`, `createdby/updatedby='0'`, `fix_id='__baseline__'`, `status='BASELINE'`, `applied_utc=now()`, `rows_affected=0`, `detail=NULL`.

## Window/Process Access Gap for Automatic Roles (ETP-4397, 2026-06-30)

- **2026-06-30 — Gap: GO automatic roles (`ad_role.ismanual='N'`) lack `ad_window_access` for module-shipped windows** (e.g. "Match Rule" window `24963D64E83B4543A7F6BD248CF944EE`, Verifactu/SII/TBAI windows). **Root cause (verified):** the two triggers that create access for non-manual roles — `AD_WINDOW_TRG` (AFTER INSERT on AD_WINDOW) and `AD_ROLE_TRG` (INSERT/UPDATE on AD_ROLE) — are both gated by `IF AD_isTriggerEnabled()='N' THEN RETURN;`. Module windows install via `update.database`, which runs with **triggers disabled**, so `AD_WINDOW_TRG` never fires for them. The base GOClient sampledata ships **no `AD_WINDOW_ACCESS.xml`** and its roles do NOT go through onboarding (`CreateRoleStep`). Net: clean install grants nothing.
- **2026-06-30 — `AD_ROLE_TRG` is DESTRUCTIVE** — for non-manual roles it DELETEs then rebuilds all window/process/form access by UserLevel. **Rule: a remediation must NEVER touch an `AD_ROLE` row (no UPDATE/INSERT) nor `AD_WINDOW`** — doing so fires the trigger's destructive rebuild. INSERT-only into `ad_window_access`/`ad_process_access` is the safe shape.
- **2026-06-30 — Fix delivered as a startup `ApplicationInitializer`, NOT a SQL data-fix.** `com.etendoerp.go.startup.NeoAccessStartup` (`@ApplicationScoped` + `@ComponentProvider.Qualifier`) self-heals on every Tomcat restart. Chosen over the `.sql` data-fix framework because (a) the source of truth is `SFSpec` (the live NEO spec catalog), reused exactly from `CreateRoleStep`, so Java avoids SQL↔spec divergence, and (b) it covers BOTH fronts at once: preventive for new tenants and corrective for existing ones, with no migration to schedule. This is the "Java-ambivalent" escape hatch applied at the startup level rather than via a webhook.
- **2026-06-30 — CDI discovery of `ApplicationInitializer` is by `@Any Instance<ApplicationInitializer>`** in `KernelInitializer.initialize()` (core `org.openbravo.client.kernel`), which loops `initializer.initialize()`. So **`@ApplicationScoped` + `implements ApplicationInitializer` is sufficient** for discovery in a module whose `META-INF/beans.xml` has `bean-discovery-mode="all"` (com.etendoerp.go does). No `components.xml` and no AD record needed. `@ComponentProvider.Qualifier("...")` is kept for naming consistency with the Copilot `CopilotSyncStartup` pattern but is not required for discovery here. NOTE: unlike the `NeoHandler` pattern (CLAUDE.md warns `@Named` must be the ONLY scope because a normal-scoped proxy loses the non-`@Inherited` `@Named`), `ApplicationInitializer` is discovered by TYPE not by qualifier-off-the-proxy, so `@ApplicationScoped` is fine.
- **2026-06-30 — `SessionInfo.isInitialized()` gate before borrowing a DAL connection at startup.** Confirmed `org.openbravo.database.SessionInfo.isInitialized()` exists. Borrowing a connection too early in startup hits the `ad_context_info` temp-table problem; poll it (~100ms) with a timeout (~60s) in a daemon thread, then proceed regardless. Mirror of the Copilot `CopilotSyncStartup` pattern.
- **2026-06-30 — `Role` model property constants:** `PROPERTY_ACTIVE` ("active"), `PROPERTY_MANUAL` ("manual", i.e. `ismanual`), `PROPERTY_CLIENT`, `PROPERTY_ORGANIZATION`. **Gotcha:** filtering an association id directly in OBCriteria via `Restrictions.ne(PROPERTY_CLIENT + ".id", "0")` is driver-fragile (needs an explicit join alias). Safer idiom: criteria on `active=true, manual=false` only, then exclude `role.getClient().getId().equals("0")` in Java.
- **2026-06-30 — Org assigned to granted access = org `'0'`**, matching `CreateRoleStep` exactly (it passes `OBDal.get(Organization.class, "0")` as `orgZero`, client = role's client, `WindowAccess.setEditableField(true)`; `ProcessAccess` has no editable flag). Stay consistent: same org for the self-healer so onboarded and self-healed tenants converge.
- **2026-06-30 — Module test convention (`com.etendoerp.go/src-test/`): pure Mockito, NO OBBaseTest/DB.** `@ExtendWith(MockitoExtension.class)` + `@MockitoSettings(strictness = LENIENT)`, `mockStatic(OBDal.class/OBProvider.class/OBContext.class)` in `@BeforeEach`, close them in `@AfterEach`. To make a thread-spawning `initialize()` testable, extract the synchronous body into a package-private method (here `grantMissingAccess()`) and call it directly. JUnit 5.9.2 + Mockito 5.2.0. Tests are compiled/run from the Etendo root by the user (not runnable standalone — needs core model + OBDal on the classpath).

## ETP-4245 — Accounting schema predefinition + 6 dimensions (2026-07-06)

- **2026-07-06 — The 5-vs-8 dimension gap existed because no prior pass ever touched `C_ACCTSCHEMA_ELEMENT`'s row *content*.** A1/A2/B1/B2 added the *table* to `OnboardingDatasetDefinition.INCLUDED_TABLES` and wired `OnboardingAccountingWiringService`, but nobody authored the missing `CC`/`U1`/`U2` rows in `C_ACCTSCHEMA_ELEMENT.xml` — the shipped dataset always had only `OO`, `AC`, `PJ`, `BP`, `PR` (5 of the 8 element types Etendo core supports). Verified live GOClient DB and the shipped XML matched exactly (no drift). **Apply:** when a table is already in `INCLUDED_TABLES`, still check its actual *row content* against the acceptance criteria — table inclusion and content completeness are two separate facts, and only the map/plan docs' "done" checkmarks track the former.
- **2026-07-06 — `CC`/`U1`/`U2` are valid, already-installed `ad_ref_list` values** for the `C_AcctSchema_Element.ElementType` reference (`ad_reference_value_id='181'`; full set: `AC, AS, AY, BP, CC, LF, LT, MC, OO, OT, PJ, PR, SR, U1, U2`). No new AD reference/list value needed — this is core Etendo metadata, not something GOClient invents.
- **2026-07-06 — Dataset-only provisioning applies here too (2nd confirmed instance after ETP-4341 payment methods).** Neither `OnboardingAccountingWiringService` nor any other onboarding class references specific `elementtype` values or the `C_ACCTSCHEMA.allownegative`/`iscentrallymaintained` flags (grepped the whole module — zero hits). So a pure XML dataset edit is sufficient; the `ONBOARDING_PROVISIONED_THROUGH` CUT still needs bumping (dataset-only ≠ "no CUT bump needed" — the CUT tracks "what a new tenant already has," regardless of whether a Java service or a dataset edit produced it).
- **2026-07-06 — CRITICAL: `Rn` labels and the CUT constant are shared across ALL in-flight branches, not just your own.** Found `20260701T120000Z__R9-bp-category-seed.sql` (ETP-4402, branch `feat/bp-category-preventive`) already `APPLIED` in the live `ETGO_DATA_FIX_HISTORY` ledger for GOClient — a fix invisible in both `feat/etp-4245-dimensions`'s and `main`'s `cli/src/data-fixes/sql/` directories. It only surfaced by querying the ledger directly and then running `git rev-list --all | xargs -I{} git ls-tree -r {} --name-only | grep <slug>` across the whole local repo (not just `git log <mybranch>`). Also confirmed the sibling branch had already bumped `ONBOARDING_PROVISIONED_THROUGH` to match its own `R9` timestamp. **Apply:** before naming a new `Rn` fix, (1) check the live ledger for `Rn` labels not in your checkout, (2) `git rev-list --all` for the filename across every local branch/worktree, (3) pick a timestamp after the latest found either way. Expect (and correctly resolve to the LATER timestamp) a merge conflict on the single `ONBOARDING_PROVISIONED_THROUGH` line whenever two such branches converge.
- **2026-07-06 — TC-41/TC-42 test-plan vs. live-DB discrepancy (deferred, not fixed).** Confluence Test Plan says VAT Receivable=47000/VAT Payable=47500 and Bebidas Asset=30000; live GOClient has Tax Credit(47200)/Tax Due(47700) and Bebidas Asset=35000. Root cause is NOT a provisioning gap: `c_acctschema_default.t_credit_acct`/`t_due_acct` (labels "Tax Credit"/"Tax Due" — the reclaimable/payable VAT accounts) correctly resolve to the standard Spanish PGC codes for ongoing input/output VAT (472/477); 4700/4750 are the period-END settlement accounts, a different concept. A real completed+posted invoice (TC-43, `documentno=10000016`) posts cleanly using 47700 with zero errors, proving 47700 is the live, functioning value — this reads as the test plan itself being imprecise, not the system being broken. **Apply:** before "fixing" an account-default mismatch found via test-plan cross-check, verify with a REAL posted transaction whether the current value already works correctly — a working posting outranks a test-plan number when they disagree, and re-mapping account defaults is an accounting/business decision, not a tenant-remediation SQL fix.
- **2026-07-06 — Worktree/Gradle mismatch: cannot quick-verify Java test changes made inside `modules/com.etendoerp.go/.worktrees/<branch>/`.** `./gradlew` from the Etendo root always resolves `modules/com.etendoerp.go` to the MAIN checkout, not a sibling worktree — so a test edited only in the worktree cannot be run via a root-level `./gradlew test` without first pointing Gradle at that worktree path (or merging/copying the change into the main checkout). New JUnit assertions added inside a module worktree should be documented as "not executed this session" with a clear recommended follow-up command, rather than silently assumed to pass.
- **2026-07-06 — R11 follow-up: `C_ACCTSCHEMA_DEFAULT` "Defaults tab" (TC-41) fully resolved via "Jorge's list".** All 15 Spanish-labeled Defaults-tab fields matched their `ad_column`/`ad_element` English names with high confidence (no ambiguous mappings): `DoubtfulDebt_Acct`, `Baddebtexpense_Acct`, `BadDebtRevenue_Acct`, `Allowancefordoubtful_Acct`, `P_Def_Expense_Acct`, `P_Def_Revenue_Acct` were the 6 previously-NULL columns; the other 9 (`C_Receivable_Acct`, `C_Prepayment_Acct`, `WriteOff_Acct`, `V_Liability_Acct`, `V_Prepayment_Acct`, `NotInvoicedReceipts_Acct`, `P_Asset_Acct`, `P_Expense_Acct`, `P_Revenue_Acct`) were already correct from the A1 clone pass. Fixed by `R11-acctschema-default-completion.sql` + `C_ACCTSCHEMA_DEFAULT.xml` dataset edit; CUT bumped to `2026-07-06T16:00:00Z`.
- **2026-07-06 — WRITE-OFF OVERRIDE (user-confirmed, supersedes the screenshot). SUPERSEDED 2026-07-08, see below — kept for history.** The product owner's screenshot shows Cancelaciones/Write-off = 65000000 (Spanish PGC 665, "Pérdidas por créditos comerciales incobrables"), but explicitly confirmed the DB's existing value (69400000, PGC 694, "Pérdidas por deterioro de créditos por operaciones comerciales" — the SAME account already used for `baddebtexpense_acct`) is correct and must NOT be changed. **Apply:** when a live value disagrees with a reference screenshot/test-plan, treat an explicit product-owner confirmation as decisive and record the override in both the gap doc and the SQL header comment — do not silently "correct" a DB-authoritative value to match a document.
- **2026-07-08 — WRITE-OFF OVERRIDE REVERSED (ETP-4452, R12) — a "decisive" product-owner confirmation can itself be superseded by a LATER one.** The 2026-07-06 confirmation above (69400000 is correct, do not change to 65000000) was itself explicitly reconfirmed/reversed one day later: the product owner now confirms `65000000` IS correct. **Apply:** "treat an explicit product-owner confirmation as decisive" (the rule above) does not mean immutable forever — when a NEW explicit confirmation arrives that contradicts a documented one, (1) do not silently edit the old decision's paper trail out of existence, ship a NEW dated corrective `.sql` (here `20260708T090000Z__R12-writeoff-account-override.sql`) rather than rewriting the old one's `@check`/`@apply`; (2) DO update the old fix's *comment* (non-executable, no checksum impact since checksums are still deferred) to point forward to the new fix, so a future reader isn't misled by a stale "do not fix this" instruction; (3) update every doc that asserted the old value as correct (`onboarding-gaps.md`, `onboarding-and-datafixes-map.md`, the remediation plan) rather than leaving stale claims scattered across 4 files. **Also confirmed empirically:** GOClient, acreedortest, acreetest2 and empresa (the 4 tenants provisioned from the GOClient-style 8-digit PGC chart) ALL already had a pre-existing dimensionless `C_VALIDCOMBINATION` for account 65000000 on their own schema before this fix ran — the standard `c_elementvalue_trg()` auto-creation (documented above, 2026-07-02) had already produced it when each tenant's chart was provisioned, so R12 needed a pure `UPDATE`, zero new `C_VALIDCOMBINATION` inserts anywhere. F&B International Group / QA Testing / TaxesOrg run unrelated US-chart schemas with NO 65000000 account at all — R12's `@check` (which requires a resolvable 65000000 combination to exist) naturally excludes them with zero client-allowlist logic, a reusable pattern for any fix whose applicability is scope-limited to "tenants sharing this specific chart of accounts."
- **2026-07-06 — R11 leaf-existence check (R9 precedent applied, peer-flagged review).** Before trusting R11's 6 target accounts, explicitly queried `c_elementvalue` (not just `c_validcombination`) for all 15 Jorge's-list codes on GOClient — `SELECT value, name, issummary, isactive FROM c_elementvalue WHERE ad_client_id='802509E12436405C86BA1FD5B1DF508C' AND value = ANY(ARRAY[...14 codes...])`. All 14 unique codes returned an `issummary='N'`, `isactive='Y'` row — every account already existed as a real posting-level leaf, so no R9-style `c_elementvalue` mint was needed for R11. **Apply:** whenever a fix wires an FK to an account by assumed/computed code, verify the leaf row's existence directly in `c_elementvalue` (not merely that a `c_validcombination` resolves) — R9 is the precedent for the mint-a-new-leaf path if one is ever missing.
- **2026-07-08 — A4/R13: `C_ACCTSCHEMA_TABLE.isactive` had the SAME live-DB-patched-but-dataset-not-updated drift as the write-off account, for a 12th table TC-39's checklist never covered.** GOClient's `AD_Table_id=800060` (`A_Amortization`/"FinancialMgmtAmortization") row was `isactive='Y'` live but `'N'` in the bundled `C_ACCTSCHEMA_TABLE.xml` — same class of bug as the write-off account (R12) and BP-category (R9) gaps: someone hand-fixed the live DB once and it never made it back into the dataset. A full live sweep (`SELECT ... FROM ad_client c JOIN c_acctschema s ... LEFT JOIN c_acctschema_table t ON t.ad_table_id='800060' ...`) found it inactive for 5 more clients: acreedortest, acreetest2, empresa (all `N` — same PGC-chart family as R9/R11/R12) AND QA Testing + TaxesOrg (also `N`). R13 initially used the R12 `EXISTS`-65000000-marker pattern to scope itself to the PGC-chart family only, excluding QA Testing/TaxesOrg pending a business decision.
- **2026-07-08 — A4 follow-up, same day: "unrelated chart" was a wrong assumption for TaxesOrg, and the exclusion itself was reversed within hours.** Investigating the exclusion on request revealed TaxesOrg does NOT run a US chart — it has its own genuinely PGC/Spanish-style chart ("TaxesOrg Account Tree": `551`/`5510` "Cuenta corriente...", `100`/`1000`/`10000` "Capital social"), it simply doesn't happen to use GOClient's exact `65000000` leaf code, which is why the marker guard excluded it. The reporter then made two explicit decisions the same day: activate for TaxesOrg proactively ("in case that organization creates an asset in the future"), then — after being asked to think about a full production round rather than just the local sandbox — activate for literally every tenant with no exclusions at all, since QA Testing's exclusion was functionally moot ("QA Testing is not used"). **Apply:** (1) an exclusion guard's *technical* correctness (the marker genuinely wasn't present) does not make its *narrative justification* ("unrelated US-chart schema") correct — verify the actual reason before writing it into a fix's header comment, or someone will trust a wrong fact later; (2) when a fix is initially split into per-tenant scripts to encode multiple separate exclusion decisions, and those decisions later collapse to "no exclusions," consolidate back into ONE generic script (delete the per-tenant ones) rather than leaving 3 near-identical scripts — a hardcoded client-ID scope only earns its complexity when a real, standing exclusion exists; (3) local-sandbox validation and "the actual production rollout" are different things — a fix written correctly for the ~9 tenants in a local dev DB (via hardcoded IDs or a narrow marker) may need to be re-generalized before it's fit to run against a real, unknown tenant population.

---

## ETP-4503 — Payment-method multicurrency defaults (G1 / R14, 2026-07-16)

- **2026-07-16 — "Multicurrency" is TWO independent columns, not one.** `payin_ismulticurrency` AND
  `payout_ismulticurrency` on BOTH `fin_paymentmethod` (the method template) and
  `fin_finacc_paymentmethod` (the per-account link). Both are `character(1)` with column default
  `'N'`. Java setters `setPayinIsMulticurrency(Boolean)` / `setPayoutIsMulticurrency(Boolean)`,
  getters `isPayinIsMulticurrency()` / `isPayoutIsMulticurrency()` (return `Boolean`) on both
  `FIN_PaymentMethod` and `FinAccPaymentMethod` (`src-gen`). **Apply:** any "enable multicurrency"
  fix must set/guard BOTH columns — flipping only one leaves a half-configured method.
- **2026-07-16 — `em_psd2_is_bank_transfer` DIVERGES seed-vs-live: the bundled sampledata ships it
  `'Y'` for "Transferencia bancaria", but every live payment method has it `'N'`.** Verified across
  the whole fleet (`SELECT em_psd2_is_bank_transfer, count(*) FROM fin_paymentmethod WHERE
  ad_client_id<>'0' GROUP BY 1` → 42 rows, ALL `'N'`), including GOClient's own Transferencia
  bancaria — yet `FIN_PAYMENTMETHOD.xml` carries `<EM_PSD2_IS_BANK_TRANSFER>Y</...>` for it. The
  flag was never propagated to the live rows (same class of seed↔live drift as the write-off account
  and amortization table). **Apply:** to identify the bank-transfer method reliably on existing
  tenants, use the flag WITH a name fallback — `em_psd2_is_bank_transfer='Y' OR name IN
  ('Transferencia bancaria','Transferencia')`. The Java runtime helper
  (`FinancialAccountSupport.isBankTransferMethod`) and the R14 `.sql` use the identical predicate;
  keep them in lockstep. Column accessor: `FIN_PaymentMethod.isPSD2IsBankTransfer()` (Boolean),
  setter `setPSD2IsBankTransfer(Boolean)`.
- **2026-07-16 — The multicurrency bank-connection exception is applied on the per-account LINK, never the
  template.** A Bank account (`type='B'`) with an active bank connection must have multicurrency OFF
  on ITS "Transferencia bancaria" `fin_finacc_paymentmethod` link; the `fin_paymentmethod` template
  stays `'Y'`. "Active connection" = `fin_financial_account.em_psd2_connection_status='CO'`
  (`BankIntegrationConstants.FA_CONNECTION_STATUS_CONNECTED`) OR an active row in
  `psd2_finacc_connection (connection_status='AC' AND isactive='Y')` — two independent signals, OR
  them. Live sweep found exactly ONE such account fleet-wide (GOClient "Societe Generale Luxembourg
  Corporate", both signals true), and its transfer link was already `N/N`. Non-transfer links on the
  same bank-connected account (Cheque, Tarjeta) are NOT excepted — they go to `Y/Y`.
- **2026-07-16 — Runtime placement: put the exception in the shared `linkAccount(...)` choke point,
  not in each handler.** `FinancialAccountBankConnectionHandler.handleCreateAndLink` and `handleLink` both
  call the private `linkAccount(...)` helper (which is where `linkAccountToFinancialAccount` persists
  `em_psd2_connection_status='CO'` and where `disableAutomaticWithdrawnForTransferMethod` already
  lives). Adding `FinancialAccountSupport.disableMulticurrencyForBankTransfer(finAcc)` there covers
  BOTH connect paths in one line (DRY) — deviation from the plan's "add it in both handlers" that is
  strictly better. `handleReconnect`/`handleDisconnect` do NOT call `linkAccount`, so they are
  correctly untouched. The helper self-gates on `type='B'`, so the call is unconditional/safe.
- **2026-07-16 — Dataset-only preventive + no CUT bump (3rd instance of the ETP-4341 pattern).** The
  static front is a pure `FIN_PAYMENTMETHOD.xml` / `FIN_FINACC_PAYMENTMETHOD.xml` edit (both already
  whitelisted in `OnboardingDatasetDefinition`), plus the inert `SeedReferenceDataStep` aligned for
  drift. `ONBOARDING_PROVISIONED_THROUGH` was deliberately NOT bumped: the sampledata makes new
  tenants born correct, and R14 only repairs legacy tenants — so the watermark stays put and R14
  keeps applying to pre-existing tenants (new tenants hit `@check → SKIPPED_NOT_NEEDED` anyway). This
  differs from ETP-4245 (A3), where a dataset-only change still bumped the CUT — there the CUT
  tracked "what a new tenant already has." Here the corrective is intentionally allowed to overlap
  new tenants harmlessly rather than be watermark-skipped, so no bump is needed. (If the team later
  wants the baseline to reflect T, bump to `2026-07-16T12:00:00Z` — only AFTER R14 is in the repo.)
- **2026-07-16 — New gap-label series `G`.** Payment-method config defaults don't fit the A–F
  provisioning-gap taxonomy (A=accounting, B=org tree, C=period, D=legal entity, E=session,
  F=default customer/org info). Used `@gap: G1` for R14 and noted it in the map §4. Future
  payment-config gaps continue the `G` series.
- **2026-08-21 — `Automatic Withdrawn` on the bank-transfer method is an invariant, not a
  connection-state consequence (ETP-4891, `@gap: G4`, R24).** Etendo GO pays transfers over PIS: the
  `FIN_Finacc_Transaction` is created by the Salt Edge callback once the bank reports execution, so
  auto-withdrawing on processing duplicates the movement AND destroys `PPM`'s meaning of "confirmed
  but not withdrawn" (what the payment windows render as "Pago en progreso"). ETP-4406 patched this
  dynamically in `FinancialAccountBankConnectionHandler` — clear on connect, **restore to `'Y'` on a
  permanent disconnect** — which left two holes: a connected-then-disconnected account drifted back
  to `'Y'`, and an account never connected was never touched. Both call sites and the 3 private
  helpers are now deleted; the flag is off for the method, always. **Apply:** when a flag's correct
  value does not actually depend on the state being tracked, do not track it — the inverse operation
  is where the drift lives. Preventive front is dataset-only (`FIN_PAYMENTMETHOD.xml` +
  `FIN_FINACC_PAYMENTMETHOD.xml`, both already whitelisted in `OnboardingDatasetDefinition`), plus a
  runtime guard in `FinancialAccountSupport.createLink` so a legacy template still on `'Y'` cannot
  propagate it to a new link. Only Payment OUT — `automatic_deposit` is untouched, PIS initiates
  outbound transfers only. No `ONBOARDING_PROVISIONED_THROUGH` bump (same reasoning as G1/R14).
- **2026-08-21 — Live sweep behind R24: the flag predicate is now sufficient on its own.** Counting
  by the R14/R15 predicate: `fin_paymentmethod` had **45 rows in `'Y'` across 44 tenants and ZERO in
  `'N'`** (i.e. every tenant's template was wrong), `fin_finacc_paymentmethod` 61 in `'Y'` / 8 in
  `'N'` across 2 tenants (exactly the tenants that had connected an account from the SPA, i.e. the
  old connect-time clear). Separately verified that NO method is matched by the name arm alone
  (`name IN (...) AND em_psd2_is_bank_transfer <> 'Y'` → 0 rows), so R15 has normalised the flag
  fleet-wide and the name fallback in R24 is belt-and-braces for a tenant that has not had R15
  applied. **Apply:** keep the name arm anyway — it costs nothing and the four copies of this
  predicate (R14, R15, R24, `isBankTransferMethod`) must stay in lockstep. Validated on GOClient in a
  rolled-back tx: `@check` 15 rows → `@apply` 1 template + 14 links → `@check` 0.
- **2026-08-21 — A name regex is fine for OFFERING a feature and wrong for BLOCKING one.** The
  payment modal decided "is this a transfer?" with `/transfer|transferencia/i` on the method label.
  Harmless while it only added an optional PIS section; once the same predicate started blocking a
  payment (transfer + inactive PSD2 connection → cannot pay), a method called "Transferencia interna"
  would have blocked a legitimate payment. `invoicePaymentMethods` now emits `isBankTransfer` from
  `EM_PSD2_Is_Bank_Transfer` and the regex survives only as a fallback for older backends. **Apply:**
  when tightening a heuristic-gated feature into a hard gate, re-derive the gate from real data first
  — the failure mode inverts from "missing nicety" to "blocked user".

---

## Imported Bank Statement "Estado" stuck at Borrador after PSD2 sync — R25 (L1)

- **2026-08-24 — `EM_ETGO_STATUS` only ever got recomputed by CODE WE CONTROL, never by a header-level
  observer.** `BankStatementAggregates.apply()` derives the SPA's "Estado" column from `(Processed,
  lineCount, matchedCount)`, but until today it was only ever CALLED from `BankStatementsHandler`'s
  own create/process/reactivate flows and from `BankStatementLineAggregateHandler` (fires on LINE
  changes). A statement imported through the PSD2 bank-connection sync
  (`SaltEdgeAccountLinkHelper#fetchAccountTransactions`, external `com.etendoerp.psd2` module) never
  touches either: its LINES still get counted correctly (the per-line observer fires for each insert,
  since the external sync's bulk insert isn't wrapped in our `suppress()`), but at that instant
  `Processed` is still `'N'`, so the status the line events compute — correctly, for that moment — is
  `DRAFT`. The sync then flips `Processed` to `'Y'` directly on the header, and nothing re-derives the
  status afterward, since no LINE event fires for a header-only column change. **Apply:** when adding
  an aggregate/derived column, audit every code path that can flip the fields it depends on — not just
  the ones inside your own module's handlers. An external module writing directly to a shared entity
  is exactly the blind spot a per-field-change (not per-write-flow) observer exists to catch.
- **2026-08-24 — User-visible symptom chain, confirmed live.** GO's list showed "Borrador" for a
  statement whose Core `Processed` flag was actually `'Y'` (confirmed in Classic and via direct DB
  read). Clicking "Procesar" in GO then failed with a 400: `"Only draft (unprocessed) statements can be
  modified"` — the backend guard (`BankStatementsHandler.requireDraft`) is CORRECT (it reads the real
  flag, already true) but reads as a contradiction to a user trusting the "Borrador" label. **Apply:**
  a stale display column doesn't just mislead — it can make a correct backend rejection look like a
  bug, generating a support round-trip for something that was never broken server-side.
- **2026-08-24 — Fix is a NEW `FIN_BankStatement` NEW/UPDATE observer, not a change to the existing
  line observer.** `BankStatementHeaderStatusHandler` mirrors
  `BankStatementLinePendingAmountHandler`'s technique exactly: write the derived value onto the
  in-flight event state via `event.setCurrentState(...)`, never call `recompute()`+`save()` on the same
  entity being observed (that WOULD re-trigger the same `EntityUpdateEvent`, since — unlike the line
  observer, which saves a DIFFERENT entity, the parent statement — this one's target IS the statement
  being saved). Safe to run unconditionally, no `suppress()` gate needed: it only reads the header's own
  already-correct `EM_ETGO_LINE_COUNT`/`EM_ETGO_MATCHED_COUNT` (no query), so it's cheap and idempotent
  even when it fires redundantly during our own `recompute()`-triggered saves.
- **2026-08-24 — Live sweep found 5 stuck statements, all on GOClient, all `PENDING` (0 matched
  lines).** `R25-bankstatement-stale-status` repairs them: one guarded `UPDATE`, `IS DISTINCT FROM`
  against the same derivation formula so a re-run is a no-op. Deliberately does NOT join
  `fin_bankstatementline` — the header's own stored counters were never wrong, only `EM_ETGO_STATUS`
  itself was stale. New gap-label series `L` (runtime aggregate-consistency drift) — not a
  provisioning gap, so it doesn't fit A–K; noted in the map §L1.

---

## Org type / period-control gate (ad_org_trg) — R3 in-place amendment (C1-pre)

- **2026-07-14 — `@OrgTypeDoesNotAllowPeriodControl@` comes from core trigger `ad_org_trg`, gated ONLY on org-type flags (no acctschema requirement).** Verified via `pg_get_functiondef` on staging: on INSERT/UPDATE, when `new.ISPERIODCONTROLALLOWED='Y'`, it counts `ad_orgtype` rows for `new.AD_ORGTYPE_ID` where `ISBUSINESSUNIT='Y' OR (ISLEGALENTITY='Y' AND ISACCTLEGALENTITY='Y')`; if 0, it raises. So R3's final `UPDATE ad_org SET isperiodcontrolallowed='Y'` fails whenever the operative org's type does not allow period control. **Apply:** to unblock R3, the org's `ad_orgtype_id` must satisfy that flag condition — nothing else (no C_ACCTSCHEMA, no link) is checked by the trigger.
- **2026-07-14 — Standard System org types (`ad_orgtype`, `ad_client_id='0'`):** `'0'`=Organization (all flags N), `'1'`=Legal with accounting (islegalentity=Y, isacctlegalentity=Y), `'2'`=Generic (all N), `'3'`=Legal without accounting (islegalentity=Y only). Only `'1'` (and any businessunit type) passes the period-control gate. **Apply:** resolve the target type dynamically as the System row with `islegalentity='Y' AND isacctlegalentity='Y'` — do NOT hardcode `'1'`.
- **2026-07-14 — Org-type provisioning gap (20 staging tenants) — corrective folded INTO R3 as block `C1-pre`.** Symptom: ~20 tenants halt on R3 with `@OrgTypeDoesNotAllowPeriodControl@`. Root cause: each has exactly ONE operative org of type "Organization" (`'0'`) instead of "Legal with accounting" — correct topology, wrong org type. They already have `c_acctschema` + `ad_org_acctschema` link; the ONLY delta needed is `UPDATE ad_org SET ad_orgtype_id=<legal-with-accounting>`. Verified end-to-end on a still-broken tenant: `test` (`473007453A724AAA913B791564E35422`) went Organization/PC=N → Legal with accounting/PC=Y with 516 period controls and R3 APPLIED (532 rows); earlier on the hand-flipped `E9C9219410794AD49897BBEE89E173FE` the full R4→R13 chain proceeded (0 halted). **Delivery decision — in-place edit of R3, NOT a separate migration.** The promotion `UPDATE` was added as block `C1-pre` inside R3's `@apply`, immediately before the C1 period-control `UPDATE`, so promotion + fiscal block + period control commit or roll back together in R3's single transaction. It targets the same `:org_id` R3 wires, resolves the target org type dynamically (System row with `islegalentity='Y' AND isacctlegalentity='Y'` — never hardcodes `'1'`), and is **guarded to fire only when the current type does not allow period control** → idempotent no-op for the 41 healthy tenants (which never re-run R3 anyway, their watermark is past it). A separate pre-R3 migration (`R2x`, dated 2026-06-15 < R3's 2026-06-16) was prototyped first, then discarded: editing R3 in place was chosen because for every tenant that already recorded R3 APPLIED the added statement is a semantic no-op (no divergence from what was recorded), and checksum enforcement is currently deferred. The only tenants whose R3 outcome changes are those where R3 had FAILED (never truly applied) and now succeeds. **Multi-org tenants are untouched** — R3's `:org_id` is the single operative org, and all 20 affected tenants are single-org, so multi-org tenants (e.g. staging "QA Testing") are never promoted.
- **2026-07-14 — R3 `:org_id` vs `@check` mismatch (note, not fixed).** `applyFix` in `run.js` resolves `:org_id` as the OLDEST operative org (`ORDER BY created LIMIT 1`), but R3's `@check` matches ANY operative org lacking period control. For single-org tenants they coincide (all 20 failing tenants are single-org, unaffected). For multi-org tenants R3 could match `@check` on a non-oldest org yet wire only the oldest — a latent bug to address if/when multi-org period-control remediation is needed.

---

## ETP-4539 — Asset group "Genérico" consolidation (A6, 2026-07-20)

- **2026-07-20 — Real table/column names (confirmed via `information_schema`, never assumed):** the Assets window's group reference table is `a_asset_group` (`name`, `description`, `isdepreciated`, `ad_org_id` — a real operative org on every row, never `'0'`). Its accounting sub-tab is `a_asset_group_acct` (one row per `(a_asset_group_id, c_acctschema_id)`; `a_depreciation_acct` = "Amortización", `a_accumdepreciation_acct` = "Amortización acumulada", plus `a_disposal_loss`/`a_disposal_gain` — all 4 FK to `c_validcombination`, never directly to `c_elementvalue`, same indirection as every other `*_acct` column documented above). The asset table itself is `a_asset` (`a_asset_group_id` FK, plain).
- **2026-07-20 — `a_asset_group` has a STANDARD core trigger pair, mirroring `c_bp_group_trg()`/`c_elementvalue_trg()` exactly.** `a_asset_group_trg()` (AFTER INSERT/UPDATE) loops every `C_AcctSchema_Default` row applicable to the new group's org (via `AD_Org_AcctSchema` + `AD_IsOrgIncluded`) and auto-`INSERT`s a matching `A_Asset_Group_Acct` row copying that schema's depreciation/disposal account defaults. `a_asset_group_trg2()` (BEFORE DELETE) deletes the group's `A_Asset_Group_Acct` rows on group deletion. **Apply:** any fix `INSERT`ing into `a_asset_group` via plain SQL never needs a manual `INSERT INTO a_asset_group_acct` — the trigger already did it; only an `UPDATE` to override specific accounts is needed (identical convention as R9's `c_bp_group` insert).
- **2026-07-20 — `C_AcctSchema_Default.a_depreciation_acct`/`a_accumdepreciation_acct` already resolve to the correct 68200000/28200000 PGC accounts for every GOClient-style chart tenant checked.** So the trigger's default copy already lands correctly for this chart family — an explicit override `UPDATE` (R14's step 2) is defensive/belt-and-suspenders, not strictly required, but kept for robustness in case a future tenant's schema defaults ever diverge.
- **2026-07-20 — No onboarding dataset ships an "Genérico" `A_Asset_Group` at all.** Searched every `referencedata/sampledata/GOClient/*.xml` and `com.etendoerp.go`'s own resources: no `A_ASSET_GROUP.xml` exists there (only the unrelated legacy `F_B_International_Group/A_ASSET_GROUP.xml` sampledata does). The 24/30 non-System clients that already had a correctly-wired "Genérico" got it from an out-of-band/manual pass, not the live onboarding path. **Apply:** this is a genuine OPEN preventive gap (A6) — a brand-new tenant today is still born without "Genérico"; R14 (corrective) shipped alone, `ONBOARDING_PROVISIONED_THROUGH` deliberately NOT bumped since no preventive deliverable exists yet.
- **2026-07-20 — F&B International Group is excluded from R14 by the same natural-EXISTS-guard pattern as R12/R13, this time for a genuinely different reason (verified, not assumed).** It has 7 assets not on any "Genérico" group, but zero `28200000`/`68200000` leaves on any of its 4 acctschemas (a real US-style chart, not GOClient's PGC one) — R14's `@check` naturally excludes it with zero client-allowlist logic. Empresa Test / QA Testing / Test Company also lack both accounts but have zero non-Genérico assets today, so excluding them loses nothing.
- **2026-07-20 — ADVERSARIAL AUDIT of R14 (this machine, DB `etendo`@localhost:5432, sid `etendo`, user `tad`). BUG FOUND: R14's Step 1 INSERT creates an INCOMPLETE `A_Asset_Group`.** The canonical/correct "Genérico" on all 24 wired tenants (and the F&B sample XML, and Ivan Test's legacy "Generico") carries `amortizationtype='LI'`, `amortizationcalctype='PE'`, `assetschedule='MO'`, `is30daymonth='Y'`. R14's INSERT only sets `name/description/isowned/isdepreciated`, so it leaves `amortizationtype/amortizationcalctype/assetschedule` **NULL** — verified live on the row R14 actually created on "Ivan Test" (`a_asset_group` created 2026-07-20T15:59, `amtype/amcalc/sched = NULL` vs LI/PE/MO on every other tenant). Root cause: those 3 columns have NO DB-level default (only `is30daymonth` and `isdepreciated` default 'Y' at the DB level, confirmed via `information_schema.columns`); the `LI/PE/MO` values are Etendo **ONCREATEDEFAULT** app-layer defaults that a raw-SQL INSERT bypasses. Groups created through the application path (e.g. E2E tenants, `createdby`=real user) get LI/PE/MO correctly; R14's raw insert does not. **Fix:** add `amortizationtype='LI', amortizationcalctype='PE', assetschedule='MO'` (and explicitly `is30daymonth='Y'`) to Step 1's column list, matching the canonical row. **Also: R14's `@check` never detects this malformation** (it only checks group existence + account wiring), so once the bad group exists the fix reports `SKIPPED_NOT_NEEDED` and never self-heals — the malformed Ivan Test group persists. **Apply generally:** when a fix INSERTs an AD row that normally gets ONCREATEDEFAULT values via the UI/API, replicate the FULL canonical column set explicitly — never assume DB defaults cover ONCREATEDEFAULT columns; diff a live correct row's every business column before shipping.
- **2026-07-20 — R14 audit: points A/B/C verified, NOT bugs.** (A) Step 2's account resolution is CORRECT — it selects `vc.c_validcombination_id` via `c_elementvalue.value → c_validcombination.account_id`, and the FK column receives a real `c_validcombination_id` (live-verified: both GOClient and Ivan Test Genérico rows resolve to accum=28200000/dep=68200000). No FK/type bug. (B) `a_asset_group_trg()` confirmed via `pg_proc.prosrc`: on INSERT it loops `C_AcctSchema_Default` (org-scoped via `AD_Org_AcctSchema`+`AD_IsOrgIncluded`) and copies `A_DEPRECIATION_ACCT/A_ACCUMDEPRECIATION_ACCT/A_DISPOSAL_*` into a new `A_Asset_Group_Acct` row — the prior session's claim was right; Step 2's override is genuinely defensive. (C) F&B exclusion is technically real — F&B has ZERO dimensionless 282/682 combinations on its 4 acctschemas (US-style chart), so `@check` correctly SKIPs it. **BUT flag for product:** F&B is the ONLY tenant on this DB with assets that actually need consolidating (7 assets on Others/Otros/Vehicles/Vehiculos); GOClient's 6 assets are already on Genérico. So R14's real corrective value on this DB is ~zero — it consolidates nobody and just creates (possibly malformed) empty groups on tenants lacking Genérico. The "reassign every asset" premise doesn't match the live data.
- **2026-07-20 — R14 audit: `referencedata/sampledata/GOClient/A_ASSET_GROUP.xml` does NOT exist on this checkout.** The whole `referencedata/sampledata/` tree here has only `F_B_International_Group` and `QA_Testing` (no `GOClient` dir at all, verified by `fd` across the entire home dir). The KB's earlier `referencedata/sampledata/GOClient/*.xml` references were written against a different machine (`/Users/futit/...`). **Apply:** do not assert sample-data XML facts from prior-session KB notes on this checkout — verify file existence on the actual filesystem; the live DB is the reliable source of truth for canonical row shapes here.
- **2026-07-20 — A pre-existing near-duplicate legacy group can coexist with the canonical accented name.** Client "Ivan Test" already had an unaccented `A_Asset_Group` row literally named `"Generico"` (no tilde) before R14 ran — a different literal string from the requested `"Genérico"`. R14's `@check`/`@apply` match on exact name (`= 'Genérico'`), so it created a SECOND, correctly-accented row rather than renaming/reusing the legacy one — live-verified after apply (both rows now coexist on that tenant, only the new one has an accounting row wired to 282/682). **Apply:** whenever a fix's `@check` is a literal string match, a pre-existing near-miss (typo, missing accent, different casing) will NOT be treated as "already satisfies the requirement" and a second row will be created — decide explicitly whether that's acceptable or whether the fix needs a fuzzy/normalize-first match.
- **2026-07-20 — R14 Step 5 added: delete the unused legacy asset groups ("Vehiculos"/"Otros") — three FKs reference `a_asset_group`, and a name-based delete across tenants needs a reference guard.** After consolidating every asset under "Genérico", the product owner asked to remove the two legacy groups the assets used to live in. **Delete by NAME (`name IN ('Vehiculos','Otros')`), never by id** — the old `A_ASSET_GROUP.xml` the owner provided lists GOClient-specific ids (`465220689C8743CB8EED836CC98FFC55`/`C77E2F5FD65F48278A6DCE67760F08FD`) but every tenant has its own ids for the same names. **`a_asset_group` is referenced by THREE FKs (confirmed via `pg_constraint`): `a_asset` (assets), `a_asset_group_acct` (accounting, auto-deleted by BEFORE-DELETE trigger `a_asset_group_trg2` → never blocks), and — easy to miss — `m_product_category` (`m_product_category.a_asset_group_id`, a product category can point at an amortization group).** The DELETE is double-`NOT EXISTS`-guarded (no `a_asset` AND no `m_product_category` referencing the group) so it only removes truly-orphaned groups. **This guard is what keeps a name-based cross-tenant delete safe:** F&B International Group (excluded from Steps 1–4 for lacking 282/682, so its assets never moved off "Otros"/"Vehiculos") has non-empty legacy groups → guard finds them referenced → not deleted → NO FK violation, NO chain halt. **Ordering is load-bearing:** Step 5 MUST run after Step 4 (asset reassignment) inside the same transaction, or the `a_asset` FK aborts the delete. **Validated live:** GOClient applied (2 rows = Otros+Vehiculos deleted, only "Genérico" with 6 assets remains); F&B dry-run → SKIPPED (all 4 legacy groups + assets intact); GOClient re-check → SKIPPED_NOT_NEEDED (idempotent). **Apply generally:** before shipping a name-scoped DELETE of an AD reference row across the whole tenant fleet, enumerate ALL FKs pointing at that table (`pg_constraint` `confrelid`) and guard against every one that isn't trigger-cascaded — a single overlooked referencing table turns a "cleanup" into a fleet-wide transaction abort.
- **2026-07-20 — CORRECTION of the earlier "XML does not exist on this checkout" note + R14 BUG FIX SHIPPED.** The prior audit note (above) said `referencedata/sampledata/GOClient/A_ASSET_GROUP.xml` did not exist here and only `/Users/futit/...` had it. **That was wrong for the current working machine:** on `/Users/ivanrobledo/Documents/EtendoGO/modules/com.etendoerp.go/referencedata/sampledata/GOClient/`, both `A_ASSET_GROUP.xml` and `A_ASSET_GROUP_ACCT.xml` DO exist and ARE the canonical source of truth. Read `A_ASSET_GROUP.xml` directly (2026-07-20): the "Genérico" row is `NAME='Genérico'`, `ISOWNED='Y'`, `ISDEPRECIATED='N'`, `AMORTIZATIONTYPE='LI'`, `AMORTIZATIONCALCTYPE='PE'`, `ASSETSCHEDULE='MO'`, `IS30DAYMONTH='Y'` (no `DESCRIPTION` element → NULL) — exactly matching every correctly-wired live tenant. **Apply:** the module path is repo-relative (`modules/com.etendoerp.go/referencedata/sampledata/GOClient/`), not the schema_forge repo — a prior "file not found" was searching the wrong repo. **Fix delivered in R14:** (1) Step 1 INSERT now sets the full canonical column set (`amortizationtype='LI', amortizationcalctype='PE', assetschedule='MO', is30daymonth='Y'`); (2) a NEW guarded Step 2 UPDATE sanitizes any pre-existing "Genérico" whose 3 ONCREATEDEFAULT amortization columns were left NULL by the earlier buggy revision (accounting UPDATE renumbered to Step 3, asset reassignment to Step 4); (3) `@check` extended with a branch detecting the NULL-amortization malformation so a broken group is repaired on re-run instead of reporting SKIPPED. `is30daymonth` is `NOT NULL DEFAULT 'Y'` (confirmed via `information_schema`) so it is never left NULL and needs no sanitizing. **Validated live** on "Ivan Test" (`43B9B25213204AA487E00D9CC3C390A1`): the malformed accented "Genérico" (created 2026-07-20T15:59, `atype/acalc/asched = NULL`) was repaired to `LI/PE/MO` via `--fix` targeted run (1 row); re-check dry-run → `SKIPPED_NOT_NEEDED`; healthy GOClient dry-run → `SKIPPED_NOT_NEEDED` (no false positive). F&B consolidation and the "Generico"/"Genérico" duplicate remain DEFERRED business decisions (documented in the R14 header), not touched by this revision.

## ETP-4751 — SII "Causa de Exención" catalog (AEATSII_CAUSE_EXEMPTION) missing (2026-08-03)

- **2026-08-03 — Gap: the invoice SIF "Causa de Exención" selector renders empty because the client-scoped master `aeatsii_cause_exemption` has 0 rows.** Live-verified on GOClient (`802509E12436405C86BA1FD5B1DF508C`): 0 cause-exemption rows while `aeatsii_description` has 2 (Compras/Ventas). This is a provisioning gap, not a code bug — the selector is correctly wired but its source table was never seeded.
- **2026-08-03 — SOURCE OF TRUTH: the SII module (`org.openbravo.module.sii`) ships NO seed record data for `AEATSII_CAUSE_EXEMPTION` — only the empty table + config window + event handlers.** Verified: no `AD_DATASET`/`AD_DATASET_TABLE` entry for the table, no sourcedata/referencedata dump of its rows (only `src-db/database/model/tables/AEATSII_CAUSE_EXEMPTION.xml` = the DDL). The module's own test suite (`SIIVentasBlockATest`) SKIPS its E1/E3/E4/E6 test points when `findCauseExemptionByKey` returns null, proving the data is applied by hand. The Spanish localization user guide states it outright (overview.md ~line 428): these VERIFACTU/SII dropdown values "no se asignan automáticamente desde el dataset y deben configurarse manualmente en cada caso." **Apply:** for any SII/VERIFACTU master-list gap, don't hunt for a module dataset to reuse — there isn't one; the AEAT fixed catalog is the source, and onboarding/data-fix is the delivery mechanism.
- **2026-08-03 — Canonical catalog used (AEAT CausaExencion for IVA, keys E1-E6):** E1 art. 20, E2 art. 21, E3 art. 22, E4 arts. 23 & 24, E5 art. 25, E6 otra causa. (Superseded 2026-08-03: E1 was initially seeded `isdefault='Y'` — now ALL non-default, see the no-default note below.) `taxtype='IVA'` (column also accepts `'IGIC'`). Table shape (`AEATSII_CAUSE_EXEMPTION.xml`): PK is `AEATSII_CAUSE_EXEMPTION_KEY` (the id column), `KEY` VARCHAR(6) NOT NULL, `NAME` VARCHAR(150) NOT NULL, `ISDEFAULT` CHAR(1) default 'N', `TAXTYPE` VARCHAR(60) default 'IVA'. `key` is a non-reserved keyword in Postgres — works unquoted as a column name in the data-fix runner's inlined SQL (confirmed: `@check`/`@apply` parsed and ran clean).
- **2026-08-03 — Precedent confirmed: seeding SII localization master data at onboarding is an established pattern.** `referencedata/sampledata/GOClient/AEATSII_DESCRIPTION.xml` already ships (2 records, Compras/Ventas), scoped to GOClient (`802509E12436405C86BA1FD5B1DF508C`) + GOOrg operative org (`61849243BE89460EB70866880A545D50`), createdby `47EAF009B7BB42BBB663C7BA1792D958`. **Apply:** the preventive twin `AEATSII_CAUSE_EXEMPTION.xml` mirrors that file's exact shape/scoping (operative org, not `'*'`).
- **2026-08-03 — Both fronts delivered (no CUT bump needed — see below).** Preventive: `modules/com.etendoerp.go/referencedata/sampledata/GOClient/AEATSII_CAUSE_EXEMPTION.xml` (6 records, UUIDs from `make uuid`). Corrective: `cli/src/data-fixes/sql/20260803T120000Z__R17-sii-cause-exemption.sql`. `@check` fires only when the tenant is SII-configured (proxy: `EXISTS aeatsii_description` for the client) AND has 0 `aeatsii_cause_exemption` rows — so non-Spain tenants without SII setup never receive Spanish exemption causes. `@apply` inserts E1-E6, each guarded by `NOT EXISTS (ad_client_id, key)` (the natural key), org from `:org_id`, PK from `get_uuid()`. Applied live to GOClient via `--fix`: APPLIED 6 rows; re-check dry-run → SKIPPED_NOT_NEEDED (idempotent). NOTE: no `OnboardingBaselineService.ONBOARDING_PROVISIONED_THROUGH` bump was performed here — the corrective ships alone-safe (new tenants get the catalog from the sampledata, then the runner's `@check` yields SKIPPED for them). If a formal CUT bump is later wanted, set it to `20260803T120000Z` (R17's timestamp) once the sampledata is confirmed live in the onboarding path.
- **2026-08-03 — DECISION (supersedes the earlier E1-default): ALL six exemption causes are seeded non-default (`isdefault='N'`).** Corrected in all three places consistently: the sampledata XML (`AEATSII_CAUSE_EXEMPTION.xml` — E1 flipped Y→N), the data-fix SQL (`20260803T120000Z__R17-sii-cause-exemption.sql` — E1 insert value + `@description` Background note), and the dev DB (`UPDATE aeatsii_cause_exemption SET isdefault='N' WHERE ad_client_id='802509E12436405C86BA1FD5B1DF508C' AND isdefault='Y'` → 1 row; verified all 6 keys now `N`). **Rationale:** the legally correct SII exemption cause is operation-specific and must be a conscious user choice; Go ships NO cause-exemption maintenance window, so a baked-in default could not be corrected by the user and would risk silently submitting the wrong `CausaExencion` to AEAT. With no default, the invoice shows a "should indicate an exemption cause" warning that guides the user to pick the right one. **Apply:** for SII/AEAT master catalogs where the value is legally per-operation AND there is no user-facing maintenance window, seed the catalog but pick NO default — force the conscious choice.
---

## ETP-4737 — "Factura Rectificativa" doc type + sequence unification (H1, 2026-07-30)

- **2026-07-30 — `@uuid_<KEY>@` placeholder KEY forbids underscores — regex is `[0-9A-Za-z]+` only.** Wrong assumption: named the four fresh-id placeholders `@uuid_R17_AR_SEQ@` etc. (underscores for readability). `parse-fix.js`'s `UUID_TOKEN = /@uuid_([0-9A-Za-z]+)@/g` does NOT match KEYs containing `_`, so the token is left **completely unsubstituted** — the literal string `@uuid_R17_AR_SEQ@` gets inserted as the actual `ad_sequence_id` (a PRIMARY KEY). This "worked" for the FIRST tenant in the sweep (self-consistent garbage: the same literal string as both PK and the doctype's FK to it) and then **FAILED every subsequent tenant** with `duplicate key value violates unique constraint "ad_sequence_key"` (the same literal string colliding as a PK across tenants). **Apply:** always use bare alphanumeric KEYs (`R17ARSEQ`, `R17ARDT`, no underscores/hyphens) and re-dry-run isn't enough to catch this — `--dry-run` only exercises `@check`, never `@apply`/`inlineFreshUuids`. Verify a fresh multi-UUID fix on a REAL (non-dry) `--fix` targeted run and eyeball the resulting IDs (`SELECT ... WHERE ad_sequence_id LIKE '@uuid%'` would have caught it immediately) before trusting a green "N tenants processed" summary.
- **2026-07-30 — Recovering from a buggy real (non-dry) apply that already committed on a subset of tenants: delete the bad data-fix's OWN ledger rows too, not just the bad AD rows.** After the underscore bug above, tenant 1 had `APPLIED` (with garbage-PK rows) and tenants 2-4 had `FAILED` in `ETGO_DATA_FIX_HISTORY` for this `fix_id`. Fixing only the `.sql` file and re-running would have hit the no-downgrade ledger guard (an `APPLIED` row is never downgraded) and left tenant 1's garbage rows in place forever. Since this happened within the same in-flight, unshipped branch (zero risk of erasing legitimate tenant-remediation history — the "APPLIED" state itself was the bug), the correct recovery was: (1) delete the garbage AD rows (doctype + trl + sequence) by their literal placeholder-string ids, (2) reactivate anything the buggy apply's retirement UPDATE had deactivated, (3) `DELETE FROM etgo_data_fix_history WHERE fix_id = '<the fix_id>'` for ALL tenants touched, (4) re-run clean. This is a narrow exception to "never downgrade the ledger" — it only applies to a fix that never shipped and whose only ledger rows are the ones THIS session just wrote by mistake.
- **2026-07-30 — `ETSG_CHECK_RECTIF_DOC_TYPE` trigger (module `com.etendoerp.sif.general`) requires the `AD_Sequence` row to exist BEFORE the `C_DocType` INSERT, and only fires at all when the doc type's org (or client, for org `'*'`) has SII/TBAI/Verifactu enrolled (`AD_OrgInfo.em_etsg_has_{sii,tbai,vfactu}_config`).** On this dev DB only GOClient has SII config (`Y`); F&B/QA Testing/Char/Empresa E2E all have `N/N/N` so the trigger's rectificative-consistency checks are pure no-ops for them (`V_Is_Sif_Org=false` short-circuits the whole body) — but provisioning correctly (sequence-first, `em_etsg_isrectificative` matching between doctype and its `docnosequence_id` sequence) is still required everywhere since any client can enable SII later.
- **2026-07-30 — The ticket's "Credit Memo: No" field is NOT a separate DB column — it describes the `Document Category` (`docbasetype`) choice, not an independent checkbox.** `c_doctype` has no `iscreditmemo` column (verified full 41-column dump). "Document Category = AR Invoice (ARI)" + "Credit Memo: No" together just mean: pick `docbasetype='ARI'`/`'API'`, NOT `'ARC'`/`'APC'` (the credit-memo base types). `isreturn` IS a real column and stays `'N'`.
- **2026-07-30 — GL Category naming diverges per tenant — resolve with a `COALESCE` fallback, never assume the "ES "-prefixed name exists.** Only "F&B International Group" has a full parallel "ES "-prefixed `GL_Category` set (`ES AR Invoice`, `ES AP Invoice`, …) in this dev DB; GOClient/QA Testing/Char/Empresa E2E only have the plain `AR Invoice`/`AP Invoice`. A ticket spec naming "ES AR Invoice" literally will silently resolve to nothing for 4/5 clients if matched by exact name only. **Apply:** `COALESCE((SELECT ... WHERE name='ES AR Invoice' ...), (SELECT ... WHERE name='AR Invoice' ...))` per client, never a bare literal.
- **2026-07-30 — "AP Credit Memo" does not exist under that literal name anywhere in this dev DB — the real row is named "AP CreditMemo" (no space), `docbasetype='APC'`, and (unlike its AR sibling) has `docnosequence_id=NULL` — no dedicated sequence to retire.** A retirement fix targeting the exact ticket-given name would silently match 0 rows. **Apply:** match old-type retirement by a name list covering BOTH spellings (`'AP CreditMemo', 'AP Credit Memo'`), and never assume every old doc type has its own sequence — guard the sequence-deactivation `UPDATE` on `docnosequence_id IS NOT NULL`.
- **2026-07-30 — `C_DOCTYPE`/`AD_SEQUENCE` are already in `OnboardingDatasetDefinition.INCLUDED_TABLES`, so this gap's preventive front is DATASET-ONLY — no new `Onboarding*Service` needed** (same pattern as ETP-4341 payment methods / A3 / A3b). Confirmed the dataset importer (`OnboardingDatasetNormalizer.buildDatasetXml`) reads `referencedata/sampledata/GOClient/*.xml` files **sorted alphabetically by filename** (`Files.list(...).sorted(Comparator.comparing(path -> path.getFileName().toString()))`), so `AD_SEQUENCE.xml` (A) is always imported before `C_DOCTYPE.xml` (C) — satisfying `ETSG_CHECK_RECTIF_DOC_TYPE`'s "sequence must already exist" requirement for brand-new tenants too, with zero extra Java. No row-level `ISACTIVE` filtering exists in the normalizer, so shipping the 3 old doc-type/sequence rows pre-set to `ISACTIVE='N'` in the XML correctly gives new tenants the retired history without any active old type.
- **2026-07-30 — Session recovery: a computer crash mid-session had already produced 2 throwaway "dev test" doc-type/sequence rows directly on GOClient's live DB** (`description` literally said "ETP-4737 dev test", `createdby='100'`/Admin, created ~1h earlier, zero ledger rows, zero `C_Invoice`/`C_Order` references) with the WRONG `docbasetype` (`ARC`/`APC` from a first-pass reading of the ticket, before it was corrected to `ARI`/`API`). Verified zero references before deleting (`c_invoice`, `c_order`, FK scan via `information_schema` on `c_doctype`/`ad_sequence`) — safe to hard-delete since nothing downstream depended on them and they were never tracked by the data-fixes ledger.

## ETP-4706 — "Account could not be found" on Goods Receipt posting (A2b, 2026-07-29)

- **2026-07-29 — Corrected misinterpretation: the ticket's original diagnosis ("missing product-category
  account column") was WRONG.** The brief assumed `M_Product_Category_Acct`/`M_Product_Acct` needed a
  new `p_notinvoicedreceipts_acct`-style column. Verified via `information_schema.columns`: **neither
  table has ANY not-invoiced-receipts column** (`m_product_category_acct` has 23 columns, none named
  `*notinvoiced*`; same for `m_product_acct`). The real resolution path (confirmed by reading
  `org.openbravo.erpCommon.ad_forms.AcctServer#getAccount`, `ACCTTYPE_NotInvoicedReceipts = "51"`) is
  `AcctServerData.selectNotInvoicedReceiptsAcct` (`AcctServer_data.xsql`):
  `SELECT NotInvoicedReceipts_Acct FROM C_BP_Group_Acct a, C_BPartner bp WHERE a.C_BP_Group_ID =
  bp.C_BP_Group_ID AND bp.C_BPartner_ID = ? AND a.C_AcctSchema_ID = ?` — entirely BP-GROUP scoped, via
  the transaction's business partner. The error log line ("No Account Not Invoiced Receipts for
  product: X") names the product only in its message text; the actual lookup key is the BP's group,
  not the product or product category. **Apply:** when an `AcctServer` "account could not be found"
  error names a product/entity, do not assume the FK lives on that entity's own `*_acct` table — trace
  the actual `getAccount`/`AcctType` call site in the relevant `Doc*.java` class first (here
  `DocInOut.java` line ~372, `getAccount(AcctServer.ACCTTYPE_NotInvoicedReceipts, ...)` on `this`, not
  `line.getAccount(...)` on the product) before assuming which table owns the missing column.
- **2026-07-29 — Live-DB root cause: one stale pre-existing `C_BP_Group_Acct` row, not a systemic
  onboarding gap.** GOClient's "Cliente" BP group (`DBBD00C9E0B9442188FCDDA3F601DAEA`, the group ETP-4402
  renamed from "Consumidor Final") has a `C_BP_Group_Acct` row for "Esquema GO"
  (`C06B100312FA48159DB36B9A4B461019`) with `notinvoicedreceipts_acct = NULL`, while
  `C_AcctSchema_Default.notinvoicedreceipts_acct` on the same schema is populated
  (`6E9DA718417A48A290FE376448A12BF6`). Row `created = 2026-04-07 14:59:32`; the sibling
  "Proveedor"/"Acreedor" groups on the same schema already have this column set. **Root cause:**
  `OnboardingAccountingWiringService#provisionEntityPostingAccounts`'s `BP_GROUP_ACCT_SQL` (and the
  `c_bp_group_trg()` core trigger, same story) is guarded by `NOT EXISTS` at the ROW level — once a
  `(group, schema)` row exists at all, neither the trigger nor the onboarding insert ever revisits it,
  so any column that got its default populated AFTER the row's creation stays permanently NULL. This
  matches the exact class of bug already documented for `C_ACCTSCHEMA_DEFAULT` (A3b) and
  `C_ACCTSCHEMA_TABLE` (A4) drift — "someone/something backfilled a default later; pre-existing rows
  never got the memo" — just on `C_BP_Group_Acct` this time.
- **2026-07-29 — Fleet-wide sweep CONFIRMS corrective-only; no preventive fix needed.** Queried every
  `C_BP_Group_Acct` row across every tenant on this DB for `notinvoicedreceipts_acct IS NULL`: **only
  GOClient's "Cliente" row matched.** Critically, tenants onboarded via the CURRENT onboarding code the
  SAME DAY as this diagnosis (e.g. "Empresa E2E d5be89a8", onboarded 2026-07-29) already have this
  column correctly populated on every group — proving `BP_GROUP_ACCT_SQL` already sources
  `notinvoicedreceipts_acct` correctly for any row inserted fresh today. **Apply:** per the map's
  §0 "Boundary" rule, a gap confirmed to be purely existing-tenant state with a demonstrably-correct
  current onboarding path may ship corrective-only — verify this with a fleet sweep (not just the one
  repro tenant) before deciding to skip the preventive front, and state the N/A explicitly in the gap
  table rather than silently omitting it.
- **2026-07-29 — Same stale row has MANY other `*_acct` columns NULL — flagged, not fixed (scope
  discipline).** The identical "Cliente"/GOClient row also has `notinvoicedrevenue_acct`,
  `notinvoicedreceivables_acct`, `unearnedrevenue_acct`, `paydiscount_exp_acct`, `paydiscount_rev_acct`,
  `writeoff_rev_acct`, `v_liability_services_acct`, `doubtfuldebt_acct`, `baddebtexpense_acct`,
  `baddebtrevenue_acct`, `allowancefordoubtful_acct` all NULL — the same drift class, other account
  types, same row. ETP-4706 explicitly scoped itself to Not-Invoiced-Receipts only (per its own
  "don't silently expand scope" instruction). **Apply:** a future ticket should consider generalizing
  R17 into a "resync every NULL `*_acct` column on a `C_BP_Group_Acct` row against the schema default"
  fix (one UPDATE per column, or a single dynamic one) rather than shipping one column-specific R-fix
  at a time whenever the next symptom surfaces on this same row.
- **2026-07-29 — Fix:** `cli/src/data-fixes/sql/20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql`
  — single guarded `UPDATE` joining `c_bp_group_acct` → `c_bp_group` (tenant scope) →
  `c_acctschema_default` (source value), backfilling `notinvoicedreceipts_acct` only where NULL and a
  schema default exists. Verified live in a rolled-back transaction on GOClient: `BEFORE: NULL` →
  `AFTER: 6E9DA718417A48A290FE376448A12BF6`; re-check (same predicate) matches 0 rows, confirming
  idempotency. `ONBOARDING_PROVISIONED_THROUGH` intentionally NOT bumped (no preventive change).

---

## ETP-4736 — Stuck Average-Cost queue: outbound-first product with zero cost history (H3, R18, 2026-08-03)

- **2026-08-03 — `CostingBackground.getTransactionsBatch()` (core `org.openbravo.costing`) orders its whole pending-work queue by `trx.transactionProcessDate` (column `TRXPROCESSDATE`), then `trxtype.sequenceNumber`, `movementQuantity desc`, `id` — CONFIRMED via direct source read, never `MovementDate`.** The query also spans EVERY org that has an applicable validated `CostingRule` (via `AD_ISORGINCLUDED`) and EVERY eligible product (`producttype='I' AND isstocked=true`, movement type in `ad_ref_list` reference `189`) — it is one global FIFO, not per-product. **Apply:** any costing-queue diagnosis or fix must resolve "the next transaction to be costed" via `trxprocessdate`, never `movementdate` — they can and do diverge (a transaction's `MovementDate` can be set to any user-chosen date, but `TrxProcessDate` reflects when it was actually recorded/completed).
- **2026-08-03 — `CostingBackground.doExecute()` commits each transaction individually but a thrown `OBException` is only caught by the OUTER try/catch, which `rollbackAndClose()`s and RETURNS — it does NOT skip the bad transaction and continue.** So ONE uncostable transaction anywhere in the global FIFO halts EVERY transaction queued after it, for EVERY product, not just the one that failed. Empirically confirmed live (reporter's investigation): an unrelated, previously-healthy product stalled at the exact same date as the real blocker purely because it was queued later. **Apply:** a costing gap's blast radius is fleet-wide-by-date, not product-scoped — but the ROOT-CAUSE fix only needs to target the actual blocking product(s) (zero cost history + outbound-first); every downstream "victim" self-resolves once the blocker is removed and the background job runs again.
- **2026-08-03 — `AverageAlgorithm.getOutgoingTransactionCost()` throws `@NoAvgCostDefined@` exactly when `getProductCost()` finds no matching `M_Costing` row.** `getProductCost()` filters `product = X AND startingDate <= trxprocessdate AND endingDate > trxprocessdate AND costType='AVA' AND cost IS NOT NULL AND organization = <cost org>` (`AND warehouse = <trx warehouse>` only if the applicable `M_Costing_Rule.WAREHOUSE_DIMENSION='Y'`, else `warehouse IS NULL`). Zero `M_Costing` rows for a product ⇒ this always returns null ⇒ always throws for the FIRST outbound movement (there's no cost basis yet). **Apply:** the fix is to seed exactly this table/shape — an `M_Costing` row with `costType='AVA'`, dated at/before the blocking transaction's `TrxProcessDate`, `dateto` far in the future (core's own convention: `CostingUtils.getLastDate()` = `31-12-9999`) — this is the SAME mechanism the M_Costing window's "Manual" checkbox uses for a human-entered opening cost; `ISMANUAL='Y'` marks it as such.
- **2026-08-03 — `FixBackdatedTransactionsProcess` (core's own "backdated transactions" recalculation) does NOT help a NEVER-costed product.** Its query requires `trx.isCostCalculated = true` — it only rewrites transactions that ALREADY have a calculated cost, to correct for a LATER-inserted, earlier-`MovementDate` transaction slipping in among already-costed ones. It is also a manual, user-triggered action (`M_Costing_Rule` "Fix backdated transactions"), not automatic. **Apply:** do not expect this mechanism to self-heal a "zero cost history ever" gap — it solves a structurally different problem (reordering among costed transactions), and creating a new backdated-`MovementDate` document does NOT retroactively fix an earlier-`TrxProcessDate` failure (empirically proven live by the reporter: a new earlier-`MovementDate` receipt still hit the same blocking error, because its own `TrxProcessDate` — "now" — sorts AFTER the original blocker).
- **2026-08-03 — Cost org is the LEGAL ENTITY of the transaction's org, not the transaction's own org.** `CostingServer` resolves it via `OrganizationStructureProvider.getLegalEntity(transaction.getOrganization())` (walks the org tree for the nearest `AD_OrgType.IsLegalEntity='Y'` ancestor). For a *ready* org this equals the denormalized `AD_Org.AD_LEGALENTITY_ORG_ID` column (confirmed via `AD_GET_ORG_LE_BU`'s own header comment recommending exactly this column for ready orgs — the same column the D1 gap is about). **Apply:** any fix seeding/reading `M_Costing.AD_Org_ID` must resolve via `AD_LEGALENTITY_ORG_ID` (falling back to the transaction's own org if NULL, defensive against a tenant also hit by the D1 gap), never the transaction's `AD_Org_ID` directly. Verified live: every operative org checked on this DB is self-referencing (its own legal entity).
- **2026-08-03 — `M_Product` boolean columns do NOT all follow the `is<X>` Java-property naming convention.** `Product.isProduction()` (Java) maps to column `PRODUCTION` (no `IS` prefix) on `M_PRODUCT` — but the SAME concept on `M_COSTING` is named `ISPRODUCTION` (with the prefix). Two different tables, two different conventions, same business meaning. **Apply:** always verify the literal column name per table via the table's own `.xml` model or `information_schema` — never assume a boolean's column name from its Java property name or from a sibling table's convention.
- **2026-08-03 — `ad_ref_list`'s Java property `searchKey` (used by `CostingBackground`'s HQL, `trxtype.searchKey = trx.movementType`) maps to column `VALUE`, not a column literally named `SEARCHKEY`.** Confirmed via `AD_Ref_List.java`'s own `PROPERTY_SEARCHKEY` doc comment ("Property searchKey stored in column Value"). **Apply:** any SQL reproducing this HQL join must use `ad_ref_list.value = <movementtype>`, never `ad_ref_list.searchkey` (which doesn't exist as a column).
- **2026-08-03 — `M_Costing_Rule.WAREHOUSE_DIMENSION` gates whether `getProductCost()`'s lookup also filters by warehouse.** Confirmed live on this DB: every `M_Costing_Rule` row (both orgs checked) has `WAREHOUSE_DIMENSION='N'` — so a seeded manual anchor's `M_Warehouse_ID` should be NULL for this DB's tenants, but a generic fix must resolve this dynamically per tenant (via `AD_ISORGINCLUDED(cost_org, rule.ad_org_id, client)` matching `CostingBackground`'s own org-inclusion check), not assume NULL.
- **2026-08-03 — No "Standard Cost" table/column exists independent of Price Lists in this schema.** Checked for a `m_costtype`/`m_productcost`-style table per the task brief's suggestion — none exists. The only candidate, `M_ProductPrice.Cost`, is a landed/reference cost tied to a specific price-list version (not an independently maintained "standard cost"), so it was not inserted as a 3rd tier between purchase and sales price. **Apply:** the 2-tier purchase-then-sales price-list fallback (R18) is the practical ceiling for "what cost can we infer without inventing one" in this schema.
- **2026-08-03 (SUPERSEDES the above, same day) — Product decision reversed "leave tier-3 unfixed."** The original R18 shipped with tier 3 (no purchase AND no sales price) intentionally left untouched (0 rows inserted, product surfaced only in a read-only manual-review report). Same-day human decision: `@apply` must now seed EVERY blocking product unconditionally — tier 3 falls back to `cost=0` (a documented placeholder, not a real cost) instead of being skipped. **Consequence for `@check`:** the old `@check` restricted "needed" to only resolvable-price products (tier 1/2); once `@apply` fixes tier 3 too, `@check` had to drop that restriction as well (any blocking product, regardless of price resolvability, now means "needed") — otherwise `@check`/`@apply` would disagree on tier-3-only tenants (`@check` → not needed, `@apply` → would actually seed something). **Apply:** whenever a fix's fallback chain gains a new terminal tier (here: "give up" → "default to a placeholder"), always re-check `@check` for the same restriction it was mirroring — a `@check` written to match an earlier, narrower `@apply` silently goes stale the moment `@apply`'s scope widens.
- **2026-08-03 (SUPERSEDES the `cost=0` value above, LATER same day) — Tier-3 placeholder cost changed from `0` to `1`.** Product-owner correction after the above shipped: "I think there are issues with cost 0" — a literal zero placeholder reads as "free"/no-cost in reports and UI (masking that a real cost is still missing, rather than flagging it) and risks tripping downstream logic that special-cases a zero cost. The tier logic/order (purchase → sales → fallback) and the `M_Product.Description` tagging (`COST MANUALLY SEEDED FROM PURCHASE/SALES/NOTHING`) are UNCHANGED — "NOTHING" still means "neither price list resolved," just with placeholder cost `1` instead of `0` now. Only the literal fallback VALUE in the `COALESCE(r.purchase_price, r.sales_price, 0)` expression (now `..., 1)`) changed. Re-verified via the same `BEGIN...ROLLBACK` technique on the same local dev DB/tenant, forcing the same test product (`063DB3CF250E4980A63D83EF29F240CC`) to tier 3: seeded row now shows `cost=1`, `c_currency_id='100'` (currency fallback unchanged), tag unchanged. **Apply:** when a human says a placeholder/sentinel VALUE (not the mechanism around it) is problematic, the fix is usually a one-line constant swap plus updating every comment that quotes the old value — don't relitigate or expand the tier logic itself unless asked.
- **2026-08-03 — `M_Costing.C_Currency_ID`'s own column DEFAULT is `'100'`** (confirmed via `\d m_costing`) — used as the tier-3 fallback currency since the tier-3 placeholder cost (`1` as of the same-day correction below; originally `0`) still needs SOME valid `C_Currency_ID` (NOT NULL FK to `c_currency`) and there's no price-list currency to borrow from at that tier. Checked whether a tenant-specific "default currency" (`AD_ClientInfo.C_AcctSchema1_ID` → `C_AcctSchema.C_Currency_ID`) would be more correct than a hardcoded `'100'` — REJECTED: live-verified that "QA Testing" itself (the exact tenant this fix targets) has `AD_ClientInfo.C_AcctSchema1_ID IS NULL` despite having 2 valid `C_AcctSchema` rows with no `IsDefault`-style column to pick one, so that lookup is not reliably resolvable for every tenant. `'100'` is System-owned shared reference data (`c_currency.ad_client_id='0'`), not a client-owned/guessable ID — same category as this fix's existing hardcoded `ad_reference_id='189'`. **Apply:** when a "give up gracefully" fallback needs a NOT-NULL FK value and no per-tenant data reliably supplies one, prefer the column's own declared `DEFAULT` (mirrored explicitly in SQL, since a computed `SELECT`'s value list can't rely on table defaults) over a fragile per-tenant lookup that can itself be broken by an unrelated gap.
- **2026-08-03 — Coupling a per-row description/audit-trail UPDATE 1:1 to a guarded INSERT within the SAME `@apply`: do NOT use two separate statements each re-deriving the same `NOT EXISTS` guard.** First design considered: `INSERT INTO m_costing ... ; UPDATE m_product ... WHERE NOT EXISTS (SELECT 1 FROM m_costing ...)` as two statements in one transaction. This is WRONG — by the time the second (UPDATE) statement runs, the first (INSERT)'s rows are already visible to it within the same transaction, so the UPDATE's own `NOT EXISTS(m_costing)` guard now evaluates false for every product the INSERT just seeded, and the UPDATE silently tags NOTHING. **The fix:** make the INSERT a data-modifying CTE (`seeded AS (INSERT ... RETURNING m_product_id)`) and have the top-level UPDATE key off `EXISTS (SELECT 1 FROM seeded ...)` instead of re-deriving the guard — Postgres evaluates all CTEs (data-modifying or not) against the SAME pre-statement snapshot, and the CTE's `RETURNING` set is the correct, order-independent way to know "which rows did this exact execution actually insert." Verified live in a rolled-back transaction (R18, ETP-4736): a purchase-tier, a forced sales-tier, and a forced $0-tier test product all got tagged correctly on the first run, and a same-transaction re-run of the identical SQL produced 0 new `m_costing` rows AND 0 further description changes. **Apply:** any future fix that needs to couple a second write to "the exact set of rows a guarded INSERT/UPDATE just touched, in this same execution" should reach for a data-modifying CTE + `RETURNING`, not two independently-guarded statements.
- **2026-08-03 — `run.js`'s ledger `detail` column is ALWAYS `NULL` on an `APPLIED` row** (confirmed by reading `applyFix()` — only `FAILED`/`MANUALLY_FIXED` carry free text). **Apply:** a fix that needs a per-ROW (not per-fix) audit trail (e.g. "which of N products got tier-1 vs tier-2 pricing") cannot rely on the ledger for that granularity — either encode it in a queryable column on the affected row itself (R18 uses the `M_Transaction_ID` FK back to the specific blocking transaction as a natural, reproducible join key) or ship a documented companion report query in the fix file's header comments (never appended after the `-- @apply` marker — `parse-fix.js` has no end-of-section marker, so everything after `@apply` to EOF is executed as part of `@apply`).
- **2026-08-03 — Gap-letter collision found and FIXED (documentation pass): `H1` was used for TWO unrelated gaps.** `onboarding-gaps.md` §H already defines `H1` = "Non-System-Administrator roles 404 on webhooks" (ETP-4520, superseded/dead) and `H2` = the Finance/Sales/Purchasing/Inventory roles gap (ETP-4515/4516) — but ETP-4736's own summary-table row and this KB section's own header both also mistakenly claimed `H1` for the costing/average-cost gap, and `onboarding-and-datafixes-map.md` incorrectly called it a "new gap-label series `H`" when `H` already had two entries. Same root cause as the well-documented `Rn` collisions above (2026-07-06, 2026-08-03 R17 entries): a new fix's author didn't check the FULL existing label space before picking one. **Corrected the same day:** the ETP-4736 costing gap is now `H3` across the SQL header (`@gap:` line), its regression test comment, `onboarding-gaps.md`'s summary table, and `onboarding-and-datafixes-map.md`. **Apply:** the `Rn` collision-avoidance rule ("`git rev-list --all` across every branch before naming a new `Rn`") applies equally to the `A`–`H` gap-letter/number labels — check `onboarding-gaps.md`'s summary table AND its full section headers (not just the summary table, which can itself already be stale) before claiming a gap id.
- **2026-08-03 — `git rev-list --all | xargs git ls-tree` found `R17` already used TWICE across different local worktree branches** (`R17-bp-group-acct-notinvoiced-receipts` and `R17-rectificativa-doctype-sequence`, neither on `main` nor visible from a single `git log`) — a live re-confirmation of the 2026-07-06 KB entry on this exact pitfall. Picked `R18` for this fix. `git fetch --all` timed out in this environment (2 min) rather than failing cleanly — when that happens, the local `git rev-list --all` sweep across every worktree is still the load-bearing check; don't block on a hung fetch, just proceed from the local result and note the incomplete remote coverage in the fix's header.
- **2026-08-03 — Verification method for a DB-touching data-fix when told "do not apply to any live DB": `EXPLAIN <sql>` (no `ANALYZE`) never executes/writes, INCLUDING for `INSERT` statements** — Postgres only plans it. Combined with the framework's own `--dry-run` flag (confirmed by reading `run.js`: it returns right after `@check` and never builds/runs the `@apply` SQL at all), this gives two independent, zero-write ways to validate a fix end-to-end (parses, plans, and — for `--dry-run` — produces the exact real `WOULD_APPLY`/`SKIPPED_NOT_NEEDED` verdict per tenant) against a REAL local dev DB without ever opening a write transaction. Used both here against `localhost:5416/etendogoclean` (this developer's own local sandbox, resolved by `db.js`'s default-to-`localhost` behavior — confirmed distinct from the remote "experimental" MCP-connected server) to confirm R18 correctly flags "QA Testing" (160 real stuck e2e-test products) and correctly `SKIPPED_NOT_NEEDED`s all 11 other local tenants with zero false positives, then re-queried the ledger/`m_costing` table afterward to confirm zero rows were written by either check.
- **2026-08-03 — R18's REAL (non-dry-run, human-authorized) apply confirmed end-to-end on GOClient/local dev, including the actual Etendo Post action.** Full trail: `--dry-run` showed `WOULD_APPLY` → real run gave `APPLIED (1 rows)`, ledger `status=APPLIED` → `M_Costing` row seeded exactly as designed (tier=PURCHASE, cost=23, currency=102) → `M_Product.Description` tagged. Then proved the fix actually unblocks real posting, not just the ledger: obtained a NEO bearer token (`POST /sws/neo/sws/login`, `{"username":"admin","password":"admin"}` works on this local sandbox and defaults to `user=100`/role=GOClient Admin/client=GOClient — no per-tenant credentials needed) and called the real ETP-4298 Post action (`POST /sws/neo/{spec}/{entity}/{id}/action/post`, ` DocumentPostingService`) on the actual Goods Shipment that was the R18-targeted blocker. Result: `{"success":true,"message":"Document posted"}`, with real `fact_acct` rows and `m_transaction.isprocessed` flipping `N`→`Y`. **Apply:** this is the reusable end-to-end recipe for "prove a corrective data-fix actually unblocks the real user-facing flow, not just its own `@check`" whenever the gap's symptom is a document-posting failure — `--dry-run` + real run + a real NEO `action/post` call closes the loop without needing UI automation.
- **2026-08-03 — The live webapp context on this sandbox is `etendogoclean` (matches `gradle.properties`' `bbdd.sid`), NOT `etendo`.** `scripts/neo-token-sysadmin.sh` / `neo-token-groupadmin.sh` default `BASE_URL` to `.../etendo`, which 404s here — override with `ETENDO_URL=http://localhost:8080/etendogoclean` (or hit `/sws/login` directly). Tomcat is reachable at `localhost:8080` (via OrbStack; `ps aux` shows no local `java` process, the JVM runs inside the OrbStack VM, not on the host) — check `volumes/tomcat/webapps/` for which contexts are actually deployed before assuming a login URL.
- **2026-08-03 — Posting a document (`AcctServer#post` via the ETP-4298 `DocumentPostingService`) synchronously triggers `CostingServer` for ALL of that product's pending transactions it touches, not just the one being posted — the separate `CostingBackground` scheduled process is NOT the only way to make average-cost seeding "take effect."** Observed live: posting only the Goods Shipment (R18's actual target) also cost-processed the LATER Goods Receipt transaction for the same product as a side effect (the seeded manual `M_Costing` row's `dateto` auto-narrowed to the Receipt's `TrxProcessDate`, and a new engine-computed `ismanual='N'` row appeared for it, `cumstock`/`cumcost` correctly reflecting 233-10 units at cost 23). **Apply:** when validating a costing-anchor data-fix end-to-end without access to trigger the scheduled background job, posting any ONE downstream document for the affected product is sufficient proof — no need to hunt for how to run `CostingBackground` manually.
- **2026-08-03 — GAP CROSS-REFERENCE: a Goods Receipt's OWN posting can still fail with `"Account could not be found."` even after H3/R18 is fully applied — this is a SEPARATE, already-tracked gap, not a new one and not R18's scope.** Root cause: `C_BP_Group_Acct.NotInvoicedReceipts_Acct` NULL for the receipt's business-partner group (core resolves this account purely by BP group, `AcctServer#getAccount` `ACCTTYPE_NotInvoicedReceipts`/`selectNotInvoicedReceiptsAcct` — never by product/product-category). **Already diagnosed and already fixed on a different, unmerged branch:** `.worktrees/ETP-4706/cli/src/data-fixes/sql/20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql` (gap A2b, ETP-4706) — same GOClient tenant, same BP group (`DBBD00C9E0B9442188FCDDA3F601DAEA`), same NULL column, backfilling from `C_AcctSchema_Default.NotInvoicedReceipts_Acct`. **Apply:** if a Goods Receipt post fails with a generic "Account could not be found" AFTER confirming the transaction itself is costed (`m_transaction.isprocessed='Y'`), check `C_BP_Group_Acct` for the receipt's BP group before assuming it's a costing/H3 regression — it's most likely gap A2b, and R17 (ETP-4706) is the existing remedy; don't re-diagnose or re-fix from scratch, just sequence that branch's merge.
- **2026-08-03 — KNOWN LIMITATION (review-flagged, verified against core source, NOT fixed — R18's `blocking_products` candidate query is missing core's own `costingStatus <> 'S'` filter.** Read `src/org/openbravo/costing/CostingBackground.java` (`getTransactionsBatch()`/`getTransactionsBatchCount()`, this local Etendo core checkout) directly to confirm: the real HQL candidate-selection predicate is `trx.isProcessed = false AND trx.costingStatus <> 'S' AND p.productType = 'I' AND p.stocked = true AND trxtype.reference.id = :refid AND trxtype.searchKey = trx.movementType AND trx.transactionProcessDate <= now() AND trx.organization.id in (:orgs)`. R18's `blocking_products` CTE (both `@check` and `@apply`) reproduces every other predicate (`isactive='Y'`, `isprocessed='N'`, `producttype='I'`, `isstocked='Y'`, the `ad_ref_list`/reference-189 movement-type join) but never filters `costing_status <> 'S'` (column `M_TRANSACTION.COSTING_STATUS`, default `'NC'`, VARCHAR(60), set to `'CC'` by `CostingRuleProcess`/`CostingServer` once a transaction is cost-cleared/adjusted — no `'S'`-setter found in this checkout, so its origin/meaning is not yet pinned down here). **Consequence:** a transaction sitting in `costing_status='S'` would be miscounted as "blocking" by R18's `@check`/`@apply` even though core's own background job would skip it outright — a real, structural drift from the query R18's header claims to mirror. **Unexercised on every tenant checked this session** (no transaction anywhere in the local sandbox has `costing_status='S'`), so it has not caused an observed incorrect apply — flagged as a follow-up, not blocking. **Apply:** any future revision of R18 (or a sibling costing fix) should add `AND t.costing_status <> 'S'` to `blocking_products` in both `@check` and `@apply` to fully match core's candidate-selection semantics.
- **2026-08-03 — KNOWN LIMITATION (review-flagged, verified against core source, NOT fixed) — R18's seeded `m_warehouse_id` ignores `AverageAlgorithm.getProductCost()`'s production override, independent of `M_Costing_Rule.WAREHOUSE_DIMENSION`.** Read `src/org/openbravo/costing/AverageAlgorithm.java`'s `getProductCost(...)` directly: the warehouse filter is gated by `if (costDimensions.get(CostDimension.Warehouse) != null && !product.isProduction())` — i.e. even when the applicable `M_Costing_Rule.WAREHOUSE_DIMENSION='Y'`, a lookup for a **production-flagged** product (`M_Product.Production='Y'`) ALWAYS falls to the `warehouse is null` branch, never `warehouse.id = :warehouse`. R18's `uses_warehouse_dimension` flag (feeding `CASE WHEN uses_warehouse_dimension THEN trx_warehouse_id ELSE NULL END`) is derived purely from the `M_Costing_Rule.WAREHOUSE_DIMENSION`/`ISVALIDATED` check and never consults `is_production` (a column R18 already resolves, for the SEPARATE `cost_org_id` decision) — so a production-flagged blocking product under a warehouse-dimensioned rule would get a seeded row with a non-NULL `m_warehouse_id` that `getProductCost()` would never actually match against for that product (it always searches `warehouse IS NULL` for production items), silently defeating the anchor for that one product/warehouse-rule combination. **Unexercised on every tenant checked this session** (every `M_Costing_Rule` row found had `WAREHOUSE_DIMENSION='N'`, so the interaction never triggers here). **Apply:** any future revision should extend `uses_warehouse_dimension` (or the final `m_warehouse_id` `CASE`) with `AND NOT f2.is_production`/`f.is_production='N'`, mirroring the same override `cost_org_id` already applies for production products.
## ETP-4761 — Locator inventory status defaults to Available, negative-stock guard (I1, R19, 2026-08-03)

- **2026-08-03 — `M_INVENTORYSTATUS` fixed system ids (confirmed live, `ad_client_id='0'`):**
  `0`="Undefined-OverIssue" (`OVERISSUE='Y'`, allows negative stock), `00`="Backflush"
  (`OVERISSUE='Y'`), `1`="Blocked", `11`="Scrap", `2`="Available" (`OVERISSUE='N'`), `3`="Transit",
  `33`="Inspect", `3FD24EDEA17B4E429CDEF49B6BBC59D2`="Receipts",
  `7B3DC15A20234C418D26EECDC5D59003`="Undefined" (also `OVERISSUE='N'` — the DB column's own
  default; functionally identical to Available but a different, mislabeled row — never conflate the
  two when writing a `@check`/`@apply` that means "any OverIssue-allowing status", which today is
  only `0`/`00`), `F2FA420060DB468190580397E1F510B5`="Shipping". **Apply:** a future fix that also
  needs to close the `00`/"Backflush" OverIssue gap should extend R19's predicate to
  `m_inventorystatus_id IN ('0','00')`, not assume `'0'` is the only OverIssue-allowing value.
- **2026-08-03 — Live sweep confirmed the gap on THIS shared dev DB: 45 active locators at status
  `'0'` across 11 tenants (GOClient:1, QA Testing:26, the rest 2 each).** Of those, 42 had zero
  negative-stock rows (flippable) and exactly 3 (all on QA Testing: `L03`, `Return bin`
  `3A5DE05B092A40AD9403D2A3CA5AFB3D`, `T02`) had at least one `m_storage_detail.qtyonhand < 0` row
  and must be skipped. **Apply:** always run the live sweep query before assuming a fix's blast
  radius — this confirmed the "skip 3, flip 42" split R19 was designed around, and that the
  negative-stock cases are concentrated on one non-production QA tenant, not spread evenly.
- **2026-08-03 — a single skipped locator can carry HUNDREDS of `@report` rows.** QA Testing's 3
  skipped locators together produced **445** distinct negative-stock `m_storage_detail` rows (many
  attribute-set-instance/lot combinations per product per locator) — not 3 rows, one per locator.
  **Apply:** any `@report` design must assume row counts far larger than the count of skipped
  parent entities, and its formatter needs a length cap (see `formatReportDetail`, `maxLen` default
  4000) — the header line (`"N row(s) need manual attention:"`) must be computed from the FULL row
  count BEFORE truncation, or an operator reading a truncated `detail` would undercount the problem.
- **2026-08-03 — introduced the data-fixes framework's first optional `@report` section**
  (`cli/src/data-fixes/parse-fix.js` + `run.js`, backward compatible — a fix with no `@report`
  behaves exactly as before, `detail` stays `null` on `APPLIED`). Rationale: `@check` gates whether
  `@apply` runs at ALL, but R19 needed a THIRD state — "ran, fixed what it safely could, but some
  rows were deliberately left broken and a human needs to know which ones." The runner executes
  `@report` (read-only SELECT, same `:client_id`/`:org_id` binds as `@check`/`@apply`) right AFTER a
  successful `@apply`, in the SAME transaction (so it sees post-apply state), and formats its rows
  into the ledger `detail` column via the new exported `formatReportDetail(rows, {maxLen})` helper.
  **Apply:** prefer `@check` broad enough to fire even when NOTHING is flippable (see next note)
  rather than narrowing `@check` to only the safely-fixable subset — the report is what surfaces the
  "all blocked" case, not `@check`.
- **2026-08-03 — deliberate design: `@check` fires on ANY status-0 locator, not just flippable
  ones — so a tenant where EVERY candidate is blocked by negative stock still gets `APPLIED` with
  `rows_affected=0` and a full report, never a false `SKIPPED_NOT_NEEDED`.** Trade-off accepted: this
  makes `@check`'s "needed" broader than `@apply`'s actual effect, which is unusual for this
  framework's fixes (most `@check`/`@apply` pairs target identical rows) — documented explicitly in
  the SQL header and mirrored in the corresponding JS test (`R19 data-fix — @check` describes this as
  intentional, not a bug, via `assert.doesNotMatch(normCheck, /qtyonhand/)`).
- **2026-08-03 — known, accepted limitation: a fix runs at most ONCE per tenant (the strict
  watermark), so a locator skipped for negative stock is never automatically retried once the stock
  is corrected by hand.** An operator must force it with
  `--fix R19-locator-inventory-status --client <id>` after the physical-inventory correction. This
  is inherent to the framework's one-run-per-tenant-per-fix model (documented in
  `.claude/agents/tenant-fixer.md`), not something R19 could design around.
- **2026-08-03 — `Rn`/gap-label collision hunt across ALL local branches found R14 claimed by
  THREE unrelated in-flight fixes** (`R14-conversion-rate-system`, `R14-payment-method-multicurrency`,
  `R14-asset-group-generic-consolidation`) and **R17 claimed by two**
  (`R17-bp-group-acct-notinvoiced-receipts`, `R17-rectificativa-doctype-sequence`), found via
  `git rev-list --all | xargs git ls-tree -r --name-only | grep -oE '...R[0-9]+...'` — none of these
  were visible from `git log <my-branch>` alone. R18 was claimed same-day by a sibling ETP-4736
  branch (which itself had just relabeled an H1 gap collision to H3 — a live example of the exact
  collision this hunt exists to catch). **Apply:** R19 and gap label `I1` were chosen only after this
  full-history sweep confirmed both were free; this reconfirms the KB's 2026-07-06 rule to always run
  the sweep before naming, not just check your own branch's `sql/` directory.
- **2026-08-03 — preventive fix here is a data-only change with NO Java service, confirmed via the
  same whitelist check the task brief asked to verify:** `M_WAREHOUSE`/`M_LOCATOR` are ALREADY in
  `OnboardingDatasetDefinition.INCLUDED_TABLES` (grepped `src/com/etendoerp/go/onboarding/
  OnboardingDatasetDefinition.java` directly — both present, lines 85/91), and the bundled
  `M_LOCATOR.xml` is imported verbatim by `importOnboardingDataset` (step 1 of the live chain) with
  no onboarding Java code referencing `M_INVENTORYSTATUS_ID` at all (same "dataset-only, no new
  service" pattern as A3/A3b/G1 — mirrors ETP-4341's payment-methods precedent exactly). **Apply:**
  the `ONBOARDING_PROVISIONED_THROUGH` CUT bump has NO ordering dependency on any other onboarding
  step for this gap, unlike A1/A2-style gaps that depend on `AD_Org_Ready` having already run.
- **2026-08-03 — `OnboardingDatasetNormalizerTest`'s mocked `Entity`/`Property` convention
  (`mockEntityForTable`/`mockProperty`, NOT the real Openbravo DAL model) makes property-name
  prediction mechanical: `toLowerCamel(columnName)` — split the (already-lowercased) column name on
  `_`, capitalize the first letter of every part after the first.** For `M_LOCATOR` (entity name
  `mLocator`) and its `M_INVENTORYSTATUS_ID` column, this predicts `<mInventorystatusId>` as the
  emitted child-element tag (verified against `appendPropertyElement`'s source: `isPrimitive()` is
  always `true` in this mock convention except the one hand-special-cased `C_CURRENCY_ID`, so the
  value renders as element TEXT CONTENT, never a `id="..."` attribute). **Apply:** to predict any new
  test assertion against `pathBackedNormalizer().buildDatasetXml()` output for a column not already
  covered by an existing test, apply `toLowerCamel` to both the table name (→ element tag) and the
  column name (→ child element tag) rather than guessing the real Openbravo bean property name — the
  mock convention is what the test actually exercises, and it is a fixed, mechanical transform.
- **2026-08-03 — could NOT compile/run the new `OnboardingDatasetNormalizerTest` assertion this
  session** — same worktree/Gradle limitation already recorded 2026-07-06 (`./gradlew` from the
  Etendo root always resolves `modules/com.etendoerp.go` to the MAIN checkout, never a sibling
  worktree). Documented as "not executed this session" per that note's own recommendation; the
  prediction above is the closest verification available without a build.
- **2026-08-03 — `cli/src/data-fixes/lib/sampledata-xml.js` (schema_forge repo) exists but has ZERO
  production usages** (`goClientSampledataDir`/`parseSourcedata`/`buildSourcedata`, grepped `cli/src/`
  outside `test/` — no hits). It reads the OTHER repo's bundled XML (`modules/com.etendoerp.go/
  referencedata/sampledata/GOClient/*.xml`) from an `etendoRoot` path passed in by the caller — looks
  like scaffolding for a not-yet-built "generate the corrective `.sql` from the same XML records"
  tool. **Apply:** did NOT build a new cross-repo consistency test around it for R19 (would need
  `ETENDO_ROOT`/worktree-nesting path resolution, a known footgun per the 2026-07-14 nested-worktree
  KB entry, and this helper is unused/unproven elsewhere) — the Java-side
  `OnboardingDatasetNormalizerTest` addition already covers the preventive XML's content.
- **2026-08-03 — CORRECTION: a multi-line `-- @description:` header in this framework is silently
  truncated to its FIRST physical line by the parser.** `parse-fix.js`'s header handling only matches
  lines against `-- @key: value` (`HEADER_LINE` regex); a continuation line with no `-- @key:` marker
  is treated as a "free comment in the header region" and dropped entirely — it never gets appended
  to `meta.description`. This affects EVERY existing multi-line `@description` header in the catalog
  (e.g. R15's own two-line description), not just R19's — `fix.description` for all of them is
  actually just their first line, even though the `.sql` file visually reads as a longer sentence.
  **Apply:** write a single self-contained sentence on the `@description:` line itself if the test
  suite will assert against `fix.description`; use the file's free-text background comments (asserted
  against `rawText`, not `fix.description`) for anything that needs more than one line.
## ETP-4760 — Default costing rule Standard, not Average (J1, R20, 2026-08-03)

- **2026-08-03 — CORRECTED a coordinator-supplied precomputed fact: gap letters `F1`/`F2` are NOT
  free — they were already taken (F1 = default-customer currency/location/contact, F2 = org-info
  location) across every branch checked.** The task brief asserted "`A1-A5(+b), B1-B2, C1-C2, D1,
  E1, G1, H1-H3, I1, U1-U2` are ALL taken... use gap letter `F1`, confirmed unused anywhere." Before
  writing anything, re-verified per the mandatory pre-flight instruction (`git rev-list --all` /
  cross-branch grep for gap letters in `docs/etendo-ad/onboarding-and-datafixes-map.md` across every
  local branch/worktree, `~450` branches checked): `F1` and `F2` are documented and taken on
  literally every branch that has the map file at all (including `main`, `develop`, `epic/ETP-3504`).
  Also found `H1`/`H2` (ETP-4520/ETP-4515-4516, pre-existing, not from a sibling in-flight branch)
  and `H3` (feature/ETP-4736, correctly self-corrected there from an initial `H1` mislabel) and `I1`
  (feature/ETP-4761). **No `U1`/`U2` gap letter was found anywhere** (searched every branch's
  `onboarding-gaps.md` for `### U[0-9]` / `| U[0-9]` headers — zero hits) — that part of the
  precomputed brief could not be verified and may have been a hallucination or referred to something
  outside these two docs. **Used gap letter `J1`** (next unused after I1) for this ticket instead of
  the briefed `F1`. **Apply generally:** even a confident, seemingly-already-verified precomputed
  fact handed down by the coordinator MUST be re-checked against the live repo state before use —
  the orientation checklist's "re-verify yourself right before writing" instruction exists precisely
  because branches move and prior verification passes can be wrong, not just stale.
- **2026-08-03 — Confirmed the ticket's root-cause correction is right and understates nothing:
  new tenants inherit ZERO `M_Costing_Rule` rows, not Average.** Live sweep (etendogoclean,
  `SELECT ad_client_id, count(*), string_agg(DISTINCT m_costing_algorithm_id,',') FROM
  m_costing_rule GROUP BY 1`): 9 of 12 real tenants (acreedortest, acreetest2, empresa, 4x
  "Empresa E2E *", RolesPresa, TaxesOrg) have exactly 0 rows. Cross-checked against
  `M_Transaction.iscostcalculated`: every one of the 4 zero-rule tenants that has any transaction
  rows shows 100% `'N'`. Confirms `M_COSTING_RULE` is simply absent from
  `OnboardingDatasetDefinition.INCLUDED_TABLES` (com.etendoerp.go) — the bundled
  `referencedata/sampledata/GOClient/M_COSTING_RULE.xml` file existed on disk with an Average row
  but was never actually imported by the dataset importer for any tenant, confirmed by the importer
  only normalizing tables present in `INCLUDED_TABLES`.
- **2026-08-03 — `M_Costing_Rule` has NO `name`/`seqno` column** (confirmed via `\d m_costing_rule`)
  — it is identified purely by `(ad_client_id, ad_org_id, datefrom/dateto, algorithm)`, not a label.
  Confirmed NOT NULL columns: `m_costing_algorithm_id`, `org_dimension` (default `'N'`),
  `warehouse_dimension` (default `'N'`), `isvalidated` (default `'N'`), `isactive` (default `'Y'`).
  `m_costing_rule_id` FK-referenced by `m_costing_rule_init` (per-warehouse close/open-inventory
  links, only populated when the real "Validate Costing Rule" process runs) and `m_valued_stock_agg`
  — neither needs a manual insert when seeding a bare rule cold (see next bullet).
- **2026-08-03 — A manually-`INSERT`ed `M_Costing_Rule` row with `isvalidated='Y'` and ZERO
  `M_Costing_Rule_Init` rows is a proven-safe shape, not a shortcut invented for this fix.**
  GOClient's OWN original Average rule (before this session's live test converted it to Standard)
  had exactly this shape — `isvalidated='Y'`, no init row — and had been the tenant's real, working
  costing rule for months. The `m_costing_rule_trg()` trigger only raises `@CostingRuleValidated@`
  on `UPDATE`/`DELETE` of an already-validated row (org/algorithm/datefrom/warehouse_dimension
  changes, or delete); a plain `INSERT` is completely unrestricted regardless of `isvalidated`.
  **Apply:** R20's corrective INSERT mirrors this exact proven shape — no init row needed for a
  fresh rule with no prior state to close.
- **2026-08-03 — `M_Costing_Rule` rows are per-(client, operative org), not one per client.**
  Live evidence: F&B International Group (623 active orgs) and QA Testing (3 active orgs) each have
  exactly 2 rules, one per org that actually has data — NOT one row per org in the tree, and NOT a
  single client-wide row. GOClient (1 active org) has 2 rows (its 1 org's rule, closed+reopened).
  Every genuinely-broken tenant checked (acreedortest, acreetest2, empresa, the 4 "Empresa E2E *",
  RolesPresa, TaxesOrg) has exactly 1 non-System org — the standard single-org onboarding shape.
  **Apply:** R20 resolves its target org the same way `R6-org-info-location` does (`ad_org.name <>
  '*' ORDER BY created, ad_org_id LIMIT 1`, a self-contained subquery) rather than depending on the
  runner's `:org_id` bind — this also sidesteps the "multi-org tenant, `:org_id` resolves the OLDEST
  org, not necessarily the one `@check` matched" latent bug already documented above (2026-07-14,
  R3 note) without needing to fix that bug here.
- **2026-08-03 — Live-observed the REAL "Validate Costing Rule" process's full side-effect set on
  GOClient (this was NOT staged by this session — the tenant's Average rule had already been
  converted to Standard by the time this investigation started, evidently via a prior manual UI run
  to observe the exact behavior described in the ticket brief).** Confirmed via direct DB inspection:
  (1) the old Average rule's `dateto` was set to the validation instant; (2) a new Standard rule was
  inserted with `datefrom` = the same instant, `isvalidated='Y'`, `dateto` NULL; (3) ALL 8 of
  GOClient's `M_Costing` anchor rows had `dateto` set (0 remain open — confirms the LAZY per-product
  migration: the anchors only reopen on each product's own next transaction, under the new rule);
  (4) **4 `M_Inventory` (Physical Inventory) documents were auto-created**, timestamped to the exact
  same instant as the rule swap — one closing + one opening per warehouse (GOClient has 2 warehouses)
  — each linked via a fresh `M_Costing_Rule_Init` row. This is decisive, first-hand evidence (not
  just the ticket's own secondhand description) that converting an EXISTING validated rule to a
  different algorithm is not a data-only operation — it requires real, postable AD business
  documents with sequences/doc types/lines/workflow, which a hand-SQL data-fix should not attempt to
  fabricate.
- **2026-08-03 — DECISION: SQL-first for the "zero rule" case; existing-Average-rule tenants
  (F&B International Group, QA Testing) explicitly excluded from R20, not routed to a webhook.**
  Reasoning: (1) `@type: webhook` execution is unimplemented in `cli/src/data-fixes/run.js` (throws
  `"@type webhook not implemented yet"`) — choosing it here would mean building a whole new execution
  path just for 2 known tenants, a much bigger lift than the sql_first_criterion's bar for
  escalating; (2) the "zero rule" case (9 of 12 real tenants, and the actual onboarding-birth gap
  this ticket is about) has NO prior rule to close and NO inventory to reconcile — it is safe,
  idempotent, ordinary SQL, proven by a rolled-back live test against "empresa" (insert 1 row,
  re-run inserts 0); (3) the "existing Average rule" case is small (2 tenants on this DB), is NOT the
  onboarding-birth defect the ticket is about (both were provisioned before or outside the current
  gap), and replicating the real process's Physical-Inventory-document side effects in hand SQL
  (previous bullet) would be materially riskier than the value it delivers for 2 tenants — a real
  business decision (whether/when to convert them) also belongs with an accounting admin, not an
  automated migration. **Verdict:** ship R20 SQL-only for the zero-rule case; flag F&B/QA Testing for
  a manual "Validate Costing Rule" UI run once/if the business wants them converted. If a THIRD or
  later ticket ever needs to convert MANY existing-Average-rule tenants at scale, that is the
  trigger to reconsider building `@type: webhook` execution in `run.js` — not this ticket's 2-tenant
  edge case.
- **2026-08-03 — `M_COSTING_RULE.xml` normalizes correctly with zero special-casing needed in
  `OnboardingDatasetNormalizer` once added to `INCLUDED_TABLES`.** The row's `AD_ORG_ID` (a specific
  GOClient org, not `'0'`) is remapped generically by the normalizer's existing
  `appendOrganizationReferenceIfNeeded` (any non-`'0'` source org → the new tenant's target org) —
  confirmed by reading the normalizer source, not assumed. No `M_Product_Id`/`M_Product_Category_Id`
  on the row, so no FK-portability concern either (unlike `M_COSTING`, which is per-product and was
  deliberately NOT added to `INCLUDED_TABLES` — GOClient-specific product/transaction ids would not
  port to a new tenant; fresh anchors are created lazily by the real costing engine on the new
  tenant's own first transactions).
- **2026-08-03 — Gradle test execution blocked by the permission classifier, not attempted around.**
  The documented workaround for `./gradlew test` misresolving a `com.etendoerp.go` worktree (see the
  2026-07-06 "Worktree/Gradle mismatch" note above) is copying changed files into the MAIN checkout
  and running there — done successfully for the 4 changed Java/XML files. The SECOND half of that
  workaround from the ETP-4761 precedent (temporarily moving a sibling worktree's own `tasks.gradle`
  out of the way to dodge Gradle's `.worktrees/**` duplicate-task scan bug) was attempted and
  BLOCKED by the auto-mode permission classifier (moving a file outside this session's assigned
  worktree). Did not attempt to bypass it — reverted the main checkout to clean (`git checkout --
  <4 files>`, verified `git status` empty) and left the sibling worktree's `tasks.gradle` untouched.
  **Net: `OnboardingDatasetNormalizerTest.testNormalizerIncludesValidatedStandardCostingRule` was
  NOT executed this session.** It was, however, verified by careful static trace of
  `OnboardingDatasetNormalizer`'s actual code (property-name derivation via `toLowerCamel`, the
  mocked-entity `isPrimitive()==true` shape every other test in that file relies on) against the
  exact edited XML content, matching the same verification depth used by this file's sibling `xml.
  contains(...)` assertions. **Apply:** when this workaround is blocked, do not attempt alternate
  tools to route around a classifier denial (e.g. `rm`+recreate, a different move command) — revert
  cleanly and document the untested state plus the exact follow-up command, per the existing
  "document as not executed" fallback in the 2026-07-06 note.
- **2026-08-03 — QA FINDING (MEDIUM, addressed same day) — R20's "pick any org for a whole-client
  rule" assumption was wrong for a hypothetical multi-Legal-Entity zero-rule tenant.** R20's first
  shipped revision resolved its target org exactly like `R6-org-info-location` (oldest non-`'*'` org
  for the client, `LIMIT 1`), reasoning that `org_dimension='N'` (whole-client) made the specific org
  irrelevant. Sentinel (QA) traced Etendo core's real lookup path — `CostingUtils
  .getCostDimensionRule()` and `CostingServer.getOrganization()` — and confirmed it does an **exact
  match** on `M_Costing_Rule.ad_org_id`, with **no** client-wide/`org_dimension` fallback at lookup
  time; `org_dimension` only affects how the ALGORITHM computes cost, not which rule row a
  transaction resolves to. **Consequence:** a zero-rule tenant with more than one Legal Entity org
  would get a rule anchored to only ONE of them; transactions posted under any OTHER legal entity
  would hit a hard `NoCostingRuleFoundForOrganizationAndDate`, actively WORSE than the pre-fix state
  (silent `iscostcalculated='N'`, no thrown error). **Verified no live impact:** re-queried
  `ad_org` for every one of R20's 9 originally-matched tenants — every single one has exactly ONE
  non-`'*'` org (this DB's tenants are all single-org, standard onboarding shape) — so this was a
  correct-for-today, wrong-for-the-general-case assumption, not an active bug. **Fix:** added
  `(SELECT COUNT(*) FROM ad_org o2 WHERE o2.ad_client_id = :client_id AND o2.name <> '*') = 1` to
  BOTH `@check` and `@apply` (identical subquery in both, verified structurally identical by a
  dedicated test — `checkMatch[0] === applyMatch[0]` — so the two-layer idempotency contract can't
  silently drift between them). Re-ran the dry-run across the fleet after the change: byte-identical
  outcome (9 `WOULD_APPLY`, 3 `SKIPPED_NOT_NEEDED`) — confirms the guard is a genuine no-op for every
  tenant that exists today, only changing behavior for a tenant shape that doesn't exist yet.
  Independently confirmed the guard actually excludes a real multi-org tenant: F&B International
  Group's own `COUNT(non-'*' orgs)` is 623, verified directly (not just inferred from its existing
  rule already excluding it via the OTHER guard) in the same rolled-back transaction that
  re-confirmed the single-org apply still works. **Apply generally:** "the specific value doesn't
  matter for a client/schema-wide setting" is a dangerous shortcut whenever the setting is still
  stored on a per-row FK that a downstream LOOKUP resolves by exact match — verify the actual
  read-path code (not just the write-path's own column semantics) before assuming a "doesn't matter
  which one" simplification is safe to scale beyond today's data shape. This is a variant of the
  2026-07-14 R3 note's `:org_id` latent-bug lesson (multi-org tenants can silently diverge from a
  single-org-tested fix's assumptions) — here caught by QA before any multi-org tenant existed to
  hit it, rather than after.
- **2026-08-04 — CI FAILURE (real, caught in `etendo-go-tests` #2008 Playwright onboarding smoke
  test) — `M_COSTING_RULE.DATEFROM` is `AD_Reference_ID=16` ("DateTime"), NOT `15` ("Date") like
  `C_Period.StartDate`/`EndDate`, and the two references go through COMPLETELY DIFFERENT parsers
  during XML dataset import — a space-separated timestamp that works for one throws for the
  other.** Symptom: the FIRST real onboarding run to ever import `M_COSTING_RULE.xml` (the table
  was added to `INCLUDED_TABLES` this same ticket) failed with `java.text.ParseException:
  Unparseable date: "2025-12-31 03:00:00.0"` on `DATEFROM`, cascading into `Referenced object
  CostingRule (...) not present in the xml or in the database` (the entity never got fully
  registered because parsing its property threw before the entity resolver saw a complete row).
  **Root cause, confirmed via `ad_column`:** `M_Costing_Rule.Datefrom` (and `Dateto`, `Created`,
  `Updated`) are reference `16` = "DateTime", handled by
  `org.openbravo.base.model.domaintype.DatetimeDomainType` (`src/org/openbravo/base/model/domaintype/DatetimeDomainType.java`).
  `C_Period.StartDate`/`EndDate` are reference `15` = "Date", handled by the SIBLING class
  `DateDomainType` in the same package. Both classes' primary format is the same strict pattern
  (`new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.S'Z'")`, literal `T` and literal `Z`, NOT an ISO
  timezone offset) — **but `DateDomainType.createFromString` has a second branch `DateDomainType`
  lacks: if the string does NOT contain `"T"`, it falls back to `new
  SimpleDateFormat("yyyy-MM-dd")` via `parseObject(strValue)`, which (per plain `java.text
  .DateFormat.parse(String)` semantics) only requires a successful match from position 0 — it does
  NOT require the whole string to be consumed, so the trailing `" HH:mm:ss.S"` on
  `C_Period.xml`'s `"2026-03-01 00:00:00.0"`-shaped values is silently ignored, not an error.
  `DatetimeDomainType` has ONLY the strict `T`/`Z` pattern with no such fallback**, so a
  space-separated value is unconditionally unparseable for it. Two visually-identical-looking
  sample-data date values (`"2026-03-01 00:00:00.0"` on a working `Date` column vs `"2025-12-31
  03:00:00.0"` on a broken `DateTime` column) hit entirely different code paths — the shared visual
  shape is coincidental, not evidence they're validated the same way. **Empirically verified (not
  just read) using Etendo's own ALREADY-COMPILED core class**
  (`build/classes/org/openbravo/base/model/domaintype/DatetimeDomainType.class`, loaded directly —
  not a reimplementation): `new DatetimeDomainType().createFromString("2025-12-31 03:00:00.0")`
  throws the EXACT reported `ParseException` message character-for-character;
  `createFromString("2025-12-31T03:00:00.0Z")` parses cleanly to `Wed Dec 31 03:00:00 UTC 2025`;
  and `convertToString(parsed)` round-trips back to the exact same string, confirming
  `yyyy-MM-dd'T'HH:mm:ss.S'Z'` (e.g. `2025-12-31T03:00:00.0Z`) is the canonical, self-consistent
  shape this exact class both emits and expects. **Fix:** `GOClient/M_COSTING_RULE.xml`'s
  `DATEFROM` changed from `2025-12-31 03:00:00.0` to `2025-12-31T03:00:00.0Z` (value unchanged,
  format only). **Apply generally:** before writing ANY date/timestamp CDATA value into a bundled
  onboarding sample-data XML, check the target column's `ad_reference_id` first (`15`=Date vs
  `16`=DateTime/Timestamp are NOT interchangeable at import time despite both accepting the same
  strict `T`/`Z` primary format) — do not copy a working date shape from a sibling XML file without
  confirming the two columns share the same reference type; `CREATED`/`UPDATED` on the SAME table
  are also reference `16` but are safe because `OnboardingDatasetDefinition.STRIPPED_FIELDS`
  removes them before import regardless of their XML value — `DATEFROM` had no such protection and
  was the first-ever literal reference-16 value actually imported through this onboarding path in
  this module's sample data (grepped the whole `referencedata/` tree: no other bundled XML anywhere
  in this module carries a literal `T...Z`-shaped date value — this ticket is the first to need
  one). **Caught by:** the `etendo-go-tests` Jenkins job's Playwright `onboarding-register
  .integration.spec.js` smoke test, which actually drives the real `/sws/go/onboarding` endpoint
  end-to-end — this class of format bug is invisible to the Java unit tests in this module (pure
  Mockito, no real `DataImportService`/`StaxXMLEntityConverter` call) and to the JS data-fixes
  tests (SQL-only, no XML import path at all). **Apply generally #2:** a preventive fix that adds a
  brand-new table to `OnboardingDatasetDefinition.INCLUDED_TABLES` should be smoke-tested against a
  REAL onboarding run (or at minimum have its literal date/timestamp values checked against
  `ad_reference_id`) before merging — Java unit tests and SQL-only data-fix tests structurally
  cannot catch an XML-import-time parsing bug in this codebase's current test pyramid.
- **2026-08-04 — FOLLOW-UP, MORE IMPORTANT FINDING: fixing the runtime-importer date format broke
  a SECOND, independent consumer of the SAME sample-data file — a shared XML file can have two
  importers with genuinely INCOMPATIBLE format requirements for the identical column, and no
  single literal satisfies both.** After shipping the `T`/`Z` fix above, CI's `com.etendoerp.go`
  PR (`etendo-go-tests` job) failed differently, during an `antInstall`/`import.sample.data` Ant
  step: `java.lang.IllegalArgumentException: Timestamp format must be yyyy-mm-dd hh:mm:ss
  [.fffffffff]` at `java.sql.Timestamp.valueOf` inside `org.apache.ddlutils.io.converters
  .TimestampConverter.convertFromString`, pointing at the exact same `DATEFROM` line. **Root
  cause:** `referencedata/sampledata/<Client>/*.xml` files have TWO structurally independent
  consumers in this codebase, not one: (1) `org.openbravo.ddlutils.task.ImportSampledata`
  (`src-db/database/build.xml` target `import.sample.data`, wired into `smartbuild`/
  `update.database`/`create.database` — i.e. how the CI environment's own core+module install
  seeds ALL sample data, including GOClient's, for EVERY table with a bundled XML file, completely
  independent of `com.etendoerp.go`'s own `OnboardingDatasetDefinition.INCLUDED_TABLES`
  whitelist — ddlutils has no concept of that whitelist at all and was already reading
  `M_COSTING_RULE.xml` long before this ticket); (2) the RUNTIME `com.etendoerp.go` onboarding
  importer (`OnboardingDatasetNormalizer` → `DataImportService` → `DatetimeDomainType`) that this
  ticket newly activated for this table via `INCLUDED_TABLES`. ddlutils' `TimestampConverter`
  calls `java.sql.Timestamp.valueOf()`, which is STRICT the OPPOSITE way from
  `DatetimeDomainType`: it requires exactly `yyyy-mm-dd hh:mm:ss[.f...]` and REJECTS a `T`/`Z` ISO
  shape. **Confirmed this is a genuine hard conflict, not a guess:** empirically ran both parsers
  against both candidate literals (`Timestamp.valueOf` and the real, already-compiled
  `DatetimeDomainType`/`DateDomainType` classes) — the space-separated shape satisfies ddlutils
  and fails the runtime importer; the `T`/`Z` shape satisfies the runtime importer and fails
  ddlutils (`Timestamp.valueOf("2025-12-31T03:00:00.0Z")` throws immediately). **Also confirmed
  ddlutils cares about the underlying SQL column type, not the AD_Reference_ID distinction:**
  `information_schema.columns` shows `m_costing_rule.datefrom` AND `c_period.startdate` are BOTH
  plain Postgres `timestamp without time zone` — so ddlutils' `TimestampConverter` would apply
  identically to either regardless of the AD-model-level Date(15)/DateTime(16) split that only the
  DAL-based runtime importer cares about; only the runtime side has two different domain-type
  classes with two different parsing behaviors for the same underlying SQL type. **Resolution —
  fix the CODE, not the shared DATA file (per explicit direction, since a data file has exactly
  one shape but code can branch):** kept `M_COSTING_RULE.xml`'s `DATEFROM` at the ORIGINAL
  ddlutils-compatible `2025-12-31 03:00:00.0` (reverted the `T`/`Z` edit), and instead added a
  targeted reformatting pass inside `OnboardingDatasetNormalizer.appendPropertyElement` (new
  private method `normalizeDateTimeValueIfNeeded`): for any property whose
  `Property.getPrimitiveType()` is assignable to `java.util.Date` (true for BOTH `DateDomainType`
  and `DatetimeDomainType`-backed columns — both return `Date.class`, confirmed by reading both
  classes; ref-15/ref-16 need not be distinguished here since a T/Z-reformatted Date(15) value is
  equally valid to `DateDomainType`, which was independently verified too), a raw value matching
  the ddlutils shape (`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$`) is rewritten to
  `yyyy-MM-dd'T'HH:mm:ss.S'Z'` via a pure string transform (regex capture-group rewrite, not a
  round-trip through `java.util.Date`/`SimpleDateFormat`, to avoid any default-timezone
  double-conversion risk) — applied ONLY to the in-memory copy `OnboardingDatasetNormalizer`
  builds for the runtime importer; the bundled XML file on disk is never rewritten, so ddlutils
  keeps reading the exact literal it has always required. **Verified empirically against BOTH
  importers with the FINAL values** (not just re-read): (a) the reverted, ddlutils-shaped
  `DATEFROM` literal in the actual committed XML file still passes `Timestamp.valueOf()` (the
  exact call site ddlutils uses); (b) the SAME literal, after passing through the new
  normalizer transform (verified via a dedicated `OnboardingDatasetNormalizerTest`
  case using a temp sample-data dir + a `Property` mock stubbed with
  `getPrimitiveType()==Date.class`, since a live DAL model isn't available in this pure-Mockito
  test class) is emitted as `2025-12-31T03:00:00.0Z` in the runtime-only output XML, which the
  real, already-compiled `DatetimeDomainType.createFromString` parses cleanly; (c) a companion
  test proves a non-date column's value that merely LOOKS date-shaped is never touched by the
  transform (guards against over-eager reformatting of unrelated string/text columns). **Apply
  generally (supersedes the narrower "Apply generally #2" note above):** when a bundled
  `referencedata/sampledata/**/*.xml` value needs to change format for ONE consumer, check whether
  a SECOND consumer (ddlutils' install-time `ImportSampledata`, always active for every module
  regardless of any `com.etendoerp.go`-specific whitelist) already depends on the CURRENT shape
  before touching the file — these two importers are structurally independent, have no shared
  format contract, and a fix for one is not free of risk to the other. When they genuinely
  conflict (as here), the resolution is a reformatting pass in whichever importer's own code you
  control (here `OnboardingDatasetNormalizer`, the runtime side, since `com.etendoerp.go` owns it
  and ddlutils is core/third-party and out of reach) rather than trying to find a single literal
  that satisfies both — none may exist, and here empirically none does.

---

## ETP-4720 — C_BP_Group_Acct's other 11 `*_acct` columns (R21, 2026-08-05)

- **2026-08-05 — `c_bp_group_trg()` (core, unmodified Postgres trigger, `C_BP_Group_Trg.sql`)
  structurally OMITS 5 of `C_BP_Group_Acct`'s 33 columns from its own INSERT, confirmed via
  `pg_get_functiondef(oid)` for `proname='c_bp_group_trg'`.** Its column list copies
  `C_AcctSchema_Default` onto a new group row for: `C_Receivable_Acct`, `C_PrePayment_Acct`,
  `V_Liability_Acct`, `V_Liability_Services_Acct`, `V_PrePayment_Acct`, `PayDiscount_Exp_Acct`,
  `PayDiscount_Rev_Acct`, `WriteOff_Acct`, `UnRealizedGain/Loss_Acct`, `RealizedGain/Loss_Acct`,
  `NotInvoicedReceipts_Acct`, `UnEarnedRevenue_Acct`, `NotInvoicedRevenue_Acct`,
  `NotInvoicedReceivables_Acct` — but never mentions `WriteOff_Rev_Acct`, `DoubtfulDebt_Acct`,
  `BadDebtExpense_Acct`, `BadDebtRevenue_Acct`, or `AllowanceForDoubtful_Acct`. This is core
  Compiere/Openbravo code, out of reach to patch. **Apply:** never assume the trigger populates
  every `*_acct` column just because it exists and fires reliably (per the earlier 2026-07-01 note)
  — always diff its actual column list against the target table's full column list before trusting
  it as a complete defaulting mechanism.
- **2026-08-05 — `OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL` (the Java fallback INSERT,
  guarded by `NOT EXISTS` at the row level) is missing the SAME 4 columns as the trigger**
  (`DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/`BadDebtRevenue_Acct`/`AllowanceForDoubtful_Acct`) —
  it DOES include `WriteOff_Rev_Acct` (one more than the trigger). Because `C_BP_Group` is always
  inserted (and the trigger fires) BEFORE this Java statement runs, the Java statement's own
  `NOT EXISTS` finds the row already present and never executes — so in practice its column list is
  moot; whichever path "wins," the resulting row is missing the same 4 columns, for every tenant,
  every group, always.
- **2026-08-05 — LIVE, ONGOING preventive gap confirmed on a 6-day-old tenant, not just legacy
  drift.** Swept all 12 tenants on the dev DB: `DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/
  `BadDebtRevenue_Acct`/`AllowanceForDoubtful_Acct` are NULL on **every** `C_BP_Group_Acct` row of
  every tenant whose `C_AcctSchema_Default` already has them populated (via R11) — including
  "Empresa E2E d5be89a8" (client `2D54A79B1B2649218C5FED9307B84DC9`), onboarded 2026-07-29 through
  the CURRENT onboarding code, just 6 days before this was diagnosed. This directly contradicts an
  assumption in the ETP-4720 ticket text that "onboarding already wires these correctly, this is
  corrective-only" — it does NOT, for these 4 columns specifically. **Flagged to the
  coordinator/user rather than silently fixed**, per the tenant-fixer rule that a found preventive
  gap outside a ticket's stated scope needs a scope call before a Java fix ships. R21's corrective
  `.sql` (`20260805T120000Z__R21-bp-group-acct-remaining-columns.sql`) ships covering ALL 12 tenants
  either way; `ONBOARDING_PROVISIONED_THROUGH` was deliberately NOT bumped since no preventive fix
  shipped alongside it.
- **2026-08-05 — 6 of the ticket's 11 target columns are NULL on `C_AcctSchema_Default` ITSELF,
  fleet-wide, on every tenant on this DB — an R11-adjacent gap, not this ticket's to fix. The 7th,
  `WriteOff_Rev_Acct`, has ONE pre-existing exception — DOCS UPDATE (2026-08-05, verified live by
  Sage during DOCS review): re-querying `c_acctschema_default` found `WriteOff_Rev_Acct` NOT NULL on
  1 of the 14 schemas — F&B International Group's schema `732913485BB040FFA4643FF06D1AA095`
  (`updated` 2026-07-08, `updatedby='0'`, predates R21's authoring) — the other 13 schemas are NULL
  for it, matching the original claim.** `NotInvoicedRevenue_Acct`, `NotInvoicedReceivables_Acct`,
  `UnEarnedRevenue_Acct`, `PayDiscount_Exp_Acct`, `PayDiscount_Rev_Acct`, `V_Liability_Services_Acct`
  are all NULL on `C_AcctSchema_Default` for all 14 schemas checked — R11
  (`R11-acctschema-default-completion.sql`) only ever populated 6 *different* Defaults-tab columns
  (`DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/`BadDebtRevenue_Acct`/`AllowanceForDoubtful_Acct`/
  `P_Def_Expense_Acct`/`P_Def_Revenue_Acct`). **Practical consequence:** because that one schema
  already has a source value, R21's `@check` does NOT no-op for F&B today — of the 8
  `C_BP_Group_Acct` rows tied to that schema, 2 still have `writeoff_rev_acct` NULL and WILL be
  backfilled the first time R21 runs for F&B's client id (confirmed live, 2026-08-05). **Apply:**
  R21's `@check` correctly excludes the other 6 columns today (nothing to source from anywhere), and
  will self-heal them automatically per-tenant the
  moment a future fix populates `C_AcctSchema_Default` for them — no change needed in R21 when that
  happens. Do not confuse "R11 completed the Defaults tab" with "every Defaults-tab column is now
  populated" — R11's own scope was 6 specific columns, not all of them.
- **2026-08-05 — Per-partner override-column audit for the 11 target columns (queried
  `information_schema.columns`, not assumed): only `V_Liability_Services_Acct` has a matching
  per-partner override column, on `C_BP_Vendor_Acct` (14 columns total: `v_liability_acct`,
  `v_liability_services_acct`, `v_prepayment_acct`, plus PK/audit). `C_BP_Customer_Acct` (13 columns)
  has NEITHER of the 11 — only `c_receivable_acct`/`c_prepayment_acct`. Conclusion: a per-partner
  override's existence is irrelevant to whether the GROUP-level column should be backfilled — R21
  only ever writes `C_BP_GROUP_ACCT`, never the per-partner tables, and
  `OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL` itself fills the group-level row
  unconditionally at row-creation time with no per-partner check — so R21 needs no extra guard
  beyond "column still NULL, default now available," identical to every other column in the fix and
  to R17. (Separately noted, NOT part of R21: `BP_VENDOR_ACCT_SQL` only ever inserts
  `v_liability_acct`/`v_prepayment_acct` for a new vendor — it never seeds
  `v_liability_services_acct` at the per-partner level at all, for any vendor, ever. That is a
  distinct, unexplored potential gap on a different table, out of this ticket's scope.)
- **2026-08-05 — UPDATE: preventive front landed, gap CLOSED on both fronts.** Per an explicit
  coordinator decision, the open preventive gap above (the 4 columns actually missing live today —
  `DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/`BadDebtRevenue_Acct`/`AllowanceForDoubtful_Acct`; the
  Java patch also covers `WriteOff_Rev_Acct` since the core trigger omits it too — see the "DOCS
  UPDATE" bullet above for the corrected, DB-verified state of that column's own schema default
  [F&B International Group's schema is the one exception, populated since 2026-07-08 — NOT NULL
  fleet-wide]) was folded into ETP-4720 rather than a separate ticket. Implemented as `OnboardingAccountingWiringService#patchBpGroupAcctMissingColumns` — a THIRD
  entry point on that class (after `wire` and `wireBusinessPartnerAccounts`), a `COALESCE`-guarded
  `UPDATE` mirroring R21's own SQL shape column-for-column, wired as the new LAST provisioning step in
  `EtendoGoJwtServlet.ensureOnboardingDataset` (right before `registerBaseline`). Needed neither a
  resolved `Client`/`AcctSchema` entity nor a specific schema id — unlike `wire()`/
  `wireBusinessPartnerAccounts()`, it patches every schema a tenant has via one client-scoped
  statement, exactly like its corrective twin (confirmed via a dedicated unit test that leaves
  `clientMissing`/`ledgerMissing` seams set and shows the patch still runs regardless).
  `ONBOARDING_PROVISIONED_THROUGH` bumped to R21's own timestamp, `2026-08-05T12:00:00Z`. Verified:
  `OnboardingAccountingWiringServiceTest` (+4 tests) and `EtendoGoJwtServletOnboardingDatasetTest`
  (+2 tests, wiring order + failure-short-circuits-the-chain) — 60/60 total pass via `./gradlew test
  --tests com.etendoerp.go.onboarding.OnboardingAccountingWiringServiceTest --tests
  com.etendoerp.go.rest.EtendoGoJwtServletOnboardingDatasetTest` (the ROOT `:test` task; the
  per-module `:modules:com.etendoerp.go:test` task reports `NO-SOURCE` in this build — this module's
  `src-test` is wired into the root project's `test` sourceSet by the Etendo Gradle plugin, not into a
  per-module one — use the root task, not `:modules:com.etendoerp.go:test`, to run these tests).
  Corrective side: `cli/test/data-fixes-r21-bp-group-acct-remaining-columns.test.js` added (59 tests,
  static parse validation per the R17/R20 precedent — no live-DB test harness exists for data-fixes
  in this codebase, by established convention).

---

## ETP-4515/H2 — Onboarding role provisioning, end-to-end verification (2026-08-06)

- **2026-08-06 — `./gradlew test` NO-SOURCE for `com.etendoerp.go` is SYSTEMIC in THIS environment,
  reproducible even for a documented, previously-passing test — not specific to any one test file
  or to the worktree scenario already documented (2026-07-06).** Confirmed on the MAIN checkout
  (already on `epic/ETP-3504` at the same commit as `origin/epic/ETP-3504`, no worktree involved):
  `./gradlew :modules:com.etendoerp.go:test --tests "com.etendoerp.go.onboarding.OnboardingRoleProvisioningServiceTest"`
  and even `--tests "com.etendoerp.go.schemaforge.email.EmailFrameworkValueObjectsTest"` (a test the
  module's own docs, `docs/ETP-4139-local-smoke-2026-06-01.md`, document as a working `./gradlew
  test --tests ...` invocation) both report `:modules:com.etendoerp.go:compileTestJava NO-SOURCE`.
  An `-I <init-script>` probe (`afterEvaluate { println sourceSets.test.java.srcDirs }`) showed the
  `test` sourceSet resolved to the Java-plugin DEFAULT `.../src/test/java` (which doesn't exist),
  NOT `.../src-test/src` (which does, and is where the actual test files live) — the
  `com.etendoerp.testing.gradleplugin` (v2.1.0, applied at root) that is supposed to rewire it
  (confirmed via bytecode inspection of its `configureSourceSets` method: it does contain the
  literal string `src-test/src` and iterates subprojects of a `:modules`/`:modules_core` root
  project group) is either not firing for this project or firing too late relative to when Gradle
  snapshots the source set for `compileTestJava`. Root cause NOT fully isolated (didn't chase
  further — diminishing returns for a verification task). **Apply:** in this specific local dev
  environment, do not trust `./gradlew test` (root-level OR `:modules:com.etendoerp.go:test`
  scoped) as a signal either way for `com.etendoerp.go` — a `NO-SOURCE` result here means "the
  harness didn't run," never "no tests exist" and never "tests passed." `:compileJava`/`:classes`
  (production code only, no `src-test`) DOES work normally and is a valid compile-correctness
  signal on its own. If this needs to be unblocked for real, the next things to try are (a) an
  explicit `sourceSets { test { java.srcDirs = ['src-test/src'] } }` override added temporarily to
  the module's own `build.gradle`, or (b) asking a human to run it from their own already-working
  local setup (this may be an artifact of this specific sandboxed checkout/Gradle-cache state, not
  a real regression in the plugin).
- **2026-08-06 — ETP-4515 (H2 preventive front) VERIFIED END-TO-END against real onboarded tenants
  — the acceptance criterion "verified by onboarding a fresh test tenant" is now MET, via evidence
  discovered rather than freshly triggered.** Found 3 real tenants already onboarded through the
  LIVE `POST /sws/go/onboarding` flow strictly AFTER PR #762 (`2d8b406b`, 2026-07-27) merged this
  service into `epic/ETP-3504`: **`RolesPresa`** (`1803BF0F88654173A698D4D6B371F9B0`, created
  2026-07-27T13:14 — the name itself reads as a manual smoke test of this exact feature),
  **`Empresa E2E 91c979ac`** (`3B4B7186C83C4D8FBCE74B6AFC1B14C6`, 2026-07-27T18:42), **`Empresa E2E
  d5be89a8`** (`2D54A79B1B2649218C5FED9307B84DC9`, 2026-07-29T12:58). All three, checked against
  GOClient's CURRENT live state (re-verified fresh, not trusted from the 2026-07-27 R16 doc note —
  no drift found): (1) have exactly the 4 cloned roles (Finance/Sales/Purchasing/Inventory) plus
  their own auto-created admin role, no extras, no dupes; (2) `EM_ETGO_Show_Acct_Fields = 'Y'` for
  Finance and `'N'` for Sales/Purchasing/Inventory on every one of the 3, matching GOClient exactly;
  (3) `AD_Window_Access` row counts match GOClient's CURRENT counts (Finance 9, Inventory 6,
  Purchasing 5, Sales 6 — identical to the R16 baseline, unchanged since 2026-07-27); (4) a
  window-id + `isreadwrite`-flag set-equality check (not just counts) for all 4 roles on all 3
  tenants against GOClient came back an EXACT match; (5) every other `AD_Role` attribute checked
  (`userlevel`, `ismanual`, `is_client_admin`, `isadvanced`, `isrestrictbackend`, `isportal`,
  `isportaladmin`, `iswebserviceenabled`, `istemplate`, `recalculatepermissions`, `processing`) is
  identical across GOClient and all 3 tenants' Finance role. Also confirmed the deployed webapp on
  the locally running Tomcat container (`etendogoclean-tomcat-1`, context `/etendogoclean`) carries
  the exact current-source version of `OnboardingRoleProvisioningService.class` (`javap` method
  signatures match the `.java` file byte-for-byte) — the 3 tenants above were provisioned by the
  SAME code that's in the repo today, not a stale prior cut. **Idempotency claim ("safe to call
  `wire()` twice") verified via the guard PRECONDITION, not a literal second live call:**
  `ensureRoleCloned`'s guard is `resolveRoleByName(clientId, roleName) != null` → skip; confirmed
  directly that all 4 roles are `isactive='Y'` on all 3 tenants right now, which is exactly what
  that query selects — so a second `wire()` call today would hit "already exists" on every role and
  perform zero writes. No literal second invocation was made (no low-risk trigger exists: the only
  HTTP entry point, `handleOnboarding`, always creates a brand-new client — there's no "re-run
  onboarding for an existing client" endpoint to call safely). **Net: preventive front (ETP-4515) is
  no longer "written but unverified" — it is proven correct against 3 independent real onboardings.
  The mocked `OnboardingRoleProvisioningServiceTest` (read, not executed — blocked by the NO-SOURCE
  issue above) is a legitimate seam-based orchestration test (every DB-touching method is an
  overridable `protected` seam, genuinely exercises `wire()`'s control flow: missing-role cloning,
  skip-when-present, GOClient-template-missing failure, context capture/restore on success AND
  failure) but it mocks away every real DAL/native-SQL call, so it was never going to catch a live
  DB-shape issue — the live-tenant DB comparison above is the evidence that actually closes the gap,
  not the unit test.**

## ETP-4854 — K1: `AD_Client.Acctdim_Centrally_Maintained` hardcoded to `'Y'`, "Dimensiones contables" screen a no-op (2026-08-11)

- **2026-08-11 — `DimensionDisplayUtility.getAccountingDimensionConfiguration()` does NOT check
  `IsAcctDimCentrally` at all — it is called ONLY when the caller (`LoginUtils.doLogin`,
  `NeoDisplayLogicHelper.resolveAccountingDimensionFlags`) already knows the client is `'Y'`.**
  The `'N'`/`'Y'` branch lives entirely in the CALLER, not inside `DimensionDisplayUtility` itself.
  Read the method signature carefully before assuming it self-guards on the flag — it always
  computes and returns the full `AD_Client.<Dim>_Acctdim_*` matrix regardless of the flag's value;
  the caller decides whether to use the result.
- **2026-08-11 — `C_AcctSchema_Element.isactive` defaults to `'Y'` at the SQL schema level, and
  every live tenant checked (14 `'Y'`-mode clients) actually has it `'Y'` for ALL 7 configurable
  dimensions (OO/PJ/BP/PR/CC/U1/U2) regardless of that client's own `<Dim>_Acctdim_IsEnable`
  value.** This means the flat mechanism's data is essentially always "everything visible" by
  default, independent of what the fine-grained `AD_Client` matrix says — the two mechanisms do
  NOT start from the same baseline. **Apply:** any fix or feature that flips a client from `'Y'`
  to `'N'` (or vice versa) MUST explicitly reconcile `C_AcctSchema_Element.isactive` against the
  `AD_Client` per-dimension config first — never assume the flat mechanism's existing state
  already reflects what the client intends, or the flip will silently change visibility.
- **2026-08-11 — Chosen effective-visibility formula for the Y→N collapse: `IsEnable='Y' AND
  (Header='Y' OR Lines='Y' OR Breakdown='Y')`, per dimension.** Flat mode has no level
  granularity (one flag governs Header/Lines/Breakdown simultaneously), so an exact 1:1 mapping
  from the 3-level matrix is impossible. Chose OR-of-levels (err toward showing, never toward
  hiding something the client currently sees on some level/doctype) over AND-of-levels or
  Header-only. On this DB, `Breakdown` is `'N'` everywhere for every dimension/client today, so in
  practice the formula currently collapses to `IsEnable='Y' AND (Header='Y' OR Lines='Y')` — but
  the general OR-of-3 formula is what ships, for correctness against any future client shape.
- **2026-08-11 — `NeoDisplayLogicHelper` (com.etendoerp.go) is a THIRD, previously-undocumented
  consumer of `AcctdimCentrallyMaintained` beyond classic core's `DimensionDisplayUtility`/
  `LoginUtils`/`InitialSetupUtility`.** `resolveAccountingDimensionFlags` faithfully mirrors the
  classic 'N'/'Y' branch (confirmed by reading both side by side), with its own documented
  ETP-4529 comment explaining WHY it re-implements the 'N' branch's `C_AcctSchema_Element` query
  live per-request instead of relying on session state the way classic `LoginUtils` does (NEO
  Headless is stateless/JWT-based, no `HttpSession` to populate at login time). This does not
  contradict "no security impact" — it's the SAME logic Etendo GO already runs; the finding
  confirms GO's own field-visibility engine benefits from (does not break under) the `'N'` flip.
- **2026-08-11 — `schema_forge_core` (sibling repo, `../schema_forge_core`) carries its OWN
  `cli/src/data-fixes/sql/` directory but it is STALE on this local checkout — tops out at `R8`,
  6 fixes behind `etendo_schema_forge`'s actual latest (`R22` at the time of this ticket).** Per
  the repo-topology note the data-fixes framework is duplicated in BOTH SF repos, but this
  checkout's copy in `schema_forge_core` was clearly not kept in sync post-split. Did not touch it
  for R23 (out of scope, no branch there related to this ticket) — flagged here so a future run
  does not assume it is current without checking `ls` first.
- **2026-08-11 — Compiling `com.etendoerp.go`'s main sources (`:modules:com.etendoerp.go
  :compileJava`) DOES work in this environment and is a fast, reliable syntax/type-check** (unlike
  the module's `test`/`compileTestJava` tasks, which report `NO-SOURCE` even for pre-existing,
  presumably-passing test files like `OnboardingBaselineServiceTest` — see the ETP-4515 section
  above for the established root cause). **Apply:** always run `./gradlew ":modules:com.etendoerp
  .go:compileJava"` after any change to this module's `src/` as a cheap correctness gate, even
  though the equivalent test-compile gate is unavailable locally. **Addendum (Alex, REVIEW,
  git-stash repro):** this only works invoked from the etendo root wrapper — running it from
  inside `modules/com.etendoerp.go` fails with a Gradle-version mismatch (module pins Gradle
  9.4.1, root pins 8.12.1), a pre-existing, diff-independent quirk; always run it as
  `./gradlew ":modules:com.etendoerp.go:compileJava"` from the etendo root.

## Cheque → Recibo payment-method replacement (G3 / R24, 2026-08-21)

- **2026-08-21 — The six `*use` columns on BOTH `fin_paymentmethod` and `fin_finacc_paymentmethod`
  (`uponreceiptuse`, `upondeposituse`, `inuponclearinguse`, `uponpaymentuse`, `uponwithdrawaluse`,
  `outuponclearinguse`) are NULLABLE, and comparing them with `=` inside a `NOT ( ... )` guard is a
  silent correctness bug.** `col = 'CLE'` evaluates to NULL when the column is NULL, `NOT (NULL)` is
  NULL, and the row is never matched — so the divergent row is skipped by `@apply` AND reported as
  already-fixed by `@check`. Hit live while trialling R24: the migrated Bank link kept empty
  reconciliation accounts while `@check` returned 0 rows on the re-run, i.e. a falsely-green
  convergence. **Apply:** in any data-fix guard over a nullable column use `IS NOT DISTINCT FROM`
  (or `IS NULL`), never `=`. Only the SET clauses may use `=`. R24 carries a regression test.
- **2026-08-21 — NOTHING in the schema has a foreign key pointing AT `fin_finacc_paymentmethod`**
  (verified against `information_schema`). **Apply:** per-account payment-method links can be
  repointed to a different method or deleted outright without cascade risk — a method swap does not
  need to recreate them. The one constraint to respect is `fin_finacc_paymentmethod_un UNIQUE
  (fin_paymentmethod_id, fin_financial_account_id)`, so a repoint must be guarded against an
  account that already carries a link to the target method (R24 Effect 2 → 2b handles this by
  repointing what it can and deleting the rest).
- **2026-08-21 — The Etendo GO tenant signature is a payment method named `Transferencia bancaria`,
  NOT one named `Cheque`.** `F&B International Group` (Openbravo demo data,
  `referencedata/sampledata/F_B_International_Group/FIN_PAYMENTMETHOD.xml`) ships its own unrelated
  method literally named `Cheque`, alongside `Check`, `Wire Transfer`, `Cash`, `Al contado` and
  `Transferencia`. Live counts: 36 tenants have a `Cheque`, only 35 have `Transferencia bancaria`
  — the extra one is F&B. **Apply:** gate any payment-method data-fix on `Transferencia bancaria`;
  gating on `Cheque` corrupts F&B (and any other demo client) instead of the GO fleet.
- **2026-08-21 — Deactivating a payment method is NOT enough: `Cheque` was the default method of 34
  `c_bpartner` rows.** Leaving `c_bpartner.fin_paymentmethod_id` (and `po_paymentmethod_id`)
  pointing at an `isactive='N'` method makes every new invoice for those partners inherit a method
  the selectors will not offer. **Apply:** a method retirement must repoint the forward-looking
  configuration references — `c_bpartner`×2, `c_paymenttermline`, `c_project`, `c_projectproposal`,
  `fin_payment_proposal` — and, so open work stays operable, the UNPROCESSED documents
  (`c_invoice`/`c_order`/`fin_payment` with `processed='N'`, plus the `fin_payment_schedule` rows
  hanging off them). Processed documents are deliberately left behind so history keeps its original
  label; that is the reason to create a NEW method rather than rename the old one in place.
- **2026-08-21 — Card accounts (`fin_financial_account.type='CA'`) never had a Cheque link: 0 of 34
  live, versus 55 of 66 Bank accounts.** So "associate Recibo to Bank AND Card accounts" is a
  migration on Bank and brand-new behaviour on Card. **Apply:** never assume a per-account link set
  is symmetric across account types — count them (`type` ref list is `B` Bank / `C` Cash / `CA`
  Card) before writing the fix, or the `CA` half is silently missed.
- **2026-08-21 — `FinancialAccountSupport.createLink` did NOT copy `INUponClearingUse` /
  `OUTUponClearingUse` from the method template**, even though the surrounding comment already
  explains that fields with no sane default must be copied or "every new account's transaction
  handling silently diverges". It now does. Note the entity's setters are spelled
  `setINUponClearingUse` / `setOUTUponClearingUse` (property names `iNUponClearingUse` /
  `oUTUponClearingUse`), not `setInUponClearingUse`.
- **2026-08-21 — In `PAYMENT_METHODS_BY_TYPE` the FIRST method of each list becomes the account's
  default** (`assignDefaultPaymentMethods` → `createLink(account, method, i == 0)`). **Apply:** to
  add a method to an account type without stealing its default, append it — never prepend. R24 uses
  `B: [Transferencia, Recibo, Tarjeta]` and `CA: [Tarjeta, Recibo]` for exactly this reason, and the
  corrective `.sql` inserts new links with `isdefault='N'` and never writes `isdefault` in a SET.
- **2026-08-21 — There is NO `EntityPersistenceEventObserver` on `FIN_FinancialAccount` anywhere in
  `com.etendoerp.go`.** The automatic method-linking fires from exactly two call sites, both Neo
  handlers: `FinancialAccountHandler#afterHandle` (manual "sin conexión" creation) and
  `FinancialAccountBankConnectionHandler#handleCreateAndLink` (Salt Edge create-and-link).
  **Apply:** an account created straight from the Etendo Classic window gets no automatic links.
  Accepted scope for G3 (explicit product call), but any requirement phrased as "every new account,
  however created" needs an event handler that does not exist yet.
- **2026-08-21 — `get_uuid()` is the right PK minter for a data-fix that inserts N rows** (precedent:
  R1, R7, R9, R10, R16, R17, R18, R20, R22, R23). Reserve the `@uuid_<KEY>@` placeholder for
  singleton rows whose id other statements must reference; for N-row inserts call `get_uuid()` in
  the SELECT list. R24 uses `@uuid_RECIBO@` for the one method row and `get_uuid()` for the
  per-account links.
- **2026-08-21 — `parseFix(text, fixId)` takes the file CONTENTS first and the fix id (file name
  without `.sql`) second.** Passing the path first "succeeds" far enough to produce a confusing
  `missing or empty @check section` error whose message is the entire file. **Apply:** when
  trialling a fix by hand, mirror `run.js`'s templating order exactly — `inlineParams` →
  `inlineClientName` (only if `@name_client@` is present) → `inlineFreshUuids` — then run
  `@check`/`@apply`/`@report` inside a `BEGIN … ROLLBACK` against the real DB. Sweeping all tenants
  in one rolled-back transaction (44 tenants for R24) is the cheapest way to prove convergence and
  catch the NULL-comparison class of bug before review.
- **2026-08-21 — A data-fix that repoints a column via a scalar subquery must guard that the
  subquery has a row, or it BLANKS the column instead.** `SET fin_paymentmethod_id = (SELECT …
  WHERE name='Recibo')` yields NULL — not "no change" — on any tenant where `Recibo` does not
  exist, so the `WHERE` filter matching on the OLD method is not enough. **Apply:** pair every
  `SET col = (scalar subquery)` with `AND EXISTS (<same subquery>)`.
- **2026-08-21 — Put the tenant-identification gate on EVERY `@apply` statement, not only on
  `@check`.** The runner does evaluate `@check` first and skips `@apply` on 0 rows
  (`run.js` `applyFix`, and `--fix`/`cmdTargetedFix` goes through the same path), so `@check` alone
  is sufficient in normal operation — which is exactly why the omission is easy to miss in review.
  It stops being sufficient the moment anyone replays `@apply` by hand (the standard way to trial a
  fix) or a future runner change reorders the two. Measured on R24: replaying the un-gated `@apply`
  straight onto `F&B International Group` **deleted its `Cheque` payment method and one account
  link**; with the gate on all 18 statements the same replay is a no-op. **Apply:** gate every
  statement, and prove it by running `@apply` alone against a tenant the fix must not touch, inside
  `BEGIN … ROLLBACK`, comparing a before/after snapshot.
- **2026-08-21 — Never write `:org_id` (or any bind placeholder you don't want resolved) anywhere
  inside a fix's `@check`/`@apply`/`@report` body — INCLUDING in a comment.** `run.js` decides
  whether to resolve the tenant's operative org with a raw substring test over the concatenated
  section text (`` `${fix.check}\n${fix.apply}\n${fix.report}`.includes(':org_id') ``), and
  `parseFix` keeps comment lines inside the section bodies. R24 mentioned the placeholder only in
  an explanatory comment saying it deliberately does NOT use it — which was enough to switch org
  resolution on, and the run then died on the first tenant with no operative org
  (`:org_id used but tenant … has no operative org`), aborting the whole chain after 22 of 44
  tenants with an already-committed partial result. **Apply:** keep placeholder names out of prose
  (say "the runner's operative-org bind" instead), and after authoring a fix assert
  `parseFix(...)` → `check+apply+report` does not contain `:org_id` unless you mean it.
- **2026-08-21 — A targeted `--fix` run that throws does NOT roll back the tenants it already
  committed.** Each tenant is its own transaction, and `cmdTargetedFix` has no try/catch around the
  per-tenant loop, so an exception thrown by `applyFix`'s *pre*-flight (bind resolution, before any
  `BEGIN`) propagates out of the loop and leaves the earlier tenants APPLIED and the rest untouched
  (exit code 2). **Apply:** the fix is idempotent, so the remedy is simply to re-run it once the
  cause is fixed — already-APPLIED tenants come back `SKIPPED_NOT_NEEDED — kept prior success
  state` via the ledger's no-downgrade guard. Always check the exit code and the APPLIED+SKIPPED
  count against the announced tenant count; a truncated console listing looks identical to success.
- **2026-08-21 — When auditing a data-fix by splitting `@apply` into statements, STRIP full-line
  comments first, or adjacent prose makes an ungated statement look gated.** Splitting the raw
  section text on `;\n` puts each statement's preceding comment block inside that statement's chunk,
  so a substring test for the gate literal matches the comment, not the SQL. This produced a real
  gap on R24: the comment above Effect 4 read "…`isdefault='N'` so **Transferencia bancaria** /
  Tarjeta keep the default…", so both the audit census AND the script that inserted the gate
  (sharing the same contaminated predicate) skipped that one statement — the census reported
  "0 ungated" while the executable SQL of the `INSERT INTO fin_finacc_paymentmethod` had no gate at
  all. It was structurally safe only second-order (its `CROSS JOIN` on `name='Recibo'` yields no
  rows for a tenant without that method), which is exactly the kind of safety that evaporates when
  someone renames something. **Apply:** any per-statement assertion — in an audit script or in a
  test — must run on comment-stripped SQL, and the two numbers (raw vs comment-stripped) should be
  compared explicitly, because agreeing is what proves the audit is not measuring prose.
- **2026-08-21 — Open framework footgun (NOT fixed): `run.js:249` decides whether to resolve
  `:org_id` with a raw `.includes(':org_id')` over the concatenated section bodies, comments
  included.** R24 is hardened by a test, but the next fix that names a bind in prose repeats the
  incident. Root fix would be to strip comments before the `.includes()` (or scan executable SQL
  only) in `cli/src/data-fixes/run.js`, with its own test — deliberately left out of ETP-4893's
  scope as shared-runner surface.

## ETP-4877 — Existing-tenant system-role-templates retrofit (2026-08-26)

Closes L1 (Tenant Ownership, `onboarding-gaps.md`) on the corrective front. Ships
`R26-tenant-owner-and-personal-role-retrofit.sql` (owner detection + personal-role backfill +
org-access/defaults backfill for pre-existing personal-role holders + `AD_User_Roles` cleanup +
`EM_ETGO_Show_Acct_Fields` derived-flag sync) and `R27-deactivate-r16-duplicate-roles.sql`
(deactivates confirmed-unused R16-era per-client role clones), plus the `retired.json` mechanism
that permanently retires R16 at the runner level. Full field-verified findings below.

- **2026-08-26 — `AD_User.C_BPartner_ID IS NULL` is the load-bearing distinction between a real
  staff/login user and a BP-contact row that happens to live in `AD_User`.** Confirmed live: every
  BP-contact-linked row (the F1-gap "Default Customer Contact" seeded per org, plus a large
  population of orphaned BP-contact test users left over on several E2E tenants — names like
  "Andres1787679884486 Name", "Julia... Legacy", "Lucia... Code") has `C_BPartner_ID` SET and holds
  ZERO `AD_User_Roles` rows; every genuine staff/login user (the ones with a `username`, the ones
  an admin actually manages via "Usuarios") has `C_BPartner_ID` NULL. Live count on this DB: 127
  active `AD_User` rows across 41 real tenants, only 47 with `C_BPartner_ID IS NULL`. **Apply:** any
  fix that needs to enumerate "real users" of a tenant (not BP contacts) must filter
  `C_BPartner_ID IS NULL` — minting a personal role, granting access, or counting "how many users"
  without this filter massively over-counts and touches rows that are never login principals.
- **2026-08-26 — `UserRoleCompositionService#isReusablePersonalRole`'s definition does NOT check
  a role's NAME.** A role named anything (e.g. GOClient's "Classic Role") counts as a genuine,
  reusable "personal role" for a user as long as it is active, non-template, non-client-admin, same
  client, not itself an `AD_Role_Inheritance` `InheritFrom` target, and has 0 or exactly 1 active
  `AD_User_Roles` row (and if 1, it's this user's). **Apply generally:** never assume the
  `"Personal – "` name prefix is how the Java code recognizes a personal role — it's a display
  convention `buildPersonalRoleName` applies when CREATING one, not a check anything reads back.
- **2026-08-26 — Corrupting-bug found+fixed while building R26: TWO DIFFERENT users legitimately
  sharing ONE non-personal role via `Default_Ad_Role_ID` (zero `AD_User_Roles` rows for either) is
  real, live data on this DB** — GOClient's "11111" and "test" both point `Default_Ad_Role_ID` at
  the SAME "Classic Role". Per the identity check above, EITHER user individually sees that role as
  "reusable" (0 assignments = "never assigned yet, safe to reuse"). A first draft of R26 scoped its
  org-access/defaults/`AD_User_Roles`-cleanup steps to "any non-template, non-admin default role" —
  broke immediately: the `AD_User_Roles` enforcement step would insert ONE row per user pointing at
  the SAME shared role, instantly breaking that role's own exclusivity for both (2 active rows, not
  0 or 1) and manufacturing real login access neither user previously had via `AD_User_Roles` — well
  outside what a "cleanup extra rows" step should ever do. **Fix:** those three steps only ever
  touch a user's default role when it is EITHER the fix's own deterministic personal-role id OR
  already named `"Personal – %"` (the established convention) — never an arbitrary reusable-but-
  unnamed default role. Caught by full-fleet idempotency testing (`@check` after `@apply` returned
  1 row instead of 0) — proves why "re-run the check after apply, inside the same transaction" is
  worth doing for every non-trivial fix, not just the ones that look risky on paper.
- **2026-08-26 — Deterministic (hashed) role ids, not `get_uuid()`, for a multi-step `@apply` that
  needs to reference a row it just inserted.** `get_uuid()` (Postgres-side, used everywhere else in
  this catalog) can't be "read back" by a LATER separate top-level statement in the same `@apply`
  without a data-modifying CTE with `RETURNING` — and CTEs don't span multiple statements. R26 needs
  the SAME personal-role id in ~6 separate statements (role INSERT, inheritance INSERT, window-access
  INSERT, `Default_Ad_Role_ID` UPDATE, org-access INSERT, defaults UPDATE, `AD_User_Roles`
  INSERT/DELETE). Solution: `UPPER(MD5(u.ad_user_id || ':ETP4877-personal-role'))` — a stable,
  32-hex-uppercase (matches the Etendo id format exactly), collision-safe-enough (128-bit hash
  space) id every step can independently RE-DERIVE from `u.ad_user_id` alone, with no read-back
  needed. Bonus: a retried run after a mid-chain failure recomputes the IDENTICAL id instead of
  minting a second orphaned role. **Apply generally:** this pattern generalizes to any future fix
  that needs a fresh row's id available to several later statements in the same `@apply` — prefer a
  deterministic hash of a stable natural key over `get_uuid()` when that's the case.
- **2026-08-26 — `AD_Role_Inheritance` alone grants NOTHING; the window/tab/field/process-access
  rows must be separately materialized.** Confirmed by reading `UserRoleCompositionService`'s own
  javadoc: core's `RoleInheritanceEventHandler`/`WindowAccessInjector` do this via a Hibernate event
  observer, not a DB trigger. But R16 (2026-07-27) already proved a plain SQL
  `INSERT INTO ad_window_access ... SELECT ... FROM <source role's own ad_window_access>` reaches
  the identical end state without Hibernate — R26 Step 2b reuses that exact pattern (source = the
  resolved system template, not a fixed GOClient row), reading the template's CURRENT grants so a
  future widening (ETP-4878) is picked up automatically on the next run, not hardcoded. This is WHY
  R26 could stay `@type: sql` instead of escalating to `@type: webhook` despite needing to replicate
  `UserRoleCompositionService`'s write shape — the SQL-first criterion held.
- **2026-08-26 — `AD_Role.EM_ETGO_Show_Acct_Fields` (ETP-4520) is READ as a flat stored column,
  never derived via a live join to `AD_Role_Inheritance`.** Confirmed by reading
  `SFWindowAccessMap#resolveShowAccountingFields`: `SELECT em_etgo_show_acct_fields FROM ad_role
  WHERE ad_role_id = :roleId` — no join at all. So the column is a CACHE of "does this role
  currently inherit from Finance", and whoever last changed a role's `AD_Role_Inheritance` set is
  responsible for keeping it in sync — nothing did that for the ETP-4852 composition path before
  ETP-4877. **Confirmed live, real bug (not hypothetical):** the system Finance template itself read
  `'N'` (should always be `'Y'`), and 24 active, non-template, non-client-admin roles fleet-wide
  already inherited from Finance via `AD_Role_Inheritance` yet still read `'N'` — including
  GOClient's "RoleFinanzas" (the BUG-1 role from the ETP-4906 QA finding — see the header note in
  R26 for why BUG-1's window-access-ownership corruption does NOT affect this fix; it's a completely
  separate column) and "Classic Role". Fixed both directions (R26 Step 8b: `'Y'` iff a matching
  active inheritance row exists, `'N'` otherwise) and added
  `UserRoleCompositionService#syncShowAccountingFieldsFlag`, called unconditionally at the end of
  every `reconcileInheritances`, so `AssignTemplateRolesControl`'s live save path self-heals this
  going forward. **Apply generally:** a "derived" column with no read-time join is a classic drift
  trap — whenever a column looks like it SHOULD be computed from another table but a native-SQL read
  shows it's just stored, audit every WRITE path that could invalidate it, not just the one you're
  currently touching.
- **2026-08-26 — This DB is a SHARED, actively-mutated dev/QA environment, not a static fixture —
  re-running the SAME read-only diagnostic query minutes apart can return DIFFERENT results.**
  F&B International Group showed 1 active `is_client_admin` holder in an early diagnostic pass and
  0 in a later one, with no write from this session in between. Root cause not chased (plausible:
  background E2E suites continuously creating/mutating "E2E User ..." tenants, or a scheduled data
  refresh) — not a bug in any fix here. **Apply generally:** on this DB specifically, do not treat
  an early count as still-true evidence later in the same session; a fix's OWN `@check`/`@report`
  re-evaluating live state at apply time is what actually matters, not a diagnostic snapshot taken
  earlier. This is exactly why the ticket's own instruction ("re-run your own audit queries against
  the actual DB... do not size off assumed counts") matters in practice, not just in principle.
- **2026-08-26 — `schema_forge_core`'s mirrored `cli/src/data-fixes/` copy is confirmed still stale
  (tops out at R8) and on an unrelated branch (`mergeblock/ETP-4962`)** — same finding as the R23
  entry above, reconfirmed for ETP-4877. No `retired.json` exists there at all. Per this repo's own
  documented drift-handling convention (`CLAUDE.md` repo-topology section: "treat this repo's copy
  as authoritative for functional-tenant remediation and flag the drift") and the established R23
  precedent, NOT reconciled here — flagged in the PR/final report only, reconciling the two catalogs
  is a separate task.
- **2026-08-26 — `retired.json` (ETP-4877) is new shared-runner infrastructure, the first fix ever
  to actually need `@type: webhook`-adjacent framework work despite staying `@type: sql` itself.**
  Item 7's ask ("skip retired fixes entirely, BEFORE parsing/evaluating any fix... checksum
  double-check... fails loudly on mismatch") is implemented as `loadRetiredList()` (reads
  `retired.json`, tolerant of a missing file) → `verifyRetiredList(catalog, retired)` (throws
  immediately on a retired fixId missing from the catalog, or a live sha256 checksum mismatch) →
  `loadCatalogWithRetirement()` (the one function every CLI entry point — full run, `--fix`,
  `--list-clients` — now calls instead of the bare `loadCatalog()`, so `fix.retired` is always set
  before `applyChain`/`cmdTargetedFix` ever see a fix). The full general `CHECKSUM_MISMATCH` ledger
  status (deferred per the runner's own Phase-0 docs) was deliberately NOT built — only the narrow
  checksum verification `retired.json` itself needs, computed on-demand for retired fixIds only, not
  stored anywhere or computed for the whole catalog on every run.

## ETP-5019 — L2: owner `AD_User.Email` backfill (2026-08-27)

- **2026-08-27 — The canonical source for an existing tenant owner's "real" email is the
  `ETGO_ACCOUNT` table, resolved from `AD_User.Username` via the SAME two-step algorithm the
  runtime login path already uses — never guess or invent a new heuristic when one is already
  shipped and load-bearing.** `AD_User.Username` is NOT reliably the owner's email: onboarding
  names the FIRST environment a founder creates after their plain account email, and every LATER
  environment `<accountEmail>+<clientName>` (`EtendoGoJwtSupport#buildClientUsername`, dodges the
  `Username` uniqueness constraint). `GoAccountResolver#findAccountByUsername`
  (`com.etendoerp.go/.../common/GoAccountResolver.java`) is the already-tested, already-live
  inverse — used by `EtendoGoJwtDalHelper#findAccountForEnvironmentUser` to resolve a RETURNING
  owner's identity on every login: try exact `lower(username) = lower(account.email)` first; on a
  miss, split on the LAST `'+'` (never the first — the suffix alphabet is `[a-z0-9]` only, so a
  legitimately plus-addressed email like `user+tag@example.com` survives) and retry exact match
  on the prefix. **Apply:** a corrective backfill that needs "the real identity behind an
  AD_User" should always check for an existing runtime resolver first (grep the module for
  `findAccountBy*`/`resolveAccount*` before writing new join logic) and mirror it exactly in SQL
  — divergence between the corrective SQL and the runtime path is a bug waiting to happen even if
  today's data doesn't yet exercise the divergent case.
- **2026-08-27 — `etgo_account` column is `isactive` (`Y`/`N`), NOT `active` — do not confuse
  with the Java DAL property name.** `EtendoGoJwtDalHelper.ACTIVE_ACCOUNT_FILTER` reads
  `account.active = true` in HQL/DAL-property space, which maps to the DB column `isactive`. A
  raw SQL query against `etgo_account` must use `isactive = 'Y'`, not `active = true` — the
  column literally does not exist under that name (`ERROR: column "active" does not exist`,
  hint: "Perhaps you meant... isactive"). `etgo_account` also has a separate `status` column
  (`'active'`/`'pending'`, ETP-4829 — distinguishes "already has a usable local password" from
  "admin-created, awaiting invite") that is UNRELATED to `isactive` and is NOT checked by
  `ACTIVE_ACCOUNT_FILTER` — a backfill mirroring the runtime resolver should likewise gate on
  `isactive='Y'` only, not additionally require `status='active'` (a pending/SSO-only account is
  still the correct identity to resolve to, matching what the live path itself would do).
  `email_verified` is a third, also-unrelated nullable timestamp column — many real owner
  accounts on this DB have it NULL (never gated by `findActiveAccountByEmail` either).
- **2026-08-27 — Live-DB sweep: 69/69 pre-existing `EM_ETGO_Is_Owner='Y'` owners resolve
  cleanly, all via the exact branch (0 currently need the suffix-split branch).** Every owner on
  this DB is still the sole/first environment their account owns, so no owner username currently
  carries a `+<clientName>` suffix. Also confirmed: exactly one owner per client (0 clients with
  >1), zero owners already had a non-NULL email, and every matched `etgo_account` row has
  `isactive='Y'`/`status='active'` uniformly. The suffix-split branch was still implemented (not
  skipped as "unneeded YAGNI") because an owner CAN legitimately found a second tenant under the
  same account, which DOES suffix their username — kept for correctness even though it is
  provably a no-op on today's data, not merely "future-proofing" speculation.
- **2026-08-27 — In-flight branch discovered R26 (×2) and R27 already claimed on the unmerged
  `feature/ETP-4877` branch (both repos) — same recurring trap as ETP-4245's R9 discovery.**
  `git rev-list --all | xargs git ls-tree` (schema_forge side) surfaced
  `20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit.sql`,
  `20260826T120000Z__R26-admin-identity-real-org.sql`, and
  `20260826T121500Z__R27-deactivate-r16-duplicate-roles.sql` — none present in this branch's
  `cli/src/data-fixes/sql/` directory, all three confirmed via `git branch -a` to live only on
  `feature/ETP-4877`/`origin/feature/ETP-4877`, NOT yet merged into `epic/ETP-3504`. Crucially,
  **R26's owner-retrofit fix is already `APPLIED` in the LIVE `ETGO_DATA_FIX_HISTORY` ledger on
  the shared dev DB** even though its `.sql` file is absent from every branch I have checked out
  — i.e. a fix can be live-applied against the shared DB from a branch that never touched mine.
  Read the file's content (`git show <branch>:<path>`) before assuming a collision is even
  relevant to the current task: confirmed R26 does not touch `AD_User.Email` (it is
  `EM_ETGO_Is_Owner` + personal-role composition only), so it does not conflict with this
  session's L2 fix. **Apply generally:** before picking a new `Rn`/timestamp, check
  `git branch -a` for ANY branch (not just local history) touching
  `cli/src/data-fixes/sql/`, and cross-check the live ledger's `fix_id` column too — a fix can be
  `APPLIED` on the shared DB before its file ever reaches your branch.
- **2026-08-27 — Corrective-only-for-the-CUT, preventive-shipped-elsewhere is a real,
  recurring, VALID shape — do not reflexively bump `ONBOARDING_PROVISIONED_THROUGH` to match a
  new fix's own timestamp just because its OWN preventive front shipped in the same PR.** R28's
  preventive front (`applyClientAdminEmail`) is real and already merged into this branch, but the
  CUT sat at R23 (`2026-08-11T12:00:00Z`) with FOUR later fixes (R24×2, R25×2 — the L1
  owner-flag/R26/R27 pair is a 5th, all unmerged) never individually re-verified this session to
  each have their own confirmed preventive parity. Bumping the single shared CUT past all of them
  to match R28's timestamp would risk silently skipping any ONE of theirs for a brand-new tenant
  if it turns out to be corrective-only — the exact failure mode the framework's "never bump CUT
  without confirming every intervening fix's parity" rule exists to prevent. Decision: ship the
  `.sql` + preventive together, leave the CUT untouched. Per the framework's own trade-off table
  this is always safe (new tenant's `@check` is a cheap no-op skip) — merely redundant, never
  incorrect. Mirrors the ETP-4743/R22 precedent exactly, just with preventive/corrective ordering
  swapped (there: corrective + CUT bump, preventive shipped earlier separately; here: preventive
  shipped in-branch, corrective ships without a CUT bump because of UNRELATED intervening fixes,
  not because R28 itself lacks one).
- **2026-08-27 — Doc-drift found: `onboarding-and-datafixes-map.md`'s own gap-pairing table
  already has an `L1` (bank-statement stale status, ETP-4891, `R25`) that collides with
  `onboarding-gaps.md`'s EARLIER, independent `L1` ("Tenant Ownership", ETP-4830/ETP-4877) — two
  unrelated gaps sharing one label because neither doc's author cross-checked the other's
  `L`-series before assigning it.** Not renamed (would break existing shipped `.sql` `@gap:`
  header references) — flagged inline in both docs instead. **Apply:** when adding any new gap
  letter/number, grep BOTH `onboarding-gaps.md` (`^### [A-Z][0-9]`) AND
  `onboarding-and-datafixes-map.md` (`\*\*[A-Z][0-9]+\*\*`) for the next free label, not just the
  doc you happen to be editing.
