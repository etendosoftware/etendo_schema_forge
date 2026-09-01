# Not Posted Documents

## Intent

Use this window to find and mass-post all accounting documents that are still pending posting across the organization. It aggregates unposted documents of every **supported** type into a single cross-document list, lets the user filter by type, accounting status, and date range, and exposes a **Post** action per row as well as a **Post selected** bulk action.

The window has no backing AD window — it is 100% custom. Data is served by `NotPostedDocumentsHandler` (`@Named("not-posted-documents")`), which delegates to `NoPostedDocumentDS` from `bulk.posting-3.0.0.jar`.

---

## Document type accounting support

Not every document type in `ETBLKP_Documents` (`AD_Reference_ID = DE94535164E741AB9B1A560EF3F72854`) can actually be posted in a standard Etendo + APRM installation, and 5 more are excluded globally by product decision. The table below is the authoritative reference.

The **enabled** column reflects two mechanisms combined, both live in `NotPostedDocumentsHandler.java` — there is no static "enabled list" to edit:
1. A **dynamic** check: the code's `AD_Table_ID` (from `DOCUMENT_TYPE_CODE_TO_TABLE_ID`) must appear in `SELECT DISTINCT ad_table_id FROM c_acctschema_table WHERE isactive = 'Y'`, evaluated at request time.
2. A **static** exclusion: the code must NOT be in `APRM_DISABLED_TYPES` — a hardcoded set of codes that are always hidden regardless of the dynamic check.

(A legacy `ENABLED_DOCUMENT_TYPE_CODES` set existed in earlier revisions and has been fully replaced by this dynamic-check + static-exclusion combination — see commits `27caeaf1`, `44b5e179`, `ad210c51`, `4bf31a1e` in `com.etendoerp.go`.)

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
| `IC`  | Internal Consumption     | `M_Internal_Consumption`  | `800168` | ❌ Not present | ❌ N/A | ❌ | No accounting schema entry |
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
| `WE`  | Work Effort              | `S_TimeExpense`           | `486` | ❌ Not present | ❌ N/A | ❌ | No accounting schema entry |

### Why APRM disables BS, PIN, POT, R

Etendo's Advanced Payables & Receivables Management (APRM) module routes all financial accounting through `FIN_Finacc_Transaction` (code `T`). When a payment, bank statement, or reconciliation document is created via APRM, the system immediately sets `POSTED = 'D'` on those records — signalling that direct bulk-posting is disabled for them. The `FIN_Finacc_Transaction` records are what actually carry the accounting entries.

### Global exclusion of BMP, DD, LC, LCC, CA (ETP-4452)

Unlike the APRM codes above, `BMP` (Bill of Materials Production), `DD` (Doubtful Debt), `LC` (Landed Cost), `LCC` (Landed Cost Cost) and `CA` (Cost Adjustment) are **not** APRM-managed — their backing tables have active `c_acctschema_table` entries and some tenants genuinely post documents against them. They are excluded by an explicit **product decision** (ETP-4452), applied globally for ALL tenants.

**Accepted tradeoff:** this hides legitimate not-posted documents for tenants that have these types actively configured for posting — confirmed cases include QA Testing and F&B International Group. The product owner accepted this tradeoff; it is not a bug and must not be "fixed" by removing the codes from `APRM_DISABLED_TYPES` without a new product decision.

To re-enable any of the 5 (e.g. a future decision to scope the exclusion per-tenant instead of globally), remove its code from `APRM_DISABLED_TYPES` in `NotPostedDocumentsHandler.java`.

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

A document type is shown if and only if:
1. Its code is in `DOCUMENT_TYPE_CODE_TO_TABLE_ID` (the static code → `AD_Table_ID` map in the handler)
2. That `AD_Table_ID` is returned by the query above
3. Its code is NOT in `APRM_DISABLED_TYPES`

**Consequence:** any new Etendo module that registers its document table in `c_acctschema_table` with `isactive = 'Y'` will automatically appear in the dropdown — no code change needed.

### How to enable a new document type

