# Discount Feature — Status and Next Steps

**Date:** 2026-05-03 (updated 2026-05-07)
**Active branch:** `feature/ETP-3662` (rebased onto `epic/ETP-3662`)
**Status:** Per-product discount ✅ delivered — Total discount ✅ fully implemented (backend + frontend + Sonar clean)

---

## Part 1 — Per-product discount (IMPLEMENTED, in PR)

### What it does

The document totals panel (orders, invoices, quotations) includes a fully client-side, real-time discount breakdown:

**Discount column**: always visible in the lines grid and the inline add-row.

**Auto-appear breakdown rows** (shown when `discountAmt > 0`, i.e. at least one line carries a non-zero discount):
- "Subtotal without discount" (`Σ qty × listPrice`)
- "Discount per product" — read-only computed row

**`+ Add total discount` button**: appears when no total discount is active and at least one line exists. Hidden when `readOnly` or no lines.

All totals are 100% client-side and real-time, including in-progress add-row (`pendingLine`) and live sidebar edits (`editingLine`).

### Affected windows

| Window | Panel |
|--------|-------|
| Sales Order | `DetailView.jsx` (direct) |
| Purchase Order | `DetailView.jsx` (direct) |
| Sales Quotation | `DetailView.jsx` (direct) |
| Sales Invoice | `InvoiceBottomPanel` → `DocumentTotalsPanel` |
| Purchase Invoice | `PurchaseInvoiceBottomPanel` → `DocumentTotalsPanel` |

### Key files

