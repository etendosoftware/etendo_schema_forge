# Design — `window.readOnly` capability (ETP-4474)

- **Date:** 2026-07-15
- **Jira:** ETP-4474 (epic ETP-3504 — Etendo Next)
- **Author:** Forge session
- **Status:** Implemented (pending manual test) — see "Implementation notes" below

## Problem

As part of ETP-4474 (conversion rates managed at system level `'0'` by a global
daily job), Etendo GO tenants must **not** be able to create, edit, or delete
conversion rates from the GO UI. Rates are now system-owned; a tenant that needs
a one-off override does it per document via the Exchange Rate tab, not in the
Conversion Rates window.

The same applies to the **Conversion Rate Downloader Log** window: it is a log and
should be view-only in GO (a tenant creating/deleting log rows makes no sense).

Classic Etendo (the AD back-office) must keep full edit access — it reads AD
metadata directly and is unaffected by GO configuration.

### Current gap

The tooling has **no window-level read-only capability**. The only read-only
mechanism today is per-field (`visibility: readOnly` / `readOnlyLogic`). That
locks field editing but does **not** hide the "New" button or the delete action —
those are rendered by the shared runtime components. So a GO user can still create
a brand-new conversion rate row today.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enforcement layer | **GO UI only** (schema_forge) | `decisions.json` only drives the GO SPA; classic reads AD directly, so it stays editable automatically. |
| Functional scope | **Full read-only** (no create / no edit / no delete; fields RO in grid + form) | Rates are system-managed; the window becomes view-only. |
| Flag shape | **`window.readOnly: true`** (boolean) | Minimal surface for the real need. A granular `permissions` object can be added later without breaking `readOnly` if a partial case ever appears (YAGNI now). |
| Repo path | **Generic capability in `schema_forge_core`** | It is tooling. Two consumers on day one (conversion-rates + downloader-log) validate the generic approach. |

### Known limitation (accepted, out of scope)

This is **UI-level** gating. NEO Headless does not reject a direct `POST`/`DELETE`
to the CRUD endpoint. Backend enforcement is out of scope for ETP-4474.

## Architecture / data flow

```
decisions.json (schema_forge)          window.readOnly: true
        │
        ▼  [resolve-curated.js  — core]   propagate readOnly + expand to hideCreate:true + hideDelete:true
        ▼  [generate-contract.js — core]  emit api.window.readOnly=true
        │                                 + force crud.<entity>.{post,put,patch,delete}=false
        ▼  [generate-frontend.js — core]  windowMeta.readOnly=true (semantic marker)
        ▼
contract.json + generated/ (schema_forge)
        │
        ▼  ListView (hideCreate → no New; api.window.readOnly → row quick actions hide
        │            Edit/Clone/Delete via RowQuickActions.readOnly)
        ▼  DetailView (window.readOnly → no Edit/Delete, fields RO)
```

### Why reuse existing gating rather than build a brand-new prop path

Exploration during implementation showed the runtime **already** has all the
gating primitives needed:

- **`hideCreate`** — `ListView` already hides the New button on this flag; the
  generator already emits it. `resolve-curated` expands `window.readOnly` into it.
- **`hideDelete`** — already sets `crud.<entity>.delete = false` in the generator,
  and `DetailView` already honors `crud.delete`. `window.readOnly` expands into it too.
- **`EntityForm`'s `readOnly` prop** — the form component already ORs a form-level
  `readOnly` into every field's read-only computation. `DetailView` just needs to pass it.
- **`isDocumentReadOnly`** — already gates save, delete, add-line and inline edits
  throughout `DetailView`. `window.readOnly` is OR-ed into it.

So `window.readOnly` becomes **sugar over already-tested mechanisms** plus a single
new line of behavior in `DetailView`. This keeps CRUD permissions expressed through
the existing `crud` object (single source of truth) and avoids a parallel gating
path. `windowMeta.readOnly` remains only as a semantic marker (e.g. a future
"read-only" badge in the UI).

## Changes by repo

### A) `schema_forge_core` — generator (requires publishing `@etendosoftware/schema-forge-cli`)

1. **`cli/src/resolve-curated.js`** — add `'readOnly'` to `WINDOW_BOOLEAN_TRUE_PROPS` and
   `WINDOW_KEY_ORDER` (so it flows from decisions into the curated/contract window). In
   `applyWindowDecisions`, expand `window.readOnly === true` into `window.hideCreate = true`
   and `window.hideDelete = true` (reuse the existing gating).
2. **`cli/src/generate-contract.js`** — when `frontendContract.window?.readOnly`: set every
   entity's `crud.{post,put,patch,delete} = false`; and add `readOnly: true` to the
   `api.window` object emitted by `generateApiPrediction` (alongside `category`).
