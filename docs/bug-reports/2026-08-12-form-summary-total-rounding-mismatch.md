# Form summary Total mismatches Grid Imp. Total on orders/invoices/quotations

Date: 2026-08-12

Jira: [ETP-4777](https://etendoproject.atlassian.net/browse/ETP-4777)

Status: **Investigation mostly complete.** Root cause confirmed for Case 1/2/3 across Orders, Invoices and Quotations. Global discount mechanism, header-recalc, and Goods Shipment/Receipt scope are now confirmed against code. **Critical correction (2026-08-12, second pass): the "Preview/Send Document" client-side PDF surface also reimplements the buggy total computation — Case 2 is not limited to the official jsreport print, as originally assumed.** Hybrid fix design is ready to be scoped into an implementation plan.

## Summary

On Quotations, Orders and Invoices (sales and purchase), the "Total" shown in the Form view's bottom-right summary panel does not match the "Imp. Total" shown in the Grid view for the same document. The observed drift is 0.01–0.02, and the Form summary also fails to refresh to the correct value after the document is completed.

Three manifestations reported in the ticket, all reproduced/confirmed against source:

- **Case 1** — Form Total ≠ Grid Imp. Total on a draft/non-confirmed document (e.g. 89.19 vs 89.21).
- **Case 2** — The print/PDF preview opened from the Form view shows the Form's (wrong) total, not the DB-persisted total shown in the Grid.
- **Case 3** — After completing the document, Grid and print update to the correct post-confirmation total (89.20), but the Form summary panel keeps showing the pre-confirmation value (89.19) and never recalculates.

## Repo topology note

The bug is **not** in `etendo_core_pg` (Etendo Classic backend). It is exclusively in the new frontend, **Schema Forge / Etendo Go**, which lives in this sibling repo (`etendo_schema_forge`) plus its runtime module `com.etendoerp.go` (inside `etendo_core_pg/modules/com.etendoerp.go/`). Etendo Classic's own UI and the report/PDF generation are unaffected — see below.

## Root cause #1 — Intentional double rounding in the live JS total (ETP-4015)

`tools/app-shell/src/lib/documentTotals.js:94-139`:

```js
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;   // line 51

function computeDisplayGrandTotal(baseGrandTotal, netSubtotal, taxAmt, factor) {
  if (baseGrandTotal == null) return null;
  if (netSubtotal == null) return round2(baseGrandTotal * factor);
  return round2(netSubtotal * factor) + round2(taxAmt);               // line 103
}
...
const grandTotal = computeDisplayGrandTotal(baseGrandTotal, netSubtotal, taxAmt, factor);  // line 139
```

`grandTotal = round2(netSubtotal) + round2(taxAmt)`, **not** `round2(netSubtotal + taxAmt)`. Subtotal and tax are rounded independently before being summed.

This was a deliberate change, commit `ce3e829f0` ("Feature ETP-4015: Stop double-rounding in displayed document totals"), justified in-code (`documentTotals.js:94-99`) by the "accounting/legal convention" that *displayed subtotal + displayed tax = displayed total*. That invariant is real, but it was never checked against what the DB actually persists as `grandtotal` — which is where it breaks.

## Root cause #2 — Rounding granularity mismatch vs. the backend trigger

- **Frontend** (`tools/app-shell/src/lib/useLineGrossAmount.js:206,235`) rounds **per line**:
  ```js
  calloutResult.lineNetAmount = parseFloat(lineNet.toFixed(2));
  calloutResult.grossAmount   = parseFloat((lineNet * factor).toFixed(2));
  ```
  `documentTotals.js:90-92` (`sumGrossField`) then sums these already-rounded per-line values to get `baseGrandTotal`.

- **Backend** — `src-db/database/model/triggers/C_ORDERLINE_TRG2.xml:213-227` (mirrored by `C_INVOICELINE_TRG2.xml:214-223`):
  ```sql
  SELECT COALESCE(SUM(ot.TaxBaseAmt), 0), COALESCE(SUM(ot.TaxAmt), 0)
  INTO v_taxBaseAmt, v_taxAmt
  FROM (
    SELECT CASE WHEN MIN(ot.TaxBaseAmt) > 0 THEN MIN(ROUND(ot.TaxBaseAmt, v_Prec)) ELSE MAX(ROUND(ot.TaxBaseAmt, v_Prec)) END as TaxBaseAmt,
           SUM(ot.TaxAmt) as TaxAmt
    FROM C_OrderTax ot
    WHERE ot.C_Order_ID = :new.C_Order_ID
    GROUP BY c_tax_get_root(ot.c_tax_id)
  ) ot;

  UPDATE C_Order
  SET TotalLines = ... TotalLines - v_oldLine + v_newLineNetAmt ...,
      GrandTotal  = ... TotalLines - v_oldLine + v_newLineNetAmt + v_taxAmt
  WHERE C_Order_ID = :new.C_Order_ID;
  ```
  `TotalLines` accumulates with full NUMERIC precision (never rounded), and tax is rounded **once per tax-rate group** (`C_OrderTax`, one row per VAT rate), not once per line.

With 2+ lines sharing a tax rate, N per-line roundings ≠ one rounding of the group sum. This is an independent, additive source of drift on top of Root cause #1, and explains why the discrepancy grows with multi-line documents (matches the ticket's reproduction: 3 lines + per-line discounts + 25% document discount).

**Same chain of components for every document type**: `OrderBottomPanel.jsx` (and its Invoice/Quotation equivalents) → `LinesBottomSection.jsx:151-161` → `DocumentTotalsPanel.jsx:59-60` → `computeDocumentTotals` in `documentTotals.js`. This is shared/generic, so the bug affects Sales/Purchase Order, Sales/Purchase Invoice, and Sales Quotation identically.

## Case 2 — split verdict: two different "print" surfaces, only one is safe

There are **two independent mechanisms** that both get called "print"/"preview", and only one of them is immune:

**2a. Official "Imprimir" (jsreport, server-rendered)** — `DocumentPrintDrawer.jsx` → `POST /api/reports/{reportId}/render` → `artifacts/print-sales-order/report-contract.json:13,15` reads directly from persisted columns:
```sql
SELECT ..., o.grandtotal, o.totallines, ... FROM c_order o ...
SELECT t.name AS tax_name, ot.taxbaseamt, ot.taxamt FROM c_ordertax ot ...
```
`artifacts/print-sales-order/template.hbs:141` renders `{{formatCurrency header.grandtotal}}` directly — no client-side recompute. Same pattern confirmed in `print-sales-invoice`, `print-purchase-order`, `print-sales-quotation`. **This one is safe: it matches the Grid.** `print-goods-shipment`/`print-return-*` have no monetary totals section at all (consistent with Goods Shipment/Receipt being quantity-only — see below). **`print-purchase-invoice` doesn't exist as an artifact, and `purchase-invoice/decisions.json:11` sets `"hidePrint": true`** — Purchase Invoice has no official print today (a separate gap, not part of this bug).

**2b. "Preview"/"Enviar documento" (client-rendered HTML → jsreport used only as an HTML→PDF converter) — AFFECTED ONLY FOR ORDERS, NOT INVOICES/QUOTATIONS (corrected after reading the actual builder functions, not just their imports).** `tools/app-shell/src/windows/custom/shared/documentPdf.js` exports **three separate, independent data-builder functions** — they do not all share the same totals logic:

| Hook | Builder | Totals source | Status |
|---|---|---|---|
| `useOrderPdf.js` (sales-order) | `buildOrderData('sales-order', ...)` | `computeDocumentTotals(linesRaw, ...)` (`documentPdf.js:296-303`) | **BUGGY** — recomputes client-side |
| `usePurchaseOrderPdf.js` (purchase-order) | `buildOrderData('purchase-order', ...)` | same as above (shared function) | **BUGGY** |
| `useInvoicePdf.js` (sales-invoice) | `buildInvoiceData(...)` | `header.grandTotalAmount`, `header.summedLineAmount ?? header.totalLines` directly (`useInvoicePdf.js:36-38`) | **Already correct** — reads persisted header, same pattern as Classic |
| `useQuotationPdf.js` (sales-quotation) | `buildQuotationData(...)` | `header.grandTotalAmount` directly (`useQuotationPdf.js:37-39`) | **Already correct** |

Only `buildOrderData()` — shared by Sales Order and Purchase Order — calls the buggy `computeDocumentTotals`:
```js
// documentPdf.js:295-303 (buildOrderData only)
const etgoTotalDiscount = Number(header.etgoTotalDiscount ?? 0);
const { grossSubtotal, netSubtotal, grandTotal, taxAmt, ... } =
  computeDocumentTotals(linesRaw, null, null, ORDER_LINE_CONFIG, etgoTotalDiscount);
```
`buildInvoiceData`/`buildQuotationData` never import or call `computeDocumentTotals` for the grand total at all — they were apparently already written (or fixed, e.g. under ETP-4372) to defer to the persisted header value, exactly the pattern this whole fix wants to generalize. The resulting HTML (from any of the three builders) is rendered client-side and sent to jsreport purely as an HTML→PDF converter (`pdfUtils.js` → `POST /jsreport/api/report` with `template.content = htmlContent`, `data: {}` — jsreport never touches the DB again).

- `InvoiceTopbarExtra.jsx:72` uses `useInvoicePdf` with an explicit in-code comment: *"ETP-4372 — source the same client-rendered PDF the InvoicePreview panel uses so the form-view topbar Send modal shows the document"* — i.e. **the same PDF is both the on-screen preview and the document actually emailed to the customer** (for Sales Invoice, this is already correct).
- `QuotationTopbarActions.jsx:56` — same pattern via `useQuotationPdf` (already correct).
- Purchase Order: `usePurchaseOrderPdf` → `buildOrderData` (buggy, per above).
- Purchase Invoice has neither the official print nor this client PDF path (`useInvoicePdf.js` is hardcoded to the Sales Invoice endpoint) — another pre-existing gap, unrelated to this bug's fix.

**Net effect on scope (narrower than first assumed):** only `buildOrderData()` in `documentPdf.js` needs fixing — and the fix is simply to copy the already-correct pattern `buildInvoiceData`/`buildQuotationData` use (`header.grandTotalAmount` / `header.summedLineAmount ?? header.totalLines`). No change needed to `buildInvoiceData`, `buildQuotationData`, or any jsreport artifact.

## Case 3 confirmed — completing the document never re-reads the persisted total

`artifacts/sales-order/custom/OrderConfirmModal.jsx:112,193,198` — after `DocAction=CO`, the only refresh mechanism is:
```js
window.location.reload();
```
A full page reload re-fetches `lines`/`data`, but `DocumentTotalsPanel`/`LinesBottomSection.jsx:150-161` **always** call `computeDocumentTotals(lines, ...)` — they never read `data.grandTotalAmount`/`grandtotal` from the already-persisted header, readOnly or not. The only behavior change post-completion is `isReadOnly = data?.documentStatus !== 'DR'` (`LinesBottomSection.jsx:64`), which just hides the discount-edit button — it does not switch the panel to the real backend total. Hence the number stays wrong even after reload/completion.

## Reference behavior — Etendo Classic is structurally immune

Investigated to determine what "fully aligned with Classic" should mean for the fix:

- `TotalLines`/`GrandTotal` on `C_Order`/`C_Invoice` (`src-db/database/model/tables/C_ORDER.xml:176-181`) are plain persisted `DECIMAL` columns, not client-computed values.
- Classic's SmartClient/GWT JS (`modules_core/org.openbravo.client.application/.../js/`) **never** references `grandtotal`/`totallines` in any tax/rounding arithmetic. The only genuinely generic "sum a column" JS helper (`recalculateGridSummary()` in `ob-grid.js`) just adds up already-persisted values — it's a generic grid feature, not fiscal logic.
- After saving a line, `ob-standard-view.js:2381-2447` (`refreshCurrentRecord`/`refreshParentRecord`) does a real server round-trip (`viewForm.refresh()` / `getDataSource().fetchData()`) to repaint the header — it does not compute anything client-side. The line-level Java callouts that run on blur (`SL_Order_Amt.java`, `SL_Order_Tax.java`, `SL_Invoice_Amt.java`, `SL_InvoiceTax_Amt.java`, in `src/org/openbravo/erpCommon/ad_callouts/`) only return line fields (`inplinenetamt`, `inptaxamt`, etc.) — never `inpgrandtotal`/`inptotallines`.
- **Consequence:** while a line is being edited but not yet saved, Classic's header total is simply stale (last persisted value) — it doesn't attempt a live estimate at all. Classic is immune to this class of bug by design: it never reimplements tax rounding client-side, and the trigger (same one investigated above) is the single source of truth it always defers to.

## Proposed fix — hybrid design (under discussion, not yet implemented)

Goal: keep Schema Forge's live-estimate UX while editing an unsaved line (a genuine UX improvement over Classic), but guarantee the number is **exactly** correct — i.e. identical to Grid/PDF — the instant anything is persisted. Discussed approach:

1. Treat the last backend-returned `grandTotalAmount`/`taxAmount`/`totalLines` as the **authoritative baseline**. The live JS estimate for a line being edited/pending should be computed as `baseline + delta_of_the_pending_line`, not by recomputing the whole document from the in-memory `lines` array. This confines any transient rounding error to the single line currently being typed, and that error disappears the moment it's saved.
2. On every event that persists something server-side (line save/autosave, header field change that triggers a recalculation, document completion), refetch/receive the authoritative total from the backend and overwrite the live estimate with it — mirroring Classic's `refreshParentRecord` pattern, but layered on top of a richer live-typing UX Classic doesn't have.
3. Sequence/cancel in-flight authoritative-total fetches (e.g. monotonic request counter or `AbortController`) so a slow response for an earlier edit can't clobber a newer estimate that already incorporates a later edit.
4. `DocumentTotalsPanel.jsx:59-60` / `LinesBottomSection.jsx:150-161` need to stop unconditionally calling `computeDocumentTotals(lines, ...)` and instead prefer the persisted header total whenever it's fresh/available (in particular whenever `isReadOnly === true`, i.e. post-completion — directly fixes Case 3).

### Resolved — global ("document total") discount mechanism and timing

Confirmed against `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/TotalDiscountService.java` and the `Abstract{Order,Invoice}HeaderHandler` classes. Same mechanism for Orders and Invoices (`recalculate(headerId, isInvoice)` is one method parameterized by `isInvoice`):

- **Materialization:** a synthetic negative line per **tax-rate group** (not a single global line, not a per-line proration) — a dummy product `ETGO_DTO` (`DISCOUNT_PRODUCT_ID`), one row per `c_tax_id` group, net amount = `-(group net subtotal × pct)`. This mirrors Classic's own `C_ORDER_POST1` pattern.
- **Timing — only at document completion (`documentAction=CO`).** `AbstractOrderHeaderHandler.applyTotalDiscountBeforeComplete()` / `syncTotalDiscountOnDocAction()` intercept the CO transition and call `recalculate()` then. Adding/editing/deleting a normal line does **not** trigger it (that pattern was deliberately removed — line handlers no longer reference `TotalDiscountService`).
- **The % itself persists immediately** — `DetailView.jsx:2625-2646` (`handleTotalDiscountChange`) fires a single `PATCH .../{entity}/{id}` with `{ etgoTotalDiscount: pct }` on the input's `onBlur` (no debounce needed since it's one shot, not per-keystroke).
- **A third, independent formula exists for the Draft window.** While the document is still Draft (`% > 0`, no discount line materialized yet), `applyTotalDiscountToRecord()` (Order) / its Invoice equivalent **compensates `grandTotalAmount` (and `outstandingAmount` for invoices) in the GET response only**, as `grandTotalAmount * (1 - pct/100)` — a single multiplication over the already-persisted (pre-discount) total, not a rounded per-tax-group sum. This is a **separate** approximation from both `documentTotals.js`'s live estimate and the post-Complete trigger's grouped-and-rounded value — so during Draft-with-discount there are potentially **three** different numbers in play (JS live estimate, this GET-time factor compensation, and what the line-materialization-at-Complete will eventually produce). The fix must account for this third source, not just the two originally identified.