| File | Role |
|------|------|
| `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx` | Generic component — panel with breakdown, interactive total discount section, and read-only mode for completed docs |
| `tools/app-shell/src/lib/documentTotals.js` | Pure function `computeDocumentTotals()` — all calculation logic |
| `tools/app-shell/src/lib/__tests__/documentTotals.test.js` | Unit tests |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx` | Passes `pendingLineValues`, `editingLine`, `totalDiscountPct`, `readOnly` to the panel |
| `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceBottomPanel.jsx` | Derives `isReadOnly = documentStatus !== 'DR'` and passes to panel |
| `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx` | Same pattern as PurchaseInvoiceBottomPanel |

---

## Part 2 — Total discount (IMPLEMENTED)

### Architecture

The discount line is created **only just before the Complete action** (documentAction=CO). It is not maintained throughout the draft lifecycle — only at completion time.

**Flow:**
1. User sets a percentage via the panel input → PATCH `{ etgoTotalDiscount: N }` → stored in `EM_Etgo_Total_Discount` on the header.
2. On Complete (`POST /action/documentAction` with `{ docAction: "CO" }` or CRUD PATCH with `{ documentAction: "CO" }`):
   - Header handler's `handle()` pre-hook calls `AbstractOrderHeaderHandler.applyTotalDiscountBeforeComplete()`.
   - `TotalDiscountService.recalculate()` deletes any existing ETGO_DTO line, computes `netSubtotal` (sum of all non-discount lines), inserts a new negative-amount discount line.
3. On GET: line handlers filter the ETGO_DTO line from the response. The `etgoTotalDiscount` field is returned from the header and used to restore the panel state.

**Why only at Complete (not on every PATCH/line change):**
Triggering on every PATCH was inefficient (`etgoTotalDiscount` is controlled by arrow keys, producing continuous requests). The discount line needs to reflect the final set of lines and the correct amounts, so inserting it just before completion is the correct point.

### Backend components

#### `TotalDiscountService` (`com.etendoerp.go.schemaforge`)

`@ApplicationScoped` CDI bean:
- `recalculate(String headerId, boolean isInvoice)`:
  - Reads `EM_Etgo_Total_Discount` from `C_Invoice`/`C_Order`
  - Deletes existing discount lines (product = `ETGO_DTO`)
  - Computes `netSubtotal` = `SUM(linenetamt)` excluding discount lines
  - Inserts new discount line with negative amount, using tax from first product line and UOM from the dummy product

Constants:
- `DISCOUNT_PRODUCT_ID = "E4BC94E71D664E73A066DAF78BF39DB3"` (product search key: `ETGO_DTO`)

#### Header handlers

| Handler | Config |
|---------|--------|
| `SalesOrderHeaderHandler` | `applyTotalDiscountBeforeComplete(context, service, false)` |
| `PurchaseOrderHeaderHandler` | `applyTotalDiscountBeforeComplete(context, service, false)` |
| `SalesQuotationHeaderHandler` | `applyTotalDiscountBeforeComplete(context, service, false)` |
| `SalesInvoiceHeaderHandler` | `applyTotalDiscountBeforeComplete(context, service, true)` |
| `PurchaseInvoiceHeaderHandler` | `applyTotalDiscountBeforeComplete(context, service, true)` |

The shared helper in `AbstractOrderHeaderHandler` intercepts two paths:
- **CRUD:** PATCH/PUT with `{ documentAction: "CO" }` in body
- **ACTION:** POST to `/action/documentAction` with `{ docAction: "CO" }` or `{ fieldValues: { documentAction: "CO" } }`

#### Line handlers

| Handler | Windows | Behavior |
|---------|---------|----------|
| `OrderLineHandler` | Sales Order, Purchase Order, Sales Quotation | GET: filters ETGO_DTO lines from response |
| `InvoiceLineHandler` | Sales Invoice, Purchase Invoice | GET: filters ETGO_DTO lines from response |

Line handlers no longer trigger `recalculate()` on line add/delete — that pattern was removed.

### Data model

| Element | Value |
|---------|-------|
| Dummy product search key | `ETGO_DTO` |
| Dummy product ID | `E4BC94E71D664E73A066DAF78BF39DB3` |
| Header column (`C_INVOICE`) | `EM_Etgo_Total_Discount` (AD_Column_ID: `8E5D45740B584747A55632EA47B85C85`) |
| Header column (`C_ORDER`) | `EM_Etgo_Total_Discount` (AD_Column_ID: `801DA2A5D6C4436F8B0F26D0995189C4`) |
| API field name | `etgoTotalDiscount` (the `em_` prefix is stripped by the extractor; `java_qualifier` in ETGO_SF_FIELD maps `emEtgoTotalDiscount` → `etgoTotalDiscount`) |
| Tax strategy | Single discount line using tax from the first non-discount product line (Q-B interim) |

### NEO config (all 5 windows)

`etgoTotalDiscount` added to `decisions.json` as `visibility: editable, form: false` on all 5 windows. Contracts regenerated and pushed to NEO (`make regen ONLY=<window> SKIP_EXTRACT=1 PUSH_TO_NEO=1`). Field is `ISINCLUDED=Y, ISREADONLY=N` in `ETGO_SF_FIELD`.

### Frontend fixes

#### `lineGrossAmount` double-discount regression (fixed 2026-05-06)

**Root cause:** ETP-3881 refactored `NeoDefaultsService.injectLineGrossAmountIfMissing` into
`NeoCommercialLinePolicy` but accidentally copied a pre-fix version — one that applied
`(1 − discount/100)` to `unitPrice` (which is already post-discount), causing double-discounting.
It also dropped the client guard, so the server overwrote the correct client-computed value on PATCH.

**Fix:** Restored both corrections in `NeoCommercialLinePolicy.injectLineGrossAmountIfMissing`:
- Formula: `baseNetAmt = unitPrice * qty` (no discount factor)
- Guard: if client sends non-zero `lineGrossAmount`, trust it and return early

**Symptom visible:** grid column "Importe bruto de línea" showed wrong values (e.g. 43.12 instead
of 47.92 for 44.00 × 0.9 × 1.21); totals panel showed wrong tax (e.g. 3.52 instead of 8.32).

#### Race condition in `DocumentTotalsPanel` (fixed 2026-05-05)

**Root cause:** when the header GET returned first (`etgoTotalDiscount=6`), the first effect set `totalDiscountOpen=true`. Then lines arrived momentarily empty, triggering the second effect which reset `totalDiscountOpen=false`. Lines then loaded (1 item) but the first effect didn't re-fire.

**Result:** `totalDiscountOpen=false` but `inputPct=6` — numbers were computed correctly (e.g. 11.28 subtotal) but the discount label rows were invisible.

**Fix:** the auto-collapse effect only fires when `totalDiscountPct <= 0`:
```js
useEffect(() => {
  if (lines.length === 0 && pendingLine == null && totalDiscountPct <= 0) {
    setTotalDiscountOpen(false);
  }
}, [lines.length, pendingLine, totalDiscountPct]);
```

#### Read-only display for completed documents (fixed 2026-05-05)

When `readOnly=true` and `totalDiscountOpen=true`, the panel now shows a plain text row instead of the interactive checkbox + input:
```
Descuento total (6%)        -0.72€
```

### Classic safety analysis

- `C_INVOICE_DISCOUNT_ID = NULL` → `c_invoice_post` does not delete our lines
- `c_invoiceline_trg2` recalculates header totals including negative lines → `GrandTotal` always correct
- `ConvertQuotationIntoOrder.java` skips lines where `c_order_discount_id IS NOT NULL` — our lines have NULL → they get copied. Harmless: on next open/save through GO, stale lines are replaced by `recalculate()`
- RM orders: total discount is out of scope; `c_order_post1` check (`qtyordered > 0 AND c_order_discount_id IS NULL`) only concerns RM subtype, which is not managed through GO

### Testing status

| Window | Discount created on Complete | Panel shows after Complete |
|--------|------------------------------|----------------------------|
| Sales Order | ✅ tested | ✅ tested |
| Purchase Order | not yet tested | not yet tested |
| Sales Invoice | not yet tested | not yet tested |
| Purchase Invoice | not yet tested | not yet tested |
| Sales Quotation | not yet tested | not yet tested |

---

## ETGO_DTO dummy product — configuration validation (2026-05-07)

The `ETGO_DTO` product must be exported in the dataset before the feature ships. The following configuration has been validated against Classic behavior.

| Field | Value | Rationale |
|-------|-------|-----------|
| Search Key | `ETGO_DTO` | Must match `DISCOUNT_PRODUCT_ID` constant in `TotalDiscountService` |
| Name | `Discount` | Descriptive only |
| Product Type | **Service** | Critical — Service products do not require a warehouse/locator. An Item-type product would cause Etendo to demand `M_Locator_ID` when inserting the line, which we never provide |
| UOM | Unit | Required field; `TotalDiscountService` reads UOM from the first non-discount line and assigns it to the discount line, so the product's UOM is a fallback only |
| Tax Category | Standard | Not functionally critical — `TotalDiscountService` always sets the tax explicitly from each tax group; the product's tax category is not used during line creation |
| Purchase + Sale | Both checked | Required to use the product on both purchase and sales documents |
| Organization | `*` | Cross-org — accessible to all organizations in the tenant |
| Active | Yes | — |

**What it does NOT need:**
- A price in any price list — all prices (`unitPrice`, `listPrice`, `grossUnitPrice`, etc.) are set programmatically by `TotalDiscountService`
- Attribute Set — service products without variant control
- Accounting category — this is covered by open question Q-A (GL account for discounts must be configured by the analyst before production)

**Classic validation:** `C_ORDER_POST1` and `C_INVOICE_POST` use the same pattern — a Service product inserted with all prices overridden, one line per tax group. No price list lookup, no locator required.

---

## Sonar fixes (2026-05-07)

All Sonar issues on `feature/ETP-3662` have been resolved and pushed.

### `com.etendoerp.go` module

| File | Issues fixed |
|------|-------------|
| `AbstractOrderHeaderHandler.java` | Cognitive Complexity 31→≤15 (extracted `isCompleteAction`, `isCrudComplete`, `isActionDocumentActionComplete`); constant `FIELD_DOCUMENT_ACTION`; constants `DOC_TYPE_ORDER`/`DOC_TYPE_INVOICE`; removed commented-out code with JSON-looking fragments; merged `if` statements; logger made `static final` |
| `TotalDiscountService.java` | Constants `COL_ORDER_ID`, `COL_INVOICE_ID`, `TABLE_ORDER_LINE`, `TABLE_INVOICE_LINE`, `SQL_WHERE`; eliminated unnecessary `val` temp variable (direct return) |
| `OrderLineHandler.java` + `InvoiceLineHandler.java` | Extracted `DiscountLineFilter.filterFromResponse()` to eliminate 57 duplicated lines (9% duplication → within threshold) |

### Schema Forge module

| File | Issues fixed |
|------|-------------|
| `DocumentTotalsPanel.jsx` | `!(totalDiscountPct > 0)` → `totalDiscountPct <= 0` (opposite operator rule) |
| `documentTotals.js` | Default param `lines = []` not last → removed default, guard inside with `const safeLines = lines \|\| []`; nested ternary at `totalDiscountAmt` extracted to `if/let` block; Cognitive Complexity 18→15 by extracting `applyEditingLine()` helper and merging `baseTaxAmt`+`taxAmt` into a single expression |

---

## Open questions (analyst sign-off required)

| ID | Question | Status |
|----|----------|--------|
| Q-A | Accounting configuration for dummy product `ETGO_DTO` — must use a "discounts" GL account (e.g. 709) | ⏸ pending analyst |
| Q-B | Tax distribution: **Classic behavior confirmed** — one line per tax group (see analysis below). Implemented 2026-05-06. | ✅ implemented |
| Q-C | Coexistence of per-product discount and total discount confirmed acceptable | ⏸ pending analyst |

Q-A and Q-C do not block testing but must be resolved before the feature ships to production.
Q-B is implemented — `TotalDiscountService` now creates one discount line per tax group.

---

### Q-B — Tax distribution: how Classic basic discounts work (research 2026-05-06)

Analysis of `C_ORDER_POST1` and `C_INVOICE_POST` stored procedures in Classic confirms:

**Classic creates one discount line per tax group, not a single discount line.**

The stored procedure uses a nested loop:
```sql
-- Outer loop: each discount defined on the document
FOR Cur_COrderDiscount IN (SELECT ... FROM C_ORDER_DISCOUNT ...) LOOP
  -- Inner loop: GROUP BY C_TAX_ID on all non-discount lines
  FOR Cur_TaxDiscount IN (
    SELECT C_TAX_ID, SUM(LINENETAMT) AS LINENETAMT
    FROM C_ORDERLINE
    WHERE C_ORDER_ID = v_Record_ID
      AND C_ORDER_DISCOUNT_ID IS NULL  -- only product lines
    GROUP BY C_TAX_ID                  -- one entry per tax group
  ) LOOP
    -- Creates one discount line per (discount × tax group):
    v_Discount := -1 * Cur_TaxDiscount.LINENETAMT * DiscountPct / 100;
    INSERT INTO c_orderline (..., c_tax_id, linenetamt, ...)
    VALUES (..., Cur_TaxDiscount.C_TAX_ID, v_Discount, ...);
  END LOOP;