3. **`cli/src/generate-frontend.js`** — emit `readOnly: true` into `windowMeta` in
   `generateIndexComponent` (semantic marker; the behavioral read is `api.window.readOnly`).
4. **Generator tests / fixtures** — cover: readOnly → `hideCreate`/`hideDelete` in curated,
   `crud` flags all false, `api.window.readOnly`, and `windowMeta.readOnly`.

### B) `schema_forge` — UI gating + config (no publish; ships from this repo)

5. **Row quick actions (per-row Edit / Clone / Delete).** The New button is hidden by
   `hideCreate` (step A1), but the list's **row quick actions** overlay was a separate,
   ungated path — it wired a default Edit (navigate) and Delete (DELETE) regardless of
   `window.readOnly` or `crud.delete`. This is the path that let a GO tenant delete a
   Conversion Rate Downloader Log row during manual testing. Fixed by threading a
   `readOnly` flag down that path:
   - **`ListView.jsx`** — derive `windowReadOnly = api?.window?.readOnly === true`; set
     `readOnly` on the effective `rowQuickActions` and skip wiring the default `onEdit`/
     `onDelete` handlers when read-only (defense in depth). Row click still navigates to
     the (read-only) detail, so viewing is preserved.
   - **`DataTable.jsx`** — forward `rowQuickActions.readOnly` to `RowQuickActions`.
   - **`RowQuickActions.jsx`** — new `readOnly` prop hides the mutating actions (Edit,
     Clone, Delete); Email/Send and kebab menu actions stay gated by their own config.
6. **`tools/app-shell/src/components/contract-ui/DetailView.jsx`** — read
   `windowReadOnly = api?.window?.readOnly === true`; OR it into `isDocumentReadOnly` (reuses the
   existing save / delete / add-line / inline-edit gates), and pass `readOnly={windowReadOnly}`
   to both header `<Form>` renders so every field renders read-only. Scoped to the window flag,
   so processed-document behavior on other windows is unchanged.
7. **Config** — add `"readOnly": true` to the `window` block of **`conversion-rates`** and
   **`conversion-rate-downloader-log`**, then
   `make regen ONLY=conversion-rates,conversion-rate-downloader-log`.
8. **Tests (Vitest, delegated to Tester)** — DetailView (no Edit/Delete + fields read-only when
   `api.window.readOnly`), plus an assertion on the regenerated `contract.json`
   (`crud` disabled, `window.readOnly`/`hideCreate`/`hideDelete` set).

## Implementation notes (2026-07-15)

The implementation reused existing, already-tested mechanisms instead of building a new
gating path from scratch:

- **New button** → reused `hideCreate`.
- **Detail Delete / Save / add-line / inline edits** → reused `isDocumentReadOnly`.
- **Fields read-only** → reused `EntityForm`'s existing `readOnly` prop.

`window.readOnly` in decisions is sugar that expands into `hideCreate` + `hideDelete` +
`crud` all-false + `api.window.readOnly`.

### Correction (2026-07-16) — row quick actions gap

Manual testing found the list's **row quick actions** (per-row Edit + Delete overlay) were
NOT covered by the original plan — the design incorrectly stated "ListView.jsx — no change".
Those actions are wired independently of `crud`/`hideDelete`, so a GO tenant could still
delete a Conversion Rate Downloader Log row and saw an Edit pencil. Fixed by threading a
`readOnly` flag through `ListView → DataTable → RowQuickActions` (see step 5 above), hiding
the mutating actions on read-only windows.

A second gap surfaced after that: opening a record still showed the **detail toolbar Delete
button**. Its gate (`isDeleteButtonVisible`) only consulted `hideDeleteButton`/`deleteAction`/
status — not `isDocumentReadOnly` or `window.readOnly`. Fixed at the call site in
`DetailView.jsx` by passing `hideDeleteButton: hideDeleteButton || windowReadOnly` (reuses the
existing unconditional opt-out; scoped to the flag so processed-document delete behavior on
other windows is unchanged). `Save`/add-line/inline-edit/bulk-delete were already gated by
`isDocumentReadOnly`.

All fixes are in `schema_forge` (`tools/app-shell/`), so this ships from this repo with no
core publish.

### Correction (2026-09-07) — process buttons and detail-view kebab menu gap (ETP-5116)

Two more mutating surfaces were found ungated by `window.readOnly`, both in `DetailView.jsx`
(not the list-level `RowQuickActions.jsx` covered by the 2026-07-16 correction above, and
unrelated to it):