### Resolved — header field changes do NOT recalculate existing lines (symmetric no-op, not a discrepancy)

Checked `C_ORDER_TRG2.xml`, the classic callouts (`SE_Order_BPartner.java`, `SL_Order_PriceList.java`) and their Go equivalent (`NeoCalloutService.java`, which invokes the same classic callout classes via `AD_Column.Callout`): **none of them touch `C_OrderLine`/`C_InvoiceLine` when Price List, Currency or Business Partner changes on the header.** The only related side effect is `syncLineCurrenciesOnCurrencyPatch()`, which updates each line's `C_Currency_ID` label on a currency PATCH but explicitly does *not* reconvert amounts (`"Line amounts are left unchanged; only C_CURRENCY_ID is updated on mismatched lines"`). The frontend doesn't attempt any local recompute of existing lines either. **Conclusion: this is a non-issue — both Classic and Go behave identically (do nothing to existing lines), so there's no divergence to fix here.**

### Resolved — Goods Shipment / Goods Receipt are out of scope

Confirmed via `artifacts/goods-receipt/FINDINGS.md:75,126` and `artifacts/goods-shipment/FINDINGS.md:90`: these are quantity-only documents with no `GrandTotal`/line pricing at all (pricing happens on the Purchase/Sales Invoice instead). `LinesBottomSection.jsx` even documents the exclusion pattern in-code (`showTotals={false}` for "inventory / shipment-style windows"). No `M_INOUT_TRG*` fiscal-total trigger exists to compare against. **Not affected by, and not in scope for, this bug.**

