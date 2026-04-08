# Plan: Window Template Extensibility System

## Context

Currently, all windows render using the same hardcoded template pattern (ListView + DetailView) determined only by entity count (single vs header-detail). There is no way to:
1. Use an alternative structured template (Kanban, Calendar) for a specific window
2. Provide a fully custom implementation for a window that doesn't fit any template

The user wants two capabilities:
- **Custom windows**: A window can provide its own React component, bypassing the generated pipeline entirely
- **Alternative templates**: Pre-built structured templates (Kanban, Calendar, etc.) that a window can opt into via configuration

## Approach

Add a `layoutType` property to the contract schema and a convention-based custom component directory. The system resolves templates at two levels:

1. **Contract level** (`contract.json` → `generate-frontend.js`): The generator reads `layoutType` and emits different component code per template type
2. **Registry level** (`registry.js`): Custom windows register their own loader pointing to a hand-written component in `tools/app-shell/src/windows/custom/`

### Layout Types

| `layoutType` | Behavior |
|---|---|
| `"default"` (or absent) | Current ListView/DetailView — no change |
| `"kanban"` | Generated code uses KanbanBoard + config from `templateConfig` |
| `"calendar"` | Generated code uses CalendarView + config from `templateConfig` |
| `"custom"` | Generator skips this window; registry points to hand-written component |

---

## Changes

### 0. Data Origin — where `layoutType` is set

`layoutType` and `templateConfig` originate in `schema-curated.json` (the `window` object). Two paths:

1. **Manual:** Developer edits `schema-curated.json` and adds `layoutType`/`templateConfig` to `window`.
2. **Via /classify:** The `/classify` skill can optionally ask the user what layout they want and write it to the curated schema. This is NOT the default flow — only when the user explicitly requests it.

Flow: `schema-curated.json` → `generate-contract.js` → `contract.json` → `generate-frontend.js`

### 1. Contract Schema — add `layoutType` + `templateConfig`

**File:** `artifacts/{window}/contract.json` (schema, not a code change — documents the new fields)

```json
"window": {
  "id": "143",
  "name": "Sales Order",
  "primaryEntity": "order",
  "category": "sales",
  "layoutType": "default",
  "templateConfig": null
}
```

For Kanban:
```json
"layoutType": "kanban",
"templateConfig": {
  "groupByField": "documentStatus",
  "columns": [
    { "value": "DR", "title": "Draft", "color": "gray" },
    { "value": "CO", "title": "Completed", "color": "green" }
  ],
  "cardTitle": "documentNo",
  "cardSubtitle": "businessPartner",
  "cardValue": "grandTotal"
}
```

For Calendar:
```json
"layoutType": "calendar",
"templateConfig": {
  "dateField": "orderDate",
  "endDateField": null,
  "eventTitle": "documentNo",
  "eventType": "documentStatus"
}
```

For Custom:
```json
"layoutType": "custom"
```

### 2. Generator — template-aware code emission

**File:** `cli/src/generate-frontend.js`

**Changes to `generateAll()`** (~line 547):
- Read `layoutType` from `frontendContract.window.layoutType`
- If `"custom"` → call new `generateCustomScaffold()` — generates a skeleton component with rich metadata comments
- If `"kanban"` → call new `generateKanbanPage()` instead of `generatePageComponent()`
- If `"calendar"` → call new `generateCalendarPage()` instead of `generatePageComponent()`
- If `"default"` or absent → current behavior (no change)

**New functions:**

`generateKanbanPage(primaryEntity, contract)`:
- Imports `KanbanBoard` from `@/components/contract-ui`
- Emits a component that:
  - Uses `useEntity` hook to fetch records
  - Maps records to `{ columns, cards }` using `templateConfig`
  - Renders `<KanbanBoard>` with drag-to-change-status handler
  - On card click → navigates to `/:windowName/:recordId` (DetailView)

