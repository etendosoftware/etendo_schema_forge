# ETP-4312 — Cross-domain plan: single-source the "view document" arrow

## Why this change is cross-domain

The duplicate-arrow bug lives in a **shared platform component**,
`tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx`, and in the
two shared locale files (`packages/app-shell-core/src/locales/{es_ES,en_US}.json`).
Because that component and those labels are consumed by confirm flows across
**both the sales and purchases verticals**, a single behavioural fix
necessarily touches windows in more than one domain. Splitting it per window
would duplicate the same edit and leave the shared component inconsistent.

## Domains touched (dominios)

- **platform-change** — `ConfirmResultModal.jsx` now derives the primary button
  label from the doc type's `viewKey` and renders exactly one SVG arrow.
- **app-shell-core** — the 5 view-action labels (`soViewInvoice`, `poViewInvoice`,
  `soViewShipment`, `poViewReceipt`, `sqViewOrder`) lose the embedded `→` glyph in
  both `es_ES` and `en_US`.
- **window:sales-order** — `OrderConfirmModal`, `OrderCreateInvoice` (drop the
  hardcoded `primary`; append the glyph on plain-text renders).
- **window:sales-quotation** — `QuotationConfirmModal` (glyph in code, not label).
- **window:purchase-order** — `PurchaseOrderActions` (drop the hardcoded `primary`).
- **window:goods-shipment** — E2E spec assertions only.
- **shared-custom-capability** — `useOrderWindow.jsx`.
- **repo-infra** — `Makefile` (parametrize E2E `WORKERS`) and `.githooks/pre-push`
  (optional opt-in Playwright run). Dev-tooling, no runtime impact.

## Tests

- **Node** — `view-labels-no-arrow.test.js` (no `→` in the 5 keys + ES/EN parity),
  `type-config-locale-consistency.test.js` (every `TYPE_CONFIG.viewKey` resolves in
  both locales), and source-guards on the custom components (no re-introduced
  hardcoded `primary`, glyph kept in code).
- **Vitest** — `ConfirmResultModal.vitest.jsx`: single-arrow invariant (exactly one
  SVG, no `→` in text), all 4 doc types derive the correct label, `primary`
  override wins, unknown type renders no primary button.
- **Playwright** — `goods-shipment-confirm-and-invoice` asserts "Ver factura" with
  one arrow SVG and no `→` in text; `sales-order-confirm-idempotency` asserts the
  symmetric "Ver albarán" derived label.

## Rollback

Single-commit revert. The change is config + a shared component + label values
plus additive tests; reverting the commit restores the previous labels (with the
embedded `→`) and the prior `ConfirmResultModal` behaviour. No DB migration, no
NEO push, no schema change is involved, so there is nothing to unwind beyond the
git revert. The `Makefile`/`pre-push` tooling changes are inert when reverted.
