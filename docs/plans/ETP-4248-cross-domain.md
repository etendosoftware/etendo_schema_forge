# ETP-4248 Cross-Domain Plan

## Scope

This PR ports the Open/Close Period Control window end to end: the new window
artifact, the generator features it required, the shared platform components
that render those features, and the translations/docs that accompany it. These
pieces are mechanically interdependent and would produce broken intermediate
states if split.

Domains:

- `window:open-close-period-control`: new Finance window — period list with
  open/close status badges and two separate action buttons (period-level via
  process 167, document-level via process 168 on the detail entity).
- `generator-change`: `cli/src/generate-frontend.js` learns to emit a
  `detailProcesses` const and pass it to `DetailView`, swap `processOverrides`
  labels using `detailLabel` for the detail entity, and skip `DetailForm` when
  `window.hideDetailForm` is true. `cli/src/generate-contract.js` sets
  `crud.delete=false` for all entities when `window.hideDelete` is true.
  `cli/src/resolve-curated.js` adds `hideDetailForm` and `hideDelete` to
  `WINDOW_BOOLEAN_TRUE_PROPS` and `WINDOW_KEY_ORDER`. `cli/config/regen-windows.json`
  registers the new window.
- `platform-change`: `DetailView.jsx` adds `detailProcesses` prop,
  `executeDetailProcess` callback, and shows detail process buttons in the top
  toolbar when child rows are selected. `ProcessParamDialog.jsx` gets
  `data-testid` updates. `DocumentStatusPill.jsx` translates enum labels via
  `genericLabels`. `ListView.jsx` and `useEntity.js` carry minor fixes from
  the same feature branch. `statusBadge.js`, `App.jsx`, `menu.json`, and
  `windows/registry.js` register the new window and its routes.
- `app-shell-core`: Spanish translations for all period status values, action
  button labels, and period type enum values added to `es_ES.json` and
  matching keys in `en_US.json`.
- `repo-infra`: `docs/decisions-reference.md` updated to document the new
  `hideDetailForm`, `hideDelete`, and `detailLabel` options.
- `unknown`: `docs/generated-custom-windows/INDEX.md` and
  `docs/generated-custom-windows/open-close-period-control.md` added per the
  self-documentation policy.
- `root-global-sensitive`: `package-lock.json` cleaned up (23 package
  deletions from a prior install).

## Reason

ETP-4248 is a single feature: expose period open/close management. The window
needs two distinct action buttons routing to different Java handlers via
`javaQualifier`; that required the generic `detailProcesses` feature in the
generator and `DetailView`. The `hideDetailForm` and `hideDelete` flags are
likewise generic additions driven by this window's UX requirements (read-only
grid records that should not open a sidebar or be deletable). Shipping the
generator changes alone leaves `DetailView` without the `detailProcesses` prop;
shipping the window alone produces generated output referencing a prop the
platform does not yet accept. Translations and docs must ship together with
the window per the self-documentation policy.

The runtime Java handlers (`PeriodOpenCloseHandler`, `PeriodControlDocOpenCloseHandler`)
live in the paired `com.etendoerp.go` branch `feature/ETP-4248`.

## Tests

- `cd tools/app-shell && npx vitest run src/components/contract-ui` — contract-ui
  suite covering `DetailView`, `ProcessParamDialog`, and `DocumentStatusPill`.
- `make validate-pipeline ONLY=open-close-period-control` — pipeline validator
  confirms 0 violations for the window artifact.
- `make domain-boundary-check BASE=origin/epic/ETP-3504 LABELS=cross-domain-approved PR_BODY_FILE=docs/plans/ETP-4248-cross-domain.md`
  — this gate with the plan file.
- Paired runtime: `./gradlew test --tests com.etendoerp.go.schemaforge.PeriodOpenCloseHandlerTest`
  in `etendo_core` (com.etendoerp.go branch `feature/ETP-4248`).

## Rollback

- Revert the Schema Forge commits on `feature/ETP-4248`. The new window is
  additive (`artifacts/open-close-period-control/`, `menu.json` entry,
  `registry.js` route); reverting removes its menu item and route cleanly.
- The three generic generator flags (`hideDetailForm`, `hideDelete`,
  `detailProcesses`) are backward-compatible: existing windows that do not
  declare them are unaffected; reverting removes the feature for all.
- Revert the paired `com.etendoerp.go` branch if the Java handlers must be
  removed; they register via CDI `@Named` and are only invoked when a
  `javaQualifier` routes to them.
- No destructive DB migration is included in this Schema Forge PR.
