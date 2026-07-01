# Etendo GO — Onboarding Gaps When Creating a New Client

These are field-validation findings from creating a new client/org (`TaxesOrg`) to validate the invoice flow and system-level taxes (`c_tax.ad_client_id='0'`) in Etendo GO. Creating a client from the UI leaves several areas unconfigured, which leave the client unable to complete or post documents. Each finding below has: **Symptom → Root cause → SQL fix → Where it should be fixed in the onboarding flow.** Note that in production the accounting gaps (A1/A2) are intended to be solved by the *Initial Organization Setup* process — see `../proposals/initial-organization-setup-accounting.md`.

## Summary

| ID | Area | Symptom (short) | Where it should be fixed | Ticket |
|----|------|-----------------|--------------------------|--------|
| A1 | Accounting | Posting fails — chart of accounts missing | *Initial Organization Setup* / SQL clone | — |
| A1b | Accounting | Posting account codes are < 8 digits; ETP-4247 feature fails | Onboarding sampledata XML (`C_ELEMENTVALUE.xml`) — pad codes to 8 digits | ETP-4247 |
| A2 | Accounting | "Account Not Defined" even with ledger present | *Initial Organization Setup* — auto-populate `*_acct` tables | — |
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
