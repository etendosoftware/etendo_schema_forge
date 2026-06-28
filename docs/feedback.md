# Feedback — Known Bug Patterns and Root-Cause Lessons

This file records bugs that have already been diagnosed and fixed. The goal is to prevent re-introducing the same mistake and to give future developers a quick reference for recognising the symptom before investing time in diagnosis.

Entries are listed chronologically (oldest first). Each entry names the affected component, describes the symptom, explains the root cause, and states the fix.

---

## Double-Discount on Line PATCH

**Component:** `InlineLinesPanel.jsx` — inline row edit (PATCH flow)

**Symptom:** Saving an edited line applied the discount twice, resulting in a price lower than expected.

**Root cause:** The PATCH body was built by merging the original row values with the edited cell changes. Because the discount field's value went through `clampToMax` twice — once when the user committed the cell and once when the save handler assembled the payload — the discount ended up applied twice to the computed price on the server.

**Fix:** `clampToMax` is called exactly once per save, at payload assembly time. Intermediate cell commit handlers no longer re-clamp already-clamped values.

**Lesson:** When computing a derived value (price from discount), clamp/transform inputs exactly once, at the point where the payload is serialised. Never clamp in both the cell commit handler and the payload assembly step.

---

## Callout Price Suppression for Invoices

**Component:** `DataTable.jsx` — inline add row, callout integration

**Symptom:** For invoice lines, entering a product caused the unit price field to be cleared to empty rather than populated by the callout response.

**Root cause:** The callout response included a `unitPrice` key, but the invoice contract used a different field key (`priceActual`). The callout integration in `handleAddChild` did a strict key match; when the key was not found in the field map the value was silently dropped. Because `unitPrice` was not in the add-line field map for invoices, the callout set the display value to nothing, leaving the field empty.

**Fix:** Field key alignment — the callout response keys and the contract field keys must match exactly. The contract for invoice lines was updated so that the field key exposed to the inline add row matched the key the callout returns.

**Lesson:** When wiring a callout that populates inline-add-row fields, verify that `callout.response[key]` exactly equals `field.key` in the contract. A key mismatch is silent at runtime — the field just shows empty.

---

## Add-Line Row Field Key Alignment

**Component:** `DataTable.jsx` — `addLineFields` contract section

**Symptom:** Fields populated by callouts during inline-add (e.g., tax, description) appeared empty after the callout response was applied, even though the callout returned the expected data.

**Root cause:** `addLineFields.entry[n].key` in the contract did not match the field key in `addLineFields.fields[n]`. The add-row state is keyed by `field.key`; when entry key and field key diverge, the callout writes to one slot but the input reads from a different slot.

**Fix:** `generate-contract.js` was updated to guarantee that `entry[n].key === fields[n].key` for every add-line field. A pipeline validator rule (F-series) was added to catch mismatches before they reach the UI.

**Lesson:** `addLineFields.entry` and `addLineFields.fields` must be parallel arrays — same length, same order, matching keys. If they diverge, callout data is written to a ghost slot that no input reads.

---

## ETP-4007: Discount Display and PDF Breakdown

**Component:** `DataTable.jsx`, `InlineLinesPanel.jsx`, PDF template

**Symptom (multiple):**
1. The discount column showed raw backend data instead of the formatted percentage.
2. The displayed list price was taken from `unitPrice` instead of `listPrice`, making the "before discount" price wrong.
3. The displayed gross amount was taken from `grossAmount` instead of `lineNetAmount`.
4. The tax amount formula produced an incorrect total.
5. The PDF export was missing the discount breakdown rows entirely.

**Root causes:**
- The backend field for the formatted discount percentage is `etgoDiscount`, not `discount`. The UI was binding to `discount` (the raw BigDecimal stored in the DB), which is a ratio (0–1) rather than a display percentage.
- `listPrice` (the price before discount) and `unitPrice` (the price after discount) were swapped in the display binding.
- `grossAmount` (gross, including tax) was used where `lineNetAmount` (net, tax-excluded) was required.
- The tax amount formula subtracted instead of added the tax component.
- The PDF template iterated only over `lines[].fields` and did not include the discount row because the discount breakdown was in a separate `discountLines` array.

**Fix:** Field bindings corrected to use `etgoDiscount`, `listPrice`, `lineNetAmount`, and the correct tax formula. The PDF template was updated to iterate `discountLines` and emit one breakdown row per discount entry.

**Lesson:** When binding a "formatted for display" value, use the field the backend provides for display (`etgoDiscount`) rather than the raw storage field (`discount`). Always check whether `listPrice` vs `unitPrice` and `grossAmount` vs `lineNetAmount` match the intended semantics before binding.

