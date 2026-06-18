# Mixed Currencies Per Line — Option B Design (Confirmed Findings)

**Date:** 2026-06-16 (last updated 2026-06-17)
**Branch:** `feature/ETP-4027` (schema_forge) + `feature/ETP-4027` (com.etendoerp.go)
**Status:** Design alignment in progress. Findings below are code-verified.

---

## 1. Conceptual Model (User-Confirmed)

> The header currency is **a conversion criterion** for new lines being added. It is NOT an attribute of the order's stored amounts.
>
> Each line, once saved, stores its currency and its amount **as a number that the user consented to** at save time. The amount is the result of whatever conversion the user accepted in real time when they saved.
>
> `C_ORDER.GRANDTOTAL` is the **raw arithmetic sum** of line `LINENETAMT` values produced by the existing trigger `C_ORDERLINE_TRG2:224-227`. It is intentionally a number, not "an amount in a specific currency". The user accepts this semantic.
>
> If the user wants to see the order total in a specific currency for context, Go does that conversion in the UI at display time.

This model **accepts the trigger's blind SUM as the truth**, eliminating the conversion complexity that would otherwise require rewriting `C_ORDER_POST1`, `C_INVOICE_POST`, `C_ORDERTAX`, etc.

---

## 2. Lifecycle Example (User-Confirmed Flow)

| Paso | Acción del usuario | Estado en BD |
|------|-------------------|--------------|
| 1 | Crea pedido. Header default = USD (org currency). | `C_ORDER.C_CURRENCY_ID = USD` |
| 2 | Agrega Línea 1: pricelist devuelve 100 USD. Guarda. | `LINE 1: PRICEACTUAL=100, C_CURRENCY_ID=USD, LINENETAMT=100` <br> `GRANDTOTAL=100` |
| 3 | Empieza Línea 2 (sin guardar): selecciona producto, pricelist devuelve 50 USD. | Nada en BD aún. UI muestra 50 USD en el form. |
| 4 | Cambia header de USD a EUR. La Línea 2 (sin guardar) se convierte USD→EUR: `50 × (1/1.10) ≈ 45.45 EUR`. | `C_ORDER.C_CURRENCY_ID = EUR`. Línea 1 sigue en BD como estaba (100 USD). |
| 5 | Guarda Línea 2. | `LINE 2: PRICEACTUAL=45.45, C_CURRENCY_ID=EUR, LINENETAMT=45.45` <br> Trigger: `GRANDTOTAL = 100 + 45.45 = 145.45` |
| 6 | Completa el pedido. | `C_ORDER_POST1` ejecuta sobre los valores existentes (no recomputa totales). |

El número `145.45` en `C_ORDER.GRANDTOTAL` es el sumando crudo. No representa "145.45 EUR". Es el número del pedido. Go puede mostrar al usuario la conversión a la moneda que elija (USD: ≈150, EUR: ≈136, mixto: "100 USD + 45.45 EUR").

---

## 3. Code-Verified Findings

### 3.1 The trigger restriction to remove

**File:** `src-db/database/model/triggers/C_ORDER_CHK_RESTRINCTIONS_TRG.xml:55-64`

```sql
IF (COALESCE(:OLD.C_BPartner_ID, '0')!=COALESCE(:NEW.C_BPartner_ID, '0'))
OR (COALESCE(:OLD.M_PriceList_ID,'0') != COALESCE(:NEW.M_PriceList_ID,'0'))
OR (COALESCE(:old.C_Currency_ID, '0') != COALESCE(:NEW.C_Currency_ID, '0')) THEN
  SELECT COUNT(*) INTO v_n FROM C_ORDERLINE WHERE C_Order_ID = :NEW.C_Order_ID;
  IF v_n>0 THEN
    RAISE_APPLICATION_ERROR(-20000, '@20502@');
  END IF;
END IF;
```

**Change required:** remove `C_Currency_ID` from the disjunction.

**`M_PriceList_ID` check decision:** NOT removed. Code verification: in the current frontend flow (`DetailView.jsx:2278-2280`), the pricelist is only touched when the user manually edits the `priceList` field — there is no automatic pricelist change triggered by a currency change. The conversion path uses the pricelist's price as the source value and applies the rate. The pricelist stays the same. Therefore the `M_PriceList_ID` check never fires in our flow.

### 3.2 Frontend conversion logic — already correct

**File:** `tools/app-shell/src/components/contract-ui/DetailView.jsx`

Verified by direct read:

| Code section | Lines | Behavior |
|--------------|-------|----------|
| Refs declaration | 1885-1893 | `pendingCurrencyConversionRef`, `activeCurrencyConversionRef`, `lineOriginalBasePriceRef` |
| Reset on record change | 1898-1903 | Refs cleared when `recordId` changes |
| Capture on currency change | 2268-2276 | When user changes `currency` field, captures `{ from: baseCurrency, to: newCurrency }`. `baseCurrency` is anchored to the very first currency, not the previous one — avoids drift on chained conversions (USD→EUR→GBP always converts from USD) |
| Apply conversion after callout | 2177-2235 | Fetches rate via `validate-exchange-rate?fromCurrency=base&toCurrency=value`, multiplies: `newPrice = basePrice * rate` |
| Apply to new lines after currency change | 2367-2385 | When a new product is selected with an active conversion, applies the rate to the pricelist's price |

