# Cross-Domain Plan: ETP-4332 — RPR/RPAE status color fix + confirm label

> Supersedes the previous revision of this file (which documented an earlier,
> already-merged round of ETP-4332 work: the confirm/reactivate flow split
> across this repo and `schema_forge_core`). This revision documents a
> **new, later round of commits on the same `feature/ETP-4332` branch**,
> scoped to a status-color rendering bug and its regenerated artifacts. That
> earlier round's sibling-repo PR has already merged and published; nothing
> in `schema_forge_core` changed in this round.

## Why this PR touches more than one domain

The root defect is a **platform-level** rendering bug: the generic grid cell
renderer (`DataTable.cellRenderers.jsx`'s `renderStatusCell`) was calling the
bundled `getStatusTone` from the published `app-shell-core` package instead
of this repo's own corrected local `statusBadge.js`, so it still bucketed
RPR (and, in a follow-up fix, RPAE) as amber/"warning" instead of
deposited/green. Every other surface that renders the same status codes
(`PaymentConciliadoBadge`, `PaymentHeaderTableBase`, `DocumentStatusPill`)
already treated them correctly via the local module — only the shared grid
renderer disagreed.

`renderStatusCell` is used by every window's list grid, not just payments,
so the fix is inherently a `platform-change`. But the bug was only visible
(and only tested) on the payment-in/payment-out list grids, and fixing it
correctly required extending the shared payment components' own status
buckets and regenerating both windows' artifacts to pick up an
already-published but not yet locally-synced generator fix
(`confirmModal`/`processConfirmModal` wiring). None of these three layers is
independently useful without the other two: shipping the platform fix alone
without the shared-component + regen work would leave RPAE unfixed and the
Confirm button showing a stale i18n key; shipping only the window artifacts
without the platform fix would leave the grid still showing the wrong color
for every other window that reaches an RPR/RPAE-equivalent state.

## Domains touched

| Domain | Files | Reason |
|--------|-------|--------|
| `platform-change` | `tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx` (+ its `__tests__/DataTable.*.vitest.jsx` suites), `tools/app-shell/src/lib/statusBadge.js` (+ `__tests__/statusBadge.vitest.jsx`), `tools/app-shell/src/locales/en_US.json`, `tools/app-shell/src/locales/es_ES.json` | `renderStatusCell` is the generic list-grid status renderer shared by every window; `statusBadge.js` is the single source of truth for status-to-tone mapping that the renderer was failing to use. Locale keys were added/fixed for the Confirm button label. |
| `shared-custom-capability` | `tools/app-shell/src/windows/custom/shared/{ConfirmPaymentModal,PaymentConciliadoBadge,PaymentHeaderTableBase}.jsx` (+ their `__tests__/*.vitest.jsx`), new `tools/app-shell/src/windows/custom/shared/__tests__/PaymentReactivateConfirmIntegration.vitest.jsx` | Shared components used by both payment-in and payment-out — extending the "deposited" status bucket to RPAE and fixing the amount sign/label rendering in the list grid, plus the confirm-label fix, all live here since both windows share these files by construction |
| `window:payment-in` | `artifacts/payment-in/contract.json`, `artifacts/payment-in/contract.mcp.json`, `artifacts/payment-in/generated/web/payment-in/FinPaymentPage.jsx` | Regenerated after `npm ci` synced `schema-forge-cli` from a stale 0.1.10 to the pinned 0.3.0, picking up the already-published `confirmModal`/`statusFieldLabel` wiring that had never reached this window's generated output |
| `window:payment-out` | `artifacts/payment-out/contract.json`, `artifacts/payment-out/contract.mcp.json`, `artifacts/payment-out/generated/web/payment-out/HeaderPage.jsx` | Same regeneration, symmetrical window |

No `schema_forge_core` (sibling repo) changes are part of this round — the
generator/package fix this regen picks up was already published from the
prior round's sibling PR.

## Commits in this round

1. `Fix RPR status color mismatch in list grid` — `renderStatusCell` now
   passes the local `statusBadge.js` tone explicitly instead of the bundled
   `getStatusTone`. No other status code's rendering changed.
2. `Regenerate payment-in/out with published confirmModal fix` — `npm ci`
   resynced `schema-forge-cli` to the pinned 0.3.0; regenerating both
   windows picked up the `confirmModal`/`processConfirmModal` wiring and
   `statusFieldLabel` pass-through already shipped upstream.
3. `Treat RPAE as deposited status, fix confirm label` — extends the RPR fix
   to RPAE (`statusBadge.js`, `PaymentConciliadoBadge.jsx`'s
   `DEPOSITED_STATUSES` set, plus amount sign/label rendering in
   `PaymentHeaderTableBase.jsx`); fixes the Confirm button using a stale
   `'confirmar'` i18n key instead of `'confirm'`; adds
   `PaymentReactivateConfirmIntegration.vitest.jsx`, an integration
   regression test proving the Reactivar toolbar button on the real
   generated `FinPaymentPage`/`HeaderPage` shows the confirmation modal via
   the real `ReactivarModal` chain before `handleProcess` fires, for both
   payment-in and payment-out.

## Tests

`npx vitest run` across all touched suites — `PaymentReactivateConfirmIntegration.vitest.jsx`,
`PaymentHeaderTableBase.vitest.jsx`, `statusBadge.vitest.jsx`,
`PaymentConciliadoBadge.vitest.jsx`, plus the `DataTable.*.vitest.jsx` suites
from the first commit. Result: **201 passed, 0 failed**, no regressions.

## Rollback plan

Pure frontend change — no DB/schema migration, no `push-to-neo` config
change. Rollback is reverting the 3 commits (or the squash-merge commit once
merged); no data cleanup is required. If a revert needs to re-sync the
regenerated artifacts, `make regen ONLY=payment-in,payment-out` restores them
from the current `decisions.json` + published generator.