END LOOP;
```

**Example with mixed taxes:**

| Line | Product | Net | Tax |
|------|---------|-----|-----|
| 10 | Fernet | 39.60 | IVA Normal 21% |
| 20 | Agua | 11.40 | IVA Reducido 10% |

With 10% total discount — Classic creates **two** negative lines:
| Discount line | Amount | Tax |
|---|---|---|
| ETGO_DTO (IVA 21%) | −3.96 | IVA Normal 21% |
| ETGO_DTO (IVA 10%) | −1.14 | IVA Reducido 10% |

**Implemented `TotalDiscountService` (2026-05-06):**
`readNetSubtotalByTax()` queries `GROUP BY c_tax_id ORDER BY MIN(line)` and returns
a `Map<taxId, netAmt>`. `recalculate()` loops over the map and calls
`create*DiscountLine(headerId, discountAmt, taxId, lineNo)` once per tax group.

→ For the example above: two lines — ETGO_DTO (IVA 21%) = −3.96, ETGO_DTO (IVA 10%) = −1.14.

Single-tax documents (the common case) are unaffected — the loop runs once.

**Cross-reference (2026-09-08, ETP-5132):** this same `v_Discount := -1 * netAmt * pct/100`
sign convention (the discount's sign is the *opposite* of the base net amount's sign) is what
`docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md` uses to fix
`DocumentTotalsPanel.jsx`/`documentPdf.js`'s "Discount per product"/"Total discount" display,
which showed 0,00 € instead of the real amount on a negative-quantity (return) line. No change
was needed in this section — it was already correct.
