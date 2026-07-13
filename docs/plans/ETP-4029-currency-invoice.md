# ETP-4029 — Currency & Exchange Rate on Invoices

## Context: What ETP-4027 Built (prerequisite)

ETP-4029 extends the currency feature from orders/quotations to invoices. Reading this section first is mandatory — ETP-4029 is a direct continuation and reuses all infrastructure created in ETP-4027.

### What ETP-4027 delivered

**DB schema changes (com.etendoerp.go module):**
- New column `C_ORDER.EM_ETGO_Currency_Rate` (NUMERIC(20,12), nullable): per-order exchange rate override. When null, the system falls back to querying `C_Conversion_Rate` table.
- `C_CURRENCY_ID` on `C_ORDER` was already existing but was made editable for draft orders (previously immutable once lines existed). The core trigger `C_ORDER_CHK_RESTRINCTIONS_TRG.xml` had its `C_Currency_ID` clause removed to allow this.

**NEO config changes:**
- `ETGO_SF_FIELD.IsReadOnly = 'N'` for `header.currency` and `lines.currency` on `sales-order` and `purchase-order` specs — so NEO accepts PATCH updates for these fields.
- `currencyOptions` ACTION field added to `sales-order` and `purchase-order` header entities, exposing `GET /sws/neo/{spec}/header/{id}/action/currencyOptions`.

**Backend Java (com.etendoerp.go):**
- `CurrencyOptionsHandler` (`@Named("currencyOptionsHandler")`): ACTION handler that queries `C_Conversion_Rate` and returns all currencies reachable from the org currency for the order's date, scoped to the order's own client+org. Supports both direct and inverse rates. Called for `new` records by falling back to session context.
- `SalesOrderHeaderHandler` / `PurchaseOrderHeaderHandler`: both `@Inject` `CurrencyOptionsHandler` and pass it to `NeoHeaderActionRouter.dispatch()`.
- `AbstractOrderHeaderHandler`: shared base implementing:
  - `blockCalloutCurrencyUpdate` — removes callout-pushed `currency` from `updates` (currency is user-only)
  - `checkExchangeRateWarning` — when user changes currency, appends a WARNING message if no rate exists
  - `applyPriceListFallbackIfNeeded` — replaces inactive price list pushed by callout with first active one
  - `syncLineCurrenciesOnCurrencyPatch` — after PATCH with `currency` field, aligns all `C_ORDERLINE.C_CURRENCY_ID` to the new header currency
  - `afterHandle` — annotates GET list responses with `hasLinkedDocuments`
- `CreateDraftInvoiceHandler`: when creating a draft invoice from an order:
  - Reads `order.EM_ETGO_Currency_Rate`
  - If order currency ≠ org currency AND rate is set: creates a `C_Conversion_Rate_Document` record with `rate` and `foreignAmount = grandTotal × rate`
  - **Gap:** does NOT yet set `invoice.EM_ETGO_Currency_Rate` (ETP-4029 will fix this)
- `InvoiceExchangeRateHandler`: manages the exchange rate sub-tab (`C_Conversion_Rate_Document`) on invoices — syncs `rate` ↔ `foreignAmount` when user edits either field.
- `NeoExchangeRateService`: exposes `GET /validate-exchange-rate?fromCurrency=&toCurrency=&date=` used by the frontend to check rate existence before committing a currency change.

**Frontend (tools/app-shell):**
- `CurrencyRatePicker.jsx` (`tools/app-shell/src/components/contract-ui/`): searchable currency selector with inline rate editor. Calls `currencyOptions` ACTION to get available currencies + rates. On selection, sends `currency`, `currency$_identifier`, and `eTGOCurrencyRate` in the PATCH.
- `EntityForm.jsx` (lines ~1246-1269): hardcoded conditional that renders `CurrencyRatePicker` instead of the standard `SelectorInput` when `f.column === 'C_Currency_ID'` AND `entity === 'header'` AND the URL matches `/(sales-order|purchase-order|sales-quotation)/`.
- `DetailView.jsx`: on currency field change, calls `validate-exchange-rate`; if no rate found, reverts the field and shows a toast. On currency change detected in `hook.selected`, sets `activeCurrencyConversionRef` for converting prices of new lines.
- `useDocumentCurrency.js` / `OrderPreview.jsx` / `SummaryCard.jsx`: shared hooks/components for dual-currency display in preview modals and summary cards.

**decisions.json patterns (sales-order / purchase-order):**
```json
"currency": { "visibility": "editable", "grid": false, "form": true, "section": "principal", "order": 10, "readOnlyLogic": "@Processed@='Y'" }
"eTGOCurrencyRate": { "visibility": "editable", "form": false, "grid": false }
"lines.currency": { "visibility": "editable", "grid": false, "form": false }
```

**Key invariants:**
- `CurrencyOptionsHandler` uses `Order.class` to resolve `orgId/clientId/date` for saved records.
- The `@Named("currencyOptionsHandler")` handler is reached via `@Inject` in `SalesOrderHeaderHandler` → `NeoHeaderActionRouter.dispatch()`, NOT via `lookupHandler()`. The entity qualifier (`salesOrderHeaderHandler`) is always the dispatch entrypoint.
- `NeoHeaderActionRouter.dispatch()` iterates handlers in order; first non-null response wins.
- `C_Conversion_Rate_Document` is the accounting-facing table that stores per-document rates for journal posting. `C_ORDER` does NOT have this table — only invoices do.

---

## ETP-4029 Scope

Extend the same currency/exchange-rate feature to **sales invoices** and **purchase invoices**. Specifically:

