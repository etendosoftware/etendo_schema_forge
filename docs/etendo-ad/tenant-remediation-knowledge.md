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