- **Process buttons** (the header and detail-line process-button rows, e.g. a custom
  "Create Amortization"-style action) rendered regardless of `windowReadOnly` — a read-only
  window's detail toolbar still exposed every process action. Fixed by adding
  `!windowReadOnly &&` to both button-list guards in `DetailView.jsx`.
- **`DetailMoreActionsMenu.jsx`** (the detail view's own "more" kebab menu — a distinct
  component from the list-row kebab inside `RowQuickActions.jsx` that step 5 / line 111 above
  refers to) rendered every `menuActions[]` item and any `customMenuContent` regardless of
  `windowReadOnly`. Every existing `customMenuContent` implementation
  (`GoodsShipmentMoreMenu`, `InventoryMenuContent`, `InternalConsumptionActions`) fires a write
  action on click, so it cannot be assumed read-only by default. Fixed by threading a new
  `windowReadOnly` prop into `DetailMoreActionsMenu`, forcing `visibleActions = []` and
  `hasCustomContent = false` when the window is read-only.

Neither surface was mentioned in the original architecture/data-flow diagram or the step-5/6
change list above — this closes that gap rather than contradicting either. The line-111 claim
("kebab menu actions stay gated by their own config") remains accurate as written: it describes
`RowQuickActions.jsx`'s own kebab (list view, per row), which this pass did not touch and which
is still gated only by its own `menuActions`/`visibleWhen` config, not by `windowReadOnly`.

### Correction (2026-09-08) — ETP-5116's kebab fix conflated two different `readOnly` sources (ETP-5233)

`windowReadOnly` (`DetailView.jsx`) is actually an OR of two semantically different flags:
`api?.window?.readOnly` — the **static** `decisions.json` "this window's data is view-only by
design" declaration this whole doc is about — and `windowProp?.readOnly` — the **runtime**
ETP-4520 per-role access-tier override ("this user's role only has read-only access", see
`buildWindowAccessWiring`/`effectiveWindow` in `ListView.jsx`/`DetailView.jsx`). Every consumer
listed above (save, delete, add-line, inline edits, process buttons) legitimately wants the OR of
both — a window is non-editable either because it's declared read-only or because this user's
role can't write to it.

The 2026-09-07 correction above wired `DetailMoreActionsMenu` to that same combined
`windowReadOnly`, but the kebab is not like those other consumers: a window can be statically
`window.readOnly: true` for CRUD (no create/edit/delete) while still declaring a sanctioned
document-action exception in its kebab — `matched-purchase-invoices` keeps Post/Unpost this way
(see `docs/generated-custom-windows/matched-purchase-invoices.md`). Gating the kebab on the
combined flag hid Post/Unpost for every user on that window, including ones with full read-write
role access, which is a functional regression, not the intended "hide mutating actions from a
read-only role" behavior.

Fixed by giving the kebab its own, narrower signal: `menuActionsReadOnly = windowProp?.readOnly
=== true` (role-tier only, no `api?.window?.readOnly`), passed to `DetailMoreActionsMenu`'s single
render call site instead of `windowReadOnly`. Every other consumer of the combined flag is
unchanged — they still correctly straddle both signals. The lesson for the next window-builder:
when a flag is a deliberate OR of "static declaration" and "runtime role tier", a NEW consumer
must be checked against which half of that OR it actually needs before being wired to the
combined flag — the kebab needed only the role-tier half.

## Testing strategy

- **Core:** generator fixtures — `window.readOnly` in decisions produces `crud` all-false on
  every entity, `window.readOnly` in the contract, and `windowMeta.readOnly` in `index.jsx`.
- **schema_forge:** Vitest for `DetailView` (no Edit/Delete + fields read-only when
  `api.window.readOnly`); assert the regenerated `conversion-rates` / `downloader-log` contracts
  have `crud` disabled and `window.readOnly`/`hideCreate`/`hideDelete` set. The New-button hiding
  is `hideCreate` (existing behavior, covered in core). All test work is delegated to the
  `test-generator` subagent (Tester).
- **Manual:** in the GO UI, open both windows as a GO tenant → no New button, no delete, fields
  read-only; confirm classic AD still allows full edit.

## Rollout

1. PR in `schema_forge_core` → publish `@etendosoftware/schema-forge-cli` → bump the version in
   this repo's `package.json`.
2. Regenerate `conversion-rates` and `conversion-rate-downloader-log` with the new CLI.
3. PR in `schema_forge` (UI gating + regenerated config).

All work targets `feature/ETP-4474` (both repos); PRs target the epic branch, not `main`.

## Out of scope

- Backend (NEO Headless) enforcement of read-only.
- A granular `window.permissions` object (deferred until a partial case exists).
- Any change to classic Etendo behavior.
