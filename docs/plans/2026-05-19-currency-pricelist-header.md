# Plan: Add Currency and Price List fields to document headers

**Feature:** ETP-4027  
**Affects:** Sales Quotation, Sales Order, Purchase Order  
**Created:** 2026-05-19  
**Status:** Dual-currency display complete, currency field lock complete, exchange rate endpoint complete, save-order guard (`saveCurrencyBeforeLines`) complete. Rebased onto `epic/ETP-3504` (2026-06-16). Remaining: price list fallback alert, E2E tests, REVIEW/QA phases.

---

## 10. Implementation Log (ETP-4027)

### Findings from debugging (2026-05-22)

#### Bug 1 — `useCallout.js` emitted `null` when backend returned empty response
`useCallout.js` called `setCalloutResult(null)` when `updates === {}` and `combos === {}`. This is exactly what happens when the currency callout succeeds but the exchange rate exists and no warning is needed (empty response = all good). The `calloutResult` useEffect in `DetailView` only runs when the value changes FROM null TO non-null, so the conversion logic never triggered.

**Fix:** Always emit `calloutResult` regardless of whether updates/combos are present:
```javascript
// tools/app-shell/src/hooks/useCallout.js line 83
setCalloutResult({ updates, combos, triggerField: field }); // removed if/else
```

#### Bug 2 — Wrong URL for `validate-exchange-rate` endpoint (404)
`DetailView.jsx` was fetching `${apiBaseUrl}/validate-exchange-rate` where `apiBaseUrl = http://…/sws/neo/sales-order`. This produces `/sws/neo/sales-order/validate-exchange-rate` which is parsed by `NeoServlet` as `specName=sales-order`, not matching the built-in handler.

The correct path is `/sws/neo/validate-exchange-rate` (no entity segment). `NeoBuiltInEndpointHandler` only matches when `pathInfo.specName === "validate-exchange-rate"`.

**Fix:** Strip entity segment with `apiBaseUrl.replace(/\/[^/]+$/, '')` — same pattern already used in `useOrderWindow.jsx:84`.
```javascript
// tools/app-shell/src/components/contract-ui/DetailView.jsx line ~1123
const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');
fetch(`${neoBase}/validate-exchange-rate?...`, ...)
```

#### Modularity confirmation
The conversion logic lives entirely in `DetailView.jsx` (generic `contract-ui` component) and uses `lineConfig` (window-agnostic). It will work for Sales Invoice once the invoice header exposes a `currency` field — no additional changes needed in the conversion code.

#### Verified behavior (confirmed via browser automation)
- EUR → USD (rate 1.16): listPrice 23 → **26.68**, lineGrossAmount → **29.35** (IVA 10%) ✓  
- Saved lines (Fernet 44.00): unchanged ✓  
- Header totals recalculate correctly ✓  
- Network: `GET /sws/neo/validate-exchange-rate?fromCurrency=102&toCurrency=100&date=2026-05-22 → 200 OK` ✓

---

### Session 2026-05-26 — dual-currency display, currency lock, exchange rate endpoint (ETP-4027)

#### Completed

- **`useDocumentCurrency.js`** (new shared hook) — fetches org currency from `/sws/neo/session`, then exchange rate from `/sws/neo/validate-exchange-rate` when currencies differ. Returns `{ orgCurrencyCode, exchangeRate, isSameCurrency, loading, convertAmount }`.

- **`SummaryCard.jsx`** — dual-currency display implemented (Holded-style): primary row = org amount + doc-currency badge; secondary row = `(rate) doc-amount`. Controlled by new optional props `orgCurrencyCode`, `exchangeRate`, `orgGrandTotal`. No rendering change when currencies are the same.

- **`OrderPreview.jsx`** — calls `useDocumentCurrency`, pre-computes `orgGrandTotal = convertAmount(order.grandTotalAmount)`, threads `orgCurrencyCode`, `exchangeRate`, `orgGrandTotal` through `OrderGeneralTab` to `SummaryCard`.

- **`NeoExchangeRateService.java`** (new, com.etendoerp.go) — `GET /sws/neo/validate-exchange-rate`. Accepts ISO codes or DB IDs. Queries `C_Conversion_Rate`. Falls back to inverse direction (`1/rate`) if direct pair absent. Same-currency short-circuit returns `rate: 1.0` without a DB query.

- **`DetailView.jsx` — currency field lock** — `displayLogicWithCurrencyLock` memo forces `currency` to readOnly when `hook.children.length > 0`, preventing the DB trigger `C_ORDER_CHK_RESTRINCTIONS_TRG` from rejecting the save with `@20502@`. Applied to both `principal` and `collapsed` form sections.

#### Bugs fixed this session

**Bug A — principal section currency field not locked.**  
`displayLogicWithCurrencyLock` was only applied to the `collapsed` form section; the `principal` section (where `currency` actually lives) still used raw `displayLogic`. The field appeared editable on orders with existing lines, and any save attempt would fail at the DB trigger. Fixed by using `displayLogicWithCurrencyLock?.readOnly` consistently for the principal section.