1. **Show exchange rate in invoice summaries/list** — requires storing the rate in a column on `C_INVOICE`.
2. **CurrencyRatePicker on the invoice form** — same component as orders; user can select currency and override rate directly on the invoice.
3. **Auto-create `C_Conversion_Rate_Document`** — when an invoice is saved with a non-org currency (whether created directly or from an order), the exchange rate tab must be populated.
4. **Inherit rate from source order** — when `CreateDraftInvoiceHandler` creates an invoice from an order, also populate `C_INVOICE.EM_ETGO_Currency_Rate` (currently only `C_Conversion_Rate_Document` is created).

Both `sales-invoice` and `purchase-invoice` are in scope.

---

## Implementation Plan

### Phase 1 — DB: New Column on `C_INVOICE`

**Repo:** `com.etendoerp.go` | **Files:** `src-db/database/sourcedata/AD_COLUMN.xml`, `src-db/database/model/modifiedTables/C_INVOICE.xml`

Add column `EM_ETGO_Currency_Rate` to `C_INVOICE`:
- Type: `NUMERIC(20,12)`, nullable, no default
- Same semantics as `C_ORDER.EM_ETGO_Currency_Rate`: stores the per-invoice exchange rate override
- A single column covers both sales and purchase invoices (same table)
- Generate UUID with `make uuid` — never invent an ID

**Correction (2026-07-01) — exact target confirmed:** `src-db/database/model/modifiedTables/C_INVOICE.xml` already exists (holds `EM_ETGO_TOTAL_DISCOUNT` from ETP-3662). Add a sibling `<column>` entry, mirroring the exact pattern already used for `C_ORDER` in `model/modifiedTables/C_ORDER.xml`:
```xml
<!-- C_ORDER.xml reference (already shipped in ETP-4027) -->
<column name="EM_ETGO_CURRENCY_RATE" primaryKey="false" required="false" type="DECIMAL" size="20,12" autoIncrement="false">
  <default/>
  <onCreateDefault/>
</column>
```
Add the identical `<column>` block into `C_INVOICE.xml`'s existing `<table name="C_INVOICE" ...>` block, alongside its current `EM_ETGO_TOTAL_DISCOUNT` entry.