**Direction is correct for the user's flow** (USD → EUR is `value × (USD→EUR rate)`).

**No changes required in this file** for the conversion mechanics. Only the `saveCurrencyBeforeLines` workaround may need to be revisited once the trigger restriction is lifted (it was a workaround for the restriction; without the restriction, the flow simplifies).

### 3.3 The `C_ORDERLINE` line triggers

**Files:** `C_ORDERLINE_TRG.xml` (read in full) and `C_ORDERLINE_TRG2.xml:93-98`

The triggers read **only** the following from the header (lines 175-180 of `C_ORDERLINE_TRG.xml`):

```sql
SELECT stdPrecision, m_pricelist.istaxincluded, priceprecision,
       M_WAREHOUSE_ID, C_BPARTNER_LOCATION_ID, C_PROJECT_ID
  INTO v_prec, v_istaxincluded, v_price_prec, ...
 FROM c_order
        JOIN c_currency ON c_order.c_currency_id = c_currency.c_currency_id
        JOIN m_pricelist ON c_order.m_pricelist_id = m_pricelist.m_pricelist_id
 WHERE C_Order_ID = v_ID;
```

Used for:
- `v_prec` (stdPrecision): line 188 (`line_gross_amount := ROUND(... , v_prec)`), 220, 225, 235, 247, 253 (`LineNetAmt := ROUND(QtyOrdered*PriceActual, v_prec)`), 256, 257
- `v_price_prec` (priceprecision): lines 229, 237 (computing `PriceActual` from net)
- `v_istaxincluded` (from pricelist): branch selector
- `M_WAREHOUSE_ID`, `C_BPARTNER_LOCATION_ID`, `C_PROJECT_ID`: not currency related

**Confirmed: precision lookup only. No conversion. No recalculation that depends on the line's own currency.**

**Implication for Option B:**
- For "normal" currencies (USD, EUR, GBP, etc., all 2 decimals): no precision mismatch issue. Trigger works as expected for mixed-currency lines.
- For currencies with different decimal precision (JPY=0dp, BHD/KWD=3dp): the trigger would round a line in EUR (2dp) using JPY precision (0dp) when the header is JPY. **This is a real precision mismatch that would cause silent data loss for those currencies.** Not relevant if those currencies are out of scope.

### 3.4 Where line.currency is forced = header.currency

Verified by exhaustive search:

