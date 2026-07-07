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
| B1 | Organization hierarchy | "Lines org does not depend on header org" on same-org invoice | *Set Organization as Ready* — populate `AD_ORG_TREE` | — |
| C1 | Period control | *Open/Close Period Control* is empty; posting fails (no open periods) | Set `isperiodcontrolallowed` and calendar fields before creating periods | — |
| C2 | Period control | `c_periodcontrol` rows not created by trigger | Set `isperiodcontrolallowed='Y'` and `ad_inheritedcalendar_id` before creating periods | — |
| D1 | Legal entity | SII fields empty; legal-entity resolution returns NULL | *Initial Client Setup* — verify/recompute `AD_LegalEntity_Org_ID` after `AD_Org_Ready` | ETP-4177 |
| E1 | Session / user | Session org stuck at `*`; handlers look in org `'0'` | Onboarding — set `AD_User.ad_org_id` to tenant org at user creation | — |

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
| **TC-39** (Tables tab) | ✅ Already correct | All 11 required tables (`C_Invoice`→`Invoice`, `FIN_Payment`, `FIN_BankStatement`, `FIN_Finacc_Transaction`, `FIN_Reconciliation`, `GL_Journal`→`FinancialMgmtGLJournal`, `M_InOut`→`MaterialMgmtShipmentInOut`, `M_Inventory`→`MaterialMgmtInventoryCount`, `M_MatchInv`→`ProcurementReceiptInvoiceMatch`, `M_Movement`→`MaterialMgmtInternalMovement`, `M_Production`→`MaterialMgmtProductionTransaction`) are `isactive='Y'` on `c_acctschema_table`. |
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
| Cancelaciones * (Write-off) | `writeoff_acct` | `69400000` | Pérdidas por deterioro de créditos por operaciones comerciales | ✅ already correct — **NOT changed to the screenshot's 65000000** (override, see below) |
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

**Write-off override (explicit product-owner decision — do not "re-fix"):** the screenshot shows
Cancelaciones/Write-off = `6500000000` (65000000, "Pérdidas por créditos comerciales incobrables").
The product owner explicitly confirmed the **DB's existing value (`69400000`) is correct** and must
**not** be changed to `65000000`. GOClient's simplified chart reuses the same account (694, "Pérdidas
por deterioro de créditos por operaciones comerciales") for both the write-off and the bad-debt
expense default — this is a deliberate business decision, not a provisioning gap. Confirmed live:
`writeoff_acct` already resolved to `c_validcombination` `997A522BF1124E029E99AB31CF2540F9` = account
`69400000` before this fix ran, and R11's `@check`/`@apply` never reference `writeoff_acct`.

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
