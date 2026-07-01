# ETP-4321 Cross-Domain Plan — Reduce form-field vertical density via shared tokens

## Purpose
Compact document forms by reducing field height, the vertical gap between field
rows, and the label→field margin, at the **base-component level** so the change
propagates to every window automatically (no per-window edits). A new shared
density token module (`formDensity.js`) is the single source of truth, consumed
by the base UI primitives in `app-shell-core` and by the document/modal form
controls in `tools/app-shell`. Field **widths are unchanged**, preserving the
256px minimum-field-width guideline.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| app-shell-core | `packages/app-shell-core/src/components/ui/formDensity.js` (new), `packages/app-shell-core/src/components/ui/{input.jsx,select.jsx,date-field.jsx}`, `packages/app-shell-core/src/components/ui/__tests__/{formDensity.test.js (new),input.test.js,select.test.js,date-field.test.js}` | Define the density tokens (`FIELD_HEIGHT=h-9`/36px, `FIELD_PADDING=px-2 py-1.5`, `ROW_GAP_Y=gap-y-3`/12px, `LABEL_GAP=space-y-1`/4px) and consume them in the base `Input`, `SelectTrigger`, and `DateField` primitives (height 40px→36px, tighter padding). Tests updated to track the tokens; new `formDensity.test.js` pins the values and guards against drift. |
| platform-change | `tools/app-shell/src/components/ui/formDensity.js` (new re-export shim), `tools/app-shell/src/components/contract-ui/{EntityForm.jsx,AddressSection.jsx,CreatableSearchSelect.jsx,EntityCreationModal.jsx,FinancialSection.jsx}`, `tools/app-shell/src/components/contract-ui/__tests__/{EntityForm-grid.vitest.jsx,EntityForm.helpers.vitest.jsx}` | Apply the shared tokens to the document form grid (row gap 20px→12px, label gap 6px→4px) and to the locally-hardcoded field controls (date/selector/lookup) and modal/subform inputs (40px→36px). Column count and horizontal gap left untouched to preserve the 256px min-field-width. |

## Risk Assessment
- Spacing/height-only change: no DB schema, no API contract, no behavior changes.
- No generated files touched (`artifacts/`/`generated/` untouched); change lives in
  base components and generic UI, so it survives pipeline re-runs.
- Single source of truth (`formDensity.js`) avoids value drift across the scattered
  `h-10` sites that previously hardcoded field height.
- Field widths and grid columns are unchanged — the 256px min-field-width guideline
  (read mode, edit mode, and side-panel-active) is preserved by construction.
- The `tools/app-shell` token is a thin re-export of the `app-shell-core` token, so
  both domains stay in lockstep; there is no second source of truth.

## Test Plan
- `app-shell-core` suite: 361 passed (incl. the 4 density suites — `formDensity`,
  `input`, `select`, `date-field`).
- `tools/app-shell` suites: 229 passed + 21 node:test, incl. `EntityForm-grid`,
  `EntityForm.helpers`, `EntityCreationModal`, `FinancialSection`, `AddressSection`,
  `CreatableSearchSelect`.
- Manual verification across the 8 document windows (Sales/Purchase Order,
  Sales/Purchase Invoice, Sales Quote, Sales/Purchase Shipment, Contact): fields
  render 36–38px in edit mode, row gap 12–16px, label→field gap 3–4px, no field
  below 256px wide in edit/read mode or with the side panel active, and no
  cramping at the mobile breakpoint.

## Rollback
Revert commit `Feature ETP-4321: Reduce form field vertical density via shared tokens`.
Removing `formDensity.js` (both the token and the re-export shim) and restoring the
prior `h-10`/`gap-y-5`/`space-y-1.5` classes on the base primitives and form
controls returns every surface to the previous density with no other impact.
