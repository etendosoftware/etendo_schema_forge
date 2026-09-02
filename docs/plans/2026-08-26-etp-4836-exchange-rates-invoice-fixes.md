# ETP-4836 — Exchange Rates tab: i18n, editability, empty state, duplicates

**Ticket:** [ETP-4836](https://etendoproject.atlassian.net/browse/ETP-4836) — "[Exchange Rates] Múltiples problemas en la solapa: i18n, edición, estado vacío y registros duplicados"
**Epic:** ETP-3504 (Etendo Next / New New UI)
**Windows affected:** `sales-invoice`, `purchase-invoice`
**Repos touched:** `etendo_schema_forge` (frontend: decisions.json + shared component) and `etendo_core_pg/modules/com.etendoerp.go` (backend Java)
**Status:** Implementation complete and all 5 ticket cases verified live (2026-08-26) after Java compile + Tomcat restart. A related dual-currency preview bug was found during corner-case testing and fixed in the same pass — see "Bonus finding" below.

## Live verification results (2026-08-26, via Chrome MCP against localhost:3100)

All 5 Given/When/Then cases from the ticket reproduced and confirmed fixed on
sales-invoice `10000022` (draft, USD) and `10000023` (draft, EUR):

1. **Tab label** — reads "Tipos de cambio" (was "Exchange Rates").
2. **Column label** — reads "Importe en Moneda Objetivo" (was "Importe en Moneda
   Extranjera").
3. **Editable + reciprocal recalc** — row-edit mode now renders an input for
   "Importe en Moneda Objetivo" (previously absent from the DOM entirely). Edited it
   from 10.67 to 21.34 → "Índice" recalculated live from 0.5 to 1, header currency
   rate synced to 1.00, "Registro guardado" toast confirmed the PATCH round-trip.
4. **Empty state** — invoice `10000023` (org-currency EUR, 0 rows) now shows the
   document icon + "Sin registros aún" illustration instead of a blank area (no
   "+ Add" CTA, correctly, since this tab has no `addLineFields`).
5. **No duplicates on repeated currency change** — changed `10000023`'s currency
   EUR→GBP (saved, 1 row: GBP→EUR) → USD (saved). Result: exactly 1 row remained
   (USD→EUR), no orphaned GBP row. Confirmed at the DB level too: the surviving
   `c_conversion_rate_document` row's `created` (14:57:12) ≠ `updated` (14:57:40)
   timestamps proved it was the *same* row updated in place from GBP to USD, not a
   fresh insert next to a leftover GBP row.
   - This environment only had EUR↔USD conversion rates configured, so a temporary
     EUR↔GBP rate pair was inserted directly via `psql` (scoped to the invoice's
     actual `ad_client_id`, verified via `c_invoice.ad_client_id` — the org's
     existing EUR↔USD rows belonged to a *different* client, which is why GBP
     didn't show up in the currency picker on the first attempt) purely to make the
     3-currency scenario reproducible. Removed afterward along with the resulting
     `c_conversion_rate_document` row and the invoice's `em_etgo_currency_rate`
     override — `10000023` is back to its original EUR/no-rate state, verified with
     a follow-up query.

## Bonus finding — dual-currency preview shows the wrong total when the document rate is exactly 1 (ETP-4027/ETP-4029 lineage, not ETP-4836)

**Not part of the original ticket.** Found while doing broader currency-change and
preview corner-case testing requested after the 5 fixes above were verified. Root
cause and fix are unrelated to the Exchange Rates tab code — flagging it here (same
plan doc, same session) rather than losing it, since the user asked to document it
alongside the ETP-4836 work. Whether this ships in the same PR/commit as ETP-4836 or
gets its own Jira ticket is still open — see the repo status note at the end of this
section.

**Symptom:** `InvoicePreview.jsx` / `OrderPreview.jsx` / `QuotationPreview.jsx`'s
dual-currency total (the org-currency equivalent shown above the document-currency
total) is wrong whenever the document's own `EM_ETGO_Currency_Rate` is **exactly
`1`** for a genuinely non-org currency. Live-reproduced on all three: a USD document
(org = EUR) with `em_etgo_currency_rate = 1.000000000000` and `grandtotal = 21.34`
showed **31,37 €** in the preview drawer (should be **21,34 €**, since a 1:1 rate
means the org amount equals the doc amount numerically).

**Root cause:** `resolveDualCurrencyDisplay()` in
`tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js` (and an inlined
duplicate of the same logic in `QuotationPreview.jsx`, which doesn't call the shared
function) had:
```js
const exchangeRate = (etgoRate && etgoRate !== 0 && etgoRate !== 1)
  ? etgoRate
  : systemExchangeRate;
```
`etgoRate === 1` was treated as "no real override" and silently replaced with the
*system* exchange rate (`C_Conversion_Rate`, e.g. 0.68), producing `21.34 / 0.68 =
31.37` instead of `21.34 / 1 = 21.34`.

**Verified deliberate, not accidental — full history before touching it:**
- Introduced in `64eb8c2ae` (Feature ETP-4027, in `OrderPreview.jsx`) and replicated
  in `706c13c1f` (Feature ETP-4029, in `InvoicePreview.jsx`), same author.
- The *same* commit (`706c13c1f`) added an explicit test:
  `it('falls back to the system exchange rate when eTGOCurrencyRate is 1', ...)` in
  `InvoicePreview.vitest.jsx` — this was reviewed and intentional, not an oversight
  that slipped through.
- The reasoning (found in a comment in `CurrencyRatePicker.jsx`, same commit):
  `CurrencyOptionsHandler.java` hardcodes `rate = 1.0` for the org-currency option in
  the `/currencyOptions` selector response, as an org-currency marker for that one
  dropdown row. The author extended that "rate 1 = org currency" convention to
  `record.eTGOCurrencyRate` itself.
- **Why the convention doesn't transfer:** `eTGOCurrencyRate` is a real, nullable,
  user-settable DB column (via the picker's inline rate editor) that can legitimately
  be `1` for a currency that is *not* the org currency (a deliberately 1:1-pegged
  currency) — exactly the case reproduced here. The function *already* correctly
  excludes the true "this is the org currency" case via its own `!isSameCurrency`
  guard, before ever inspecting the rate value; the `!== 1` check was a second,
  redundant exclusion for that same case that had the side effect of also discarding
  genuine 1:1 rates for different currencies.

**Fix:** drop the `&& etgoRate !== 1` clause (both in `resolveDualCurrencyDisplay`
and in `QuotationPreview.jsx`'s inline copy) — `0`/`null`/`undefined`/`NaN` remain
the only "no override" sentinels, already covered by `etgoRate`'s truthiness alone.
Updated the existing test in `InvoicePreview.vitest.jsx` to assert the corrected
behavior (uses the real rate, `orgGrandTotal = grandTotal / 1`) instead of the old
fallback behavior, and added an assertion that the system rate is *not* used.

**Files:** `tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js`,
`tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx`,
`tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx`

**Live re-verification (2026-08-26):** created a fresh USD document of each type
(sales-invoice, sales-order, sales-quotation), set the rate to exactly `1` via the
header currency picker / Exchange Rates tab, confirmed via `psql`
(`em_etgo_currency_rate = 1.000000000000`), and confirmed the preview drawer now
shows the correct **21,34 €** with `(1,00)` as the displayed rate for all three.
Also re-checked a document with a normal (≠1) rate (sales-invoice `10000021`,
rate ≈1.47) to confirm no regression — preview unchanged (`93,93 € / (1,47)
$138,07`). Full Vitest suite for the touched files: 102/102 passing. Test data
(the 3 fresh documents, one temporary EUR↔GBP conversion rate pair inserted to
reproduce Error 5's 3-currency scenario) was removed after verification.

## Implementation notes (post-implementation)

- **Reverted false start:** the first version of Error 1's fix removed
  `decisions.json`'s `label` entirely and instead patched
  `resolveSecondaryTabDefs()` in `schema_forge_core/cli/src/generate-frontend.js` to
  fall back to `entity.tabName` before `toLabel(key)` (needed `LOCAL_CORE=1` to
  regenerate against the unpublished fix — see `docs/repo-topology.md`). On review,
  this was unnecessary scope: every other window's `secondaryTabs.<key>.label`
  already declares an explicit, correctly-cased label matching a dictionary key
  (`contacts.bankAccount: "Bank Account"`, `warehouse.productTransactions:
  "Transactions"`, etc.) — this tab's bug was a plain casing typo (`"Exchange Rates"`
  vs. the dictionary's `"Exchange rates"`), not a gap in the generator's fallback.
  The `schema_forge_core` commit was reset off `feature/ETP-4836` entirely (`git
  reset --hard origin/epic/ETP-3504`) and the fix redone as the one-line casing
  correction described above — no generator change, no `LOCAL_CORE=1`, no third repo
  in this change.
- `make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1` was run twice (once
  with the original decisions.json to capture DB-drift-only output, once with the
  fixed decisions.json) to isolate this change from drift via diff — see below. Both
  runs hit the live DB
  during field extraction (`SKIP_EXTRACT=1` did not actually skip it — worth a
  separate look, out of scope here) and picked up a **pre-existing, unrelated**
  regression: many `AD_Ref_List_Trl` Spanish translations across both windows (invoice
  status, rectification-reason codes, `CashVatForm`'s payment status, etc.) currently
  resolve to their English text in the DB — verified directly with `psql` against
  `ad_ref_list_trl` (e.g. `RPAP` → `es_ES` name is literally `"Awaiting Payment"`, not
  `"A Pagar"`). This is unrelated to ETP-4836 (likely `update.database` resetting
  `AD_Ref_List_Trl` to its XML baseline — same class of issue documented elsewhere in
  this repo for `SMFWHE_DEFINEDWEBHOOK_ROLE`) and was **not shipped**: `contract.json`,
  `contract.mcp.json`, `contract.prev.json` (both windows) and 4 unrelated
  `purchase-invoice` secondary-tab forms (`AccountingForm.jsx`, `CashVatForm.jsx`,
  `IntrastatForm.jsx`, `SiiDataForm.jsx`) that the regen collaterally touched were
  reverted with `git checkout` back to their pre-regen state, keeping only the 2
  generated files that are actually part of this fix (`ExchangeRatesTable.jsx`,
  `HeaderPage.jsx` per window — diffs verified clean, no collateral content). Worth a
  separate ticket to investigate the DB-wide translation drift; flagging here so it
  isn't lost.
- `npx sf-validate-pipeline --scope=sales-invoice,purchase-invoice` → clean ("Pipeline
  validation: OK"). The repo-wide `make validate-pipeline` reports 44 pre-existing
  blocking violations across unrelated windows — not touched by this change.
- `DetailView.secondaryAddLineHandlers.vitest.jsx` (the only existing test coverage
  for `secondaryTabEmptyState`) — 3/3 passing, confirming no regression for tabs that
  do have `addLineFields`.
- Java changes not compiled/tested here per the user's request — they will compile
  and restart Tomcat, then this plan's live test plan runs via Chrome MCP.

## Background

The Exchange Rates tab in invoices is the frontend for `C_Conversion_Rate_Document`
(the same table Payment In/Out use). It was built across ETP-4027/ETP-4029
(`docs/plans/ETP-4029-currency-invoice.md`, `docs/plans/completed/2026-06-24/2026-06-16-currency-functional-model-analysis.md §12`).
Backend: `InvoiceExchangeRateHandler.java` (manages the sub-tab's own PATCH/POST,
rate↔foreignAmount reciprocal calc) and `AbstractInvoiceHeaderHandler.autoCreateOrUpdateConversionRateDocument()`
(auto-upserts the row on every header save when doc currency ≠ org currency).

All 5 root causes below were verified by direct code read AND live reproduction in
the local environment (`http://localhost:3100`, invoices `10000021`/`10000022`/`10000023`)
before writing this plan.

## Root causes and fixes

### Error 1 — Tab name not translated ("Exchange Rates" always in English)

**Cause:** `artifacts/{sales,purchase}-invoice/decisions.json → window.secondaryTabs.exchangeRates.label`
is `"Exchange Rates"` (capital R) — a casing typo. The locale dictionaries carry the
real translation under `tools/app-shell/src/locales/es_ES.json → tabs["Exchange rates"]
= "Tipos de cambio"` (lowercase r, the tab's actual AD_Tab name), and `useMenuLabel()`'s
lookup is case-sensitive, so the capital-R string never matches and falls through to
the raw untranslated string.

**Correction (2026-08-26, after review):** the first version of this fix removed the
`label` line entirely and changed `generate-frontend.js`'s fallback to try
`entity.tabName` before `toLabel(key)`, on the assumption that no explicit label was
the established pattern. That assumption was wrong and the `schema_forge_core` change
was reverted: every *other* window's `secondaryTabs.<key>.label` (`contacts.bankAccount:
"Bank Account"`, `warehouse.productTransactions: "Transactions"`, etc.) already
declares an explicit label that exactly matches a `tabs[...]`/`genericLabels[...]`
dictionary key — verified across every `decisions.json` in the repo. This tab is the
only one whose author mistyped the casing; every other one already follows this
convention correctly. The right fix is the same one-line casing correction any of
those windows would need if someone introduced the same typo — no generator change.

**Fix:** correct the casing to `"label": "Exchange rates"` in
`window.secondaryTabs.exchangeRates` in both `decisions.json` files, matching the
dictionary key exactly.

**Files:** `artifacts/sales-invoice/decisions.json`, `artifacts/purchase-invoice/decisions.json`

### Error 2 — Column "Importe en Moneda Extranjera" mistranslated

**Cause:** the grid column label resolves via `useLabel()(col.column)` →
`dictionary.fields["Foreign_Amount"].label`, a dictionary key **shared** with
Payment In/Out's own Exchange Rates tab (same `C_Conversion_Rate_Document` table,
same AD_Element). A blind rename of `es_ES.json → fields.Foreign_Amount.label`
would silently relabel Payment Out too (verified: `artifacts/payment-out/decisions.json`
declares its own `entities.exchangeRates` reusing the same `Foreign_Amount` column).

**Fix:** use the existing **scoped override** mechanism instead of touching the
shared dictionary — `window.labelOverrides.{es_ES,en_US}.Foreign_Amount`, already
present in both invoices' `decisions.json` for other fields (`OutstandingAmt`,
`em_etgo_delivery_status`, etc.) and already wired: `DetailView.jsx` passes
`props.labelOverrides` down to every secondary tab's `Table`/`Form`, and
`resolveLabel(dictionary, columnName, langOverrides)` checks `langOverrides` first.

Add to both `decisions.json`:
```json
"labelOverrides": {
  "es_ES": { "Foreign_Amount": "Importe en Moneda Objetivo", ... },
  "en_US": { "Foreign_Amount": "Target Currency Amount", ... }
}
```
(English side included for consistency — the current shared EN label has a
pre-existing "Foreign  Amount" double-space typo and the wrong semantic; not
touching the shared dictionary avoids the same Payment-Out collateral-impact risk.)

**Files:** same two `decisions.json` (merge into the existing `labelOverrides` block).

### Error 3 — "Importe en Moneda Objetivo" not editable / no reciprocal recalculation

**Cause:** NOT a backend gap — `InvoiceExchangeRateHandler.handleUpdate()` +
`resolveEffectiveDocRate()` already implement the reciprocal rate↔foreignAmount
recalculation server-side, and `contract.json` already marks both `rate` and
`foreignAmount` `visibility: editable` (only Posted/Processed/Reversed gate them).

The real bug is in the generic grid component `InlineLinesPanel.jsx:288-291`:
```js
const isTrailing = col === trailingColumn;
if (isTrailing && showActions) return null;
```
`trailingColumn` is "the last column of type `amount`" (`InlineLinesPanel.jsx:863-865`),
a heuristic meant for a computed running-total column (e.g. Lines' "Importe bruto de
línea") that should hide under the hover/edit action icons. `foreignAmount` is the
**only** `amount`-type column in the Exchange Rates grid, so it gets caught by this
heuristic and renders `null` — no value, no input — whenever the row is hovered or in
edit mode. Live-verified: in edit mode only one `<input>` exists in the DOM (for
`rate`); `foreignAmount`'s cell is empty, not even a read-only span.

The columns builder already supports an escape hatch for exactly this
(`generate-frontend.js:471`: `noTrailingPart = fragmentIf(f.noTrailing, ', noTrailing: true')`,
driven by a per-field `decisions.json` flag — already used by `artifacts/amortization/decisions.json`).

**Fix:** add `"noTrailing": true` to `entities.exchangeRates.fields.foreignAmount` in
both `decisions.json`. No shared-component code change needed.

**Files:** same two `decisions.json`.

### Error 4 — No empty-state feedback when the tab has zero rows

**Cause:** `DetailView.jsx`'s `SecondaryTableTab` (~line 571) gates the empty-state
illustration on `hasAddFields` (`st.addLineFields` configured):
```js
const showEmptyState = secondaryChildren.length === 0 && !isAddingThis
    && props.hook.editing && hasAddFields && canAddMore && !props.st.customAddModal && !tabReadOnly;
```
`exchangeRates` has no `addLineFields` in `decisions.json` (rows are backend-managed,
auto-created by `autoCreateOrUpdateConversionRateDocument`), so `hasAddFields` is
always `false` and the empty-state branch never runs — the table area just renders
blank. The primary "Líneas" tab has no such gate (`shouldShowLinesEmptyState`,
`DetailView.jsx:878-879`), which is the inconsistency the ticket calls out.
Live-verified on invoice `10000023` (EUR invoice, 0 exchange-rate rows): fully blank
area under the column headers.

**Fix:** decouple "show the illustration" from "can add a row manually":
- `SecondaryTableTab`: drop `hasAddFields`/`canAddMore` from the `showEmptyState`
  condition; keep them only to decide whether the CTA button renders.
- `secondaryTabEmptyState()` (`detailViewHelpers.jsx`): render the icon + "no
  records" title unconditionally; render the subtitle + "+ Add" button only when
  `onAddLineClick` is provided.

This is a shared-component fix (per CLAUDE.md, generated files are never hand-edited)
that benefits every secondary tab without `addLineFields`, not just this one — no
existing tab regresses because every current caller of `secondaryTabEmptyState`
already has `addLineFields` configured (verified: `DetailView.secondaryAddLineHandlers.vitest.jsx`'s
3 tests all use tabs with `addLineFields`, so `onAddLineClick` stays truthy for them
and the CTA keeps rendering exactly as before).

**Files:** `tools/app-shell/src/components/contract-ui/DetailView.jsx`,
`tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx`

### Error 5 — Duplicate records when currency changes more than once

**Cause:** `AbstractInvoiceHeaderHandler.findConversionRateDocumentId()` (line 1303)
matches the existing row by `(c_invoice_id, c_currency_id, c_currency_id_to)`. Since
`c_currency_id` (the doc currency) changes on every currency switch, EUR→GBP→USD
never finds the GBP row when looking for USD — `upsertConversionRateDocument` always
falls to `INSERT`, leaving the GBP row orphaned forever. `c_currency_id_to` (org
currency) never changes for a given invoice, so it's the right join key; `c_currency_id`
should not be part of the lookup at all — it's the very thing that's supposed to be
*updated in place*, not matched on.

**Fix:**
1. `findConversionRateDocumentId` → `findConversionRateDocumentIds` (plural): match
   by `(c_invoice_id, c_currency_id_to)` only, `ORDER BY created DESC` (no `LIMIT 1` —
   we need to see every stray row).
2. `upsertConversionRateDocument`: if the list is non-empty, `UPDATE` the most recent
   row (now also writing `c_currency_id = ?`, since the currency itself must update
   in place) and `DELETE` any further rows in the list. If empty, `INSERT` as today.

This self-heals on the very next header save/currency change for any invoice that
already has stray duplicate rows from this bug — no data migration needed.

**Files:** `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractInvoiceHeaderHandler.java`

**Out of scope:** `InvoiceFromOrderSupport.propagateOrderRateToInvoice()` has its own
similar-looking find/insert, but it only runs once at invoice-creation time from an
order (the invoice cannot have pre-existing rows yet), so it cannot exhibit this bug
and is not touched. `payment-out`'s Exchange Rates tab has `entities.exchangeRates.exclude: true`
— not active, unaffected by any of the above.

## Implementation checklist

| # | File | Change |
|---|------|--------|
| 1 | `etendo_schema_forge/artifacts/sales-invoice/decisions.json` | Remove `secondaryTabs.exchangeRates.label`; add `foreignAmount.noTrailing: true`; add `Foreign_Amount` to `labelOverrides.{es_ES,en_US}` |
| 2 | `etendo_schema_forge/artifacts/purchase-invoice/decisions.json` | Same 3 changes |
| 3 | `etendo_schema_forge/tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx` | `secondaryTabEmptyState()`: subtitle+button conditional on `onAddLineClick` |
| 4 | `etendo_schema_forge/tools/app-shell/src/components/contract-ui/DetailView.jsx` | `SecondaryTableTab`: drop `hasAddFields`/`canAddMore` from `showEmptyState`; gate only the CTA |
| 5 | `etendo_core_pg/modules/com.etendoerp.go/.../AbstractInvoiceHeaderHandler.java` | `findConversionRateDocumentId` → `findConversionRateDocumentIds`; upsert keeps newest, deletes strays, updates currency in place |
| 6 | `etendo_core_pg/modules/com.etendoerp.go/src-test/.../AbstractInvoiceHeaderHandlerTest.java` | Update `autoCreateOrUpdate_updateBranch_whenRecordExists` for new SQL param order; add a new test for the multi-row cleanup path |
| 7 | `etendo_schema_forge/tools/app-shell/src/windows/custom/shared/useDocumentCurrency.js` | *(Bonus finding, not ETP-4836)* `resolveDualCurrencyDisplay`: drop `etgoRate !== 1` exclusion |
| 8 | `etendo_schema_forge/tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx` | *(Bonus finding)* Same fix, inlined copy of the same logic |
| 9 | `etendo_schema_forge/tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx` | *(Bonus finding)* Update test for `eTGOCurrencyRate === 1` to assert corrected behavior |
| 11 | `etendo_schema_forge/docs/generated-custom-windows/sales-invoice.md`, `purchase-invoice.md` | Doc freshness — reflect the removed `label` override and new `noTrailing`/`labelOverrides` entries |

## Regeneration / deploy steps

1. `make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1` in `etendo_schema_forge`
   (frontend-only changes — labels, `noTrailing`, no NEO field-visibility change → no
   `PUSH_TO_NEO=1`, no `export.database` needed).
2. Java change in `com.etendoerp.go` — **user compiles and restarts Tomcat manually**
   (per instructions, not automated here).

## Test plan — live verification (after compile + Tomcat restart)

Reproduce each ticket Given/When/Then via the Chrome MCP against `http://localhost:3100`:

1. **Error 1:** open a sales/purchase invoice with an Exchange Rates row, confirm the
   tab reads "Tipos de cambio" (app locale es_ES).
2. **Error 2:** same tab, confirm the amount column header reads "Importe en Moneda
   Objetivo".
3. **Error 3:** open a draft invoice in a non-org currency, enter edit mode on the
   Exchange Rates row, confirm the "Importe en Moneda Objetivo" input is present and
   editable, edit it, confirm "Índice" recalculates (and vice versa).
4. **Error 4:** open a draft invoice with 0 Exchange Rate rows (org-currency invoice),
   confirm the tab shows the "no records" illustration instead of a blank area.
5. **Error 5:** on a draft invoice, change currency EUR→GBP→USD, confirm only one
   Exchange Rates row remains (EUR→USD), no GBP row left behind.

Also spot-check: `payment-out`'s Exchange Rates tab (excluded/inactive) and any other
window using `secondaryTabEmptyState` still render their "add" CTA unchanged.

## Definition of done

- [x] All 5 ticket Given/When/Then cases verified live
- [ ] `AbstractInvoiceHeaderHandlerTest` green (updated + new test) — user compiled/restarted Tomcat successfully (implies build passed); test run not separately confirmed here
- [x] `npx sf-validate-pipeline --scope=sales-invoice,purchase-invoice` clean
- [x] No regression in `DetailView.secondaryAddLineHandlers.vitest.jsx`
- [x] Bonus finding (dual-currency preview, `eTGOCurrencyRate === 1`) fixed and
      live-verified on sales-invoice, sales-order, sales-quotation; 102/102 Vitest
      passing across the touched preview/currency test files
- [x] `com.etendoerp.go` committed
- [ ] `com.etendoerp.go` pushed
- [x] `etendo_schema_forge` committed (not pushed — pending user decision)
- [ ] PR to `epic/ETP-3504` in all three repos — not yet created
