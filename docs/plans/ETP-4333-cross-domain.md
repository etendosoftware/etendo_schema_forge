# ETP-4333 — Cross-domain plan

**Feature:** Assets window bug fixes — Cancel button freeze and amount-field
recalculation deferred to blur.

This PR is approved as cross-domain because the two bugs required small,
opt-in changes to generic `contract-ui` components (`DetailView.jsx`,
`EntityForm.jsx`) that are shared across all windows. Both changes are
strictly additive and controlled by an opt-in flag (`calloutOn: 'blur'`)
that only Assets sets — every other window takes the exact same code path
as before.

## Domains touched

### `window:assets` (primary)
The features and fixes themselves — contained in the Assets custom layer:
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` —
  currency-echo `useRef` freeze fix; `computeAssetAmounts()` (local replica
  of `SL_Assets.java` arithmetic); `handleAmountChange` applying the triple
  via `onLocalChange`; the 3 amount fields marked `calloutOn: 'blur'`.
- `docs/generated-custom-windows/assets.md` — window guide updated with
  the ETP-4333 section.
- Matching `__tests__` for the above.

### `platform-change` (shared `contract-ui`)
Generic components that required minimal opt-in extension:
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — added
  `DeferredInput` component (local buffer while typing, commits on blur).
  Only rendered when a field carries `calloutOn: 'blur'`; the default
  `<Input>` branch is byte-identical to the pre-ETP-4333 behavior.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — extracted
  `fireCallout` from `handleChangeWithCallout` (behavior-identical refactor);
  added `onLocalChange={hook.handleChange}` as an additive prop to the
  Panel and `formFooter` renders. Both changes are no-ops for any window
  that does not consume `onLocalChange`.
- Matching `__tests__` for the above.

## Tests

- **Frontend (Vitest + node:test):** full `contract-ui` + `assets` suites
  green (2305 vitest / 948 node:test / 0 failures). New coverage:
  - `AssetsDetailPanelAmounts.vitest.jsx` — `computeAssetAmounts` all
    branches (including the `amort===0` short-circuit that was the root
    cause), `handleAmountChange` routing, zero callout POSTs for amount
    fields, clear-AssetValue regression.
  - `EntityForm.deferredInput.vitest.jsx` — `DeferredInput` no-op blur,
    changed-blur, numeric equality, empty→`'0'`, buffer sync.
  - `DetailView.onLocalChange.test.js` — `onLocalChange` wiring.
  - `AssetsDetailPanelCurrencyEcho.vitest.jsx` — freeze fix (echo once per
    new-record session, no re-fire on `onChange` identity change).
- No-regression: 27 existing `applyCalloutFieldUpdates` helper tests assert
  the generic guard behavior is byte-identical (no `authoritativeKeys`
  bypass remaining in the codebase).

## Rollback

- **Frontend:** revert the `feature/ETP-4333` schema_forge commits.
  `DeferredInput` is removed, `EntityForm` and `DetailView` revert to their
  pre-ETP-4333 state, and `AssetsDetailPanel` loses the local-compute and
  freeze fix. No other window is affected.
- No backend/DB changes are involved (the `AssetAmortizationValidationHandler`
  was removed from scope before the commit).
