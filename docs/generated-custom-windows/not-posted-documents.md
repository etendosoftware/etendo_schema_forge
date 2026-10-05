# Not Posted Documents

## Intent

Use this window to find and mass-post all accounting documents that are still pending posting across the organization. It aggregates unposted documents of every **supported** type into a single cross-document list, lets the user filter by type, accounting status and date range (auto-applied, last 12 months by default), shows each row's accounting status as a badge, and exposes **Abrir documento** / **Contabilizar** per row (hover) plus a bulk **Contabilizar** in the floating selection toolbar.

Since ETP-5591 the page follows the standard list pattern and is built only from shared pieces (`DistinctValuesFilter`, `DateRangePopover`, `DataTable`, `ListSortPopover`, `RefreshButton`, `SelectionToolbar`, `Tag`) — see "Frontend component" below.

The window has no backing AD window — it is 100% custom. Data is served by `NotPostedDocumentsHandler` (`@Named("not-posted-documents")`), which delegates to `NoPostedDocumentDS` from `bulk.posting-3.0.0.jar`.

---

## Document type accounting support

Not every document type in `ETBLKP_Documents` (`AD_Reference_ID = DE94535164E741AB9B1A560EF3F72854`) can actually be posted in a standard Etendo + APRM installation, and 5 more are excluded globally by product decision. The table below is the authoritative reference.

The **enabled** column reflects two mechanisms combined:
1. A **dynamic** check: the code's `AD_Table_ID` (from `DOCUMENT_TYPE_CODE_TO_TABLE_ID` in `NotPostedDocumentsHandler.java`) must appear in `SELECT DISTINCT ad_table_id FROM c_acctschema_table WHERE isactive = 'Y'`, evaluated at request time.
2. A **static** exclusion: the code's `AD_Table_ID` must NOT be in `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS` — a hardcoded set of table ids that are always hidden regardless of the dynamic check.

(A legacy `ENABLED_DOCUMENT_TYPE_CODES` set existed in earlier revisions and has been fully replaced by this dynamic-check + static-exclusion combination — see commits `27caeaf1`, `44b5e179`, `ad210c51`, `4bf31a1e` in `com.etendoerp.go`.)

**ETP-4948:** the predicate itself (the dynamic check + the static exclusion set) was extracted out of `NotPostedDocumentsHandler` into a shared static utility, `com.etendoerp.go.schemaforge.util.AccountingDocumentTypeSupport` (`isTableAccountingRelevant`/`isAprmDisabledTable`/`loadTablesWithActiveAccounting`), so the Calendar window's `documents` entity (`PeriodControlDocOpenCloseHandler`) can reuse the exact same rule — see [`calendar.md`](calendar.md#documents-entity-open-close-period-control-spec--c_periodcontrol-per-document-type-rows) for that side. `NotPostedDocumentsHandler` keeps its own `DOCUMENT_TYPE_CODE_TO_TABLE_ID` map (its own "ETBLKP_Documents" code vocabulary, plus `DS_LABEL_TO_DOCUMENT_TYPE_CODE` to translate datasource labels into it — ETP-5591) and now calls the shared utility instead of maintaining its own copy of the exclusion set — the two windows can no longer silently drift apart on what counts as accounting-relevant, even though they key the same underlying tables by two different document-type code vocabularies.