`generateCalendarPage(primaryEntity, contract)`:
- Imports `CalendarView` from `@/components/contract-ui`
- Emits a component that:
  - Uses `useEntity` hook to fetch records
  - Maps records to `events[]` using `templateConfig`
  - Renders `<CalendarView>` with month navigation
  - On event click → navigates to `/:windowName/:recordId`

Both generators still produce `Table.jsx`, `Form.jsx` (for the detail/edit view when clicking a card/event) and `mockCatalogs.js`.

UI customization is driven by `decisions.json` config keys (see `docs/ui-customization.md`), not inline code markers.

`generateCustomScaffold(primaryEntity, detailEntity, contract)`:
- Generates a **single `index.jsx`** file placed in `windows/custom/{window-name}/`
- The component is a working empty shell (renders a placeholder with the window name)
- Rich JSDoc/comments block at the top containing ALL available window metadata:
  - Window info: id, name, category, specName, API base URL
  - All entities with their table names, tab IDs
  - All fields per entity: name, column, type, visibility, required, reference, inputMode, section, displayLogic, readOnlyLogic
  - All processes available for the window (name, label, endpoint)
  - Read-only fields (for summary strips)
  - Available contract-ui components (KanbanBoard, CalendarView, DataTable, EntityForm, ListView, DetailView, etc.)
  - Available hooks (useEntity, useAuth)
  - API patterns: list URL, detail URL, selector URL, action URL
- Also generates `mockCatalogs.js` so FK references are available
- The scaffold includes an import/path reference to `contract.json` so AI can read the full contract for context
- The scaffold is written to `windows/custom/` (NOT to `artifacts/generated/`)
- **Regeneration safety:** If `index.jsx` already exists, the new scaffold is written as `index.jsx.new` — the existing custom code is never touched. AI or the developer can then diff and merge.

### 3. Custom Window Convention

**New directory:** `tools/app-shell/src/windows/custom/`

Convention:
- Each custom window lives in `custom/{window-name}/index.jsx`
- Receives same props as any window: `{ token, apiBaseUrl, windowName, recordId, window }`
- Can import any `contract-ui` component, hooks, or build entirely from scratch
- The generator creates the initial scaffold with all metadata as comments — developer builds on top
- **Never overwritten** on regeneration — if file exists, generator writes `index.jsx.new` with updated metadata so AI can adapt the existing component

Example: `tools/app-shell/src/windows/custom/dashboard-crm/index.jsx`

### 4. Registry — custom loader support (auto-registered)

**File:** `tools/app-shell/src/windows/registry.js`

**Changes to `buildWindowMap()`:**
- Add a `customLoaders` map alongside `windowLoaders`:

```js
const customLoaders = {
  // Auto-registered by pipeline when layoutType: "custom"
};

// In buildWindowMap():
loader: windowLoaders[item.name]
  || customLoaders[item.name]
  || (() => import('./PlaceholderWindow.jsx')),
```

**Auto-registration:** When the pipeline generates a custom scaffold, it also adds the entry to `customLoaders` in `registry.js` if it doesn't already exist. This is done by:
1. Reading `registry.js`
2. Checking if the window name already has an entry in `customLoaders`
3. If not, inserting a new line: `'window-name': () => import('./custom/window-name/index.jsx'),`

This avoids the developer having to do a manual step after the scaffold is created.

### 5. Pipeline — custom scaffold path with regeneration safety

**File:** `cli/src/pipeline.js`

In step F8 (generate-frontend):
- After reading the contract, check `contract.frontendContract.window.layoutType`
- If `"custom"` → take the **custom scaffold path** (see below), skip `artifacts/generated/`
- Otherwise proceed normally (the generator handles kanban/calendar internally)

**Custom scaffold regeneration logic:**

```
customDir = tools/app-shell/src/windows/custom/{window-name}/
existingFile = customDir/index.jsx

if (!existingFile exists):
  → Write scaffold as index.jsx                    # First time
  → Log: "Custom scaffold created at ..."
else:
  → Write scaffold as index.jsx.new                # Regeneration
  → Log: "Custom scaffold updated at index.jsx.new (existing index.jsx preserved)"
  → Log: "Use AI to diff index.jsx vs index.jsx.new and adapt changes"
```

