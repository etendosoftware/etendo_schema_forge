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

---

## [2026-07-03] ETP-4438 - Selector Loading Loop and Error Fallback Crash

**Components:**
- `tools/app-shell/src/components/contract-ui/SelectorInput.jsx`
- `tools/app-shell/src/hooks/useEntity.js`

**Symptoms:**
1. Selector dropdowns could remain stuck on `Cargando...` while repeatedly calling the same selector endpoint after parent rerenders.
2. Failed API responses with non-JSON bodies, such as an HTML 404 page, could crash error extraction with `translate is not defined` instead of surfacing a controlled error message.

**Root causes:**
- `DetailView` and `EntityForm` can recreate `selectorContext` as a new object on every render even when its values are unchanged. `SelectorInput.fetchPage` depended on that object by reference, so the callback identity changed, the `SelectContent` ref callback was detached and reattached, and its fetch/listener body ran again.
- `extractErrorMessage()` declared `translate()` inside the `try` block that also awaited `res.json()`. If JSON parsing failed, the fallback outside that block referenced `translate` out of scope.

**Fix:**
- `SelectorInput` now derives a stable `contextKey` from `selectorContext` content and uses it as the callback/effect dependency, so equivalent selector context values do not re-identify the fetch/ref callback.
- `extractErrorMessage()` now declares `translate()` before the JSON parse attempt, keeping the generic `Error <status>` fallback available for non-JSON responses.

**Tests updated:**
- `SelectorInput.vitest.jsx` verifies equivalent `selectorContext` values with new object references do not reattach the selector scroll ref on parent rerenders.
- `useEntity.helpers.vitest.jsx` verifies non-JSON responses and unrecognized JSON payloads fall back to `Error <status>`.

**Lesson:** For selector context objects created by parent renders, compare by content at callback boundaries. For error handling, keep final fallback helpers outside parsing blocks that can throw.

---

## [2026-07-13] ETP-4401 — SII/TBAI/Verifactu Onboarding Save Broken by Extractor PK-Naming Convention Fix

**Component:** `tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js` (`getFiscalRecordId`)

**Affected windows:** `sii-config`, `tbai-config`, `verifactu-config` (backing artifacts for the custom `fiscal-config` window)

**Symptom:** Saving the SII/TBAI/Verifactu onboarding wizard failed with a "record id not found" error. The record was created successfully on the backend, but the frontend could not recover its id afterward, so any subsequent update (e.g., certificate association, follow-up PATCH) had no id to target.

**Root cause:** `getFiscalRecordId()` used to `switch` on the fiscal system name and read a hardcoded, ad-hoc PK field name per window: `tbaiConfigID`, `configuracinSII`, `verifactuConfig`. Those names existed only because the old extractor derived the PK's `java_qualifier` from a name heuristic (`columnname === tableName + '_ID'`), which never matched these 3 windows' actual PK columns due to case mismatches (e.g. table `TBAI_Config` vs. column `Tbai_Config_ID`). The heuristic's failure silently fell through to camelCasing the raw column name instead, and those camelCase names got baked into `decisions.json` and hardcoded into `fiscalConfig.utils.js`.

`schema_forge_core` commit `5d363ad2f` ("Fix extractor — use IsKey for PK and tab table for tableName") fixed the underlying bug: PK detection now uses the `IsKey='Y'` column flag instead of the name heuristic. This is a legitimate, intentional, platform-wide convention change — after the fix, NEO Headless correctly and uniformly serializes every window's PK as `id` (`ETGO_SF_FIELD.java_qualifier = 'id'`), which is also required for other windows (e.g. `open-close-period-control`). It is not a regression in the extractor. But it meant the 3 fiscal windows' API responses stopped including `tbaiConfigID`/`configuracinSII`/`verifactuConfig` entirely — `getFiscalRecordId()`'s per-system switch had nothing left to read, so it returned `undefined`/`null` and the id was silently lost after every record creation.