### Existing docs cross-checked against code

- `docs/plans/2026-05-03-discount-feature-status.md` — prior implementation-status doc for the total-discount feature; **still accurate**, matches the `TotalDiscountService` mechanism above in more historical detail. No corrections needed.
- `docs/feedback.md` — has 3 historical *per-line* discount bugs (double-apply on PATCH, `discount` vs `etgoDiscount` display mismatch, "100% discount" on empty field), all already fixed; unrelated to the *document-level* discount/rounding issue here, but explains why `documentPdf.js` already carries separate `discountBreakdown` handling.
- `docs/priceList-injection-origin.md` — unrelated (a product/tax selector memoization performance issue, ETP-3661). Not relevant to ETP-4777.
- `docs/decisions-reference.md` — nothing relevant beyond generic numeric-field `max` syntax. Not relevant.

Per `docs/self-documentation-policy.md`, this doc should be kept in sync as those questions get resolved, and the fix — once implemented — must go through the DEV → REVIEW → QA → DOCS pipeline defined in the root `CLAUDE.md`, including updating `documentTotals.test.js`/`.vitest.js` and `DocumentTotalsPanel.vitest.jsx` (which currently pin the ETP-4015 formula and will need new fixtures compared against real `grandtotal` values from the DB).

### Resolved — ETP-4714 ("hide Print button in Draft") is orthogonal, does NOT reduce this fix's scope

