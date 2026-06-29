# ETP-4269 — Cross-domain plan

This branch is intentionally **cross-domain**: redesigning the Internal
Consumption list and detail views required new generic capabilities in the
shared UI components and the pipeline generator, plus the per-window config and
docs that consume them. This plan documents the domains, tests, and rollback so
the domain-boundary check can approve the combined change.

## Domains (dominios)

- **window:internal-consumption** — the actual redesign. `decisions.json` drives
  the list trims (`hidePrint`, `hideLink`, `listViewOptions.hideStatusFilter`,
  `customListIcons`, `movementDate.dot:false`), the detail changes
  (`noHeaderBorder`, discarded `description`, hidden `lineNo` column,
  `movementQuantity.columnWidth`), the native `draftMode` Complete flow
  (`extraParams: { action: 'CO' }`), and the kebab **Void** action
  (`customComponents.moreMenuContent` → `InternalConsumptionActions.jsx`, which
  posts `{ action: 'VO' }` and shows only when `status === 'CO'`). Regenerated
  contract/generated files follow.
- **platform-change** — generic shared components in `tools/app-shell`:
  - `ListView.jsx`: reads `listViewOptions?.hideStatusFilter` (converged onto the
    epic's `listViewOptions` convention).
  - `ListFilterBar.jsx`: `hideStatusFilter` prop + gate (hides the status
    dropdown only, leaving the rest of the filter bar).
  - `DetailView.jsx`: hidden probe that suppresses the kebab popover when its
    custom content renders nothing (benefits every window with
    `customMenuContent`); plus the merge-integrated `runDocumentAction` /
    `runNeoMenuAction` helpers from the epic.
  - `useEntity.js`: `handleSaveAndProcess` merges `draftMode.extraParams` at the
    top level of the action body (needed for processes whose mandatory params are
    validated against the request root, e.g. `M_Internal_Consumption_Post`).
- **generator-change** — `cli/src/generate-frontend.js` and
  `cli/src/resolve-curated.js`: emit/whitelist the new window options
  (`hideStatusFilter`, `customListIcons`) and the `draftMode.extraParams`
  passthrough. Behavior is additive — windows that don't set these are unchanged.
- **app-shell-core** — `locales/en_US.json` + `locales/es_ES.json`: the
  `internalConsumptionVoid*` i18n keys for the new Void action (added to BOTH
  locales).
- **repo-infra / docs** — `docs/decisions-reference.md` documents the new generic
  options; `docs/generated-custom-windows/internal-consumption.md` and `INDEX.md`
  document the redesigned window behavior (list + detail).

These domains are touched together because the window redesign cannot be
expressed in `decisions.json` alone — each new visual/behavioral capability
needed a matching generic extension point, and the self-documentation policy
requires the reference + window docs to ship in the same change.

## Tests

- `InternalConsumptionActions.test.js` — source-reading regression for the Void
  action: renders only on `CO`, POSTs flat `{ action: 'VO' }` to `processNow`
  (not wrapped in `fieldValues`, not the old `CO`), calls `onRefresh`/`onClose`,
  neutral styling. 13 assertions.
- `ListFilterBar.vitest.jsx` — `hideStatusFilter` hides the status trigger even
  when a status column exists, and still renders it when false.
- `DetailView.render.vitest.jsx` — full detail render suite (394 tests with
  ListFilterBar) green after the merge + probe changes.
- `validate-pipeline --scope=internal-consumption` — 0 violations.

All suites pass locally (vitest + node test runner).

## Rollback

No data or schema changes. To roll back, `git revert` the ETP-4269 commits on
this branch: the generic component additions return to their prior behavior
(`hideStatusFilter` simply has no effect, the kebab probe is removed, draftMode
ignores `extraParams`), the generator stops emitting the new optional props, and
Internal Consumption reverts to its previous list/detail layout. Regenerating any
affected window reproduces the pre-change generated output. No migration or
deploy step is involved.