---

## ETP-4277: Empty Numeric Field Saved as Backend Default (100% Discount Bug)

**Component:** `DataTable.jsx` (`renderInputCell`, `coerceFieldValues`), `InlineLinesPanel.jsx` (`clampToMax`)

**Affected windows:** sales-order, sales-invoice, purchase-order, purchase-invoice, sales-quotation (all windows using the shared inline-line components)

**Symptom:** When the user cleared the discount % field to empty on a document line and saved, the backend stored `discount = 100` (i.e., 100% discount) instead of `0`. The field appeared visually empty, and the saved price was `0`.

**Root cause:** `handleAddChild` in `useEntity.js` builds the POST body by iterating over field keys and skipping any value that is an empty string (`''`). When the discount field was cleared to `''`, it was silently omitted from the POST body. The backend received no value for `discount` and applied its own implicit default, which happened to be `100` for that column's AD definition.

The same omission applied to the PATCH flow via `InlineLinesPanel`: `clampToMax` previously returned the raw value unchanged for empty strings, so `''` was passed to the PATCH body and the backend again applied its default.

**Fix (three files):**

1. **`tools/app-shell/src/components/contract-ui/DataTable.jsx`**

   - `renderInputCell.onBlur`: when a numeric input loses focus with an empty value, the handler now substitutes `field.defaultValue` (falling back to `field.min` if `defaultValue` is absent) before the value reaches state. This ensures the displayed value is correct before the user clicks Save.
   - `coerceFieldValues`: called immediately before `handleAddChild` assembles the POST body. For every numeric field whose current value is `''`, it substitutes `field.defaultValue` (or `field.min`). This ensures `handleAddChild` always sees a non-empty numeric string and never skips the field.

2. **`tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx`**

   - `clampToMax`: guarded at the top by a `NUMERIC_TYPES` check so it only acts on fields of type `number`, `amount`, `integer`, `percent`, `decimal`, `price`, or `quantity`. When the incoming value is empty (`''` or `null`), it now substitutes `col.defaultValue` (falling back to `col.min`) so the PATCH body never sends an empty string for a BigDecimal column.

**Tests updated:**
- `DataTable.numericClamp.vitest.jsx` — "empty-field normalization" test group
- `DataTable.inlineAdd.vitest.jsx` — confirms `payload.discount === 0` when the field is cleared
- `InlineLinesPanel.helpers.test.js` — `clampToMax` source-shape tests for empty values

**Lesson:** `handleAddChild` (and any PATCH body builder) silently drops empty strings. Any numeric field that the user can clear to empty MUST be normalised to its `defaultValue` (or `min`) before the payload is assembled — both on blur (for display correctness) and at payload-assembly time (as a final safety net). The canonical substitution order is: `defaultValue` first, then `min`, then leave as-is (non-numeric types are unaffected). Never rely on the backend to apply a sensible default for an omitted numeric field — the backend default may not be zero.

### ETP-4277 Follow-on: Stale grossAmount When Enter Is Pressed Without Blur

**Component:** `tools/app-shell/src/components/contract-ui/DetailView.jsx` — primary lines DataTable `onAdd` handler

**Symptom:** When an invoice line was added with discount=100 (grossAmount=0), and the user then cleared the discount field to `''` and pressed Enter without blurring first, the POST body still carried `grossAmount: 0`. The line was saved with the stale gross amount.

**Root cause:** The `onBlur` normalisation path (which substitutes `defaultValue` and recalculates `grossAmount`) was never triggered because the user pressed Enter directly. `coerceFieldValues` normalised the discount to `0`, but `grossAmount`/`lineGrossAmount` in the POST body was still the value computed at the previous interaction (0), not the value consistent with the freshly normalised discount.

**Why it matters for invoices:** `C_InvoiceLine` trusts the `grossAmount` value sent by the frontend and stores it directly. `C_OrderLine` recalculates gross amount server-side and is therefore forgiving of a stale value. Any invoice POST that carries an inconsistent `grossAmount` produces a wrong line total with no server-side correction.

**Fix:** In the `onAdd` handler of the primary lines DataTable in `DetailView.jsx`, after `prepareLineForPost(lineData)` and after `coerceFieldValues` normalises the discount, `computeLineGrossAmount` is called with the normalised discount value. This ensures `grossAmount`/`lineGrossAmount` in the POST body always reflects the actual discount being sent, regardless of whether the user blurred the field before pressing Enter.