PR #1071 (`feature/ETP-4714`, not yet merged to `epic/ETP-3504`) adds a `hidePrintWhen` declarative condition to `DetailView.jsx`, gating only the generic **"Imprimir"** icon button (`{!documentPreview && !hidePrint && !isNew && recordId && !evaluateFieldCondition(hidePrintWhen, data) && (<button onClick={() => setShowPrint(true)} ...>`, `DetailView.jsx` ~line 3000) — i.e. the button that opens `DocumentPrintDrawer.jsx` against the official jsreport artifacts (`print-sales-order`, etc.), already confirmed unaffected by this bug. The diff touches `DetailView.jsx`, `evaluateFieldCondition.js` (new), and `decisions.json`/generated `HeaderPage.jsx` for 11 windows — **no file overlaps with the fix for ETP-4777** (`documentTotals.js`, `useLineGrossAmount.js`, `DocumentTotalsPanel.jsx`, `LinesBottomSection.jsx`, `documentPdf.js`, `OrderCreateInvoice.jsx`/`PurchaseOrderActions.jsx`/`InvoiceTopbarExtra.jsx`/`QuotationTopbarActions.jsx`, or the Java `TotalDiscountService`/header handlers). **Conclusion: ETP-4714 and ETP-4777 can be worked and merged in either order — no dependency, no scope reduction.**