| Code | Name | AD_Table | AD_Table_ID | In c_acctschema_table? | Posting status | **Enabled** | Reason |
|------|------|----------|-------------|------------------------|----------------|:-----------:|--------|
| `A`   | Amortization             | `A_Amortization`          | `800060` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `BMP` | Bill of Materials Prod.  | `M_Production`            | `325` | ✅ isactive=Y | ✅ Working | ❌ | **Globally excluded (ETP-4452)** — see below |
| `BS`  | Bank Statements          | `FIN_BankStatement`       | `D4C23A17190649E7B78F55A05AF3438C` | ✅ isactive=Y | ❌ All D (100%) | ❌ | APRM posts via Transaction, not BankStatement |
| `CA`  | Cost Adjustment          | `M_CostAdjustment`        | `D022B92163074E5E82449C8E0B5AFDF6` | ✅ isactive=Y | ⚠️ 0 documents | ❌ | **Globally excluded (ETP-4452)** — see below |
| `DD`  | Doubtful Debt            | `FIN_Doubtful_Debt`       | `30721072789F410E9606D2235CB2A226` | ✅ isactive=Y | ⚠️ 0 documents | ❌ | **Globally excluded (ETP-4452)** — see below |
| `GLJ` | G/L Journal              | `GL_Journal`              | `224` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `GR`  | Goods Receipt            | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `GS`  | Goods Shipment           | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `IC`  | Internal Consumption     | `M_Internal_Consumption`  | `800168` | ✅ isactive=Y once activated (row always existed, shipped `N`) | ✅ Postable (ETP-5445) | ✅ | **ETP-5445** — see below. Dynamic: appears only on tenants whose `800168` row is active (GOClient reference data for new tenants, data-fix R40 for existing ones) |
| `INV` | Inventory                | `M_Inventory`             | `321` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `LC`  | Landed Cost              | `M_LandedCost`            | `082F967CDF7245EB9A150941F326C45C` | ✅ isactive=Y | ✅ Working (N records) | ❌ | **Globally excluded (ETP-4452)** — see below |
| `LCC` | Landed Cost Cost         | `M_LC_Cost`               | `55A984C314FD4C4FB5E7C32DE36BB07B` | ✅ isactive=Y | ✅ Working (N records) | ❌ | **Globally excluded (ETP-4452)** — see below |
| `MI`  | Matched Invoices         | `M_MatchInv`              | `472` | ✅ isactive=Y | ✅ Working (E+i+p+Y) | ✅ | — |
| `M`   | Movements                | `M_Movement`              | `323` | ✅ isactive=Y | ✅ Working (Y records) | ✅ | — |
| `PIN` | Payment In               | `FIN_Payment`             | `D1A97202E832470285C9B1EB026D54E2` | ✅ isactive=Y | ❌ 99.9% D | ❌ | APRM: payment accounting via Transaction |
| `POT` | Payment Out              | `FIN_Payment`             | `D1A97202E832470285C9B1EB026D54E2` | ✅ isactive=Y | ❌ 99.9% D | ❌ | APRM: payment accounting via Transaction |
| `PI`  | Purchase Invoice         | `C_Invoice`               | `318` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `R`   | Reconciliation           | `FIN_Reconciliation`      | `B1B7075C46934F0A9FD4C4D0F1457B42` | ✅ isactive=Y | ❌ 89% D | ❌ | APRM: reconciliation accounting via Transaction |
| `RMR` | Return Material Receipt  | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `RVS` | Return to Vendor Ship.   | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `SI`  | Sales Invoice            | `C_Invoice`               | `318` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `T`   | Transaction              | `FIN_Finacc_Transaction`  | `4D8C3B3C31D1410DA046140C9F024D17` | ✅ isactive=Y | ✅ Working (N+E+Y records) | ✅ | APRM primary posting table |
| `WE`  | Work Effort              | `M_Production`            | `325` | ✅ isactive=Y | ✅ Working | ❌ | **Globally excluded (ETP-4452)**, with BMP — bulk.posting emits "Work Effort" from its production search, so these are `M_Production` records. Mapped to `486` (`S_TimeExpense`) until ETP-5591, which would have posted them against the wrong table once the label got a code |

### Why APRM disables BS, PIN, POT, R

Etendo's Advanced Payables & Receivables Management (APRM) module routes all financial accounting through `FIN_Finacc_Transaction` (code `T`). When a payment, bank statement, or reconciliation document is created via APRM, the system immediately sets `POSTED = 'D'` on those records — signalling that direct bulk-posting is disabled for them. The `FIN_Finacc_Transaction` records are what actually carry the accounting entries.

### Global exclusion of BMP, DD, LC, LCC, CA (ETP-4452)

Unlike the APRM codes above, `BMP` (Bill of Materials Production), `DD` (Doubtful Debt), `LC` (Landed Cost), `LCC` (Landed Cost Cost) and `CA` (Cost Adjustment) are **not** APRM-managed — their backing tables have active `c_acctschema_table` entries and some tenants genuinely post documents against them. They are excluded by an explicit **product decision** (ETP-4452), applied globally for ALL tenants.

**Accepted tradeoff:** this hides legitimate not-posted documents for tenants that have these types actively configured for posting — confirmed cases include QA Testing and F&B International Group. The product owner accepted this tradeoff; it is not a bug and must not be "fixed" by removing the corresponding table id from `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS` without a new product decision.

**ETP-4948:** the product owner confirmed the same 5 exclusions also apply to Calendar's `documents` entity, in that window's own DocBaseType code space (`MMP`, `DDB`, `LDC`, `LCC`, `CAD` — same underlying tables, different codes) — see `calendar.md`. No divergence between the two windows' document-type universes is intended.

To re-enable any of the 5 (e.g. a future decision to scope the exclusion per-tenant instead of globally), remove its table id from `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS` in `com.etendoerp.go.schemaforge.util` — this affects BOTH windows at once, by design.

### One label → code map, one code → table map (ETP-5591)

Each grid row arrives from `NoPostedDocumentDS` with a raw English **label** (`"Sales Invoice"`,
`"Matched Invoice"`), never a code or a table. The handler translates it in two steps:

1. `DS_LABEL_TO_DOCUMENT_TYPE_CODE` — label → `AD_Ref_List` code (`"Matched Invoice"` → `MI`).
   The labels are the ones `DocumentSearchService.search*` actually emits (read from the
   bulk.posting bytecode); each belongs to exactly one code. `NoPostedConstans` also declares
   `Invoice`, `ShipmentInOut`, `Payment` and `Production`, but nothing emits them, so they are
   deliberately absent.
2. `DOCUMENT_TYPE_CODE_TO_TABLE_ID` — code → `AD_Table_ID`, the **same** map the filter dropdown
   uses (`tableIdForLabel(label)` chains both).

The row carries both results: `documentTypeCode` (the frontend translates it and picks the
"Abrir documento" target with it) and `tableId` (what `POST /action/post` needs).

**History — why this replaced a second map.** Until ETP-5591 a separate label → table map,
`DOCUMENT_TYPE_TO_TABLE_ID`, enriched the rows. A type could be "Enabled ✅" as a filter option
and still be unpostable from every row whenever that second map lacked its label: it happened to
Matched Invoices (ETP-5075), Internal Consumption (ETP-5445) and Transaction (found and fixed by
ETP-5591 — its rows had `tableId: null`, so "Contabilizar" always failed). Deriving the table from
the code removes that class of bug: a label only needs an entry in `DS_LABEL_TO_DOCUMENT_TYPE_CODE`.

