# ETP-4027 Cross-Domain Plan

## Scope

This PR intentionally spans the full currency-on-orders feature end to end: the
three order/quotation windows that surface the dual-currency UI, the shared
preview / hook plumbing they all consume, the generator that emits the
DetailView wiring, the locale strings that surface the new validation, and the
paired runtime changes in `com.etendoerp.go` (separate commit). These pieces
are mechanically interdependent and would leave broken intermediate states if
split.

Dominios (domains):

- `window:sales-order`: header currency editable on draft orders with saved
  lines; pricelist-driven conversion of new lines via `activeCurrencyConversionRef`;
  `lines.currency` declared `editable / grid: false / form: false` in
  `decisions.json` so NEO PATCH accepts the conversion-time currency override.
- `window:purchase-order`: identical behavior — header editable, lines hidden +
  writable, same conversion path.
- `window:sales-quotation`: regenerated as a side effect of `cli/` and shared
  preview changes; same shared infrastructure consumed.
- `platform-change`: `tools/app-shell/src/components/contract-ui/DetailView.jsx`
  — drop `pendingCurrencyConversionRef`, `lineOriginalBasePriceRef`,
  `displayLogicWithCurrencyLock`, `saveCurrencyBeforeLines` workarounds; add the
  sync `useEffect` that re-evaluates `activeCurrencyConversionRef` whenever
  `hook.selected.currency` changes; move rate validation into
  `handleChangeWithCallout` (revert + toast on missing rate); mutate `result`
  in place inside the product-callout conversion block to avoid race with
  `applyUpdates`; override `result.currency` to header currency. Auxiliary
  `DataTable.jsx`, `InlineLinesPanel.jsx`, `useCallout.js` changes inherited
  from prior ETP-4027 commits on this branch.
- `shared-custom-capability`: `tools/app-shell/src/windows/custom/shared/*` —
  `useDocumentCurrency.js`, `OrderPreview.jsx`, `QuotationPreview.jsx`,
  `SummaryCard.jsx`, and the matching unit tests for the dual-currency preview
  cards. Inherited from prior ETP-4027 commits.
- `generator-change`: `cli/src/resolve-curated.js` and `cli/src/generate-frontend.js`
  — remove `saveCurrencyBeforeLines` from `WINDOW_BOOLEAN_TRUE_PROPS` /
  `WINDOW_KEY_ORDER` and from the generator template. Dead code after the
  trigger restriction was lifted in core.
- `app-shell-core`: `packages/app-shell-core/src/locales/en_US.json` and
  `es_ES.json` — `noConversionRateError` translation key surfaced when the
  dropdown validator reverts a currency change.
- `repo-infra`: `docs/generated-custom-windows/sales-order.md`,
  `purchase-order.md`, `docs/plans/2026-05-19-currency-pricelist-header.md`,
  `docs/plans/2026-06-16-currency-functional-model-analysis.md`,
  `docs/feedback.md`. The two window guides document the new behavior; the two
  plan docs capture the design path and the deviations from the original plan.
- Paired `com.etendoerp.go` PR (separate repo): removes the rate-check
  pre-hooks (`blockCompleteWhenNoExchangeRate`,
  `validateExchangeRateBeforeComplete`), exposes `currencyId` in the `/session`
  response, deletes the obsolete JUnit test, and exports the `ETGO_SF_FIELD.xml`
  updates that flip `IsReadOnly` to `N` for `header.currency` and
  `lines.currency` on the sales/purchase order specs. Also corresponds to the
  core change in `etendo_core_pg` PR (separate repo): removes the
  `C_Currency_ID` clause from `C_ORDER_CHK_RESTRINCTIONS_TRG.xml`.

## Reason

ETP-4027 is a single product feature: let users change the header currency on
a draft order at any moment, validate that a conversion rate exists, and apply
the rate automatically to lines added afterwards while keeping the line's
stored amount and currency consistent with the order header. The functional
model emerged through several iterations with the analyst (final
simplification confirmed 2026-06-18, captured in
`docs/plans/2026-06-16-currency-functional-model-analysis.md`).

