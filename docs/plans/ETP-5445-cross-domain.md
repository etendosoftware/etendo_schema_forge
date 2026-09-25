# Cross-Domain Plan — ETP-5445

## Scope

Enable accounting Post/Unpost on the **Internal Consumption** window (`internal-consumption`,
table `M_Internal_Consumption`), which previously declared posting as unsupported, and close the
tenant data gaps that blocked it.

## Domains

- `window:internal-consumption` — `artifacts/internal-consumption/decisions.json` and its
  regenerated `contract.json` / `generated/` output: `posted` becomes a read-only list badge plus a
  detail status pill, `PROCESS_Posted` goes from Omit to Keep, detail `menuActions` Post/Unpost
  (coexisting with the existing Void kebab entry), `draftMode` label `confirm` +
  `disableWhenEmpty`, and the header entity `javaQualifier: "internal-consumption"`.
- `platform-change` — `tools/app-shell/src/windows/custom/internal-consumption/index.jsx` (grid
  bulk Post/Unpost and row-hover Post/Unpost kebab, mirroring `physical-inventory`) and its
  `customLoaders` registration in `tools/app-shell/src/windows/registry.js`.
- `unknown` — the corrective tenant data-fix under `cli/src/data-fixes/sql/` and the
  `docs/etendo-ad/` onboarding/remediation notes that describe it. The boundary policy has no rule
  for `cli/src/data-fixes/**`, so it lands as `unknown` (same gap noted in `ETP-5275-cross-domain.md`).
- **com.etendoerp.go** (sibling repo, lockstep) — the `@Named("internal-consumption")` header
  `NeoHandler` delegating post/unpost to `DocumentPostingService`, the cost pre-check, the
  `movementQuantity` callout strip, and the matching `ETGO_SF_ENTITY` reference data.

## Why mixed

One user-facing capability ("post an internal consumption") needs all three layers: the SPA must
offer the action, the runtime must route `/action/post` and `/action/unpost` through a handler for
this entity, and existing tenants must have the data the posting engine requires. Shipping any one
alone leaves either a button that fails or a backend nobody can reach.

## Rollback

- Frontend: revert the decisions.json change and regenerate (`make regen ONLY=internal-consumption
  FROM_CACHE=1`), delete the custom `index.jsx` and its registry line. The window falls back to the
  generated page.
- Backend: revert the handler commit in `com.etendoerp.go`; with no handler the post/unpost actions
  return an error but nothing else changes.
- Data-fix: see the fix's own header for its reversibility notes.