**Bug B — `convertAmount` formula wrong (amount / rate instead of amount × rate).**  
`useDocumentCurrency` was computing `amount / rate`. Etendo stores `multiplyrate` where `to_amount = from_amount × multiplyrate`, so dividing gave the wrong converted total in the preview card. Fixed to `amount * rate`. The inverse-fallback case is transparent — the server already returns `1/inverseRate` so the same multiplication formula applies in both directions.

**Bug C — `validate-exchange-rate` returned `hasRate: false` for GOClient (inverse direction missing).**  
GOClient only had EUR→USD = 1.16 configured; not USD→EUR. With no direct USD→EUR row the endpoint previously returned `{ hasRate: false }`, causing the preview to show no org-currency total for USD orders. Fixed in `NeoExchangeRateService` by adding the inverse fallback: try `TO→FROM`, return `1/rate` if found.

#### Remaining work (not yet started)

- Price list fallback alert (§4.3.5 / Phase 4) — not yet implemented.
- E2E tests (§4.6 / Phase 2 test cases): `currency-display.mocked.spec.js`.
- Unit tests for `useDocumentCurrency`.
- Quotation preview (`QuotationPreview.jsx`) — same dual-currency pattern; not yet wired.

---

## 1. Executive Summary

The three main transactional documents (Sales Quotation, Sales Order, Purchase Order) currently have the `currency` field hidden from the UI — it is auto-derived from the organization config and never exposed to the user. The `priceList` field is already visible but has no explicit ordering relative to `currency`.

This plan adds both fields as **editable and visible** in the header's `principal` section, in the order `currency → priceList`, along with:

- Auto-defaulting from org config (currency) and business partner config (price list).
- Locking both fields on document confirmation.
- Exchange rate validation before confirmation when currencies differ.
- Dual-currency display in summary cards and PDFs.
- Inheritance of both fields when creating a Sales Order from a Sales Quotation.

---

## 2. Current State Analysis

### 2.1 Field-by-field breakdown (all three windows)

| Field | Visibility | `form` | `section` | Derivation / Callout |
|---|---|---|---|---|
| `currency` | `readOnly` | `false` | `summary` (SQ/SO) / `other` (PO) | `fromConfig` → `context.cCurrencyId`; no callout |
| `priceList` | `editable` | `true` | `principal` | Callout `SL_Order_PriceList` (fires on priceList change → updates currency + tax) |

**Key finding:** `currency` is completely hidden from the form today. When the user picks a `priceList`, the existing Etendo callout `SL_Order_PriceList` silently updates the document currency to match the price list's currency. This callout is declared `"decision": "Keep"` in all three windows' decisions.json.

### 2.2 Existing callout decisions already in decisions.json

- **`SE_Order_BPartner_C_BPartner_ID`** — fires when `businessPartner` changes; auto-fills address, contact, price list, payment terms from the partner record. Declared `"decision": "Keep"` in all three windows. This means **price list autocompletion from the business partner is already handled at the Etendo backend level**.

- **`SL_Order_PriceList_M_PriceList_ID`** — fires when `priceList` changes; updates currency and tax settings. Also declared `"decision": "Keep"`. This creates a coupling: changing the price list will change the currency.

### 2.3 Exchange rate infrastructure

There is **no exchange rate field at the order/quotation header level** in the current contracts or decisions files. Exchange rate logic exists only at the payment plan and financial account level (`finaccTxnConvertRate`). The `C_Conversion_Rate` table is referenced only in the sales-invoice schema-raw, not in order/quotation schemas.

### 2.4 Quotation → Order conversion

`QuotationConfirmModal.jsx` calls:
```
POST /api/sales-quotation/quotation/{id}/action/Convertquotation
```

This routes through `NeoButtonHandler` → `NeoButtonActionHelper` → `NeoProcessService` → `ConvertQuotationIntoOrder.java` (standard Etendo process, class `org.openbravo.erpCommon.ad_process.ConvertQuotationIntoOrder`).

**Key finding:** The conversion starts with:
```java
Order newSalesOrder = (Order) DalUtil.copy(quotation, false);
```
`DalUtil.copy()` performs a deep copy of all entity fields. The only fields explicitly overridden afterward are: `documentStatus`, `documentNo`, `orderDate`, `rejectReason`, `validUntil`, `summedLineAmount`, `grandTotalAmount`, `quotation` (reference). `currency` and `priceList` are **never reset** — they are inherited automatically.

**Conclusion: Quotation → Order inheritance of currency and priceList already works. No backend changes needed for this requirement.**

### 2.5 Shared infrastructure affected