| File:line | When it fires | Affects NEO? |
|-----------|---------------|--------------|
| `OrderCreatePOLines.java:119` | Classic action "Create PO Lines" | NO — NEO doesn't invoke this |
| `SRMOPickEditLines.java:162` | Classic action "SRMO Pick Edit Lines" | NO |
| `RMInsertOrphanLine.java:135` | Classic action "Insert Orphan Line" | NO |
| `UpdateOrderLineInformation.java:115` | Copy-from-order policy hook | NO (uses source line's currency, not header) |
| `C_ORDER_POST1.xml:1081` | Discount line insert during completion | Only for the discount line — uses header currency. Existing lines untouched |

**No database trigger** enforces line.currency = header.currency.
**No event handler** syncs currency. Verified `OrderEventHandler.java:58-140` (syncs only OrderDate, ScheduledDeliveryDate, Warehouse).
**No NEO handler** enforces currency divergence rejection.

**Conclusion:** NEO can send a PATCH/POST with `C_ORDERLINE.C_CURRENCY_ID = EUR` while `C_ORDER.C_CURRENCY_ID = USD`, and the system will accept it. The DB column allows it. The DAL doesn't block it. No event handler corrects it.

### 3.5 `GRANDTOTAL` / `TOTALLINES` computation

**Single write path:** `C_ORDERLINE_TRG2.xml:224-227` (and `:241-244` for DELETE).

```sql
UPDATE C_Order
SET TotalLines = ... TotalLines - v_oldLine + v_newLineNetAmt ...
    GrandTotal = ... GrandTotal - v_oldgrossamt + v_newgrossamt ...
WHERE C_Order_ID = :new.C_Order_ID;
```

**Pure arithmetic delta. No currency conversion.** This is the behavior the user's model accepts as the truth.

`C_ORDER_POST1.xml` (full read of 2036 lines) does **NOT** recompute `GRANDTOTAL` or `TOTALLINES` at completion. There is no `SET GrandTotal=` or `SET TotalLines=` anywhere in the file. Whatever the trigger accumulated is what completion processes.

### 3.6 EM_* extension fields in classic

EM_* columns added via `AD_COLUMN.xml` do NOT appear in classic windows unless `AD_FIELD.xml` entries exist. `com.etendoerp.go` currently has 8+ `EM_ETGO_*` columns with **zero `AD_FIELD` entries** — all invisible in classic by default.

**Implication:** if we need EM_* fields for our model, they're invisible in classic by default. We don't need them for the Option B model (see section 6.4 — no per-line currency UI), but if we add them later, no classic impact.

---

## 4. Side Effects — User-Confirmed Acceptable

The trigger's blind SUM produces a `GRANDTOTAL` that is a raw number. Downstream consumers interpret it as if it were in `C_ORDER.C_CURRENCY_ID`. The user has explicitly confirmed each of these is acceptable:

| # | Side effect | Status |
|---|-------------|--------|
| 1 | `C_ORDER_POST1.xml:1081` inserts discount line in header currency, computed from `SUM(LINENETAMT)` of mixed-currency lines | **Acceptable** |
| 2 | `C_ORDERTAX` aggregates `SUM(linenetamt)` and `SUM(tax)` across mixed-currency lines without conversion. This feeds Verifactu / AEAT / accounting | **Acceptable in principle** |
| 3 | `C_ORDER_POST1.xml:1786-1910` creates payment schedule cuotas using `GRANDTOTAL` in `C_ORDER.C_CURRENCY_ID` | **OK** |
| 4 | Accounting posting uses `GRANDTOTAL` as receivable amount in `C_ORDER.C_CURRENCY_ID` | **No problem** |

These acceptances are key to keeping the implementation scope manageable. The user-side rationale: the order's "true total" is what Go computes and displays; the classic-side number is informational/internal.

---

## 5. Final Change List (Code-Verified, User-Aligned)

### 5.1 Core changes (etendo_core_pg)

| # | File | Change | Status |
|---|------|--------|--------|
| C-1 | `src-db/database/model/triggers/C_ORDER_CHK_RESTRINCTIONS_TRG.xml:55-64` | Remove `C_Currency_ID` from the disjunction. Keep `C_BPartner_ID` and `M_PriceList_ID` checks. | **DONE (2026-06-17)** |

That is the **only** required core change. All other work is on the Etendo Go side (NEO + Schema Forge).

### 5.2 NEO changes (com.etendoerp.go)

| # | File | Change |
|---|------|--------|
| N-1 | `AbstractOrderHeaderHandler.java:429-487` | **REMOVE** `blockCompleteWhenNoExchangeRate()`. Validation moves to the currency-change moment in the frontend. See section 6.1 (Q2 resolved). |
| N-2 | `AbstractOrderHeaderHandler.java:114-140` | **REMOVE** `validateExchangeRateBeforeComplete()` (invoice equivalent). Same rationale. |
| N-3 | `AbstractOrderHeaderHandler.java` (handler chain) | Remove the corresponding pre-hook wiring that calls N-1 and N-2 (locations around lines 56-67 in `SalesOrderHeaderHandler.handle()` and equivalents in invoice/purchase handlers). |

### 5.3 Frontend changes (etendo_schema_forge)

| # | File | Change |
|---|------|--------|
| F-1 | `tools/app-shell/src/components/contract-ui/DetailView.jsx` | Revisit the `saveCurrencyBeforeLines` workaround (line 1295, 1564, 1583, 3185-3186). With the trigger restriction lifted, the `flushAndSave` inversion (save header before lines) is no longer needed. The currency change can proceed normally on any draft order. |
| F-2 | `tools/app-shell/src/components/contract-ui/DetailView.jsx` | Re-evaluate `displayLogicWithCurrencyLock` (line 1459). Currently locks the currency field when committed lines exist. Under the new model, the currency field should be editable always. |
| F-3 | `tools/app-shell/src/components/contract-ui/DetailView.jsx:2204-2233` | **NEW:** when `validate-exchange-rate` returns `hasRate=false`, show error toast/banner AND revert the currency field to the previous value. Currently the code silently clears `activeCurrencyConversionRef` and continues — must change to active failure. See section 6.1 (Q2 resolved). |
| F-4 | `tools/app-shell/src/locales/en_US.json`, `es_ES.json` | Add `noConversionRateError` translation key. |
| F-5 | `artifacts/sales-order/decisions.json`, `artifacts/purchase-order/decisions.json` | If `saveCurrencyBeforeLines` prop is removed, drop it from decisions.json. |

**NOT needed (verified):**
- `tools/app-shell/src/lib/documentTotals.js` — no change. The raw sum is the truth under the model.
- Informational total in org currency — already implemented in `OrderPreview.jsx:99-110` and `QuotationPreview.jsx:66`. See section 6.1 (Q3 resolved).

### 5.4 Things explicitly NOT to change

| Component | Reason |
|-----------|--------|
| `C_ORDERLINE_TRG.xml` | Blind LINENETAMT compute is correct under the new model |
| `C_ORDERLINE_TRG2.xml` | Blind GRANDTOTAL sum is acceptable per user |
| `C_ORDER_POST1.xml` (any part) | Operates on existing values, doesn't recompute totals |
| `C_INVOICE_POST.xml` (any part) | Same |
| `C_ORDERTAX` schema | Acceptable to remain currency-less per user |
| Per-line currency UI display | User does not want it; values shown are "the agreed amount" |

---

## 6. Open Items & Resolved Questions

### 6.1 Resolved questions

**Q1 — Precision when currency changes (RESOLVED).**
The trigger `C_ORDERLINE_TRG` reads precision from the header currency. When the user changes from USD to EUR (or any other), the new currency's precision applies going forward. This is **correct under the model**: the user explicitly chose the new currency, so its precision is the active context.

Critically, the trigger only fires its rounding logic when a relevant line field changes (`C_ORDERLINE_TRG.xml:60-73` early-return guard). If the user changes the header currency but does NOT add or edit a line, no trigger fires on existing lines — their stored values stay exactly as they were. Conversion (and rounding) only happens for new lines or explicit edits, which by definition are user-consented actions.

**Conclusion:** there is no silent data loss on existing lines. Precision changes only affect new operations after the currency change. Closed as non-issue.

**Q3 — Informational total in org currency (RESOLVED).**
Already implemented in the preview view. Verified in code:
- `tools/app-shell/src/windows/custom/shared/OrderPreview.jsx:99-110` — uses `useDocumentCurrency` hook and computes `orgGrandTotal = convertAmount(order?.grandTotalAmount)`, passed to `OrderGeneralTab` as informational.
- `tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx:66` — same pattern.

The preview shows: order total in document currency + equivalent in org currency.

**Conclusion:** no work needed. The user's "vista resumen muestra el total y ademas la conversion a la moneda de la organizacion a modo informativo" is already in place.

### 6.2 Pending decisions

**Q2 — Status of `blockCompleteWhenNoExchangeRate` / `validateExchangeRateBeforeComplete` (RESOLVED).**

**Decision:** the rate validation moves from **completion time** to **currency change time**.

**Rationale:** validating at completion is the wrong moment. By then the user has already entered all lines (potentially with conversions that succeeded because the rate existed earlier or for a different date). Validating at the moment the user changes the currency field is precise:
- The user sees the error at the moment they took the decision.
- The change is cancelled before any line is touched.
- The previous currency is preserved as the "last known good" state.

**New behavior:**
- When the user changes the header currency from `currentCurrency` to `newCurrency`:
  - Fetch rate `currentCurrency → newCurrency` (with inverse fallback already provided by `NeoExchangeRateService.java:106-110`).
  - If no rate exists: show error message "no conversion rate defined between `currentCurrency` and `newCurrency` for `<orderDate>`". **Cancel the change.** Currency field reverts to `currentCurrency`.
  - If rate exists: apply the conversion to the pending line (existing behavior) and commit the new currency.

**Locations to update:**

| File | Action |
|------|--------|
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java:429-487` (`blockCompleteWhenNoExchangeRate`) | **REMOVE.** No longer needed — validation happens earlier. |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java:114-140` (`validateExchangeRateBeforeComplete`) | **REMOVE** (invoice equivalent of the order check). |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx:2204-2233` | **EXTEND.** Today, when `validate-exchange-rate` returns `hasRate=false`, the code just clears `activeCurrencyConversionRef` silently and continues. Change this to: surface an error message to the user AND revert the currency field via `hook.handleChange('currency', previousCurrency)`. Block the conversion application. |

The error message text and i18n key should be added to `en_US.json` and `es_ES.json`. Suggested keys: `noConversionRateError` with body referencing `{from}`, `{to}`, `{date}`.

### 6.3 Other open items

- Migration: existing orders are all single-currency. Do we need any migration step, or does the new behavior apply prospectively only? (Likely prospective only — no migration needed since stored amounts don't change semantically.)

---

## 7. Code Citations (Verified)

| File | Line(s) | Purpose |
|------|---------|---------|
| `src-db/database/model/triggers/C_ORDER_CHK_RESTRINCTIONS_TRG.xml` | 55-64 | The trigger to relax |
| `src-db/database/model/triggers/C_ORDERLINE_TRG.xml` | 175-180, 188, 220, 225, 229, 235, 237, 243-248, 253, 256-257 | Precision lookup + LINENETAMT compute |
| `src-db/database/model/triggers/C_ORDERLINE_TRG2.xml` | 93-98, 214-227, 241-244 | Tax aggregation + GRANDTOTAL update |
| `src-db/database/model/functions/C_ORDER_POST1.xml` | 159-166, 793-861, 1026-1101, 1786-1910, 1960-1962 | Completion processing |
| `src-db/database/model/functions/C_INVOICE_POST.xml` | 218-222, 1303-2066 | Invoice completion (same pattern as ORDER_POST1) |
| `src/org/openbravo/common/actionhandler/OrderCreatePOLines.java` | 119 | Classic action forces line.currency = header.currency (does not affect NEO) |
| `src/org/openbravo/common/actionhandler/SRMOPickEditLines.java` | 162 | Same |
| `src/org/openbravo/common/actionhandler/copyfromorderprocess/UpdateOrderLineInformation.java` | 115 | Same |
| `src/org/openbravo/erpCommon/ad_actionButton/RMInsertOrphanLine.java` | 135 | Same |
| `src/org/openbravo/event/OrderEventHandler.java` | 58-140 | Confirmed does NOT sync currency |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java` | 85-140, 429-500 | NEO pre-hooks; rate validation logic |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoCrudHandler.java` | 104, 225, 627 | CRUD dispatch (does not force currency) |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoProcessService.java` | 770-815 | Invokes `C_Order_Post` for completion |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoExchangeRateService.java` | 36-37, 67-119, 125-154 | Rate lookup endpoint |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/CreateDraftInvoiceHandler.java` | 125, 476, 560-585 | Custom Java invoice creation |
| `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/OrderLineHandler.java` | (whole) | Tax-inclusive price normalization; does NOT enforce currency |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx` | 1295, 1564, 1583, 1885-1907, 2177-2235, 2268-2280, 2367-2385 | Existing conversion logic |
| `tools/app-shell/src/lib/documentTotals.js` | 73-92 | Currency-blind sum (acceptable under new model) |
| `tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js` | 20-88 | `convertAmount = amount × exchangeRate`, fetches `from=docCurrency, to=orgCurrency` |

---

## 8. Action Plan

**Scope decision (2026-06-17, confirmed with functional analyst):** All functionality is on the Etendo Go side. No new functionality goes into classic. The only core change is C-1 (already done), which is a removal of a restriction, not addition of behavior.

### Phase 0 — Core prerequisite (DONE 2026-06-17)

| Task | File | Status |
|------|------|--------|
| C-1 | `etendo_core_pg/src-db/database/model/triggers/C_ORDER_CHK_RESTRINCTIONS_TRG.xml:55-64` — remove `C_Currency_ID` clause | DONE |

Validation performed manually: USD order with saved line, change currency to EUR with rate available, add EUR line, complete — works. Trigger no longer blocks.

### Phase 1 — Backend Go (parallel with Phase 2)

| Task | File | Action |
|------|------|--------|
| N-1 | `com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java:429-487` | Delete method `blockCompleteWhenNoExchangeRate()`. |
| N-2 | `com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java:114-140` | Delete method `validateExchangeRateBeforeComplete()`. |
| N-3 | `com.etendoerp.go/src/com/etendoerp/go/schemaforge/SalesOrderHeaderHandler.java:56-67` | Remove invocation of N-1 pre-hook. |
| N-3 | `com.etendoerp.go/src/com/etendoerp/go/schemaforge/SalesInvoiceHeaderHandler.java` + `PurchaseInvoiceHeaderHandler.java` | Same for invoice handlers. |
| N-4 | `AbstractOrderHeaderHandler.java` | Clean up unused imports (`Connection`, `PreparedStatement`, `ResultSet`, `OBCurrencyUtils`, etc. — only if they were only used in N-1/N-2). |
| N-5 | Java JUnit tests | Delete tests covering the removed methods; fix any tests that break. |

### Phase 2 — Frontend (parallel with Phase 1)

| Task | File | Action |
|------|------|--------|
| F-1 | `tools/app-shell/src/components/contract-ui/DetailView.jsx:1295, 1564, 1583, 3185-3186` | Remove `saveCurrencyBeforeLines` prop and `flushAndSave` inversion logic. |
| F-2 | `tools/app-shell/src/components/contract-ui/DetailView.jsx:1459` | Remove `displayLogicWithCurrencyLock`. Currency field always editable. |
| F-3 | `tools/app-shell/src/components/contract-ui/DetailView.jsx:2204-2233` | **NEW:** when `validate-exchange-rate` returns `hasRate=false`, show error toast/banner using `ui('noConversionRateError', {from, to, date})` AND revert currency field via `hook.handleChange('currency', previousCurrency)`. Block conversion application. |
| F-4 | `tools/app-shell/src/locales/en_US.json` + `es_ES.json` | Add `noConversionRateError` translation key. |
| F-5 | `artifacts/sales-order/decisions.json` + `artifacts/purchase-order/decisions.json` | Remove `"saveCurrencyBeforeLines": true`. |
| F-6 | `cli/src/resolve-curated.js` (`WINDOW_BOOLEAN_TRUE_PROPS`) + `cli/src/generate-frontend.js` | Remove `saveCurrencyBeforeLines` from whitelist and generator. Dead code. |
| F-7 | After F-5/F-6 | Run `make regen ONLY=sales-order,purchase-order PUSH_TO_NEO=1` to regenerate contracts and components. Then `./gradlew export.database` in Etendo root. |

### Phase 3 — Tests

**Unit (Vitest):**

| File | Coverage |
|------|----------|
| `tools/app-shell/src/components/contract-ui/__tests__/DetailView.currency.vitest.jsx` | Add case: rate not available → error shown + currency field reverted |
| `tools/app-shell/src/windows/custom/shared/__tests__/useDocumentCurrency.vitest.jsx` | Verify existing tests still pass |

**E2E (Playwright):**

| File | Scenario |
|------|----------|
| `e2e/tests/flows/sales-order-currency.mocked.spec.js` (new) | Full flow: create order USD, add line 100 USD, change to EUR, add line (converted to 45.45 EUR), complete. Verify GRANDTOTAL = 145.45. |
| `e2e/tests/flows/sales-order-currency-no-rate.mocked.spec.js` (new) | Change to currency without conversion rate → error + revert to previous currency. |

**Delegate to Tester subagent** per CLAUDE.md (`subagent_type="general-purpose"`, identity from `.claude/agents/test-generator.md`). Read `docs/e2e-testing-guide.md` first. Reference: `e2e/tests/flows/row-quick-actions.mocked.spec.js`.

### Phase 4 — Documentation

| File | Change |
|------|--------|
| `docs/generated-custom-windows/sales-order.md` | Add section on currency change behavior, functional currency model, in-line validation, preview informational total |
| `docs/generated-custom-windows/purchase-order.md` | Same |
| `docs/generated-custom-windows/sales-invoice.md`, `purchase-invoice.md` | If applicable, note removal of completion-time rate validation |
| `docs/ui-customization.md` | Remove `saveCurrencyBeforeLines` reference if present |
| `docs/plans/2026-06-16-currency-functional-model-analysis.md` (this file) | Mark as completed and move to `docs/plans/completed/YYYY-MM-DD/` when done |

**Delegate to Sage (documentarian)** per CLAUDE.md.

### Phase 5 — Deploy and validation

| Step | Command / Action |
|------|------------------|
| 1 | `./gradlew update.database` in Etendo root (C-1 already applied — verify) |
| 2 | `make regen ONLY=sales-order,purchase-order PUSH_TO_NEO=1` |
| 3 | `./gradlew export.database` |
| 4 | UI build (commit-time per repo policy) and deploy via dedicated UI container |
| 5 | End-to-end manual smoke test on Go with `goadmin@etendo.software`, reference invoice 1000071 or fresh order |
| 6 | Verify `OrderEventHandler`, `OrderLineEventHandler` not broken by the changes |
| 7 | Create PR against `epic/ETP-3504` with commit `Feature ETP-4027: Functional currency model — remove trigger restriction and rate validation` |

### Execution order

```
Fase 0 (DONE) ──┐
                │
                ├──> Fase 1 (Backend Go) ──┐
                │                          │
                └──> Fase 2 (Frontend)  ──┤
                                           │
                                           v
                                      Fase 3 (Tests)
                                           │
                                           v
                                      Fase 4 (Docs)
                                           │
                                           v
                                      Fase 5 (Deploy + PR)
```

### Estimate

- Phase 0: DONE
- Phase 1: 2-3 hours
- Phase 2: 4-6 hours
- Phase 3: 4-6 hours (delegated to Tester)
- Phase 4: 2-3 hours (delegated to Sage)
- Phase 5: 1-2 hours

**Total remaining: 1-2 sprints depending on parallelization and review cycles.**

### Definition of Done

- [ ] Currency change on draft order with saved lines works without error
- [ ] Currency change to currency without rate → error visible + field reverted to previous value
- [ ] Complete order with mixed-currency lines does not fail in `C_ORDER_POST1`
- [ ] Complete invoice with mixed-currency lines does not fail in `C_INVOICE_POST`
- [ ] Preview shows raw `GRANDTOTAL` + org-currency equivalent (already implemented)
- [ ] No remaining code for `saveCurrencyBeforeLines` or `displayLogicWithCurrencyLock`
- [ ] No remaining code for `blockCompleteWhenNoExchangeRate` or `validateExchangeRateBeforeComplete`
- [ ] Unit tests green
- [ ] E2E flow tests green
- [ ] Documentation updated under `docs/generated-custom-windows/`
- [ ] PR merged to `epic/ETP-3504` in both `etendo_core_pg`/`com.etendoerp.go` and `etendo_schema_forge` repos

---

## 9. Deviations from the Original Plan (2026-06-18)

During implementation and manual testing, several model simplifications and additional fixes emerged that were not in the original plan. This section documents everything that happened outside Phases 1-2 as originally drafted.

### 9.1 Model simplification — drop real-time conversion of unsaved lines

**Trigger:** functional analyst review on 2026-06-18.

**Original plan (Phases 1-2 as written):** kept the existing flow where, if the user changed the header currency while having an unsaved pending line, the pending line's price was converted in real time before save.

**New decision:** real-time conversion of unsaved pending lines is no longer supported. Conversion applies **only** to lines created AFTER the user has saved the header currency change. The active conversion rate is derived from `C_ORDER.C_CURRENCY_ID` as persisted in the DB, not from the in-progress form state.

**Rationale:** simpler mental model for the user (no surprises mid-edit), simpler code path (no need to manage pending-conversion state across async callouts), and aligns with the broader "saved state is the truth" principle.

**Code removed (DetailView.jsx):**
- Ref `pendingCurrencyConversionRef` (used to carry conversion intent across async callout boundary)
- Ref `lineOriginalBasePriceRef` (used for revert of pending-line price)
- The on-addingLine-close reset effect that cleared `lineOriginalBasePriceRef`
- The block in the callout response handler (lines ~2126-2200 pre-refactor) that applied conversion to the in-progress add-row when the currency changed
- The capture-on-change block in `handleChangeWithCallout` (lines ~2229-2237 pre-refactor) that staged a `pendingCurrencyConversionRef`

**Code kept and reused for the simplified model:**
- Ref `activeCurrencyConversionRef` — now only set by the sync effect (see 9.2 below)
- The in-place conversion in `handleLineFieldChange` when a product is selected (see 9.3 below)
- The rate validation in `handleChangeWithCallout` (see 9.4 below)

### 9.2 New: bootstrap / sync effect on saved state

**Added:** a `useEffect` in `DetailView.jsx` that re-evaluates `activeCurrencyConversionRef` whenever `hook.selected?.currency` changes (typically after a save). It:

1. Reads the org base currency ID from `/sws/neo/{spec}/header/session` (new field `currencyId`, see 9.6).
2. Compares with `hook.selected.currency` (the saved order currency).
3. If equal → clears the ref (no conversion needed).
4. If different and rate exists → sets `{baseCurrency: orgId, toCurrency: docId, rate}`.
5. If different and rate not available → clears the ref (the dropdown validator should prevent this state from being reachable, but the effect handles it gracefully).

This is what made the user's primary scenario work: user creates order in EUR (org), saves, changes to USD, saves, adds line → the line's pricelist price is converted because the sync effect re-fired on `hook.selected.currency` going from EUR to USD.

### 9.3 New: in-place mutation in product-callout conversion block

**Bug discovered post-Phase 2 (Task #18):** the conversion block in `handleLineFieldChange` was using `primaryAddRowRef.current?.setFieldValues(...)` as a side-channel to push converted values onto the row. But the downstream `applyUpdates(result, forceFields)` ran AFTER and pushed the original (unconverted) `result` to the form state — overwriting the conversion.

**Root cause:** race between two writers to the same form fields. setFieldValues was logically first but applyUpdates was last-write-wins.

**Fix:** mutate `result` in place inside the conversion block:
```js
result[lineConfig.priceField] = convertedPrice;
if (result.standardPrice != null) result.standardPrice = convertedPrice;
if (result.unitPrice != null) result.unitPrice = convertedPrice;
if (result.listPrice != null) result.listPrice = convertedPrice;
```
Then `applyUpdates(result, ...)` naturally pushes the converted values. No race.

### 9.4 Line currency override (fix for sub-bug discovered 2026-06-18)

**Bug:** even after Bug #18 was fixed (price now converted), inspection in the DB showed `C_ORDERLINE.C_CURRENCY_ID = 102 (EUR)` on a line that was added to an order in USD. The line's price was correct (converted to USD-equivalent) but its declared currency was EUR (inherited from the pricelist via callout `SL_Order_Product`).

**Two-part fix:**

**Part A (frontend):** in the conversion block in `handleLineFieldChange`, also override `result.currency` and `result['currency$_identifier']` to match the order header's currency:
```js
result.currency = toCurrency;
const headerCurrencyIdentifier = hook.selected?.['currency$_identifier']
  ?? hook.editing?.['currency$_identifier'];
if (headerCurrencyIdentifier) {
  result['currency$_identifier'] = headerCurrencyIdentifier;
}
```

**Part B (SF config):** `ETGO_SF_FIELD.IsReadOnly` was `Y` for `sales-order.lines.currency` and `purchase-order.lines.currency` — meaning `NeoFieldFilter` silently stripped the `currency` field from PATCH bodies. Frontend override alone didn't reach the DB.

Added explicit entries in `decisions.json`:
```json
"currency": {
  "visibility": "editable",
  "grid": false,
  "form": false
}
```

- `editable` → push-to-neo sets `IsReadOnly=N` so the field is accepted in PATCH bodies
- `grid: false, form: false` → invisible to the user (no per-line currency editor); only the conversion logic sets it

Applied to both `artifacts/sales-order/decisions.json` and `artifacts/purchase-order/decisions.json`. Required a `make regen PUSH_TO_NEO=1` to propagate to DB and `./gradlew export.database` to persist in `ETGO_SF_FIELD.xml`.

### 9.5 Bug #17 — currency change not persisting on saved orders

**Symptom:** PATCH with `currency: USD` returned 200 OK but response/DB still showed EUR.

**Root cause:** identical mechanism as 9.4 Part B — `ETGO_SF_FIELD.IsReadOnly = Y` for `sales-order.header.currency` and `purchase-order.header.currency`. The DB state was stale relative to `decisions.json` (which already said `editable`). The PATCH body had `currency: 100` but `NeoFieldFilter.filterWriteRequest()` stripped it silently.

**Fix:** ran `make regen PUSH_TO_NEO=1` to sync the contract state to the DB. After sync, both header currency fields became `IsReadOnly=N`.

**Note:** when a `./gradlew update.database -Dforce` was later run, it reverted these to `Y` from the committed XML. A second `push-to-neo` was required to restore, followed by `./gradlew export.database` to persist the change in `ETGO_SF_FIELD.xml`.

### 9.6 `NeoSessionService` — `currencyId` added to `/session` response

**File:** `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoSessionService.java`

The `/session` endpoint previously returned only `currencyCode` (ISO 4217 string). The sync effect (9.2) needs to compare currency IDs (matching the `hook.selected.currency` format which is a UUID/legacy ID). Added a new field `currencyId` to the response:

```java
private static final String KEY_CURRENCY_ID = "currencyId";
// ...
currencyId = OBCurrencyUtils.getOrgCurrency(orgId);
// ...
body.put(KEY_CURRENCY_ID, currencyId != null ? currencyId : JSONObject.NULL);
```

This is a backward-compatible additive change — existing consumers of `currencyCode` continue to work; new consumers can read `currencyId` for ID-level comparisons. Per `docs/neo-headless-extensibility.md` "Golden Rule", this is allowed because it's a generic addition useful to any NEO consumer, not window-specific logic.

### 9.7 Dropdown validation simplified

**Original F-3 (in Phase 2 plan):** when user changes currency in the dropdown, the rate check happened in the callout response handler (after the currency callout fired). On no-rate → revert + toast.

**New (post-simplification):** the rate check runs directly in `handleChangeWithCallout` (the dropdown's onChange path). The callout response handler no longer has any currency-conversion logic at all. On no-rate → revert via `hook.handleChange('currency', previousCurrency)` + toast.

**Special case:** when the new currency equals the org currency, validation is skipped (no rate needed to "return" to the org currency).

### 9.8 Locale string simplified

**Original (Phase 2 F-4):** `noConversionRateError` interpolated `{from}` and `{to}` (currency codes).

**Problem:** the codes available at runtime were the internal IDs (e.g., `100`, `102`), not ISO codes. Looking up the ISO codes synchronously was complex and error-prone.

**New:** message simplified to interpolate only `{date}`:
- EN: *"No conversion rate defined between the current and the selected currency for date {date}. Currency change cancelled."*
- ES: *"No hay tipo de cambio definido entre la moneda actual y la seleccionada para la fecha {date}. Cambio de moneda cancelado."*

Updated in `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json`.

### 9.9 Updated artifact locations note

The original plan referenced locales at `tools/app-shell/src/locales/`. The actual location is `packages/app-shell-core/src/locales/`. Plan was followed in the correct location.

---

## 10. Current Status (2026-06-18)

| Task | Status |
|------|--------|
| C-1 (core trigger) | DONE |
| N-1..N-5 (NEO Java cleanup) | DONE |
| F-1..F-2 (frontend workarounds removed) | DONE |
| F-3 (dropdown rate validation + revert) | DONE — refactored per 9.7 |
| F-4 (i18n key) | DONE — simplified per 9.8 |
| F-5 (decisions.json `saveCurrencyBeforeLines` removal) | DONE |
| F-6 (CLI generator cleanup) | DONE |
| F-7 (push-to-neo + export.database) | DONE |
| 9.2 sync effect / bootstrap | DONE |
| 9.3 in-place mutation in conversion block | DONE |
| 9.4 lines.currency override + decisions.json | DONE |
| 9.5 Bug #17 — currency persistence | DONE |
| 9.6 NeoSessionService `currencyId` | DONE |
| Phase 3 (tests Vitest + Playwright) | PENDING |
| Phase 4 (docs in `docs/generated-custom-windows/`) | PENDING |
| Phase 5 (PR to `epic/ETP-3504`) | PENDING |

### Verified flows (manual testing 2026-06-18)

- ✅ Create order in EUR (org), add line, save — line in EUR with raw pricelist price
- ✅ Create order in EUR, change to USD, validate rate exists, save — header currency saved as USD
- ✅ Create order in EUR, change to USD with no rate available — dropdown reverts to EUR + toast error
- ✅ Open saved order in USD (org=EUR), add line — line saved with USD currency and converted price
- ✅ Round-trip USD → EUR → USD on saved order — currency persists each time
- ✅ Manual DB inspection confirms `C_ORDERLINE.C_CURRENCY_ID` matches order header currency after conversion

---

## 11. What This Replaces

A prior version of this document explored multiple paths (functional currency model, mixed currency model, etc.) and reached partially-wrong conclusions about effort and scope. This version is anchored to user-confirmed semantics and code-verified evidence. The user has explicitly accepted the blind-SUM behavior of `C_ORDERLINE_TRG2` as part of the design — the implementation scope collapses from "3-6+ months of core rewrite" to "single trigger edit + NEO hook adjustments + frontend cleanup".

The shift in scope is entirely due to the user accepting that `C_ORDER.GRANDTOTAL` is a raw arithmetic number, not "an amount in a specific currency". That single semantic decision collapses the entire downstream-consumer audit (Verifactu, AEAT, accounting, payments) into "they receive the number that's there; the user's model says that's correct".