**When onboarding a new document type here**, add its code to `DOCUMENT_TYPE_CODE_TO_TABLE_ID`
and its datasource label to `DS_LABEL_TO_DOCUMENT_TYPE_CODE`. `NotPostedDocumentsHandlerTest`
fails if any listed label does not resolve to a table.

**ETP-5445 — Internal Consumption (`IC`), the same two-map trap plus a data gap.** `IC` already
had its `DOCUMENT_TYPE_CODE_TO_TABLE_ID` entry, but two things kept it out: (1) every tenant's
`c_acctschema_table` row for `800168` shipped `ISACTIVE='N'` from
`GOClient/C_ACCTSCHEMA_TABLE.xml`, so the dynamic check hid the filter option; and (2)
the then-separate label → table map had no `"Internal Consumption"` entry (the label
`NoPostedDocumentDS`/bulk.posting emits), so any row that did surface had `tableId = null` and
`postRow()` failed client-side. ETP-5445 added that entry (now `"Internal Consumption"` → `IC` in
`DS_LABEL_TO_DOCUMENT_TYPE_CODE`, ETP-5591), flipped the GOClient reference
data to `'Y'` (new tenants), and shipped data-fix R40 (gap A4b,
`docs/etendo-ad/onboarding-gaps.md`) for existing tenants. Posting an `IC` row also goes through
`DocumentPostingService`'s cost-calculated pre-check, so an uncosted document answers with the
translated `backendError.costNotCalculated` message, and voiding a posted Internal Consumption
creates an unposted `VO: <name>` reversal that then shows up here to be posted. Since ETP-5591 the
row shows the translated type name ("Consumo interno"), like every other type. Window-side details: [`internal-consumption.md`](internal-consumption.md).

Verification queries:
```sql
-- See the actual posted distribution per table
SELECT 'FIN_Payment'      , posted, count(*) FROM fin_payment      GROUP BY posted
UNION ALL
SELECT 'FIN_BankStatement', posted, count(*) FROM fin_bankstatement GROUP BY posted
UNION ALL
SELECT 'FIN_Reconciliation',posted, count(*) FROM fin_reconciliation GROUP BY posted
UNION ALL
SELECT 'FIN_Finacc_Transaction', posted, count(*) FROM fin_finacc_transaction GROUP BY posted
ORDER BY 1, 2;
```

### How the dynamic filter works

`refListDocumentTypes()` runs this query at request time and compares each code's backing table:

```sql
SELECT DISTINCT ad_table_id FROM c_acctschema_table WHERE isactive = 'Y'
```

A document type is shown if and only if (`AccountingDocumentTypeSupport.isTableAccountingRelevant`):
1. Its code is in `DOCUMENT_TYPE_CODE_TO_TABLE_ID` (the static code → `AD_Table_ID` map in the handler)
2. That `AD_Table_ID` is returned by the query above
3. That `AD_Table_ID` is NOT in `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS`

**Consequence:** any new Etendo module that registers its document table in `c_acctschema_table` with `isactive = 'Y'` will automatically appear in the dropdown — no code change needed.

### How to enable a new document type

**Case A — new module adds a new table:**
1. The module inserts a row into `c_acctschema_table` with `isactive = 'Y'` for the new table.
2. Add the code → `AD_Table_ID` entry to `DOCUMENT_TYPE_CODE_TO_TABLE_ID` in the handler. That's the only code change needed.
3. If the code is also new in `AD_Ref_List` (reference `DE94535164E741AB9B1A560EF3F72854`), `NoPostedDocumentDS` must handle that document type in its `searchStrategies` too — that's inside the `bulk.posting` JAR and out of scope here.

**Case B — existing code has its module activated (no `c_acctschema_table` entry yet):**
Once the module inserts an `isactive = 'Y'` row into `c_acctschema_table` for that table, the code appears automatically (dynamic check) — no code change needed, unless its table is also in `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS` (see Case C).

**Case C — statically excluded type (BS/PIN/POT/R APRM types, or BMP/DD/LC/LCC/CA global exclusion, ETP-4452) is re-enabled:**
Remove its table id from `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS`. For the APRM codes, also verify that new documents of that type are no longer initialized with `posted = 'D'`. For the ETP-4452 global-exclusion codes, this requires a new product decision overriding the accepted tradeoff — do not remove them unilaterally. Removing a table id here affects Calendar's `documents` entity identically (ETP-4948), by design.

### How to disable a document type