| Component | Location | Reason affected |
|---|---|---|
| `SummaryCard.jsx` | `shared/preview-cards/` | Displays `currencyCode + grandTotal`; needs dual-currency display |
| `documentPdf.js` | `shared/` | Handlebars template for PDFs; needs exchange rate row and org-currency equivalent |
| `useOrderPdf.js` | `shared/` | Feeds data to `buildOrderData`; needs to pass exchange rate |
| `usePurchaseOrderPdf.js` | `shared/` | Same as above |
| `useQuotationPdf.js` | `shared/` | Same, but calls separate endpoint |
| `useOrderWindow.jsx` | `shared/` | Orchestrates SO/PO confirmation; needs pre-confirm exchange rate validation |
| `QuotationConfirmModal.jsx` | `artifacts/sales-quotation/custom/` | Handles SQ confirmation + conversion; may need exchange rate display |

---

## 3. Gap Analysis

| Requirement | Current State | What is missing |
|---|---|---|
| `currency` visible and editable in header | Hidden (`form: false`) | Change `decisions.json` → `form: true`, `visibility: editable`, `section: principal` |
| `priceList` shown after `currency` | Visible but no explicit order relative to currency | Add `order` key to both fields in `decisions.json` |
| `currency` defaults to org currency | Derived from `context.cCurrencyId` (correct) | The default is already wired; just need to make it editable |
| `priceList` defaults from business partner | Already handled by `SE_Order_BPartner_C_BPartner_ID` callout | **Nothing to do** — backend fills it on BP change |
| Fallback to main price list when partner's is inactive | Not implemented | Requires either a custom callout / NeoHandler or frontend override check |
| Visual alert on price list fallback | Not implemented | New frontend alert component / toast |
| Both fields locked on confirmation | `priceList` has `readOnlyLogic: "@Processed@='Y'"` already; `currency` has no readOnly logic | Add `readOnlyLogic: "@Processed@='Y'"` to `currency` in `decisions.json` |
| Pre-confirm exchange rate validation | Not implemented | New endpoint query + frontend guard in `useOrderWindow` and `QuotationConfirmModal` |
| Dual-currency display in summary card | Shows only doc currency | Update `SummaryCard` props and rendering |
| Dual-currency display in PDF | Not implemented | Update `documentPdf.js` template and `buildOrderData` |
| Inheritance SQ → SO on conversion | Unknown — depends on `Convertquotation` backend | Must verify; may need NeoHandler or backend fix |
| Lines not recalculated on currency/priceList change | No recalculation logic exists today | **Nothing to do** — Etendo callouts only update header fields, not line prices |

---

## 4. Required Changes by Layer

### 4.1 Layer 1: `decisions.json` (three windows, parallel)

**These three changes must be applied identically to `artifacts/sales-quotation/decisions.json`, `artifacts/sales-order/decisions.json`, and `artifacts/purchase-order/decisions.json`.**

#### 4.1.1 `currency` field — make editable and visible

```jsonc
// Before (current state in sales-quotation)
"currency": {
  "visibility": "readOnly",
  "grid": false,
  "form": false,
  "section": "summary"
}

// After
"currency": {
  "visibility": "editable",
  "grid": false,
  "form": true,
  "section": "principal",
  "order": 10,            // before priceList
  "readOnlyLogic": "@Processed@='Y'"
}
```

> **Note:** `defaultValue: "@C_Currency_ID@"` is declared in `schema-raw.json` — it will be honored automatically by NEO Headless when the field is editable. The `fromConfig` derivation in the current decisions.json must be **removed** so NEO doesn't override the user's selection.

#### 4.1.2 `priceList` field — add explicit order

```jsonc
// After (add order: 11, one position after currency)
"priceList": {
  "section": "principal",
  "order": 11
}
```

#### 4.1.3 Decouple currency from callout cascade

**Confirmed behavior (from source code):**

`SL_Order_PriceList.java` explicitly sets `inpcCurrencyId` from the price list's `C_Currency_ID`:
```java
info.addResult("inpcCurrencyId", data[0].cCurrencyId);
```

`SE_Order_BPartner.java` does NOT set currency directly, but NEO auto-cascades from `priceList` to `SL_Order_PriceList`, which does. The full chain when a business partner is selected:

```
businessPartner changes
  → SE_Order_BPartner      → sets priceList (among others)
  → cascade NEO
  → SL_Order_PriceList     → sets currency (= price list's currency) + isTaxIncluded
```

**Problem:** The requirement says currency must default to the org currency, not the price list's currency. If the partner has a USD price list, the cascade would incorrectly set currency to USD.

**Solution: `NeoHandler.afterCallout()` — block all callout-driven currency updates.**

No callout should be allowed to update `currency`. Only the user can change it. The initial default (org currency) comes from the field's `@C_Currency_ID@` default value in NEO, which runs before any callout.

`isTaxIncluded` (the other output of `SL_Order_PriceList`) is still updated normally.

```java
@Override
public NeoResponse afterCallout(NeoContext context) {
    JSONObject response = context.getPreviousResult().getBody();
    JSONObject updates = response.optJSONObject("updates");
    if (updates != null && updates.has("currency")) {
        updates.remove("currency");  // no callout may write the currency field
    }
    return updates != null ? NeoResponse.ok(response) : null;
}
```

