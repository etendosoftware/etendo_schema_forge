# UI Customization Guide

How to extend and customize window frontends in Schema Forge. All customization is declared in `decisions.json` — the generator reads it and produces the correct imports and props automatically. Custom component files live in `tools/app-shell/src/windows/custom/{window}/` and are **never overwritten** by the pipeline.

## Core principle

```
decisions.json (source of truth)
    ↓
generate-frontend.js (reads window config)
    ↓
artifacts/{window}/generated/…Page.jsx (emits imports + props)
    ↓  reads from
tools/app-shell/src/windows/custom/{window}/ (your hand-written components)
```

**Never edit generated files.** If you need to change UI behavior, either:
- Add/change a key in `decisions.json` and re-run the generator, or
- Write/update a component in `windows/custom/{window}/` that the generator already imports via a config key.

---

## Customization options reference

### 1. `window.statusBar` — declarative summary bar

Generates a `{WindowName}StatusBar` component with colored metric cards and an optional progress indicator. No custom JSX needed — fully configured from `decisions.json`.

**Use when:** the detail view needs KPI tiles at the top showing numeric field values (e.g., depreciation progress, total amounts).

```json
"window": {
  "statusBar": {
    "cards": [
      { "field": "depreciatedValue", "label": "Depreciated Value", "color": "blue",   "icon": "TrendingDown" },
      { "field": "depreciatedPlan",  "label": "Depreciated Plan",  "color": "teal",   "icon": "TrendingDown" }
    ],
    "progress": {
      "numerator":      "depreciatedValue",
      "denominator":    "assetValue",
      "condition":      "depreciate",
      "label":          "Depreciation",
      "color":          "orange",
      "completedColor": "green",
      "completedIcon":  "CheckCircle2"
    }
  }
}
```

The generator emits a `{WindowName}StatusBar` component inside `@sf-generated` markers and wires it as `headerContent` on `DetailView`. **Real example:** `assets`.

---

### 2. `window.listKpiCards` — KPI row above the list

Imports a custom component and renders it as `headerContent` in `ListView` (above the table). The component lives in `windows/custom/{window}/{ComponentName}.jsx`.

**Use when:** the list view needs summary metrics or aggregated data above the records (e.g., total contacts, outstanding credit).

```json
"window": {
  "listKpiCards": {
    "customComponent": "ContactsKpiCards"
  }
}
```

Generator output:
```jsx
import ContactsKpiCards from '@/windows/custom/contacts/ContactsKpiCards';
// …
<ListView headerContent={(p) => <ContactsKpiCards {...p} />} … />
```

Props received: same as `ListView` (`token`, `apiBaseUrl`, `windowName`, `api`, …). **Real example:** `contacts`.

---

### 3. `window.headerExtra` — extra section at the bottom of the detail form

Imports a custom form component and passes it as `formFooter` to `DetailView`. Renders below the main entity form in the detail view.

**Use when:** the detail needs an extra non-standard section that doesn't map 1:1 to a tab (e.g., billing preferences, computed summaries).

```json
"window": {
  "headerExtra": {
    "customForm": "BillingPreferencesForm"
  }
}
```

Generator output:
```jsx
import BillingPreferencesForm from '@/windows/custom/contacts/BillingPreferencesForm';
// …
<DetailView formFooter={BillingPreferencesForm} … />
```

Props received: `recordId`, `data`, `token`, `apiBaseUrl`, `api`. **Real example:** `contacts`.

For `contacts`, the custom `BillingPreferencesForm` keeps customer/vendor billing controls disabled
until the header record exists (`data.id` present). This mirrors Classic behavior where billing
details are edited after the Business Partner is created.

---

### 4. `window.customComponents` — replace or inject structural components

Injects custom components into specific structural slots of `DetailView`. Each key maps to a component name (file must exist at `windows/custom/{window}/{value}.jsx`).

**Use when:** a specific part of the standard layout needs a fully custom implementation.

```json
"window": {
  "customComponents": {
    "topbarRight":    "GoodsShipmentActions",
    "bottomSection":  "InvoiceBottomPanel",
    "sidePanel":      "PaymentActivityPanel",
    "sidePanelStyle": { "width": "40%", "minWidth": 260 },
    "headerTable":    "InvoiceHeaderTable"
  }
}
```

| Key | Prop emitted | Renders where | Props received |
|-----|-------------|---------------|----------------|
| `topbarRight` | `topbarRight={X}` | Right side of detail topbar (replaces status badge) | `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess` |
| `bottomSection` | `bottomSection={X}` | Bottom of detail view (replaces totals + footer) | `recordId`, `data`, `token`, `apiBaseUrl`, `api`, `summary`, `notesField`, `onFieldChange`, `notesFocused`, `setNotesFocused` |
| `sidePanel` | `sidePanel={X}` | Right-side panel alongside the detail form | `recordId`, `data`, `token`, `apiBaseUrl` |
| `sidePanelStyle` | `sidePanelStyle={…}` | CSS style for the side panel container | — (style object, not a component) |
| `headerTable` | replaces `{Entity}Table` import | List table in the master list view | Standard table props |

**Real examples:**
- `topbarRight`: `goods-shipment` (`GoodsShipmentActions`), `sales-invoice` (`InvoiceTopbarExtra`)
- `bottomSection`: `payment-in` (`PaymentBottomPanel`), `sales-invoice` (`InvoiceBottomPanel`)
- `sidePanel`: `payment-in` (`PaymentActivityPanel`)
- `headerTable`: `sales-invoice` (`InvoiceHeaderTable`)

---

### 5. `window.menuActions` — extra items in the "more" menu

Adds actions to the triple-dot menu in the detail view. Visibility can be gated by document status.

**Use when:** there are secondary document actions (cancel, duplicate, reverse) that don't fit in the main topbar.

