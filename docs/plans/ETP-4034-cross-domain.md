# Cross-Domain Plan — ETP-4034

## Domains

- `window:return-to-vendor-shipment` — primary scope: new window (artifact pipeline, custom components, preview modal, PDF hook, confirm-with-invoice button, e2e mocked spec)
- `window:return-material-receipt` — companion updates: `ConfirmWithCreditButton` refactored to use `ConfirmWithCreditButtonBase`; `useReturnReceiptPdf` updated to use shared helpers extracted in this PR
- `shared-custom-capability` — shared components extracted to avoid CPD: `ConfirmWithCreditButtonBase`, `ReturnWindowShell`, `buildReturnPreviewContent`, `ReturnDocStatsPanel`, `PrintButton`, `useConfirmWithCredit`; new `pdfUtils` helpers `buildReturnDocCommonFields` and `sortLinesByLineNo`
- `generator-change` — `generate-contract.js`: extracted `applyGridHints` to fix cognitive complexity; added `gridReadOnly` field support to `applyFieldUIHints` and contract generator; `resolve-curated.js`: propagates `gridReadOnly` through the curated schema
- `platform-change` — `registry.js`: registers the new `return-to-vendor-shipment` window; `docChipTypes.jsx`: adds the `return-to-vendor-shipment` document type for the related-documents chip renderer

## Why mixed

The new return-to-vendor-shipment window inherently requires registering it in the platform registry and the document-chip catalog. The shared components were extracted from return-material-receipt to serve both windows without duplication; this extraction touched the receipt window as a side effect. The generator change (`gridReadOnly`) was needed to support a field-level decision added in the return-to-vendor artifact.

## Tests

- `return-to-vendor-shipment.mocked.spec.js` — E2E mocked flow (list, preview, confirm)
- `ConfirmWithCreditButton.spec.jsx` (return-material-receipt) — confirm-with-credit button unit tests
- `buildReturnPreviewContent.test.js` — shared preview content builder
- `ConfirmWithCreditButtonBase.test.js` — shared base button
- `ReturnWindowShell.test.js` — shared shell component
- `generate-contract.test.js` — contract generator including gridReadOnly
- `generate-frontend.test.js` — frontend generator
- `resolve-curated.test.js` — curated schema resolution

## Rollback

- `window:return-to-vendor-shipment`: revert the feature commits on `feature/ETP-4034`. The window disappears from the registry and the new artifact files become unreachable. No DB schema change; NEO config is pushed separately via `push-to-neo.js`.
- `shared-custom-capability`: the extracted shared components were not present before this PR. Reverting removes them; both return windows fall back to inline implementations (already included in the revert).
- `generator-change`: reverting `generate-contract.js` removes `gridReadOnly` support and restores the original `applyFieldUIHints`. Regenerating any window that uses `gridReadOnly` in `decisions.json` will lose that field hint — acceptable on rollback.
- `platform-change`: reverting `registry.js` and `docChipTypes.jsx` removes the window entry and chip type — cosmetic, no data loss.
