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

**Real examples:**
- `linesEmptyState` (Pattern B): `purchase-invoice` (`PurchaseInvoiceBottomPanel.linesEmptyState`)
- `linesEmptyState` (Pattern A) + `addLineGuard`: `sales-order`, `purchase-order`, `sales-quotation`

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
- Desktop only (>= 1280 px). Tablet/mobile responsive support is out of scope for this iteration.
- **Add-line flow** keeps using the existing `DataTable` inline-add row (callouts, focus management, defaults from header context). The generated `<Window>LineTable.jsx` falls back to `<DataTable>` while `addRow.active` is true and returns to `<InlineLinesPanel>` once the new line is saved or cancelled. This avoids duplicating the heavyweight add-row machinery and keeps a single source of truth for line creation.

**How it threads through the pipeline:**
- `cli/src/resolve-curated.js` — added to `WINDOW_TRUTHY_PROPS` (auto-passes through).
- `cli/src/generate-contract.js` — defaults to `"classic"` and is copied into `frontendContract.window.linesLayout`.
- `cli/src/generate-frontend.js` — emits `linesLayout="<value>"` on `<DetailView>` only when non-default.
- Generated `<Window>LineTable.jsx` — switches between `<DataTable>` (classic) and `<InlineLinesPanel>` (inlineEditable) based on the prop.
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` — owns rendering of the table block (header strip + rows + hover-action strip).

**Real example:** `sales-quotation` (pilot — the first window to ship the new layout).

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
    ├─ Hide ⋮ menu on new/processed records → hideMoreMenu prop (boolean or function)
    └─ Hover overlay with per-row actions on the list (Edit/Duplicate/Email/kebab/Delete)
        └─ → window.rowQuickActions (on by default; declare only to disable or override)
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