### Important independent finding — the buggy "Send/Download" button is already hidden in Draft today

While checking ETP-4714's boundary, confirmed (unrelated to that PR — this is pre-existing behavior on `epic/ETP-3504`) that the `SendDocumentButton` (the `documentPdf.js` surface — Case 2) is already gated by document status in all four windows that have it:

| Window | Custom topbar component | Gate |
|---|---|---|
| sales-order | `OrderCreateInvoice.jsx:213-215` | `isCompleted && <SendDocumentButton .../>`, `isCompleted = status === 'CO'` |
| purchase-order | `PurchaseOrderActions.jsx:198-200` | same pattern, `isCompleted = status === 'CO'` |
| sales-invoice | `InvoiceTopbarExtra.jsx:355` | `isCompleted && <SendDocumentButton .../>`, `isCompleted = data?.documentStatus === 'CO'` |
| sales-quotation | `QuotationTopbarActions.jsx:89` | `status !== 'DR' && <SendDocumentButton .../>` (broader — visible from "Bajo Evaluación" onward, per ETP-4717) |

**This simplifies the fix for `documentPdf.js` considerably:** since this button is never reachable while the document is still Draft, `documentPdf.js` never needs to render a "live/pending estimate" — by the time a user can open it, the document is already Confirmado/Bajo Evaluación/etc. and the backend already has the authoritative persisted total (whatever the discount-completion state is at that point). The fix there can simply be "always use the backend-persisted total, never call `computeDocumentTotals` for the grand total" — no hybrid live-estimate logic needed on this surface, unlike the Form panel which is very much visible (and expected to update live) during Draft editing.