**Fix:** `getFiscalRecordId(record, _system)` now returns `record?.id ?? null` unconditionally for all systems — the `system` parameter is kept only for call-site compatibility. Also removed the now-dead `tbaiConfigID`/`configuracinSII`/`verifactuConfig` entries from `artifacts/{tbai-config,sii-config,verifactu-config}/decisions.json` (confirmed absent from each window's `schema-raw.json` — genuinely dead, not a re-derivable field), and fixed stale mocks in `FiscalConfigDebugPanel.jsx` that still referenced the old field names. Regression tests added (unit + Playwright e2e) covering record-id recovery for all three systems.

**Lesson:** Any frontend code — custom components especially — that hardcodes a specific PK field name instead of reading `record.id` is fragile to this class of extractor/pipeline convention fix. The platform's direction is that PK fields are always serialized as `id`; code that special-cases a different name per window/system is relying on an accident of a buggy heuristic, not a contract. **Recommendation (not done as part of this fix, scope was kept to the 3 fiscal windows):** a quick grep sweep across `tools/app-shell/src/windows/custom/**` for other hardcoded non-`id` PK-like field names (e.g. `*ConfigID`, `*RecordId`, per-window id variables) would catch other windows silently exposed to the same class of bug before they surface as production incidents.

**Reference:** Fix lives in `getFiscalRecordId()`, `tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js`; branch `feature/ETP-4401`.

---

## Callout-Filled Warehouse Shows Raw ID on Purchase Order (but not Sales Order)

**Component:** `artifacts/purchase-order/decisions.json` — header `warehouse` field config (NOT a shared-component bug)

**Symptom:** On a new Purchase Order, selecting the Contact (vendor) fires a callout that auto-fills Warehouse. The field showed the raw ID (`1FF18B06...`) instead of the name (`Almacen GO`). Opening the dropdown loaded the options and fixed the display; picking a value manually always worked. Sales Order has the identical warehouse selector and did NOT have the bug.

**Root cause (comparative):** The two windows rendered warehouse with different widgets. `sales-order/decisions.json` declares `warehouse: { inputMode: "search" }` -> generated field `type: "search"` -> rendered by `SearchInput` (`EntityForm.jsx`), which resolves the label on-demand via the selector `?id=` endpoint when a value arrives without its `$_identifier` (exactly the callout case). `purchase-order/decisions.json` had no `inputMode`, so it defaulted to `type: "selector"` -> rendered by `SelectorInput` (Radix dropdown), which defers its option fetch until the user opens the dropdown, so the callout-set ID had no resolved label and showed raw. Because the working window (sales-order) never used `SelectorInput` at all, the cause was the per-window field config, not the shared component.

**Fix:** Added `"inputMode": "search"` to the `warehouse` header field in `artifacts/purchase-order/decisions.json` (aligning it with sales-order) and regenerated. Warehouse now renders as `SearchInput` and shows the name of the callout-filled value immediately.

**Rejected approach:** An earlier attempt added an on-demand `?id=` fetch to the shared `SelectorInput` component. It was reverted: the working window did not exercise that code path, so the real difference was the field config, and touching a component shared by many windows was unwarranted for a per-window config gap.

**Tests updated:**
- `SearchInput-chip.vitest.jsx` verifies a `search` FK field whose value has no `$_identifier` resolves the label on-demand via the selector endpoint and shows the record name.

**Lesson:** When one window works and a sibling does not for the same field, compare the per-window `decisions.json` (and the generated field `type`/`inputMode`) BEFORE touching shared components. FK fields that get auto-filled by a callout should use `inputMode: "search"` so the label resolves on-demand, or the value must arrive with its `$_identifier`.

---

## ETP-4543: Non-Grid Line Fields Invisible Under inlineEditable Line Layout

**Components:**
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx`
- `tools/app-shell/src/components/contract-ui/DetailView.jsx`
- `tools/app-shell/src/windows/custom/shared/InvoiceLinesTable.jsx`

**Affected windows:** sales-invoice, purchase-invoice, goods-shipment, goods-receipt (all four `inlineEditable`-layout windows that actually carry `lines.project`/`lines.costcenter` as real fields; `physical-inventory` and `goods-movements` use the same layout but their underlying AD tables — `M_InventoryLine`/`M_MovementLine` — have no `project`/`costCenter` column at all, so they were never affected).

**Symptom:** A line field with `form: true` but not promoted to an inline grid column (`grid: false`) had no rendering surface at all when the entity's `linesLayout` was `"inlineEditable"`. `DetailView.jsx` only mounts the secondary detail form (`DetailForm`/`LinesForm.jsx`) when `linesLayout !== 'inlineEditable'`; for inline-editable windows that mount is unconditionally skipped, and `InlineLinesPanel` only ever rendered fields already promoted to grid columns. Discovered while implementing ETP-4529 for the config-gated `project`/`costcenter` accounting-dimension fields: even after the ETP-4529 evaluator fix correctly resolved their visibility, the fields still never appeared anywhere in the UI.

**Root cause:** Architectural gap, not a one-line bug — `InlineLinesPanel` had no concept of an "off-grid" field, and `DetailView`'s primary `<DetailTable>` call hardcoded `hiddenColumns={[]}`, discarding the live visibility map (`lineDisplayLogic.visibility`) that had already been computed and was correctly threaded into the secondary `DetailForm`'s `displayLogic` prop.

**Fix (scoped to making the two dimension fields visible-when-enabled, not the larger "expandable per-row detail" feature originally floated):**
1. `InlineLinesPanel.jsx` gained a `hiddenColumns = []` prop, filtering the same way `DataTable.jsx` already did: `columns.filter(c => !c.hidden && !hiddenColumns.includes(c.key))`.
2. `DetailView.jsx`'s primary `<DetailTable>` call now passes a memoized `lineHiddenColumns` — every key from `lineDisplayLogic.visibility` whose value is exactly `false` — instead of the hardcoded `[]`.
3. For `sales-invoice`/`purchase-invoice`, `project`/`costcenter` were added as hardcoded columns to `InvoiceLinesTable.jsx` (this component ignores `decisions.json`'s `grid` flag entirely — its column list ships independent of the contract). For `goods-shipment`/`goods-receipt`, whose line tables are pipeline-generated, `lines.project.grid`/`lines.costcenter.grid` were flipped `false → true` in `decisions.json` and the windows were regenerated (`make regen`).

**Rejected approach:** An expandable per-row detail surface inside `InlineLinesPanel` (mirroring what `DetailForm` does for non-inline layouts) — a much larger feature. Deferred; the grid-column + dynamic-`hiddenColumns` approach fully covers the two dimension fields without it.

**Blast radius note:** `hiddenColumns` is generic, not scoped to these two fields or five windows — any window whose lines entity has a field key that `evaluate-display` resolves to `visibility: false` will now have that column hidden dynamically, wherever `DetailView`'s primary lines grid is used. `InlineLinesPanel`'s new prop defaults to `[]`, so every caller that does not pass it (the vast majority of generated `<Window>LineTable.jsx` files) behaves identically to before.

**Lesson:** A hardcoded `hiddenColumns={[]}` (or any prop wired to a static empty value) silently discards a hook result computed one line above it — check for this pattern whenever a "correctly computed but seemingly ignored" value is reported. When a shared component's column list is fully hardcoded in a hand-written custom component (`InvoiceLinesTable.jsx`), decisions.json's `grid` flag has no effect on it at all — verify which mechanism actually drives a given window's columns before assuming a `decisions.json` change is required.

**Superseded by ETP-4529 (plain-column approach replaced by the expand-row "Dimensiones contables" UX):** the always-rendered `project`/`costcenter` grid columns above were a stopgap. After reviewing the live app, the user asked for the same expand-row pattern Amortización already had instead of permanently-visible columns — a plain column reads as a field the client always has, even when they have no accounting-dimension config at all. This is a UX correction, not a revert of the underlying fix: the `hiddenColumns` plumbing (`InlineLinesPanel.jsx`'s `hiddenColumns` prop, `DetailView.jsx`'s `lineHiddenColumns` memo) stays and is now also the exact mechanism that computes `dimensionFields` for `InvoiceLinesTable.jsx`'s new `dimensionsPanel` column (see `docs/ui-customization.md`). What changed:
- `InvoiceLinesTable.jsx` (sales-invoice/purchase-invoice): the two plain `project`/`costcenter` columns were removed; one `type: 'dimensionsPanel'` column replaces them, driven by `dimensionFields` filtered from the same `hiddenColumns` this fix introduced.
- `goods-shipment`/`goods-receipt`: `lines.project.grid`/`lines.costcenter.grid` were flipped back `true → false` in `decisions.json` (undoing this fix's step 3) and regenerated. Their pipeline-generated `<Window>LineTable.jsx` has **no equivalent override mechanism yet** for the `dimensionsPanel` column type — the only existing lines-tab override point, `window.customLinesComponent`/`CustomLines`, is shaped for a fully self-fetching component (matching `AmortizationLinesTable.jsx`'s own `recordId`/`data`=header-record/`onRefresh`/`onSave` contract), not a drop-in replacement for the `columns`-array + pre-fetched-`data`-array + `onUpdateRow`/`onDeleteRow` contract the generated `<Window>LineTable.jsx` (and `InvoiceLinesTable.jsx`) use. These two windows are back to their pre-ETP-4543 state (no project/costcenter surface on the lines grid) pending a coordinator decision on how to add that override point — see `docs/generated-custom-windows/goods-shipment.md` and `goods-receipt.md`.
- The "Rejected approach" note above (an expandable per-row detail surface inside `InlineLinesPanel`) is what ETP-4529 ultimately built as the generic, opt-in `dimensionsPanel` column type — it was deferred at ETP-4543 time as "a much larger feature," not permanently rejected.
- Also discovered while wiring this in: for sales-invoice/purchase-invoice, `InvoiceLinesTable.jsx` (and its per-window wrapper components `SalesInvoiceLinesTable.jsx`/`InvoiceLineTableCustom.jsx`) are **not currently reachable from the running app** — neither window's `decisions.json` sets `window.customLinesComponent`, so `HeaderPage.jsx` renders the plain generated `LinesTable.jsx` (a separate file with its own hardcoded columns, no project/costcenter, no dimensionsPanel) via `DetailTable={LinesTable}`, never `InvoiceLinesTable.jsx` via `CustomLines`. This predates ETP-4529 (the wrapper files exist since ETP-3908/ETP-3569) and is unrelated to this fix's correctness — flagged for the coordinator since it means neither ETP-4543's original columns nor ETP-4529's `dimensionsPanel` column render live for these two windows today without further wiring work (and, per the point above, `customLinesComponent`'s contract doesn't fit `InvoiceLinesTable.jsx` as-is either).

**Resolved (ETP-4529, generator support in `schema_forge_core`):** the "coordinator decision" and the "no equivalent override mechanism" gap called out above are both closed — not by adding a lines-tab override point, but by extending the generator itself. `generate-frontend.js`'s `generateTableComponent` now emits the synthetic `dimensionsPanel` column directly from a new `decisions.json` field flag (`dimensionsPanel: true`, read independently of `grid` — see `docs/decisions-reference.md`), for ANY pipeline-generated lines table. This sidesteps the `InvoiceLinesTable.jsx` reachability gap entirely for sales-invoice/purchase-invoice (that component stays dead code; the fix lives in the ACTUALLY-rendered generated `LinesTable.jsx`) and gives goods-shipment/goods-receipt the column for the first time. All four windows now set `lines.project.dimensionsPanel`/`lines.costcenter.dimensionsPanel` to `true` (grid stays `false`) and were regenerated. Verified additive: `generateTableComponent` on an entity with zero `dimensionsPanel: true` fields (e.g. `physical-inventory`) produces a byte-identical `contract.json`/generated output (same checksum, only `updatedAt` differs). Full generator design + verification: see the ETP-4529 developer delivery report (or `git log` on `cli/src/generate-frontend.js`/`resolve-curated.js`/`generate-contract.js` in `schema_forge_core` for "ETP-4529"). One pre-existing, unrelated item surfaced while regenerating these 4 windows: their committed `apiPrediction.actions` were stale relative to already-published core behavior (a `field` key dropped in favor of richer `name`/`actionType`/`parameters`/etc. metadata) — confirmed to reproduce with the plain published `@etendosoftware/schema-forge-cli@0.3.9` too, unrelated to this change; worth a coordinator-scheduled `make regen` sweep across the repo.
---

## `lineHiddenColumns` Hid Unrelated Grid Columns (product/listPrice/grossAmount) — ETP-4530

**Component:** `tools/app-shell/src/components/contract-ui/DetailView.jsx`

**Affected windows:** sales-invoice, purchase-invoice, goods-shipment, goods-receipt (the same four `inlineEditable` windows that consume `lineHiddenColumns`, per the ETP-4529/4543 entry above).

**Symptom:** Live manual testing on sales-invoice found the Líneas grid missing `Producto`, `Precio Tarifa`, and `Importe bruto de línea` entirely for an existing saved line — not hidden-but-present, gone from the rendered columns — alongside the expected `project`/`costcenter` dimension gating. This is exactly the risk the ETP-4543 "Blast radius note" above flagged as generic-and-unscoped; it materialized for real.

**Root cause:** `lineDisplayLogic = useDisplayLogic(detailEntity, hook.editing, ...)` evaluates the lines-tab `evaluate-display` call against the HEADER record snapshot as a stand-in for "any line" — valid only for `@ACCT_DIMENSION_DISPLAY@` (a config-only macro, independent of record field values). `NeoDisplayLogicHandler` (`com.etendoerp.go`) evaluates **every** active `AD_Field.displaylogic` on the tab, though, not just the dimension macro. Confirmed via direct DB query: Sales Invoice's Lines tab has real, record-dependent `AD_Field.displaylogic` on Product (`@Financial_Invoice_Line@='N'`, a sibling per-line field), List Price (`@GROSSPRICE@='N'`), and Line Gross Amount (`@GROSSPRICE@='Y'`, both against `GROSSPRICE`, an `AD_AuxiliaryInput` running `SELECT istaxincluded FROM m_pricelist WHERE m_pricelist_id = @M_PRICELIST_ID@`). Neither dependency exists in the header-record snapshot; `NeoDisplayLogicHandler.buildEvalContext()` only special-resolves `$Element_*` dimension prefs, never executes `AD_AuxiliaryInput` SQL, and never carries per-line field values. `DynamicExpressionParser` compiles both to plain property/context lookups that resolve to `undefined` against the missing keys (a property read on a defined object, not a thrown error, so the evaluator's fail-open `catch` — which defaults to "visible" — never triggers). `undefined === 'N'`/`'Y'` is simply `false`, indistinguishable at the JSON level from a real "hide this column" signal — even though `decisions.json` had explicitly nullified `product`'s and `grossAmount`'s `displayLogic` (`"displayLogic": null`, the ETP-4529 "Siempre" decision), an override that only reaches `contract.json`/generated JS, never the NEO endpoint (which reads straight from the DB, with no notion of Schema Forge's contract-level override).

**Fix:** `lineHiddenColumns` now only trusts the visibility map for keys in a new module-level allowlist, `DIMENSION_MACRO_KEYS = new Set(['project', 'costcenter', 'businessPartner'])` (declared next to `DetailView.jsx`'s existing `WINDOW_DELETE_ACTIONS` constant) — the field keys the representative-header-record trick was actually built for. Any other field's spurious `false` from this evaluator's known context limitation is now ignored, same as the existing fail-open handling of absent/`true` keys. Single-repo, generic fix (no `schema_forge_core` change, no regen needed) since `lineHiddenColumns` lives entirely in this hand-written runtime component.

**Lesson:** A generic "any explicitly-false key hides the column" filter over a per-tab evaluator's full field list is only as safe as the evaluator's input context. When that context is a stand-in/representative record (documented here as intentional for the dimension macro), any OTHER field on the same tab with genuine record- or aux-input-dependent `displayLogic` will silently misresolve — and a `decisions.json`-level `displayLogic: null` override does NOT suppress this, because the raw AD metadata evaluator is a separate, DB-backed code path that knows nothing about Schema Forge's contract. Prefer an explicit allowlist of the keys a representative-context call is actually valid for, over trusting the full response.

Regression coverage: `tools/app-shell/src/components/contract-ui/__tests__/DetailView.lineHiddenColumns.vitest.jsx` (asserts `product`/`listPrice`/`grossAmount` stay visible even when the mocked evaluator resolves them `false`, while `project`/`costcenter`/`businessPartner` still hide correctly).

---

## `make regen` Silently Strips es_ES Enum Labels on a DB Missing `AD_Ref_List_Trl` Rows

**Component:** none (not a code bug) — local DB data gap, hit while running `make regen ONLY=financial-account` for ETP-4530

**Symptom:** Running `make regen ONLY=<window>` against a local dev DB regenerated `contract.json` with 43 enum `enumValues[].labels` blocks silently dropped (e.g. `{ "value": "CA", "name": "Card", "labels": {"es_ES": "Card"} }` became `{ "value": "CA", "name": "Card" }`) even though `decisions.json` for the affected fields was untouched. The three generated JSX forms that consume those enums (`AccountForm.jsx`, `TransactionForm.jsx`, `ImportedBankStatementsForm.jsx`) picked up the same regression. Nothing in the regen output flags this as an error — the run reports success, only the (harder to notice) "AD cache looks STALE" warning hints at drift.

**Root cause:** The extractor's `AD_Ref_List_Trl` query (`SELECT ... FROM AD_Ref_List rl LEFT JOIN AD_Ref_List_Trl rlt_es ...`) returns real data when it exists, but this specific local sandbox DB is missing the es_ES translation rows for several `AD_Ref_List` values that DO have translations on whatever DB originally produced the committed `contract.json` (staging/CI, presumably). The `es_ES` language itself is installed (2067 other `AD_Ref_List_Trl` rows exist), so this is not a missing-locale-pack problem — specific rows are simply absent for these particular reference lists in this sandbox. Confirmed missing (value → English name), by `AD_Reference_ID`:
  - `A6BDFA712FF948CE903C4C463E832FC1` ("Financial account type"): `CA` → "Card"
  - `86F92F3C04C148E69F12FF84F50AD51D` ("Statement Grouping"): `1BD`/`1BE`/`1BM`/`1BW` → "Within 1 day" / "New statement each run" / "Within 30 days" / "Within 7 days"
  - `A1B2C3D4E5F607890A1B2C3D4E5F6A7B` ("FA Connection Status"): `CO`/`DC` → "Active" / "Inactive"
  - `D431058F6B7345598D1E0709DFF3B5DD` ("ETBLKP_All_Accounting Status", consumed by BOTH the `transaction` and `importedBankStatements` entities, hence the higher block count): 18 values (`NC`, `d`, `D`, `L`, `E`, `C`, `i`, `AD`, `DT`, `NO`, `b`, `c`, `l`, `p`, `y`, `Y`, `T`, `N`) → "Cost Not Calculated", "Disabled For Background", "Document Disabled", "Document Locked", "Error", "Error, No cost", "Invalid Account", "No Accounting Date", "No Document Type", "No Related PO", "Not Balanced", "Not Convertible (no rate)", "Pending Refresh", "Period Closed", "Post Prepared", "Posted", "Table Disabled", "Unposted"

  `18*2 (two consuming entities) + 4 + 2 + 1 = 43` — matches the exact count observed.

**Fix (workaround, not a code change):** Diffed the freshly-regenerated `contract.json` against the git-committed baseline and restored only the `labels` keys that existed in the baseline and were dropped by the fresh extraction (same `value`, same `name` — a pure translation restore, zero structural drift, verified byte-for-byte against the baseline otherwise). The three affected generated JSX forms carried NO other change from this regen run, so they were reverted outright to their committed version instead of hand-patched. `decisions.json`'s legitimate, additive change (the new `accountingConfiguration` entity) was kept as-is.

**This is NOT something to "fix" in code.** It is a gap in this local sandbox's reference data. Anyone running `make regen` (with or without `SKIP_EXTRACT`) on a similarly incomplete local DB — for ANY window that touches one of the 4 `AD_Reference_ID`s above, or any other reference list missing its `AD_Ref_List_Trl` es_ES rows — will silently strip the same (or other) label blocks with no warning, and a naive commit of the regenerated artifacts would ship a translation regression.

**Lesson:** Before trusting a `make regen` diff on `contract.json`, check whether the diff includes UNRELATED `enumValues[].labels` removals on entities/fields the current task never touched — that is a strong signal of incomplete local `AD_Ref_List_Trl` data, not a real change. When it happens: (1) do not commit the label loss, (2) diff against the git baseline and restore just the dropped `labels`, keeping every field the actual task changed, (3) do not regenerate the frontend a second time to "fix" it — that just re-runs the same broken extraction — (4) leave a note like this one so the next person recognizes the symptom immediately instead of re-diagnosing it. A proper long-term fix would be seeding this local sandbox's `AD_Ref_List_Trl` es_ES rows from a reference/CI DB, which is out of scope for a functional-repo window ticket.

---

## [2026-07-17] ETP-4531 — Scope redefinition: unify document/accounting date instead of keeping them independent

**Note:** this is not a bug entry — it records a **scope reversal** on the same ticket, so a future reader who finds the earlier `blockCalloutFieldUpdate`/"independent accounting date" work (see `docs/neo-headless-extensibility.md` Common Pattern entry, commit `40e086041`, and the per-window notes previously in `docs/generated-custom-windows/{sales-invoice,purchase-invoice,goods-shipment,goods-receipt}.md`) does not mistake it for the current behavior.

**Original scope (obsolete):** `sales-invoice`, `purchase-invoice`, `goods-shipment`, `goods-receipt` kept `documentDate` and `accountingDate` as two independent, user-editable header fields. A Java-side guard (`NeoHandlerUtils.blockCalloutFieldUpdate`, generalizing the `blockCalloutCurrencyUpdate`/ETP-4029 precedent) stripped the classic AD callout cascade (`SE_Invoice_AccountingDate` / `SL_InOut_AccountingDate`) that would otherwise auto-fill `accountingDate` from the document date, so the user could set each date separately. `accountingDate` was `visibility: editable`, visible, with its own `readOnlyLogic: "@Posted@='Y'"`.

**Redefinition (2026-07-17, per updated Jira description on ETP-4531):** the requirement flipped to the opposite — each postable document must show exactly ONE visible date field; on save, that value is written internally to both the document-date and accounting-date columns; the user never sees or edits accounting date independently. Newly in scope: `sales-order` and `purchase-order` (never touched by the original work).

**What changed (frontend/config side, this pass):**
- `accountingDate` switched from `visibility: editable` (+ `readOnlyLogic`) to `visibility: system` in all four invoice/shipment/receipt windows' `decisions.json`, fully removing it from `frontendContract.entities.*.fields` and from every generated form/grid.
- `purchase-order`'s `accountingDate` switched from `visibility: readOnly` + `form: false` to `visibility: system` — the prior config already suppressed rendering but still left the field listed (inert) in the frontend contract; `system` matches `sales-order`'s already-compliant shape (raw AD visibility `system`, no override) and the other four windows.
- `sales-order` needed no change — confirmed already compliant (raw AD visibility is `system`, no decisions.json override, absent from `contract.json`'s frontend fields, absent from generated JSX).
- `amortization`'s `accountingDate` is an explicit, confirmed exception (see Jira comment on ETP-4531, 2026-07-17): it is a distinct concept from `startingDate` (the amortization schedule start), already not independently editable, and was left functionally unchanged (annotation-only `_note` added).
- `financial-account`'s `transaction.dateAcct` was already `visibility: system` with `transaction.transactionDate` as the sole visible date — already compliant, no change.

**Java-side counterpart (separate change, tracked by a companion task, not this repo):** the `blockCalloutFieldUpdate` guard in `com.etendoerp.go` that stripped the cascade is being removed, so the native classic-AD `documentDate → accountingDate` callout cascade is now intentionally allowed to flow through unmodified on save.

---

## [2026-07-27] ETP-4609 (QA finding, DOCS write-up) — Latent `hiddenColumns` Clobbering Bug in Dead `ContactsTable.jsx`

**Note:** this is NOT an active bug — it documents a landmine found in dead code so it isn't silently rediscovered (and re-diagnosed from scratch) if the file is ever revived. No fix was applied.

**Component:** `tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx`

**Status: dead code, confirmed unreachable.** `contacts/index.jsx` renders the generated `BusinessPartnerPage` and does not import `ContactsTable.jsx`. A repo-wide search found no other import of the component either (only its own test file references it). Nothing currently mounts this component.

**The bug (same shape as the real ETP-4609 fix in `ProductCustomTable.jsx`):** `ContactsTable.jsx` declares `const HIDDEN_COLS = ['__contactType']`, passes `hiddenColumns={HIDDEN_COLS}` to `DataTable`, and then spreads `{...rest}` (containing whatever the caller passed in) *after* that prop, e.g. `hiddenColumns={HIDDEN_COLS} ... {...rest}`. `ListView.jsx` unconditionally forwards its own `hiddenColumns` prop (default `[]`) to whatever `Table` component a window wires in. Because the spread lands after the local assignment, a live caller's `hiddenColumns={[]}` (or any other value) would silently clobber `HIDDEN_COLS`, and `__contactType` would render as a visible grid column instead of staying hidden. This is exactly the bug ETP-4609 fixed in `ProductCustomTable.jsx` by destructuring the incoming prop and merging (`[...new Set([...local, ...incoming])]`) instead of relying on spread order.

**Why it wasn't fixed here:** out of scope for ETP-4609 (that ticket's QA pass found this only as a cross-window regression check while verifying the real fix, and the bug predates ETP-4609). Since the file is currently unreachable from any live window, there is no user-facing impact today.

**Evidence:** `tools/app-shell/src/windows/custom/contacts/__tests__/ContactsTable.vitest.jsx` has a corresponding `it.skip(...)` test (`'keeps HIDDEN_COLS even when the parent forwards its own hiddenColumns=[] (ListView default)'`) that reproduces the clobbering and is skipped rather than deleted, precisely so it stays discoverable.

**If `ContactsTable.jsx` is ever un-deadened (imported/mounted again):** apply the same destructure-and-merge fix used in `ProductCustomTable.jsx` before shipping, and un-skip the test above (or delete both the component and the test if the file is instead removed as confirmed dead code during cleanup).

**Lesson:** when a ticket's scope reverses mid-implementation, don't just overwrite the old work silently — leave a dated trail (here + the affected window docs) explaining that the earlier "independence" behavior was intentional, correct-at-the-time, and has been superseded by an explicit redefinition, not reverted because it was wrong. Also: `visibility: readOnly` + `form: false` and `visibility: system` can look functionally equivalent in the rendered UI (both fully suppressed from form and grid), but only `system` fully excludes the field from `frontendContract.entities.*.fields` — prefer `system` for "never shown, never independently editable" fields over the readOnly+form:false combination, to avoid two different-looking representations of the same "fully hidden" intent across sibling windows.

---

## [2026-07-27] Tooling — no DB-free way to regenerate a contract (`sf-resolve-curated` broken)

Found while working ETP-4156, which changes only `decisions.json` (adds `entities.contact.javaQualifier`) and therefore needs a contract regeneration but no DB data.

**Three separate defects, all in the published `@etendosoftware/schema-forge-cli` (and its `schema_forge_core` source):**

1. **`resolve-curated.js` ignores `SF_ROOT`.** Line 22 is `const ROOT = join(__dirname, '..', '..')`, while every sibling module (`extract-fields.js`, `extract-from-db.js`, `check-version.js`, …) uses `process.env.SF_ROOT || join(__dirname, '..', '..')`. Consequence: the single-phase command documented in `CLAUDE.md` ("`resolve-curated.js --window <name> --write` — single phase, no extract, no push") cannot work from published packages — it looks for `node_modules/@etendosoftware/artifacts/<window>/schema-raw.json`. `LOCAL_CORE=1` does not help either: `cli/sf-local` correctly keeps the cwd on the functional repo, but `__dirname` then resolves to the core repo, so it looks for `schema_forge_core/artifacts/<window>/rules-raw.json`. **One-line fix**, and it restores the only DB-free path to a contract regeneration.
2. **`node_modules/.bin/sf-resolve-curated` is not an executable script.** It is the raw ESM source with no shebang, so the shell tries to interpret it (`/Applications: is a directory`, `AGENTS.md: command not found`, then a syntax error on the JSDoc). Other bins in the same map work, so this is a per-entry packaging problem.
3. **`sf-regen-all --skip-extract` still hits the database, and swallows the error.** `Skip extract: YES` is printed, then `[F1a] Extracting fields...` runs `extract-fields.js` (a DB reader) and fails. `--skip-extract` apparently only skips `[F0] extract-from-db`. Worse, the failure is reported as a bare `✗ FAILED:` with an empty message, so there is nothing to diagnose — the actual cause (no DB reachable) only becomes visible by running a full `make regen` and watching it die at `[F0]` instead.

**Impact:** any change that touches only `decisions.json` currently requires a live database to regenerate the contract, even though the inputs (`schema-raw.json`, `rules-raw.json`, `decisions.json`) are all on disk. Also worth noting: a failed run left a stray empty `curated` file at the repo root.

**Workaround until fixed:** leave the contract stale and regenerate with `make regen ONLY=<window> PUSH_TO_NEO=1` in an environment with the DB up — which is needed anyway whenever `javaQualifier` changes, since the handler only activates once `ETGO_SF_ENTITY.Java_Qualifier` is persisted and exported.

---

## [2026-07-27] ETP-4609 (DOCS write-up) — Dead `purchase-invoice/custom/InvoiceHeaderTable.jsx`; `sales-invoice` counterpart is LIVE, not dead (correction of an initial finding)

**Note:** this is NOT an active bug in either file. It documents (a) a confirmed-dead file so nobody wastes time "fixing" its `required` flags thinking it's a live bug, and (b) a correction — its sibling file with the identical name in `sales-invoice` was initially suspected dead by the same reasoning but traced out to be reachable after all. Read both halves before touching either file.

### `artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx` — confirmed dead code, unreachable

**Status: dead code, confirmed via code tracing (not assumed).** The generated `artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx` imports it (`import HeaderTable from '../../../custom/InvoiceHeaderTable'`) and wires it as `Table={HeaderTable}` inside its own no-`recordId` `<ListView>` branch. That branch is never reached in the running app: `tools/app-shell/src/windows/registry.js` resolves loaders in the order **customLoaders > windowLoaders > PlaceholderWindow** (see the comment at that line), and `purchase-invoice` has a `customLoaders` entry (`./custom/purchase-invoice/index.jsx`) that always wins over the generated `windowLoaders` entry. That custom `index.jsx` has its own branching (`recordId ? <HeaderPage .../> : <ListView Table={PurchaseInvoiceTable} .../>`) and its own, entirely separate list-view table component — `PurchaseInvoiceHeaderTable.jsx` in `tools/app-shell/src/windows/custom/purchase-invoice/` — imported and used instead. It never imports `InvoiceHeaderTable.jsx` at all. So generated `HeaderPage.jsx` is only ever mounted with a `recordId` present (DetailView branch), and its own no-`recordId` branch — and therefore `artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx` — is never executed by user navigation. Repo-wide search confirms no other importer.

Confirming this mattered in practice: the ETP-4609 required-flag-drift fix for purchase-invoice (commit `324166402`, this branch) correctly touched only the two live files (`PurchaseInvoiceHeaderTable.jsx` + `index.jsx`, both in `tools/app-shell`) and left this dead artifact file untouched — that was the right call, not an oversight.

### `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx` — LIVE, do not treat as dead

Same-shaped file, same generated-`HeaderPage.jsx` import site, same unreachable-branch reasoning as above for *that* import — but this file has a **second importer that IS reachable**: `tools/app-shell/src/windows/custom/sales-invoice/index.jsx` imports it directly via the `@generated` alias (`import InvoiceHeaderTable from '@generated/sales-invoice/custom/InvoiceHeaderTable.jsx'`, where `@generated` resolves to `../../artifacts` — see `vite.config.js`), wraps it as `SalesInvoiceTable`, and passes it as `Table={SalesInvoiceTable}` to its *own* `<ListView>` in the no-`recordId` branch — the branch that customLoaders resolution actually renders. So unlike `purchase-invoice`, `sales-invoice`'s custom `index.jsx` reuses the artifact-directory component instead of maintaining a separate one in `tools/app-shell`. This file is executed on every visit to the Sales Invoice list.

**Open item surfaced by this correction:** as of this write-up, none of this file's grid columns carry `required: true` (checked all `key:` entries), while `contract.json` marks `documentNo` and `businessPartner` as required. The ETP-4609 fix commit for sales-invoice (`509650592`) only touched `sales-invoice/index.jsx`, not this file — so the required-flag drift this ticket exists to fix may still be present here and was not part of the 13-window pass. Not fixed as part of this DOCS entry (out of scope for Sage); flagged for whoever picks up the open "extend audit to `artifacts/*/custom/` locations" task.

**Lesson:** the registry `customLoaders > windowLoaders` unreachability argument only proves the *generated* `HeaderPage.jsx` import site is dead — it says nothing about whether the same artifact file has a second, independent importer elsewhere (as happened here via the `@generated` alias). Always grep for **all** importers of a suspected-dead file before declaring it dead, even when two sibling windows look identical at a glance; `purchase-invoice` and `sales-invoice` diverged in exactly this way despite having same-named custom files.
## [2026-07-28] ETP-4610 — "Add dimensions" moved from a fixed grid column to a hover action; regen-gap on goods-receipt/simple-g-l-journal closed

**Follow-up to ETP-4529/ETP-4543.** Scope: move the "+ Añadir dimensiones" trigger out of the `dimensionsPanel` grid column and into `InlineLinesPanel`'s per-row hover-action strip (next to Pencil/Trash), and hide the "Dimensiones contables" column entirely. See `docs/ui-customization.md` §14b/§14c for the resulting UX and the new generic `rowActions` extension slot this introduced.

**No `schema_forge_core` change was needed.** `InlineLinesPanel.jsx`, `DimensionsPanel.jsx`, and `useAccountingDimensionFields` all live only in this functional repo's `tools/app-shell/src/` — none of them are part of `@etendosoftware/app-shell-core` (verified: `diff` against `../schema_forge_core/packages/app-shell-core/src/components/contract-ui/` shows `InlineLinesPanel.jsx`/`DimensionsPanel.jsx` don't exist there at all, and the `@` vite alias always resolves `@/components/contract-ui/*` to this repo's own `./src`, never the core package, even in `LOCAL_CORE=1` mode). `generate-frontend.js`'s `buildDimensionsPanelColumn` still emits the exact same `type: 'dimensionsPanel'` column literal as before — the generator's job (declaring the metadata) didn't change, only how the generic consumer renders it.

**Regen-gap discovered and closed while validating:** `goods-receipt` and `simple-g-l-journal`'s generated `<Window>LineTable.jsx` had NOT actually picked up their `decisions.json` `dimensionsPanel: true` flags — `contract.json` for both had zero `dimensionsPanel` references despite the flags being present and committed (likely lost across the `epic/ETP-3504` merges preceding this branch — the earlier ETP-4529 feedback entry above claims all four original windows, including goods-receipt/goods-shipment, were already regenerated). Regenerated both via `make regen ONLY=<window> SKIP_EXTRACT=1 LOCAL_CORE=1`; confirmed clean (`sf-validate-pipeline`, 0 violations) and additive version bumps in both `contract-changelog.json`s.

**goods-shipment hit the already-documented `AD_Ref_List_Trl` translation-stripping issue** (see "`make regen` Silently Strips es_ES Enum Labels..." entry above) on its `etblkpAccountingstatus` field — regenerating it on this sandbox silently dropped 18 `es_ES` option labels, an unrelated local-DB data gap, not a real change. Per that entry's own lesson, the regen was NOT committed for goods-shipment; `sales-invoice`/`purchase-invoice` were left un-regenerated in this pass too (their `decisions.json` flags are already correct — see the ETP-4529 entry above — regenerating them was optional validation, not required to ship this ticket, and re-running risked hitting the same translation-stripping symptom on unrelated fields). `goods-receipt` and `simple-g-l-journal` did not hit this symptom (neither has that reference list on an entity touched by the regen) and were safe to commit as regenerated.

**`purchase-invoice`, `goods-shipment` still not validated end-to-end via `make regen` in this pass** — a future task should re-attempt them once the sandbox's `AD_Ref_List_Trl` es_ES rows are backfilled (see the entry above), or regen with the label-restore workaround already documented there.

**Update — `sales-invoice`/`purchase-invoice` regenerated cleanly in a later pass** (`make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1 LOCAL_CORE=1`): the diff for both was exactly the expected `dimensionsPanel: true` metadata on `project`/`costcenter` plus a version/checksum bump, `sf-validate-pipeline` clean on both, committed. **`goods-shipment` hit the translation-stripping trap again on this second attempt too** (same 18 `etblkpAccountingstatus` es_ES labels dropped, `⚠️ AD cache looks STALE` warning on the same `AD_Ref_List`/`AD_Ref_List_Trl` query) — reverted again via `git checkout -- artifacts/goods-shipment/`, still not regenerated on this branch. Its `decisions.json` flags are already correct (unaffected by this), so the window's runtime behavior is not blocked — only the `contract.json`/generated-JSX regen is deferred until the sandbox's `AD_Ref_List_Trl` es_ES rows are backfilled.

**Also observed:** `SKIP_EXTRACT=1` did NOT actually skip the DB extraction phase in either attempt — `make regen`'s log still showed `[F1a] Extracting fields...`/`[F1b] Extracting rules...` running against the DB for all windows passed, contrary to what the flag name implies. Did not affect correctness here (`schema-raw.json`/`rules-raw.json` were left unmodified in `git status` both times), so not chased further in this pass — but flag as a `sf-bug` candidate if a future task actually needs to skip the DB hit (e.g. no DB connectivity available) and finds `SKIP_EXTRACT=1` doesn't help.

**Follow-up in the same session — adaptive hover-action label, and a `''` vs `null` trap:** the hover action's label/icon was made adaptive ("Add dimensions" → "Edit dimensions" once the line has a dimension value set), via a new `hasFilledDimensionValues()` helper (`tools/app-shell/src/lib/hasFilledDimensionValues.js`) that reuses `resolveIdentifier()` to check each candidate field. First implementation checked `resolveIdentifier(row, key) != null` and failed a test for a row with NO dimension values at all — because `resolveIdentifier`'s test mock (and some real call sites) return `''` for a missing value, not `undefined`/`null`, so the `!= null` check treated an empty string as "filled". Fixed by checking truthiness (`Boolean(...)`) instead. **Lesson:** when checking "does this field have a value" against `resolveIdentifier()` (or any helper that may fall back to `''`), always check truthiness, never `!= null` — an empty string is a valid non-null return for "no value" in this codebase's convention.

**Test coverage added post-QA:** following Sentinel's one recommendation, dedicated coverage was added for both the live label/icon transition and the helper in isolation: `InlineLinesPanel.vitest.jsx` gained a `rowActions — generic hover-action extension slot` describe block (rendering, static `show: false`, per-row `show` function, declared-order rendering) plus explicit "flips from addDimensionsTooltip to editDimensionsTooltip"/"flips back" live-transition tests inside the `dimensionsPanel column` describe block; `hasFilledDimensionValues.js` gained its own dedicated `hasFilledDimensionValues.vitest.js` (7 cases, deliberately not mocking `resolveIdentifier` so the real `''`-vs-`null` contract above is exercised end-to-end).

**`goods-shipment` regen finally resolved, plus the deferred `contract.mcp.json`/`contract.prev.json` drift closed — via the pre-push hook itself.** `git push` on this branch failed its CI-parity "UI / contract drift" check (`make regen`-from-cache against the PINNED published core package + a frozen cached AD snapshot, compared against committed artifacts) with drift on 10 files: `financial-account/contract.mcp.json` (the version-stuck drift from earlier in this entry), `goods-receipt`/`purchase-invoice`'s `contract.mcp.json`+`contract.prev.json` (version/checksum only, catching up to already-committed `contract.json` content), `sales-invoice`/`simple-g-l-journal`'s `contract.mcp.json` (same), and — notably — `goods-shipment`'s `contract.json`, `contract.mcp.json`, AND `GoodsShipmentLineTable.jsx`. Inspected every diff: all 9 non-goods-shipment files were pure version/checksum/sync catch-up, zero structural change. `goods-shipment`'s diff was the expected clean `dimensionsPanel: true` addition on `project`/`costcenter` — **no translation-label loss at all**, because this offline pipeline regenerates from a frozen cached AD snapshot, not the local sandbox's live (translation-incomplete) DB. This confirms the two earlier `goods-shipment` regen failures were purely a local-DB data gap, never a real blocker — the fix was already sitting in the CI-parity codepath the whole time. Accepted this regen output wholesale (`sf-validate-pipeline --scope=goods-shipment`: OK, full suite: 9746 passing), closing both the goods-shipment deferral AND the 3-file deferred drift from the top of this entry in one commit. **Lesson:** when a local-DB `make regen` hits a translation-stripping symptom, the pre-push hook's own offline/cached-snapshot regen (or `sf-validate-pipeline`'s underlying drift check) may succeed cleanly where the live-DB regen can't — worth trying before accepting a window as "regen blocked until the sandbox is backfilled."

---

## [2026-07-28] ETP-4610 — live-UX-review follow-up: static "Edit dimensions" icon, chevron left padding, dimension sub-row alignment

**Follow-up to the entry above, after PR #975 was already through DEV→REVIEW→QA→DOCS once and deployed.** The user tested the running instance and found 3 visual issues by eye; all fixed as new commits on the same branch.

**1. Dropped the adaptive Add/Edit hover-action icon, went static.** The previous pass's adaptive label (`Plus`/"Add dimensions" while empty → `Pencil`/"Edit dimensions" once filled, driven by `hasFilledDimensionValues()`) looked wrong in the deployed UI: the filled-state `Pencil` icon sat immediately next to the row's own built-in Edit action, reading as two identical duplicate pencil buttons rather than two distinct affordances. Per the user's explicit decision ("to avoid conditionals"), the action now always renders the `Layers` icon (lucide-react) with the **"Edit dimensions"** tooltip, regardless of fill state. `hasFilledDimensionValues(row, fields)`/`rowHasDimensionValues` had no other consumer, so it (and its dedicated `hasFilledDimensionValues.vitest.js`) were deleted outright rather than left dead; the now-unreferenced `addDimensionsTooltip` i18n key was removed from `en_US.json`/`es_ES.json` after confirming (grep) it had no other reference. The four adaptive-label tests in `InlineLinesPanel.vitest.jsx` (static before/after + two live-transition tests) were replaced with one static assertion that the tooltip reads "Edit dimensions" on both a filled and an empty row. **Lesson:** an adaptive icon/label that depends on per-row state is not automatically better UX than a static one — when the two states can visually collide with an unrelated, already-present icon (here: two Pencils in the same hover strip), static-and-unconditional is the safer default. `docs/ui-customization.md` §14b updated to describe the static behavior and record why the adaptive variant was dropped.

**2. Chevron sat flush against the row's left border.** The expand/collapse chevron column (`hasDimensionsPanel` — `InlineLinesPanel.jsx`) had no left padding at all, unlike the selection-checkbox column right next to it (`px-2` = 8px each side, already an established convention in the same row). Added the same `px-2` to the chevron's container and widened both the header placeholder and the row's chevron `<div>` from a bare `32px` to `44px` (28px `h-7 w-7` button + 8px padding on each side) — introduced as named constants `CHEVRON_COLUMN_WIDTH`/`CHECKBOX_COLUMN_WIDTH` in `InlineLinesPanel.jsx` rather than duplicated literals, since the next fix needed the same numbers.

**3. Dimension sub-row's first field ("Proyecto") didn't line up with the first grid column ("Producto") above it.** The expand sub-row (`renderDimensionsSubRow` → `DimensionGrid`) used a flat `px-10` (40px) left padding, unrelated to where the actual first data column starts (chevron column + checkbox column + the first cell's own `cellPaddingX`). Replaced the hardcoded `px-10` with a computed `DIMENSIONS_ROW_INDENT = CHEVRON_COLUMN_WIDTH + CHECKBOX_COLUMN_WIDTH + TOKENS.cellPaddingX` (= 96px with the widened chevron column from fix 2), applied via inline `paddingLeft` (right padding kept at the original 40px via `pr-10`). This ties the sub-row's indent to the same layout constants the leading columns use, so it stays correct if either column's width changes later instead of silently drifting back out of alignment.

**Not visually verified in a real browser** in this pass (no local Etendo/dev-server instance available in this environment) — verified via the full `make test` suite plus a manual review of the computed offsets against the DOM structure (chevron 44px + checkbox 40px + cellPaddingX 12px = 96px, matching the first grid column's text start). The user has a live deployed instance and will confirm the actual pixel result.

---

## [2026-07-28] ETP-4610 — Amortización lines: dimensions moved from a fixed column to a hover action (bringing it in line with the other 5 windows)

**Component:** `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx`

**Gap:** the earlier ETP-4610 passes (see the two entries above) moved the "Add dimensions"
trigger into the hover-action strip for the 5 pipeline-generated windows that render their lines
through `InlineLinesPanel`'s generic `rowActions`/`dimensionsPanel` mechanism. `AmortizationLinesTable`
was missed because it is a fully hand-built `customLinesComponent` (its own `<table>`, its own
fetch/PUT/POST/DELETE, its own multi-select and inline add-row draft-line flow) that never used
`InlineLinesPanel` at all — it still had a permanent "Accounting dimensions" grid column rendering
`DimSummary` badges/the dashed "+ Añadir dimensiones" affordance, the exact pre-ETP-4610 pattern
the other 5 windows originated from and then moved away from.

**Investigated wrapping `InlineLinesPanel` first (the preferred, DRY-er option) — rejected as
disproportionate.** `InvoiceLinesTable.jsx`/`SalesInvoiceLinesTable.jsx` (the thin adapters the
other 5 windows use) work because `DetailView` already owns line CRUD, the add-row flow, and
selection state, and just forwards them as props. `AmortizationLinesTable` owns all of that itself
with no equivalent host — `InlineLinesPanel` has no built-in inline-add-draft-row mechanism at all
(that lives entirely outside it in the generated-window wiring this component never had), and its
DOM is a flex-row grid, not a `<table>`. Rewriting the component around `InlineLinesPanel` would
mean re-deriving the add-row/selection-bar/CRUD wiring from scratch and rewriting both existing
regression-test suites (which assert on `<table>`/`<tr>`/`<td>` DOM) — a full rewrite disproportionate
to relocating one hover UI element. **Fix (hand-patch instead):** removed the "Accounting dimensions"
`<th>`/`<td>` column and its `DimSummary` usage; added a third hover-action button (`Layers` icon,
static "Edit dimensions" tooltip via the existing `editDimensionsTooltip` i18n key — no adaptive
variant, matching the already-established decision from the entry above) ahead of Pencil/Trash,
gated on `dimensionFields.length > 0` and on `!isReadOnly` (same gating as Pencil/Trash); it toggles
the same `expandedId` state the existing circular chevron already drove, so clicking either opens
the identical `DimensionGrid` expand row. `colSpan` on the loading/expand rows dropped from `7` to
`6`; the add-line draft row's now-orphaned placeholder `<td>` for the removed column was also
dropped.

**Test helper fallout:** `AmortizationLinesTable.vitest.jsx`'s `getPencilButton`/`getTrashButton`
helpers picked buttons by fixed array index (`buttons[0]`/`buttons[1]`) in the hover strip — adding
a button ahead of Pencil shifted those indices. Fixed by giving Pencil/Trash explicit `title`/
`aria-label` attributes (they had neither before) and switching the helpers to attribute-based
lookups (`[title="editLineTooltip"]`/`[title="deleteRowTooltip"]`), which is robust regardless of
how many buttons precede them.

**Lesson:** when a UX/UI convention is generalized into a shared mechanism (here:
`InlineLinesPanel`'s hover-action dimensions entry point), grep for *other* components implementing
the same visible pattern independently — `customLinesComponent`/hand-built tables are easy to miss
because they don't import the shared component at all, so a search for `InlineLinesPanel` usage
alone won't surface them. A search for the shared i18n keys or visual pattern name (here:
`amortizationDimensionsTitle`/`DimSummary`) across the whole `tools/app-shell/src` tree is what
actually surfaced this gap.

**Not visually verified in a real browser** in this pass — no local Etendo/dev-server instance was
started in this environment. Verified via the full `make test` suite (531 vitest files / 9739 tests
passed, 1 pre-existing unrelated skip; all 4 `node --test` groups green) plus manual review of the
DOM structure and gating conditions.

---

## [2026-07-28] ETP-4610 — Amortización hover-action strip was transparent, overlapping the Amount column

**Component:** `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx`

**Symptom:** reported by the user against the deployed build — the row hover-action strip (Layers/
Pencil/Trash) rendered with visible overlap onto the Amount column's text, and the strip itself
looked "totally transparent."

**Root cause:** the strip's wrapper `<div>` (`position: absolute`, faded in via
`opacity-0 group-hover/row:opacity-100`) had **no background of its own** — only the icon glyphs
were opaque, each button only getting a background on its own individual `:hover`. With the
original 2 buttons (Pencil/Trash) this was invisible: they fit entirely inside their own dedicated,
otherwise-empty actions column (`w-20` = 80px), so there was nothing behind them to bleed through.
Adding a 3rd button (Layers, for "Edit dimensions" — see the entry above) pushed the strip's actual
rendered width past 80px; because the wrapper is `position: absolute`, it does not influence the
table's own column-width layout, so on hover it visually spilled into the neighboring Amount
column and — being transparent — let that column's text show through underneath the icons.

**Fix:** gave the wrapper a solid `bg-card` pill background (+ `shadow-sm ring-1 ring-border/40`,
matching the codebase's existing `QUICK_ACTIONS_PILL_CLASS` convention in
`quickActionsStyle.js`, even though that specific flag is currently disabled elsewhere) so the
strip occludes whatever is behind it instead of being see-through, AND widened the actions column
from `w-20` (80px) to `w-32` (128px) so the 3-button pill fits inside its own column without
needing to spill over at all — the background is now a safeguard, not the only thing hiding the
overlap.

**Lesson:** an absolutely-positioned hover overlay with a transparent background is only safe when
its rendered footprint is guaranteed smaller than its reserved column — that guarantee silently
breaks the moment a new button is added to the strip, and the resulting bug (see-through overlap)
is easy to miss in code review because nothing in the diff itself looks wrong; it only becomes
visible when someone actually hovers a row in a running instance. When adding a button to any
`position: absolute` hover strip, always re-check (a) whether the strip still fits inside its
reserved column at the new width, and (b) whether the strip has an opaque background as a
second line of defense in case it doesn't.

---

## [2026-07-30] ETP-4741 — Creation-form defaults race fixed; two follow-ups deferred

The race fix itself (defaults-loading gate on the `/new` route, 4s gate-release budget, epoch-based
invalidation of superseded sessions, user-edit merge guard, record-load neutralization) is documented in
`docs/generated-custom-windows/app-shell-functional-flows.md` §4 and
`docs/ops/app-shell-observability.md` (`defaults_block`). Two follow-ups were agreed and
deliberately deferred:

- A `handleNew()` session superseded by a newer `handleNew()` is made epoch-inert but its fetch is
  NOT aborted — it runs to completion against a form that will ignore it. Only record-load
  neutralization (`handleSelect`/`fetchById`) aborts the in-flight request. The 4s timer does not
  abort either: it only releases the gate, so the request is unbounded, not capped at 4s.
- A mocked Playwright spec covering the `/new` defaults gate and the record-navigation
  (neutralization) path is recommended but not yet written; current coverage is Vitest-only
  (`tools/app-shell/src/hooks/__tests__/useEntity.defaultsRace.vitest.jsx`).

---

## [2026-07-31] ETP-4741 — Initial-callout latch can be consumed before the defaults land (pre-existing, deferred)

**Component:** `tools/app-shell/src/components/contract-ui/DetailView.jsx` — the "fire callouts for
non-dependent selector fields" effect (around L2951-2978).

**Symptom:** on a `/new` route the backend defaults arrive and are merged into the form, but the
initial callout chain (e.g. `businessPartner` → `priceList` / `paymentTerms`) never runs, so the
dependent fields stay empty until the user re-picks a value by hand.

**Root cause:** the effect is latched by `defaultCalloutsTriggeredRef` and arms as soon as
`hook.editing` becomes non-empty *for any reason*. Typing into a plain, non-selector field is
enough: the effect runs, sets the latch, then computes its `triggers` as the selectors filtered by
`hook.editing[s.field]` — still empty, because the defaults have not landed — and fires nothing.
When the defaults merge a moment later the effect re-runs, but `defaultCalloutsTriggeredRef.current`
is already `true`, so it returns immediately. The latch condition tracks "the form has some value"
when what it actually needs is "the defaults have been applied".

**Pre-existing, not introduced by this branch:** verified against the branch base (`85a147423`) —
the effect and its latch condition are byte-identical there; ETP-4741's only change to
`DetailView.jsx` is the one-line `isLoadingRecordForRoute` gate. What ETP-4741 does change is the
exposure window: while `defaultsLoading` is true the new-record form is gated, so typing is
impossible. The only remaining way in is the window between the 4s gate release and a late defaults
response — which is exactly the case the redesigned timeout now keeps alive (the request is no
longer discarded), so the narrowed defect deserves an explicit record rather than silence.

**Why it was not fixed here:** the fix is a one-line change to the latch condition, but it lands in
`DetailView.jsx`, a file that is hot in ETP-4730 / PR #994. Touching it from this branch would
manufacture a merge conflict out of all proportion to a residual, pre-existing defect. A follow-up
ticket carries it.

**Where the fix belongs:** in the latch condition itself — arm on the defaults having actually been
applied (or on a non-empty `triggers` set), not on `editing` merely becoming non-empty. Do **not**
"fix" it by re-introducing the timeout's old discard behavior: that is the regression ETP-4741
removed, and it produced a form with neither defaults nor callouts at all.
## [2026-07-30] ETP-4565 — `contacts` hit the known `AD_Ref_List_Trl` translation-stripping gap

**Follow-up to** "`make regen` Silently Strips es_ES Enum Labels on a DB Missing `AD_Ref_List_Trl` Rows" above (originally documented against `financial-account`, also hit by `goods-shipment`). `contacts` is now a third confirmed occurrence.

**Symptom:** `make regen ONLY=contacts` (as part of adding `entities.customerAccounting.hideDelete`/`entities.vendorAccounting.hideDelete: true` for ETP-4565) silently dropped all 3 `es_ES` labels (`Pendiente`/`Válido`/`No válido`) from `businessPartner.fields.oBTIKVIESStatus.enumValues[].labels` in `contract.json`, and the equivalent inline `labels` keys in the generated `BusinessPartnerForm.jsx` — a field `decisions.json` never touched in this change. The run reported success; only the "AD cache looks STALE" warning hinted at it.

**Fix applied:** did not commit the label loss. Restored the 3 dropped `labels` blocks by hand in `contract.json` (byte-for-byte match to the committed baseline otherwise); `BusinessPartnerForm.jsx` carried no other change from the regen, so it was reverted outright to its committed version via `git checkout --`. The legitimate `hideDelete` additions (in `decisions.json`, `contract.json`'s `entities.customerAccounting`/`entities.vendorAccounting.hideDelete` + `apiPrediction.crud.*.delete: false`, and `contract.mcp.json`) were kept.

**Lesson (reinforcing the original entry):** this sandbox is missing `AD_Ref_List_Trl` es_ES rows for more reference lists than the 4 originally catalogued (`oBTIKVIESStatus`'s reference list is a new one to add to that list). Anyone running `make regen` on `contacts` — or any other window exposing this reference list — should expect and check for this exact symptom before committing.

---

## [2026-07-31] ETP-4565 — Follow-up: pre-push offline drift check flagged `contacts` checksum-only drift, unrelated to the es_ES label bug above

**Component:** none confirmed as a schema_forge bug — most likely the published `@etendosoftware/schema-forge-cli` (`generate-contract.js`) checksum computation, out of scope to fix in this repo.

**Symptom:** `git push` on this branch failed the pre-push hook's offline drift check (mirrors CI's `offline-regen-check.yml`: `make regen-check FROM_CACHE=1` against the pinned published core package + `com.etendoerp.go`'s committed `ETGO_SF_*.xml`, then `git status`). It reported drift on `artifacts/contacts/contract.json`/`contract.mcp.json`: only `checksum` (`e477fa97a11d75f1` → `fc8d658a3248b85d`) and a new `updatedAt` timestamp changed — **zero** structural/content diff anywhere else in either file (confirmed with a full `git diff`, not just a sampled excerpt).

**Investigated as a possible recurrence of the es_ES label-stripping bug above (same window, same session) — ruled out.** Two different regen paths were tried:
1. `make regen ONLY=contacts` (live sandbox DB) — DID reproduce the es_ES label-stripping bug again (dropped the 3 `oBTIKVIESStatus` labels, same `AD_Ref_List_Trl` STALE warning). Reverted via `git checkout --`, not committed. This confirms the sandbox's `AD_Ref_List_Trl` gap for this reference list is still present and anyone re-running a live-DB regen on `contacts` will hit it again.
2. `make regen-check ONLY=contacts FROM_CACHE=1` (the exact command the offline drift check/CI runs — reads the committed AD cache snapshot, not the live sandbox DB) — did **NOT** strip the es_ES labels (the cached snapshot has correct translations) and produced the same isolated checksum/updatedAt-only diff described above. Confirmed **deterministic**: ran twice, got `fc8d658a3248b85d` both times.

**Root cause (partial):** `generate-contract.js`'s `checksumFor()` hashes `JSON.stringify({frontendContract, backendContract, apiPrediction, formState, agentProfile, testManifest})` in whatever key/array insertion order the generator produced that run, but the file actually written to disk goes through a separate canonicalization pass (`reorderKeys`/similar) before serialization. If the generator's internal insertion order for some part of that payload isn't perfectly stable run-to-run (while the *canonicalized* on-disk shape is), two runs can produce byte-identical `contract.json` bodies but different checksums — exactly what was observed here (the currently-committed `contract.json` already had the es_ES labels correctly hand-restored per the entry above; a fresh cached-snapshot regen reproduces that exact body but with a different checksum). Did not chase this further into the checksum algorithm itself since it lives in the published `schema-forge-cli` package (`node_modules/@etendosoftware/schema-forge-cli/src/generate-contract.js`), not this repo — **candidate follow-up for `schema_forge_core`:** make `checksumFor()` hash the same canonicalized/reordered structure that gets written to disk, so the checksum is stable whenever the actual file content is.

**Fix applied:** accepted `make regen-check ONLY=contacts FROM_CACHE=1`'s output wholesale (this is what CI's offline check itself computes, so it is the authoritative "correct" checksum for the currently-committed content) — committed the checksum/`updatedAt` bump on `contract.json` and `contract.mcp.json`. `npx sf-validate-pipeline --scope=contacts`: OK. A subsequent `make regen-check ONLY=contacts FROM_CACHE=1` run produces zero diff, confirming the branch is drift-free.

**Lesson:** a pre-push/CI drift failure that touches ONLY `checksum`/`updatedAt` (no other content) on a window that was recently hand-patched for the es_ES label bug is most likely this checksum-recompute artifact, not a real content regression — verify with a full `git diff` (not a sampled one) before assuming it's the label-stripping bug again, and prefer `make regen-check ONLY=<window> FROM_CACHE=1` (the CI-equivalent, cache-backed command) over a live-DB `make regen` when investigating this specific class of drift, since the live DB reintroduces the unrelated es_ES gap and makes the two issues harder to tell apart.

---

## [2026-08-04] ETP-4718 — `SendDocumentModal`'s "Mensaje" field is hardcoded read-only, platform-wide (known gap, not fixed in this ticket)

**Component:** `tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx` (`EmailFormPanel`)

**Affected windows:** every window that uses the document-send action (`SendDocumentModal`/`EmailFormPanel`) — not specific to any one window. Confirmed present on `return-to-vendor-shipment` while implementing ETP-4718, but the field's `readOnly` flag and its `value` (sourced from a hardcoded empty string) are set unconditionally inside the shared component, so this applies equally to every other document-send window (`sales-invoice`, `sales-order`, `sales-quotation`, `goods-shipment`, `purchase-order`, etc.).

**Symptom:** in the Send Document dialog, the "Mensaje" (Message) field is rendered but not editable — the user cannot type a custom message body before sending.

**Root cause:** `EmailFormPanel` hardcodes the Message field as `readOnly`, with its displayed `value` sourced from a hardcoded empty string, rather than wiring it to editable component state.

**Why it wasn't fixed under ETP-4718:** ETP-4718's Jira acceptance criteria explicitly required the Message field to be "enabled and editable," so this is a known, currently-unresolved gap against that ticket's literal text. It was not fixed here because the fix lives in the shared `SendDocumentModal` component, not in anything scoped to a single window — changing it affects every window that uses document-send (sales-invoice, sales-order, sales-quotation, goods-shipment, return-to-vendor-shipment, purchase-order, etc.), which is out of scope for a single-window ticket. Confirmed independently by three parties: the coordinator (live browser test), Window Agent, and QA (Sentinel).

**Recommendation:** file this as its own ticket. Scope: make the subject/message fields editable in `EmailFormPanel`, then wire the edited body into the send command per the contract command shape documented in `docs/document-email-contract-implementation.md` (note: the current command schema only allows `recipientEdits` as a recipient-related field — sending a free-text message body would need its own allowlisted command field and backend contract support, following the same "browser sends a minimal command, backend resolves/validates" model described there).

**Reference:** `docs/generated-custom-windows/return-to-vendor-shipment.md` — Gap assessment section, ETP-4718 bullet — documents the same limitation from the window's perspective; this entry is the platform-wide, cross-window record of it.
## [2026-08-04] ETP-4685 — List-type (`AD_Ref_List`) grid/filter columns showed English labels regardless of UI language

**Component:** `schema_forge_core`'s `generate-frontend.js` (root cause, fixed in that repo — see its own `docs/feedback.md`/this repo's PR #1023 for the generator-side fix and `buildEnumLabelKey`), plus 3 consumers in this repo: `ProductCustomTable.jsx`, `InlineLinesPanel.jsx`, and the `registry.js` window map (investigation-only finding, no fix needed).

**Symptom:** the "Tipo de producto" (Product Type) Advanced Filter in the Product window showed
`Item`/`Service` in English no matter the active UI language, while the grid column showed
"Servicio" for the same value — coincidentally correct, not a real translation (the AD menu entry
happens to be named "Service", resolved through `useMenuLabel()`'s fallback chain, not through any
actual `ProductType` translation).

**Root cause:** the generator hardcoded each `AD_Ref_List` option's English `Name` directly into
`enumLabels`, instead of an i18n key resolvable per-locale. The Spanish translation already existed
in Etendo's own `AD_Ref_List_Trl` table and was never consulted for this purpose. Fixed at the
generator level with `buildEnumLabelKey(columnName, valueCode)` — keyed by the stable `Value` CODE
(e.g. `productTypeI`), not the mutable `Name`, matching the precedent already used by the
`statuses` section (`rl.value`-keyed). This surfaced **two more consumers of `enumLabels` in this
repo alone**, beyond the generated grid column itself:

1. **`ProductCustomTable.jsx`** (hand-written custom table, duplicates the grid column definition
   because Product overrides the generated table) — had its own hardcoded `enumLabels` with English
   `Name` values, same bug, independent of the generator fix. Patched by hand to the same
   code-keyed convention (`productTypeE/I/R/S`).
2. **`InlineLinesPanel.jsx`** (the grid's **inline-edit** `<select>` for List-type columns — a
   third rendering path, distinct from both the Advanced Filter and the read-only grid cell) — read
   `col.enumLabels[value]` directly as the `<SelectItem>` label **without ever passing it through
   `ui()`**. Before the generator fix this at least showed readable (if wrong-language) English
   text; after the generator fix alone it would have shown the *raw i18n key* (e.g.
   `"productTypeI"`) verbatim to the user — a regression, not a fix, if shipped without touching
   this file too. Root cause specifically: `EditCell` (the component that actually renders the
   `<select>`) never had `ui` in its scope or props — `renderLineCell` had it, but never forwarded
   it down. Fixed by threading `ui` through: `renderLineCell` → `<EditCell ui={ui} />` → destructured
   in `EditCell`'s signature → `{ui(label) ?? label}` for the option text.

**Investigation-only finding (no fix applied, just documenting so it isn't re-investigated):**
`tools/app-shell/src/windows/registry.js` declares `payment-out`, `sales-invoice`, and
`purchase-invoice` **twice** as object keys — once pointing at the `@generated/...` module, later
in the file at a `./custom/.../index.jsx` override. In a plain JS object literal the **later**
key silently wins, so the earlier `@generated` entry for these 3 windows is dead code, never
rendered. This matters for THIS ticket because it means these windows' generated List-type columns
(if any) can never exhibit this bug in practice — the custom table is what actually renders.

**Scope-check lesson (the expensive one):** an initial grep-based sweep for "any window with a
List-type grid/filter column" turned up ~15 candidate windows. Live verification with the Chrome
MCP browser tool against each one (not just re-reading the generated source) showed the *real*
user-visible bug existed in only **2**: `contacts` and `tax`. The rest were false positives for one
of three reasons: (a) already using a hand-written custom table that happened to translate
correctly, (b) shadowed by the registry duplicate-key issue above (dead generated code, never
reached), or (c) not actually reachable as a List-type filter in the current simplified UI. **Do
not treat a grep/static "affected windows" list as the verification step — it is only a candidate
list.** Confirm each one live before spending fix effort on it.

**Drift-risk distinction (separate from the "does the user see a bug today" question):** bumping
`schema_forge_core`'s package pin to get the generator fix affects **every** window with any
List-type grid/filter column when it is next regenerated — roughly 20 windows by the same grep
sweep above, a strict superset of the 2 windows with a live, user-visible bug. A window with no
visible bug today (its List column happens to already resolve correctly some other way, or isn't
reachable) will still show as "drifted" the moment someone else regenerates it after this pin bump,
because its *generated file content* changes even though nothing was visibly broken. This is a
distinct risk from "does it have the bug" and needs its own resolution (regenerate proactively vs.
accept the drift and let the next core-pin-sync task absorb it) — see the ETP-4685 plan file for
the decision point.

**Lesson:** an i18n/label bug in a generated component can have more independently-broken
consumers than the one the bug report describes — the reporter only sees the Advanced Filter and
grid cell, but any custom override (`windows/custom/<x>/...`) or alternate render path
(inline-edit, list-modal, form view) that duplicates `enumLabels` handling must be re-audited
individually; grep for `enumLabels` repo-wide rather than assuming the generator fix alone covers
every place a List-type value's label is displayed.

---

## [2026-08-04] ETP-4685 — Batch-regenerating after a generator fix: correct scoping, a real generator regression found, and ~20 unrelated pre-existing-drift windows that NO existing check will ever catch

**Component:** the regen workflow around a generator-level fix (`generate-frontend.js` in
`schema_forge_core`), plus a real bug in that same fix, plus a gap in this repo's own CI/hook
coverage (`pipeline-validate.yml`, `offline-regen-check.yml`, `.githooks/pre-commit`,
`cli/config/regen-windows.json`) unrelated to ETP-4685 itself but discovered while doing this work.

**What the correct chain of steps actually is, for a `schema_forge_core` generator-level fix:**
1. Fix + publish the generator (`schema_forge_core`, TDD, preview package via `publish-preview.yml`
   or a real release).
2. Bump the pin in the consuming repo (`package.json` + lockfiles for
   `app-shell-core`/`schema-forge-cli`/`schema-forge-core`).
3. **Get the authoritative "which windows changed" list from `sf-validate-pipeline` itself (its F16
   rule — "generated file differs from generator output"), run with NO `--scope`/`--staged`/
   `--changed-since` filter, across the whole repo** — not from a manual grep for the pattern you
   think the fix touches. F16 only needs `contract.json` + `generated/`, so it works even for
   windows with no `decisions.json`. A grep-based candidate list (what this ticket used first) can
   both under- and over-count; the validator's own drift check is the ground truth.
4. From that list, split windows into: (a) actually within this fix's blast radius (confirm by
   diffing what changed — e.g. only `enumLabels` values) vs. (b) pre-existing, unrelated drift that
   already existed before this fix (confirm this split empirically — see the "how we proved it"
   paragraph below — never just by eyeballing the diff).
5. For set (a) only: `make regen ONLY=<comma-separated list>`, review the diff file-by-file (watch
   for the two regressions documented below and in the entry above — this is not a rubber-stamp
   step), run tests, live-verify the windows with a real user-visible bug, commit.
6. Leave set (b) alone and flag it as a separate, out-of-scope problem (see below) — do not fold
   unrelated pre-existing drift into this PR.

**What we actually ran (for the record, since "we just ran `make regen`" undersells what happened):**
NOT a bare `make regen` (which — see below — wouldn't have touched most of set (b) anyway).
`make regen ONLY=<the 27 windows whose generated files literally contain `enumLabels`>` — a list
built by grep, i.e. before we had done step 3 above properly. This produced clean, expected diffs
for 26 of them (one, `financial-account`, also picked up 3 files hit by the already-documented
`AD_Ref_List_Trl` stale-cache label-stripping bug from earlier in this doc — reverted, unrelated to
this fix). We ONLY discovered the ~20-window set (b) afterward, by separately running
`SF_ROOT="$(pwd)" npx sf-validate-pipeline` with no scope at all — a read-only diagnostic, not a
regen — across the whole repo out of general rigor. **`make regen` on those ~20 extra windows was
then attempted and immediately no-opped** ("Skipping N window(s) without decisions.json" / "not in
menu or no windowId: ... / No active windows to process") — confirming set (b) was never written to
by anything we ran; its drift is 100% pre-existing.

**Real generator regression found in step 5 (fixed by hand for now, root cause still open in
`schema_forge_core`):** the fix applies `buildEnumLabelKey(columnName, valueCode)` to BOTH
`type: 'enum'` and `type: 'status'` columns. For genuine `AD_Ref_List`-backed `status` columns
(e.g. `DocStatus`) this is a real improvement. But for **boolean-like synthetic status fields**
(`Processed` Y/N, or `true`/`false` — not `AD_Ref_List` values at all, just a column-name-derived
pseudo-enum) the OLD generator already emitted the correct, working, hand-designed generic keys
(`statusDraft`/`statusProcessed` — see `statusBadge.js`'s `MAP` and the matching, already-translated
`genericLabels` entries). The new fix overwrote those with column-scoped keys
(`processedN`/`processedY`/`processedTrue`/`processedFalse`) that have **no translation anywhere** —
a regression from "correctly translated" to "raw key literally shown to the user", hit in exactly 3
windows (`amortization`, `goods-movements`, `physical-inventory`). Detected by cross-checking every
new key introduced by the batch regen against `genericLabels` in both locale files (163 new keys,
159 already translated from the earlier broad extraction, 4 not — all 4 traced to this one pattern).
Manually reverted those 3 fields to the old, working keys before presenting the diff; the actual fix
(special-case boolean-like/non-`AD_Ref_List` status values in `generate-frontend.js` so they keep
using the shared generic-key convention) is still open in `schema_forge_core`.

**How we proved the ~20-window drift predates this fix (don't just assert it — show it):**
`npm install --no-save` the prior released version (`0.3.24`, the pin before this ticket's bump),
re-ran the same full-repo `sf-validate-pipeline`, and diffed the two violation lists. Every one of
the 22 windows this fix legitimately touches showed up as "fixed by the bump" (violated under
`0.3.24`, clean under the new preview). The ~20 unrelated windows showed **byte-identical**
violations under both versions — proof they have nothing to do with this fix.

**Why no existing check has ever caught the ~20-window drift (all three checked, all three miss it,
confirmed by reading the actual workflow/hook source, not by assumption):**
1. `.githooks/pre-commit` and CI's `pipeline-validate.yml` (on `pull_request`) both scope
   `sf-validate-pipeline` to only what changed (`--staged` / `--changed-since=origin/<base>`
   respectively). These ~20 windows are never part of anyone's diff (no `decisions.json`, mostly not
   in `registry.js` — i.e. dead code, unreachable from the running app), so a scoped check can
   never see them.
2. `pipeline-validate.yml` DOES run unscoped on `push` to `main` — but with
   `continue-on-error: true` ("shadow mode... keeps the job green even with violations") AND its
   PR-comment step is gated on `github.event_name == 'pull_request'`. On the one run where it has
   the right scope, nothing tells a human — the violations sit in an uploaded `validation.json`
   artifact nobody has a reason to open.
3. `offline-regen-check.yml` (mirrors the Jenkins "Offline Regeneration Check" stage) and the local
   `pre-push` hook's drift check both run `make regen(-check)`, which is itself bounded by
   `cli/config/regen-windows.json` — a curated allowlist of 46 window names that structurally
   excludes all ~20 of these (they were presumably left out deliberately, since they have no
   `decisions.json` to regenerate from). Scope is irrelevant here — this check never touches them
   regardless of what changed.

**Root windows affected (orphaned, not part of this fix, no `decisions.json`, mostly unregistered —
likely leftover from an early CRM/HR exploratory extraction pass):** `absence`, `activity`,
`bom-production`, `bp-location`, `commission`, `commission-payment`, `cost-adjustment`, `deal`,
`document`, `employee`, `inventory-quality-inspection`, `landed-cost`, `lead`,
`manage-requisitions`, `packing`, `project`, `recurring-invoice`, `requisition`,
`stock-reservation`, `time-tracking`, `uom`, `warehouse-picking-list`, `warehouse-storage-bins`.
Spot-checking a few (`absence`, `activity`, `document`, `employee`) by reproducing the current
generator's output in `/tmp` (not committed) and diffing against the committed file shows the drift
predates even ETP-4603's `forwardRef`/`InlineLinesPanel` inline-edit pattern and the
`@sf-generated-start/end` marker convention — this is many generator generations of drift, not one.

**Lesson:** after any `schema_forge_core` generator change, use the FULL, unscoped
`sf-validate-pipeline` run as the authoritative discovery mechanism for "what needs regen" — not a
grep for the pattern you think you changed (grep undercounted here: it missed nothing extra in this
case, but there's no guarantee it always will) and not an assumption that CI/hooks would have caught
unrelated drift already (they structurally cannot, for three independent reasons above). Treat any
window with no `decisions.json` as out of scope for a normal fix-and-regen task — regenerating it
requires first deciding whether to adopt it into the real pipeline at all, which is its own,
separate piece of work.
