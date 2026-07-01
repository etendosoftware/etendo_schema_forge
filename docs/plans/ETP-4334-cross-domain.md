# ETP-4334 — Cross-domain plan

**Feature:** Assets window visual & toolbar refinements — remove the red grid dot on
`purchaseDate`, full-width separator above the secondary tabs, tighter content padding,
**Save** button rendered before the process actions, and a consistent toggle-card size.
Includes two cross-cutting app-shell changes: a **global** Save-button icon/style change
and a new opt-in `saveBeforeProcesses` `DetailView` prop.

This PR is frontend/tooling only — **no `com.etendoerp.go` (backend) changes**.

## Domains touched

### `generator-change`

- `cli/src/resolve-curated.js` — add `tabsSeparator` to the window boolean passthrough
  list and to `WINDOW_KEY_ORDER` (also pins `sidebarAboveTabsOnly` in the order list).
- `cli/src/generate-frontend.js` — read `windowConfig.tabsSeparator`, emit the
  `tabsSeparator` prop via `fragmentIf` next to `sidebarAboveTabsOnly`. Additive: defaults
  to `false`, so no other window's generated output changes.

### `app-shell-core`

- **(global)** `tools/app-shell/src/components/contract-ui/DetailView.jsx`
  (`renderExistingRecordSaveAction`) — the existing-record **Save** button now uses the
  `Save` (floppy) icon with the light/outline style (`variant="outline"`,
  `bg-white border-[#D1D4DB] text-[#121217]`, icon color `#64748B`) instead of the `Check`
  icon on the dark primary button. **This affects all non-draft windows.** It aligns the
  existing-record Save with the new-record Save (already a floppy icon) and the draft-mode
  "Save Draft" button.
- `DetailView.jsx` — new `saveBeforeProcesses` prop (default `false`). When set,
  `renderSaveActions` is rendered before the process-button block instead of after it.
  Default-off, so no behavioral change for any other window.
- `tools/app-shell/src/windows/registry.js` — `assets` added to `customLoaders` so the
  route resolves to the custom wrapper (overrides the generated `windowLoaders` entry;
  `customLoaders` wins). `registry.js` is hand-maintained / pipeline-appended, so the
  override survives regeneration.

### `window:assets`

- `artifacts/assets/decisions.json`:
  - `purchaseDate` → `"dot": false` (removes the red grid status dot, matching
    `depreciationStartDate`).
  - `"tabsSeparator": true` (full-width `border-b` between form/sidebar and the tabs;
    only effective with the already-present `sidebarAboveTabsOnly` + sidebar content).
  - `"formScrollPaddingX": "px-2"` (detail content padding 24 px → 8 px; the prop was
    already a generator passthrough — Assets simply did not set it).
- `tools/app-shell/src/windows/custom/assets/index.jsx` — **new** custom wrapper mirroring
  the generated `index.jsx`, passing `saveBeforeProcesses` to `AssetsPage`. Keeps the
  toolbar-order flag out of the global generator vocabulary (Assets-only preference).
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` — the Depreciation
  Config grid is now always `grid grid-cols-2 gap-4` (was `grid-cols-1 max-w-sm` when
  depreciation was off). The **Depreciate** ToggleCard no longer resizes between
  on/off states.
- `artifacts/assets/contract.json`, `artifacts/assets/contract.mcp.json`,
  `artifacts/assets/generated/web/assets/*` — regenerated (`make regen ONLY=assets`).
  Only change of note: `dot: false` on the `purchaseDate` grid column.
- `docs/generated-custom-windows/assets.md` — added the `ETP-4334` change section.

## Tests

- `tools/app-shell` Vitest:
  - `DetailView.saveButtons.vitest.jsx` + `DetailView.render.vitest.jsx` — 373 pass
    (Save button icon/style swap and the `saveBeforeProcesses` reorder are exercised via
    the existing click-driven specs; no icon assertions broke).
  - `src/windows/custom/assets/**` — 44 pass (covers `AssetsDetailPanel`).
- `node cli/src/validate-pipeline.js --scope=assets` — 0 violations (2 skipped: F1/F2
  pending P2 generator patch).

## Rollback

- **tabsSeparator generator wiring:** remove `tabsSeparator` from `resolve-curated.js` and
  `generate-frontend.js`; remove `"tabsSeparator": true` from `decisions.json`; re-run
  `make regen ONLY=assets`. Additive feature — safe to drop with no impact on other windows.
- **Global Save button (icon + style):** revert the single `renderExistingRecordSaveAction`
  edit in `DetailView.jsx` (`Save`→`Check`, drop the `variant="outline"` + class string).
  Affects all non-draft windows on revert.
- **saveBeforeProcesses (Assets toolbar order):** delete `custom/assets/index.jsx`, remove
  the `assets` line from `customLoaders` in `registry.js` (Assets falls back to the generated
  route), and optionally revert the `saveBeforeProcesses` prop in `DetailView.jsx`
  (default-off, so harmless to leave).
- **decisions.json visual props** (`purchaseDate.dot`, `formScrollPaddingX`): remove and
  `make regen ONLY=assets`.
- **AssetsDetailPanel grid:** restore the conditional
  `grid-cols-2 / grid-cols-1 max-w-sm` className.

## Notes

- The **global** Save-button change is the only item with blast radius beyond Assets — it
  is the one to call out in REVIEW. Everything else is additive (default-off props) or
  scoped to Assets via `decisions.json` / a custom component / a `registry.js` override.
- `saveBeforeProcesses` was deliberately **not** added to the generator vocabulary (unlike
  `tabsSeparator`): toolbar order is a one-window concern, so it is passed via the custom
  wrapper instead of `decisions.json`.
