# Cross-Domain Plan: ETP-4408 — Return windows billing status, receipt upload, readOnly fix

## Scope (dominios)

This PR touches two sibling windows plus a shared component within the **purchases/sales returns** vertical:

| Domain | Files |
|---|---|
| `window:return-material-receipt` | contract, decisions, generated web output, `ReturnMaterialReceiptPreview.jsx`, doc |
| `window:return-to-vendor-shipment` | contract, decisions, generated web output, doc |
| `shared-custom-capability` | `ReturnDocStatsPanel.jsx` (preview-card row shared by both windows) |

Companion backend commit on the sibling `com.etendoerp.go` repo (same `feature/ETP-4408` branch): `ReturnShipmentUtils.fetchInvoiceStatuses` + both header handlers now inject the real `invoiceStatus`.

## Why cross-domain changes are necessary

`return-material-receipt` (sales-side return receipt) and `return-to-vendor-shipment` (purchase-side return shipment) are structurally identical windows (same underlying `M_InOut`/`M_InOutLine` tables, same shared preview building blocks) implementing the same Confluence DF ("Documento A — Albarán de Devolución"). Every change in this PR affects both symmetrically:

1. **Billing status**: `invoiceStatus` was `discarded` in both windows' `decisions.json`; both needed the same grid column (`columnType: "percent"`) and the same preview-panel row, rendered through the shared `ReturnDocStatsPanel.jsx`. Fixing one without the other would leave the two windows visibly inconsistent (one shows "Facturado", the other doesn't) despite sharing the same component.
2. **readOnly regression**: `businessPartner` had the identical bug in both windows (same root cause — an AD rule containing the non-client-evaluable `@HAS_M_INOUTLINES@` session variable). Splitting this fix across two PRs would leave one window still broken.
3. **Receipt upload** (sales-side only, `return-material-receipt`): per the DF, only this window's left preview panel changes from the system-generated PDF to a customer-supplied upload slot — `return-to-vendor-shipment` explicitly keeps its system PDF, so this part is NOT duplicated.

Splitting `return-material-receipt` and `return-to-vendor-shipment` into separate PRs would require two review cycles for what is functionally one fix applied consistently to a matched pair of windows, and would risk merging one half without the other.

## Rollback plan

If issues are detected after merge:
1. Revert this branch via `git revert` on the merge commit (single atomic revert) in `etendo_schema_forge`.
2. Revert the companion commit on the sibling `com.etendoerp.go` PR — `invoiceStatus` reverts to always-0/absent (cosmetic regression, not a hard failure since the frontend already guards `invoicePercent != null`).
3. No DB schema changes were made; no migration/backfill needed for rollback.

## Tests

- Vitest: `ReturnMaterialReceiptPreview.vitest.jsx` (new, 13 tests), `ReturnDocStatsPanel.vitest.jsx` (new, 10 tests) — both green, plus the pre-existing 26 tests in `return-material-receipt/__tests__/` unaffected.
- `make validate-pipeline`: 0 violations for both windows after every regen.
- Manual verification steps documented in `docs/generated-custom-windows/return-material-receipt.md` and `return-to-vendor-shipment.md` (billing-status percentage, upload panel persistence, no Attachments tab, businessPartner locked when completed).