Remove its code from `DOCUMENT_TYPE_CODE_TO_TABLE_ID`, or add its table id to `AccountingDocumentTypeSupport.APRM_DISABLED_TABLE_IDS` (if it should be permanently suppressed regardless of accounting schema state, in BOTH this window and Calendar's `documents` entity).

To verify accounting schema state at any time:
```sql
SELECT t.tablename, count(*) FILTER (WHERE ast.isactive = 'Y') as active_schemas
FROM c_acctschema_table ast
JOIN ad_table t ON ast.ad_table_id = t.ad_table_id
GROUP BY t.tablename
ORDER BY t.tablename;
```

---

## Accounting status filter

The "Estado" multi-select (heading "Estado", trigger "Todos los estados" / the one picked status /
"Todos los errores" / "{n} Estados") offers 5 curated statuses, each shown as a coloured `Tag`,
plus the **"Todos los errores"** shortcut. The request sends search keys (`N`, `E,C`, `i`, `p`,
`NC`), but `NoPostedDocumentDS` requires `ad_ref_list_id` UUIDs internally —
`getValues()` queries `AD_Ref_List` by primary key, not by search key. The handler translates via
`ACCOUNTING_STATUS_KEY_TO_ID`.

| UI label (es_ES / i18n key) | Tag tone | Search key(s) | `ad_ref_list_id` | Notes |
|---|---|---|---|---|
| No contabilizado (`notPostedStatusUnposted`) | yellow | `N` | `D16B6411F4CB4708AE05E7F6E109920E` | |
| Periodo cerrado (`postedStatusPeriodClosed`) | orange | `p` | `D1EAA8BCC3E649C398D4E544282E5292` | |
| Cuenta no válida (`notPostedStatusInvalidAccount`) | red | `i` | `A12420CC6D4144768EEC57143859EFD6` | |
| Coste no calculado (`postedStatusCostNotCalculated`) | red | `NC` | `EF3E057A84CD4BE88A9EF57BE9598DA3` | Added by ETP-5591 (see below) |
| Error (`notPostedStatusError`) | red | `E`, `C` | `420D49CD77304D32BE49582002C315BE`, `4AE29BF062D4484E976B1BEEF34A7913` | Unified: Error + Error-No-Cost |

**`NC` — Coste no calculado (ETP-5591).** Until ETP-5591 the handler never requested `NC`
(ETP-4355 left it out of the curated set), so every goods receipt / shipment whose posting stopped
on an uncalculated cost — a common failure: 1176 such rows on the local sandbox — never appeared on
the page meant to surface exactly that. It is now a curated option and part of
`DEFAULT_ACCOUNTING_STATUS_KEYS` (`N, E, C, i, p, NC`).

**"Todos los errores" shortcut.** First row of the dropdown (after "Todos los estados"). Ticking it
selects every status that means a posting attempt **failed** — Periodo cerrado, Cuenta no válida,
Coste no calculado, Error (`ERROR_TOKENS`, i.e. all but "No contabilizado") — and unticking it
clears them. It is not a status of its own: it is ticked exactly when all of them are, the trigger
then reads "Todos los errores", and it is never written to the URL (`applyStatusSelection` in
`notPostedDocumentsFilters.js`).

The labels are the page's own i18n keys in the design's sentence case, not the AD's Title Case
translations ("Cuenta No Válida"), and the order and tones are the design's. They live in
`notPostedDocumentsFilters.js` (`STATUS_DEFS`), the single place that maps a row's raw key to its
badge. The same table drives the row **Estado** column — see "Row accounting status" below.

When no filter is selected (initial load), the handler defaults to all curated keys — `["N","E","C","i","p","NC"]` (the 5 UI options, with "Error" expanded to its 2 underlying keys) — because passing an empty list to `searchAllDocuments(org, emptyList)` returns zero results (the datasource short-circuits on empty status list).

### Known gap — documents stuck in "Pendiente de refresco" (`l`)

The page filters on bulk.posting's own column, `EM_Etblkp_Accountingstatus`, not on `Posted`. That
column defaults to `l` (Pending Refresh) on INSERT, and a per-table trigger
(`etblkp_<table>_status_trg`) copies `POSTED` into it on every UPDATE; the background process
`RefreshAccountingStatus` ("Days Back to Refresh Accounting", `ETBLKP_Amount_Of_Days`) back-fills
remaining `l` rows within a date window. So any document touched since bulk.posting was installed is
in sync, and an `l` row is one that was never updated afterwards — and it never shows here, whatever
its real `Posted` value.

Investigated during ETP-5591: on the local sandbox the `l` rows are legacy/seed data only (F&B
demo documents from 2013–2021, QA Testing, 9 rows of GOClient reference data); a freshly
provisioned tenant has none, because completing and posting a document are UPDATEs. No
`AD_Process_Request` schedules the refresh process there. Not fixed: if real tenants ever show `l`
rows (e.g. data imported with triggers disabled), the remedy is to schedule/run the refresh process
or a data-fix setting the column from `Posted`, not to change this page.

Full reference for all 18 accounting statuses (excluded from UI):
```sql
SELECT ad_ref_list_id, value, name
FROM ad_ref_list
WHERE ad_reference_id = 'D431058F6B7345598D1E0709DFF3B5DD'
  AND isactive = 'Y'
ORDER BY value;
```

---

## Data architecture

```
NotPostedDocumentsPage (React)
  │
  ├── GET /header?_mode=filter-options
  │     → NotPostedDocumentsHandler.buildFilterOptions()
  │           → refListDocumentTypes()          ← AD_Ref_List filtered by the dynamic + static checks above
  │           → buildAccountingStatusOptions()  ← curated 4-option subset from AD_Ref_List
  │           returns { documentTypes: [{value,label}], accountingStatuses: [{value,label}] }
  │
  ├── GET /header?document=X&accountingStatus=Y&dateFrom=Z&dateTo=W
  │     → NotPostedDocumentsHandler.buildDocumentGrid(params)
  │           → buildDsParams()  translates search keys → ad_ref_list_id UUIDs
  │           → AccessibleDS.fetchAll(dsParams)
  │           → buildRow(): documentTypeCode + tableId (DS_LABEL_TO_DOCUMENT_TYPE_CODE → DOCUMENT_TYPE_CODE_TO_TABLE_ID)
  │           → enrichWithAccountingState(): accountingStatus (+ financialAccountId on transactions)
  │           returns { rows: [...], total: N }
  │
  ├── POST /header/{recordId}/action/post          body: { tableId, recordId }
  │     → NotPostedDocumentsHandler.handleSinglePost()
  │           → DocumentPostingService.post(tableId, recordId)
  │
  └── POST /header/0/action/bulk-post              body: { rows: [{tableId,recordId,label}] }
        → NotPostedDocumentsHandler.handleBulkPost()
              → DocumentPostingService.post() per row
              returns { ok, total, results: [{recordId, tableId, success, message}] }
```

All responses are **unwrapped** — `NeoResponse.ok(body)` writes the body directly with no `{response:{data:[...]}}` envelope. The frontend reads `json.documentTypes`, `json.rows`, etc. directly.

Row shape (ETP-5591 added the last three fields; agents/MCP only gain fields, nothing was removed):

| Field | Source | Notes |
|---|---|---|
| `documentId`, `documentType`, `description`, `accountingDate`, `organization` | `NoPostedDocumentDS` | `documentType` is the raw English label |
| `tableId` | `tableIdForLabel(documentType)` | `null` for an unknown label |
| `documentTypeCode` | `DS_LABEL_TO_DOCUMENT_TYPE_CODE` | `null` for an unknown label |
| `accountingStatus` | `etblkpAccountingstatus` of the document | `N` / `E` / `C` / `i` / `p`; `null` if it could not be read |
| `financialAccountId` | the transaction's `account` | only on `FIN_Finacc_Transaction` rows |

---

## Backend — `NotPostedDocumentsHandler`

File: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java`

CDI qualifier: `@Named("not-posted-documents")` — **`@Named` only, no normal scope** (see CLAUDE.md NeoHandler rules).

### `NoPostedDocumentDS` access pattern

`getData()` is `protected` in the JAR. The handler bridges this via a private static inner subclass:

```java
private static class AccessibleDS extends NoPostedDocumentDS {
  List<Map<String, Object>> fetchAll(Map<String, String> p) {
    return getData(p, 0, Integer.MAX_VALUE);
  }
}
```

The no-arg constructor of `NoPostedDocumentDS` instantiates `DocumentSearchService` directly (`new DocumentSearchService()`) — CDI injection is not involved.

### `buildDsParams` — UUID translation

`NoPostedDocumentDS.getGridData` calls `getValues(jsonArray, referenceId)` which queries `AD_Ref_List` **by primary key** (`ad_ref_list_id IN (...)`). Passing search keys like `"N"` silently returns an empty list, causing `searchAllDocuments(org, emptyList)` to return zero rows.

The handler maintains `ACCOUNTING_STATUS_KEY_TO_ID` (search key → UUID) and translates before building the datasource param map. When no `accountingStatus` filter is provided (initial load), it defaults to the curated 5 keys `[N, E, C, i, p]`.

### `tableId` / `documentTypeCode` enrichment

`NoPostedDocumentDS` returns a `documentType` label (e.g. `"Goods Shipment"`) but neither the
code nor the `AD_Table_ID`. `buildRow()` resolves both through `DS_LABEL_TO_DOCUMENT_TYPE_CODE`
and `DOCUMENT_TYPE_CODE_TO_TABLE_ID` (see "One label → code map" above), so the frontend can call
`POST /action/post` without extra lookups.

### Row accounting status (ETP-5591)

The datasource rows carry no status, so `enrichWithAccountingState()` reads it from the documents:
rows are grouped by `tableId` and each table is read with **one** HQL query per 1000 ids
(`loadAccountingStates`):

```
select e.id, e.etblkpAccountingstatus[, e.account.id] from <Entity> e where e.id in (:ids)
```

- **Which column.** `etblkpAccountingstatus` (`EM_Etblkp_Accountingstatus`, bulk.posting's
  extension column, List reference `D431058F…`), **not** `Posted`. It is the column the datasource
  filters on (`etblkpAccountingstatus = <status>`, plus `posted <> 'Y'` and `processed = true`),
  so a row reached through the "Error" filter always shows "Error". The two columns do diverge in
  real data (e.g. `posted = 'p'` while this column is `'l'`), so reading `Posted` would show
  badges that contradict the filter.
- **Structure, not identity.** The entity comes from `ModelProvider.getEntityByTableId(tableId)`;
  a table without the property is skipped. The only entity named is `FIN_Finacc_Transaction`
  (its `account` is read so "Abrir documento" can open the financial account — transactions have
  no window of their own). This lives in the window's own handler, so the shared-code identity
  rule is not involved. The entity name in the HQL comes from the dictionary, never the request;
  the ids are bound.
- **Never fails the grid.** A table whose state cannot be read is logged at `warn` and its rows
  keep `accountingStatus: null` (no badge).
- **Why HQL and not OBCriteria.** OBCriteria would filter inactive records and by readable
  organization, and would load whole objects; this needs two or three columns of exactly the
  ids the datasource already returned. A raw session query also needs no admin mode.
- **Cost.** One query per distinct table (≤ 12) per load; negligible next to the datasource scan
  (F&B demo tenant, 1509 rows: ~12 s total, almost all of it the datasource).

### Shared accounting-relevance predicate (ETP-4948)

`buildRow()` and `refListDocumentTypes()` no longer carry their own APRM-exclusion logic — both
call `com.etendoerp.go.schemaforge.util.AccountingDocumentTypeSupport`
(`isAprmDisabledTable(tableId)` / `isTableAccountingRelevant(tableId, accountedTableIds)` /
`loadTablesWithActiveAccounting()`), the same shared utility Calendar's `documents` entity
(`PeriodControlDocOpenCloseHandler.afterHandle`) uses. See "Document type accounting support"
above and `calendar.md` for the other side.

### AD_Ref_List constants

| Constant | AD_Reference_ID | Purpose |
|---------|-----------------|---------|
| `DOCUMENT_TYPE_REF_ID` | `DE94535164E741AB9B1A560EF3F72854` | `ETBLKP_Documents` — all document types |
| `ACCOUNTING_STATUS_REF_ID` | `D431058F6B7345598D1E0709DFF3B5DD` | `ETBLKP_All_Accounting Status` |

---

## NEO spec / entity DB records

Pushed by the generic custom-window path in `push-to-neo.js` (idempotent — upserts by name):

```bash
node cli/src/push-to-neo.js not-posted-documents --type custom [--dry-run]
```

Spec name: `not-posted-documents`. Entity: `header`. Java_Qualifier: `not-posted-documents`.  
`isget = 'Y'`, `ispost = 'Y'` on the entity — both GET (grid + filter-options) and POST (actions) are enabled.

**The entity is tab-less (`ad_tab_id` is null), so `NotPostedDocumentsHandler` must keep
`servesActions()` returning `true`** (ETP-4254). The MCP catalog hides a type-`W` spec whose
entities are all handler-backed *and* declare no `/action` route — that rule exists for the
dashboard's widgets, and this spec has the same shape. Dropping the declaration removes the spec
from `etendo_discover`, from the CRUD tool enums and from `etendo_action`, taking `post` / `bulk-post`
away from agents. The React page is unaffected either way (`NeoRequestRouter` never consults
`hasSpecAccess`), so the regression is invisible in the UI. See
[`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md) §6
and [`../neo-headless-extensibility.md`](../neo-headless-extensibility.md) §2.7.