This handler must be registered for all three entity qualifiers: `sales-quotation` header, `sales-order` header, `purchase-order` header. A shared abstract base class holds the logic; each entity subclass provides the qualifier.

### 4.2 Layer 2: Generated frontend (no manual edits needed)

After running `make regen ONLY=sales-quotation,sales-order,purchase-order`, the generator will:
- Render `currency` as an editable search field in the principal section.
- Order it before `priceList` based on the `order` keys.

No manual changes to generated files. Run the Window Change Integrity Protocol (Steps 2–5 in CLAUDE.md) for all three windows.

### 4.3 Layer 3: Custom component changes

> **Implementation note — `saveCurrencyBeforeLines` opt-in (added during ETP-4027):**
> `DetailView.jsx` accepts a `saveCurrencyBeforeLines` boolean prop (default `false`). When `true`, the component inverts the normal save order in two scenarios:
> 1. **Header "Guardar" button** (`flushAndSave`): if the user changed `currency` with a pending add-row and zero committed lines, the header is committed first (no lines → `C_ORDER_CHK_RESTRINCTIONS_TRG` is silent), then the line.
> 2. **Line save via Enter** (`onAdd` callback): same check — if `currencyChangedNoLines`, save header before posting the line.
>
> The prop is emitted by `generate-frontend.js` only for windows that declare `"saveCurrencyBeforeLines": true` in `decisions.json`. Currently only `sales-order` and `purchase-order` opt in. This prevents the fix from affecting invoices or other windows that don't have the `C_ORDER_CHK_RESTRINCTIONS_TRG` constraint. The pipeline carries this flag through `resolve-curated.js` (`WINDOW_BOOLEAN_TRUE_PROPS`) → `contract.json` → `generate-frontend.js` → `HeaderPage.jsx`.

> **Post-rebase note (ETP-3991):** The shared infrastructure was significantly refactored. Key architectural changes that affect this layer:
> - `documentPdf.js` was split: fetch utilities moved to the new **`pdfUtils.js`** file. Any new fetch helper (e.g., `fetchExchangeRate`) must go in `pdfUtils.js`, not in `documentPdf.js`.
> - `buildOrderData` now takes `(spec, orderId, base, token)` — `spec` is explicit.
> - `useQuotationPdf.js` has its own local `buildQuotationData` (not shared in `documentPdf.js`) — must be extended separately.
> - `OrderPreview.jsx` now wraps `GenericPreviewModal` internally. `SummaryCard` is still rendered in `OrderGeneralTab({ order })`, which only receives the list row object. Exchange rate data must flow from `useOrderPdf` return values → `OrderPreview` → `OrderGeneralTab` → `SummaryCard`.
> - `useOrderWindow.jsx` confirmation flow: menu action → `setConfirmRow(row)` → `ConfirmModal` mounts → modal calls DocAction. Frontend exchange rate pre-check must go in the menu action `onClick` handler (before `setConfirmRow`).

#### 4.3.1 `SummaryCard.jsx` — dual currency display

**Location:** `tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx`

**New props to add:**
```jsx
orgCurrencyCode?: string   // e.g. "EUR" — omit when same as currencyCode
exchangeRate?: number      // e.g. 1.09 — omit when same currency
orgGrandTotal?: number     // grandTotal converted — omit when same currency
```

**Behavior:**
- If `orgCurrencyCode` is absent or equals `currencyCode`: render as today.
- Otherwise, show:
  ```
  USD 1.000
  EUR 917,43  (tasa: 1,09)
  ```

#### 4.3.2 `pdfUtils.js` — add `fetchExchangeRate` helper

**Location:** `tools/app-shell/src/windows/custom/shared/pdfUtils.js`

Add a new exported helper (following the existing `fetchOptionalJson` pattern):

```js
export async function fetchExchangeRate(fromCurrencyId, toCurrencyId, date, base, token) {
  if (!fromCurrencyId || !toCurrencyId || fromCurrencyId === toCurrencyId) return null;
  try {
    const url = `${base}/exchange-rate?from=${fromCurrencyId}&to=${toCurrencyId}&date=${date}`;
    return await fetchOptionalJson(url, token);  // returns null if not found, never throws
  } catch { return null; }
}
```

Also add a `fmtRate` helper to `COMMON_HANDLEBARS_HELPERS` (exchange rates need 4 decimal places, unlike `fmt` which uses 2).

#### 4.3.3 `useDocumentCurrency.js` — NEW shared hook (future-proofing)

**Location:** `tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js`

> **Why this exists:** Sales Order, Sales Quotation, Purchase Order, Sales Invoice (future), and Goods Shipment (future) all need the same exchange rate data for their previews and PDF generation. Embedding this fetch in each PDF data builder (`buildOrderData`, `buildInvoiceData`, etc.) would duplicate the same logic 4+ times. A single shared hook eliminates that duplication and makes the exchange rate logic easy to test and maintain in one place.