### Resolved — Invoice discount mechanism re-verified, byte-for-byte identical to Order (no hidden divergence)

Read `AbstractInvoiceHeaderHandler.java` in full (not just excerpts) against `AbstractOrderHeaderHandler.java`:
- `applyTotalDiscountBeforeComplete`/`syncTotalDiscountOnDocAction` are **static methods shared** on `AbstractOrderHeaderHandler`, parameterized by `isInvoice` — both `SalesInvoiceHeaderHandler`/`PurchaseInvoiceHeaderHandler` call the exact same methods Order calls, just with `isInvoice=true`.
- The only difference is that `AbstractInvoiceHeaderHandler.applyTotalDiscountToRecord()` also adjusts `outstandingAmount` by the same factor — explicitly documented in the Order-side code as intentional (*"orders/quotations do not expose that field"*), not a third arithmetic path.
- **Invoice-from-Order does not double the discount.** `InvoiceFromOrderSupport.applyOrderDiscountToInvoice()` copies the order's `etgoTotalDiscount` % and materializes the `ETGO_DTO` discount line(s) **immediately at invoice creation** (not deferred to Complete), specifically so totals are right "regardless of whether the invoice is later completed via NEO Headless or Classic". Because the line already exists, `hasDiscountLine()` short-circuits the Draft-window GET-time compensation, and `TotalDiscountService.recalculate()` always deletes-then-recreates the line (idempotent) — no double-counting on a later Complete.
- Create-and-complete-in-one-POST is not a distinct code path for either Order or Invoice (`isCrudComplete()` only fires on PATCH/PUT) — same non-issue (or same gap, if ever revisited) on both sides, no divergence between them.