---

## Frontend component — `NotPostedDocumentsPage`

File: `tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx`

Props: `{ token, apiBaseUrl }` — `apiBaseUrl` is already spec-scoped.

### Access gate (ETP-5485)

The page has no `AD_Window`; its only access anchor is the "Not Posted Documents" OBUIAPP
process `D6AB95CE52D34E1599590526115E26C6` (the same id `menu.json`'s `obuiappProcessId`, the
backend's `NotPostedDocumentsHandler.NOT_POSTED_DOCUMENTS_PROCESS_ID` and the role matrices'
proxy row use). So the generic `WindowAccessGuard` — which only reads `windowAccess[windowId]`
— never applied, and the page had no gate of its own: a role without the grant (e.g.
Purchasing-only) did not see the sidebar entry, but opening `/not-posted-documents` directly
rendered the filters, "0 registros" and the backend's raw English "Forbidden".

Two layers now:

- **Route guard.** The registry entry (`windows/custom/not-posted-documents/index.jsx`) wraps the
  page in `ProcessAccessGuard` (`tools/app-shell/src/components/access/ProcessAccessGuard.jsx`),
  which checks the process id against `useRoleMenu()` — the same role-filtered id set the
  sidebar filters by, so page and sidebar always agree. A role without the process gets the
  shared access-denied screen (`data-testid="window-access-denied"`, i18n `windowAccessDenied`,
  identical to `WindowAccessGuard`) and the page never mounts or fires a request. While access
  is still loading it shows a neutral placeholder; when the menu map is unreachable it fails
  OPEN, like the sidebar.