```js
export function useDocumentCurrency({ docCurrencyId, orderDate, apiBaseUrl, token }) {
  // 1. fetch org currency from /session
  // 2. if docCurrencyId !== orgCurrencyId: call fetchExchangeRate
  // 3. returns:
  return {
    orgCurrencyCode,    // "EUR" — null while loading
    exchangeRate,       // 1.09 — null if same currency or not found
    isSameCurrency,     // boolean
    loading,
    convertAmount,      // (amount) => amount * exchangeRate — returns amount unchanged if isSameCurrency
  };
}
```

**Who uses it:**
- `OrderPreview.jsx` — calls the hook and passes data to `OrderGeneralTab` → `SummaryCard`
- `QuotationPreview.jsx` — same
- `InvoicePreview.jsx` (future) — same, replacing any ad-hoc fetch
- `GoodsShipmentPreview.jsx` (future) — same

**Who does NOT use it:**
- PDF data builders (`buildOrderData`, `buildInvoiceData`) — they receive the exchange rate data as a parameter from the caller (see §4.3.4), not by calling the hook themselves. Hooks cannot be called from async functions.

#### 4.3.4 `documentPdf.js` — extend `buildOrderData` to accept currency data as parameter

**Location:** `tools/app-shell/src/windows/custom/shared/documentPdf.js`

`buildOrderData` must NOT fetch exchange rate internally — that would duplicate what `useDocumentCurrency` does and prevent reuse. Instead, accept it as an optional parameter:

```js
// Signature change:
export async function buildOrderData(spec, orderId, base, token, currencyData = null) {
  const [header, lines, session] = await Promise.all([...]);
  // currencyData comes from the caller (hook) — not fetched here
  const exchangeRate = currencyData?.exchangeRate ?? null;
  const orgCurrencyCode = currencyData?.orgCurrencyCode ?? null;
  // ... add to returned data object
}
```

In the Handlebars template, add a conditional row after the totals:
```handlebars
{{#if exchangeRate}}
<tr class="conversion-row">
  <td colspan="5">{{orgCurrencyCode}} {{fmt orgGrandTotal}} (tasa: {{fmtRate exchangeRate}})</td>
</tr>
{{/if}}
```

#### 4.3.5 `useOrderPdf.js` and `usePurchaseOrderPdf.js` — pass currency data from hook

**Location:** `tools/app-shell/src/windows/custom/shared/`

These hooks need access to `currencyData` to pass to `buildOrderData`. However, they are called inside `OrderPreview`, which already has access to `useDocumentCurrency`. The cleanest approach:

1. `OrderPreview` calls both `useOrderPdf(orderId, ...)` and `useDocumentCurrency({docCurrencyId, ...})`.
2. Once `useDocumentCurrency` resolves, `OrderPreview` passes `currencyData` to the PDF via a ref or by triggering a re-render that causes the PDF to regenerate with the full data.

**Alternatively (simpler):** `useOrderPdf` internally calls `useDocumentCurrency` and passes the result to `buildOrderData`. This keeps `OrderPreview` simpler. Both approaches work — prefer whichever avoids prop drilling.

#### 4.3.6 `useQuotationPdf.js` — pass currency data to `buildQuotationData`

**Location:** `tools/app-shell/src/windows/custom/shared/useQuotationPdf.js`

`buildQuotationData` is a local async function (not in `documentPdf.js`). Same pattern: accept `currencyData` as parameter. The hook itself calls `useDocumentCurrency` and passes the result.

#### 4.3.7 `OrderPreview.jsx` — call `useDocumentCurrency` and thread to `SummaryCard`

**Location:** `tools/app-shell/src/windows/custom/shared/OrderPreview.jsx`

```jsx
// OrderPreview.jsx
const { orgCurrencyCode, exchangeRate, convertAmount } = useDocumentCurrency({
  docCurrencyId: order.currency,   // or order['currency$_identifier']
  orderDate: order.orderDate,
  apiBaseUrl,
  token,
});

// tabs
content: <OrderGeneralTab
  order={order}
  orgCurrencyCode={orgCurrencyCode}
  exchangeRate={exchangeRate}
  orgGrandTotal={convertAmount(order.grandTotalAmount)}
  ...
/>
```

`QuotationPreview.jsx` uses the same pattern in `QuotationGeneralTab`.

#### 4.3.7 `useOrderWindow.jsx` — frontend exchange rate pre-check before confirm

**Location:** `tools/app-shell/src/windows/custom/shared/useOrderWindow.jsx`

The confirm menu action currently calls `setConfirmRow(row)` which opens the ConfirmModal. Add an async guard before that:

```jsx
onClick: async () => {
  const docCurrency = row['currency$_identifier'];
  const orgCurrency = await getOrgCurrency(apiBaseUrl, token); // lightweight session fetch
  if (docCurrency && orgCurrency && docCurrency !== orgCurrency) {
    const hasRate = await checkExchangeRate(docCurrency, orgCurrency, row.orderDate, apiBaseUrl, token);
    if (!hasRate) {
      // show inline error — toast or alert — i18n key: noExchangeRateAvailable
      return;
    }
  }
  setConfirmRow(row);
}
```

