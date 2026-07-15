# Design — `window.readOnly` capability (ETP-4474)

- **Date:** 2026-07-15
- **Jira:** ETP-4474 (epic ETP-3504 — Etendo Next)
- **Author:** Forge session
- **Status:** Approved (pending spec review)

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
        ▼  [resolve-curated.js  — core]   propagate readOnly to curated
        ▼  [generate-contract.js — core]  emit window.readOnly=true
        │                                 + force crud.<entity>.{post,put,patch,delete}=false
        ▼  [generate-frontend.js — core]  windowMeta.readOnly=true (semantic marker)
        ▼
contract.json + generated/ (schema_forge)
        │
        ▼  ListView / DetailView (schema_forge) honor crud → no New / no Edit / no Delete / fields RO
```

### Why lean on `crud` rather than a brand-new prop

The generated contract already emits a per-entity `crud` object
(`api.crud.<entity>.{get,getById,post,put,patch,delete}`) and the runtime already
honors part of it — `DetailView` hides delete with
`api?.crud?.[entity]?.delete ?? true`. Reusing `crud` keeps a **single source of
truth** for CRUD permissions. `window.readOnly` is sugar that flips those flags off
in bulk. `windowMeta.readOnly` remains only as a semantic marker (e.g. a future
"read-only" badge in the UI).

## Changes by repo

### A) `schema_forge_core` — generator (requires publishing `@etendosoftware/schema-forge-cli`)

1. **`cli/src/resolve-curated.js`** — propagate `window.readOnly` from decisions to the curated model.
2. **`cli/src/generate-contract.js`** — when `window.readOnly === true`: set every entity's
   `crud.{post,put,patch,delete} = false`, and emit `window.readOnly: true` in the contract.
3. **`cli/src/generate-frontend.js`** — emit `readOnly: true` into `windowMeta`.
4. **Generator tests / fixtures** — cover all three: readOnly → crud flags false, contract
   `window.readOnly`, and `windowMeta.readOnly`.

### B) `schema_forge` — UI gating + config (no publish; ships from this repo)

5. **`tools/app-shell/src/components/contract-ui/ListView.jsx`** — hide the **New** button
   (currently ~line 808) when `crud.<entity>.post === false`.
6. **`tools/app-shell/src/components/contract-ui/DetailView.jsx`** — block **Edit / Save** when
   `put` and `patch` are both `false` (delete is already gated). Form renders in view mode.
7. **Config** — add `"readOnly": true` to the `window` block of **`conversion-rates`** and
   **`conversion-rate-downloader-log`**, then
   `make regen ONLY=conversion-rates,conversion-rate-downloader-log`.
8. **Tests (Vitest, delegated to Tester)** — ListView (New hidden when `!post`), DetailView
   (no Edit/Delete when read-only), plus an assertion on the regenerated `contract.json`.

## Testing strategy

- **Core:** generator fixtures — `window.readOnly` in decisions produces `crud` all-false on
  every entity, `window.readOnly` in the contract, and `windowMeta.readOnly` in `index.jsx`.
- **schema_forge:** Vitest for `ListView` (New button hidden) and `DetailView` (no Edit/Delete,
  fields read-only); assert the regenerated `conversion-rates` / `downloader-log` contracts have
  `crud` disabled. All test work is delegated to the `test-generator` subagent (Tester).
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
