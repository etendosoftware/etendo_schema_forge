# Cross-Domain Plan — ETP-4950

## Context

Bug: an Automatch rule with Producto / Proyecto / Centro de costos generated a
`FIN_FinaccTransaction` without them, and the three selectors were always offered in the rule
form regardless of which accounting dimensions are active in the Esquema Contable.

The gating half of the fix cannot live inside a window: `match-rule` is rendered entirely by the
generic `ListModalWindow`, and it has no custom component directory. So the *only* place a
per-field visibility rule can be applied is the shared component — hence the platform scope.

## Domains

- `platform-change` — `components/contract-ui/ListModalWindow.jsx` and
  `components/contract-ui/listModalCells.jsx`, plus the new `lib/accountingDimensions.js` and
  `hooks/useActiveAccountingDimensions.js`. Three changes, all in the generic list-modal component:
  - *Dimension gating.* Dimension fields are recognised from the descriptor's AD `column`, so the
    change is generic and additive: a `list-modal` window with no dimension column issues no
    request and behaves exactly as before. Today only `match-rule` has such columns
    (`transaction-type`, the other `list-modal` window, has none).
  - *Multi-select + bulk delete.* A checkbox column and the floating "N selected" pill, wiring the
    existing `hooks/useBulkRowDelete` and `components/financial-accounts/BulkDeleteSelectionBar` —
    no new mechanism, the same parts `ListView` and the Cuentas tabs already use. This one does
    reach both `list-modal` windows, but `transaction-type` has no menu entry (it exists only to
    back a selector and its inline-create), so in practice it is again `match-rule`.
  - *`window.readOnly` gating.* The prop the generated page already passes was being dropped; it is
    now honoured, which also gates the new bulk affordance. Behaviour only tightens: a read-only
    role loses buttons it could not successfully use anyway.
- `window:match-rule` — `docs/generated-custom-windows/match-rule.md`: the propagation + gating
  section, and the correction of a stale bullet that still listed the 1st/2nd dimension columns
  removed in ETP-4099.
- `window:financial-account` — `docs/generated-custom-windows/financial-account.md`: two doc-only
  notes. The backend half of this task extracted the active-dimension resolution into
  `AccountingDimensionsSupport`, which `FinancialAccountTransactionsHandler` now delegates to;
  that changes what `headerDimensionsOf` returns on centrally-maintained tenants, so the window
  guide had to record it.

## Why mixed

The three scopes are one bug, not a bundle of convenience:

- The backend now refuses to assign an inactive dimension to the generated movement. The rule form
  must therefore stop offering it, or the user configures a value that is silently dropped. Ship
  either half alone and the feature is incoherent.
- The `financial-account` doc change is a consequence of the shared backend helper the fix
  introduced, not a separate piece of work. Splitting it out would leave that guide describing
  behaviour the same PR changed, which the self-documentation policy forbids.
- The multi-select gap and the ignored `window.readOnly` were both found while live-testing the
  dimension fix on this very window, and both live in the same shared component the fix already had
  to touch. The read-only gating in particular is not separable: adding a bulk-delete affordance
  without it would ship a delete button to roles that cannot delete.

Note the backend lives in the sibling repo (`modules/com.etendoerp.go`, one commit on the same
branch), so this repo's diff is frontend + docs only.

## Tests

- `tools/app-shell/src/lib/__tests__/accountingDimensions.test.js` — 24 tests (node:test): column
  mapping, `C_BPartner_ID` deliberately excluded, and the fail-open contract asserted by identity.
- `tools/app-shell/src/hooks/__tests__/useActiveAccountingDimensions.vitest.jsx` — 14 tests, plus a
  `.test.js` source-reading companion (11 tests) so the detector recognises the new file.
- `tools/app-shell/src/components/contract-ui/__tests__/ListModalWindow.vitest.jsx` — 30 → 39
  tests: field hidden when its dimension is inactive, section dropped once empty, fail open on a
  failed request, no request at all when no field carries a dimension column.
- Multi-select / bulk delete and read-only gating: covered in the same
  `ListModalWindow.vitest.jsx` (selection, select-all indeterminate, selection pruning on filter
  change, partial-failure reselect, and every affordance hidden or disabled under
  `window.readOnly`).
- Full `contract-ui` regression suite (the prop rename touches every consumer): 181 files, 3578
  tests pass. Full node:test suite: 1748 pass.
- Request-policy guardrails (`test/no-raw-fetch.test.js`, `test/auth-header-policy.test.js`) pass —
  the new hook goes through `useApiFetch`.

## Rollback

Pure frontend + docs — no `decisions.json`, contract, generator, AD, DB or NEO change, so no
`make regen`, no `push-to-neo` and no `export.database`. Reverting restores the previous behaviour:
the three dimension selectors become unconditionally visible again, the checkbox column and bulk
bar disappear, and a read-only role goes back to seeing buttons that fail on click. The
backend commit in `modules/com.etendoerp.go` reverts independently; with only this one reverted the
form offers dimensions that the movement may ignore (the pre-ETP-4950 gating state), which is
degraded but not broken.