> **Note:** The NeoHandler backend check (§4.4.1) is the authoritative block. This frontend check is a UX improvement that prevents opening the modal unnecessarily. Both must exist.

#### 4.3.5 Price list fallback alert

**Confirmed finding:** `SE_Order_BPartner` callout does NOT validate whether the partner's configured price list is active (`M_PriceList.IsActive`). If the price list ID is not empty, it is returned as-is regardless of its active state. The fallback to the default price list only fires when the ID is literally empty.

**Required changes:**

1. **`NeoHandler.afterCallout()`** on the three order entities (can share the base class from §4.1.3): when the triggering field is `businessPartner`, check if the returned `priceList` value corresponds to an inactive `M_PriceList` record. If so:
   - Override the `priceList` in the response `updates` with the client's active default price list.
   - Add a `WARNING` message: `priceListFallbackAlert`.

2. The WARNING message is surfaced automatically by the NEO frontend callout response handler — no new frontend code needed.

```java
// In afterCallout, when field == "businessPartner":
String returnedPriceListId = updates.optString("priceList");
if (returnedPriceListId != null && !isPriceListActive(returnedPriceListId)) {
    String defaultId = getDefaultPriceList(isSOTrx, clientId);
    updates.put("priceList", defaultId);
    messages.put(new JSONObject()
        .put("type", "WARNING")
        .put("text", OBMessageUtils.messageBD("priceListFallbackAlert")));
}
```

### 4.4 Layer 4: Backend / NEO changes

#### 4.4.1 Exchange rate validation — callout + confirmation guard

**Resolved architecture:** This works exactly like a callout, triggered when the `currency` field changes in the header form.

**Two-level implementation:**

**Level 1 — Informative warning (on currency field change):**

In `NeoHandler.afterCallout()` (same base class as §4.1.3 and §4.3.5), add a branch for `field == "currency"`:

```java
if ("currency".equals(field)) {
    String selectedCurrency = context.getRequestBody()
        .getJSONObject("formState").optString("currency");
    String orgCurrency = getOrgCurrency(context.getOrgId());

    if (!selectedCurrency.equals(orgCurrency)) {
        String docDate = context.getRequestBody()
            .getJSONObject("formState").optString("orderDate");
        boolean hasRate = hasConversionRate(selectedCurrency, orgCurrency, docDate);
        if (!hasRate) {
            messages.put(new JSONObject()
                .put("type", "WARNING")
                .put("text", OBMessageUtils.messageBD("noExchangeRateAvailable")));
        }
    }
}
```

The WARNING is shown inline in the form when the user changes the currency. The user can continue editing but is informed.

**Level 2 — Hard block (on confirmation):**

In `NeoHandler.handle()` for the `DocAction` / confirmation action, perform the same check as Level 1 but return an ERROR response that blocks the action:

```java
@Override
public NeoResponse handle(NeoContext context) {
    if (!"action".equals(context.getEndpointType())) return null;
    // ... load record, check currency vs orgCurrency, check C_Conversion_Rate
    // if no rate found: return NeoResponse.error(400, "noExchangeRateAvailable")
}
```

**No standalone endpoint needed.** Both validations live in the same NeoHandler class.

#### 4.4.2 Quotation → Order field inheritance

**Resolved — no action needed.**

`ConvertQuotationIntoOrder.java` uses `DalUtil.copy(quotation, false)` which performs a deep copy of the entire entity. `currency` and `priceList` are copied automatically. No NeoHandler or process hook is needed.

#### 4.4.3 Price list fallback logic

**Resolved — confirmed gap in standard callout.**

`SE_Order_BPartner.java` only falls back to the default when the price list ID is empty. It does NOT check `M_PriceList.IsActive`. An inactive price list is returned as-is. The fallback and alert are implemented entirely in `NeoHandler.afterCallout()` — see §4.3.5.

### 4.5 Layer 5: i18n keys

New keys needed in `en_US.json` and `es_ES.json`:

| Key | English | Spanish |
|---|---|---|
| `noExchangeRateAvailable` | `No exchange rate available for this currency pair on the document date` | `No hay tipo de cambio disponible para el par de monedas en la fecha del documento` |
| `priceListFallbackAlert` | `Partner's price list is inactive. Using the default price list.` | `La tarifa del contacto está desactivada. Se usa la tarifa principal.` |
| `orgCurrencyEquivalent` | `Equivalent in {currency}` | `Equivalente en {currency}` |
| `exchangeRateLabel` | `Rate` | `Tasa` |

### 4.6 Layer 6: Tests

All test changes must be delegated to the `test-generator` subagent (Tester).

#### Unit / contract tests