**Invariant to preserve:** For invoice windows, `grossAmount` in the POST body must equal the value that results from applying the sent `discount` to the sent `unitPrice`. If these three values are not consistent, `C_InvoiceLine` stores a wrong total. Always recompute `grossAmount` from the final normalised field values immediately before the POST is issued.

---

## Rule of Thumb for Numeric Field Normalisation

Whenever you add a new numeric field to an inline-add or inline-edit row, verify these four things:

1. **`field.defaultValue` is set in `decisions.json`** (or is `0` explicitly) — so the substitution path has a value to fall back to. For discount-style fields `"defaultValue": 0` is correct; for quantity-style fields `"defaultValue": 1` is typical.
2. **`field.type` is one of the `NUMERIC_TYPES` set** (`number`, `amount`, `integer`, `percent`, `decimal`, `price`, `quantity`) — so `clampToMax` and `coerceFieldValues` recognise it and apply the substitution.
3. **`onBlur` in `renderInputCell` sees the correct `field.defaultValue`** — trace through `buildEmpty` to confirm the field definition reaches the input cell.
4. **The PATCH/POST payload is inspected in tests** — assert the specific field is present and equals the expected numeric value (not `undefined`, not `''`) when the user clears the input.

---

## [2026-05-26] ETP-4027 — three bugs fixed during dual-currency display session

### Bug 1 — principal section currency field not locked (DetailView.jsx)

`displayLogicWithCurrencyLock` was only applied to the `collapsed` form section. The `principal` section — where `currency` is actually rendered — continued to use the raw `displayLogic` object. The result: on orders that already had lines, the `currency` field appeared editable. Any save attempt with a changed currency would fail at the DB trigger `C_ORDER_CHK_RESTRINCTIONS_TRG` (error `@20502@`) with no recovery path.

**Fix:** use `displayLogicWithCurrencyLock?.readOnly` in the principal section render path, not the raw `displayLogic.readOnly`.

**File:** `tools/app-shell/src/components/contract-ui/DetailView.jsx`

---

### Bug 2 — convertAmount formula wrong: amount / rate instead of amount × rate (useDocumentCurrency.js)

`useDocumentCurrency.convertAmount` was computing `amount / exchangeRate`. Etendo's `C_Conversion_Rate.multiplyrate` is defined as `to_amount = from_amount × multiplyrate`, so dividing produced an inverted result (e.g. a USD 304.92 order would display as 262.69 EUR instead of the correct 354.91 EUR at a 1.1647 rate). The org-currency total in the preview card was systematically wrong.

**Fix:** changed to `amount * exchangeRate`. The inverse-fallback in `NeoExchangeRateService` already returns `1/inverseRate`, so the same multiplication formula gives the correct result regardless of which direction was stored in the DB.

**File:** `tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js`

---

### Bug 3 — validate-exchange-rate returned hasRate:false for GOClient (inverse direction missing)

GOClient had only EUR→USD = 1.16 configured in `C_Conversion_Rate`; the USD→EUR row was absent. `NeoExchangeRateService` only queried the direct `FROM→TO` direction, so requests with `fromCurrency=USD&toCurrency=EUR` returned `{ hasRate: false }`. Preview cards for USD orders showed no org-currency equivalent amount.

**Fix:** added an inverse-direction fallback in `NeoExchangeRateService.handleValidateExchangeRate`: if the direct query returns null, retry with swapped currencies and return `1/rate`. This mirrors standard Etendo behaviour — configuring one direction implicitly covers the reverse.

**File:** `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoExchangeRateService.java`

---

## [2026-05-20] goods-shipment.md — doc debt from PR #611 (ETP-4031)

`docs/generated-custom-windows/goods-shipment.md` was not updated when Irina's PR #611
merged significant new features. The following need to be documented:

- Preview panel (`GoodsShipmentPreview.jsx`) with PDF delivery note generation (`useShipmentPdf.js`)
- Email send button in the preview (`SendDocumentModal`)
- Billing badge in topbar (`GoodsShipmentBillingBadge.jsx`) — 3-state: Pending / Partially Invoiced / Invoiced
- Import from Sales Order modal (`ImportFromSalesOrderModal.jsx`)
- Import from Sales Invoice modal (`ImportFromSalesInvoiceModal.jsx`)
- `GoodsShipmentConfirmModal.jsx` — confirm shipment + optional draft Sales Invoice creation
- `invoiceStatus` field changed from `discarded` → `readOnly` so NEO serves the computed value

Owner: whoever next touches the goods-shipment window.