This mirrors the existing `.old` pattern in the pipeline (line 428) but inverted — the **old file stays in place** and the **new content gets a suffix**, because for custom windows the developer's code is the source of truth, not the generated output.

The `mockCatalogs.js` file follows the same pattern: if it already exists → write as `mockCatalogs.js.new`.

**Why not just skip?** Because the contract may have changed (new fields, new processes, renamed entities). The `.new` scaffold contains updated metadata comments that the developer (or AI) needs to merge into the existing component.

**Auto-registration:** After writing the scaffold, the pipeline also auto-registers the custom loader in `registry.js` (see section 4).

### 6. Contract Generator — emit layoutType

**File:** `cli/src/generate-contract.js`

- When building `frontendContract.window`, include `layoutType` from curated schema if present
- Default to `"default"` when not specified
- Include `templateConfig` when `layoutType` is kanban/calendar

### 7. Documentation — CLAUDE.md updates

**File:** `CLAUDE.md`

**New section** (after "Custom Section Preservation"):

**"Window Template Extensibility"** — documents:
- `layoutType` values (`default`, `kanban`, `calendar`, `custom`) and what each does
- `templateConfig` structure for kanban/calendar
- The `windows/custom/{name}/` convention
- Regeneration safety: `index.jsx.new` behavior when custom component already exists
- Registry: `customLoaders` map in `registry.js` for custom windows
- That `mockCatalogs.js` also follows the `.new` pattern on regeneration

**Update "Repository Structure"** — add `windows/custom/` under `tools/app-shell/src/`:
```
├── tools/
│   ├── app-shell/
│   │   └── src/
│   │       └── windows/
│   │           ├── custom/          # Hand-written custom window components
│   │           ├── registry.js      # Window loader registry
│   │           └── ...
```

**Update "Key Data Flow"** — add layoutType dispatch note in the frontend generation step.

---

## Files to Modify

| File | Change |
|---|---|
| `cli/src/generate-frontend.js` | Add `generateKanbanPage()`, `generateCalendarPage()`, modify `generateAll()` to dispatch by layoutType |
| `cli/src/generate-contract.js` | Emit `layoutType` + `templateConfig` in contract |
| `cli/src/pipeline.js` | Custom scaffold path for `layoutType: "custom"` + auto-register in registry |
| `tools/app-shell/src/windows/registry.js` | Add `customLoaders` map + merge into `buildWindowMap()` |
| `tools/app-shell/src/windows/custom/` | Create directory (empty initially, convention documented) |
| `CLAUDE.md` | New "Window Template Extensibility" section + update Repository Structure |

## Files NOT Modified

- `WindowLoader.jsx` — No changes needed. It already loads whatever the registry returns.
- `KanbanBoard.jsx` / `CalendarView.jsx` — Already complete and exported. Used as-is.
- `DetailView.jsx` / `ListView.jsx` — No changes. Still used for default layout + as fallback detail view for kanban/calendar card clicks.

---

## Verification

1. **Default windows unchanged**: Run `node cli/src/generate-frontend.js artifacts/sales-order/contract.json` — output should be identical to current
2. **Kanban generation**: Create a test contract with `layoutType: "kanban"` + `templateConfig`, run generator, verify it produces a KanbanBoard-based page
3. **Calendar generation**: Same with `layoutType: "calendar"`
4. **Custom scaffold (first run)**: Create a contract with `layoutType: "custom"`, run pipeline — verify it creates `windows/custom/{name}/index.jsx`
5. **Custom regeneration**: Run pipeline again with updated contract — verify `index.jsx` is untouched and `index.jsx.new` is created with updated metadata
5. **Custom loader**: Add a minimal custom component in `custom/test-window/index.jsx`, add to `customLoaders`, verify it loads in the app
6. **Build**: `make build` succeeds with no errors