- `shared/__tests__/useOrderPdf.test.js` — Add assertions for exchange rate fetching and dual-currency data in `buildOrderData`.
- `shared/__tests__/usePurchaseOrderPdf.test.js` — Same.
- `shared/__tests__/useQuotationPdf.test.js` — Same.
- New test file: `shared/__tests__/SummaryCard.test.js` (or extend existing) — dual currency rendering.
- New test file: `shared/__tests__/useOrderWindow.test.js` — pre-confirm exchange rate validation.

#### E2E tests (Playwright)

One spec file per test case listed in §6. Minimum required:

- `e2e/tests/flows/currency-pricelist-header.mocked.spec.js` — covers cases 1, 2, 5 (field visibility, autocomplete, lock on confirm).
- `e2e/tests/flows/exchange-rate-validation.mocked.spec.js` — covers cases 4, 7 (validation block, same-currency shortcut).
- `e2e/tests/flows/currency-display.mocked.spec.js` — covers case 8 (dual-currency display).

Before writing specs, Tester must read `docs/e2e-testing-guide.md` and use `e2e/tests/flows/row-quick-actions.mocked.spec.js` as reference.

---

## 5. Implementation Phases

### Phase 0: Open questions — RESOLVED

All open questions resolved before implementation:

1. ✅ **Callout coupling:** Changing `priceList` must NOT update `currency`. Resolved via `NeoHandler.afterCallout()` that removes the currency update from the callout response (§4.1.3).
2. ✅ **Quotation→Order inheritance:** `DalUtil.copy()` copies all fields. Nothing to implement (§4.4.2).
3. ✅ **Price list fallback:** Standard callout does NOT handle inactive price lists. Fallback + alert implemented in `NeoHandler.afterCallout()` (§4.3.5).
4. ✅ **Exchange rate check architecture:** Implemented as `NeoHandler` — warning on currency field change (afterCallout), hard block on confirmation (handle). No standalone endpoint needed (§4.4.1).

### Phase 1: decisions.json changes + regen (low risk, no backend)

**Parallel for all 3 windows.**

1. Edit `decisions.json` for each window: expose `currency`, add `order` to both fields, add `readOnlyLogic` to `currency`.
2. Run `make regen ONLY=sales-quotation,sales-order,purchase-order`.
3. Run Window Change Integrity Protocol (Steps 2–5).
4. Verify no pipeline validator violations: `make validate-pipeline`.
5. Smoke-test in dev: open each window, verify both fields appear, verify they lock on confirm.

**No backend changes. No frontend custom components. This can ship independently as a partial feature.**

### Phase 2: Dual-currency display (medium risk, frontend only)

1. Extend `buildOrderData` and quotation equivalent to fetch exchange rate data.
2. Update `SummaryCard` with optional dual-currency props.
3. Update `documentPdf.js` Handlebars template.
4. Update PDF hooks to pass exchange rate data.
5. Update tests.

**Depends on Phase 1. Can proceed in parallel with Phase 3 if Phase 0 Q4 is resolved.**

### Phase 3: Exchange rate validation on confirmation (medium risk, backend + frontend)

1. Implement exchange rate lookup endpoint (or NeoHandler check).
2. Add pre-confirm guard in `useOrderWindow.jsx`.
3. Add pre-confirm guard in `QuotationConfirmModal.jsx`.
4. Add i18n keys.
5. Update tests.

**Depends on Phase 0 Q4 resolution.**

### Phase 4: Price list fallback alert (low–medium risk, depends on investigation)

1. Implement or verify fallback behavior in `SE_Order_BPartner_C_BPartner_ID`.
2. If needed: NeoHandler or callout override.
3. Frontend alert component.
4. i18n keys.
5. Tests.

**Depends on Phase 0 Q3 investigation.**

### Phase 5: ~~Quotation → Order inheritance~~ — ELIMINATED

`DalUtil.copy()` already copies all fields. Only test coverage is needed (Case 9 E2E spec, can be added in Phase 1 or 2).

---

## 6. Test Case Mapping

| Test Case | Description | Phase | Test Layer |
|---|---|---|---|
| Case 1 | New quotation without contact → currency = org currency, price list = main | Phase 1 | E2E (mocked) |
| Case 2 | Sales order with contact with special price list → price list autocompletes | Phase 1 | E2E (mocked) |
| Case 3 | Change currency with existing lines → lines 1–3 unchanged, line 4 uses new currency | Phase 1 | E2E (mocked) — observe no price change |
| Case 4 | Confirm without exchange rate → blocked with message | Phase 3 | E2E (mocked) |
| Case 5 | Confirmed document → currency and price list locked | Phase 1 | E2E (mocked) |
| Case 6 | Purchase order with inactive vendor price list → fallback + alert | Phase 4 | E2E (mocked) |
| Case 7 | Doc currency = org currency → no exchange rate required, factor = 1 | Phase 3 | E2E (mocked) |
| Case 8 | Doc in USD, org in EUR → total shows USD + EUR equivalent | Phase 2 | E2E (mocked) |
| Case 9 | Create order from quotation → inherits currency and price list | Phase 5 | E2E (mocked) |

