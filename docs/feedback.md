
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