- **Backend 403.** If the header load still answers 403 (guard failed open, or a grant revoked
  mid-session), the page swaps itself for the same access-denied screen and hides the header
  record count. Any other load error shows a translated message: a known backend message via
  `translateBackendError`, otherwise `documentsLoadError`. Raw backend text and the HTTP status
  text are never rendered. The same holds for the Post toasts: a rejected post (including a 403)
  or a row without `tableId` shows the translated `postingFailed`, never "Forbidden".

### Menu entry, breadcrumb & i18n (ETP-4945)

- Breadcrumb: `Finanzas / Documentos no contabilizados` (`` `${ui('finance')} / ${ui('notPostedDocuments')}` ``, passed to `useSetPageMeta`). Previously this window passed no `breadcrumb` key at all — `TopBar` renders nothing when `breadcrumb` is falsy.
- The record-count badge is republished whenever the row count changes (`useSetPageMeta(meta, [rows.length, accessDenied])`). Before ETP-5591 it was published once, so it kept showing the count at mount (usually 0).
- Document-type names: the row's `documentTypeCode` is looked up in the already-translated `{value, label}` pairs `filter-options` returns (`documentTypeLabels`); a code whose GO window was renamed (`DOC_TYPE_LABEL_KEYS`: `MI` → "Relación albarán-factura") uses our own key instead. A row without a code keeps the raw datasource label. The filter dropdown and the rows go through the same `docTypeLabel()`.