### Resolved — Goods Shipment/Receipt/Returns re-confirmed 100% out of scope (explicit grep)

Confirmed for `goods-receipt`, `goods-shipment`, `return-material-receipt`, `return-to-vendor-shipment`: all use `showTotals={false}` on their bottom panel, none declare `etgoTotalDiscount` in `decisions.json`, none import `documentPdf.js`/`computeDocumentTotals`. Three of them (`goods-shipment`, `return-material-receipt`, `return-to-vendor-shipment`) do generate their own PDF (`useShipmentPdf.js`, `useReturnReceiptPdf.js`, `useReturnToVendorPdf.js`) but these are quantity-only delivery notes — grepped for `price`/`amount`/`grandTotal` with zero matches in each. They share only the generic HTML→PDF converter (`pdfUtils.js`) with the affected windows, not the buggy total-computation module. `goods-receipt` has no PDF at all today.

## Files identified as relevant to the fix

- `tools/app-shell/src/lib/documentTotals.js` — core rounding/total computation (Root cause #1)
- `tools/app-shell/src/lib/useLineGrossAmount.js` — per-line rounding (Root cause #2)
- `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx`
- `tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx`
- `artifacts/sales-order/custom/OrderConfirmModal.jsx` (and Purchase Order / Invoice equivalents) — Case 3 refresh trigger
- `tools/app-shell/src/windows/custom/shared/documentPdf.js` — specifically its `buildOrderData()` function only (shared by `useOrderPdf.js`/Sales Order and `usePurchaseOrderPdf.js`/Purchase Order) — calls `computeDocumentTotals` and needs the authoritative-total fix. `buildInvoiceData()`/`buildQuotationData()` in the same file are already correct — do not touch.
- `modules/com.etendoerp.go/.../TotalDiscountService.java` / `Abstract{Order,Invoice}HeaderHandler.java` — the Draft-window GET-time discount compensation (`grandTotalAmount * (1 - pct/100)`) is a third divergent formula that needs to be reconciled with whatever the fix settles on for the live-estimate baseline while a document discount is pending pre-Complete
- Tests to update: `tools/app-shell/src/lib/__tests__/documentTotals.test.js` / `.vitest.js`, `.../__tests__/DocumentTotalsPanel.vitest.jsx`, plus new coverage for `documentPdf.js` totals and the discount-pending-Draft window

## Not affected — no changes expected here

- Backend triggers (`C_ORDERLINE_TRG2.xml`, `C_INVOICELINE_TRG2.xml`, `C_ORDERTAX_ROUNDING.xml`) — already correct and are the reference source of truth.
- Official jsreport print artifacts (`artifacts/print-sales-order/`, `print-purchase-order/`, `print-sales-invoice/`, `print-sales-quotation/`) — already read persisted values directly. (Note: this is the *official* "Imprimir" action only — the separate client-rendered "Preview/Send" PDF is affected, see Case 2 above.)
- Etendo Classic UI — structurally unaffected by design (never recomputes totals client-side).
- Goods Shipment / Goods Receipt — no monetary totals exist on these documents; out of scope.
- Header field changes (Price List/Currency/Business Partner) recalculating existing lines — confirmed a non-issue; neither Classic nor Go attempt this, so there's no divergence.
- Purchase Invoice print/preview — has neither the official print nor the client PDF path today. This is a **pre-existing feature gap, not part of this bug** — flagged for awareness, not for this fix.
