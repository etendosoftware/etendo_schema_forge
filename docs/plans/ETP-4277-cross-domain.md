# ETP-4277 Cross-Domain Plan

## Scope

This PR fixes a shared-component bug that affects all document windows with inline
line editing: when a numeric field (discount %) is cleared to empty and saved, the
backend stored the wrong default value (100 instead of 0). The fix is in shared
infrastructure consumed by all five affected windows, making splitting impractical.

Domains:

- `window:sales-invoice`: inline-add and inline-edit discount field normalization;
  grossAmount recomputed before POST via `onAdd` handler fix in `DetailView.jsx`.
- `window:sales-order`: same shared-component fix; `C_OrderLine` recalculates
  gross server-side, so the `onAdd` recompute is a safety net (no behavior change).
- `window:purchase-invoice`: same as sales-invoice.
- `window:purchase-order`: same as sales-order.
- `window:sales-quotation`: same shared-component fix; regenerated as a side effect
  of generator changes.
- `platform-change`: `tools/app-shell/src/components/contract-ui/DataTable.jsx` —
  `renderInputCell.onBlur` substitutes `defaultValue` for empty numeric fields;
  `coerceFieldValues` applies the same substitution at POST-body-assembly time.
  `InlineLinesPanel.jsx` — `clampToMax` gains a `NUMERIC_TYPES` guard and an
  empty-to-defaultValue substitution for the PATCH flow.
  `DetailView.jsx` — `onAdd` handler recomputes `grossAmount`/`lineGrossAmount`
  from the normalized discount before the POST so `C_InvoiceLine` receives a
  consistent value (it trusts the sent amount; unlike `C_OrderLine` it does not
  recalculate server-side).
  `useLineGrossAmount.js` — explicit zero-out when a client-side field produces
  `lineNet === 0` with qty and price both set (avoids stale intermediate grossAmount).
- `generator-change`: `cli/src/generate-contract.js`, `cli/src/generate-frontend.js`,
  and `cli/src/resolve-curated.js` — propagate the `max` property from
  `decisions.json` through to the contract and the generated `addLineFields` array
  so that the `onBlur` clamp and `clampToMax` receive `field.max` at runtime.
- `e2e`: `e2e/tests/flows/discount-max-autocorrect.mocked.spec.js` — mocked spec
  covering the blur-autocorrect and Enter-without-blur paths for the discount field.
- `repo-infra`: `docs/feedback.md` (new), `docs/decisions-reference.md`,
  `docs/e2e-testing-guide.md`, `docs/index.md`.

## Reason

The bug is in `DataTable.jsx` and `InlineLinesPanel.jsx`, which are shared by every
window that uses inline line editing. Fixing them once covers all five document
windows. Splitting the fix per window would require five identical PRs that each
cherry-pick the same shared-component change, creating merge conflicts between them.

The `max` property propagation in the generators is required to deliver the
`field.max` value to the runtime clamp logic — without it, `onBlur` cannot cap the
discount at 100 and `coerceFieldValues` cannot substitute the correct `defaultValue`.
Generator and platform changes are therefore mechanically interdependent.

## Tests

- `make test` (7100 Vitest + 524 CLI) — all pass.
- New tests added:
  - `DataTable.numericClamp.vitest.jsx` — empty-field normalization on blur (3 cases)
  - `DataTable.inlineAdd.vitest.jsx` — `coerceFieldValues` substitutes `defaultValue`
    on Enter submit with empty discount field
  - `InlineLinesPanel.helpers.test.js` — `clampToMax` source-shape tests (5 cases)
- `node cli/src/validate-pipeline.js --scope=sales-invoice,purchase-invoice,sales-order,purchase-order,sales-quotation` — 0 violations.
- `make regen ONLY=sales-invoice,sales-order,purchase-invoice,purchase-order,sales-quotation SKIP_EXTRACT=1` — regenerates cleanly from merged decisions.json.
- Manual smoke verification (Playwright MCP, localhost:3100):
  - Add line to invoice, leave discount empty, press Enter → line saves with
    discount=0 and correct grossAmount (not 0).
  - Add line to invoice with discount=100 → grossAmount=0 (correct).
  - Add line to order with discount cleared to empty, press Enter → discount=0,
    lineGrossAmount correct.
  - Edit existing line, clear discount → PATCH body carries defaultValue (0) not ''.

## Rollback

- Revert the two Schema Forge commits on `feature/ETP-4277` (the feature commit
  and the merge commit). The decisions.json changes have no server-side effect
  (they only add `max: 100` to the discount entry field definition). The
  generated artifacts auto-revert with the decisions revert.
- No DB migration or NEO config change was required for this fix.
