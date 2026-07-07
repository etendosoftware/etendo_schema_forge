# ETP-4336 — Cross-domain plan: visual required asterisk + amortization total footer

## Why this change is cross-domain

Two related Assets-window improvements share a single **reusable platform
primitive**, so the change necessarily spans the generic component layer and the
`assets` window:

1. A visual-only required asterisk (`requiredVisual`) is added to the shared
   `EntityForm` component so any field descriptor can show the required marker
   **without enforcing validation** — needed for fields whose obligatoriness is
   conditional on another field. This is a platform capability; the `assets`
   window is its first consumer. Splitting it per window would push window-local
   asterisk hacks instead of a reusable prop.
2. The Amortization Plan tab gains a footer total with an alert color when the
   sum does not match the amount to amortize. This lives in the window's
   hand-authored custom panel.

Because the reusable prop lives in a **platform-change** file and the consumer
edits + docs live in **window:assets** and **repo-infra**, the diff crosses
domains by design.

## Domains touched (dominios)

- **platform-change** — `tools/app-shell/src/components/contract-ui/EntityForm.jsx`:
  the required asterisk is OR-ed with a new `requiredVisual` field-descriptor prop
  at all four render sites (`labelMarker`, `requiredAsterisk`,
  `requiredAsteriskIfEditable`, and `PopupSearchField`'s inline marker), gated by
  `!isReadOnly`. The `required={...}` validation props are untouched — the flag is
  cosmetic only. Reusable by any window.
- **repo-infra** — `docs/ui-customization.md`: documents `requiredVisual` as a
  reusable `EntityForm` field-descriptor prop (entry #16 + decision-tree line), so
  future windows can discover it.
- **window:assets**
  - `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx`:
    `requiredVisual: true` on 6 conditionally-required fields (`currency`,
    `depreciationAmt`, `annualDepreciation`, `usableLifeYears`,
    `usableLifeMonths`, `depreciationStartDate`).
  - `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx`:
    a `<tfoot>` totaling the Amount column, rendered in alert color when the total
    does not match `depreciationAmt` (the "amount to amortize"), with a 0.005
    float tolerance and safe handling of a missing expected value.
  - `tools/app-shell/src/windows/custom/assets/__tests__/AssetsAmortizationPanel.vitest.jsx`:
    tests for the footer total + alert behavior.
  - `docs/generated-custom-windows/assets.md`: two ETP-4336 sections documenting
    both changes.

No backend, DB, NEO push, or schema/contract changes. The `schema_forge_core`
repo is not touched by this branch.

## Tests

- **Vitest** — `AssetsAmortizationPanel.vitest.jsx`: 7 new tests covering the
  summed total, alert class when total ≠ `depreciationAmt`, no alert when it
  matches, the 0.005 float tolerance edge (`0.1 + 0.2` vs `0.3`), no alert when
  `depreciationAmt` is null/undefined, and no footer when there are zero lines.
  Full file green (39 passed). Four pre-existing single-line assertions were
  updated from `getByText` to `getAllByText(...).toHaveLength(2)` because with one
  line the footer total mirrors the row amount (expected, not a defect).
- The `requiredVisual` change on `EntityForm` is a cosmetic, additive prop
  (OR-ed with existing `required`, no validation impact); no behavior branch was
  altered.

## Rollback

Single-branch revert. The change is an additive `EntityForm` prop + window-local
field-descriptor flags + a hand-authored `<tfoot>` + additive tests and docs, with
no DB migration, no NEO push, and no schema/contract change. Reverting the branch
restores the previous labels (no asterisk) and the plan table without a footer.
The `requiredVisual` prop is additive, so removing it is inert for every other
window.
