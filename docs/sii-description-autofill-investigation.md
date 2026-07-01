# SII Description Auto-fill Failure — TaxesOrg (ETP-4177) — RESOLVED

> **Status: RESOLVED (2026-06-10).** The root cause was a **data inconsistency in TaxesOrg's organization setup** (`AD_Org.AD_LegalEntity_Org_ID` was NULL), **not** a bug in the SII callout, NEO Headless, or `OBContext` security.
>
> This document supersedes the original investigation. Its leading hypotheses (admin-mode filters, client filter, the SII callout needing a security bypass) were **all disproven** — see [Disproven hypotheses](#disproven-hypotheses-do-not-re-chase) so they are not re-chased.

---

## Symptom

When `tax@es` creates a new **sales invoice** for **TaxesOrg** in the Etendo Go app, these fields stay **empty**:
`em_aeatsii_descripcion_sii` (Descripción SII), `em_aeatsii_description_id`, `em_aeatsii_clave_tipo` (Clave tipo), `em_aeatsii_estado`.

For **GOOrg** (`goadmin@etendo.software`) the same fields auto-fill (`Ventas` / `F1` / `PE`).

| Entity | ID |
|--------|-----|
| TaxesOrg (AD_Org) | `DB294FB926884F33A253D6F0FB28DF8B` |
| TaxesClient | `F226CBA6FFA549F6B8D90FF8064C6727` |
| GOOrg (AD_Org) | `61849243BE89460EB70866880A545D50` |
| GOClient | `802509E12436405C86BA1FD5B1DF508C` |

---

## Root cause (confirmed)

The `em_aeatsii_*` fields are populated by **`@SQL=` column defaults** on `C_Invoice` — **not** by the `SiiInvoiceOrganizationCallout`. (That callout `D07E6A38…` is registered but **not** attached to `AD_Org_ID`; the column's callout is the core `org.openbravo.erpCommon.ad_callouts.SE_Invoice_Organization`.)

All four SII column defaults share the same outer guard:

```sql
WHEN (SELECT c.insiisystem FROM aeatsii_config c
      WHERE c.ad_org_id = ad_get_org_le_bu(@AD_Org_ID@,'LE')) = 'Y'
THEN (...) ELSE null END
```

`AD_GET_ORG_LE_BU(org,'LE')` does **not** walk the org tree — it reads the denormalized column **`AD_Org.AD_LegalEntity_Org_ID`** directly (see `src-db/database/model/functions/AD_GET_ORG_LE_BU.xml`). On TaxesOrg that column was **NULL** (on GOOrg it is the org's own id). So the guard returned NULL → `NULL = 'Y'` is false → every SII default collapsed to `null`:

```
TaxesOrg.AD_LegalEntity_Org_ID = NULL        (isready='Y' but column never populated)
  → ad_get_org_le_bu('DB294…','LE') = NULL
    → guard (insiisystem='Y') = NULL → CASE → null
      → Descripción / Clave Tipo / Description_ID / Estado  ALL null
```

The `aeatsii_description` row, the session client/org (`@ad_client_id@='F226…'`, `@AD_Org_ID@='DB294…'`), the OBContext readable-sets, and the callout were **all fine and irrelevant**.

### Decisive evidence (NEO default-resolution log)

For both orgs the `@param@` tokens resolved correctly; only the shared guard differed:

| column | GOOrg result | TaxesOrg result |
|--------|--------------|-----------------|
| `EM_Aeatsii_Description_ID` | `9192FB7D…` | `null` |
| `EM_Aeatsii_Descripcion_Sii` | `Ventas` | `null` |
| `EM_Aeatsii_Clave_Tipo` | `F1` | `null` |
| `EM_Aeatsii_Estado` | `PE` | `null` |
| `ad_get_org_le_bu(org,'LE')` | `61849…` (itself) | **`NULL`** |

All four SII fields fail together for TaxesOrg — including `Clave_Tipo` — which is the tell that the shared `AD_LegalEntity_Org_ID`-keyed guard, not any per-field logic, is the cause.

> The original note observed "clave_tipo=F1 but descripción empty" on some older TaxesOrg invoices. That was a **red herring** from comparing invoices created in different states (classic UI / a moment when the column was populated). Once `AD_LegalEntity_Org_ID` is NULL, all four collapse together.

---

## Disproven hypotheses (do not re-chase)

- ❌ **"`setAdminMode()` disables the org filter but keeps the client filter."** `OBContext.setAdminMode()` disables **neither** OBCriteria filter — it only skips the entity-access *exception* check. See `OBCriteria.initialize()` (`src/org/openbravo/dal/service/OBCriteria.java:188-203`): the readable-org / readable-client `IN (...)` filters are always added unless `setFilterOnReadable*(false)` is called explicitly.
- ❌ **"Query 2 (`AEATSIIDescription` in the callout) returns empty due to a client/org filter."** The callout is not the population mechanism at all; the `@SQL=` defaults are. The description sub-query returns `Ventas` with the correct client.
- ❌ **"The SII callout needs a security bypass implemented in `com.etendoerp.go`."** No Go code change was warranted. NEO faithfully executes the AD `@SQL=` defaults, which correctly return null for a mis-configured org.

---

## The fix (data)

Repair TaxesOrg's "Set as Ready" denormalization, mirroring exactly what the core `AD_ORG_READY` process computes (`src-db/database/model/functions/AD_ORG_READY.xml`, non-recursive branch):

```sql
UPDATE ad_org
SET ad_legalentity_org_id   = ad_get_org_le_bu_treenode(ad_org_id,'LE'),   -- → DB294…
    ad_businessunit_org_id  = ad_get_org_le_bu_treenode(ad_org_id,'BU'),   -- → null (same as GOOrg)
    ad_calendarowner_org_id = ad_org_getcalendarownertn(ad_org_id)         -- → DB294…
WHERE ad_org_id = 'DB294FB926884F33A253D6F0FB28DF8B';
```

After this: `ad_get_org_le_bu('DB294…','LE') = DB294…`, the guard returns `Y`, and the description default returns `Ventas`. All four SII fields auto-fill, matching GOOrg.

This repair persists across normal rebuilds. It also fixes everything else keyed on the legal entity for TaxesOrg (accounting-schema and tax resolution), not only SII.

---

## Deeper root cause — Etendo GO Client Setup

TaxesClient / TaxesOrg were provisioned by **Etendo GO's onboarding ("Client Setup")**, which is where the inconsistency originates. The GO steps `com.etendoerp.go.onboarding.steps.MarkOrgReadyStep` and `OnboardingMarkOrgReadyService.markOrgReady` run the core `AD_Org_Ready` process and then **defensively force `org.setReady(true)`** if the process didn't. That fallback can leave `isready='Y'` while the PL/SQL denormalization (`AD_LegalEntity_Org_ID`, `AD_CalendarOwner_Org_ID`) never persisted — most likely a transaction-boundary issue between the `ProcessRunner` connection and the OBDal/Hibernate connection.

This is tracked for the onboarding owner (Seba) in the Obsidian note **`Projects/etendo/Initial Client Etendo GO, for Seba.md`** → *Update 2026-06-10*, with the precise code pointers, the transaction/masking hypothesis, the recommended onboarding fix (verify `AD_LegalEntity_Org_ID` is non-null after the process; never mark ready blindly), and a tenant-wide detection query:

```sql
SELECT c.name AS client, o.name AS org, o.ad_org_id
FROM ad_org o
JOIN ad_orgtype ot ON o.ad_orgtype_id = ot.ad_orgtype_id
JOIN ad_client  c  ON o.ad_client_id  = c.ad_client_id
WHERE o.isready = 'Y' AND ot.islegalentity = 'Y'
  AND o.ad_legalentity_org_id IS NULL AND o.ad_org_id != '0';
```

---

## Verification — TaxesOrg now matches GOOrg across all `AD_ORG_READY` outputs

| `AD_ORG_READY` output | GOOrg | TaxesOrg (post-fix) |
|---|---|---|
| `isready` / `isperiodcontrolallowed` | Y / Y | Y / Y |
| `ad_legalentity_org_id` | self | self ✓ (fixed) |
| `ad_businessunit_org_id` | null | null |
| `ad_periodcontrolallowed_org_id` | self | self |
| `ad_calendarowner_org_id` | self | self ✓ (fixed) |
| `ad_inheritedcalendar_id` (consistent with owner) | yes | yes |
| `C_PeriodControl` rows | 516 (12 periods × 43 docbasetypes) | 516 |
| `ad_org_tree` closure rows | present | present |

No remaining `AD_ORG_READY` side-effect is missing for TaxesOrg.

---

## Files of interest

```
# The actual mechanism (AD @SQL= column defaults + denormalized legal-entity column)
src-db/database/model/functions/AD_GET_ORG_LE_BU.xml            # reads AD_Org.AD_LegalEntity_Org_ID (ready-only)
src-db/database/model/functions/AD_GET_ORG_LE_BU_TREENODE.xml   # tree-walking variant (used by AD_ORG_READY)
src-db/database/model/functions/AD_ORG_READY.xml                # computes/persists the denormalized columns
AD_Column.defaultvalue for C_Invoice.EM_Aeatsii_*              # the @SQL= defaults

# NEO default resolution (executes the @SQL= defaults; behaves correctly — no fix needed)
modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoDefaultsService.java   # resolveSQLDefault()

# Where the inconsistency is introduced (for the onboarding owner)
modules/com.etendoerp.go/src/com/etendoerp/go/onboarding/steps/MarkOrgReadyStep.java
modules/com.etendoerp.go/src/com/etendoerp/go/onboarding/OnboardingMarkOrgReadyService.java
modules/com.etendoerp.go/src/com/etendoerp/go/onboarding/steps/CreateOrgStep.java

# NOT the cause (ruled out)
modules/org.openbravo.module.sii/src/.../callouts/SiiInvoiceOrganizationCallout.java  # not wired to AD_Org_ID
src/org/openbravo/dal/service/OBCriteria.java                                          # adminMode doesn't disable filters
```
