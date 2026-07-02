# Cross-Domain Plan: ETP-4332 — Figma design fixes for payment windows

## Dominios afectados

This PR intentionally touches multiple domains as part of a single cohesive visual/functional improvement
to the payment windows (cobros/pagos). The changes are tightly coupled and cannot be split without
breaking the feature.

| Domain | Files | Reason |
|--------|-------|--------|
| `app-shell-core` | `statusBadge.js`, locales | RPAP badge color fix — shared across all status consumers |
| `platform-change` | `DetailView.jsx`, `DocumentStatusPill.jsx`, `statusBadge.js` (tools), `useEntity.js` | Platform-level fixes required by both payment windows |
| `generator-change` | `generate-frontend.js`, `resolve-curated.js` | `statusFieldLabel` propagation to contract and generated output |
| `shared-custom-capability` | `PaymentDetailSidebarBase.jsx`, `PaymentHeaderTableBase.jsx`, `PaymentConciliadoBadge.jsx`, `ReactivarModal.jsx` | Shared panel components used by both payment-in and payment-out |
| `window:payment-in` | All payment-in artifacts | Target window |
| `window:payment-out` | All payment-out artifacts | Target window — symmetrical feature with payment-in |

## Justification for coupling

- The status badge color fix (`rpap` → gray) must be applied at the `app-shell-core` level so it
  affects the StatusTag component in the grid for BOTH windows simultaneously. A window-scoped change
  would not reach the shared component.
- The shared sidebar (`PaymentDetailSidebarBase`) and header table (`PaymentHeaderTableBase`) serve
  both windows by design — any change to them is inherently cross-window.
- The generator fix (`statusFieldLabel` propagation) is a pipeline-level concern that must be applied
  globally to avoid breaking other windows on next regen.

## Tests

All changes are covered by:
- `tools/app-shell/src/lib/__tests__/statusBadge.vitest.jsx` — badge color expectations updated and passing
- `cli/test/resolve-curated-coverage.test.js` — `statusFieldLabel` propagation tests added
- `tools/app-shell/src/hooks/__tests__/useEntity.coverage.vitest.jsx` — `columnName` confirm key test added

## Rollback plan

Each domain is independently reversible:
- **Badge color**: revert `packages/app-shell-core/src/lib/statusBadge.js` — no DB changes, client-side only
- **Generator fix**: revert `cli/src/resolve-curated.js` and `cli/src/generate-frontend.js`, re-run `make regen` on affected windows
- **Shared panels**: revert `tools/app-shell/src/windows/custom/shared/` — panels are loaded dynamically, no server restart needed
- **Window artifacts**: revert individual `artifacts/payment-*/` directories, run `push-to-neo.js` to restore previous NEO config, then `./gradlew export.database`

No database migrations are included. All changes are UI/config layer only.
