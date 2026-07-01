# ETP-4268 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4268 delivers a complete redesign of the **Goods Movements** window (list view +
detail/record view). The redesign spans platform components, the generator pipeline,
app-shell-core, and the window artifact — all under the same ticket — because each
layer is a necessary part of making the window work correctly:

- Shared UI components needed new opt-in capabilities (status badge enumLabels, locked-
  document banner, per-window lookup drawer registry, excludeValueOf selector exclusion,
  sendDocument disable fix) that other windows can reuse, but that no other window had
  activated before.
- The generator pipeline needed to propagate those new field/window props end-to-end
  (decisions → curated → contract → generated JSX).
- The window artifact (decisions.json, generated files, custom components) is the primary
  deliverable and activates all the above for goods-movements only.

## Domains touched

- **platform-change** — shared UI components extended with opt-in capabilities:
  - `StatusBadge.js` + `DataTable.cellRenderers.jsx`: `statusLabel()` accepts a 4th
    `enumLabels` param so windows can map raw boolean values to i18n keys.
  - `AdvancedFilterBuilder.jsx`: `DistinctEnumPicker` deduplicates boolean/string twin
    values and translates enumLabels via `ui()`.
  - `ListFilterBar.jsx` + `ListView.jsx`: new `hideStatusFilter` prop (opt-in) hides the
    status quick-filter pill for windows that don't need it.
  - `DetailView.jsx`: new `lockedAlert` prop renders a Figma-spec gray banner above the
    principal fields when the document is processed; `Lock` icon added to imports.
  - `DocumentStatusPill.jsx`: fix — `status == null` guard (was `!status`) so the pill
    renders for `processed === false` (draft); label resolved via `statusLabel()` with
    `enumLabels`.
  - `DataTable.jsx`: `InlineAddRow` receives `labelOverrides`; `renderSelectorCell`
    derives and passes `excludeId` from `field.excludeValueOf`; lookup drawer registry
    migrated to shared `lookupDrawers.js`.
  - `InlineLinesPanel.jsx`: `labelOverrides` prop wired to `useLabel`; `LookupTrigger`
    resolves drawer via `resolveLookupDrawer(field.lookupDrawer)`; `EditCell` derives
    `excludeId` from `col.excludeValueOf` on the current row.
  - New: `GoodsMovementsProductSearchDrawer.jsx` — flat product+bin picker backed by AD
    reference 800011 (Product Complete / M_Product_Stock_V). Sorted alphabetically,
    no dedup, one row per product+locator.
  - New: `lookupDrawers.js` — shared registry (`LOOKUP_DRAWERS` + `resolveLookupDrawer`)
    used by both DataTable and InlineLinesPanel.
  - Tests: `statusBadge.vitest.jsx`, `AdvancedFilterBuilder.vitest.jsx`,
    `DataTable.cellRenderers.vitest.jsx`, `DataTable.excludeValueOf.vitest.jsx`,
    `DetailView.lockedAlert.vitest.jsx`, `GoodsMovementsProductSearchDrawer.vitest.jsx`,
    `InlineLinesPanel.test.js`, `InlineLinesPanel.vitest.jsx`, `lookupDrawers.vitest.jsx`.

- **generator-change** — CLI pipeline extended to propagate new field/window props:
  - `resolve-curated.js`: `excludeValueOf` added to `FIELD_DECISION_COPY_PROPS`;
    `lockedAlert` added to `WINDOW_TRUTHY_PROPS` and `WINDOW_KEY_ORDER`;
    `fieldDecision.defaultValue` propagation fix for system fields.
  - `generate-contract.js`: `excludeValueOf` added to `FIELD_ATTR_SPECS`.
  - `generate-frontend.js`: emits `excludeValueOf` on addLineFields entry AND grid
    column; emits `lockedAlert` prop on DetailView; `requiredHeaderFields` excludes
    `readOnly` fields; `resolveSendDocumentConfig` emits `{ enabled: false }` instead
    of null when explicitly disabled (fixes ListView auto-detection bypass).
  - CLI tests: `resolve-curated.test.js`, `generate-frontend.test.js`.

- **app-shell-core** — i18n keys for goods-movements–specific labels (ES + EN):
  `processMovements`, `goodsMovementsLockedTitle`, `goodsMovementsLockedMessage`,
  `goodsMovementsLockedAction` in `packages/app-shell-core/src/locales/{en_US,es_ES}.json`.

- **repo-infra** — `docs/decisions-reference.md` documents the new `columnType` +
  `enumValues` field-level decision props (previously undocumented).

- **window:goods-movements** — primary deliverable:
  - `decisions.json`: list-view redesign (padding, hideLink, hidePrint,
    hideStatusFilter, custom icons, labelOverrides, statusEnumLabels, draftMode,
    lockedAlert, sendDocument disabled, movementDate dot:false, processed enumValues,
    lineNo grid:false, column order/widths, excludeValueOf on newStorageBin,
    goods-movements-product lookupDrawer + onSelectMappings).
  - Generated artifacts: `MovementPage.jsx`, `MovementForm.jsx`, `MovementLineTable.jsx`,
    `MovementTable.jsx`, `contract.json`, `contract.mcp.json`, `mockData.js`.
  - Custom components: `index.jsx` (wrapper simplified to icons only),
    `__tests__/index.test.js` updated.
  - Docs: `docs/generated-custom-windows/goods-movements.md` (full detail-view section
    rewritten).

## Tests

- `npx vitest run` (tools/app-shell): **7084 pass, 0 fail**
- `make test` (CLI): **exit 0**
- `node cli/src/validate-pipeline.js --scope=goods-movements`: **0 violations**

## Rollback

All shared component changes are opt-in (guarded by null-checks or prop absence).
Reverting goods-movements/decisions.json and regenerating restores the window to its
previous state without affecting any other window. The generator changes are additive
and backward-compatible.