### Layout (ETP-5591)

Same frame and toolbar spacing as `ListView`, composed from shared pieces (the precedent is
`financial-account/ReconciliationList`; `ListView` itself cannot be used — it is built on the
paged NEO entity grid, and this handler serves a custom, unpaged contract):

| Area | Component | Notes |
|---|---|---|
| Tipo de documento | core `DistinctValuesFilter` (single, `heading`, search) | Options sorted A→Z by translated name; "Todos los documentos" |
| Estado | core `DistinctValuesFilter` (`multiple`, `heading`, `searchable={false}`, `renderLabel` → `Tag`) | See "Accounting status filter" |
| Fecha | `DateRangePopover` | Default **Últimos 12 meses** (`last12m`) |
| Limpiar filtros | `Button` | Only when filters differ from the defaults; resets to them (date back to 12 months) |
| Share (link icon) | — | Copies `window.location.href` (filters are in the URL); `linkCopied` / `copyFailed` toasts |
| Ordenar | `ListSortPopover` + `useClientSort` | Client-side: the handler returns every row at once. Sorts the displayed (translated) values |
| Actualizar | `RefreshButton` | Refetches with the same filters |
| Table | `DataTable` | Columns: Tipo de documento (bold), Estado (`Tag`), Descripción, Fecha contable (`date`, `dot: false`), Organización |
| Row hover | `rowQuickActions.render` → `NotPostedRowActions` | "Abrir documento" + "Contabilizar" text links (`Button variant="link"`), hover-revealed like `RowQuickActions` |
| Selection | `SelectionToolbar` | "{n} Seleccionados" · Contabilizar · ✕ |
| Empty | `DataTable` `emptyState` | Default filters: "No hay documentos sin contabilizar". Other filters: "No encontramos documentos" + description + Limpiar filtros. Load error: translated message |

**Filters live in the URL** (`notPostedDocumentsFilters.js`): `?document=SI&status=N,E&date=last30`.
`status` holds page tokens (`N`, `p`, `i`, `NC`, `E`), not backend values, because the "Error"
option's backend value is the composite `"E,C"`. `date` is a preset id, `all` (any date) or
`yyyy-mm-dd_yyyy-mm-dd`; absent means the 12-month default. Default values are left out, so the
bare URL is the default view. Dates go to the backend as local calendar days (`toDateParam`).
The URL is kept **canonical**: unknown statuses, a malformed date and (once the options have
loaded) a document type the tenant does not offer are rewritten away, so the toolbar, the request
and what "Share" copies always agree.

**"Abrir documento" targets** (`OPEN_DOCUMENT_SPECS` in `NotPostedRowActions.jsx`, page-local):
`SI` sales-invoice, `PI` purchase-invoice, `GS` goods-shipment, `GR` goods-receipt, `RMR`
return-material-receipt, `RVS` return-to-vendor-shipment, `INV` physical-inventory, `M`
goods-movements, `MI` matched-purchase-invoices, `IC` internal-consumption, `GLJ`
simple-g-l-journal, `A` amortization — route `/{spec}/{documentId}` (each window's header table is
the posting table). `T` (transaction) opens `/financial-account/{financialAccountId}`. Any other
code, or a missing id, shows no link. It opens in the same tab; Back restores the filters.

### Lifecycle

1. **Mount** — fetches filter options; reads the filters from the URL and fetches rows
   (default: last 12 months, backend default statuses N+E+C+i+p+NC).
2. **Filter change** — written to the URL (`replace`), which refetches at once (no "Buscar"); the
   previous request is aborted; the selection is cleared. While refetching, the current rows stay
   on screen under a `ListProgressBar`; only the first load shows the table skeleton.
3. **Contabilizar (row)** — `POST /header/{id}/action/post` (`timeout: 0`, ETP-5424); the link is
   disabled while in flight; on success: toast, row deselected, reload. Every reload (after a
   post, or "Actualizar") uses the filters in effect **when it runs**, so a post that finishes
   after the user changed a filter never brings back the old results.
4. **Contabilizar (selection)** — `POST /header/0/action/bulk-post` (`timeout: 0`); outcome via
   the shared `showBulkActionToast` (same toast as every other list's bulk "Contabilizar"; a single
   failed row shows its real backend error). Selected rows without `tableId` are never sent and are
   reported in the toast's **omitted** count (ETP-5209 bucket), not silently dropped. Then:
   selection cleared, reload. Leaving the page aborts an in-flight rows request.

### Invalid-account posting error (ETP-5175)

A single **Post row** that fails with `STATUS_InvalidAccount` returns the same identity as the
document windows: `NotPostedDocumentsHandler` forwards `messageKeys` + `messageParams`
(through `DocumentPostingService.putMessageIdentity`), and `postRow` passes them to
`translateBackendError`, so the toast reads, e.g.:

> No se pudo encontrar la cuenta. (Contacto: Piensos del Ebro S.L., Categoría de contacto: Proveedores)
> Revise las siguientes cuentas contables del producto: Desviación Pr. Factura.

