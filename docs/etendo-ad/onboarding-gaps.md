# Etendo GO — Onboarding Gaps When Creating a New Client

These are field-validation findings from creating a new client/org (`TaxesOrg`) to validate the invoice flow and system-level taxes (`c_tax.ad_client_id='0'`) in Etendo GO. Creating a client from the UI leaves several areas unconfigured, which leave the client unable to complete or post documents. Each finding below has: **Symptom → Root cause → SQL fix → Where it should be fixed in the onboarding flow.** Note that in production the accounting gaps (A1/A2) are intended to be solved by the *Initial Organization Setup* process — see `../proposals/initial-organization-setup-accounting.md`.

## Summary

| ID | Area | Symptom (short) | Where it should be fixed | Ticket |
|----|------|-----------------|--------------------------|--------|
| A1 | Accounting | Posting fails — chart of accounts missing | *Initial Organization Setup* / SQL clone | — |
| A1b | Accounting | Posting account codes are < 8 digits; ETP-4247 feature fails | Onboarding sampledata XML (`C_ELEMENTVALUE.xml`) — pad codes to 8 digits | ETP-4247 |
| A2 | Accounting | "Account Not Defined" even with ledger present | *Initial Organization Setup* — auto-populate `*_acct` tables | — |
| A3 | Accounting | Schema not predefined (Allow Negatives/Centrally Maintained=N); only 5 of 8 dimensions enabled (Cost Center/User1/User2 missing) | Onboarding sampledata XML (`C_ACCTSCHEMA.xml`, `C_ACCTSCHEMA_ELEMENT.xml`) — dataset-only, no new service | ETP-4245 |
| A3b | Accounting | `C_ACCTSCHEMA_DEFAULT` Defaults tab: 6 of 15 accounts NULL (doubtful debt, bad-debt expense/revenue, allowance for doubtful debt, deferred product expense/revenue) | Onboarding sampledata XML (`C_ACCTSCHEMA_DEFAULT.xml`) — dataset-only, no new service | ETP-4245 |
| A4 | Accounting | `A_Amortization` table (`AD_Table_id 800060`) inactive on `c_acctschema_table` — amortization documents cannot post | Onboarding sampledata XML (`C_ACCTSCHEMA_TABLE.xml`) — dataset-only, no new service | ETP-4452 |
| A2b | Accounting | Posting a Goods Receipt fails with generic "Account could not be found." — `C_BP_Group_Acct.NotInvoicedReceipts_Acct` stuck NULL on one stale pre-existing row (GOClient "Cliente" group) | Corrective-only data-fix (`R17`) — CONFIRMED no preventive gap: current onboarding code already wires this column correctly for every group created today | ETP-4706 |
| A2b (generalized) | Accounting | Same stale-row class of drift, generalized to the other 11 `*_acct` columns on `C_BP_Group_Acct`; 4 of them (`DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/`BadDebtRevenue_Acct`/`AllowanceForDoubtful_Acct`) turned out to be an ONGOING preventive gap too — neither the core `c_bp_group_trg()` trigger nor `BP_GROUP_ACCT_SQL` ever populated them | Both fronts closed (`R21` corrective + `OnboardingAccountingWiringService#patchBpGroupAcctMissingColumns` preventive) | ETP-4720 |
| A2c | Accounting | `FIN_Financial_Account_Acct` / `M_Warehouse_Acct` missing entirely for already-onboarded tenants — both source tables are bulk-imported with triggers disabled, so their native `_trg` triggers never provisioned the posting-account rows | Preventive already shipped (ETP-4565, `OnboardingAccountingWiringService`); corrective data-fix (`R22`) backfills legacy tenants; CUT bumped to close the loop | ETP-4743 |
| A2d | Accounting | 24 of F&B International Group's 26 `c_acctschema` rows have NO `c_acctschema_default` row at all — a prerequisite gap that blocks R22 (and any other `*_acct` fix keyed on `c_acctschema_default`) from ever reaching those schemas | Not yet fixed — discovered as a side-effect of QA'ing R22; flagged for follow-up, not in scope for ETP-4743 | — (follow-up, found during ETP-4743 QA) |
| A5 | Accounting | `C_Element` tree missing its root `AD_TreeNode` — new top-level posting accounts fail with an `ad_tree_id` NOT NULL violation | Corrective SQL data-fix (`R9b`) — root cause of the underlying duplicate-tree event not yet found | — |
| B1 | Organization hierarchy | "Lines org does not depend on header org" on same-org invoice | *Set Organization as Ready* — populate `AD_ORG_TREE` | — |
| C1 | Period control | *Open/Close Period Control* is empty; posting fails (no open periods) | Set `isperiodcontrolallowed` and calendar fields before creating periods | — |
| C2 | Period control | `c_periodcontrol` rows not created by trigger | Set `isperiodcontrolallowed='Y'` and `ad_inheritedcalendar_id` before creating periods | — |
| D1 | Legal entity | SII fields empty; legal-entity resolution returns NULL | *Initial Client Setup* — verify/recompute `AD_LegalEntity_Org_ID` after `AD_Org_Ready` | ETP-4177 |
| E1 | Session / user | Session org stuck at `*`; handlers look in org `'0'` | Onboarding — set `AD_User.ad_org_id` to tenant org at user creation | — |
| H3 | Costing | Goods Receipt posting fails: "cost of product X has not been calculated" — a product with zero `M_Costing` history whose earliest transaction (by `TrxProcessDate`, not `MovementDate`) is an outbound movement halts the ENTIRE org-wide Average-Cost background queue for every product processed after it | Not an onboarding gap — recurs for any product shipped before ever received, at any point in a tenant's life, not just at birth; recommend a real-time Shipment-flow guard (separate ticket) instead of an onboarding step | ETP-4736 |
| I1 | Inventory / Warehouse | Locators born with inventory status "Undefined-OverIssue" (allows negative stock) | Onboarding sampledata XML (`M_LOCATOR.xml`) — dataset-only, no new service | ETP-4761 |
| J1 | Costing | New tenants get ZERO `M_Costing_Rule` rows (not Average, NOTHING) — `M_Transaction.iscostcalculated` stuck `'N'` forever | `M_COSTING_RULE` added to `OnboardingDatasetDefinition.INCLUDED_TABLES`; sample row fixed to Standard algorithm | ETP-4760 |
| K1 | Accounting dimension display | `AD_Client.Acctdim_Centrally_Maintained` hardcoded to `'Y'` for every new client, permanently routing dimension-field visibility through a fine-grained matrix Etendo GO has no screen for, making the "Dimensiones contables" screen a no-op | `OnboardingAcctdimCentrallyMaintainedService` — backfill `C_AcctSchema_Element.isactive` then flip the flag to `'N'` | ETP-4854 |
| L1 | Tenant ownership | New `AD_User.EM_ETGO_Is_Owner` column (owner-lock enforcement) is only auto-set for tenants created AFTER ETP-4830 shipped — every pre-existing tenant has zero owner-flagged users, so the enforcement checks are silent no-ops for them | Preventive shipped (`OwnerSupport#markAsOwnerIfNoneExists`, wired into `EtendoGoJwtServlet#createClient`); corrective backfill data-fix NOT yet written — Remedy's domain, heuristic not yet human-confirmed | ETP-4830 |

> **Label history note:** the ETP-4736 costing gap above was originally mislabeled `H1` when
> authored, colliding with the pre-existing `H1` (webhook access, ETP-4520, superseded) and `H2`
> (roles provisioning, ETP-4515/4516) below in **§H** — `H` was not actually a fresh series. Corrected
> to `H3` (2026-08-03) across the SQL header, regression test, this table, and the
> `onboarding-and-datafixes-map.md`/`tenant-remediation-knowledge.md` references. No functional impact
> either way — `@gap` is a documentation/categorization tag only, never stored in
> `ETGO_DATA_FIX_HISTORY` or read by the runner.

---

## A — Accounting

### A1 — Incomplete chart of accounts (General Ledger)

**Symptom:** posting fails — no accounts are defined for the new client.

**Root cause:** The UI only creates the ledger (`c_acctschema`) and the mapping table (`c_acctschema_table`). Everything else is left empty.

| Table | Purpose | Auto-created? |
|---|---|---|
| `c_acctschema` | The ledger | ✅ (user creates) |
| `c_acctschema_table` | Which tables post here | ✅ automatic |
| `c_element` | Account tree | ❌ |
| `c_elementvalue` | Tree accounts (~1790) | ❌ |
| `c_validcombination` | Accounting combinations | ❌ |
| `c_acctschema_element` | Dimensions (Org, Account, BP, etc.) | ❌ |
| `c_acctschema_gl` | GL accounts (suspense, clearing, income) | ❌ |
| `c_acctschema_default` | Default accounts per document type | ❌ |

**Where it should be fixed:** In production, use Etendo's *Initial Organization Setup* process. For dev/testing, clone the GOOrg client structure via SQL:

> **Schema note (verified against core `C_ELEMENT.xml`):** `c_element` has **no** `balancingfactor` column (it is `ISBALANCING`) and **no** `c_acctschema_id` column — the schema↔element link lives in `c_acctschema_element`. Resolve the source element via the AC dimension of the source schema, not a direct FK on `c_element`.

```sql
-- 1. Create c_element for the new client.
-- (Source element is the one wired to the source schema's AC dimension.)
INSERT INTO c_element (c_element_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, name, description, elementtype, isbalancing)
SELECT upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  e.name, e.description, e.elementtype, e.isbalancing
FROM c_element e
JOIN c_acctschema_element ase ON ase.c_element_id = e.c_element_id
WHERE ase.c_acctschema_id = '<SOURCE_SCHEMA_ID>' AND ase.elementtype = 'AC';

-- 2. Copy ALL accounts from the source tree (not just the ~30 referenced ones).
-- The NOT EXISTS guard makes this re-runnable despite the C_ELEMENTVALUE_VALUE
-- UNIQUE(c_element_id, value) constraint.
INSERT INTO c_elementvalue (c_elementvalue_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, value, name, description, accounttype,
  accountsign, isdoccontrolled, c_element_id, issummary, postactual, postbudget,
  postencumbrance, poststatistical, isbankaccount, isforeigncurrency, showelement,
  showvaluecond, elementlevel, isalwaysshown)
SELECT upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  ev.value, ev.name, ev.description, ev.accounttype, ev.accountsign,
  coalesce(ev.isdoccontrolled,'N'), '<NEW_ELEMENT_ID>',
  ev.issummary, ev.postactual, ev.postbudget, ev.postencumbrance, ev.poststatistical,
  coalesce(ev.isbankaccount,'N'), coalesce(ev.isforeigncurrency,'N'),
  coalesce(ev.showelement,'Y'), ev.showvaluecond, ev.elementlevel, ev.isalwaysshown
FROM c_elementvalue ev
WHERE ev.c_element_id = '<SOURCE_ELEMENT_ID>'
  AND NOT EXISTS (
    SELECT 1 FROM c_elementvalue x
    WHERE x.c_element_id = '<NEW_ELEMENT_ID>' AND x.value = ev.value
  );
```

> Common mistake: cloning only the ~30 accounts referenced by the source ledger in `c_acctschema_gl` and `c_acctschema_default`. The full GOOrg tree has 1790 accounts — copy them all.

**Default account for the Account (AC) dimension:** The ledger's `AC` dimension has an "Account" field that must point to the chart's default account (`90030` in GOOrg). Without it, posting fails.

```sql
-- Get the ID of account 90030 for the new client
SELECT c_elementvalue_id FROM c_elementvalue
WHERE ad_client_id = '<NEW_CLIENT_ID>' AND value = '90030';

-- Assign it to the AC dimension
UPDATE c_acctschema_element
SET c_elementvalue_id = '<EV_ID_90030>'
WHERE c_acctschema_id = '<SCHEMA_ID>' AND elementtype = 'AC';
```

See also: **§A1b** for the related 8-digit account-code padding requirement (ETP-4247) — a separate gap closed on both fronts.

---

### A1b — Posting account codes shorter than 8 digits (ETP-4247)

**Symptom:** The Chart of Accounts feature (ETP-4247) requires all numeric posting account codes to be exactly 8 digits. On tenants onboarded before 2026-06-26 the codes are 5 digits (e.g. `10000`), causing the feature to reject or mis-display them.

**Root cause:** The GOClient sampledata (`C_ELEMENTVALUE.xml`) shipped posting account codes (`issummary='N'`, purely numeric `value`) at 5 digits. Group accounts (`issummary='Y'`, 3 and 4 digits) are structural hierarchy nodes and are intentionally left at their natural length — padding them would cause UNIQUE(c_element_id, value) constraint violations (1,140 collision groups confirmed: `100`, `1000`, and `10000` all pad to `10000000` under the same element).

**Both fronts closed (2026-06-26):**

| Front | Deliverable |
|---|---|
| **Corrective** | `cli/src/data-fixes/sql/20260626T120000Z__R8-account-codes-8digits.sql` — pads 1312 posting-account rows for existing tenants |
| **Preventive** | `referencedata/sampledata/GOClient/C_ELEMENTVALUE.xml` updated — 1312 rows padded to 8 digits; `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-06-26T12:00:00Z` in `OnboardingBaselineService.java` |

**SQL fix (corrective guard — idempotent):**
```sql
-- @check
SELECT 1 FROM c_elementvalue
WHERE ad_client_id = :client_id
  AND issummary = 'N'
  AND value ~ '^[0-9]+$'
  AND LENGTH(value) < 8
LIMIT 1;

-- @apply
UPDATE c_elementvalue
SET    value = RPAD(value, 8, '0')
WHERE  ad_client_id = :client_id
  AND  issummary = 'N'
  AND  value ~ '^[0-9]+$'
  AND  LENGTH(value) < 8;
```

---

### A3 — Accounting schema not fully predefined; only 5 of 8 dimensions enabled (ETP-4245)

**Symptom (Confluence Test Plan "Contabilidad | Test Plan", Group 10):**
- **TC-38** expects the schema ("Esquema GO") to ship with Allow Negatives=Yes and Centrally Maintained=Yes. It shipped with both **`N`**.
- **TC-40** expects all 8 accounting dimensions present on the schema's Dimensions tab: Organization + Account mandatory, and Project, Bus.Partner, Product, **Cost Center, User1, User2** enabled (non-mandatory). Only **5 of 8** existed — Cost Center (`CC`), User1 (`U1`), User2 (`U2`) were entirely absent from `C_ACCTSCHEMA_ELEMENT.xml`.

**Root cause:** `referencedata/sampledata/GOClient/C_ACCTSCHEMA.xml` shipped `ALLOWNEGATIVE=N` / `ISCENTRALLYMAINTAINED=N`, and `C_ACCTSCHEMA_ELEMENT.xml` only ever carried 5 `<C_ACCTSCHEMA_ELEMENT>` rows (`OO`, `AC`, `PJ`, `BP`, `PR`) for schema `C06B100312FA48159DB36B9A4B461019` — `CC`/`U1`/`U2` were never authored, on any prior gap-remediation pass (A1/A2/B1/B2 never touched this table's row *content*, only its table-level inclusion in `OnboardingDatasetDefinition.INCLUDED_TABLES`, which was already correct). Verified live against GOClient (`localhost:5416/etendogoclean`) both via direct DB query and by reading the shipped XML — the two matched exactly (no drift between dataset and DB).

**Why this is dataset-only (no `Onboarding*Service` needed):** both tables are already in `INCLUDED_TABLES`, and neither `OnboardingAccountingWiringService` nor any other onboarding code references specific `elementtype` values or `c_acctschema` flags — they flow straight from the imported XML with zero code involvement. This mirrors the ETP-4341 "dataset-only provisioning" pattern (payment methods/terms) documented in `onboarding-and-datafixes-map.md` §1. **Decision:** no new Java service; only edit the sampledata XML + bump the CUT.

**Both fronts closed (2026-07-06):**

| Front | Deliverable |
|---|---|
| **Corrective** | `cli/src/data-fixes/sql/20260706T120000Z__R10-accounting-schema-dimensions.sql` — flips the flags and inserts the 3 missing `C_ACCTSCHEMA_ELEMENT` rows for existing tenants. Live-validated on GOClient: `WOULD_APPLY` (dry-run) → `APPLIED (4 rows)` (real run) → `SKIPPED_NOT_NEEDED — kept prior success state` (re-run, proving idempotency). |
| **Preventive** | `C_ACCTSCHEMA.xml` (`ALLOWNEGATIVE`/`ISCENTRALLYMAINTAINED` → `Y`) + `C_ACCTSCHEMA_ELEMENT.xml` (+3 rows: `CC`/`Cost Center`/seqno 60, `U1`/`User 1`/seqno 70, `U2`/`User 2`/seqno 80, all non-mandatory/unbalanced/client-level, new UUIDs via `make uuid`); `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-07-06T12:00:00Z` in `OnboardingBaselineService.java`. Regression-guarded by two new tests in `OnboardingDatasetNormalizerTest.java` (`testNormalizerIncludesAllEightAccountingDimensions`, `testNormalizerAccountingSchemaIsPredefinedForPosting`). |

**Naming collision note:** a sibling in-flight branch (`feat/bp-category-preventive`, ETP-4402) had already claimed the `R9` label (`20260701T120000Z__R9-bp-category-seed.sql`, not yet merged at the time of this fix) and bumped the same CUT constant to `2026-07-01T12:00:00Z`. This fix uses `R10` and `2026-07-06T12:00:00Z` to avoid an `@id`/CUT collision — **always check `git rev-list --all` across ALL local branches/worktrees for existing `Rn` labels before naming a new fix, not just your own branch's `sql/` directory**, since the shared dev DB may already have sibling-branch fixes applied. Expect (and correctly resolve, keeping the later timestamp) a merge conflict on the single `ONBOARDING_PROVISIONED_THROUGH` line when the two branches converge.

**SQL fix (corrective guard — idempotent):**
```sql
-- @check
SELECT 1
FROM c_acctschema s
WHERE s.ad_client_id = :client_id
  AND (
    s.allownegative = 'N'
    OR s.iscentrallymaintained = 'N'
    OR EXISTS (
      SELECT 1 FROM (VALUES ('CC'), ('U1'), ('U2')) AS dim(elementtype)
      WHERE NOT EXISTS (
        SELECT 1 FROM c_acctschema_element ae
        WHERE ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = dim.elementtype
      )
    )
  )
LIMIT 1;

-- @apply
UPDATE c_acctschema
SET allownegative = 'Y', iscentrallymaintained = 'Y', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id AND (allownegative = 'N' OR iscentrallymaintained = 'N');

INSERT INTO c_acctschema_element (c_acctschema_element_id, isactive, created, createdby, updated,
  ad_org_id, updatedby, c_acctschema_id, elementtype, name, seqno, c_element_id, ad_client_id,
  ismandatory, isbalanced, org_id, c_elementvalue_id, m_product_id, c_bpartner_id, c_location_id,
  c_salesregion_id, c_project_id, c_campaign_id, c_activity_id)
SELECT get_uuid(), 'Y', now(), '0', now(), '0', '0',
       s.c_acctschema_id, dim.elementtype, dim.name, dim.seqno, null, :client_id, 'N', 'N',
       null, null, null, null, null, null, null, null, null
FROM c_acctschema s
CROSS JOIN (VALUES ('CC','Cost Center',60), ('U1','User 1',70), ('U2','User 2',80))
  AS dim(elementtype, name, seqno)
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM c_acctschema_element ae
    WHERE ae.c_acctschema_id = s.c_acctschema_id AND ae.elementtype = dim.elementtype
  );
```

**Verification of the OTHER Group-10 test cases against live GOClient (2026-07-06) — all pre-existing, no fix needed:**

| TC | Result | Detail |
|---|---|---|
| **TC-39** (Tables tab) | ⚠️ Gap found (A4, ETP-4452, 2026-07-08) — since fixed | All 11 previously-checked tables (`C_Invoice`→`Invoice`, `FIN_Payment`, `FIN_BankStatement`, `FIN_Finacc_Transaction`, `FIN_Reconciliation`, `GL_Journal`→`FinancialMgmtGLJournal`, `M_InOut`→`MaterialMgmtShipmentInOut`, `M_Inventory`→`MaterialMgmtInventoryCount`, `M_MatchInv`→`ProcurementReceiptInvoiceMatch`, `M_Movement`→`MaterialMgmtInternalMovement`, `M_Production`→`MaterialMgmtProductionTransaction`) are `isactive='Y'` on `c_acctschema_table`. **A 12th table, `A_Amortization`→`FinancialMgmtAmortization` (`AD_Table_id 800060`), was missed by this checklist** — GOClient's live row had been hand-patched to `'Y'` but the bundled dataset still shipped `'N'` (and 3 other PGC-chart tenants were live-`'N'` too). See gap **A4** below. Treat this as "12 required tables" going forward. |
| **TC-41** (Defaults tab) | ⚠️ Partial — flagged, NOT changed | Customer Receivable=43000 ✓, Vendor Payable=40000 ✓, Bank Asset=57200 ✓ all match. **Tax Credit ("VAT Receivable") = 47200, Tax Due ("VAT Payable") = 47700 — NOT 47000/47500 as stated in the test plan.** These are the standard Spanish PGC codes for ongoing input/output VAT (472 = IVA soportado, 477 = IVA repercutido); 4700/4750 are the period-END settlement accounts ("Hacienda deudora/acreedora por IVA"), a different concept. TC-43's real posted invoice confirms 47700 is the live, correctly-functioning value (see below) — this reads as a test-plan documentation discrepancy, not a system bug. **Deferred — out of scope for ETP-4245** (dimensions + schema-predefinition ask only); flag for product/accounting owner (see "Jorge's list" reference in the remediation plan) before changing any account-default mapping. |
| **TC-42** (Product category accounts, "Bebidas") | ⚠️ Partial — flagged, NOT changed | Revenue=70000 ✓, Expense=60000 ✓ match. **Asset=35000 (Finished Goods), NOT 30000 (Merchandise) as stated.** This is a per-category business classification choice (is Bebidas manufactured or purchased merchandise?), not an onboarding-provisioning gap — deferred for the same reason as TC-41. |
| **TC-43** (Posting) | ✅ Already correct | A completed+posted sales invoice with a Bebidas product (`documentno=10000016`) posts with zero "Account Not Defined" errors: debits `43000000` (Clientes), credits `70000000` (Ventas) + `47700000` (IVA repercutido), balanced (27.83 = 23.00 + 4.83). |

See also: `docs/plans/onboarding-gaps-remediation-plan.md` §"Gap A3" for the full investigation notes, and `docs/etendo-ad/tenant-remediation-knowledge.md` for the durable facts extracted from this pass.

### A3b — `C_ACCTSCHEMA_DEFAULT` "Defaults tab" incomplete — Jorge's list (ETP-4245 follow-up, 2026-07-06)

**Symptom:** TC-41 in the A3 pass above only cross-checked 5 of the 15 "Defaults tab" fields and
deferred the rest pending a fuller reference ("Jorge's list of extra default accounts"). That list
arrived 2026-07-06 for client "LadyPipa" (used as the visual reference; the actual remediation
target is GOClient) — 10 Tercero (Third Party) fields + 5 Producto (Product) fields, shown as
10-digit codes in the classic "Valores por defecto" tab.

**Root cause:** same class of gap as A2/A3 — the per-schema `c_acctschema_default` row is populated
piecemeal across passes (A1's clone step wired ~9 columns; nothing had touched the other 6).

**FK indirection gotcha (new — not documented before this pass):** `C_ACCTSCHEMA_DEFAULT`'s `*_acct`
columns are **not** a direct FK to `c_elementvalue`. They point to **`C_VALIDCOMBINATION`** (the
account + dimension combination row), whose own `account_id` then points to `c_elementvalue`. Every
populated column in GOClient resolves to a combination with **every optional dimension column NULL**
(an "unbalanced", dimensionless posting combination), scoped to the tenant's own `c_acctschema_id`.
Any fix touching these columns must resolve through `c_validcombination`, not `c_elementvalue`
directly — a raw `c_elementvalue_id` will not satisfy the FK.

**Numeric convention confirmed:** the screenshot's 10-digit codes map to GOClient's real 8-digit
codes by dropping the trailing 2 zeros — the same convention already established by A1b
(`R8-account-codes-8digits`). Verified individually for all 15 accounts by resolving each
`c_validcombination_id` → `c_elementvalue.value` and cross-checking the account name/description
against the screenshot's Spanish label (not just mechanical truncation).

**Leaf-existence check (R9 precedent applied — no new chart account was needed):** R9
(`bp-category-seed`) established the pattern that a target account referenced by a data-fix might
not actually exist as a `c_elementvalue` leaf and would need to be minted first. Applied that check
here: queried `c_elementvalue` directly (not just `c_validcombination`) for all 15 target codes —
`SELECT value, name, issummary, isactive FROM c_elementvalue WHERE ad_client_id = '802509E12436405C86BA1FD5B1DF508C' AND value = ANY(ARRAY['43600000','69400000','79400000','49000000','48000000','48500000','43000000','43800000','40000000','40700000','40090000','35000000','60000000','70000000'])`.
All 14 unique codes (69400000 is shared by two labels) returned a row with `issummary='N'` and
`isactive='Y'` — every target account, including all 6 previously-NULL ones, already existed as a
real, active, posting-level leaf in GOClient's chart. **No R9-style `c_elementvalue` mint was
required**; R11 only had to wire existing `c_validcombination` FKs into `c_acctschema_default`.

**Full mapping (verified live against GOClient `802509E12436405C86BA1FD5B1DF508C`, 2026-07-06):**

| Spanish label (screenshot) | `c_acctschema_default` column | Account value (8-digit) | Account name | State before fix |
|---|---|---|---|---|
| Recibos de clientes * | `c_receivable_acct` | `43000000` | Clientes (euros) a corto plazo | ✅ already correct |
| Prepago del cliente | `c_prepayment_acct` | `43800000` | Anticipos de clientes | ✅ already correct |
| Cancelaciones * (Write-off) | `writeoff_acct` | `65000000` (was `69400000`) | Pérdidas de créditos comerciales incobrables | ⚠️ **corrected 2026-07-08 by R12** — see override history below |
| Pasivo del proveedor * | `v_liability_acct` | `40000000` | Proveedores (euros) a corto plazo | ✅ already correct |
| Pagos por adelantado del proveedor | `v_prepayment_acct` | `40700000` | Anticipos a proveedores | ✅ already correct |
| Recibos no facturados | `notinvoicedreceipts_acct` | `40090000` | Proveedores facturas pendientes de recibir o de formalizar | ✅ already correct |
| Cuenta de dudoso cobro | `doubtfuldebt_acct` | `43600000` | Clientes de dudoso cobro a corto plazo | ❌ **was NULL — fixed** |
| Cuenta de gastos de dudoso cobro | `baddebtexpense_acct` | `69400000` | Pérdidas por deterioro de créditos por operaciones comerciales | ❌ **was NULL — fixed** (same account as write-off) |
| Cuenta de ingresos de dudoso cobro | `baddebtrevenue_acct` | `79400000` | Reversión del deterioro de créditos por operaciones comerciales | ❌ **was NULL — fixed** |
| Cuenta de provisión para dudoso cobro | `allowancefordoubtful_acct` | `49000000` | Deterioro de valor de créditos por operaciones comerciales a corto plazo | ❌ **was NULL — fixed** |
| Inmovilizado del producto * | `p_asset_acct` | `35000000` | Productos terminados A | ✅ already correct |
| Gastos del producto * | `p_expense_acct` | `60000000` | Compras de mercaderías | ✅ already correct |
| Ingresos por el producto * | `p_revenue_acct` | `70000000` | Ventas de mercaderías | ✅ already correct |
| Gasto de producto a periodificar | `p_def_expense_acct` | `48000000` | Gastos anticipados | ❌ **was NULL — fixed** |
| Ingreso de producto a periodificar | `p_def_revenue_acct` | `48500000` | Ingresos anticipados | ❌ **was NULL — fixed** |

`*` = required field on the classic UI. Source: "Jorge's list", verified 2026-07-06.

**Write-off override history (superseded — final value is `65000000`, ETP-4452/R12, 2026-07-08):**
on 2026-07-06 the product owner explicitly confirmed the DB's existing value (`69400000`,
"Pérdidas por deterioro de créditos por operaciones comerciales") was correct and should NOT be
changed to the screenshot's `65000000` ("Pérdidas de créditos comerciales incobrables"). R11's
`@check`/`@apply` never referenced `writeoff_acct` for that reason. On 2026-07-07 the product owner
**reconfirmed, again explicitly, that `65000000` IS the correct value** — reversing the earlier
decision. The corrective data-fix `cli/src/data-fixes/sql/20260708T090000Z__R12-writeoff-account-override.sql`
implements this: live-verified on GOClient, acreedortest, acreetest2 and empresa (the 4 tenants on
the GOClient-style PGC chart) — `writeoff_acct` now resolves to `c_validcombination`
`CB7E1B51B897403083CDCA20835F6AE9` = account `65000000` on GOClient (each tenant has its own
combination id for the same account). F&B International Group, QA Testing and TaxesOrg run
unrelated (US-chart) schemas with no `65000000` account at all — R12's `@check` naturally excludes
them, no client allowlist needed. Preventive twin: `C_ACCTSCHEMA_DEFAULT.xml`'s `WRITEOFF_ACCT`
updated to GOClient's own `65000000` combination id; `ONBOARDING_PROVISIONED_THROUGH` bumped to
`2026-07-08T09:00:00Z`.

**Both fronts closed (2026-07-06):**

| Front | Deliverable |
|---|---|
| **Corrective** | `cli/src/data-fixes/sql/20260706T160000Z__R11-acctschema-default-completion.sql` — 6 guarded `UPDATE`s (one per NULL column), each resolving its target account through `c_validcombination` (dimensionless combo) and gated by `col IS NULL AND EXISTS(...)`. Live-validated on GOClient: dry-run → `WOULD_APPLY`; real run → `APPLIED (6 rows)`; re-run → `SKIPPED_NOT_NEEDED — kept prior success state`. |
| **Preventive** | `referencedata/sampledata/GOClient/C_ACCTSCHEMA_DEFAULT.xml` gains the 6 FK values (table already in `INCLUDED_TABLES` since the A1 pass; no onboarding Java references these specific columns — confirmed by grep). `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-07-06T16:00:00Z` in `OnboardingBaselineService.java`. Regression-guarded by a new test in `OnboardingDatasetNormalizerTest.java` (`testNormalizerIncludesAcctSchemaDefaultDoubtfulDebtAndDeferredAccounts`), which also asserts the write-off value is unchanged. |

See also: `docs/plans/onboarding-gaps-remediation-plan.md` §"Gap A3b" for the full investigation
notes, and `docs/etendo-ad/tenant-remediation-knowledge.md` for the durable facts (FK indirection via
`C_VALIDCOMBINATION`, write-off override) extracted from this pass.

---

### A2 — Missing accounting mapping tables (`*_acct`)

**Symptom:** posting fails with **"Account Not Defined"** even when the ledger is correctly configured.

**Root cause:** The initial setup does not populate the per-schema accounting-default rows. These tables should be populated from `c_acctschema_default` when the client is created:

- `c_bp_group_acct` — one row per business-partner group × schema
- `m_product_category_acct` — one row per product category × schema
- `c_bp_customer_acct` — one row per customer BP × schema
- `c_bp_vendor_acct` — one row per vendor BP × schema
- `m_product_acct` — one row per product × schema

**Where it should be fixed:** the onboarding process — at client creation these tables should be auto-populated from the schema defaults. Note: with these populated, tax accounting is independent per client (supports the system-level taxes approach).

**Cross-link:** this is exactly what the `../proposals/initial-organization-setup-accounting.md` proposal aims to automate. The proposal's wiring step (`applyAccountingPackageWiring`) and package-completeness validation (`validateAccountingPackage`) together ensure these tables are populated before `AD_Org_Ready` is called.

---

### A2b — `C_BP_Group_Acct.NotInvoicedReceipts_Acct` stuck NULL on a stale pre-existing row (ETP-4706, 2026-07-29)

**Symptom:** `Contabilizar` (post) on a purchase Goods Receipt fails with a generic `422`:
```json
{"success":false,"message":"Account could not be found."}
```
Server log (NEO just proxies this through):
```
WARN  AcctServer - getAccount - NO account Type=51, Record=<inout id>
ERROR AcctServer - No Account Not Invoiced Receipts for product: <product> in accounting schema: <schema>
```

**Root cause — NOT a product/product-category gap (ticket's original diagnosis corrected).**
`AcctType=51` is `AcctServer.ACCTTYPE_NotInvoicedReceipts`, resolved by
`AcctServer_data.xsql#selectNotInvoicedReceiptsAcct`:
```sql
SELECT NotInvoicedReceipts_Acct FROM C_BP_Group_Acct a, C_BPartner bp
WHERE a.C_BP_Group_ID = bp.C_BP_Group_ID AND bp.C_BPartner_ID = ? AND a.C_AcctSchema_ID = ?
```
This is resolved **entirely by the transaction's Business Partner → its BP Group** — never by the
product or product category, even though the error message text happens to name the product.
Confirmed via `information_schema.columns` that neither `M_Product_Category_Acct` nor
`M_Product_Acct` has a not-invoiced-receipts column at all — those tables cannot be the fix target.

**Live-DB diagnosis (GOClient, client `802509E12436405C86BA1FD5B1DF508C`, schema "Esquema GO"
`C06B100312FA48159DB36B9A4B461019`):** the repro's Goods Receipt (`36DEE37DA9EA4A54A01B2D313EDFE636`)
uses BP `6BD084B9C1744044B9691AD373F96A93` ("Tercero España"), whose group is "Cliente"
(`DBBD00C9E0B9442188FCDDA3F601DAEA`, the group renamed from "Consumidor Final" by ETP-4402). That
group's `C_BP_Group_Acct` row for this schema has `notinvoicedreceipts_acct = NULL`, while
`C_AcctSchema_Default.notinvoicedreceipts_acct` on the same schema **is** populated
(`6E9DA718417A48A290FE376448A12BF6`). The row's `created` timestamp is `2026-04-07 14:59:32` — well
before the tenant's current account defaults were fully settled — and the onboarding insert
(`OnboardingAccountingWiringService#provisionEntityPostingAccounts`, `BP_GROUP_ACCT_SQL`) is guarded
by `NOT EXISTS` at the **row** level: once *any* row exists for `(group, schema)` it is never
revisited, so a column added/defaulted after the row's creation stays permanently NULL on it. The
sibling "Proveedor" and "Acreedor" groups on the same tenant/schema already have this column set.

**Scope — swept the whole fleet, confirmed corrective-only (no preventive front needed):** every
other `C_BP_Group_Acct` row on this DB, across every other tenant — including tenants onboarded via
the **current** onboarding code the same day this was diagnosed (e.g. "Empresa E2E d5be89a8",
onboarded 2026-07-29) — already has `notinvoicedreceipts_acct` populated. A brand-new tenant is NOT
born with this gap; only this one pre-existing GOClient row is affected. Per the "Boundary" rule in
`../etendo-ad/onboarding-and-datafixes-map.md` §0, this ships corrective-only, stated explicitly.
`ONBOARDING_PROVISIONED_THROUGH` is deliberately NOT bumped — there is no preventive change to gate.

**Also found, explicitly OUT OF SCOPE for this ticket (flagged, not fixed here):** the SAME "Cliente"
row also has `notinvoicedrevenue_acct`, `notinvoicedreceivables_acct`, `unearnedrevenue_acct`,
`paydiscount_exp_acct`, `paydiscount_rev_acct`, `writeoff_rev_acct`, `v_liability_services_acct`,
`doubtfuldebt_acct`, `baddebtexpense_acct`, `baddebtrevenue_acct` and `allowancefordoubtful_acct` all
NULL — the same stale-row class of drift, just for other account types on the identical row. ETP-4706
explicitly scoped itself to Not-Invoiced-Receipts only; a follow-up ticket should decide whether to
generalize R17 into a "resync every NULL `*_acct` column against the schema default" fix for this row
(and any other row like it) rather than one column at a time.
**RESOLVED by ETP-4720 (2026-08-05) — see the "A2b (generalized)" section immediately below.**

**Fix:** `cli/src/data-fixes/sql/20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql` —
single guarded `UPDATE`, scoped to `:client_id`, backfilling `notinvoicedreceipts_acct` from
`c_acctschema_default` wherever the group row has it NULL and the schema has a value to source from.
Verified live in a rolled-back transaction on GOClient (`BEFORE: NULL` → `AFTER:
6E9DA718417A48A290FE376448A12BF6`; re-check matches 0 rows).

**Related hygiene fix (different repo, same stale row):** the static
`referencedata/sampledata/GOClient/C_BP_GROUP_ACCT.xml` dump in `com.etendoerp.go` carried this exact
row (`C_BP_GROUP_ACCT_ID 69081038A3AC421AB8DB93A096D58D57`) with `NOTINVOICEDRECEIPTS_ACCT` missing
entirely — a byte-for-byte mirror of the live NULL above. Fixed for hygiene only in that repo's
`feature/ETP-4706` (element added, value `6E9DA718417A48A290FE376448A12BF6`); the table is not in
`OnboardingDatasetDefinition.INCLUDED_TABLES`, so this has no runtime/onboarding effect — it just
prevents the stale value from resurfacing if the file is ever regenerated or the table is later
added to the included set. If you independently find this XML stale, it's already handled.

---

### A2b (generalized) — the other 11 `C_BP_Group_Acct.*_acct` columns, 4 of them an ONGOING preventive gap (ETP-4720, 2026-08-05)

**Task:** generalize R17's single-column backfill (`NotInvoicedReceipts_Acct`) to the other 11
`*_acct` columns on `C_BP_Group_Acct` flagged as out-of-scope above. The ticket's own text assumed
this was corrective-only, same as R17 — that assumption held for 7 of the 11 columns but was
**wrong** for the other 4.

**Root cause, confirmed by reading both live provisioning paths (not assumed):**
- `pg_get_functiondef('c_bp_group_trg')` (the core, unmodified Postgres trigger that fires on every
  `C_BP_Group` insert) shows its own `INSERT` **omits 5 of the table's columns entirely**:
  `WriteOff_Rev_Acct`, `DoubtfulDebt_Acct`, `BadDebtExpense_Acct`, `BadDebtRevenue_Acct`,
  `AllowanceForDoubtful_Acct`. It DOES include the other 6 of the 11
  (`NotInvoicedRevenue_Acct`/`NotInvoicedReceivables_Acct`/`UnEarnedRevenue_Acct`/
  `PayDiscount_Exp_Acct`/`PayDiscount_Rev_Acct`/`V_Liability_Services_Acct`).
- `OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL` (the Java fallback, guarded by `NOT EXISTS`
  at the row level) includes `WriteOff_Rev_Acct` but still omits the other 4.
- Because `C_BP_Group` is always inserted (firing the trigger) BEFORE this Java statement ever runs,
  the trigger always wins the INSERT race and the Java fallback's own `NOT EXISTS` guard never gets a
  chance to contribute these 4 columns either. Whichever path "wins," the resulting row is missing
  the same 4 columns — for every tenant, every group, always.

**Live confirmation this is an ONGOING preventive gap, not only legacy drift:** swept all 12 tenants
on the dev DB — `DoubtfulDebt_Acct`/`BadDebtExpense_Acct`/`BadDebtRevenue_Acct`/
`AllowanceForDoubtful_Acct` were NULL on **every** `C_BP_Group_Acct` row of every tenant whose
`C_AcctSchema_Default` already had them populated (via R11), including "Empresa E2E d5be89a8"
(client `2D54A79B1B2649218C5FED9307B84DC9`), onboarded **2026-07-29 — 6 days before this was
diagnosed — via the current onboarding code**.

**6 of the other 7 columns have no source value anywhere on this DB; the 7th has one pre-existing
exception.** `C_AcctSchema_Default`'s own `NotInvoicedRevenue_Acct`/`NotInvoicedReceivables_Acct`/
`UnEarnedRevenue_Acct`/`PayDiscount_Exp_Acct`/`PayDiscount_Rev_Acct`/`V_Liability_Services_Acct` are
NULL fleet-wide on all 14 schemas — R11 only ever completed 6 *different* Defaults-tab columns.
`WriteOff_Rev_Acct` is the exception: it is NOT NULL on F&B International Group's schema
`732913485BB040FFA4643FF06D1AA095` (populated since 2026-07-08, before this ticket), so R21's
`@check` does NOT no-op for F&B today — 2 of its `C_BP_Group_Acct` rows on that schema are still
NULL and WILL be backfilled the first time R21 runs there (verified live, 2026-08-05, during DOCS
review). This is an R11-adjacent gap, out of this ticket's scope; R21's `@check` correctly excludes
the other 6 columns today and will self-heal them automatically per-tenant the moment a future fix
populates `C_AcctSchema_Default` for them.

**Per-partner override audit (explicitly checked, not assumed):** of the 11 columns, only
`V_Liability_Services_Acct` has a matching per-partner override column, on `C_BP_Vendor_Acct`.
`C_BP_Customer_Acct` has neither of the 11. Since R21 (and its preventive twin) only ever write the
group-level table, a per-partner override's existence is orthogonal — no extra guard was needed.

**Fix — both fronts closed:**
- **Corrective:** `cli/src/data-fixes/sql/20260805T120000Z__R21-bp-group-acct-remaining-columns.sql`
  — one guarded `UPDATE`, `COALESCE(a.col, d.col)` per column, row-level `WHERE` mirroring `@check`,
  scoped to `:client_id`. Never touches `notinvoicedreceipts_acct` (R17's own scope). Verified live
  in a rolled-back transaction on GOClient: exactly the 4 sourced columns filled on all 3 groups, the
  other 7 stayed NULL (no source value), re-run affected 0 rows, R17's own column untouched.
- **Preventive:** `OnboardingAccountingWiringService#patchBpGroupAcctMissingColumns` (com.etendoerp.go),
  a `COALESCE`-guarded `UPDATE` covering the same 5 columns the trigger/Java fallback omit, wired as
  the new LAST provisioning step in `EtendoGoJwtServlet.ensureOnboardingDataset` (right before the
  data-fix baseline is stamped). `ONBOARDING_PROVISIONED_THROUGH` bumped to R21's own timestamp,
  `2026-08-05T12:00:00Z`.
- **Tests:** `cli/test/data-fixes-r21-bp-group-acct-remaining-columns.test.js` (corrective, static
  parse validation of `@check`/`@apply` per column) and
  `OnboardingAccountingWiringServiceTest`/`EtendoGoJwtServletOnboardingDatasetTest` (preventive,
  Java/Mockito — confirms the new step runs, is scoped by client, and is wired before the baseline).
### A2c — `FIN_Financial_Account_Acct` / `M_Warehouse_Acct` missing entirely (ETP-4743, follow-up to ETP-4565, 2026-08-05)

**Symptom:** already-onboarded tenants have financial accounts (`FIN_FINANCIAL_ACCOUNT`, e.g.
"Caja", "Cuenta de Banco") and warehouses (`M_WAREHOUSE`, e.g. "Almacen GO") with **zero**
matching rows in `FIN_Financial_Account_Acct` / `M_Warehouse_Acct` for one or more of the tenant's
accounting schemas — not a NULL column on an existing row (as in A2b), the per-schema row itself
is entirely absent.

**Root cause:** `FIN_FINANCIAL_ACCOUNT` and `M_WAREHOUSE` are bulk-imported by the onboarding
dataset importer with DB triggers disabled (`OnboardingDatasetDefinition.INCLUDED_TABLES`), so
Classic's own `fin_financial_account_trg` / `m_warehouse_trg` AFTER-INSERT triggers — which
otherwise auto-provision the matching `*_Acct` row for every LIVE creation of these entities —
never fire for the bundled template rows. Unlike the sibling entities that
`OnboardingAccountingWiringService#provisionEntityPostingAccounts` already backfills via
`runEntityAcctInsert` (BP group, product category, BP customer/vendor, product, tax), nobody
backfilled these two tables for tenants that were **already onboarded before ETP-4565 shipped its
preventive fix** (`FIN_FINANCIAL_ACCOUNT_ACCT_SQL` / `WAREHOUSE_ACCT_SQL`, already merged into the
live onboarding chain). ETP-4565 deliberately did NOT bump `ONBOARDING_PROVISIONED_THROUGH` at the
time, since the corrective `.sql` twin did not exist yet.

**Live-DB sweep (2026-08-05), pairs of (entity × schema) missing their `*_Acct` row, GENUINELY
FIXABLE (i.e. the schema also has a `c_acctschema_default` row — see the QA finding below for why
this qualifier matters):**

| Client | FA missing pairs | WH missing pairs |
|---|---|---|
| acreedortest | 2 | 2 |
| acreetest2 | 2 | 2 |
| empresa | 3 | 2 |
| Empresa E2E (×4) | 3 each | 2 each |
| F&B International Group | 7 (of 14 financial accounts × 2 of its 26 schemas that have a `c_acctschema_default` row) | 96 |
| GOClient | 0 (already correct) | 0 (already correct) |
| QA Testing | 3 | 2 |
| RolesPresa | 3 | 2 |
| TaxesOrg | 2 | 2 |

Every real tenant on the dev DB except GOClient itself has at least one missing pair. GOClient's
own rows were already wired at some point, so its `@check` naturally returns 0 rows — no
special-casing needed.

**Both fronts closed (2026-08-05):**

| Front | Deliverable |
|---|---|
| **Preventive** | Already shipped by ETP-4565 (`FIN_FINANCIAL_ACCOUNT_ACCT_SQL` / `WAREHOUSE_ACCT_SQL` in `OnboardingAccountingWiringService`, called from `provisionEntityPostingAccounts`). No new Java needed for ETP-4743. |
| **Corrective** | `cli/src/data-fixes/sql/20260805T140000Z__R22-fin-account-warehouse-acct.sql` — two guarded `INSERT ... SELECT` statements (mirroring the two Java constants column-for-column), each joined against **every** `c_acctschema` row the tenant owns (a tenant may run more than one ledger; mirrors the same generalization `R7-tax-accounts` already applies). Live-validated on `acreedortest` (`D94AED60C3E0494AAFD44B8A05BB5CFC`): dry-run → `WOULD_APPLY` → real run → `APPLIED (4 rows)` → re-run → `SKIPPED_NOT_NEEDED — kept prior success state`. |
| **CUT bump** | `ONBOARDING_PROVISIONED_THROUGH` bumped from R20's `2026-08-03T18:00:00Z` to R22's `2026-08-05T14:00:00Z` in `OnboardingBaselineService.java` — this closes the loop ETP-4565 deliberately left open (preventive shipped, CUT not bumped, because the corrective twin didn't exist yet). |

**QA fix (2026-08-05, Sentinel, rejection cycle 1 of ETP-4743, resolved same day):** the
financial-account branch of `@check` was initially missing the `JOIN c_acctschema_default d ON
d.c_acctschema_id = s.c_acctschema_id` that `@apply`'s own INSERT already had (an asymmetry Alex
flagged as a non-blocking note in REVIEW, then Sentinel proved was live and reproducible). Without
that join, `@check` counted ALL 343 (financial-account × schema) pairs on F&B International Group
as "needing the fix", but `@apply`'s `INNER JOIN c_acctschema_default` could only ever insert the
7 pairs whose schema actually HAS a `c_acctschema_default` row — the other 336 pairs belong to
schemas with no default row at all (see gap **A2d** below) and can never be inserted by this fix.
A real run would have written ledger status `APPLIED` (rows_affected≈7) — looking like success —
while `@check` kept matching >0 rows forever (the 336 unreachable pairs), so the fix would never
converge to `SKIPPED_NOT_NEEDED` on a re-run. Fixed by adding the missing join to `@check` so it
now only counts pairs `@apply` can genuinely close; the warehouse branch never had this bug (it
already joined `c_acctschema_default` symmetrically in both `@check` and `@apply`). Verified with
a read-only `--dry-run` against F&B International Group (no writes) and a direct SQL count
confirming exactly 7 genuinely-fixable financial-account pairs post-fix. Regression-guarded by two
new tests in `cli/test/data-fixes-r22-fin-account-warehouse-acct.test.js` asserting `@check` and
`@apply`'s financial-account branches join `c_acctschema_default` the same number of times.

**Branch-ordering note:** at the time this shipped, an unmerged sibling branch
(`feature/ETP-4720`) independently claims `R21` at `2026-08-05T12:00:00Z` for an unrelated
`C_BP_Group_Acct` fix. `R22`'s timestamp (`14:00:00Z`) is deliberately later, so no `Rn`/CUT
collision occurs whichever branch merges first; expect (and resolve to the later timestamp on) a
merge conflict on the single `ONBOARDING_PROVISIONED_THROUGH` line when the two branches converge,
per the standing rule already documented for prior collisions (R9/R10, R19/R20).

**SQL fix (corrective guard — idempotent, per-schema):**
```sql
-- @check
SELECT 1
FROM fin_financial_account f
JOIN c_acctschema s ON s.ad_client_id = f.ad_client_id
WHERE f.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM fin_financial_account_acct a
    WHERE a.fin_financial_account_id = f.fin_financial_account_id
      AND a.c_acctschema_id = s.c_acctschema_id
  )
UNION ALL
SELECT 1
FROM m_warehouse w
JOIN c_acctschema s ON s.ad_client_id = w.ad_client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE w.ad_client_id = :client_id
  AND d.w_differences_acct IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM m_warehouse_acct a
    WHERE a.m_warehouse_id = w.m_warehouse_id
      AND a.c_acctschema_id = s.c_acctschema_id
  )
LIMIT 1;
```
Full `@apply` (two `INSERT ... SELECT` statements) in the `.sql` file itself — see
`docs/etendo-ad/onboarding-and-datafixes-map.md` §4 for the paired preventive/corrective summary.

---

### A2d — Accounting schemas with no `C_ACCTSCHEMA_DEFAULT` row at all (NOT YET FIXED, found 2026-08-05)

**Symptom:** discovered as a side-effect of Sentinel's QA pass on R22 (A2c above) — 24 of F&B
International Group's 26 `c_acctschema` rows (all `isactive='Y'`) have **zero** matching rows in
`c_acctschema_default`. This isn't specific to R22: ANY fix or onboarding step that resolves a
posting-account default via `c_acctschema_default` (A2, A2c, and R22's own financial-account
branch) can never reach these 24 schemas — its `INNER JOIN c_acctschema_default` silently excludes
them, so a naive `@check` that doesn't mirror the same join over-reports "needs fix" for pairs
that can never actually be inserted (exactly the bug R22 shipped with in cycle 1, before the
`@check` join was corrected to match `@apply`).

**Root cause:** not yet investigated. Candidates (untested): (a) these 24 schemas were created via
a path that never ran the equivalent of the A1/A2 accounting-setup wiring (e.g. a bulk/test-data
script rather than the normal *Initial Organization Setup* flow); (b) a second-ledger/parallel-book
pattern specific to this tenant's test data that was never meant to post at all. F&B International
Group is a QA/demo tenant with an unusually high schema count (26, vs. 1-2 for every other tenant
on this DB), so this may be an artifact of how that specific tenant's test data was built rather
than a live-production onboarding gap — needs a real investigation before deciding whether this
warrants a corrective fix, an onboarding-hardening step, or is simply out of scope (a test/demo
tenant's non-posting schemas may not need `c_acctschema_default` at all).

**Status:** **NOT FIXED.** Explicitly out of scope for ETP-4743 (which backfills `*_Acct` rows
GIVEN a schema default exists, not schema-default completeness itself). Flagged here as a
follow-up per the tenant-remediation workflow's "flag, don't silently skip" convention. See
`docs/etendo-ad/tenant-remediation-knowledge.md`'s ETP-4743 section for the discovery details.

---

### A5 — `C_Element` tree missing its root `AD_TreeNode` (blocks new top-level accounts, 2026-07-08)

**Symptom:** discovered while running R9 (bp-category-seed) against the shared Experimental
environment — 32 of 68 tenants halted with:
```
null value in column "ad_tree_id" of relation "ad_treenode" violates not-null constraint
```

**Root cause:** confirmed via `pg_get_functiondef('c_elementvalue_trg'::regproc)`. On every
`INSERT INTO c_elementvalue`, the standard core trigger resolves the tenant's tree/root with:
```sql
SELECT e.AD_Tree_ID, n.Node_ID INTO v_xTree_ID, v_xParent_ID
FROM C_Element e, AD_TreeNode n
WHERE e.AD_Tree_ID = n.AD_Tree_ID AND n.Parent_ID IS NULL AND e.C_Element_ID = new.C_Element_ID;
```
When the tree that `C_Element.AD_Tree_ID` points to has no row with `Parent_ID IS NULL`, this
`SELECT INTO` matches zero rows, `v_xTree_ID` stays `NULL`, and the trigger's own
`INSERT INTO AD_TreeNode(...)` fails the `NOT NULL` constraint.

On the 32 affected tenants, a bulk reprovisioning event on **2026-06-30** (visible as a cluster of
R1–R8 ledger timestamps that day in `ETGO_DATA_FIX_HISTORY`) created a **second** `AD_Tree` row per
tenant, attached the tenant's real chart of accounts to it (confirmed: 1,790 real nodes on one
sampled tenant, `emilio22`), and repointed `C_Element.AD_Tree_ID` at the new tree — but never
inserted its root node (`node_id='0'`, `parent_id IS NULL`, the confirmed convention from both a
healthy tenant and the orphaned original tree). The original onboarding tree (which does have a
proper root) was left orphaned and unused. This is a provisioning gap, not a defect in R9 itself —
R9 is simply the first fix in the chain that happens to `INSERT` a new top-level `C_ElementValue`,
which is what exposes it. Any future insert of a new top-level posting account (or any other
`C_Element` hierarchy missing its root) would hit the identical wall.

**Fix:** `cli/src/data-fixes/sql/20260701T115900Z__R9b-restore-element-tree-root.sql` — generic
across every `C_Element` for the tenant (not scoped to the accounting dimension alone), inserts the
missing root `AD_TreeNode` row, guarded by `NOT EXISTS`. Deliberately timestamped **one minute
before R9** so it runs ahead of R9 in the chain — the runner halts a tenant's chain on the first
`FAILED` fix, so if this sorted after R9 the 32 already-halted tenants would hit R9 again first and
fail again before ever reaching the repair. **Applied and verified live on Experimental (2026-07-08):**
targeted apply inserted the missing root node for all 32 affected tenants (0 failures); a full chain
re-run afterward completed 71/71 tenants with 0 halted.

**Preventive:** root cause of the 2026-06-30 duplicate-tree event itself has not been investigated
(unclear whether it was a one-off manual/ad-hoc action or a recurring script) — open item.

---

### A4 — `A_Amortization` table inactive on `C_AcctSchema_Table` (ETP-4452, 2026-07-08)

**Symptom:** amortization documents (`A_Amortization`, `AD_Table_id 800060`, "FinancialMgmtAmortization")
cannot post — the same "table not enabled for posting" failure any of the TC-39 tables would show if
their `c_acctschema_table.isactive` were `'N'`.

**Root cause:** same class of drift as the A3b write-off override and the R9 BP-category gap — the
**live** GOClient `C_ACCTSCHEMA_TABLE` row for `AD_Table_id 800060` had been manually corrected to
`isactive='Y'` at some point, but the bundled onboarding dataset
(`referencedata/sampledata/GOClient/C_ACCTSCHEMA_TABLE.xml`, same row id
`DAE3C688574C4919B889DA7EFAD6CC5C`) still shipped `isactive='N'`. Any environment provisioned or
reset from that dataset (including the shared "Experimental" cloud environment) is born with
amortization accounting inactive. TC-39 (above) never caught this because `A_Amortization` was
simply missing from its checklist of tables to verify.

**Live sweep (2026-07-08), `isactive` for `ad_table_id='800060'` per client/schema:**

| Client | Schema | `isactive` (before fix) |
|---|---|---|
| GOClient | Esquema GO | `Y` (already hand-corrected live) |
| F&B International Group | both schemas | `Y` (already correct) |
| acreedortest | Esquema acreedortest | `N` |
| acreetest2 | Esquema acreetest2 | `N` |
| empresa | Esquema empresa | `N` |
| QA Testing | both schemas | `N` |
| TaxesOrg | Tax Org Ledger | `N` |

**Initial scope decision — PGC-chart family only (superseded, see below):** acreedortest/acreetest2/empresa
are the same GOClient-style Spanish PGC chart family established for R9/R11/R12 (each already carries a
postable, active `65000000` account leaf). QA Testing and TaxesOrg run unrelated chart-of-accounts
setups with **zero `A_Asset` records** and no `65000000` account at all, so R13 initially left them
untouched pending a business decision (same reasoning R12 applied to exclude non-PGC-family
tenants from the write-off fix).

**Follow-up decisions (2026-07-08, same day):** the reporter subsequently confirmed amortization
accounting should be active for every known tenant regardless of chart family or current asset
data — for TaxesOrg, explicitly proactive ("in case that organization creates an asset in the
future"); for QA Testing, because the exclusion was functionally moot ("QA Testing is not used").
R13 was revised the same day to drop the marker guard entirely — one script, no client-specific
carve-outs, since a hardcoded per-tenant scope only makes sense for genuine exclusions and none
remain. **All 9 client/schema rows are now `isactive='Y'`, confirmed live — no exclusions remain.**

**All fronts closed (2026-07-08):**

| Front | Deliverable |
|---|---|
| **Corrective — every tenant** | `cli/src/data-fixes/sql/20260708T100000Z__R13-amortization-table-active.sql` — single guarded `UPDATE`, scoped only by `:client_id AND ad_table_id='800060' AND isactive <> 'Y'` (no chart-family marker, no allowlist). Live-validated: acreedortest/acreetest2/empresa/QA Testing (both schemas)/TaxesOrg all `APPLIED`, GOClient/F&B International Group `SKIPPED_NOT_NEEDED` (already correct); full re-run confirms idempotency (`SKIPPED_NOT_NEEDED` across all 7 tenants). |
| **Preventive** | `referencedata/sampledata/GOClient/C_ACCTSCHEMA_TABLE.xml` — row `DAE3C688574C4919B889DA7EFAD6CC5C`'s `ISACTIVE` flipped from `N` to `Y`. `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-07-08T10:00:00Z` in `OnboardingBaselineService.java`. QA Testing and TaxesOrg have no dedicated sampledata directory (only `GOClient/` exists) — nothing further to fix preventively for either. |

---

## B — Organization Hierarchy

### B1 — Empty `AD_ORG_TREE` (organization hierarchy)

**Symptom:** when completing an invoice → *"The organization of the lines is different and does not depend on the organization associated with the header"* — even though header and line have the SAME organization.

**Root cause:** `AD_ISORGINCLUDED()` queries `AD_ORG_TREE`, a precomputed hierarchy cache, which is left **empty** for the new client because the *Set Organization as Ready* process did not run.

**Verification:**

```sql
-- Verify: returns -1 if the problem exists
SELECT AD_ISORGINCLUDED('<ORG_ID>', '<ORG_ID>', '<CLIENT_ID>');
-- Must return 1 (same org)
```

**SQL fix:**

```sql
INSERT INTO ad_org_tree (
  ad_org_tree_id, ad_client_id, isactive, created, createdby, updated, updatedby,
  ad_org_id, ad_parent_org_id, levelno
) VALUES
  -- Self-reference (the org includes itself)
  (upper(replace(gen_random_uuid()::text,'-','')),
   '<CLIENT_ID>', 'Y', now(), '0', now(), '0',
   '<ORG_ID>', '<ORG_ID>', 1),
  -- Child of * (root org)
  (upper(replace(gen_random_uuid()::text,'-','')),
   '<CLIENT_ID>', 'Y', now(), '0', now(), '0',
   '<ORG_ID>', '0', 2);
```

**Where it should be fixed:** the *Set Organization as Ready* process must run as part of the onboarding flow to populate `AD_ORG_TREE` for the new org.

---

## C — Period Control

### C1 — Period-control fields on `ad_org`

**Symptom:** the *Open/Close Period Control* window is empty (no periods or document types); posting fails because there are no open periods.

**Root cause:** when an org is created, these four fields are left empty or `'N'`:

| Field | Purpose | Required value |
|---|---|---|
| `isperiodcontrolallowed` | Enables period control | `'Y'` |
| `ad_periodcontrolallowed_org_id` | Org that controls periods | self-reference |
| `c_calendar_id` | Fiscal calendar | calendar ID |
| `ad_inheritedcalendar_id` | **Critical for the `c_period_trg()` trigger** | same as `c_calendar_id` |

> Warning: `ad_inheritedcalendar_id` is DIFFERENT from `c_calendar_id`. The `c_period_trg()` trigger uses the `inherited` field, not `c_calendar_id`. If empty, the trigger will not create the `c_periodcontrol` records even if everything else is correct.

**SQL fix** — must be done BEFORE creating the calendar and its periods:

```sql
UPDATE ad_org
SET isperiodcontrolallowed         = 'Y',
    ad_periodcontrolallowed_org_id = '<ORG_ID>',
    c_calendar_id                  = '<CALENDAR_ID>',
    ad_inheritedcalendar_id        = '<CALENDAR_ID>',
    updated   = now(),
    updatedby = '100'
WHERE ad_org_id = '<ORG_ID>';
```

**Where it should be fixed:** the onboarding flow must set these four fields on `ad_org` before creating the calendar and periods. See also the *Recommended order of operations* section below.

---

### C2 — Missing `c_periodcontrol` records (document types per period)

**Symptom:** the *Open/Close Period Control* window shows periods but no document-type rows; period-based posting validation fails.

**Root cause:** inserting a period into `c_period` fires the `c_period_trg()` trigger, which auto-creates one `c_periodcontrol` row per document type (`docbasetype`) with `periodstatus='N'` (Never Opened); they are then opened manually from the UI (*Open Period*). The trigger has this condition:

```sql
WHERE o.ISREADY = 'Y'
  AND o.ISPERIODCONTROLALLOWED = 'Y'
  AND exists (
    SELECT 1 FROM C_Year, c_calendar
    WHERE C_Year.c_calendar_id = c_calendar.c_calendar_id
    AND c_calendar.c_calendar_id = o.ad_inheritedcalendar_id  -- uses inherited
    AND C_Year.C_Year_ID = new.C_Year_ID
  )
```

- **Cause 1:** the calendar was created before setting `isperiodcontrolallowed='Y'` → trigger fired with the condition false → created nothing.
- **Cause 2:** `ad_inheritedcalendar_id` was empty → the EXISTS does not match → same consequence even if the flag was correct.

**SQL fix** — insert the missing rows manually (core has **42** docbasetypes → 42 × 12 periods = **504** rows/year; verify against your environment, a custom module may add one):

```sql
INSERT INTO c_periodcontrol (
  c_periodcontrol_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  c_period_id, docbasetype, periodstatus, periodaction, processing, openclose
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '<NEW_ORG_ID>', 'Y',
  now(), '100', now(), '100',
  dst_p.c_period_id,
  pc.docbasetype,
  'N', 'N', 'N', 'O'  -- periodstatus='N' (Never Opened), periodaction/processing='N', openclose='O' (table default; 'N' is invalid)
FROM c_periodcontrol pc
JOIN c_period src_p ON src_p.c_period_id = pc.c_period_id
JOIN c_year   src_y ON src_y.c_year_id   = src_p.c_year_id
JOIN c_year   dst_y ON dst_y.c_calendar_id = '<NEW_CALENDAR_ID>'
                   AND dst_y.year = src_y.year
JOIN c_period dst_p ON dst_p.c_year_id = dst_y.c_year_id
                   AND dst_p.name = src_p.name
WHERE src_y.c_calendar_id = '<SOURCE_CALENDAR_ID>'
  AND pc.ad_org_id = '<SOURCE_ORG_ID>'
  AND NOT EXISTS (
    SELECT 1 FROM c_periodcontrol x
    WHERE x.c_period_id = dst_p.c_period_id
      AND x.docbasetype = pc.docbasetype
      AND x.ad_org_id = '<NEW_ORG_ID>'
  );
-- Expected result: 42 docbasetypes × 12 periods = 504 records (core baseline)
```

Then open periods from the UI: *Open/Close Period Control → Open Period*.

**Where it should be fixed:** the root fix is C1 — setting `isperiodcontrolallowed='Y'` and `ad_inheritedcalendar_id` before creating the calendar. If the calendar was already created without these flags, use the SQL above to backfill the missing rows.

---

## D — Legal Entity

### D1 — NULL denormalized legal-entity columns on `AD_Org` (ETP-4177)

**Symptom:** after provisioning the client/org from GO onboarding, the org has `isready='Y'` but two denormalized `AD_Org` columns are NULL:

- `AD_LegalEntity_Org_ID` (should be the org itself, since it is a legal entity)
- `AD_CalendarOwner_Org_ID` (same)
- (`AD_BusinessUnit_Org_ID` stays NULL, which is correct when there is no BU.)

**Why it matters:** `AD_GET_ORG_LE_BU(org,'LE')` does NOT walk the tree — it reads `AD_Org.AD_LegalEntity_Org_ID` directly. If NULL, everything that resolves the legal entity through it breaks. Concrete symptom observed: the `@SQL=` defaults of the invoice SII fields (Descripción SII, Clave tipo, ID Descripción, Estado) share a guard `… insiisystem='Y' WHERE ad_org_id = ad_get_org_le_bu(@AD_Org_ID@,'LE')`, which returns NULL → the 4 fields are left empty. Broader impact: accounting-schema and tax resolution also depend on the legal entity.

**Root cause:** `MarkOrgReadyStep` / `OnboardingMarkOrgReadyService` run the core `AD_Org_Ready` process and then defensively force `org.setReady(true)`. The org ends with `isready='Y'` but the denormalized columns NULL — and the fallback masks the failure.

> **Root-cause hypothesis — needs a debug trace to confirm.** Two mechanisms are plausible and not yet proven: (a) a transaction/connection split (the process runs via `ProcessRunner` while `setReady(true)` commits on the OBDal connection); or (b) a Hibernate first-level-cache overwrite — after `AD_ORG_READY` writes the columns via PL/SQL, a stale cached `Organization` entity is re-saved by `setReady(true)`, writing NULLs back over them. If (b), `DalConnectionProvider` actually shares the OBDal JDBC connection and the fix is an `OBDal.getInstance().refresh(org)` (cache eviction) before the defensive `setReady`, not a transaction fix. Confirm which one applies before changing `MarkOrgReadyStep`; the verify-and-recompute mitigation below is correct under either.

**SQL fix:**

```sql
UPDATE ad_org
SET ad_legalentity_org_id   = ad_get_org_le_bu_treenode(ad_org_id,'LE'),
    ad_businessunit_org_id  = ad_get_org_le_bu_treenode(ad_org_id,'BU'),
    ad_calendarowner_org_id = ad_org_getcalendarownertn(ad_org_id)
WHERE ad_org_id = '<ORG_ID>';
```

**Detection query** for already-provisioned tenants with this problem:

```sql
SELECT c.name AS client, o.name AS org, o.ad_org_id
FROM ad_org o
JOIN ad_orgtype ot ON o.ad_orgtype_id = ot.ad_orgtype_id
JOIN ad_client  c  ON o.ad_client_id  = c.ad_client_id
WHERE o.isready = 'Y' AND ot.islegalentity = 'Y'
  AND o.ad_legalentity_org_id IS NULL AND o.ad_org_id != '0';
```

**Where it should be fixed:** after running `AD_Org_Ready`, the onboarding step must verify `AD_LegalEntity_Org_ID` was populated; if NULL, recompute it (or fail the step) instead of marking ready blindly. The computation is exactly what `AD_ORG_READY` does internally.

**References:** `src-db/database/model/functions/AD_ORG_READY.xml` (computes/persists these columns via `ad_get_org_le_bu_treenode` and `ad_org_getcalendarownertn`); `AD_GET_ORG_LE_BU.xml` (reads the denormalized column).

**Ticket:** ETP-4177. With this fixed, the org matches GOOrg in all `AD_Org_Ready` outputs (denormalized columns, `ad_org_tree`, and the 516 `C_PeriodControl` rows).

---

## E — Session / User

### E1 — User session org stuck at `'0'` (`AD_User.ad_org_id='0'`)

**Symptom:** when a tenant user has `AD_User.ad_org_id = '0'` (the `*` org), the login JWT carries `organization = '0'`. `NeoAuthenticator` reads it straight from the token, so `OBContext.getCurrentOrganization()` returns `*` for the whole session. This makes the 303/349 handlers look for fiscal periods, `AD_OrgInfo`, and `AcctSchema` in org `'0'` — which has none of that data.

**Point of confusion:** the "Organización: TaxesOrg" shown in the role config is the `AD_Role_OrgAccess` — the orgs that role can access. That is NOT the same as the active session org, which comes from `AD_User.ad_org_id`.

**Quick verification:**

```sql
SELECT username, ao.name AS org_sesion
FROM ad_user au
JOIN ad_org ao ON au.ad_org_id = ao.ad_org_id
WHERE au.ad_client_id = '<NEW_CLIENT_ID>';
-- If org_sesion = '*' → the problem exists
```

**Where it should be fixed:** when creating the users of a new tenant (via *Initial Client Setup* or the onboarding flow), `AD_User.ad_org_id` should be set to the tenant's own org from the start instead of `'0'`.

> **Note (verified):** the defensive `'0'`-org resolution is **not** in `NeoAuthenticator` itself — there the JWT `organization` claim flows straight into `SecureWebServicesUtils.createContext` / `OBContext.setOBContext` untouched (`NeoAuthenticator.java:86–112`). The guards live downstream in the handlers/services that consume the org: `NeoCalloutService.java:561`, `ProductPriceHandler.java:274`, `selector/meta/SelectorContextResolver.java:115`, `onboarding/OnboardingDatasetNormalizer.java:224`. So the session context is `*`, but those handlers re-resolve the tenant org. The structural fix (set `AD_User.ad_org_id` at creation) remains preferable to relying on per-handler guards.

---

## H — NEO Headless / Webhook Access

### H1 — Non-System-Administrator roles 404 on `SMFWHE_DEFINEDWEBHOOK_ROLE`-gated webhooks (ETP-4520)

> **Superseded (2026-07-27, later same day):** the fixes below (referencedata seeding, the R16
> data-fix's former Step 3, `OnboardingWebhookAccessService`/`OnboardingRoleProvisioningService`'s
> former webhook-grant step) treated the symptom — they made sure a `SMFWHE_DEFINEDWEBHOOK_ROLE`
> grant existed. The actual fix landed later: `SFListMenu`/`SFWindowAccessMap`/`SFRolesOverview`
> are now reached through com.etendoerp.go's NEO pseudo-spec bridge (`/sws/neo/*`, see
> `neo-headless.md` §4.10–4.11) instead of the Webhooks module, so no grant is needed at all — this
> whole gap class cannot recur for these 3 webhooks. Left below for historical context; the
> corrective/preventive code this section describes has since been removed as dead weight.
>
> **Related leak (2026-08-21, ETP-4968):** stale `SMFWHE_DEFINEDWEBHOOK_ROLE` rows from this
> already-superseded flow leaked from GOClient's sample data into the module's universal baseline
> via an `export.database` run, breaking CI — see the "FOLLOW-UP" note at the top of
> `cli/src/data-fixes/sql/20260727T114306Z__R16-tenant-roles-and-webhook-access.sql`. General risk:
> `export.database` dumps a module-owned table's full live state regardless of client scope, so any
> table with client-scoped rows plus a dev DB carrying sample-tenant data can leak the same way.

**Symptom:** any authenticated role other than System Administrator (`AD_Role_ID = '0'`) gets a flat `404` from every Schema Forge webhook that requires a `SMFWHE_DEFINEDWEBHOOK_ROLE` grant — `SFListMenu`, `SFWindowAccessMap`, `SFRolesOverview`. Observable symptoms compound in a confusing way because the two callers fail in opposite directions: the sidebar shows the **full, unfiltered** menu (`useRoleMenu()`'s fetch fails → `AppLayout` fails **open** on a fetch error) while **every window** is denied (`fetchWindowAccess`'s fetch fails → `AuthContext`'s `windowAccess` map stays at its fail-**closed** `{}` default → `WindowAccessGuard` blocks everything).

**Root cause:** `SMFWHE_DEFINEDWEBHOOK_ROLE` is the webhook dispatcher's own authorization gate — a role with no row for a given webhook is 404'd by `WebhookServiceHandler` before the webhook's own Java logic (e.g. `NeoAccessHelper.isAdminOrClientAdmin`) ever runs. The per-tenant grants for a client's non-admin roles live in `referencedata/sampledata/<Client>/SMFWHE_DEFINEDWEBHOOK_ROLE.xml` — **reference/sample data, applied only at initial tenant creation, never reapplied by `update.database`/`smartbuild` on an existing install.** Any tenant provisioned before a given webhook's role grants existed in that XML keeps whatever the module's own default seed shipped — observed as `ad_role_id = '0'` only.

**Quick verification:**

```sql
SELECT w.name AS webhook, r.name AS role_name
FROM smfwhe_definedwebhook_role wr
JOIN smfwhe_definedwebhook w ON w.smfwhe_definedwebhook_id = wr.smfwhe_definedwebhook_id
LEFT JOIN ad_role r ON r.ad_role_id = wr.ad_role_id
WHERE wr.ad_client_id = '<CLIENT_ID>'
  AND w.name IN ('SFListMenu', 'SFWindowAccessMap', 'SFRolesOverview')
ORDER BY w.name, r.name;
-- If only 'System Administrator' rows appear for a webhook, that gap is present for this tenant.
```

**Corrective fix:** `cli/src/data-fixes/sql/20260727T114306Z__R16-tenant-roles-and-webhook-access.sql` (Step 3) — grants every ACTIVE role of `:client_id` a row for all 3 webhooks (not a hardcoded role list, so it covers any tenant's own admin-equivalent role plus every other role it has, including any created by Step 1/2 of the same fix — see H2 below).

**Preventive fix:** `referencedata/sampledata/GOClient/SMFWHE_DEFINEDWEBHOOK_ROLE.xml` (in `com.etendoerp.go`) now grants all 3 webhooks (previously only `SFListMenu`/`SFWindowAccessMap`) to GOClient's 6 roles, so a fresh GOClient install is born correct. Any other client's own sample-data (if it ships an equivalent file) should follow the same 3-webhook pattern. **ETP-4515 (Phase 7) — onboarding auto-provisioning for new tenants — has not been built**, so every tenant onboarded before that ships still needs the corrective fix above.

### H2 — Real tenants never get GOClient's Finance/Sales/Purchasing/Inventory roles (ETP-4515/4516, Phase 7)

**Symptom:** a real onboarded Etendo Go tenant has exactly ONE role (its auto-created admin role). The ETP-4512 "assign one of 5 predefined roles" UI has nothing to offer besides that admin role — Finance/Sales/Purchasing/Inventory don't exist for the tenant at all, so role-based access segmentation is impossible.

**Root cause:** GOClient's 4 non-admin roles are reference/sample data unique to GOClient (`referencedata/sampledata/GOClient/AD_ROLE.xml` + `AD_WINDOW_ACCESS.xml`). Nothing in the real onboarding flow (`EtendoGoJwtServlet.handleOnboarding()`'s `ensureX`/`wireX` chain) creates equivalents for a new tenant, and no data-fix existed to backfill them for tenants onboarded before this was even scoped. This is exactly Phase 7's planned work (`santo_roles_handoff_phase7.md`): ETP-4515 (preventive, onboarding) and ETP-4516 (corrective, data-fix) — both were still unstarted as of 2026-07-23.

**Quick verification:**

```sql
SELECT name FROM ad_role WHERE ad_client_id = '<CLIENT_ID>' AND isactive = 'Y';
-- If Finance/Sales/Purchasing/Inventory are absent, this gap is present for this tenant.
```

**Corrective fix (ETP-4516's scope, implemented ahead of schedule 2026-07-27):** `cli/src/data-fixes/sql/20260727T114306Z__R16-tenant-roles-and-webhook-access.sql` (Steps 1–2) — clones any of the 4 missing roles from GOClient (`AD_Role` attributes verbatim, including `EM_ETGO_Show_Acct_Fields`) and backfills `AD_Window_Access` to match GOClient's per-role window grants exactly (window ids are safe to copy as-is — `AD_Window` is system-level, `ad_client_id = '0'` for every row). Validated end-to-end in a rolled-back transaction against a real existing tenant ("QA Testing"): produced exactly the same `AD_Window_Access` row counts per role as GOClient's own (Finance 9, Inventory 6, Purchasing 5, Sales 6).

**Live-DB staleness found and fixed while building this fix (2026-07-27):** correct reference values are `Y` for Finance and GOClient Admin, `N` for Sales/Purchasing/Inventory/GOuser — confirmed with the user. `referencedata/sampledata/GOClient/AD_ROLE.xml` already ships these correctly (a first check mis-grepped the tag's actual all-caps name, `EM_ETGO_SHOW_ACCT_FIELDS`, and wrongly concluded the XML never set it). The real gap was this local dev DB's live `ad_role` rows being stale relative to that already-correct XML — Finance and GOClient Admin both showed `N` live, same "referencedata not reapplied to an existing install" pattern as H1, just for this column instead of webhook grants. Corrected directly (`UPDATE ad_role SET em_etgo_show_acct_fields='Y' ...`) for this DB. Since Step 1 of the corrective fix always reads GOClient's *live* row (not the XML), any other environment whose GOClient copy is similarly stale would clone the wrong value until its own live data is corrected the same way.

**Preventive fix (ETP-4515, implemented 2026-07-27, same day as the corrective fix):** `com.etendoerp.go/src/com/etendoerp/go/onboarding/OnboardingRoleProvisioningService.java`, wired into `EtendoGoJwtServlet`'s onboarding chain right after the existing `ensureWebhookAccess` step (both are client-wide, neither needs the organization to exist yet). Same GOClient-as-template logic as the corrective data-fix above.

**End-to-end verification — CONFIRMED (2026-08-06):** the earlier caveat here ("not compiled/run against a live onboarding flow in this session") is resolved. Found 3 real tenants already onboarded through the live `POST /sws/go/onboarding` flow after PR #762 (`2d8b406b`, 2026-07-27) merged this service: `RolesPresa` (2026-07-27T13:14), `Empresa E2E 91c979ac` (2026-07-27T18:42), `Empresa E2E d5be89a8` (2026-07-29T12:58). All 3, checked against GOClient's *current* live state: have exactly the 4 cloned roles + their own admin role (no extras/dupes); `EM_ETGO_Show_Acct_Fields` = `Y`/Finance, `N`/Sales-Purchasing-Inventory, matching GOClient; `AD_Window_Access` counts match GOClient's current counts (Finance 9, Inventory 6, Purchasing 5, Sales 6 — unchanged since the R16 baseline); a window-id + `isreadwrite` set-equality check (not just counts) is an EXACT match for all 4 roles on all 3 tenants; every other `AD_Role` attribute matches too. The deployed `.class` on the running dev Tomcat matches the current source byte-for-byte (`javap` signature check), confirming these 3 tenants were provisioned by today's code. Idempotency ("safe to call `wire()` twice") verified via the guard precondition (`resolveRoleByName` already finds all 4 active roles on all 3 tenants → a second call would skip every clone), not a literal second live call — `handleOnboarding` has no "re-run for an existing client" entry point to trigger one safely. Full detail: `docs/etendo-ad/tenant-remediation-knowledge.md` §"ETP-4515/H2 — Onboarding role provisioning, end-to-end verification". **ETP-4515's 3rd acceptance criterion can now be considered met.**

---

## I — Inventory / Warehouse

**New gap-label series `I`.** Storage-bin (locator) provisioning defaults don't fit the A–H
provisioning-gap taxonomy (A=accounting, B=org tree, C=period, D=legal entity, E=session,
F=default customer/org info, G=payment method config, H=NEO Headless/webhook access). Used
`@gap: I1` for R19 — the same pattern G1/H1/H2 established for their own new categories. Future
warehouse/inventory provisioning gaps continue the `I` series.

### I1 — Locators born with inventory status "Undefined-OverIssue" (allows negative stock, ETP-4761)

**Symptom:** any new tenant's default storage bins can post negative stock from day one — the
Locator/Storage Bin window shows "Undefined-OverIssue" as the Inventory Status instead of
"Available".

**Root cause:** `M_InventoryStatus` is a fixed system reference (`ad_client_id='0'`): id `'0'` =
"Undefined-OverIssue" (`OVERISSUE='Y'`, lets a locator go negative), id `'2'` = "Available"
(`OVERISSUE='N'`, blocks it); id `7B3DC15A20234C418D26EECDC5D59003` = "Undefined" (also
`OVERISSUE='N'` — the DB column's own default, mislabeled but functionally equal to Available).
The bundled onboarding sampledata (`referencedata/sampledata/GOClient/M_LOCATOR.xml`, in
`com.etendoerp.go`) shipped BOTH of GOClient's bundled locators with `M_INVENTORYSTATUS_ID='0'` —
imported verbatim into every new tenant via `importOnboardingDataset` — so every tenant onboarded
before this fix has at least its default warehouse bin able to go negative. Separately, the
frontend's default-storage-bin creation (`tools/app-shell/src/windows/custom/warehouse/index.jsx`,
Schema Forge repo) omitted the field entirely, so the DB column default (`'0'`) applied there too;
that half of the fix is a one-line payload addition (`inventoryStatus: '2'`) in the same repo,
delivered alongside this gap closure but outside Remedy's remit (frontend custom-component code,
not onboarding/data-fix).

**Hard business rule (confirmed live, not a DB constraint):** flipping a locator's status to one
that disallows OverIssue FAILS at the application/callout layer if that locator currently has
negative on-hand stock (`m_storage_detail.qtyonhand < 0` for any product/attribute/UOM) — error:
"There is negative Stock for Product: ... The Storage Bin can not be changed to an Inventory
Status that does not allow Over Issue". Both fronts below respect this rule: the preventive fix
never applies to a locator that already has stock (a fresh sampledata import never does), and the
corrective fix never flips a locator carrying negative stock — it skips it and reports the
combination for manual physical-inventory correction instead.

**Verification (per tenant):**

```sql
SELECT l.value, l.m_inventorystatus_id, ist.name
FROM m_locator l
JOIN m_inventorystatus ist ON ist.m_inventorystatus_id = l.m_inventorystatus_id
WHERE l.ad_client_id = '<CLIENT_ID>' AND l.isactive = 'Y'
ORDER BY l.value;
-- Gap present if any row shows m_inventorystatus_id = '0' ("Undefined-OverIssue").
```

**Both fronts closed (2026-08-03):**

| Front | Deliverable |
|---|---|
| **Corrective** | `cli/src/data-fixes/sql/20260803T160000Z__R19-locator-inventory-status.sql` — flips every active, status-`0` locator to `'2'` UNLESS it carries any negative-stock `m_storage_detail` row (per-locator granularity: `m_locator.m_inventorystatus_id` is one column per locator, so a locator with even one negative combination is left untouched entirely). A new optional `@report` section (added to the data-fixes framework's parser/runner as part of this fix — see `cli/src/data-fixes/sql/README.md`) lists every skipped locator's product/attribute/UOM/qtyonhand into the ledger's `detail` column, so an operator can find and correct the negative stock before forcing a re-check with `--fix R19-locator-inventory-status --client <id>`. Live-validated in rolled-back transactions: QA Testing (26 status-0 locators → 23 flipped, 3 skipped for negative stock, 445 report rows across those 3 locators' many attribute-set-instance combinations) and GOClient (1 status-0 locator → flipped, 0 report rows). |
| **Preventive** | `referencedata/sampledata/GOClient/M_LOCATOR.xml` (`com.etendoerp.go`) — both bundled locators now ship `M_INVENTORYSTATUS_ID='2'`. `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-08-03T16:00:00Z` in `OnboardingBaselineService.java`. Regression-guarded by `OnboardingDatasetNormalizerTest.testNormalizerLocatorsDefaultToAvailableInventoryStatus`. **Not compiled/run this session** — this worktree cannot build against the module's real Gradle project (known limitation, see `docs/etendo-ad/tenant-remediation-knowledge.md` §ETP-4245 2026-07-06 note); the assertion was hand-verified against the normalizer's mocking convention (`toLowerCamel` property-name derivation) instead. |

**Known limitation (accepted):** because the corrective fix runs at most once per tenant (the
runner's strict watermark never revisits a `PROCESSED` fix), a locator skipped for negative stock
is not automatically retried once the stock is corrected by hand — an operator must force it with
`--fix R19-locator-inventory-status --client <id>`.
## J — Costing

### J1 — New tenants get ZERO `M_Costing_Rule` rows, not Average (ETP-4760, 2026-08-03)

**Symptom:** the ticket was filed as "the costing rule should default to Standard, not Average". Live-DB sweep (etendogoclean, 2026-08-03) shows the actual defect is worse than the ticket's own framing: a freshly onboarded tenant gets **no costing rule at all**, of any algorithm. `M_Transaction.iscostcalculated` stays `'N'` forever for every transaction the tenant records, because there is never a rule for `CostingBackground`/`AverageAlgorithm`/`StandardAlgorithm` to apply.

**Root cause:** `M_COSTING_RULE` was never in `OnboardingDatasetDefinition.INCLUDED_TABLES` (`com.etendoerp.go`). The bundled `referencedata/sampledata/GOClient/M_COSTING_RULE.xml` file existed on disk (with an Average-algorithm row) but was never actually imported for any tenant, because the dataset importer only normalizes tables present in `INCLUDED_TABLES`.

**Live-DB sweep (2026-08-03, etendogoclean, `SELECT count(*) FROM m_costing_rule GROUP BY ad_client_id`):**

| Client | `M_Costing_Rule` rows | Algorithm(s) | `M_Transaction.iscostcalculated` |
|---|---|---|---|
| acreedortest, acreetest2, empresa, Empresa E2E ×4, RolesPresa, TaxesOrg (9 tenants) | **0** | — | `'N'` on 100% of rows (where any transactions exist) |
| GOClient | 2 (1 closed + 1 open) | Average (closed) → **Standard** (open, validated live via the real "Validate Costing Rule" process during this investigation) | `'Y'` |
| F&B International Group | 2 | Average (both open, one per org) | `'Y'` |
| QA Testing | 2 | Average (both open, one per org) | mixed `'Y'`/`'N'` (legacy pre-rule transactions never retroactively costed) |

GOClient's original Average rule (`isvalidated='Y'`, no `M_Costing_Rule_Init` row) was confirmed hand-created by a human at some point — not representative of what onboarding gives a new tenant.

**"Validate Costing Rule" process semantics (observed live, GOClient, 2026-08-03):** running the real process (`org.openbravo.costing.CostingRuleProcessActionHandler`, `obuiapp_process_id=45ED6D0400FD42BEA9771C549A9AE8AB`) closed the old Average rule (`dateto` = the validation instant), inserted+validated a new Standard rule (`datefrom` = same instant), closed all 8 open `M_Costing` anchors (0 remain open — the next transaction per product re-opens its own anchor under the new rule, confirming the documented LAZY migration), and **auto-created 4 `M_Inventory` (Physical Inventory) documents** — one closing + one opening per warehouse — each linked via its own `M_Costing_Rule_Init` row. Migration to the new rule is per-product and lazy: only products with pending/open transactions get a new cost anchor immediately; the rest keep their last anchor under the old rule until their own next transaction. **Acceptance criterion:** do not expect every product to be Standard-costed immediately — the correct criterion is "the client's active/validated rule going forward is Standard."

**Scope decision — SQL-only for the "zero rule" case; existing-Average-rule tenants explicitly excluded:** replicating the real process's Physical Inventory document creation (sequences, doc types, lines, workflow, posting) in hand SQL would be a materially bigger, riskier lift than this data-fixes framework is meant for, and `@type: webhook` execution is not implemented in `run.js` yet (see `docs/etendo-ad/tenant-remediation-knowledge.md`). A brand-new tenant with zero products/transactions has no prior rule to close and no inventory to reconcile, so cloning an already-validated Standard rule directly is safe there. F&B International Group and QA Testing (the only tenants left with an existing Average rule after this fix) are deliberately **excluded** by the corrective fix's `@check`/`@apply` and flagged for a manual "Validate Costing Rule" run via the UI by an accounting admin.

**Single-org restriction (QA finding, addressed same day, 2026-08-03):** the fix inserts one row with `org_dimension='N'` (a whole-client rule), but that row still carries exactly one `ad_org_id`. Etendo core's actual lookup (`CostingUtils.getCostDimensionRule` / `CostingServer.getOrganization()`) is an **exact match** on `ad_org_id` with no client-wide fallback. An earlier revision of this fix picked "the oldest non-`*` org" for any zero-rule tenant, assuming the choice was irrelevant for a whole-client rule; QA traced the core lookup and showed that a hypothetical future zero-rule tenant with **multiple Legal Entities** would get transactions under every OTHER legal entity hard-failing with `NoCostingRuleFoundForOrganizationAndDate` instead of today's silent gap — worse than the defect being closed. No currently-matched tenant is multi-org (all 9 have exactly one non-`*` org, re-verified after the fix), so this was a latent assumption, not an active bug on this DB. The fix now requires `(SELECT COUNT(*) FROM ad_org WHERE ad_client_id=:client_id AND name<>'*') = 1` in **both** `@check` and `@apply`. A future multi-org zero-rule tenant falls through to the same "needs manual handling" bucket as the existing-rule tenants — multi-org costing-rule seeding is explicitly out of scope here, not silently mishandled.

**Both fronts closed (2026-08-03):**

| Front | Deliverable |
|---|---|
| **Corrective — "zero rule", single-org tenants** | `cli/src/data-fixes/sql/20260803T180000Z__R20-default-standard-costing-rule.sql` — inserts one active, validated, whole-client Standard `M_Costing_Rule` (no `M_Product_Id`/`M_Product_Category_Id`, `org_dimension='N'`, `warehouse_dimension='N'`, `datefrom`=the tenant's own `AD_Client.created`) for the tenant's operative org, guarded `NOT EXISTS (... isactive='Y' AND isvalidated='Y')` (no existing validated rule of any algorithm) AND exactly one non-`'*'` org for the client (see single-org restriction above). Live-verified in a rolled-back transaction against "empresa": insert succeeds, immediate re-run inserts 0 rows (idempotent); F&B's 623-org count independently confirmed to trip the new guard. Dry-run across the fleet: 9 `WOULD_APPLY`, GOClient/F&B/QA Testing `SKIPPED_NOT_NEEDED` — identical to before the guard was added, since all 9 matched tenants are single-org. |
| **Corrective — existing-Average-rule tenants (F&B, QA Testing)** | **Deliberately NOT auto-fixed.** Flagged for a manual "Validate Costing Rule" run via the classic UI by an accounting admin, once confirmed relevant for those tenants — see the scope decision above. |
| **Corrective — future multi-org zero-rule tenants (none exist today)** | **Deliberately NOT auto-fixed.** `@check` excludes them (COUNT of non-`'*'` orgs ≠ 1); would need per-Legal-Entity rule seeding, out of scope for this fix. |
| **Preventive** | `M_COSTING_RULE` added to `OnboardingDatasetDefinition.INCLUDED_TABLES`; `referencedata/sampledata/GOClient/M_COSTING_RULE.xml`'s `M_COSTING_ALGORITHM_ID` changed from Average (`B069080A0AE149A79CF1FA0E24F16AB6`) to Standard (`6A39D8B46CD94FE682D48758D3B7726B`) — `isvalidated`/`isactive` were already `'Y'`. `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-08-03T18:00:00Z` in `OnboardingBaselineService.java`. Regression-guarded by `OnboardingDatasetNormalizerTest.testNormalizerIncludesValidatedStandardCostingRule`. |

**Open question, not blocking (per the ticket's own allowance):** whether `iscostcalculated='N'` on a tenant with no rule at all blocks document posting was not conclusively confirmed this session — worth a follow-up check, but every symptom observed (transactions exist and post; only the cost-calculation flag stays `'N'`) suggests it is a background/async concern rather than a synchronous posting blocker.

---

## K — Accounting Dimension Display Configuration

### K1 — `AD_Client.Acctdim_Centrally_Maintained` hardcoded to `'Y'`, making "Dimensiones contables" a no-op (ETP-4854, 2026-08-11)

**Symptom:** the "Dimensiones contables" screen (General Ledger Configuration,
`GeneralLedgerConfigurationHandler.applyDimensionChanges`) is a flat ON/OFF toggle list per
accounting dimension. Toggling it appears to succeed (no error, the value is saved), but has
**zero effect** on whether the corresponding field actually shows on any document for most
tenants.

**Root cause:** `AD_Client.Acctdim_Centrally_Maintained` selects which of TWO mechanisms
`DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()` (classic Etendo core) embeds
into every `@ACCT_DIMENSION_DISPLAY@` field's display-logic JS:

- `'N'` — flat, level-agnostic: reads `C_AcctSchema_Element.IsActive` per dimension
  (`elementtype` ∈ `OO`/`PJ`/`BP`/`PR`/`CC`/`U1`/`U2`), the SQL schema default (every element row
  defaults `isactive='Y'`). **This is the ONLY mechanism `GeneralLedgerConfigurationHandler
  .applyDimensionChanges` writes to** — confirmed by reading the handler: it loads/saves
  `AcctSchemaElement.IsActive` exclusively, never anything on `AD_Client`.
- `'Y'` — fine-grained per-document-type/level matrix: reads
  `AD_Client.<Dim>_Acctdim_IsEnable/Header/Lines/Breakdown` (or a per-doctype
  `ADClientAcctDimension` override row, if present) — a classic multi-entity feature Etendo GO
  never built a screen for.

`InitialSetupUtility.java` (~L159, invoked by `InitialClientSetup`, called from
`EtendoGoJwtServlet.resolveOrCreateClient` upstream of the rest of the onboarding chain)
hardcodes `newClient.setAcctdimCentrallyMaintained(true)` for EVERY new client — so every tenant
born through the real onboarding flow ends up `'Y'`, permanently locked out of the only mechanism
Etendo GO has a working screen for.

**Live-DB evidence (2026-08-11, etendogoclean, 17 clients):** 14 real tenants are `'Y'`; only
`GOClient`, `QA Testing`, and `System` are `'N'`. Critically, `C_AcctSchema_Element.isactive` is
ALREADY `'Y'` for CostCenter/User1/User2/Project on almost every `'Y'` client, even though every
one of them has `<Dim>_Acctdim_IsEnable = 'N'` for those same dimensions (Project on 12 of 14) —
confirming that a naive flip to `'N'` WITHOUT a backfill would suddenly show fields that are
currently hidden for nearly every tenant. Org/BPartner/Product are the opposite case (`IsEnable`
and `Header`/`Lines` already `'Y'` on every client, matching their already-`'Y'` `isactive`) — a
no-op for those three.

**Backfill rule:** since flat `'N'` mode has no level distinction (one flag governs Header, Lines
AND Breakdown simultaneously), the fix computes, per dimension, `effective = IsEnable='Y' AND
(Header='Y' OR Lines='Y' OR Breakdown='Y')` — erring toward NOT hiding a field the client
currently sees on any level/doctype — and sets `C_AcctSchema_Element.isactive` to match before
flipping the mode flag, in the same transaction.

**Safety (confirmed, not assumed):** grepped every Java/XML consumer of this flag repo-wide.
Classic core: only `DimensionDisplayUtility`/`LoginUtils`/`InitialSetupUtility`. Etendo GO: only
`NeoDisplayLogicHelper.resolveAccountingDimensionFlags` (com.etendoerp.go) — a faithful mirror of
the classic 'N'/'Y' branching, including its own documented ETP-4529 caveat that the `'N'` branch
is the one it evaluates most reliably per-request (no HTTP session to piggyback on, unlike
classic `LoginUtils`). No security/accounting-posting/compliance code path reads this flag — it
governs ONLY whether an accounting-dimension input field is shown or hidden on a form.

**Both fronts closed (2026-08-11):**

| Front | Deliverable |
|---|---|
| **Corrective** | `cli/src/data-fixes/sql/20260811T120000Z__R23-acctdim-centrally-maintained.sql` — backfills `C_AcctSchema_Element.isactive` per elementtype from the client's current effective config, then flips `Acctdim_Centrally_Maintained` to `'N'`, both in one `@apply`, scoped to `:client_id`. Live-validated: dry-run across all 16 real tenants → 14 `WOULD_APPLY` / 2 `SKIPPED_NOT_NEEDED` (GOClient, QA Testing already `'N'`); a rolled-back transaction against "empresa" confirmed the exact expected before/after state (Org/BPartner/Product stay `'Y'`; CostCenter/Project/User1/User2 flip to `'N'`); a real run against acreedortest (`D94AED60C3E0494AAFD44B8A05BB5CFC`) → `APPLIED (5 rows)` → re-run → `SKIPPED_NOT_NEEDED — kept prior success state`. |
| **Preventive** | `OnboardingAcctdimCentrallyMaintainedService.forceFlatAccountingDimensionVisibility`, wired as the new step in `EtendoGoJwtServlet.ensureOnboardingDataset` right after `patchBpGroupAcctMissingColumns` and before the baseline stamp — applies the IDENTICAL backfill-then-flip logic in lockstep with the corrective SQL. `ONBOARDING_PROVISIONED_THROUGH` bumped to `2026-08-11T12:00:00Z` in `OnboardingBaselineService.java`. |

**Out of scope, noted for completeness:** `schema_forge_core` (the sibling platform-tooling repo)
also carries a `cli/src/data-fixes/sql/` directory per the repo-topology note, but on this local
checkout it is a stale mirror (tops out at `R8`, not kept in sync with `R9`–`R22` shipped after
the repo split) and is not on a branch related to this ticket — no changes were made there. If it
needs reconciling with the current fix catalog, that is a separate task.

---

## L — Tenant Ownership

### L1 — Pre-existing tenants have no `AD_User` flagged as owner (`EM_ETGO_Is_Owner`, ETP-4830)

**Symptom:** `AD_User.EM_ETGO_Is_Owner` (`char(1)`, `NOT NULL DEFAULT 'N'`) is a new extension
column on core's `AD_User` table (ETP-4830, added via the `/etendo:alter-db` webhook mechanism —
same convention as `AD_Role.EM_ETGO_Show_Acct_Fields`) that flags the ONE user who completed
self-service registration for a client, that client's "owner" — used to lock down PUT/PATCH and
role-reassignment on that user's own `AD_User` record to the owner alone. Because the column
defaults `'N'`, every tenant provisioned BEFORE this column shipped reads back with **zero**
owner-flagged users, so both enforcement checks
(`UserRoleAssignmentHandler#rejectNonOwnerEditingOwner`,
`UserRoleCompositionService#enforceOwnerProtection`) are silent no-ops for them — not a security
hole (nothing is left more permissive than before this ticket), just a feature that has not yet
reached tenants that already existed.

**Root cause:** the column is only auto-set going forward, once, right after
`EtendoGoJwtServlet#createClient` provisions a BRAND NEW client
(`OwnerSupport#markAsOwnerIfNoneExists`, idempotent — a no-op once a client already has an owner).
There is no equivalent write for a tenant that already existed before this shipped. This is the
same "preventive-only, corrective not yet done" shape as **A2c**/**K1** above, not a design defect
— the retroactive "who is the real owner" heuristic for an already-provisioned tenant is a data
judgment call, not something safe to infer and apply silently.

**Where it should be fixed:** a one-time backfill data-fix (Remedy's domain,
`cli/src/data-fixes/`), **NOT yet written as of this writing.** Candidate heuristic — **NOT yet
human-confirmed; do not run against real tenant data before it is sanity-checked** — the
earliest-created `is_client_admin`-holding `AD_User` per client, ordered by `CREATED` ascending.

The full mechanism (assignment point, both enforcement paths, rollout/no-op-until-backfilled
behavior) is documented in `com.etendoerp.go`'s `docs/neo-headless.md` §7 item 10 — deliberately
not repeated here in full, to avoid a second copy that can drift; this entry exists only to route
the still-open corrective half through the same catalog every other two-front gap in this document
uses, per this repo's own root `CLAUDE.md` convention ("Etendo AD findings go in
`docs/etendo-ad/`, NOT in per-window artifacts").

**Status:** preventive front shipped (2026-08-20, ETP-4830); corrective backfill **NOT YET
IMPLEMENTED** — flagged here per this document's own "flag, don't silently skip" convention.

---

## Recommended Order of Operations

Consolidated from the field checklist; covers A1–C2. D1 and E1 are addressed inside the Initial Client Setup process itself.

1. Create the client and organization from the UI.
2. Set `isperiodcontrolallowed='Y'` and `ad_periodcontrolallowed_org_id` in `ad_org` (they do not depend on the calendar).
3. Create the calendar from the UI (only the record — no years or periods yet).
4. Set `c_calendar_id` and `ad_inheritedcalendar_id` in `ad_org` with the just-created calendar ID.
5. Create the calendar years and periods from the UI.
6. Insert the 2 `AD_ORG_TREE` rows.
7. Populate the full chart of accounts (or use *Initial Organization Setup*).
8. Set the default account for the AC dimension.
9. Verify `c_periodcontrol` has the 516 rows; if not, insert them.
10. Open periods from the UI: *Open/Close Period Control → Open Period*.
11. Verify denormalized legal-entity columns are populated (D1); recompute if NULL.
12. Verify tenant users have `AD_User.ad_org_id` set to their own org, not `'0'` (E1).

---

## Coverage Gaps (not yet validated in the field)

These areas are commonly required to provision a fully working new client but were **not** exercised by the `TaxesOrg` invoice-flow validation above. Listed as candidates for a follow-up pass — verify against your environment before assuming they are missing:

| Area | Why it matters |
|---|---|
| `AD_ClientInfo` | Required per client; many services fail silently if absent. |
| `AD_OrgInfo` | Required for legal-entity orgs; several fiscal/SII fields and posting logic read from it. |
| `C_DocType` + `AD_Sequence` | Document types and their sequences must exist or invoice/order creation throws "Document type not found" / sequence errors. |
| `M_PriceList` / `M_PriceList_Version` | Invoices require a price list. |
| `M_Warehouse` / `M_Locator` / `M_Warehouse_Acct` | Required for any inventory-touching document and its posting. |
| `AD_Role_OrgAccess` | An org with no role access is unreachable (distinct from the E1 session-org issue). |
| `C_BPartner` / `C_BPartner_Location` (self/system BP) | Needed by several document flows. |

> **Reminder:** all SQL fixes in this document are manual DB changes. To persist across rebuilds they must be reflected in the module's source data (`export.database`) — a raw SQL fix alone does not survive a clean install.

## Related Tickets and References

| Reference | Notes |
|-----------|-------|
| **ETP-4177** | NULL denormalized legal-entity columns (`AD_LegalEntity_Org_ID`, `AD_CalendarOwner_Org_ID`) on orgs provisioned via GO onboarding (finding D1) |
| System-level taxes approach | `c_tax.ad_client_id='0'` — taxes defined at the system level are shared across all clients. With the `*_acct` tables correctly populated (A2), tax accounting resolves independently per client. |
| `../proposals/initial-organization-setup-accounting.md` | The proposal that automates A1 and A2 — introduces `resolveAccountingPackage`, `applyAccountingPackageWiring`, and `validateAccountingPackage` inside `InitialOrgSetup.java`. Its acceptance criteria require `C_ACCTSCHEMA_DEFAULT`, `C_ACCTSCHEMA_GL`, and the `*_acct` tables to be properly wired before `AD_Org_Ready` is called. |
| `NeoAuthenticator` (E1) | A defensive guard already exists so the system resolves the correct org when `organization='0'` arrives from the JWT. The structural recommendation (E1) is to fix the root cause at user-creation time, not rely on the guard. |