Splitting any slice would leave broken intermediate states:

- Without the core trigger removal, the frontend dropdown validation reverts
  to a runtime 500 from `@20502@`.
- Without the NEO `IsReadOnly=N` config on `lines.currency`, the frontend's
  conversion-time `result.currency = toCurrency` override is silently stripped
  by `NeoFieldFilter` and lines land with the wrong currency ID.
- Without the new `currencyId` in `/session`, the sync `useEffect` cannot
  compare ID-level currencies and the bootstrap path silently does nothing.
- Without the in-place mutation fix in `handleLineFieldChange`, the
  conversion's `setFieldValues` is overwritten by the subsequent `applyUpdates`
  pushing the original (unconverted) `result`.

Shared preview hooks (`useDocumentCurrency`, `OrderPreview`) are consumed by
all three windows and were touched in earlier commits on this branch; they
remain part of this PR for atomicity.

## Tests

- `cd tools/app-shell && npx vitest run src/components/contract-ui` — covers
  `DetailView`, `DataTable`, callout normalization, and the contract-ui suite.
- `cd tools/app-shell && npx vitest run src/windows/custom/shared` — covers
  `useDocumentCurrency`, `OrderPreview`, `SummaryCard`, and the PDF-shared
  hooks unit tests.
- `node cli/src/validate-pipeline.js --scope=sales-order` and `--scope=purchase-order`
  — pipeline integrity (0 violations).
- `make regen ONLY=sales-order,purchase-order SKIP_EXTRACT=1` — verifies the
  decisions → contract → generated chain regenerates cleanly. (Was run during
  the implementation and confirmed idempotent against the committed artifacts.)
- Manual end-to-end verification (smoke flows performed 2026-06-18 using
  Playwright MCP against `localhost:3100`):
  - Order in org currency → save → add line → line in org currency, no conversion.
  - Order in org currency → change to non-org → save → bootstrap sets the ref →
    add line → line carries the non-org currency and the converted price.
  - Change currency to one without a defined rate → dropdown reverts +
    `noConversionRateError` toast surfaces.
  - Round-trip USD → EUR → USD on a saved order → header currency persists
    each save; the sync effect re-evaluates the ref correctly.
  - DB inspection of `C_ORDERLINE`: `C_CURRENCY_ID` matches the order header
    after conversion (no stale pricelist currency leaks).
- Phase 3 follow-up (pending): formalize the manual smoke flows into Playwright
  E2E specs (`sales-order-currency.mocked.spec.js` and
  `sales-order-currency-no-rate.mocked.spec.js`).

## Rollback

- Revert the two Schema Forge commits on `feature/ETP-4027`. The decisions /
  contract / generated artifacts revert atomically because they were
  regenerated together via `make regen`.
- Revert the paired `com.etendoerp.go` commit (`80a5fbeb` — Functional currency
  backend — drop rate pre-hooks). The rate-check pre-hooks come back; the
  `currencyId` field is removed from the `/session` payload but `currencyCode`
  remains, so existing FE consumers do not break.
- Re-run `make regen PUSH_TO_NEO=1` against the reverted decisions to restore
  `ETGO_SF_FIELD.IsReadOnly` to its previous state (`Y` for `header.currency`
  and `lines.currency`).
- The core trigger change (`C_ORDER_CHK_RESTRINCTIONS_TRG.xml` —
  `C_Currency_ID` clause removed in Phase 0) is a separate Etendo core commit;
  rolling it back independently is safe because the frontend simply reverts to
  not being able to change the currency on orders with lines — same behavior
  classic users see.
- No database export or destructive migration is included in this Schema
  Forge PR. The runtime behavior changes (rate validation moves from
  completion-time to change-time) are entirely additive and do not require
  data migration.
