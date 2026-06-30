# ETP-4270 — Cross-Domain Plan

This branch (`feature/ETP-4270`) intentionally touches two windows in a single
push. This plan documents that crossing so the domain boundary gate can be
approved with the `cross-domain-approved` label.

## Domains

Both windows belong to the same `inventory` vertical. The change is a single,
identical bug fix applied to each.

1. **`window:physical-inventory`**
   - `processNow` field visibility changed from `discarded` to `system` in
     `decisions.json` so the draft-mode Process/Confirm action is registered in
     NEO Headless (`isIncluded = Y`) instead of returning `404 Action not found`.
   - Affected: `artifacts/physical-inventory/decisions.json`,
     `artifacts/physical-inventory/contract.json`,
     `artifacts/physical-inventory/contract.mcp.json`.

2. **`window:goods-movements`**
   - Same fix: `processNow` visibility `discarded` → `system` so the
     `action/processNow` endpoint resolves.
   - Affected: `artifacts/goods-movements/decisions.json`,
     `artifacts/goods-movements/contract.json`,
     `artifacts/goods-movements/contract.mcp.json`.

### Root cause

`push-to-neo.js mapVisibility()` maps `discarded` → `isIncluded: 'N'`. NEO's
`NeoButtonActionHelper.findButtonColumn()` only scans included fields, so a
`discarded` button column is never found and the action 404s. `system` keeps the
field in the backend (executable action) while staying out of the frontend form.

## Tests

- `make regen ONLY=goods-movements,physical-inventory PUSH_TO_NEO=1` →
  regenerated cleanly; **no `generated/` changes** (the button is not a form
  field either way), confirming the fix is backend-only.
- Manual: Process/Confirm button on both windows no longer returns 404; the
  document processes successfully.
- Contract integrity: `processNow` now resolves to `visibility: "system"`
  (`isIncluded: 'Y'`, `isReadOnly: 'Y'`) in both contracts.

## Rollback

- The fix is reproducible from `decisions.json`. To revert, set
  `processNow.visibility` back to `discarded` in both windows' `decisions.json`,
  re-run `make regen ONLY=goods-movements,physical-inventory PUSH_TO_NEO=1`, and
  `./gradlew export.database`. No schema or data migration is involved.