Steps:
1. `make uuid` → use the output as `AD_COLUMN_ID`
2. Add entry to `AD_COLUMN.xml` following the exact same structure as the `EM_ETGO_Currency_Rate` entry for `C_ORDER` (look up `E01F12C1B9CE4539B145357B931F49FD` as reference)
3. Add the `<column>` block to `model/modifiedTables/C_INVOICE.xml` as shown above
4. Apply the model change to the live DB (whatever this project's standard `update.database`/smartbuild target is — check `Makefile`/`dev-assistant:etendo-smartbuild` skill for the exact command), THEN run `./gradlew export.database` in Etendo root to capture the resulting DB state back into sourcedata (Tomcat must be DOWN first). **Do not stop Tomcat or run DB-apply commands without checking with the coordinator first** — this affects the user's running local environment.

**Note:** No data migration needed — column is nullable; existing invoices get null (treated as "use global rate").

---

### Phase 2 — NEO Config: NOT NEEDED (verified 2026-07-01, dropped)

**This phase is skipped entirely.** Verified against `NeoServletSupport.parseActionOrRecordPath()`: `/action/{name}` routing is pure URL path parsing (`parts[4]` → `context.getFieldName()`) with zero DB/sourcedata dependency. `CurrencyRatePicker.jsx` calls the endpoint with a hardcoded URL (`` `${apiBaseUrl}/${entityPath}/${fetchId}/action/currencyOptions` ``) — it never reads the action name from `contract.json`. Confirmed `artifacts/sales-order/contract.json` (already working in production since ETP-4027) has zero references to `currencyOptions`. The ACTION is enabled purely by Java wiring (`@Inject CurrencyOptionsHandler` + `NeoHeaderActionRouter.dispatch(...)`, done in Phase 3.3/3.4) — no sourcedata row needed for sales-order/purchase-order, and none is needed for the invoice specs either.

<details>
<summary>Original Phase 2 text (superseded, kept for history)</summary>

### Phase 2 (superseded) — NEO Config: `currencyOptions` ACTION only (sourcedata)

**Repo:** `com.etendoerp.go` | **Files:** `src-db/database/sourcedata/ETGO_SF_FIELD.xml`

**Correction (2026-07-01):** verified against `sales-order`'s actual `decisions.json` — `eTGOCurrencyRate`, `currency` (editable), and `lines.currency` (writable) are ALL managed through the standard `decisions.json` → `make regen PUSH_TO_NEO=1` pipeline, NOT hand-edited XML. Hand-editing sourcedata for fields the pipeline already owns would conflict with Phase 4 and violate the "decisions.json is the single source of truth" rule. Only `currencyOptions` (an ACTION-type field) has no representation in `decisions.json`'s schema, so it remains a manual sourcedata addition — this matches how it was done for `sales-order`/`purchase-order` in ETP-4027 (confirmed: no `currencyOptions` entry exists in `artifacts/sales-order/decisions.json`).

For **both** `sales-invoice` and `purchase-invoice` header entities:

**2.1 Add `currencyOptions` ACTION:**
- Add new `ETGO_SF_FIELD` entry of type ACTION named `currencyOptions` on both specs' header entity
- This exposes: `GET /sws/neo/sales-invoice/header/{id}/action/currencyOptions`
- Use `make uuid` for `ETGO_SF_FIELD_ID`
- Verify `java_qualifier` on the `header` entity: `salesInvoiceHeaderHandler` / `purchaseInvoiceHeaderHandler` (query DB or read XML)

After this change, run `export.database`.

`currency` (editable), `eTGOCurrencyRate` (new field), and `lines.currency` (writable) are handled entirely in **Phase 4** via `decisions.json`.

</details>

---

### Phase 3 — Backend Java

**Repo:** `com.etendoerp.go` | **Package:** `com.etendoerp.go.schemaforge`

#### 3.1 Extend `CurrencyOptionsHandler` to support invoices

**File:** `src/com/etendoerp/go/schemaforge/CurrencyOptionsHandler.java`

Currently resolves `orgId/clientId/date` using `Order.class`. Needs to also support `Invoice.class`. Approach: branch on `context.getSpecName()`.

```java
// In handle(), replace the non-new record block:
String specName = context.getSpecName(); // e.g. "sales-invoice", "sales-order"
if (specName != null && specName.contains("invoice")) {
    Invoice inv = OBDal.getInstance().get(Invoice.class, recordId);
    if (inv == null) {
        return NeoResponse.error(HttpServletResponse.SC_NOT_FOUND, "Invoice not found: " + recordId);
    }
    orgId    = inv.getOrganization().getId();
    clientId = inv.getClient().getId();
    orderDate = inv.getInvoiceDate() != null
        ? java.time.Instant.ofEpochMilli(inv.getInvoiceDate().getTime())
            .atZone(java.time.ZoneId.systemDefault()).toLocalDate()
        : LocalDate.now();
} else {
    // existing Order.class path
    Order order = OBDal.getInstance().get(Order.class, recordId);
    // ...
}
```

The `buildCurrencyOptions()` method is already entity-agnostic (takes `orgId/clientId/orderDate`) — no changes needed there.

#### 3.2 Update `AbstractInvoiceHeaderHandler`

**File:** `src/com/etendoerp/go/schemaforge/AbstractInvoiceHeaderHandler.java`

**Correction (2026-07-01):** `AbstractInvoiceHeaderHandler` does NOT implement `NeoHandler` (it's a pure helper base — see its class javadoc). Unlike `AbstractOrderHeaderHandler`, it has no `afterCallout()`/`afterHandle()` of its own. `SalesInvoiceHeaderHandler` and `PurchaseInvoiceHeaderHandler` each implement `NeoHandler` independently and already define their own `handle()`/`afterHandle()`. So the new hooks must be added as `protected`/package-visible methods on `AbstractInvoiceHeaderHandler` (same pattern as the existing `validateDocTypeLock`, `validateLineQtyBeforeComplete`, etc.) and called **explicitly from each subclass's own `handle()`/`afterHandle()`** — there is no shared lifecycle method to hook into automatically. Both call sites (`SalesInvoiceHeaderHandler`, `PurchaseInvoiceHeaderHandler`) need the wiring.

Add the following (mirror of `AbstractOrderHeaderHandler`'s intent, adapted to invoices):

- **`blockCalloutCurrencyUpdate`**: remove callout-pushed `currency` from `updates` (same logic as orders) — call from each subclass's callout handling (note: order-side lives in `afterCallout()`; invoice handlers don't currently implement `afterCallout()` at all, so this needs a new override in both `SalesInvoiceHeaderHandler` and `PurchaseInvoiceHeaderHandler`, calling the shared base method).
- **`checkExchangeRateWarning`**: when user changes currency field, append WARNING if no rate exists — same call sites as above.
- ~~**`syncLineCurrenciesOnCurrencyPatch`**~~ **DROPPED (verified 2026-07-01):** confirmed `InvoiceLine.java` (generated) has no `Currency` property at all — unlike `OrderLine.java` (`getCurrency()`/`setCurrency()` backed by `C_Currency_ID`), `C_InvoiceLine` has no currency column to sync. `lines.cCurrencyId` in `decisions.json`/`contract.json` is a derived/context field (`source: "context.cCurrencyId"`), not a real DB column. Nothing to do here for invoices.
- **`autoCreateOrUpdateConversionRateDocument`**: NEW — upserts the `C_Conversion_Rate_Document` record for the invoice whenever its currency differs from the org currency. **Confirmed with user (2026-07-01): this must run as a continuous upsert on every successful header save (PATCH/PUT/POST), not only when `currency`/`eTGOCurrencyRate` appears in the request body.** Rationale: `InvoiceExchangeRateHandler` (the handler for the exchange-rate sub-tab) only recomputes `rate`/`foreignAmount` when the user edits that sub-tab directly — nothing currently reacts to the invoice's `grandTotalAmount` changing as lines are added/edited after the currency was first set. Running the upsert on every header save keeps `foreignAmount` in sync as the total evolves, including for invoices that had zero lines when the currency was first selected.

  Logic:
  ```
  on every successful header PATCH/PUT/POST (call from afterHandle(), unconditionally):
      invoiceId = context.getRecordId()
      invoice = OBDal.get(Invoice.class, invoiceId)
      if invoice == null or invoice.getCurrency() == null: return
      orgCurrencyId = OBCurrencyUtils.getOrgCurrency(invoice.getOrganization().getId())
      if invoice.getCurrency().getId() == orgCurrencyId: return   // nothing to track
      rate = invoice.getEMEtgoCurrencyRate()
      if rate == null: return                                     // no override set yet
      foreignAmount = invoice.getGrandTotalAmount() * rate          // may be 0/null pre-lines; that's fine
      upsert C_Conversion_Rate_Document (match on C_Invoice_ID + C_Currency_ID + C_Currency_ID_TO):
        C_Currency_ID    = invoice.getCurrency()
        C_Currency_ID_TO = orgCurrencyId
        C_Invoice_ID     = invoiceId
        Rate             = rate
        ForeignAmount    = foreignAmount
  ```

  Reuse the existing upsert/insert SQL shape from `InvoiceFromOrderSupport.propagateOrderRateToInvoice()` (see 3.5) rather than duplicating it — consider extracting a shared private helper if both call sites end up needing the same INSERT/UPDATE statement.

- Call `autoCreateOrUpdateConversionRateDocument` from the top of each subclass's `afterHandle()`, alongside `syncLineCurrenciesOnCurrencyPatch`.

#### 3.3 Update `SalesInvoiceHeaderHandler`

**File:** `src/com/etendoerp/go/schemaforge/SalesInvoiceHeaderHandler.java`

Add:
```java
@Inject
private CurrencyOptionsHandler currencyOptionsHandler;
```

Update `handle()` to pass `currencyOptionsHandler` to `NeoHeaderActionRouter.dispatch()`:
```java
@Override
public NeoResponse handle(NeoContext context) {
    // existing invoice-specific logic...
    return NeoHeaderActionRouter.dispatch(
        context,
        currencyOptionsHandler,
        // ... other existing handlers
    );
}
```

#### 3.4 Update `PurchaseInvoiceHeaderHandler`

**File:** `src/com/etendoerp/go/schemaforge/PurchaseInvoiceHeaderHandler.java`

Same changes as `SalesInvoiceHeaderHandler` — inject `CurrencyOptionsHandler`, add to dispatch.

Note: `PurchaseInvoiceHeaderHandler` overrides `isSalesTransaction()` returning `false` — verify this is still correct after changes (it's used in `AbstractOrderHeaderHandler.findDefaultActivePriceList`, which may or may not be relevant for invoices).

#### 3.5 Update `InvoiceFromOrderSupport.propagateOrderRateToInvoice`

**File:** `src/com/etendoerp/go/schemaforge/InvoiceFromOrderSupport.java` (NOT `CreateDraftInvoiceHandler.java`)

**Correction (2026-07-01):** the order→invoice rate propagation already exists — it lives in `InvoiceFromOrderSupport.propagateOrderRateToInvoice(Order order, Invoice invoice)`, which already creates the `C_Conversion_Rate_Document` row (via raw JDBC insert) when the source order has `EM_ETGO_Currency_Rate` set. This single method is called from **both** `CreateDraftInvoiceHandler.java:626` (sales) **and** `CreatePurchaseInvoiceHandler.java:280` (purchase) — the original plan only mentioned the sales path and would have missed purchase invoices entirely. It currently does NOT set `invoice.EM_ETGO_Currency_Rate` because that column doesn't exist yet (Phase 1).

Fix in ONE place — inside `propagateOrderRateToInvoice`, right after the existing `INSERT INTO c_conversion_rate_document` block succeeds:
```java
// Also persist the rate on the invoice column so summaries can display it
invoice.setETGOCurrencyRate(rate);   // `rate` is the local var already resolved from order.getETGOCurrencyRate()
OBDal.getInstance().save(invoice);
```
**Getter/setter name correction (verified 2026-07-01):** it's `setETGOCurrencyRate`/`getETGOCurrencyRate`, not `setEMEtgoCurrencyRate` — Etendo codegen derives the DAL property name from the shared `AD_Element` ("Currency Rate"), not from the column name, and both `C_ORDER` and `C_INVOICE` share that element. Confirmed against generated `Order.java`.

This single change covers both `CreateDraftInvoiceHandler` (sales) and `CreatePurchaseInvoiceHandler` (purchase) automatically, since they share this method.

**Test impact:** `InvoiceFromOrderSupportTest.java` already has extensive coverage of `propagateOrderRateToInvoice` (null-rate, same-currency, record-exists, null-org-currency, insert-throws cases) — extend these to also assert `invoice.getEMEtgoCurrencyRate()` where a rate is expected. `CreatePurchaseInvoiceHandlerTest.java` overrides `propagateOrderRateToInvoice` with a test double to verify wiring only — no change needed there.

---

### Phase 4 — Frontend

**Repo:** `etendo_schema_forge`

#### 4.1 `EntityForm.jsx` — Add invoice to CurrencyRatePicker condition

**File:** `tools/app-shell/src/components/contract-ui/EntityForm.jsx` (lines ~1246-1269)

Update the regex that controls when `CurrencyRatePicker` renders instead of `SelectorInput`:

```js
// Before
/\/(sales-order|purchase-order|sales-quotation)(\/|$)/.test(apiBaseUrl || '')

// After
/\/(sales-order|purchase-order|sales-quotation|sales-invoice|purchase-invoice)(\/|$)/.test(apiBaseUrl || '')
```

The rest of the condition (`f.column === 'C_Currency_ID' && (entity === 'header' || entity === 'quotation')`) may need `entity === 'header'` to be the only check for invoices — verify `entity` value used in invoice URLs.

#### 4.2 `decisions.json` — `sales-invoice`

**File:** `artifacts/sales-invoice/decisions.json`

**Current state (verified 2026-07-01):** `header.currency` is `{ "visibility": "readOnly", "grid": false, "form": false, "section": "summary", "reference": "Currency", "inputMode": "selector" }`. `lines.cCurrencyId` is `{ "visibility": "system" }`. No `eTGOCurrencyRate` entry exists.

**Target state (confirmed with user — align to orders pattern):**
- `header.currency`: `visibility: "editable"`, `form: true`, `section: "principal"`, `readOnlyLogic: "@Processed@='Y'"` (drop `section: "summary"`, keep `reference`/`inputMode` as-is)
- `eTGOCurrencyRate`: add new field entry — `visibility: "editable"`, `form: false`, `grid: false` (hidden from UI but writable by NEO)
- `lines.cCurrencyId`: change from `visibility: "system"` to `visibility: "editable"`, `form: false`, `grid: false` (allows conversion-time currency override on lines, matches orders' `lines.currency` pattern)

#### 4.3 `decisions.json` — `purchase-invoice`

**File:** `artifacts/purchase-invoice/decisions.json`

**Current state (verified 2026-07-01):** `header.currency` is ALREADY `{ "visibility": "editable", "section": "other", "form": false, "grid": false }` — different from sales-invoice (already editable, but hidden and in a different section). No `eTGOCurrencyRate` entry exists.

**Target state (confirmed with user — align to orders pattern, same as sales-invoice):**
- `header.currency`: keep `visibility: "editable"`; change `section` from `"other"` → `"principal"`; set `form: true`; add `readOnlyLogic: "@Processed@='Y'"`
- `eTGOCurrencyRate`: same as sales-invoice
- `lines.currency`/`lines.cCurrencyId` equivalent: same as sales-invoice — verify the exact line-currency field name in `purchase-invoice`'s `lines` entity before editing (may differ from sales-invoice's `cCurrencyId`).

#### 4.4 Regenerate and push

```bash
make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1
make regen ONLY=sales-invoice,purchase-invoice PUSH_TO_NEO=1
```

Verify with `node cli/src/validate-pipeline.js --scope=sales-invoice,purchase-invoice`.

#### 4.5 Invoice summary display

The `EM_ETGO_Currency_Rate` column will be served by NEO in GET responses once the ETGO_SF_FIELD entry exists and `decisions.json` declares `eTGOCurrencyRate`. To surface it in list/summary:
- If a summary card component exists for invoices (check `tools/app-shell/src/windows/custom/`), update it to use `useDocumentCurrency` hook passing `eTGOCurrencyRate`
- If no custom summary exists yet, create one following the pattern of `OrderPreview.jsx` / `SummaryCard.jsx`

---

### Phase 5 — Tests

#### Unit tests (Node test runner / Vitest)

**`CurrencyOptionsHandler` invoice path:**
- Test with spec name `"sales-invoice"` → resolves via `Invoice.class`
- Test with spec name `"purchase-invoice"` → same path
- Test with `recordId = "new"` for invoice → falls back to session context
- Test with non-existent invoice ID → returns 404

**`AbstractInvoiceHeaderHandler` new hooks:**
- `blockCalloutCurrencyUpdate`: callout pushes `currency` → removed from updates
- `checkExchangeRateWarning`: currency change with no rate → WARNING appended; with rate → no warning
- `autoCreateOrUpdateConversionRateDocument`: PATCH with `eTGOCurrencyRate` on non-org-currency invoice → `C_Conversion_Rate_Document` record created with correct rate and foreignAmount
- `syncLineCurrenciesOnCurrencyPatch`: PATCH with `currency` field → all invoice lines' `C_CURRENCY_ID` updated

**`CreateDraftInvoiceHandler` rate propagation:**
- Order with `EM_ETGO_Currency_Rate` set → invoice gets the column populated
- Order with null rate → invoice `EM_ETGO_Currency_Rate` stays null

#### E2E (Playwright)

Follow `docs/e2e-testing-guide.md` conventions. Canonical mocked spec reference: `e2e/tests/flows/row-quick-actions.mocked.spec.js`.

Flows to cover:
1. **Direct invoice creation with non-org currency**: open new invoice → CurrencyRatePicker visible → select non-org currency → rate shown → save → verify `C_Conversion_Rate_Document` record exists in DB and rate appears in invoice list
2. **Direct invoice: no rate available**: select currency with no defined rate → field reverts → error toast
3. **Invoice from order**: create draft invoice from order that has `EM_ETGO_Currency_Rate` set → verify invoice inherits both `C_INVOICE.EM_ETGO_Currency_Rate` and the `C_Conversion_Rate_Document` record
4. **Purchase invoice**: same flows as 1–2 for purchase invoices

---

### Phase 6 — Documentation

- Update `docs/generated-custom-windows/sales-invoice.md` — document the new currency/rate behavior
- Update `docs/generated-custom-windows/purchase-invoice.md` — same
- Update `docs/plans/2026-05-19-currency-pricelist-header.md` if it references the original plan for orders — note ETP-4029 extends it to invoices

---

## Key File Reference

| File | Repo | What changes |
|------|------|-------------|
| `src-db/.../AD_COLUMN.xml` | go | New `EM_ETGO_Currency_Rate` on `C_INVOICE` |
| `src-db/.../C_INVOICE.xml` | go | Model DDL for new column |
| `src-db/.../ETGO_SF_FIELD.xml` | go | Only `currencyOptions` ACTION for both invoice specs — `currency`/`eTGOCurrencyRate`/`lines.currency` go through `decisions.json` instead |
| `CurrencyOptionsHandler.java` | go | Branch on specName to support `Invoice.class` |
| `AbstractInvoiceHeaderHandler.java` | go | Add currency hooks (`blockCalloutCurrencyUpdate`, `checkExchangeRateWarning`, `syncLineCurrenciesOnCurrencyPatch`, `autoCreateOrUpdateConversionRateDocument`) as protected methods, called explicitly by each subclass |
| `SalesInvoiceHeaderHandler.java` | go | Inject + dispatch `CurrencyOptionsHandler`; call new hooks at top of `afterHandle()` |
| `PurchaseInvoiceHeaderHandler.java` | go | Same as sales |
| `InvoiceFromOrderSupport.java` | go | `propagateOrderRateToInvoice()` — also set `invoice.EM_ETGO_Currency_Rate` (single fix, covers both sales and purchase paths) |
| `EntityForm.jsx` | schema_forge | Extend regex (currently line ~754, not ~1246 — shifted by epic merge) to include `sales-invoice`, `purchase-invoice` |
| `artifacts/sales-invoice/decisions.json` | schema_forge | `currency`: readOnly→editable, section summary→principal, form:true; add `eTGOCurrencyRate`; `lines.cCurrencyId`: system→editable |
| `artifacts/purchase-invoice/decisions.json` | schema_forge | `currency`: already editable — section other→principal, form:true; add `eTGOCurrencyRate`; line-currency field equivalent |

---

## Dependencies / Gotchas

- **Branch base:** `epic/ETP-3504` in both repos. Both repos must be on parallel `feature/ETP-4029` branches.
- **`make uuid`** before every new AD record — IDs in `AD_COLUMN.xml` and `ETGO_SF_FIELD.xml` must be generated, never invented.
- **`export.database`** must run after any sourcedata changes (requires Tomcat DOWN).
- **`CurrencyOptionsHandler` scope:** `@Named("currencyOptionsHandler")` only — no `@ApplicationScoped`. The handler is reached via `@Inject`, not `lookupHandler()`, but the `@Dependent` scope (default when only `@Named` is present) is correct per the NeoHandler pattern documented in CLAUDE.md.
- **Correction (2026-07-01):** `hasLinkedDocuments` GET-annotation belongs to `AbstractOrderHeaderHandler` (orders), NOT `AbstractInvoiceHeaderHandler` — the invoice base class has no such enrichment. `SalesInvoiceHeaderHandler.afterHandle()` does its own GET-only enrichment (`enrichInvoiceSubtype`, `applyAmountNegationForCredit`, `applyTotalDiscountToRecord`, `enrichSourceInvoice`, `enrichDocTypeLocked`, `enrichLinkedShipments`, `TbaiSyncStatusInjector`) gated behind `if (!"GET".equals(...)) return null;`. `PurchaseInvoiceHeaderHandler.afterHandle()` similarly mixes POST/PUT-only logic (`persistOriginInvoice`) with GET enrichment. The new `syncLineCurrenciesOnCurrencyPatch` and `autoCreateOrUpdateConversionRateDocument` calls must be added at the very top of both subclasses' `afterHandle()`, BEFORE their existing method-gated logic, so they run on every save regardless of HTTP method — mirroring how `AbstractOrderHeaderHandler.afterHandle()` calls `syncLineCurrenciesOnCurrencyPatch(context)` unconditionally before its own `if (!"GET"...)` early return.
- **Invoice currency lock:** currently `currency` is `readOnly` in the invoice's Go form. After ETP-4029, it becomes editable on draft invoices (readOnlyLogic guards processed ones). Verify that the `C_INVOICE` table does NOT have a DB-level trigger equivalent to `C_ORDER_CHK_RESTRINCTIONS_TRG` that would block `C_CURRENCY_ID` changes — if it does, coordinate a core trigger change (separate PR in `etendo_core_pg`).
- **`InvoiceExchangeRateHandler`** already manages the exchange rate sub-tab (syncs `rate` ↔ `foreignAmount`). ETP-4029 does NOT replace it — `autoCreateOrUpdateConversionRateDocument` creates the initial record, and `InvoiceExchangeRateHandler` continues to manage subsequent edits by the user in the sub-tab.
- **`NeoExchangeRateService`** (`/validate-exchange-rate` endpoint) is already spec-agnostic — it accepts any `fromCurrency/toCurrency/date` and works for invoices without changes.
- **i18n:** any new user-visible string (toasts, warnings) must be added to BOTH `en_US.json` and `es_ES.json` in `packages/app-shell-core/src/locales/`. Follow `docs/i18n-guide.md`.

---

## Phase 7 — Gap Analysis vs Jira ETP-4029 (added 2026-07-02, after re-reading the actual ticket)

**Context:** the work done in Phases 1-6 above was scoped from the *technical* framing "extend ETP-4027's currency/exchange-rate bookkeeping from orders to invoices." Re-reading the actual Jira ticket ([ETP-4029](https://etendoproject.atlassian.net/browse/ETP-4029)) revealed its real scope is broader: it also requires field-ordering, a business-partner-linked price-list fallback, a **currency filter in all "import lines from X" dialogs**, and **currency/price-list inheritance when creating an invoice from a source document**. This section audits each ticket requirement against the CURRENT code (verified via direct file reads on 2026-07-02, not assumption) — several items initially guessed as "gaps" turned out to already work via pre-existing shared infrastructure, and vice versa.

**Excluded from this analysis (per user instruction, 2026-07-02):** "Herencia de moneda: Albarán de Venta → Factura de Venta" — a separate Jira issue already tracks this specific inheritance path; do not duplicate work here.

### 7.1 Field order: "Moneda primero, luego Tarifa" — PARTIALLY CORRECTED (2026-07-02, live-verified via Playwright MCP)

Ticket: *"Orden en la cabecera: Moneda primero, luego Tarifa."*

**Correction to the original analysis below:** the original write-up cited `decisions.json`'s raw JSON key declaration order as the base sort order for sales-invoice. That is wrong — the field-sort comparator's "natural order" fallback is the order fields appear in **`contract.json`'s `fields` array** (DB-extraction order), not `decisions.json`'s key order. Live browser check on `http://localhost:3100/sales-invoice/new` confirmed **Moneda already renders before Tarifa** — no gap here. Direct read of `artifacts/sales-invoice/contract.json` confirmed why: `currency` sits at index 11, `priceList` at index 15, neither has an explicit `seq`, so the stable sort preserves this order with currency first.

**Verified current state:** `generate-frontend.js` sorts form fields with this comparator (`generate-frontend.js:472-480`):
```js
// Sort by seq override if present (stable sort: fields without seq keep natural DB order)
.sort((a, b) => {
  if (a.seq != null && b.seq != null) return a.seq - b.seq;
  if (a.seq != null) return -1;   // a field WITH any seq value always sorts before one WITHOUT seq
  if (b.seq != null) return 1;
  return 0;
});
```
- `artifacts/sales-invoice/decisions.json`: **NOT a gap.** Neither `currency` nor `priceList` has an explicit `seq`, and `currency` precedes `priceList` in `contract.json`'s natural field order → Moneda already renders before Tarifa. Live-verified in browser 2026-07-02.
- `artifacts/purchase-invoice/decisions.json`: **CONFIRMED REAL GAP.** `priceList` has `"seq": 70`; `currency` has **no `seq`** → per the comparator, the field WITH a seq (priceList) always sorts first, regardless of the seq's numeric value → **Tarifa renders before Moneda**. Live-verified in browser 2026-07-02 on `http://localhost:3100/purchase-invoice/new`.

**Only purchase-invoice needs a fix.** Add an explicit `seq` to `currency` in `artifacts/purchase-invoice/decisions.json`, lower than `priceList`'s `70` (or remove `priceList`'s `seq` and let natural order apply, if that order already puts currency first — needs checking against `contract.json` before deciding which approach).

### 7.2 "Propuesta automática, fallback a tarifa principal" (BP-linked price list) — CONFIRMED ALREADY WORKING (2026-07-02, live-verified via Playwright MCP)

Ticket test case: *"Factura de Venta EUR con contacto que tiene 'Tarifa Premium' configurada → al seleccionar el contacto, Tarifa se autocompleta con 'Tarifa Premium'."*

**Verified:** no CUSTOM Go code exists for this (`SalesInvoiceHeaderHandler.afterCallout()` / `PurchaseInvoiceHeaderHandler.afterCallout()` only call `blockCalloutCurrencyUpdate` + `checkExchangeRateWarning` — neither touches `priceList`). **However**, this doesn't mean it's broken: the CLASSIC Etendo callout `SE_Invoice_BPartner.java` (core, not Go) already contains this exact logic:
```java
// /Users/jortolano/intellij/etendo_core/src/org/openbravo/erpCommon/ad_callouts/SE_Invoice_BPartner.java:97-105
String strPriceList = isSales ? data[0].mPricelistId : data[0].poPricelistId;
if (StringUtils.isEmpty(strPriceList)) {
  strPriceList = SEOrderBPartnerData.defaultPriceList(this, strIsSOTrx, ...);
  ...
}
```
This reads the BP's configured sales/purchase price list, with a fallback to a default — exactly the ticket's ask — and NEO's generic callout-cascade mechanism (already relied upon elsewhere in this codebase, e.g. for `paymentTerms`) applies it automatically without any Go-side code, the same way it already does for orders. Our `blockCalloutCurrencyUpdate` only strips the `currency` key from callout `updates`, never `priceList`, so nothing in our new code interferes.

**Live confirmation (2026-07-02):** on `http://localhost:3100/purchase-invoice/new`, DB query found BP "Proveedor Mayorista" (`8EB9853B2C144E9BBF4F7AC1679AFEDD`) configured with purchase price list "Lista de compra (con impuestos)" — different from the form's default "Lista de compra (sin impuestos)". Selected it as Contacto in the browser: Tarifa auto-updated from "Lista de compra (sin impuestos)" to "Lista de compra (con impuestos)" immediately, with no page reload or manual trigger. **Confirmed closed — no work needed.**

### 7.3 Currency filter on "Importar desde X" dialogs — FIXED (implemented, live-verified, and tested, 2026-07-02)

Ticket: *"al importar líneas desde otros documentos, mostrar únicamente los documentos origen cuya moneda coincida con la moneda actualmente seleccionada en la cabecera de la factura"* — with 5 explicit Given/When/Then cases (EUR/USD exclusion, mid-session currency change, empty-state messaging for the return-invoice and no-match scenarios).

**Original gap (verified by direct file read before the fix):** zero currency filtering in any of the 5 import modals — `documentStatus`/`businessPartner`/`invoiceStatus`/`invoiced` were checked, but never `currency`.

**Fix implemented — two patterns depending on the source document type:**
- **Order-based** (`ImportFromOrderModal.jsx`, `ImportFromPurchaseOrderModal.jsx`): the candidate order already carries `currency` directly. `fetchDocuments()` now also fetches the invoice's own current header (`${base}/<spec>/header/${invoiceId}`) and filters candidates by `o.currency === invoiceCurrency`.
- **Movement-based** (`ImportFromShipmentModal.jsx`, `ImportFromReturnShipmentModal.jsx`, `ImportFromGoodsReceiptModal.jsx`): `M_InOut` has no `C_Currency_ID` column, so currency is resolved via the candidate's linked order (`salesOrder` FK, confirmed present on shipments/returns/receipts alike since they share the same underlying table) — batch-fetched via `${base}/sales-order/header/${id}` or `${base}/purchase-order/header/${id}`. Candidates with no linked order are never excluded (nothing to compare against).
- **Shared `ImportLinesModal.jsx`:** new `noCurrencyMatchMessageKey` prop + `excludedByCurrency` state, so the empty-state message distinguishes "no documents at all" from "no documents in this currency" (the ticket's empty-state requirement). 5 new i18n keys added to both `en_US.json`/`es_ES.json`: `noSalesOrdersMatchCurrency`, `noPurchaseOrdersMatchCurrency`, `noShipmentsMatchCurrency`, `noReturnShipmentsMatchCurrency`, `noGoodsReceiptsMatchCurrency`.
- The filter reads the invoice's **current** header currency at fetch time (satisfies the ticket's "follows the CURRENT header currency" requirement) — re-opening a modal after changing the header currency re-fetches and re-filters.

**Live confirmation (2026-07-02, via Playwright MCP), both directions:**
- Purchase-invoice with contact "Proveedor Mayorista": switching header currency to USD made both "Importar desde recibo" and "Importar desde pedido" correctly exclude the EUR receipt (`10000000`) and EUR order (`1000038`), showing the new currency-specific empty message instead. Switching back to EUR made both reappear immediately.
- Sales-invoice with contact "Juan Perez" (39 completed EUR orders + 25 completed USD orders): with the invoice in USD, "Añadir desde pedido" listed exactly the 14 non-fully-invoiced USD orders and zero EUR orders.

**No compilation required** — pure frontend/JS change, hot-reloaded by Vite.

**Automated regression coverage (delegated to Tester, 2026-07-02):** 3 new source-reading test files (`ImportFromOrderModal.test.js`, `ImportFromPurchaseOrderModal.test.js`, `ImportFromGoodsReceiptModal.test.js`) plus extensions to the 2 existing ones (`ImportFromShipmentModal.test.js`, `ImportFromReturnShipmentModal.test.js`) and to `ImportLinesModal.vitest.jsx`, covering: currency match kept / mismatch excluded / no-linked-order never excluded / `excludedByCurrency` true only when candidates existed pre-filter / correct `noCurrencyMatchMessageKey` per modal. Also a new i18n parity test (`etp4029-currency-filter-keys.test.js`) since no existing test diffed `genericLabels` key-by-key between locales. Full suite: 853 Node tests + 23 Vitest tests, all green.

### 7.4 Currency/price-list inheritance when creating an invoice from a source document — MOSTLY ALREADY WORKING (pre-existing, not something ETP-4029 built)

Ticket: *"cuando se genera una Factura desde un Presupuesto, Pedido o Albarán, la Factura hereda la moneda y la tarifa del documento de origen."*

**Verified — Presupuesto (Quotation) → Sales Invoice:**
- `CreateDraftInvoiceHandler.java:185-186` routes quotations through the same `createFromOrder()` path as orders.
- `NeoCommercialDocumentFactory.java:199-200`:
  ```java
  invoice.setPriceList(order.getPriceList());
  invoice.setCurrency(order.getCurrency());
  ```
  Both `currency` AND `priceList` are copied. Since this is the SAME method used for the order path, `CreateDraftInvoiceHandler.java:626`'s `getSupport().propagateOrderRateToInvoice(order, invoice)` call (our Phase 3.5 fix) also fires here — **the `EM_ETGO_Currency_Rate` propagation we built today already covers quotations for free**, not just plain orders.

**Verified — Pedido de Venta → Factura de Venta:** no separate "Gestionar envío y factura" action/handler exists — the ticket's action name refers to the SAME unified `createDraftInvoice` action already covered above. Currency + priceList + rate: all copied, confirmed.

**Verified — Pedido de Compra → Factura de Compra:** `CreatePurchaseInvoiceHandler.java:246-283` calls the same `NeoCommercialDocumentFactory.createInvoiceFromOrderHeader()` (currency + priceList copied) and `:280` calls `propagateOrderRateToInvoice` (rate copied). Confirmed working, same as sales side.

**Live confirmation of the Pedido → Factura path (2026-07-02):** used "Gestionar envío y factura → Crear factura" on completed sales order `1000186` (USD, rate 1.16, priceList "Lista de venta (sin impuestos)"). New draft invoice `1000158` was created; DB query confirmed `c_currency_id`=USD, `m_pricelist_id`="Lista de venta (sin impuestos)" (both matching the order), `em_etgo_currency_rate`=1.16 (matching the order), and a `C_Conversion_Rate_Document` row with `rate`=0.862068965517 (=1/1.16, the correct doc→org multiplier) and `foreign_amount`=24.58 (=28.51 × 0.862068965517, matching the verified real-world formula from Phase 6). Browser also showed the "Exchange Rates" tab populated (count: 1). Test invoice deleted after verification (draft, no side effects on the source order).

**Purchase Receipt → Purchase Invoice — CONFIRMED REAL GAP (found via code reading 2026-07-02, NOT yet live-verified):** `CreatePurchaseInvoiceHandler.createFromReceipt()` (lines 355-405), for the case where the receipt has a linked purchase order, also calls `NeoCommercialDocumentFactory.createInvoiceFromOrderHeader(linkedOrder, ...)` — the same factory method used by `createFromOrder()`, so currency + priceList ARE copied. But **`createFromReceipt()` never calls `getSupport().propagateOrderRateToInvoice(...)`** — that call only exists in `createFromOrder()` (line 280). Confirmed by grep: the only two call sites of `propagateOrderRateToInvoice` in this file are lines 280 (`createFromOrder`) and (separately) `InvoiceFromOrderSupport.java`'s own definition — none inside `createFromReceipt` or `createFromReceiptNoPo`. `NeoCommercialDocumentFactory.createInvoiceFromOrderHeader` itself was also confirmed (grep) to not touch `ETGOCurrencyRate` or `ConversionRateDocument` at all. **Net effect: an invoice created from a goods receipt linked to a non-org-currency purchase order will get the correct currency and price list, but NOT the exchange rate or the `C_Conversion_Rate_Document` row** — the same bug Phase 3.5 fixed for the direct order path, un-fixed for this one path. **Not live-verified**: no eligible test data existed (all non-EUR purchase orders with a completed linked receipt in this environment were already invoiced, from 2021 seed data predating this session's fix) — would require creating a fresh PO + receipt from scratch to test live. Recommend either doing that setup or accepting the code-level confirmation (the missing method call is unambiguous by direct comparison) before deciding on a fix.

**`createFromReceiptNoPo()`** (goods receipt with no linked order) was not evaluated for this gap — it has no source order to propagate a rate from, so it's out of scope for "inherits from source document"; whatever currency the resulting invoice ends up with should go through the normal header `afterHandle()` → `autoCreateOrUpdateConversionRateDocument` path like any newly created invoice, which is unconditional and already covers this case.

**Excluded per user instruction:** "Albarán de Venta → Factura de Venta" (Sales Shipment → Sales Invoice) — tracked by a separate, existing Jira issue; not audited here.

---

## Rollback

- Revert `feature/ETP-4029` commits in both repos.
- The `C_INVOICE.EM_ETGO_Currency_Rate` column addition is additive (nullable) — existing data is unaffected. Column can be dropped separately if needed after rollback.
- `make regen ONLY=sales-invoice,purchase-invoice PUSH_TO_NEO=1` against the reverted decisions restores NEO config.
- `export.database` after reverting sourcedata restores `ETGO_SF_FIELD` and `ETGO_SF_ENTITY` to pre-ETP-4029 state.