This is exactly the text Relación albarán-factura shows (see `matched-purchase-invoices.md`).
The bulk **Contabilizar** goes through `showBulkActionToast`: when exactly one row was sent and it
failed, it shows that row's translated error (same identity); otherwise only the ok/failed counts.

---

## Manual verification

1. Open `/not-posted-documents` — the toolbar shows "Todos los documentos", "Todos los estados", "Últimos 12 meses" and, on the right, link / sort / refresh. No "Buscar", no "N registros" row; the count is in the title badge.
2. Tipo de documento lists the enabled types A→Z with a search box; on a tenant whose `c_acctschema_table` row for `800168` is active (GOClient, or any tenant after data-fix R40) that includes **Consumo interno** (ETP-5445). Never present: payments, bank statements, reconciliation, work effort, doubtful debt, cost adjustment, bill of materials production, landed cost, landed cost cost.
3. Every row shows a translated type and a status badge (yellow / orange / red). Picking a type or statuses refetches immediately; two statuses read "2 Estados"; "Todos los errores" ticks Periodo cerrado / Cuenta no válida / Coste no calculado / Error at once. Goods receipts with "Coste no calculado" appear. "Limpiar filtros" appears and resets.
4. Copy the link, open it in another tab → same filters.
5. Hover a row → "Abrir documento" opens the source document (a transaction opens its financial account); Back returns with the filters intact. "Contabilizar" posts it (success toast, row disappears).
6. Select rows → floating toolbar "{n} Seleccionados · Contabilizar · ✕"; Contabilizar → outcome toast, table refreshes.
7. Filters with no match → "No encontramos documentos" + Limpiar filtros. A tenant with nothing pending → "No hay documentos sin contabilizar".
8. (ETP-5445) Filter by Consumo interno, post one row; a row whose products have no calculated cost answers "No se pudo calcular el costo del producto.".
9. (ETP-5485) As a Purchasing-only user (no "Not Posted Documents" process grant), open
   `/not-posted-documents` directly → the "No tienes acceso a esta ventana" screen, no filters,
   no count, no "Forbidden". A Finance user still gets the full page.

---

## Automated evidence

- `artifacts/not-posted-documents/decisions.json` — `layoutType: "custom"`, `javaQualifier: "not-posted-documents"`, Finance category.
- `tools/app-shell/src/windows/registry.js` — `not-posted-documents` in `customLoaders`.
- `tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx` — main component; `notPostedDocumentsFilters.js` (filter state, URL form, status table — `__tests__/notPostedDocumentsFilters.vitest.js`); `NotPostedRowActions.jsx` (hover actions, "Abrir documento" targets). Page behaviour: `__tests__/NotPostedDocumentsPage.vitest.jsx`, real-locale copy: `__tests__/NotPostedDocumentsPage.breadcrumb.i18n.vitest.jsx`, browser flows: `e2e/tests/flows/accounting/not-posted-documents.mocked.spec.js`.
- `tools/app-shell/src/components/contract-ui/DataTable.jsx` — opt-in `emptyState` prop (ETP-5591), `__tests__/DataTable.emptyState.vitest.jsx`. Multi-select / heading / badge options of `DistinctValuesFilter` come from `@etendosoftware/app-shell-core` (documented in schema_forge_core `docs/list-filters.md`).
- `tools/app-shell/src/windows/custom/not-posted-documents/index.jsx` — route entry wrapped in `ProcessAccessGuard` (ETP-5485); covered by `__tests__/index.access.vitest.jsx`, `components/access/__tests__/ProcessAccessGuard.vitest.jsx`, the 403/error cases in `__tests__/NotPostedDocumentsPage.vitest.jsx`, and the "direct route without process access" block of `e2e/tests/flows/accounting/not-posted-documents.mocked.spec.js`.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java` — `@Named("not-posted-documents")`; dynamic `c_acctschema_table` check + `APRM_DISABLED_TYPES` static exclusion set (includes BS, PIN, POT, R plus the ETP-4452 global exclusions BMP, DD, LC, LCC, CA); `DS_LABEL_TO_DOCUMENT_TYPE_CODE` + `tableIdForLabel` row enrichment (ETP-5591; replaced `DOCUMENT_TYPE_TO_TABLE_ID`), `enrichWithAccountingState` / `loadAccountingStates` (row status + transaction account), all covered by `NotPostedDocumentsHandlerTest`; `ACCOUNTING_STATUS_KEY_TO_ID` UUID map; `DEFAULT_ACCOUNTING_STATUS_KEYS`; `AccessibleDS` inner subclass.
- `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` — `isget=Y, ispost=Y`.
- i18n keys (`en_US.json` / `es_ES.json`): `notPostedDocuments`, `allDocuments`, `allErrors`, `postedStatusCostNotCalculated` (shared), `statusesCount`, `openDocument`, `notPostedStatusUnposted`, `notPostedStatusInvalidAccount`, `notPostedStatusError`, `notPostedEmptyFilteredTitle`, `notPostedEmptyFilteredDescription`, `notPostedEmptyNoneTitle`, plus shared `postedStatusPeriodClosed`, `statusLabel`, `documentType`, `resetFilters`, `selected`, `post`, `postingFailed`, `documentPosted`, `documentsLoadError`, `linkCopied`, `copyFailed`, `copyLink`, `accountingDate`.
