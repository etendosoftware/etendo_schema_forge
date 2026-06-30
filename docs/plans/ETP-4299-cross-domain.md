# ETP-4299 Cross-Domain Plan — Purchases/Sales document flow fixes & shared form polish

## Why this change is cross-domain

ETP-4299 is a cohesive set of document-flow fixes that, by construction, spans
more than one domain: a goods-receipt import bug fix lives in a window custom
file, but the same delivery also touches **shared `contract-ui` platform
components** (`EntityForm`, `SelectorInput`) and **shared locale files**, plus a
friendly-rename regen of `sales-invoice` and a presentation tweak on the two
return windows. The platform and locale edits are consumed by confirm/import
flows across both the **purchases** and **sales** verticals, so splitting the
work per window would duplicate the same shared-component edit and leave the
generic UI inconsistent. The branch is therefore declared cross-domain and
labelled `cross-domain-approved` with this plan.

Base branch: `epic/ETP-3504`. Branch: `feature/ETP-4299`.

## Domains Touched (dominios)

| Domain | Files | Justification |
|--------|-------|---------------|
| `platform-change` | `tools/app-shell/src/components/contract-ui/EntityForm.jsx`, `SelectorInput.jsx`, `DetailView.jsx`, `ConfirmResultModal.jsx`, `ImportLinesModal.jsx`, `__tests__/DetailView.autoSaveOnBlur.test.js` | Shared generic `contract-ui` components. `EntityForm` now hides the "reversed" tab; `SelectorInput` filters out options whose translated label is null so empty/garbage entries never render. Consumed by every window, hence platform scope. |
| `app-shell-core` | `packages/app-shell-core/src/locales/en_US.json`, `packages/app-shell-core/src/locales/es_ES.json` | i18n keys for the changed flows, added/updated in both locales (EN/ES parity). |
| `generator-change` | `core-maps/ad-menu-cache.json` | Menu cache refresh consumed by the extract/generate pipeline. |
| `shared-custom-capability` | `tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx`, `ReturnWindowShell.jsx` | Shared custom building blocks reused by multiple return/confirm windows. |
| `root-global-sensitive` | `package-lock.json` | Lockfile refresh accompanying the dependency state; no new runtime dependency introduced. |
| `window:goods-receipt` | `artifacts/goods-receipt/custom/**`, `tools/app-shell/src/windows/custom/goods-receipt/**` (incl. `__tests__/`) | **Primary fix:** `ImportFromPurchaseOrderModal.jsx` stopped sending `orderQuantity` (maps to `M_InOutLine.QuantityOrder`), which the `m_inoutline` check constraint requires to be NULL for single-UOM products — this was causing a 500 on import. |
| `window:goods-shipment` | `artifacts/goods-shipment/custom/**`, `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` | Sibling shipment custom files aligned with the shared import/confirm changes. |
| `window:purchase-invoice` | `artifacts/purchase-invoice/custom/**` (incl. `__tests__/`), `tools/app-shell/src/windows/custom/purchase-invoice/RelatedDocuments.jsx` | Related-documents + import alignment with the shared components. |
| `window:sales-invoice` | `artifacts/sales-invoice/**` (decisions, contract, generated, custom) | Regenerated to introduce the `transactionDocument` field — a friendly rename of `cDocTypeTargetId` — via `decisions.json` + `make regen`. |
| `window:sales-order` | `artifacts/sales-order/custom/OrderConfirmModal.jsx` | Confirm modal aligned with the shared `ConfirmResultModal`/locale changes. |
| `window:return-material-receipt` | `artifacts/return-material-receipt/**` | Status dot disabled on `ReturnMaterialReceiptTable.jsx` (presentation only); contract/decisions regenerated. |
| `window:return-to-vendor-shipment` | `artifacts/return-to-vendor-shipment/**`, `tools/app-shell/src/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton.jsx` | Same status-dot tweak on `ReturnToVendorShipmentTable.jsx`; contract/decisions regenerated. |

### Most recent work in this push (4 commits)

1. **Fix goods-receipt import 500 from QuantityOrder** — `ImportFromPurchaseOrderModal.jsx`
   no longer sends `orderQuantity` (→ `M_InOutLine.QuantityOrder`); the `m_inoutline`
   check constraint requires it NULL for single-UOM products. Isolated custom-file change.
2. **Regen sales-invoice with `transactionDocument` field** — friendly rename of
   `cDocTypeTargetId`, expressed in `decisions.json` and regenerated through the pipeline.
3. **Disable status dot on return receipt/shipment tables** — presentation-only change to
   `ReturnMaterialReceiptTable.jsx` and `ReturnToVendorShipmentTable.jsx`.
4. **Shared `contract-ui` polish** — `EntityForm` hides the "reversed" tab; `SelectorInput`
   filters null-translated options out of the dropdown.

## Tests

All changes are covered by the project's three real test layers:

- **Pipeline validator** — `node cli/src/validate-pipeline.js --scope=goods-receipt,goods-shipment,purchase-invoice,sales-invoice,sales-order,return-material-receipt,return-to-vendor-shipment`
  reports **0 violations (0 blocking, 0 warnings)** for every touched window. The F1/F2
  source-hash/manifest checks are SKIP (enforced after the P2 generator patch), consistent
  with the rest of the repo.
- **Contract / unit tests (`make test` + Vitest)** — the goods-receipt import fix and the
  shared components are exercised by existing specs under
  `tools/app-shell/src/windows/custom/goods-receipt/__tests__/` (notably
  `ImportFromPurchaseOrderModal.vitest.jsx`, `ImportFromPurchaseInvoiceModal.vitest.jsx`,
  `GoodsReceiptBottomPanel.vitest.jsx`, `GoodsReceiptWindow.vitest.jsx`), by
  `tools/app-shell/src/components/contract-ui/__tests__/DetailView.autoSaveOnBlur.test.js`
  for the platform layer, and by `artifacts/purchase-invoice/custom/__tests__/purchaseInvoiceSubtype.test.js`.
- **Playwright E2E (`e2e/`)** — the affected document flows have mocked specs already present
  and re-run for this branch: `e2e/tests/flows/return-material-receipt.mocked.spec.js`,
  `return-to-vendor-shipment.mocked.spec.js`, `sales-invoice-import-no-reload.mocked.spec.js`,
  `purchase-invoice-import-from-receipt.mocked.spec.js`, `goods-shipment-confirm-and-invoice.mocked.spec.js`
  and `sales-order-confirm-idempotency.mocked.spec.js`.

No new test files were invented for this plan; the layers above already cover the touched code.

## Rollback

1. **Git revert** — revert the commits on `feature/ETP-4299` (or revert the merged PR). The
   change set is config + shared components + locale values + window custom files plus the
   pre-existing tests, so the revert is clean with no DB migration to unwind.
2. **Regenerated artifacts are reproducible** — `sales-invoice` and the two return windows
   were regenerated from `decisions.json`; any of them can be rebuilt deterministically with
   `make regen ONLY=<window>` (e.g. `make regen ONLY=sales-invoice`), so reverting `decisions.json`
   and re-running the pipeline restores the previous contract/generated output exactly.
3. **No NEO push / no schema change is required to unwind.** The `transactionDocument` rename is a
   contract-level friendly label, and the goods-receipt fix is an isolated custom-file change
   (removing the `orderQuantity` payload field) — reverting it simply restores the prior payload.
   The `package-lock.json` and `core-maps/ad-menu-cache.json` refreshes are inert once reverted.
