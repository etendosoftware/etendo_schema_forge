# ETP-4262 — Cross-domain plan

**Feature:** Contacts window UI improvements.

This PR is approved as cross-domain because the changes span shared
`contract-ui` components (`ListView.jsx`, `DetailView.jsx`), a shared
layout utility (`linesColumnWidth.js`), generator tooling, and
window-specific changes to Contacts.

## Domains touched

### `platform-change` (shared contract-ui / lib)

- `tools/app-shell/src/components/contract-ui/ListView.jsx` — the
  selection bar (bulk-selection mode) now respects `listViewOptions.hideEye`
  and `listViewOptions.hidePrint`. Previously those flags suppressed the
  topbar Print button only; the Vista Previa and Imprimir buttons in the
  selection bar were always rendered.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` —
  `SecondaryTableTab` now forwards `labelOverrides` to the `Table` it
  renders. Previously the prop was received but never passed down, so
  `useLabel(labelOverrides)` inside `DataTable` received nothing and
  window-level label overrides were silently ignored in secondary tabs.
- `tools/app-shell/src/lib/linesColumnWidth.js` — `columnFlex()` and
  `columnMinWidthPx()` now read `col.minWidth` as a flex-basis override.
  When a column declares `minWidth`, that value is used as the basis
  instead of the type-derived default.

### `generator-change`

- `cli/src/resolve-curated.js` — added `columnWidth` to the
  `FIELD_DECISION_COPY_PROPS` allowlist so it flows from `decisions.json`
  through the curated schema.
- `cli/src/generate-contract.js` — `applyGridHints()` now emits
  `columnWidth` from the curated field into the frontend contract.
- `cli/src/generate-frontend.js` — `generateTableComponent()` now emits
  `minWidth` on the column object when `f.columnWidth` is set, using the
  existing `optProp` helper.

### `window:contacts` (primary)

- `artifacts/contacts/decisions.json` — `contact.email` declares
  `columnWidth: 320`; `bankAccount.bankFormat` declares `labels` override
  (Format/Formato) and `columnWidth: 320`; `bankAccount.accountNo`
  declares `columnWidth: 360`; `bankAccount.iBAN` declares
  `columnWidth: 400`.
- `artifacts/contacts/contract.json`, `contract.mcp.json` — regenerated.
- `artifacts/contacts/generated/web/contacts/ContactTable.jsx`,
  `BankAccountTable.jsx` — regenerated with new `minWidth` values and
  `labels` override on `bankFormat`.
- `tools/app-shell/src/windows/custom/contacts/BillingPreferencesForm.jsx`
  — `DiscountSelect` is now only rendered when `discountOptions.length > 0`
  to avoid showing a selector with only the empty "Ninguno" option.
- `docs/generated-custom-windows/contacts.md` — updated.

## Tests

- `tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.vitest.jsx`
  — 61 tests, all pass (no changes to this component).
- `tools/app-shell/src/components/contract-ui/__tests__/DataTable.vitest.jsx`
  — all pass.
- `tools/app-shell/src/components/contract-ui/__tests__/ListView.vitest.jsx`
  — all pass.

## Rollback

- **Selection bar hide flags:** revert the two `{!(listViewOptions?.hideEye ...`
  and `{!(listViewOptions?.hidePrint ...` guards in `ListView.jsx`. Visual
  only; no data change.
- **SecondaryTableTab labelOverrides:** remove the `labelOverrides={props.labelOverrides}`
  line added to `SecondaryTableTab` in `DetailView.jsx`. Labels in secondary
  tabs revert to base locale JSON. No data change.
- **linesColumnWidth:** remove the `if (col.minWidth)` early-return lines
  from both `columnFlex()` and `columnMinWidthPx()`. Column widths revert
  to type-derived defaults for all windows.
- **Generator columnWidth:** revert the three generator changes and remove
  `columnWidth` from `FIELD_DECISION_COPY_PROPS`. Existing `columnWidth`
  entries in `decisions.json` are ignored. Regenerate affected windows.
- **Contacts decisions:** remove `columnWidth` entries and `labels` override
  from `decisions.json` and regenerate. No data change.
- **BillingPreferencesForm:** revert the `discountOptions.length > 0` guard.
  The discount selector reappears when the header is saved, even with no
  options.