**Case A — new module adds a new table:**
1. The module inserts a row into `c_acctschema_table` with `isactive = 'Y'` for the new table.
2. Add the code → `AD_Table_ID` entry to `DOCUMENT_TYPE_CODE_TO_TABLE_ID` in the handler. That's the only code change needed.
3. If the code is also new in `AD_Ref_List` (reference `DE94535164E741AB9B1A560EF3F72854`), `NoPostedDocumentDS` must handle that document type in its `searchStrategies` too — that's inside the `bulk.posting` JAR and out of scope here.

**Case B — existing code has its module activated (no `c_acctschema_table` entry yet):**
Once the module inserts an `isactive = 'Y'` row into `c_acctschema_table` for that table, the code appears automatically (dynamic check) — no code change needed, unless it's also in `APRM_DISABLED_TYPES` (see Case C).

**Case C — statically excluded type (BS/PIN/POT/R APRM types, or BMP/DD/LC/LCC/CA global exclusion, ETP-4452) is re-enabled:**
Remove its code from `APRM_DISABLED_TYPES`. For the APRM codes, also verify that new documents of that type are no longer initialized with `posted = 'D'`. For the ETP-4452 global-exclusion codes, this requires a new product decision overriding the accepted tradeoff — do not remove them unilaterally.

### How to disable a document type

Remove its code from `DOCUMENT_TYPE_CODE_TO_TABLE_ID`, or add it to `APRM_DISABLED_TYPES` (if it should be permanently suppressed regardless of accounting schema state).

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

The "Estado contable" multi-select shows 4 curated options. The values in the dropdown are search keys (`N`, `E,C`, `i`, `p`), but `NoPostedDocumentDS` requires `ad_ref_list_id` UUIDs internally — `getValues()` queries `AD_Ref_List` by primary key, not by search key. The handler translates via `ACCOUNTING_STATUS_KEY_TO_ID`.

| Option label | Search key(s) | `ad_ref_list_id` | Notes |
|--------------|---------------|-----------------|-------|
| Unposted | `N` | `D16B6411F4CB4708AE05E7F6E109920E` | |
| Error | `E`, `C` | `420D49CD77304D32BE49582002C315BE`, `4AE29BF062D4484E976B1BEEF34A7913` | Unified: Error + Error-No-Cost |
| Invalid Account | `i` | `A12420CC6D4144768EEC57143859EFD6` | |
| Period Closed | `p` | `D1EAA8BCC3E649C398D4E544282E5292` | |

When no filter is selected (initial load), the handler defaults to all curated keys — `["N","E","C","i","p"]` (the 4 UI options, with "Error" expanded to its 2 underlying keys) — because passing an empty list to `searchAllDocuments(org, emptyList)` returns zero results (the datasource short-circuits on empty status list).

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
  │           → refListDocumentTypes()          ← AD_Ref_List filtered by ENABLED_DOCUMENT_TYPE_CODES
  │           → buildAccountingStatusOptions()  ← curated 4-option subset from AD_Ref_List
  │           returns { documentTypes: [{value,label}], accountingStatuses: [{value,label}] }
  │
  ├── GET /header?document=X&accountingStatus=Y&dateFrom=Z&dateTo=W
  │     → NotPostedDocumentsHandler.buildDocumentGrid(params)
  │           → buildDsParams()  translates search keys → ad_ref_list_id UUIDs
  │           → AccessibleDS.fetchAll(dsParams)
  │           → enriches rows with tableId from DOCUMENT_TYPE_TO_TABLE_ID
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

### `tableId` enrichment

`NoPostedDocumentDS` returns a `documentType` string (e.g. `"Goods Shipment"`) but not `AD_Table_ID`. The handler's `DOCUMENT_TYPE_TO_TABLE_ID` map resolves it at response time so the frontend can call POST /action/post without extra lookups.