---

## 7. Risks and Remaining Uncertainties

| Risk | Severity | Mitigation |
|---|---|---|
| `C_Conversion_Rate` table has org/client scoping not yet mapped | Medium | Before implementing §4.4.1, run a DB query to confirm the query structure: org, date range, currency direction. The sales-invoice schema-raw references `ConversionRateDoc` as a starting point. |
| Making `currency` editable may conflict with the existing `fromConfig` derivation in decisions.json | Medium | The `fromConfig` derivation must be explicitly removed from decisions.json — leaving it causes NEO to override the user's selection on every save. |
| `NeoHandler.afterCallout()` context format — confirm `formState` is always present in the callout request body | Low | Read `NeoCalloutService.java` request-building logic to confirm `formState` key name before coding. |
| Price list validation rule (`M_PriceList.issopricelist = @isSOTrx@`) must still filter by document type | Low | The validation rule is in schema-raw and will be preserved by the generator — no action needed. |
| Changing 3 windows' decisions.json in one PR increases review surface | Low | Consider splitting into 3 smaller PRs (one per window) or use a single PR with clear per-window commits. |
| `NeoHandler` for all 3 entity qualifiers — confirm qualifier names in ETGO_SF_ENTITY | Low | Before coding, query the DB: `SELECT spec_id, entity_name, java_qualifier FROM etgo_sf_entity` for the 3 windows. |

---

## 8. Files to Modify (Summary)

### decisions.json (3 files)
- `artifacts/sales-quotation/decisions.json`
- `artifacts/sales-order/decisions.json`
- `artifacts/purchase-order/decisions.json`

### Generated (auto, via `make regen`)
- `artifacts/*/generated/web/*/HeaderPage.jsx` (3 files)
- `artifacts/*/generated/web/*/QuotationForm.jsx` / `OrderForm.jsx` / `PurchaseOrderForm.jsx`
- `artifacts/*/contract.json` (3 files)

### Custom components (manual, never overwritten by pipeline)
- `tools/app-shell/src/windows/custom/shared/pdfUtils.js` ← add `fetchExchangeRate` + `fmtRate` Handlebars helper
- `tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js` ← **NEW** shared hook for exchange rate data (reusable by invoices/shipments)
- `tools/app-shell/src/windows/custom/shared/documentPdf.js` ← extend `buildOrderData(spec, id, base, token, currencyData)` + Handlebars template
- `tools/app-shell/src/windows/custom/shared/useOrderPdf.js` ← expose exchange rate fields from hook return
- `tools/app-shell/src/windows/custom/shared/usePurchaseOrderPdf.js` ← same as useOrderPdf
- `tools/app-shell/src/windows/custom/shared/useQuotationPdf.js` ← extend local `buildQuotationData` directly
- `tools/app-shell/src/windows/custom/shared/OrderPreview.jsx` ← thread exchange rate to `OrderGeneralTab` → `SummaryCard`
- `tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx` ← same pattern for `QuotationGeneralTab`
- `tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx` ← add optional dual-currency props
- `tools/app-shell/src/windows/custom/shared/useOrderWindow.jsx` ← frontend exchange rate pre-check in confirm action
- `artifacts/sales-quotation/custom/QuotationConfirmModal.jsx` ← pre-check before calling Convertquotation

### i18n
- `tools/app-shell/src/i18n/en_US.json`
- `tools/app-shell/src/i18n/es_ES.json`

### Tests
- `tools/app-shell/src/windows/custom/shared/__tests__/useOrderPdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/usePurchaseOrderPdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/useQuotationPdf.test.js`
- New: `e2e/tests/flows/currency-pricelist-header.mocked.spec.js`
- New: `e2e/tests/flows/exchange-rate-validation.mocked.spec.js`
- New: `e2e/tests/flows/currency-display.mocked.spec.js`

### Backend (com.etendoerp.go — separate repo, separate PR)
- New endpoint: exchange rate lookup (TBD path)
- Possibly: NeoHandler for `Convertquotation` post-hook to enforce field inheritance
- Possibly: NeoHandler or callout override for price list fallback

---

## 9. Notes for the developer

1. **Do not edit generated files.** All form field changes go in `decisions.json` only. The generator handles the rest.

2. **The `currency` field's `fromConfig` derivation** must be removed from decisions.json. If it remains, NEO Headless will reset the field to the org currency on every save, ignoring the user's selection.

3. **Validate readOnlyLogic** after regen using the contract integrity check (Step 3 of Window Change Integrity Protocol). The expression `@Processed@='Y'` should appear for both `currency` and `priceList`.

4. **The `SE_Order_BPartner_C_BPartner_ID` callout is already wired.** Do not re-implement the price list autocomplete from business partner — it already works. Only the fallback and alert need custom work.

5. **Phase 1 is safe to ship alone** as an incremental improvement. The dual-currency display, exchange rate validation, and inheritance can follow in subsequent PRs.
