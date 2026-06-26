# ETP-4329 — Cross-domain plan

This PR is intentionally **cross-domain**: it adds a shared component
(`InvoicePaymentHistoryModal`) used by two windows, modifies both window-specific
`InvoiceHeaderTable` custom components, and adds i18n keys to `app-shell-core`.
This plan documents the domains, tests, and rollback so the domain-boundary check
can approve the combined change.

## Domains (dominios)

- **app-shell-core** — New i18n keys added to both `es_ES.json` and `en_US.json`
  under `packages/app-shell-core/src/locales/`. Keys cover: `statusDocColumn`,
  `impTotal`, `pendingPaymentColumn`, `cobrada`, `pagada`, `invoiceReceipts`,
  `invoicePaymentsTitle`, `noCobroYet`, `noPagoYet`, `addCobro`, `addPago`,
  `cobrosRegistrados`, `pagosRegistrados`. These keys are shared across both
  invoice windows and cannot be split without duplicating the locale entries.

- **shared-custom-capability** — New component
  `tools/app-shell/src/windows/custom/shared/InvoicePaymentHistoryModal.jsx`.
  This modal shows payment history for an invoice and an "Add payment" action.
  It is shared between `sales-invoice` and `purchase-invoice` because both
  windows have the identical UX flow; building two separate copies would diverge
  immediately.

- **window:sales-invoice** — `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx`
  updated to include: `documentStatus` column (doc status badge), `grandTotalAmount`
  renamed to "Imp. total", `outstandingAmount` column rendered as an amber chip
  (outstanding > 0) or green "Cobrada" badge (fully paid), and a `_nav` chevron
  column. Opens `InvoicePaymentHistoryModal` on chip click.

- **window:purchase-invoice** — Same changes as `sales-invoice` with the badge
  showing "Pagada" and `specName="purchase-invoice"` wired through to the modal.

The four domains are touched in one PR because the feature is a single coherent
UX slice (payment status visibility in invoice lists) and splitting would leave
one window half-done with broken shared imports.

## Tests

- Both `InvoiceHeaderTable` components render the correct badge/chip via the
  `outstandingAmount` custom column renderer — covered by existing visual
  regression baseline.
- `InvoicePaymentHistoryModal` interactive elements carry `data-testid` attributes
  (enforced by the pre-commit codemod).
- The pre-push pipeline validator runs clean for both windows (`make validate-pipeline`).

## Rollback

No data or schema changes — this is a pure frontend/UI change. To roll back,
`git revert` the commits on `feature/ETP-4329`; the invoice list returns to its
previous appearance without the status/payment columns, and the shared modal file
is removed. No DB migration, no NEO push, and no Tomcat restart is required.