Source for table IDs:
```sql
SELECT tablename, ad_table_id FROM ad_table
WHERE tablename IN ('C_Invoice','M_InOut','M_Movement','A_Amortization',
                    'GL_Journal','M_Inventory','M_Production','M_MatchInv',
                    'M_Movement','M_LandedCost','M_LC_Cost','FIN_Finacc_Transaction');
```

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
from `neo_discover`, from the CRUD tool enums and from `neo_action`, taking `post` / `bulk-post`
away from agents. The React page is unaffected either way (`NeoRequestRouter` never consults
`hasSpecAccess`), so the regression is invisible in the UI. See
[`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md) §6
and [`../neo-headless-extensibility.md`](../neo-headless-extensibility.md) §2.7.

---

## Frontend component — `NotPostedDocumentsPage`

File: `tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx`

Props: `{ token, apiBaseUrl }` — `apiBaseUrl` is already spec-scoped.

### Menu entry, breadcrumb & i18n (ETP-4945)

- Breadcrumb: `Finanzas / Documentos no contabilizados` (`` `${ui('finance')} / ${ui('notPostedDocuments')}` ``, passed to `useSetPageMeta`). Previously this window passed no `breadcrumb` key at all — `TopBar` renders nothing when `breadcrumb` is falsy, so the window had no breadcrumb whatsoever before this fix, even though its `title` (`ui('notPostedDocuments')`) was already correctly translated.
- The date-range filter labels now read `ui('filterFrom')` / `ui('filterTo')` (`"Desde"`/`"Hasta"` in `es_ES.json`, `"From"`/`"To"` in `en_US.json`) instead of hardcoded English `<label>From</label>` / `<label>To</label>`.
- The document-type badge (`.npd-doc-type-badge`) now shows the translated label instead of the raw `row.documentType` string, by mapping it through the already-translated `{value, label}` pairs `filterOptions.documentTypes` returns (`documentTypeLabels` map built with `useMemo`) — no new lookup table or backend change needed, since `NoPostedDocumentDS`'s `documentType` values (e.g. `"Goods Shipment"`) already match the filter dropdown's own option values.

### Accounting status multi-select

State: `accountingStatuses: Set<string>` of selected search keys.  
Empty set = "all curated statuses" — the backend defaults when nothing is selected.  
The `MultiSelect` component (inline in the same file) closes on outside-click via `useRef` + `mousedown` listener.

### Lifecycle

1. **Mount** — fetches filter options; fetches initial rows with empty filters (backend defaults to N+E+C+i+p).
2. **Apply** — `fetchRows(filters)` with current state; clears selection.
3. **Post row** — `POST /header/{id}/action/post`; refreshes on success.
4. **Post selected** — `POST /header/0/action/bulk-post`; refreshes on any result.

---

## Manual verification

1. Open `/not-posted-documents` — filter dropdowns populate; document type list has exactly 12 entries (no payments, no bank statements, no reconciliation, no work effort, no internal consumption, no doubtful debt, no cost adjustment, no bill of materials production, no landed cost, no landed cost cost).
2. Initial table loads with rows (defaults to N+E+C+i+p statuses — no Apply needed).
3. Filter by document type → only that type appears.
4. Filter by accounting status → only selected statuses appear.
5. Post a single row → success toast + row disappears.
6. Post selected → partial/complete toast + table refreshes.
7. Menu title shows "Documentos no contabilizados" in Spanish.

---

## Automated evidence

- `artifacts/not-posted-documents/decisions.json` — `layoutType: "custom"`, `javaQualifier: "not-posted-documents"`, Finance category.
- `tools/app-shell/src/windows/registry.js` — `not-posted-documents` in `customLoaders`.
- `tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx` — main component.
- `tools/app-shell/src/windows/custom/not-posted-documents/not-posted-documents.css` — scoped `npd-*` CSS.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java` — `@Named("not-posted-documents")`; dynamic `c_acctschema_table` check + `APRM_DISABLED_TYPES` static exclusion set (includes BS, PIN, POT, R plus the ETP-4452 global exclusions BMP, DD, LC, LCC, CA); `DOCUMENT_TYPE_TO_TABLE_ID` grid-row enrichment map; `ACCOUNTING_STATUS_KEY_TO_ID` UUID map; `DEFAULT_ACCOUNTING_STATUS_KEYS`; `AccessibleDS` inner subclass.
- `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` — `isget=Y, ispost=Y`.
- i18n keys: `notPostedDocuments`, `postSelected`, `postingComplete`, `postingPartial`, `postingFailed`, `filterDocumentType`, `filterAccountingStatus`, `accountingDate` in `en_US.json` / `es_ES.json`.
