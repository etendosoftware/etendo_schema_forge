# Not Posted Documents

## Intent

Use this window to find and mass-post all accounting documents that are still pending posting across the organization. It aggregates unposted documents of every **supported** type into a single cross-document list, lets the user filter by type, accounting status, and date range, and exposes a **Post** action per row as well as a **Post selected** bulk action.

The window has no backing AD window — it is 100% custom. Data is served by `NotPostedDocumentsHandler` (`@Named("not-posted-documents")`), which delegates to `NoPostedDocumentDS` from `bulk.posting-3.0.0.jar`.

---

## Document type accounting support

Not every document type in `ETBLKP_Documents` (`AD_Reference_ID = DE94535164E741AB9B1A560EF3F72854`) can actually be posted in a standard Etendo + APRM installation. The table below is the authoritative reference.

The **enabled** column reflects the `ENABLED_DOCUMENT_TYPE_CODES` set in `NotPostedDocumentsHandler.java`. Changing that set is the only place you need to edit to add or remove a type from the dropdown.

| Code | Name | AD_Table | AD_Table_ID | In c_acctschema_table? | Posting status | **Enabled** | Reason |
|------|------|----------|-------------|------------------------|----------------|:-----------:|--------|
| `A`   | Amortization             | `A_Amortization`          | `800060` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `BMP` | Bill of Materials Prod.  | `M_Production`            | `325` | ✅ isactive=Y | ✅ Working | ✅ | — |
| `BS`  | Bank Statements          | `FIN_BankStatement`       | `D4C23A17190649E7B78F55A05AF3438C` | ✅ isactive=Y | ❌ All D (100%) | ❌ | APRM posts via Transaction, not BankStatement |
| `CA`  | Cost Adjustment          | `M_CostAdjustment`        | `D022B92163074E5E82449C8E0B5AFDF6` | ✅ isactive=Y | ⚠️ 0 documents | ❌ | No documents in this installation; enable when activated |
| `DD`  | Doubtful Debt            | `FIN_Doubtful_Debt`       | `30721072789F410E9606D2235CB2A226` | ✅ isactive=Y | ⚠️ 0 documents | ❌ | No documents in this installation; enable when activated |
| `GLJ` | G/L Journal              | `GL_Journal`              | `224` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `GR`  | Goods Receipt            | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `GS`  | Goods Shipment           | `M_InOut`                 | `319` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `IC`  | Internal Consumption     | `M_Internal_Consumption`  | `800168` | ❌ Not present | ❌ N/A | ❌ | No accounting schema entry |
| `INV` | Inventory                | `M_Inventory`             | `321` | ✅ isactive=Y | ✅ Working (N+Y records) | ✅ | — |
| `LC`  | Landed Cost              | `M_LandedCost`            | `082F967CDF7245EB9A150941F326C45C` | ✅ isactive=Y | ✅ Working (N records) | ✅ | — |
| `LCC` | Landed Cost Cost         | `M_LC_Cost`               | `55A984C314FD4C4FB5E7C32DE36BB07B` | ✅ isactive=Y | ✅ Working (N records) | ✅ | — |
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

### How to enable or disable a document type

**In `NotPostedDocumentsHandler.java`** (the only file you need to edit):

```java
// File: modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java

static final Set<String> ENABLED_DOCUMENT_TYPE_CODES = new LinkedHashSet<>(Arrays.asList(
    "A",    // Amortization             → A_Amortization
    "BMP",  // Bill of Mat. Production  → M_Production
    // ... add or remove codes here
));
```

**Before enabling a new code, verify:**
1. The code appears in `AD_Ref_List` for reference `DE94535164E741AB9B1A560EF3F72854`
2. Its backing table exists in `c_acctschema_table` with `isactive = 'Y'`:
   ```sql
   SELECT ast.isactive, count(*)
   FROM c_acctschema_table ast
   JOIN ad_table t ON ast.ad_table_id = t.ad_table_id
   WHERE t.tablename = 'YOUR_TABLE_NAME'
   GROUP BY ast.isactive;
   ```
3. Documents of that type have records with `posted` values other than `'D'`:
   ```sql
   SELECT posted, count(*) FROM your_table GROUP BY posted;
   ```
4. Add the table → `AD_Table_ID` mapping to `DOCUMENT_TYPE_TO_TABLE_ID` if not already present (needed for the post action to resolve the correct table).

**To enable `DD` (Doubtful Debt) or `CA` (Cost Adjustment)** when those modules go live: simply add `"DD"` or `"CA"` to the set — no other change needed.

**To re-enable payments (PIN/POT)** if APRM accounting is ever reconfigured: add `"PIN"` and `"POT"` back. You will also need to verify that `FIN_Payment` records are no longer initialized with `posted = 'D'`.

---

## Accounting status filter

The "Estado contable" multi-select shows 4 curated options. The values in the dropdown are search keys (`N`, `E,C`, `i`, `p`), but `NoPostedDocumentDS` requires `ad_ref_list_id` UUIDs internally — `getValues()` queries `AD_Ref_List` by primary key, not by search key. The handler translates via `ACCOUNTING_STATUS_KEY_TO_ID`.

| Option label | Search key(s) | `ad_ref_list_id` | Notes |
|--------------|---------------|-----------------|-------|
| Unposted | `N` | `D16B6411F4CB4708AE05E7F6E109920E` | |
| Error | `E`, `C` | `420D49CD77304D32BE49582002C315BE`, `4AE29BF062D4484E976B1BEEF34A7913` | Unified: Error + Error-No-Cost |
| Invalid Account | `i` | `A12420CC6D4144768EEC57143859EFD6` | |
| Period Closed | `p` | `D1EAA8BCC3E649C398D4E544282E5292` | |

When no filter is selected (initial load), the handler defaults to all four options — `["N","E","C","i","p"]` — because passing an empty list to `searchAllDocuments(org, emptyList)` returns zero results (the datasource short-circuits on empty status list).

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

---

## Frontend component — `NotPostedDocumentsPage`

File: `tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx`

Props: `{ token, apiBaseUrl }` — `apiBaseUrl` is already spec-scoped.

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

1. Open `/not-posted-documents` — filter dropdowns populate; document type list has exactly 15 entries (no payments, no bank statements, no reconciliation, no work effort, no internal consumption, no doubtful debt, no cost adjustment).
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
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/NotPostedDocumentsHandler.java` — `@Named("not-posted-documents")`; `ENABLED_DOCUMENT_TYPE_CODES` set; `ACCOUNTING_STATUS_KEY_TO_ID` UUID map; `DEFAULT_ACCOUNTING_STATUS_KEYS`; `AccessibleDS` inner subclass.
- `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` — `isget=Y, ispost=Y`.
- i18n keys: `notPostedDocuments`, `postSelected`, `postingComplete`, `postingPartial`, `postingFailed`, `filterDocumentType`, `filterAccountingStatus`, `accountingDate` in `en_US.json` / `es_ES.json`.