```json
"window": {
  "menuActions": [
    { "key": "duplicate", "label": "Duplicate" },
    { "key": "cancel",    "label": "Cancel",          "destructive": true, "visibleWhenStatus": "CO" },
    { "key": "reverse",   "label": "Reverse Payment", "destructive": true, "visibleWhenStatus": ["RPPC", "RPR"], "columnName": "aPRMReversePayment" },
    { "key": "reactivate","label": "Reactivate Order","visibleWhenStatus": "CO", "documentAction": "RE", "successMessage": "Order reactivated" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier. |
| `label` | string | Display label in the menu. |
| `destructive` | boolean | Renders in red. |
| `visibleWhenStatus` | string \| string[] | Only show when `documentStatus` matches. Omit to always show. |
| `documentAction` | string | If set, invokes the standard DocAction endpoint with this value (`"RE"`, `"CO"`, `"VO"`, …) via the shared `useDocumentAction` hook. After success, the record is refreshed and `successMessage` (or a generic label) is shown inline. Errors from the backend are surfaced inline as well. |
| `successMessage` | string | Text shown in the success banner after a `documentAction` resolves. |
| `columnName` | string | Fires `hook.handleProcess(columnName)`. Use for AD process buttons that aren't DocAction-based. |
| `component` | string | Imports a custom component from `windows/custom/{window}/` and opens it as a detail-menu modal. The component receives `currentRecord`, `token`, `apiBaseUrl`, `onClose`, and `onSaved`. |

Handler precedence: `documentAction` > `columnName` > `action` > `component` > empty placeholder `onClick`. Declare `documentAction` for any DocAction-style action (Reactivate, Void, Close, etc.) — the generator wires the full fetch + error flow automatically.

**The ⋮ button auto-hides when empty.** `DetailView` only renders the "more" button when, for the current record state, there is at least one visible `menuActions` entry **or** a `customComponents.moreMenuContent` is set. If every action is gated out (e.g. all `visibleWhenStatus: "CO"` while the document is in Draft), the button is not shown at all — it never renders as an empty, clickable dropdown.

**Real examples:** `goods-shipment` (cancel), `payment-in` (reverse via `columnName`), `sales-invoice` (duplicate, cancel), `sales-order` (reactivate via `documentAction: "RE"`).

#### Dynamic process-button captions — `processOverrides.<proc>.labelToggle`

A process button caption can switch based on a record field value. Add an optional `labelToggle: { field, equals, label }` to any `processOverrides` entry. When the current record's `field` strictly equals `equals`, the toolbar button shows `label`; otherwise it shows the entry's default `label`. Both go through `useMenuLabel`, so translations resolve automatically. It is fully opt-in: buttons without `labelToggle` render exactly as before.

```json
"processOverrides": {
  "processAsset": {
    "add": true,
    "label": "Create Amortization",
    "labelToggle": { "field": "processed", "equals": "Y", "label": "Recalculate Amortization" }
  }
}
```

This mirrors Etendo Classic list-reference buttons (e.g. Assets ref 800042 toggling on `A_Asset.Processed`). Full property table: `docs/decisions-reference.md → Process Overrides`.

---

### 6. `window.layoutType` — alternative page layouts

Switches the entire page to a different layout type.

**Use when:** the standard ListView/DetailView isn't suitable for the data model.

```json
"window": {
  "layoutType": "gallery"
}
```

| Value | Behavior | Extra config |
|-------|----------|-------------|
| `"default"` | Standard ListView + DetailView | — |
| `"kanban"` | `KanbanBoard` from `contract-ui` | `templateConfig.groupByField`, `columns`, `cardTitle`, etc. |
| `"calendar"` | `CalendarView` from `contract-ui` | `templateConfig.dateField`, `eventTitle`, etc. |
| `"gallery"` | Card gallery list + optional sidebar detail | Components in `windows/custom/{window}/`: `{Name}Gallery.jsx`, `{Name}Sidebar.jsx`, `{Name}DetailHeader.jsx` |
| `"custom"` | Pipeline generates a scaffold only; developer builds on top | Components in `windows/custom/{window}/index.jsx` |

See `docs/window-templates.md` for full `templateConfig` reference.

**Real examples:** `product` (gallery), many kanban/calendar windows.

---

### 6b. `window.agentPrompt` / field `agentPrompt` — AI agent guidance

Not a UI feature — guidance text returned to AI agents that consume the NEO Headless MCP server. Declared at two levels and surfaced in different MCP tools:

```json
"window": {
  "agentPrompt": "Always confirm with the user before completing a purchase order."
},
"entities": {
  "header": {
    "fields": {
      "warehouse": { "agentPrompt": "Pick the warehouse closest to the customer." }
    }
  }
}
```

| Level | decisions key | Persisted to | Returned by |
|-------|---------------|--------------|-------------|
| Spec | `window.agentPrompt` | `ETGO_SF_SPEC.AGENT_PROMPT` | `neo_discover` (per spec) |
| Field | `entities.{e}.fields.{f}.agentPrompt` | `ETGO_SF_FIELD.AGENT_PROMPT` | `neo_schema` (per field) |

`push-to-neo` reads these straight from `decisions.json` (like `defaultExpr`) and writes the DB columns; the value is also mirrored into `contract.mcp.json → agentProfile.agentPrompt` for inspection. Omitted from the MCP response when empty. See `docs/decisions-reference.md`.

---

### 7. `window.relatedDocuments` — related documents panel

Adds a "Related Documents" tab/section to the detail view. Requires a hand-written `RelatedDocuments.jsx` in `windows/custom/{window}/`.

**Use when:** the record links to other documents (orders, shipments, invoices) and users need to navigate between them.

```json
"window": {
  "relatedDocuments": true
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

### 7.b `window.attachments` — file attachments tab

Adds a transversal **Attachments** tab to the detail view for uploading, listing, downloading, and deleting files attached to the current record. The tab is **auto-enabled on every window** with `layoutType: "default"` — no opt-in needed. Set `attachments: false` to disable it, or pass an object to tune client-side limits.

**Use when:** the window represents a document/master record where users need to attach supporting files (PDFs, images, spreadsheets). For most transactional windows, no configuration is required — the tab is already there.

**Opt-out:**
```json
"window": {
  "attachments": false
}
```

**Custom limits:**
```json
"window": {
  "attachments": {
    "enabled": true,
    "maxSizeMB": 10,
    "allowedMimeTypes": ["application/pdf", "image/*"]
  }
}
```

**Limitations (v1):**
- Only available on `layoutType: "default"`. Kanban, calendar, gallery, and custom layouts ignore the option entirely.
- No pagination — the list does a single lazy fetch when the tab becomes active.
- Hard upload limit of **10 MB** enforced by the NEO servlet (`MultipartConfig`). `maxSizeMB > 10` will fail at upload time.

**Endpoints exposed by NEO Headless:**

| Method | URL | Action |
|--------|-----|--------|
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}` | List attachments for the record |
| `POST` | `/sws/neo/attachments/{tableName}/{recordId}` (multipart/form-data) | Upload a new attachment |
| `GET` | `/sws/neo/attachments/file/{attachmentId}` | Download a single attachment |
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}/zip` | Download all attachments as a ZIP archive |
| `DELETE` | `/sws/neo/attachments/file/{attachmentId}` | Delete an attachment |
| `PATCH` | `/sws/neo/attachments/file/{attachmentId}` body `{ "description": "..." }` | Update the attachment description |

The handler delegates to the standard Etendo `AttachImplementationManager` and stores metadata in the `C_FILE` table — attachments uploaded through this tab are visible in Classic Etendo and vice versa.

**Frontend behavior:** drag-and-drop drop zone + tabular listing with per-row actions (download, edit description, delete) and a global "Download all" action. The `tableName` is resolved from `frontendContract.entities.header.tableName` automatically — there is no manual wiring.

---

### 8. `window.notesField` — notes panel

Renders a designated field as an expandable notes panel in the detail view footer.

