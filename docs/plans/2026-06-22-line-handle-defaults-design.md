# Design — HandleDefaults for detail lines (ETP-4244)

**Status:** approved design, pre-implementation
**Date:** 2026-06-22
**Scope:** Schema Forge frontend (`tools/app-shell`) + pipeline generators (`cli/src`).
Backend (`com.etendoerp.go`) already resolves line `/defaults` (incl. auxiliary
inputs) — that work is shipped; this is the frontend consumer + config knobs.

## Problem

When a user opens a new detail line in a generated window, the inline add-row
seeds fields from `DataTable.buildEmpty()`, which only applies **literal**
defaults — fields whose AD default is a macro (`@DESCRIPTION1@`, `@SQL=…`,
session vars) are seeded to `''`. Nothing in the frontend ever calls the line
`/defaults` endpoint, so backend-resolved defaults (e.g. the GL Journal line
`Description` defaulting to the parent journal's description) never reach the UI.

The header form already does this correctly: `useEntity.handleNew` fetches
`/{entity}/defaults` and seeds the form via `normalizeDefaultValue`. Detail lines
have no equivalent. This design adds it, generically.

## Goals

- A new line's editable fields are pre-filled from the backend line `/defaults`
  response, including macro-default fields (the `@DESCRIPTION1@` case).
- **On by default** ("lines handle defaults"), with a per-entity opt-out and a
  per-field opt-out.
- Generic across windows; reuses the existing header-defaults machinery.
- No regression to current add-row behavior when the feature is off or when the
  backend returns nothing.

## Non-goals

- Custom add-modals (`customAddModal`) and the edit-existing side-panel flow.
- Header defaults (already handled by `handleNew`).
- Backend changes — already shipped in `com.etendoerp.go`.

## Configuration knobs

Two declarative knobs flow `decisions.json → contract → frontend`. Both are
emitted **only when non-default** to keep regen diffs of existing windows empty.

| Knob | Level | Default | Meaning |
|------|-------|---------|---------|
| `handlesDefaults` | entity (`entities.<name>`) | `true` | When `false`, the frontend does **not** fetch `/defaults` for this detail entity; add-row keeps current literal-only seeding. |
| `skipDefault` | field (`entities.<name>.fields.<field>`) | `false` | When `true`, the add-row never applies a resolved default to this field (it stays empty / keeps its literal seed). |

- `resolve-curated.js` passes both through (field-level via `FIELD_DECISION_COPY_PROPS`).
- `generate-contract.js` emits `entity.handlesDefaults` only when `false`, and
  `field.skipDefault` only when `true`. The frontend treats absence as the default.
- `generate-frontend.js` emits `skipDefault` into the add-row field literals so
  `DataTable` can read it; `handlesDefaults` is read at the entity level (see below).

## Architecture (Approach A — fetch in `useEntity`)

The capability lives in `useEntity`, mirroring the existing `fetchChildren`.
Because every detail entity — the primary lines tab AND each secondary tab — is
its own `useEntity` instance (`hook`, `secondaryHook0..3` in `DetailView`), a
single addition to the hook automatically covers primary + secondary add-rows.

### `useEntity` — `fetchChildDefaults(parentId)`

- New function, signature parallels `fetchChildren(parentId)`.
- `GET {apiBaseUrl}/{childEntity}/defaults?parentId={parentId}`.
- Normalizes the response with the **existing exported** `normalizeDefaultValue`
  (dates `dd-MM-yyyy → yyyy-MM-dd`, booleans `Y/N → true/false`), discards `id`.
- Stores the result in new hook state `childDefaults` (a `{key: value}` map),
  keyed/cached per `parentId`; returns the map. Best-effort: on error/no
  `childEntity`/no `parentId`, sets/keeps an empty map (same posture as
  `handleNew`).
- Exposed in the hook's return alongside `fetchChildren`.

### `DetailView` — drive the fetch and pass results down

- `parentRecordId` already exists (`hook.selected?.id ?? recordId ?? hook.editing?.id`).
- In an effect keyed on `parentRecordId` + entity, when `parentRecordId` is set
  **and** the entity's `handlesDefaults !== false`, call
  `hook.fetchChildDefaults(parentRecordId)` for the primary hook and the same for
  each active `secondaryHookN` (using that tab's entity). Opt-out (`handlesDefaults
  === false`) → skip the call entirely (no network request).
- Pass each hook's `childDefaults` to the corresponding add-row as a new
  `resolvedDefaults` prop (primary add-row at the main `DataTable`; secondary
  add-rows via `SecondaryTableTab`).
- `handlesDefaults` is read from the contract entity metadata available to
  `DetailView` (default true when absent). Exact threading (via `api`/contract vs a
  generated prop) is an implementation detail for the plan; default-true keeps it
  safe if unset.

### `DataTable` — seed empties from `resolvedDefaults`

- New optional prop `resolvedDefaults = {}`.
- In `buildEmpty()`, after the existing seeding loop and the display-only
  `seedValues` loop, apply resolved defaults with **fill-empties-only** semantics:

  ```js
  for (const [key, val] of Object.entries(resolvedDefaults)) {
    const f = fieldMap[key];
    if (!f || f.skipDefault) continue;            // unknown or opted-out field
    const cur = empty[key];
    const isEmpty = cur == null || cur === '';
    if (isEmpty && val != null && val !== '') empty[key] = val;
  }
  ```

- This is the single change that lets editable macro-default fields (e.g.
  `description`) populate. Literal defaults (`quantity: 1`), the client-computed
  `lineNo` (set first, so never empty), parent-derived display `seedValues`, and
  `skipDefault` fields are all preserved.
- `resolvedDefaults` must be a **stable reference** for the add-row's lifetime
  (memoized per parent in `DetailView`) so `buildEmpty`'s reset effect does not
  re-seed mid-edit. Because the fetch is driven when the record loads (parent
  known), `resolvedDefaults` is ready before the user opens the add-row — no
  flash, no clobbering of typed input.

## Data flow

```
decisions.json (handlesDefaults / skipDefault)
  → resolve-curated.js → generate-contract.js (emit when non-default)
  → generate-frontend.js (skipDefault in add-row field literals)
  → DetailView effect: hook.fetchChildDefaults(parentRecordId)   [if handlesDefaults]
      → useEntity: GET /{childEntity}/defaults?parentId=  → normalizeDefaultValue → childDefaults
  → DataTable resolvedDefaults → buildEmpty fills empty, non-skipDefault editable fields
```

## Edge cases

- **Opt-out off** (`handlesDefaults: false`) → no fetch; behavior identical to today.
- **New/unsaved header** (no `parentRecordId`) → no fetch; add-row uses literal seeds.
- **`skipDefault` field** → never filled from resolved defaults.
- **Backend returns nothing for a field** → field stays empty (no-op).
- **Sequence/`lineNo`** → client `defaultLineNo` is set first in `buildEmpty`, so the
  field is non-empty and the resolved value is not applied (avoids `<…>` preview leak).
- **Fetch failure** → empty map; add-row seeds as today (best-effort, logged).

## Testing

- **Vitest (`tools/app-shell`)**
  - `DataTable` `buildEmpty`: resolved default fills an empty editable field; does
    **not** override a literal default / `lineNo` / a `skipDefault` field / a
    user-touched value.
  - `useEntity.fetchChildDefaults`: builds the correct URL with `parentId`,
    normalizes dates/booleans, caches per parent, returns `{}` on error / missing
    `childEntity` / missing `parentId`.
  - `DetailView`: with `handlesDefaults !== false` and a `parentRecordId`, the
    add-row receives `resolvedDefaults`; with opt-out, no fetch fires.
- **Generators (node test runner, `cli/test`)**
  - `generate-contract`: emits `handlesDefaults` only when `false`; `skipDefault`
    only when `true`; both absent otherwise.
  - `generate-frontend`: `skipDefault` appears in the add-row field literal.
- **Playwright (mocked)**
  - Journal line add-row: opening a new line pre-fills `description` from the
    mocked line `/defaults` response; a `skipDefault` field stays empty.
- **Workflow:** run the npx unit + Playwright suites green as a baseline → implement
  → rerun. (gradlew Java tests out of scope for now.)

## Rollback

- Frontend is additive and gated: with `handlesDefaults` absent the feature is on
  but inert where the backend returns nothing; revert the `useEntity` /
  `DetailView` / `DataTable` commits to remove. Generator knobs are emit-when-non-
  default, so reverting them leaves existing contracts byte-identical.

## Affected files (anticipated; finalized in the plan)

- `tools/app-shell/src/hooks/useEntity.js` — `fetchChildDefaults` + `childDefaults`.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — drive fetch, pass `resolvedDefaults`.
- `tools/app-shell/src/components/contract-ui/DataTable.jsx` — `resolvedDefaults` seeding in `buildEmpty`.
- `cli/src/resolve-curated.js`, `cli/src/generate-contract.js`, `cli/src/generate-frontend.js` — knobs.
- `docs/decisions-reference.md` — document `handlesDefaults` + `skipDefault`.
- Tests as listed above.