```json
"window": {
  "notesField": "description"
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

### 9. `window.hideDeleteWhenComplete` — conditional delete button

Hides the delete button when the document is not in Draft status.

```json
"window": {
  "hideDeleteWhenComplete": true
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

### 9b. `window.hideDeleteButton` — unconditional delete button opt-out

Unconditionally hides the Delete button/icon in **both** the detail view toolbar
and the list-row hover quick actions, for every record regardless of status.
Distinct from `hideDeleteWhenComplete` (conditional — only hides once the
document leaves Draft) and from `hideDelete` (which only disables the CRUD
delete capability declared in `contract.json`/the API, without touching the
UI affordance). Use `hideDeleteButton` when Delete should never be reachable
from the UI, e.g. master-data windows where records are provisioned/retired
outside the app.

```json
"window": {
  "hideDeleteButton": true
}
```

Defaults to `false`; when unset, delete visibility is exactly as before. This is a
stronger, state-independent form of `hideDeleteWhenComplete`: if you set
`hideDeleteButton`, `hideDeleteWhenComplete` becomes redundant. The gate lives in
the shared utility `tools/app-shell/src/utils/recordActions.js`, so both `DetailView`
and `RowQuickActions` stay in lockstep.

**Real examples:** `tax` (ETP-4464 — paired with `hideDelete: true` for
defense-in-depth: the API capability is disabled AND the UI icon is hidden).

---

### 9c. Standardized delete UX & `listViewOptions.hideBulkDelete` (ETP-4656)

`ListView` now renders a generic **"Delete selected"** action in the multi-select
toolbar (grid checkboxes), wired through the `useBulkRowDelete` hook
(`tools/app-shell/src/hooks/useBulkRowDelete.jsx`). This is **on by default** —
no `decisions.json` key is needed to enable it — and is suppressed only when:
- the window is read-only (`windowReadOnly`), or
- `listViewOptions.hideBulkDelete` is set (see below).

This complements the pre-existing single-row delete affordances
(`useRowDelete`, `DetailView`'s header delete) — all three delete surfaces
(header, row, bulk) now share the same failure-handling contract described
below.

**Opting out — `listViewOptions.hideBulkDelete`:**

```jsx
<ListView
  listViewOptions={{ hideBulkDelete: true }}
  ...
/>
```

Use this when a window already ships **its own** delete or bulk-delete
affordance and stacking the generic action would be redundant/confusing.

Unlike `hidePrint` / `hideStatusFilter` (documented in
`docs/decisions-reference.md` as `window.*` decisions.json keys that the
generator compiles into the `listViewOptions` prop it passes to `ListView`),
`hideBulkDelete` has **no decisions.json/generator wiring yet** — that
compilation step lives in the generator (`schema_forge_core`, out of scope for
this sub-task). Today the only way to set it is to pass `listViewOptions`
directly from a hand-written `windows/custom/{window}/index.jsx` wrapper, the
same way `contacts` does it. **That object REPLACES — it does not merge with —
the `listViewOptions` the generated page already passes to `ListView`**, so the
wrapper must repeat every flag the generated page sets (`hidePrint`,
`hideCounter`, `hideLink`, …) alongside `hideBulkDelete`, or those get silently
dropped. See `tools/app-shell/src/windows/custom/contacts/index.jsx` for the
canonical example.

> **ETP-4644:** the selection bar's "Vista Previa" (eye) button — and its
> `listViewOptions.hideEye` / `hideEyeCount` opt-out flags — were removed
> entirely from `ListView.jsx`. The button had no working backend and did not
> apply to any window, so it is gone unconditionally, with no flag needed or
> supported anymore.

**Known gap — `contacts`:** `contacts` sets `hideBulkDelete: true`, but this
does **not** mean "this window has no bulk delete." `contacts` has its own,
older bulk-delete affordance (a trash + X button pair rendered via
`selectionBarRightActions`, predating this mechanism) that was **not**
unified with `useBulkRowDelete` in this sub-task — that migration is tracked
as a follow-up. Read `hideBulkDelete: true` on a window as "has a different,
not-yet-migrated bulk-delete," never as "has none."

**`listViewOptions.hideListBar` gates only the IDLE list bar — never the
selection bar (ETP-4658 regression fix).** `hideListBar` exists for windows whose
custom `headerTable` slot draws the window's whole toolbar itself: the native
idle strip is then a duplicate that leaves an empty padded band behind, because
sort/refresh have no `hide*` flag of their own. It does **not** suppress the
selection bar, which is a different thing — transient, never empty, and the
standardized home of "Delete selected". While it did suppress both, every
custom-`headerTable` window silently lost grid multi-select delete; that is how
`financial-account` lost it, since the flag hid the only delete affordance even
once the grid was selectable again.

This is safe by construction rather than by convention: **the selection bar is
unreachable unless the grid is selectable.** A custom `headerTable` that wants no
selection at all simply keeps `selectable={false}` on its own `DataTable` and
never renders rows that can be picked — so it never sees a selection bar either
way. Conversely, a window that wants checkboxes but not the *generic* delete
button uses `hideBulkDelete`, not `hideListBar`.

Note that a window doing this swaps two bars, not stacks them: `ListView` renders
its selection bar as a **sibling above** the slot and cannot reach inside it, so
the slot must hide its own toolbar while a selection exists. To let it, `ListView`
now forwards its authoritative **`selectedRows`** in the Table-slot props
(read-only for the slot; `DataTable` has no such prop, so the spread is inert):

```jsx
function MyHeaderTable({ data, meta, selectedRows, ...props }) {
  const selectionActive = (selectedRows?.length ?? 0) > 0;
  return (
    <>
      {!selectionActive && <MyToolbar />}
      <DataTable {...props} data={data} /* selectable stays at its default */ />
    </>
  );
}
```

**Do NOT mirror the selection into slot-local state by wrapping
`onSelectionChange`.** `DataTable` empties and prunes its internal selection `Set`
silently from its `clearSelectionTrigger` / `deselectTrigger` effects **without**
calling `onSelectionChange`, so a local mirror still reads "selected" after a
successful bulk delete or a cancel — and the slot's toolbar never comes back.
Always derive from the `selectedRows` prop. See
`artifacts/financial-account/custom/AccountsHeaderTable.jsx` for the canonical
example — including why the toolbar is unmounted rather than merely hidden.

**Standardized delete-failure UX (applies to header, row, and bulk delete —
no configuration needed):**

- `useEntity`'s `extractErrorMessage`/`normalizeServerError` recognize
  FK-constraint-violation errors — both the raw Postgres RESTRICT wording and
  the classic Etendo `ErrorTextParser` AD_Message wording — and map them to one
  standardized, translated message (i18n key `deleteBlockedByReferences`):
  *"No es posible eliminar este registro porque tiene registros asociados."*
- `useEntity`'s `handleDelete` now **returns a boolean** (`true`/`false`).
  Callers must check it before navigating away or closing a confirm dialog —
  `DetailView`'s `confirmHeaderDelete` only navigates back to the grid on
  success, and `useRowDelete`'s confirm dialog now closes on failure too
  (previously it left a failed dialog open indefinitely, or navigated away on
  a failed header delete, with only a toast as feedback). Any new delete
  entry point built on `useEntity`/`useRowDelete` must follow the same
  check-before-navigate/close rule.

**Bulk-delete outcome contract — exactly ONE toast per outcome (never one per
row):** `useBulkRowDelete` issues one `DELETE` per selected row in parallel
(`Promise.allSettled`), then reports a single combined toast:

| Outcome | Toast | i18n key |
|---------|-------|----------|
| All rows succeed | success — "{count} registros eliminados correctamente." | `bulkDeleteAllSucceeded` |
| Partial failure | single warning — "{succeeded} de {total} registros eliminados. {failed} no pudieron eliminarse." | `bulkDeletePartialFailure` |
| All rows fail | error — "No se pudo eliminar ninguno de los {count} registros seleccionados." | `bulkDeleteAllFailed` |

On a partial failure, `ListView` keeps only the failed rows selected: `DataTable`
gained a paired `deselectTrigger`/`deselectRowIds` prop (alongside the existing
all-or-nothing `clearSelectionTrigger`) so only the succeeded row ids drop out
of the internal checkbox selection, leaving the failed ones checked for retry.

**Known, accepted wording limitation:** `bulkDeletePartialFailure`'s "{failed}
no pudieron eliminarse" does not grammatically vary for a singular failure
(reads "1 no pudieron eliminarse" instead of "1 no pudo eliminarse"). This is
deliberate — it matches the design doc's (Confluence "Eliminación de Registros
— Comportamiento Estándar") literal wording — not a bug to fix.

**New i18n keys** (all under `genericLabels`, both `en_US.json`/`es_ES.json`):
`deleteBlockedByReferences`, `bulkDeleteConfirmTitle`, `bulkDeleteConfirmMessage`,
`bulkDeleteSelected`, `bulkDeleteAllSucceeded`, `bulkDeletePartialFailure`,
`bulkDeleteAllFailed`.

**Real examples:** the generic mechanism applies to every window using the
standard `ListView` (nothing to declare). `contacts` is the one window that
currently opts out (see the known gap above).

---

### 10. `window.dateFilterKey` — date range filter column

Declares which list column the date range shortcut in the list toolbar targets.
Must match a column `key` whose `type` is `date`. If omitted, the date filter is
**not rendered** — there is no implicit fallback to the first date column, so
column order never affects the filter.

```json
"window": {
  "dateFilterKey": "orderDate"
}
```

**Real examples:** `sales-order` / `purchase-order` (`orderDate`),
`sales-invoice` / `purchase-invoice` (`invoiceDate`).

---

### 11. `linesEmptyState` — empty state when the lines tab has no rows

Displays a centered call-to-action inside the lines tab when the document is in Draft status and no child lines exist yet. Two wiring patterns are available:

**Pattern A — direct prop (preferred for windows that have no `bottomSection`):**
```jsx
// custom/index.jsx
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';

<GeneratedApp linesEmptyState={LinesEmptyState} ... />
```

**Pattern B — attached to `bottomSection` (used by windows that already have a bottom panel):**
```jsx
MyBottomPanel.linesEmptyState = MyLinesEmptyState;
<GeneratedApp bottomSection={MyBottomPanel} ... />
```

`DetailView` resolves the component as `linesEmptyState ?? bottomSection?.linesEmptyState`. Pattern A takes priority.

The generic `LinesEmptyState` component lives at `tools/app-shell/src/components/contract-ui/LinesEmptyState.jsx` and renders only when `data.documentStatus === 'DR'`. It receives `{ data, onAddLine, canAddLine }` from `DetailView`.

**`addLineGuard` — gate the add-line button on required header fields:**

```jsx
// Only show the "+ Add Lines" button once businessPartner is filled.
<GeneratedApp
  linesEmptyState={LinesEmptyState}
  addLineGuard={(d) => !!d?.businessPartner}
  ...
/>
```

`addLineGuard` receives current form data and must return `true` to enable adding lines. It gates both the button inside the empty state (`canAddLine` prop) and the `+ Add Line` button in the lines table header. Without a guard, adding is always allowed.

**`window.maxDetailLines` — cap the line count (decisions-driven; `0` = import-only lines):**

```json
// decisions.json
"window": {
  "maxDetailLines": 0
}
```

Unlike `addLineGuard` (a JSX prop on the custom wrapper), `maxDetailLines` is a `decisions.json` option, so it survives pipeline re-runs. The generator translates it into a count-based guard on the generated page:

```jsx
// emitted in artifacts/{window}/generated/web/{window}/*Page.jsx
addLineGuard={(_, children) => children.length < 0}   // maxDetailLines: 0 — always false
```

- **`N > 0`** caps the detail entity at `N` lines: the add-line affordances disappear once the child count reaches `N`.
- **`0`** disables manual line creation entirely — the **import-only lines pattern**. `canAddLines` resolves to `false` unconditionally, so `DetailView`:
  - passes `canAddLine={false}` to the lines empty state — the shared `LinesEmptyState` hides its primary `+ Add Lines` button and keeps `secondaryAction` (typically an import button), which becomes the only way to create lines;
  - never renders the add-line area below the lines table (`canShowAddLineArea` requires `canAddLines`), which also hides the inline `detailExtraActions` trigger and the add-line kebab fed by `lineMenuActions`, since both live inside that area — `DetailView` itself renders no line-creation control once lines exist (see the panel-rendered pattern below to keep import available).

**Keeping import available once lines exist (window-scoped, panel-rendered pattern):** because the suppressed add-line area is also where `detailExtraActions` renders, a window that must allow importing MORE lines into a draft that already has lines re-renders its import trigger from its own `customComponents.bottomSection` panel — the bottom section always renders below the lines area and receives `lines`, `data`, `recordId`, `token`, and `apiBaseUrl` from `DetailView`:

```jsx
export default function MyBottomPanel(props) {
  const hasLines = Array.isArray(props.lines) && props.lines.length > 0;
  const showImportTrigger = hasLines && props.data?.documentStatus === 'DR' && props.data?.businessPartner;
  return (
    <>
      {showImportTrigger && (
        <MyImportTrigger
          data={props.data}
          recordId={props.recordId}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          onRefresh={() => window.location.reload()}
        />
      )}
      <LinesBottomSection {...props} />
    </>
  );
}
```

Gate the trigger on `lines.length > 0` (with no lines, the empty state already shows its own import button) plus the trigger's own visibility conditions (draft status + business partner above), so completed documents don't render an empty strip. **Known limitations** of this path: `DetailView`'s `bottomSection` contract passes no refresh callback and no save-header hook (`onSave`), so the trigger cannot save a dirty header before importing and must refresh via `window.location.reload()` after a successful import.

**Custom empty states MUST forward `canAddLine`.** A Pattern B empty state that omits the prop silently falls back to the shared component's default (`canAddLine = true`) and re-enables the manual button:

```jsx
function MyLinesEmptyState({ data, onAddLine, canAddLine = true, ...rest }) {
  return (
    <LinesEmptyState
      data={data}
      onAddLine={onAddLine}
      canAddLine={canAddLine}   // ← forward, never hardcode
      description={canAddLine ? ui('addLinesManuallyOrImportFromShipment') : ui('linesImportOnlyFromShipment')}
      secondaryAction={importButton}
    />
  );
}
```

**Real examples:**
- `linesEmptyState` (Pattern B): `purchase-invoice` (`PurchaseInvoiceBottomPanel.linesEmptyState`)
- `linesEmptyState` (Pattern A) + `addLineGuard`: `sales-order`, `purchase-order`, `sales-quotation`
- `maxDetailLines: 1`: `business-partner-category`, `product-category` (accounting tab capped at one row per accounting schema)
- `maxDetailLines: 0` (import-only lines, ETP-4462): `return-material-receipt` (lines imported from the source shipment) and `return-to-vendor-shipment` (lines imported from the source goods receipt) — both bottom panels (`artifacts/{window}/custom/*BottomPanel.jsx`) forward `canAddLine`, swap the empty-state description to the import-only keys `linesImportOnlyFromShipment` / `linesImportOnlyFromReceipt` (defined in `en_US`, `es_ES`, and `es_AR`), and re-render their import trigger (`ReturnReceiptLineActions` / `ReturnToVendorLineActions`) above `LinesBottomSection` via the panel-rendered pattern so importing stays available on drafts that already have lines

**This flag only caps the `window.detailEntity` pattern (a window's single primary lines tab).** For a `window.secondaryTabs` entry (Accounting, Customer/Vendor Accounting, etc. rendered beside the lines tab, not as the lines tab itself), use the per-tab `maxDetailLines` inside that tab's own config instead — see §17 below (ETP-4565).

---

### 12. `hideMoreMenu` — hide the "more" (⋮) button conditionally

Hides the three-dot kebab button in the detail toolbar. Accepts either a **boolean** (static hide) or a **function** `({ data }) => boolean` (data-driven hide). The function form is evaluated on every render with the current record data.

Passed directly as a JSX prop on `GeneratedApp` from the custom window wrapper — **not** a `decisions.json` option.

```jsx
// custom/index.jsx

// Static — always hide:
<GeneratedApp {...props} hideMoreMenu={true} />

// Data-driven — hide when record is new or already processed:
function hideMenu({ data }) {
  return !data?.id || data?.processed === true || data?.processed === 'Y';
}
<GeneratedApp {...props} hideMoreMenu={hideMenu} />
```

Use this when menu actions are only valid for persisted, non-completed records (e.g. count-list generation on a Physical Inventory, actions that would produce invalid API calls with `recordId = 'new'`).

**Real examples:** `physical-inventory` (hides ⋮ when `!data.id` or `data.processed`).

---

### 13. `window.rowQuickActions` — hover overlay with per-row actions

Exposes a hover-revealed overlay on each list row that mirrors the edit-view toolbar. Each quick action runs **exactly the same handler** as its toolbar counterpart — same permissions, same callouts, same confirmation modals — so there are no parallel UX paths. Introduced in ETP-3914.

**Use when:** the window is a header entity (orders, invoices, shipments, payments) where users repeatedly run per-record operations and want to skip opening the detail view.

**Avoid when:** the list is read-only reference data with no document actions, or a heavily virtualized grid where the per-row overlay has not been performance-validated. Lines and other child entities are **not** in scope — `rowQuickActions` is a header-list feature.

**Default behavior (no `decisions.json` edit required).** The feature is **ON by default** for every window. `resolve-curated.js` auto-injects a config that renders the four canonical actions — Edit, Duplicate, Email, Delete — as fixed buttons, and routes every other entry from `window.menuActions` into the kebab. The standard case needs no declaration.

You only add a `rowQuickActions` block when you want to deviate from that default: disable the feature, hide a canonical action, attach a `visibleWhen` predicate, or promote a non-canonical process to a fixed slot.

```json
"window": {
  "rowQuickActions": {
    "enabled": true,
    "editMode": "navigate",
    "actions": {
      "email":          { "show": false },
      "completeOrder":  { "show": "fixed", "visibleWhen": "@DocumentStatus@='DR'" },
      "voidIt":         { "show": "kebab" }
    }
  }
}
```

For the full key reference (types, defaults, resolution and generator behavior), see [`docs/decisions-reference.md#row-quick-actions-windowrowquickactions`](decisions-reference.md). The summary:

- `enabled: false` disables the overlay on this window — the prop is omitted by the generator.
- `editMode` is `"navigate"` (default, opens the detail view) or `"inline"` (reserved; currently surfaces a "coming soon" toast).
- `actions.<key>.show` accepts `true`, `false`, `"fixed"` (promote to a fixed button slot, after the canonical four and before the kebab) or `"kebab"` (force into the dropdown).
- `actions.<key>.visibleWhen` is an **Etendo display-logic predicate** (`@Field@='Value'`, AND-chained, `!=` supported) — **not** JavaScript. It is ANDed with the existing edit-view visibility rules.

**Decision tree (inside the feature):**

```
I want row quick actions on my window
│
├─ Standard case (Edit + Duplicate + Email + Delete fixed, rest in kebab)
│   └─ → Do nothing. Defaults apply automatically.
│
├─ Hide a specific action from the overlay
│   └─ → actions.<key>.show: false
│
├─ Show a process only for certain record states
│   └─ → actions.<key>.visibleWhen: "@DocumentStatus@='DR'"
│
├─ Promote a non-canonical process to a fixed button
│   └─ → actions.<processKey>.show: "fixed"  (key must exist in menuActions / processOverrides)
│
└─ Disable the feature on this window entirely
    └─ → enabled: false
```

**Real example — Sales Order.** Defaults are sufficient: `decisions.json` declares no `rowQuickActions` block and the auto-injected configuration places Edit / Duplicate / Email / Delete as fixed buttons, with the `reactivate` entry from `menuActions` falling into the kebab. A window that wanted to promote Reactivate to a fixed slot (visible only on completed orders) and remove Email would write:

```json
"window": {
  "rowQuickActions": {
    "actions": {
      "email":      { "show": false },
      "reactivate": { "show": "fixed", "visibleWhen": "@DocumentStatus@='CO'" }
    }
  }
}
```

**Layout and visual behavior.** The overlay is anchored to the right edge of the row, becomes visible on `group-hover/row`, and uses auto-width based on the number of visible buttons (Figma's 192px assumes all five render; collapsing to the buttons present avoids dead space). Container height is 40px, gap between buttons is 2px, each button is a 32×32 circle. Neutral icons are stroked with `#828FA3`; the Delete icon uses `#D50B3E`. Canonical order, left to right: **Edit → Duplicate → Email → Kebab → Delete** (see §2.1 of the plan).

**Visibility is inherited from the edit view.** When an action does not apply to a record (AD permission, document state, `documentPreview` absent, delete gate), it is **hidden** — never rendered as a disabled, greyed-out button. Disabled state is reserved exclusively for the in-flight case (see below). The Delete visibility gate (`hideDeleteWhenComplete` + status check) lives in the shared utility `tools/app-shell/src/utils/recordActions.js`, which is the single source of truth used by both `DetailView` and `RowQuickActions`. Custom `visibleWhen` predicates are AND-chained with that base visibility — they refine, never force-show.

**In-flight feedback.** While a quick action's handler is pending, only that specific button on that specific row is disabled and shows a `Loader2` spinner. The rest of the row stays interactive, and actions on **different rows run in parallel** with no global lock.

**Out of scope (for now).** Mobile/touch UX, multi-row / bulk quick actions, real inline-row editing (only the config flag is reserved), custom icons per action, and drag-to-reorder of the buttons. These will be addressed in follow-ups.

**Cross-references:**
- [`docs/decisions-reference.md#row-quick-actions-windowrowquickactions`](decisions-reference.md) — exhaustive key table and resolution rules.
- [`docs/pipeline-validator-reference.md`](pipeline-validator-reference.md) — rule F11 fails the pipeline when `rowQuickActions.actions.<key>` references a process not present in `menuActions` / `processOverrides`.
- [`docs/plans/2026-05-11-row-quick-actions-plan.md`](plans/2026-05-11-row-quick-actions-plan.md) — full UX specification, architectural decisions, and progress tracker.

---

### 14. `window.linesLayout` — inline-editable lines table

**What it does:** switches the Lines tab from the classic side-panel edit flow to the new `InlineLinesPanel` layout: 40 px rows in Inter font, pencil + trash hover-action icons on the right, single-row inline edit triggered by the pencil, autosave on blur. The add-line button, related-documents panel, notes panel and totals panel are left untouched.

**When to use:** any document-style window (orders, quotations, invoices, shipments) where users need fast inline edits without opening a side panel. The flag is opt-in per window so the rest of the catalog keeps the classic experience until you migrate them.

**`decisions.json`:**
```json
{
  "window": {
    "linesLayout": "inlineEditable"
  }
}
```

Default: `"classic"`. Validator F12 enforces the enum (`"classic"` | `"inlineEditable"`).

**MVP scope (current iteration):**
- Inline edit covers all column types: `string`, `number`, `amount`, `percent`, `date`, `selector` and `search`. Selector/search columns use `InlineSearchCombo` — a compact text input with server-side search (`?q=term`) and portal dropdown — so FK fields with many options (e.g., tax rates) are filterable by typing. Lookup/popup columns (e.g., product) continue to open `ProductSearchDrawer`.
- Pencil and trash carry full logic. No other action icons are rendered in this iteration.
- **Delete icon gating (ETP-4565):** the trash icon only renders when the caller passes a real `onDeleteRow` handler — `InlineLinesPanel` derives `canDelete = onDeleteRow != null` and wraps the Trash2 button in it, mirroring `DataTable`'s pre-existing `{onDeleteRow && (...)}` gate on its own row-delete button. When an entity declares `hideDelete: true` (see `docs/decisions-reference.md`), `apiPrediction.crud.<entity>.delete` resolves to `false` and `DetailView` never passes `onDeleteRow` down — before this fix, the icon still rendered on `inlineEditable` tabs and silently no-opped on click (the backend correctly rejected the delete, but nothing told the user why nothing happened). Purely additive: every caller that already passes `onDeleteRow` (the default for every window with a deletable lines entity) renders byte-for-byte the same as before.
- Desktop only (>= 1280 px). Tablet/mobile responsive support is out of scope for this iteration.
- **Add-line flow** keeps using the existing `DataTable` inline-add row (callouts, focus management, defaults from header context). The generated `<Window>LineTable.jsx` falls back to `<DataTable>` while `addRow.active` is true and returns to `<InlineLinesPanel>` once the new line is saved or cancelled. This avoids duplicating the heavyweight add-row machinery and keeps a single source of truth for line creation.
- **Dynamic column visibility (ETP-4543):** `InlineLinesPanel` accepts a `hiddenColumns = []` prop (mirroring `DataTable`'s existing one) that hides columns whose key is in the list, on top of any static `col.hidden` flag. `DetailView.jsx` computes this list from `lineDisplayLogic.visibility` (the same live evaluate-display map already threaded into the secondary `DetailForm`) and passes it to the primary lines table — so a grid column whose field resolves to `visibility: false` (e.g. a config-gated accounting dimension behind `@ACCT_DIMENSION_DISPLAY@`) is hidden at runtime rather than always shown just because it exists as a column. This makes `grid: true` fields under `inlineEditable` layouts respect the same runtime visibility rules non-grid fields already got via `DetailForm` — see `docs/feedback.md` ("ETP-4543") and `docs/generated-custom-windows/sales-invoice.md` for the full write-up.

**How it threads through the pipeline:**
- `cli/src/resolve-curated.js` — added to `WINDOW_TRUTHY_PROPS` (auto-passes through).
- `cli/src/generate-contract.js` — defaults to `"classic"` and is copied into `frontendContract.window.linesLayout`.
- `cli/src/generate-frontend.js` — emits `linesLayout="<value>"` on `<DetailView>` only when non-default.
- Generated `<Window>LineTable.jsx` — switches between `<DataTable>` (classic) and `<InlineLinesPanel>` (inlineEditable) based on the prop.
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` — owns rendering of the table block (header strip + rows + hover-action strip).

**Real example:** `sales-quotation` (pilot — the first window to ship the new layout).

---

### 14b. `dimensionsPanel` — expand-row accounting-dimension panel (`InlineLinesPanel` column type)

**What it does:** an opt-in column `type` for `InlineLinesPanel`, either declared directly in a hand-written `columns` array (e.g. `InvoiceLinesTable.jsx`) or generated automatically from a `"dimensionsPanel": true` flag on a field in `decisions.json` (see "Pipeline-generator support" below).

**ETP-4610 update — no longer a fixed grid column.** `InlineLinesPanel` filters this column type out of `visibleColumns` unconditionally: no header cell, no width reservation, no per-row badges/trigger rendered inline in the grid. Its `dimensionFields` metadata still drives two things:
- the pre-existing leading expand-chevron column (unchanged since ETP-4529) — expands/collapses the full-width sub-row of selectors below the data row;
- a **static hover-action icon** rendered next to Edit/Delete in the row's hover strip, through the generic `rowActions` extension slot (§14c below) — shown only when at least one `dimensionFields` candidate is currently visible for that entity. It always shows the `Layers` icon with the **"Edit dimensions"** tooltip (`editDimensionsTooltip` i18n key), regardless of whether the line already has a dimension value set.

**ETP-4610 live-UX follow-up (post-deploy):** an earlier iteration made this icon/tooltip *adaptive* — `Plus`/"Add dimensions" while every candidate field was empty, switching to `Pencil`/"Edit dimensions" once at least one had a value (computed per-row by a `hasFilledDimensionValues()` helper). That helper and the conditional were removed after a live review: the "edit" state's `Pencil` icon sat immediately next to the row's own built-in Edit action, reading as two identical duplicate pencil buttons. The icon/tooltip are now unconditional on purpose — see `docs/feedback.md` for the dated entry.

Clicking either the chevron or the hover action toggles the same expand state — there is exactly one way the panel opens, just two entry points into it now. The previously-permanent "Dimensiones contables" column text and the collapsed `DimSummary` badges/dashed trigger are gone; discoverability now relies on the icon + tooltip, matching how the pre-existing Edit/Delete icons are already discovered (hover + tooltip, no permanent label).

**Why it exists (ETP-4529, updated by ETP-4610):** ETP-4529 superseded ETP-4543's plain, always-rendered `project`/`costcenter` grid columns (see `docs/feedback.md`) — a permanently-visible column reads as a field the client always has, even with no accounting-dimension config at all. ETP-4610 went one step further: even the expand-row's own summary column read as a permanent grid column once dimensions were configured. Moving the "add" affordance into the hover strip (alongside the row's other actions, which are also hover-only) keeps the grid free of a column whose only job was inviting the user into an action, not displaying data the user scans regularly.

**Column shape (unchanged by ETP-4610 — this is generator/metadata surface, not the render decision):**
```js
{
  key: 'dimensions',           // any unique key, like any other column
  type: 'dimensionsPanel',
  label: ui('dimensionsPanelTitle'),   // metadata only — never rendered as a header now
  dimensionFields: [                    // candidate fields, already visibility-filtered by the caller
    { key: 'project', column: 'C_Project_ID', type: 'selector', label: t('C_Project_ID'), lookup: true },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: t('C_Costcenter_ID') },
  ],
  emptyLabel: undefined,        // vestigial — DimSummary (the only reader) is no longer used by InlineLinesPanel
}
```
`dimensionFields` entries are ordinary column-shaped objects (`key`/`column`/`type`/`label`) — `InlineLinesPanel` reuses the same `commitField` path every other inline edit uses to persist a dimension-field change, so no special save wiring is needed. Drop the column entirely (don't include it in `columns`) when every candidate would be hidden — `InvoiceLinesTable.jsx` does this via `dimensionFields.length > 0 ? [...] : []`.

**Fully additive/opt-in:** a table that never declares a `dimensionsPanel` column renders byte-for-byte the same as before this feature shipped — no leading chevron column, no expand state, no "Edit dimensions" hover action. Verified against the full existing `InlineLinesPanel` test suite.

**Shared building blocks:** `tools/app-shell/src/components/contract-ui/DimensionsPanel.jsx` exports `DimBadge`, `DimSummary`, `DimensionGrid`. `InlineLinesPanel` only uses `DimensionGrid` now (the expanded content). **Update (same ticket, follow-up pass):** `AmortizationLinesTable.jsx` also stopped using `DimSummary`/`DimBadge` — it hand-patched the same static Layers/"Edit dimensions" hover-action pattern (see below) instead of the permanent grid-column summary it used to render. `DimSummary`/`DimBadge` currently have no consumer left in this repo but remain exported as reusable building blocks.

**Pipeline-generator support (unchanged by ETP-4610):** `generateTableComponent` (`schema_forge_core`'s `cli/src/generate-frontend.js`) still emits this column type directly from `decisions.json` — no generator change was needed for the column-hiding requirement, since `InlineLinesPanel` (a generic component owned entirely by this functional repo, not part of `@etendosoftware/app-shell-core`) decides how the metadata renders, not the generator. Flag a field `"dimensionsPanel": true` (any `grid` value; see `docs/decisions-reference.md`) and the generator collects it into the synthetic column automatically for the pipeline-generated `<Window>LineTable.jsx`/`LinesTable.jsx`/`GoodsShipmentLineTable.jsx`/`GoodsReceiptLineTable.jsx` files. Fully additive — an entity with zero `dimensionsPanel: true` fields generates byte-for-byte the same `columns` array as before.

**Real example:** the generated `LinesTable.jsx` (sales-invoice, purchase-invoice), `GoodsShipmentLineTable.jsx`/`GoodsReceiptLineTable.jsx` (goods-shipment, goods-receipt), and `GLJournalLineTable.jsx` (simple-g-l-journal) — all driven purely by `decisions.json`, all 5 in-scope windows regenerated and validated as part of ETP-4610. `goods-shipment` needed two extra local-DB regen attempts reverted (this sandbox's incomplete `AD_Ref_List_Trl` es_ES data silently strips unrelated translations on this window) before ultimately regenerating clean via the pre-push hook's offline/cached-AD-snapshot pipeline run — see `docs/feedback.md` for the full trail. Also `InvoiceLinesTable.jsx` (hand-written, **not currently reachable from the running app** — see `docs/feedback.md`).

**`AmortizationLinesTable.jsx` — hand-patched, not an `InlineLinesPanel` consumer (follow-up pass, same ticket).** This component is a wholly custom `<table>` (its own fetch/CRUD, multi-select, and inline add-row draft-line flow — none of which `InlineLinesPanel` has an equivalent for), so wrapping it in `InlineLinesPanel` was investigated and rejected as disproportionate rework relative to this ticket's actual gap (see `docs/feedback.md` for the full comparison). Instead, its own hover strip was hand-patched to match the *visible* mechanism above: the permanent "Accounting dimensions" grid column was removed, and a third hover-action button (`Layers` icon, static `editDimensionsTooltip` — the same i18n key, no separate one introduced) was added ahead of its existing Pencil/Trash, gated on `dimensionFields.length > 0` and `!isReadOnly`, toggling the same `expandedId` state its pre-existing chevron already drove. Two independent implementations of the same UX on purpose — not a shared code path — because this component was never built on top of `InlineLinesPanel` to begin with.

---

### 14c. `InlineLinesPanel` row hover-action extension slot (`rowActions` prop)

**What it does:** a generic extension point on `InlineLinesPanel` for adding extra icon buttons to a row's hover-action strip, alongside the built-in Edit (pencil) / Delete (trash) icons. Added by ETP-4610 to move the "Add dimensions" trigger there without hardcoding it — any future action (window-specific or generic) can reuse the exact same mechanism instead of re-implementing the strip.

**Before this ticket:** the hover strip (`renderRowActionStrip` in `InlineLinesPanel.jsx`) rendered exactly two hardcoded buttons (Pencil → edit, Trash2 → delete) with no extension point. There was no mechanism for conditional-per-row visibility beyond the two existing handlers' own `isDocumentReadOnly` gate.

**Prop shape:**
```jsx
<InlineLinesPanel
  columns={columns}
  data={data}
  // ...
  rowActions={[
    {
      key: 'archive',            // unique key — also the default data-testid suffix
      icon: ArchiveIcon,         // any lucide-react icon component
      tooltip: ui('archiveLineTooltip'),   // aria-label + title — the icon's only label, matches Pencil/Trash's own pattern
      onClick: (row) => handleArchive(row),
      show: (row) => row.status !== 'archived',  // optional: boolean OR (row) => boolean, defaults to visible
      testId: 'line-action-archive',  // optional override; defaults to `line-action-${key}`
    },
  ]}
/>
```
- `show` supports both a static boolean (hide/show for every row identically) and a per-row function, satisfying conditional-per-line visibility generically — not hardcoded to any one action's business rule.
- Extra actions render **before** Pencil/Trash, in the order declared in the array.
- The built-in "Edit dimensions" action (§14b) is computed internally by `InlineLinesPanel` from its own `dimensionFields` metadata and merged into the same list ahead of any caller-supplied `rowActions` — both render through the identical `renderRowActionStrip({ extraActions })` code path, so there is only one hover-action rendering mechanism in the component, not two.
- Purely additive: omitting `rowActions` (every existing caller today) renders byte-for-byte the same strip as before this slot existed.

**Real example:** the internal "Edit dimensions" action is the only current consumer; no external caller passes `rowActions` yet. See `tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.vitest.jsx`'s `rowActions — generic hover-action extension slot` describe block for the mechanism's own regression tests (rendering, static `show: false`, per-row `show` function, declared-order rendering).

---

### 15. `window.balanceFooter` — debit/credit balance footer

**What it does:** replaces the product/discount/tax totals panel with a `BalanceFooterPanel` for double-entry windows. It shows **Σ debit**, **Σ credit**, the **difference**, and a **balanced ✓ / unbalanced ✗** badge, and **disables the Save button** (with a tooltip) only when the entry is **unbalanced** (`Σ debit ≠ Σ credit`). An empty/zero entry is balanced and savable as a draft; the badge stays hidden until the lines carry amounts.

**When to use:** manual journals and any double-entry document where lines carry separate debit and credit amount columns that must balance before saving.

**`decisions.json`:**
```json
{
  "window": {
    "balanceFooter": { "debitField": "amtSourceDr", "creditField": "amtSourceCr" }
  }
}
```

Both `debitField` and `creditField` must be amount-typed fields on the **lines** entity. Validator **F17** enforces their existence.

**How it threads through the pipeline:**
- `cli/src/resolve-curated.js` — added to `WINDOW_TRUTHY_PROPS` (auto-passes through).
- `cli/src/generate-contract.js` — copied into `frontendContract.window.balanceFooter`.
- `cli/src/generate-frontend.js` — emits `balanceFooter={...}` on `<DetailView>` when present.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — renders `BalanceFooterPanel` instead of `DocumentTotalsPanel` and gates the Save buttons via `blockSaveForBalance`.
- `tools/app-shell/src/lib/balanceTotals.js` / `BalanceFooterPanel.jsx` — pure aggregation + rendering.

**Real example:** `simple-g-l-journal` (Manual Journals — the first window to ship the balance footer).

---

### 16. `requiredVisual` — cosmetic required asterisk (field descriptor prop)

**What it does:** renders the red required asterisk `*` next to a field's label in `EntityForm`
**without enforcing any validation**. It is OR-ed with `required` in every asterisk render site
(`labelMarker`, `requiredAsterisk`, `requiredAsteriskIfEditable`, and `PopupSearchField`'s inline
marker), and — like the `required` asterisk — only shows on editable fields (`!isReadOnly`); it
never renders on a read-only display. The `required={...}` prop passed down to the underlying
input/select is untouched by `requiredVisual` — it still depends on `required` only.

**Use when:** a field's obligatoriness is **conditional** on another field's value (e.g. a
calculation-type toggle that makes different fields mandatory depending on its selection), so a
real `required: true` would incorrectly block submission when the field isn't actually
applicable yet, but the user should still see it visually flagged as required once it is
relevant.

Set directly on the field descriptor object passed to `EntityForm` — **not** a `decisions.json`
key. It is typically declared inline on the field literals inside a window's hand-authored
custom panel:

```jsx
// windows/custom/{window}/{Window}DetailPanel.jsx
{ key: 'usableLifeYears', column: 'UseLifeYears', type: 'number', requiredVisual: true, /* ... */ }
```

**Real example:** `assets` — `currency`, `depreciationAmt`, `annualDepreciation`,
`usableLifeYears`, `usableLifeMonths`, and `depreciationStartDate` in `AssetsDetailPanel.jsx`
carry `requiredVisual: true` because their obligatoriness depends on the "Tipo de cálculo"
(`calculateType`) selection.

---

### 17. `secondaryTabs` — custom Panel/Form tabs beside lines

**What it does:** renders one or more extra tabs next to the header's detail content, backed
either by a hand-written `Panel` component (freeform content, e.g. a custom fetch-and-render
subtab), a generated `Form` component (a plain entity form reused as a secondary tab), or a
generated `Table` + `Form` pair backed by a genuine child entity (Accounting, Tax, Payment Plan,
Customer/Vendor Accounting, etc.).

**Two ways to declare it — don't confuse them:**

1. **Declarative, `decisions.json → window.secondaryTabs`** (the common case — no custom
   `index.jsx` needed). `resolveSecondaryTabDefs` (`generate-frontend.js`) reads this object
   directly and emits the `Table`/`Form`/`Panel` imports and the `secondaryTabs` prop array on the
   generated `<Page>` itself — works with the normal `"default"` `layoutType`. This is what
   `product`, `product-category`, `business-partner-category`, `tax`, `asset-group`, and `contacts`
   use for their Accounting/Customer-Accounting/Vendor-Accounting tabs. Full property reference
   (`tabOrder`, `label`, `addLineFields`, `requireSavedRecord`, `customPanel`/`customTable`/
   `customForm`, `customAddModal`, `readOnlyLogic`, and the per-tab `maxDetailLines` cap added in
   ETP-4565): `docs/decisions-reference.md` → "Secondary Tabs (`window.secondaryTabs`)".
2. **Runtime prop, hand-written `windows/custom/{window}/index.jsx`** (documented below) — a
   `Panel`-backed tab with freeform fetch-and-render content that doesn't map to any generated
   entity at all, passed to the generated `<Page>` component from a hand-written wrapper. Requires
   `window.layoutType: "custom"` (the pipeline only emits a bare scaffold for `"custom"` layouts).
   Used by `warehouse` and `calendar` below.

```jsx
// windows/custom/{window}/index.jsx
import GeneratedPage from '@generated/{window}/generated/web/{window}/{Header}Page';
import MyPanel from './MyPanel.jsx';

export default function MyWindow(props) {
  const secondaryTabs = [
    { key: 'accounting', label: 'Accounting', Panel: MyPanel },
  ];
  return <GeneratedPage {...props} secondaryTabs={secondaryTabs} />;
}
```

**The `Panel` prop contract (confirmed by reading `DetailView.jsx`'s `SecondaryPanelTab`, not
assumed):**

```jsx
<props.st.Panel
    parentId={props.data?.id}
    token={props.token}
    apiBaseUrl={props.apiBaseUrl}
    onCount={props.onCount}
/>
```

Your `Panel` component receives **`parentId`** (the current header record's id, a plain string) —
**not `data`, not the full header record.** This is easy to get wrong if you copy a prop shape
from memory instead of checking the real renderer: a component written as `function MyPanel({
data, token, apiBaseUrl })` will silently receive `data === undefined` forever (no error, no
warning — the prop is just absent) and never fire its fetch. `onCount` is optional — call it with
a number if you want the tab label to show a count badge; omitting it just skips the badge.

`Form`-backed secondary tabs (`{ key, Form }` instead of `{ key, Panel }`) use a different prop
shape (`SecondaryFormTab`): `data`, `readOnly`, `onChange`, `entity`, `catalogs`, `token`,
`apiBaseUrl`, `selectorContext`, `labelOverrides` — closer to a normal `EntityForm` invocation.
Don't assume `Panel` and `Form` share a prop contract; they don't.

**Building the fetch URL inside a `Panel`:** `apiBaseUrl` passed down here is already
`{base}/{windowName}` (set once by `WindowLoader.jsx`: `apiBaseUrl={`${apiBaseUrl}/${windowName}`}`,
where `windowName` is the **route** name, not necessarily a real spec name — see the exception
below) and threaded unchanged through `Page` → `DetailView` → `Panel`. In the common case (the
route name IS the backing spec's name), build entity URLs directly off it —
`${apiBaseUrl}/periodControl?year=${parentId}` — **never** re-prepend the window/spec name
(`${apiBaseUrl}/{window}/periodControl?...`) or you'll get a doubled path segment. This matches
the existing `warehouse` convention (`useWarehouseStock.js`: `${apiBaseUrl}/storageBin?...`,
`${apiBaseUrl}/binContents?...`).

**Exception — a custom window with no backing spec of its own, spanning multiple real specs.**
`calendar` (ETP-4478) has no `artifacts/calendar/` spec at all — its route name is purely
cosmetic. `WindowLoader.jsx` still injects `apiBaseUrl={base}/calendar`, but `year` is really
backed by the `fiscal-calendar` spec, the Periods panel by `open-close-period-control`, and the
Accounting panel by `end-year-close`. In this shape, the window's `index.jsx` wrapper must strip
the trailing route segment and substitute the real spec name **per panel** (and for its own
header page, not just secondary tabs):

```jsx
function rootApiBase(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]*$/, ''); // strip the trailing route segment
}
function MyPanelForCalendar(props) {
  return <MyPanel {...props} apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/the-real-spec-name`} />;
}
```

This only applies when the window genuinely has no spec of its own — reach for one merged spec
first if the entities involved can share a single AD window (see `docs/decisions-reference.md`);
only fall back to this pattern when they can't (see `docs/generated-custom-windows/calendar.md`
for the full rationale — a merged multi-window spec silently loses entities in `push-to-neo`,
tracked as [schema_forge_core#35](https://github.com/etendosoftware/schema_forge_core/issues/35)).

**menuActions-triggered modals are a different mechanism, with their own base URL constant.** A
`window.menuActions` entry's `component` (see option 5 above) receives `currentRecord` (the full
record, not just an id) and `apiBaseUrl={api.baseUrl}` — a **hardcoded generated string**
(`api.baseUrl` inside the generated `Page.jsx`, literally `"/sws/neo/{spec}"`), not the runtime
`apiBaseUrl` prop threaded from `WindowLoader`. In practice the two end up equal for a
top-level menu action, but don't assume they're the same variable — verify against the generated
file when building URLs in a `menuActions` component.

**Use when:** a window needs a subtab whose content doesn't map to a normal generated
list/detail entity — inline custom rendering, aggregation, or an interaction shape the generator
doesn't produce (expandable rows, a read-only trial-balance-style grid, etc.).

**Real examples (runtime-prop path):** `warehouse` (`WarehouseTransactionsTable`/`WarehouseProductsTab` as `Panel`s
reading `parentId`, single backing spec — the common case); `calendar` (`PeriodsExpandablePanel`,
`AccountingPanel` — the multi-spec exception above, each panel's `apiBaseUrl` rewritten to a
different real spec).

**Real examples (declarative `decisions.json` path, `maxDetailLines` — ETP-4565):** `product` and
`asset-group` cap their `secondaryTabs.accounting` tab at one record
(`"maxDetailLines": 1`); `contacts` caps both `secondaryTabs.customerAccounting` and
`secondaryTabs.vendorAccounting` the same way — all four are the "registro único" requirement for
an accounting-schema row, the `secondaryTabs`-pattern equivalent of `window.maxDetailLines: 1` on
`product-category`/`business-partner-category`/`tax`'s `detailEntity` (see §11 above). The cap is
enforced client-side by `resolveCanAddSecondaryLines(st, childrenCount)` in `DetailView.jsx`,
gating `secondaryAddLineBar`, the inline `addRow`, and the empty-state add trigger once the tab's
own child count reaches the declared `maxDetailLines`.

---

### 18. `multiField` — composite list column (stacked identity cell)

**What it does:** turns a single list column into a **composite identity cell** that stacks several
row fields together — a bold **title**, an optional **subtitle chip**, and an optional **authenticated
media image** — while still behaving like real, first-class columns: each declared *part* is a
clickable sort header (own `_sortBy`) and expands into its own pseudo-column in the advanced filter.
It is **not** a new component and **not** a custom slot: it is a `type: 'multiField'` decorator on the
existing `DataTable`, declared entirely in `decisions.json`. No hand-written JSX, no file in
`windows/custom/`.

Introduced in ETP-4603. It replaces the previous pattern of a bespoke per-window cell component (e.g.
Product's old `ProductNameCell`) with a generic, config-driven column that any window can adopt.

**Design note — columns are derived from grid fields (Design A).** There is **no** `window.listColumns`
array. List columns are derived from the entity's grid fields, so `multiField` is declared as a
**decorator on a "host" grid field** (the field whose value becomes the title). The decorator absorbs
the sibling fields it references — they stop rendering as their own standalone columns and fold into
the composite cell instead.

**Use when:** a list row's identity is better read as one rich cell than as three separate columns —
typically a master-data window (Product, Business Partner, etc.) where users recognize a record by an
image + a primary name + a secondary code, and still want to sort/filter by each of those parts.

**Avoid when:** the fields are unrelated data points that users genuinely compare column-by-column, or
the "title" field is not the natural primary label of the row.

#### Decision tree (inside the feature)

```
I want to combine several list fields into one column
│
├─ Just a title + a small code/label underneath it
│   └─ → multiField with subtitle (no media)
│
├─ Title + code + a thumbnail image (product photo, avatar…)
│   └─ → multiField with subtitle + media { kind: "neoImage" }
│
├─ I want users to still sort/filter by each stacked field
│   └─ → declare each as a parts[] entry (default: sortable + filterable)
│
├─ One stacked field should be display-only (no sort header, no filter)
│   └─ → parts[].sortable: false  and/or  parts[].filterable: false
│
└─ I need a fully bespoke rendering the decorator can't express
    └─ → not multiField — use a cellType renderer or a custom layout
```

#### The decorator shape (declared in `decisions.json`)

Set `multiField` on the **host** grid field. The host field's own value is the **title** — there is no
`title` key in the declaration; the field you attach the decorator to *is* the title.

```json
"name": {
  "visibility": "editable",
  "grid": true,
  "multiField": {
    "subtitle": "searchKey",
    "media": { "field": "image", "kind": "neoImage", "fallback": "box" },
    "parts": [
      { "field": "searchKey", "labels": { "en_US": "Identifier", "es_ES": "Identificador" } },
      { "field": "name",      "labels": { "en_US": "Name",       "es_ES": "Nombre" } }
    ],
    "partSeparator": " & "
  }
}
```

| Key | Type | Default | Semantics |
|-----|------|---------|-----------|
| *(host field)* | — | — | The grid field carrying the decorator. Its value renders as the **bold title**. |
| `subtitle` | string | `null` | Sibling field name whose value renders as the **chip** under the title. Omit for a title-only cell. |
| `media` | object | `null` | `{ field, kind: "neoImage", fallback: "box" }`. `field` = row property holding the image id; `kind: "neoImage"` fetches the image with an authenticated Bearer request (see below); `fallback: "box"` shows a package glyph when empty. Omit for no image. |
| `parts` | array | `[title, subtitle]` | Ordered segments that behave like real columns for **per-part sort** and **filter expansion**. Each entry: `{ field, sortable?, filterable?, labels?, label? }`. `sortable`/`filterable` default `true`. `labels` (`{ en_US, es_ES }`) or `label` relabel that segment's header (e.g. show *Identifier* for `searchKey`) without renaming the underlying field. When omitted, defaults to the title field plus the subtitle field (if any). |
| `partSeparator` | string | `" & "` | String joining the part labels in the composite column header (part order drives the header text). |

#### The emitted contract (what the generator writes into `columnsArray`)

The generator resolves each `parts[].field`, the `subtitle`, and `media.field` against the resolved
contract to fill in the runtime `key`/`column`/`type`/`label(s)`, and emits a single resolved column
descriptor:

```js
{
  key: 'name', column: 'Name', type: 'multiField',
  title: 'name',                 // row field → bold title
  subtitle: 'searchKey',         // row field → chip (optional)
  media: { field: 'image', kind: 'neoImage', fallback: 'box' },   // optional
  parts: [                       // per-part: sort header + filter expansion
    { key: 'searchKey', column: 'Value', type: 'string', labels: { en_US: 'Identifier', es_ES: 'Identificador' } },
    { key: 'name',      column: 'Name',  type: 'string', labels: { en_US: 'Name',       es_ES: 'Nombre' } },
  ],
  partSeparator: ' & ',
}
```

So the declared `field` (decisions.json) becomes the resolved `key`/`column`/`type` (contract). You edit
the `field` form; you never hand-write the resolved form.

#### Per-part sort

Each `parts[]` entry with `sortable !== false` renders its label as a **clickable header button** with
its own `_sortBy` — clicking *Identifier* sorts the list by `searchKey`, clicking *Name* sorts by
`name`, independently, even though both live in one visual column. `sortable: false` renders the part
label as plain, non-clickable text.

#### Advanced-filter expansion

Each `parts[]` entry with `filterable !== false` **expands into its own pseudo-column** in the advanced
filter builder — so a user filtering the list sees *Identifier* and *Name* as separately filterable
fields, not one opaque "multiField" blob. `filterable: false` keeps that segment out of the filter
builder.

#### Absorbed fields still carry their data

The `subtitle` field, `media.field`, and any `parts[]` field that is **not** the host are **dropped
from `columnsArray`** — they no longer render as standalone columns. **Their data still arrives**,
though, because the list fetch sends **no field projection**: NEO Headless returns every configured
entity field for each row regardless of which columns are shown. That is what lets the renderer paint
the subtitle/image and lets per-part sort/filter target the absorbed fields.

#### Authenticated media (`useNeoImage`)

`media.kind: "neoImage"` renders through the `useNeoImage(imageId, token, apiBaseUrl)` hook, which
issues an **authenticated Bearer fetch** to `{apiBaseUrl}/image/{imageId}` and returns an object URL for
an `<img>` src. On a missing id or a failed fetch it falls back to the `BoxIcon` package glyph
(`fallback: "box"`). The hook now lives in the core package (`@etendosoftware/app-shell-core`) and is
consumed via the shim `@/hooks/useNeoImage`.

#### Validation (rule F18)

Pipeline validator rule **F18** (implemented in `schema_forge_core`) blocks the pipeline when a
`multiField` decorator references a sibling field that does not exist on the same entity (`subtitle`,
`media.field`, or any `parts[].field`), or when a **sort-enabled** part (`sortable !== false`) — or the
host — is **not queryable** (missing from the entity's `searchableFields` / `supportedFilters`, so the
backend would reject `_sortBy` on it). It is a no-op for windows without any `multiField` decorator.
Fix by referencing only real same-entity fields and marking non-queryable segments `sortable: false`
(or making the field searchable). Full row: [`docs/pipeline-validator-reference.md`](pipeline-validator-reference.md) (F18).

#### Real example — the Product identity column

Product's list uses `multiField` on its `name` grid field to render the product identity as one cell:
the **name** in bold as the title, the **search key** as a subtitle chip, and the product **image**
(authenticated `neoImage`, `box` fallback) to the left. Two `parts` — *Identifier* (`searchKey`) and
*Name* (`name`) — make the cell sortable per part (clicking each header sorts by that field) and
filterable (each part expands as its own pseudo-column in the advanced filter). The composite header
reads *"Identifier & Name"* / *"Identificador & Nombre"*. See the exact declaration in
[`docs/decisions-reference.md`](decisions-reference.md) → *Composite list column (`multiField`)* and the
window guide [`docs/generated-custom-windows/product.md`](generated-custom-windows/product.md).

**Cross-references:**
- [`docs/decisions-reference.md`](decisions-reference.md) — canonical decorator key table (*Composite list column (`multiField`)*).
- [`docs/pipeline-validator-reference.md`](pipeline-validator-reference.md) — rule F18.

---

## Decision tree: which option to use?

```
I need to customize the UI of a window
│
├─ It's a completely different layout (kanban, calendar, gallery)
│   └─ → layoutType in decisions.json
│
├─ The whole window is too custom for any generated layout
│   └─ → layoutType: "custom" + write index.jsx in windows/custom/
│
├─ The standard layout works, but I need to extend specific parts:
│   │
│   ├─ KPI cards / metrics above the list (ListView)
│   │   └─ → window.listKpiCards
│   │
│   ├─ Numeric/progress summary bar above the detail form
│   │   └─ → window.statusBar (declarative, no JSX needed)
│   │
│   ├─ Extra section below the main detail form
│   │   └─ → window.headerExtra
│   │
│   ├─ Replace the right side of the topbar (actions/status)
│   │   └─ → window.customComponents.topbarRight
│   │
│   ├─ Replace the entire bottom panel (totals, footer)
│   │   └─ → window.customComponents.bottomSection
│   │
│   ├─ Add a side panel alongside the detail form
│   │   └─ → window.customComponents.sidePanel + sidePanelStyle
│   │
│   ├─ Replace the master list table
│   │   └─ → window.customComponents.headerTable
│   │
│   ├─ Stack title + code + image into one sortable/filterable list column
│   │   └─ → multiField decorator on the host grid field (decisions.json)
│   │
│   └─ Secondary document actions (cancel, reverse, duplicate)
│       └─ → window.menuActions
│
└─ Cross-cutting behavior (notes, delete protection, related docs, attachments)
    ├─ → window.notesField
    ├─ → window.hideDeleteWhenComplete
    ├─ → window.relatedDocuments
    ├─ → window.attachments (auto-on; set to false to opt out, object to tune limits)
    ├─ Empty state when lines tab is empty → linesEmptyState prop + addLineGuard
    ├─ Gate add-line button on header field → addLineGuard prop
    ├─ Cap line count / disable manual line creation (import-only lines) → window.maxDetailLines (0 = import-only)
    ├─ Cap a secondaryTabs entry's own record count (e.g. accounting tab = 1) → window.secondaryTabs.<key>.maxDetailLines
    ├─ Hide ⋮ menu on new/processed records → hideMoreMenu prop (boolean or function)
    ├─ Hover overlay with per-row actions on the list (Edit/Duplicate/Email/kebab/Delete)
    │   └─ → window.rowQuickActions (on by default; declare only to disable or override)
    ├─ Opt out of the generic grid "Delete selected" bulk-delete action
    │   └─ → listViewOptions.hideBulkDelete (ListView prop; window already has its own bulk-delete)
    └─ Show a required-looking asterisk on a conditionally-required field, without validation
        └─ → requiredVisual: true on the field descriptor (EntityForm prop, not decisions.json)
```

---

## How custom components survive regeneration

Custom components live in `tools/app-shell/src/windows/custom/{window}/` (the app-shell source, **not** in `artifacts/`). The pipeline never touches files in that directory.

The generated `*Page.jsx` in `artifacts/{window}/generated/` imports them by name. On re-generation, the `*Page.jsx` is overwritten — but the imports are re-emitted from `decisions.json`, so the wiring stays correct.

```
tools/app-shell/src/windows/custom/contacts/
    ContactsKpiCards.jsx       ← hand-written, never touched
    BillingPreferencesForm.jsx ← hand-written, never touched

artifacts/contacts/generated/web/contacts/
    BpartnerPage.jsx           ← regenerated, imports the above via decisions.json
```

**Adding a new custom component:**

1. Create the component in `windows/custom/{window}/{ComponentName}.jsx`
2. Add the appropriate key to `decisions.json → window.*`
3. Run `node cli/src/generate-frontend.js {window}` (or full pipeline)
4. The generated `*Page.jsx` now imports and wires your component automatically
