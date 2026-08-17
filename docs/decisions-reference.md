# Decisions.json Reference

Complete reference for all configurable options in `decisions.json` files. These files store human and AI-curated design decisions for each window/process, controlling what fields appear, how they behave, and how the UI renders.

## File Structure

```json
{
  "$schema": "decisions-v2",
  "version": 2,
  "window": { "category": "sales", "name": "Sales Order" },
  "discardPatterns": ["EM_*"],
  "entities": {
    "header": { ... },
    "lines": { ... }
  },
  "rules": { ... }
}
```

## Root-Level Properties

| Property | Type | Required | Default | Purpose |
|----------|------|----------|---------|---------|
| `$schema` | string | No | `"decisions-v1"` | Schema identifier (e.g., `"decisions-v2"`). Auto-set by migration runner. |
| `version` | number | No | `1` | Numeric schema version. Current: 2. See `docs/decisions-versioning.md`. |
| `window` | object | Yes | — | Window-level metadata. |
| `entities` | object | Yes | — | Entity definitions keyed by entity name. |
| `rules` | object | No | `{}` | Business rule catalog. |
| `discardPatterns` | array | No | `[]` | Glob patterns to auto-discard fields. |
| `labelOverrides` | object | No | `{}` | Per-locale label overrides for field columns. See below. |

## Label Overrides (`labelOverrides`)

Per-locale field label overrides. When the simplified interface needs to rename a field differently from the base Etendo AD translation, add it here instead of modifying the global locale dictionary.

**Schema:**
```json
{
  "labelOverrides": {
    "es_ES": {
      "C_BPartner_ID": "Cliente",
      "DateOrdered": "Fecha de Pedido"
    },
    "en_US": {
      "C_BPartner_ID": "Customer"
    }
  }
}
```

**Resolution chain** (frontend `useLabel`):
1. `labelOverrides[currentLocale][columnName]` — per-window override (this section)
2. `dictionary.fields[columnName].label` — Etendo AD translation from `extract-labels.js`
3. `null` — caller falls back to raw label from spec

**How to use:**
- Pass `spec?.window?.labelOverrides` to `useLabel()` in components that have access to the loaded spec
- `resolve-curated.js` forwards `labelOverrides` to `schema.window.labelOverrides` automatically
- Generated pages forward `labelOverrides` to `ListView`, which threads it down to:
  - `DataTable` (column headers)
  - The sort dropdown ("Ordenar por")
  - `ListFilterBar` → `AdvancedFilterBuilder` (column selector and "Selector de {label}" header in the funnel popover)
  - `DetailView` and `EntityForm` (form labels)

## Window Properties (`window.*`)

| Property | Type | Default | Values | Purpose |
|----------|------|---------|--------|---------|
| `category` | string | Inferred | `"sales"`, `"purchases"`, `"inventory"`, `"finance"`, `"accounting"`, `"master"`, `"project"`, `"general"` | UI routing and navigation grouping. |
| `name` | string | From AD | — | Display name for breadcrumbs and titles. |
| `agentPrompt` | string | `null` | Free text | Spec-level guidance for AI agents that consume the NEO Headless MCP server. Surfaced in `agentProfile.agentPrompt` (contract) and persisted to `ETGO_SF_SPEC.AGENT_PROMPT`, from where `neo_discover` returns it per spec. Empty or whitespace-only values clear the persisted prompt and are omitted from the MCP response. |
| `showInMcp` | boolean | `true` | `false` | **Opt-out** MCP visibility. Persisted to `ETGO_SF_SPEC.SHOWINMCP` by `push-to-neo`. Only an explicit `false` hides the spec from the NEO Headless **MCP** (both `neo_discover`/tools listing and resource reads) — absent or `true` keeps it visible, so the ~50 existing decisions files need no edit. **MCP-only**: `isactive` is untouched, so the spec keeps serving the REST/OpenAPI API and every other consumer. Backed by the `Show in MCP` checkbox on the *Schema Forge Configuration* window (Spec tab). Added ETP-4278. |
| `layoutType` | string | `"default"` | `"default"`, `"kanban"`, `"calendar"`, `"list-modal"`, `"custom"` | Frontend rendering mode. See `docs/window-templates.md`. |
| `templateConfig` | object | `null` | Layout-specific | Extra config for non-default layouts. `kanban`/`calendar`: `groupBy`, `dateField`, etc. `list-modal`: `titleKey`, `editTitleKey`, `bannerKey`, `searchPlaceholderKey`, `newLabelKey`, `autoPriorityField`, `autoPriorityStep`, `sections` (ordered `[{ key, label }]`), `backLabelKey` (toolbar back-button i18n key; default `cancel`), `backTo` (route to navigate to on back; defaults to history `-1`), `toolbarFilters` (declarative dropdown filters `[{ key, field, allLabelKey, options: [{ value, labelKey }] }]`, applied client-side over the loaded rows). All strings are i18n keys. See the `list-modal` section in `docs/window-templates.md`. |
| `detailEntity` | string \| null | Auto-inferred | Entity name or `null` | Explicitly sets which entity is the detail/lines tab. When omitted, the generator picks the first non-primary entity automatically. Set to `null` to create a header-only page (no detail tab). Set to a specific entity name to override the auto-inference. |
| `maxDetailLines` | number | `null` | `0`, `1`, `2`, … | Caps the `detailEntity`'s line count. `N > 0` hides the add-line affordances once the child count reaches `N` (e.g. `1` for a "registro único" accounting-schema row). `0` disables manual line creation entirely (import-only-lines pattern). Only applies to the `window.detailEntity` pattern — see `window.secondaryTabs.<key>.maxDetailLines` below for the equivalent on a `secondaryTabs` entry. Full reference: `docs/ui-customization.md` §11. |
| `secondaryTabs` | object | `null` | See below | Declares one or more custom Panel/Form/Table tabs beside the lines tab (Accounting, Tax, Payment Plan, etc.). See the `secondaryTabs` subsection below. |
| `relatedDocuments` | boolean | `false` | — | Enables the Related Documents footer in the detail view. Requires a hand-written `RelatedDocuments.jsx` in `artifacts/{window}/custom/`. The generator emits the import and `customTabs` prop automatically. |
| `attachments` | boolean \| object | `true` | See below | Adds an "Attachments" tab to the detail view. Auto-enabled on every window with `layoutType: "default"`. Set to `false` to opt out; pass an object to tune client-side limits. See the Attachments subsection below. |
| `notesField` | string | `null` | Any entity field name | Field to display as a notes/description panel in the detail view footer (e.g., `"description"`). Rendered as an expandable text input. |
| `documentPreview` | object | `null` | `{ titlePrefix: string }` | Enables the document preview button in the detail header. `titlePrefix` is shown in the preview drawer title (e.g., `"Order"`, `"Invoice"`). |
| `breadcrumb` | string | `"{category} / {name}"` | Any string | Overrides the auto-generated breadcrumb path shown in the topbar. Useful when the default category/name combination is too verbose (e.g., `"Product"` instead of `"Reference / Product"`). |
| `hideCreate` | boolean | `false` | — | Hides the generic Create/New button in the list toolbar. Use this when creation is handled by a window-specific action or custom component. |
| `hidePrint` | boolean | `false` | — | Hides the print button, unconditionally, in every document status — **in both the detail view action bar AND the list view** (the list's row-selection "Print (N)" bulk button and its toolbar Print/Report button — both call `printDocuments()`/open a report modal with no per-row status gating). One boolean, two surfaces; see the "Print Visibility" subsection below for why that matters when switching a window to `hidePrintWhen`. |
| `hidePrintWhen` | object \| `true` | `null` | See below | Hides the print button in the **detail view** action bar only while a generic field condition matches the current record (e.g. only outside a given status). The literal `true` matches unconditionally — use it instead of `hidePrint: true` when a window must hide Print in every status but its list-view print buttons must stay untouched (see the pitfall note below). Only feeds the detail-view button either way — it has **no effect on the list view's print buttons**, which stay driven by the plain `hidePrint` (see below). See the "Print Visibility" subsection below. Added ETP-4714. |
| `listViewOptions.hidePrint` | boolean | `null` | — | Per-list override for the list view's two print buttons (bulk "Print (N)" + toolbar Print/Report), independent of the detail-view `hidePrint`/`hidePrintWhen`. `ListView.jsx` reads `listViewOptions?.hidePrint ?? hidePrint` — set this explicitly when a window uses `hidePrintWhen` (which doesn't touch the list) but the list-level print should still stay hidden. See "Print Visibility" below. Added ETP-4714. |
| `hideMoreMenu` | boolean | `false` | — | Hides the triple-dot "more" menu in the detail view action bar. |
| `hideStatusFilter` | boolean | `false` | — | Hides the status-filter dropdown ("All statuses") in the list toolbar, even when a `status`-typed column exists. The rest of the filter bar (date filter, Filters) is unaffected. |
| `customListIcons` | boolean | `false` | — | Swaps the list toolbar sort/refresh icons for the shared `SortIcon` / `RefreshIcon` set (`@/components/ui/custom-icons`), matching Contacts/Warehouse. Emits `SortIconComponent` / `RefreshIconComponent` on `ListView`. |
| `contentBg` | string | `"bg-white"` | Any Tailwind bg class | Background color of the main content card in the detail view (e.g., `"bg-slate-50"` for a light gray tone). |
| `formCardPadding` | string | `null` | Any Tailwind padding class | Override the Tailwind padding class applied to the form card div in the detail view. When `null`, `DetailView` falls back to `p-6`. Use `"px-2 pb-2"` for tighter (8px horizontal) padding, for example on windows with dense form layouts. |
| `hideDelete` | boolean | `false` | — | Disables the CRUD delete capability at the contract/API level — emits `apiPrediction.crud.<entity>.delete: false` in `contract.json` for the window's entities, and — since ETP-4745 (`schema_forge_core`'s shared `resolveContractEntityMethods()`) — is also written through to `ETGO_SF_ENTITY.ISDELETE = 'N'` on push, so NEO Headless genuinely rejects `DELETE` (`405`) rather than only hiding it in the UI. **Before ETP-4745**, this flag only reached `contract.json`/the UI-derived affordance; a direct API `DELETE` call against an entity with `hideDelete: true` still succeeded — a wiring gap, not intentional. It does not remove the detail-view **toolbar** Delete button by itself (see `hideDeleteButton` below for that). It DOES, however, remove the row-level delete icon from every list/lines rendering path — both plain `DataTable` tabs (via the `{onDeleteRow && (...)}` gate) and `linesLayout: "inlineEditable"` tabs (via `InlineLinesPanel`'s `canDelete` gate, ETP-4565) — because both derive `onDeleteRow` as `undefined` once `crud.<entity>.delete` is `false`, and both components render the trash button conditionally on that handler being present. Used for master-data windows whose records are provisioned/retired outside the app (e.g. `tax`, `tax-category`, `open-close-period-control`). **Windows declared before ETP-4745 shipped need a re-push** (`make regen ONLY=<window> PUSH_TO_NEO=1` + `./gradlew export.database`) to actually close the gap in their own `ETGO_SF_ENTITY` row — see `docs/feedback.md` for the current list. |
| `hideDeleteWhenComplete` | boolean | `false` | — | Hides the delete button in the detail view when the document status is not Draft. Prevents accidental deletion of completed/processed records. Gates on `window.statusField`: string status codes (e.g. `DR`/`RPAP`/`N`, see `DELETABLE_DOC_STATUSES` in `tools/app-shell/src/utils/recordActions.js`) are treated as deletable, all other codes as not. When `statusField` points to a **boolean** field instead (e.g. `processed` on `physical-inventory`/`goods-movements`), `false` (not yet processed) is deletable and `true` (processed) is not — handled automatically by `isDeleteVisibleForRecord`, no extra config needed. |
| `hideDeleteButton` | boolean | `false` | — | **Unconditionally** hides the Delete (trash) button/icon in **both** the detail view toolbar and the list-row hover quick actions, for every record regardless of status. Distinct from `hideDelete` (which only disables the CRUD delete capability declared in `contract.json`/the API) — use `hideDeleteButton` when you also need to remove the UI affordance. Use this instead of `hideDeleteWhenComplete` when Delete should never be available, not just once the document leaves Draft; when set, `hideDeleteWhenComplete` becomes redundant (the button is always hidden). When `false`/absent, delete visibility is unchanged. |
| `customComponents` | object | `null` | See below | Override generated components with custom ones from `artifacts/{window}/custom/`. The generator emits the correct imports and props automatically. |
| `menuActions` | array | `[]` | See below | Additional actions in the detail view's "more" menu (triple dot). Each action can have visibility conditions based on document status. |
| `newActions` | array | `[]` | See below | Additional actions in the split "New" button dropdown in the list view. Each action can optionally open a custom modal component. |
| `processOverrides` | object | `{}` | See below | Override presentation and behavior of process buttons in the detail view. Keys are process names or column names. See Process Overrides subsection. |
| `detailSortBy` | string | `null` | Any valid sort expression | Default sort order for the detail entity tab (e.g., `"sEQNoAsset asc"`). Passed directly to DetailView as the `detailSortBy` prop. |
| `documentDateField` | string | `"orderDate"` | Any header date field name | Names the header field that holds this document's primary date (e.g., `"orderDate"` for orders/quotations, `"invoiceDate"` for invoices). `DetailView` uses it for exchange-rate lookups (currency conversion of new lines and the currency-dropdown validation) and other document-date-dependent logic. Windows without an `orderDate` field (e.g. sales/purchase invoices) MUST declare this explicitly, or those lookups silently no-op. Defaults to `"orderDate"` for backward compatibility with windows that don't declare it. |
| `statusBar` | object | `null` | See below | Generates a summary status bar above the detail form showing key numeric fields and an optional progress indicator. |
| `statusPills` | array | `[]` | See below | Renders one or more additional status pills next to the document-status pill on the detail view's action bar, driven by a boolean-like header field (e.g. an accounting `posted` pill). |
| `subsetFilters` | array | `null` | See below | Segmented, radio-style filter above the list. One is always active, mutually exclusive, applied before any other filter. Ideal for "which universe am I looking at" selectors (e.g., All / Customers / Vendors). |
| `quickFilters` | array | `null` | See below | Independent toggle pills above the list. Each can be on/off; multiple can be active simultaneously. Combined with the active subset and column filters using AND. Ideal for "refinements" (e.g., only overdue, only pending delivery). |
| `rowQuickActions` | object | _absent_ (feature ON with canonical defaults) | See below | Hover-revealed action overlay on each grid row. The feature is ON by default for every window with canonical actions (Edit / Duplicate / Email / Delete) plus a kebab containing everything from `menuActions` — **no contract block is emitted in that case**. Declare the section only to disable the feature (`enabled: false`), override an action's visibility (`actions.<key>.show: false` / `visibleWhen`), or promote a process to a fixed button (`show: "fixed"`). |
| `sendDocument` | object | _absent_ (auto-enabled on documental windows) | See below | Send/Download envelope config forwarded to the generic `SendDocumentModal`. Auto-enabled when the header exposes `documentNo`; declare it only to disable (`enabled: false`), drop the email panel (`allowEmail: false`), or tune the recipient-edit policy (see the Send Document subsection below). |
| `balanceFooter` | object | `null` | `{ debitField, creditField }` | Renders a debit/credit balance footer (Σ debit, Σ credit, difference, balanced ✓/✗ badge) for double-entry windows (e.g. manual journals). Both fields must be amount-typed fields on the lines entity. When set, the generator emits `BalanceFooterPanel` instead of `DocumentTotalsPanel` and disables the Save button (with a tooltip) only when the entry is unbalanced (Σ debit ≠ Σ credit). An empty/zero entry is treated as balanced and is savable as a draft; the ✓/✗ badge is hidden until the lines carry amounts. Validator F17 enforces field existence. Example: `"balanceFooter": { "debitField": "amtSourceDr", "creditField": "amtSourceCr" }`. |
| `linesLayout` | string | `"classic"` | `"classic"`, `"inlineEditable"` | Lines tab rendering mode. `"classic"` keeps the side-panel edit flow (current behavior). `"inlineEditable"` switches the table to `InlineLinesPanel`: pencil + trash hover-action icons on the right, single-row inline edit triggered by the pencil, autosave on blur. All column types (string, number, amount, percent, date, selector, search) are inline-editable; selector/search columns use `InlineSearchCombo` (text input with server-side search) so FK fields with many options are filterable by typing. The add-line button, related-documents panel, notes panel and totals panel are unchanged. Validator F12 enforces the enum. |
| `lineTaxSifTrigger` | boolean \| object | `false` | `{ enabled, _note }` | ETP-4888 point 5. Shows a hover row-action on the lines grid's `tax` cell when the selected tax is missing its TBAI/Verifactu SIF (Sistemas de Información de Facturación) key, opening a quick-fix modal (`TaxSifModal.jsx`) instead of sending the user to the standalone Impuestos (Taxes) window. Accepts either a plain boolean or the `{ enabled, _note }` object shape (same "boolean-or-object" convention as `attachments`/`sendDocument` above) — `sales-invoice`/`purchase-invoice` use the object form purely to carry the inline `_note` below, no other sub-key is read. **Not yet wired through `generate-frontend.js`** — this flag documents the decision, but today (`sales-invoice`, `purchase-invoice`) each window's own hand-written `index.jsx` mirrors it by hand via a local `LINE_TAX_SIF_TRIGGER_ENABLED` constant, calling `useTaxSifLineRowActions()` and passing the result to the generated `HeaderPage`'s `lineRowActions` prop — the same "hand-mirror a decision the generator doesn't carry" convention this file already uses for `SUBSET_FILTERS`/`LABEL_OVERRIDES` on these two windows. See `docs/ui-customization.md`'s "Line row actions" section for the full mechanism (also covers the backend `InvoiceLineTaxSifSelectorPolicy` enrichment in `com.etendoerp.go`). SII is out of scope: it has nothing to configure at tax level (its header-level `aeatsiiCauseExemption` equivalent is unaffected, still owned by `SifTab.jsx`). A follow-up ticket to wire this through `generate-frontend.js` (in `schema_forge_core`) is recommended once convenient, per Alex's review. |

### Print Visibility (`window.hidePrintWhen`) — ETP-4714

`hidePrintWhen` gates the generic detail-view Print button (`DetailView.jsx`, backed by
`DocumentPrintDrawer` → `/api/reports/print-{window}/render`) with a declarative condition on
any field of the record, instead of the all-or-nothing `hidePrint` boolean. The Print button is
hidden whenever the condition matches, and shown otherwise.

The core pipeline (`resolve-curated.js` / `generate-frontend.js`) only passes the object through
as a literal JSON prop — it does not interpret its shape. All evaluation happens client-side in
`tools/app-shell/src/lib/evaluateFieldCondition.js`, so new operators never require a
`schema_forge_core` change/publish, only an edit to that one file in this repo.

Shape — a `{ field: expectation }` map, every key ANDed together:

- Scalar value → equality: `{ "documentStatus": "DR" }`.
- Array value → membership (`in`): `{ "documentStatus": ["DR", "CO"] }`.
- Object value → explicit operator: `equals`, `notEquals`, `in`, `notIn`, `gt`, `gte`, `lt`,
  `lte`. Example: `{ "documentStatus": { "notEquals": "CO" } }` hides Print unless the
  document is Completado; `{ "documentStatus": { "notIn": ["UE", "CA"] } }` hides Print unless
  the status is one of the listed codes.

Real examples in this repo (all added for ETP-4714):

| Window | `hidePrintWhen` | Meaning |
|---|---|---|
| `sales-invoice`, `sales-order`, `purchase-order`, `return-to-vendor-shipment`, `goods-shipment` | `{ "documentStatus": { "notEquals": "CO" } }` | Print only visible once Completado |
| `sales-quotation` | `{ "documentStatus": { "notIn": ["UE", "CA", "ETGO_CI", "CJ"] } }` | Print only visible in Bajo Evaluación / Cerrado-Pedido creado / Cerrado-Factura creada / Cerrado-Rechazado |
| `purchase-invoice`, `return-material-receipt` | `true` | Print always hidden |

`purchase-invoice` and `return-material-receipt` use the unconditional-match literal `true`
(not the plain `hidePrint` boolean — see the pitfall below for why). `goods-receipt` uses the
plain `hidePrint: true` (it never needed a condition and its list-view print was already meant
to be hidden).

`goods-shipment`, `return-to-vendor-shipment`, and `return-material-receipt` used to gate their
own **custom** Print buttons directly inside their custom `topbarRight` components
(`isCompleted`/`status !== 'DR'`/`hidePrintAlways` respectively). A separate, unrelated ticket
(ETP-4728/ETP-4729 — "print unification onto the generic icon") removed those custom Print
buttons outright from `ConfirmWithCreditButtonBase.jsx` and `GoodsShipmentActions.jsx`: printing
for every window is now served exclusively by the generic icon-only button in `DetailView.jsx` /
`DocumentPrintDrawer.jsx`. These 3 windows were left with no gate at all on that generic button
until ETP-4714 added `hidePrintWhen` to their `decisions.json`, same as every other window in
the table above — there is no more custom-component special case for print visibility.

**Pitfall — `hidePrint` also drives the list view, `hidePrintWhen` does not.** The generator
emits `hidePrint` into **two** places: the detail-view Print button (`hidePrintProp`) and the
list-view's print buttons (`hidePrintListProp` → `ListView.jsx`'s bulk "Print (N)" and toolbar
Print/Report buttons, neither of which has any per-row status gating). `hidePrintWhen` only
feeds the first one — this is intentional (ETP-4714 was scoped to the form view only, per
explicit product direction: the list-view print must never be touched by this feature). Two
regressions were caught during review because of this split, with two different fixes:

- `sales-invoice`/`purchase-order` **already had** `hidePrint: true` before this ticket (list
  AND form both hidden). Swapping to `hidePrintWhen: {...}` for the new conditional form
  behavior silently un-hid their list-view print buttons (list has no gate of its own once
  `hidePrint` is unset). Fix: also declare `"listViewOptions": { "hidePrint": true }` alongside
  `hidePrintWhen` — `ListView.jsx` reads it with priority over the plain `hidePrint` prop
  (`listViewOptions?.hidePrint ?? hidePrint`) — restoring the list to exactly its pre-ticket
  always-hidden state. **These two windows also needed a second fix**: their custom
  `tools/app-shell/src/windows/custom/{sales-invoice,purchase-order}/index.jsx` hand-rolls its
  own `<ListView>` for the list route instead of delegating to the generated `HeaderPage.jsx`
  (only the detail/record route goes through the generated component) — so the generator's
  literal `listViewOptions={{"hidePrint":true}}` in `HeaderPage.jsx` is never even reached for
  the list. The custom wrapper needs the exact same prop hardcoded directly on its own
  `<ListView>` call (matching the existing pattern already used there for `dateFilterKey` etc.)
  — check for this class of gap on **any** window whose custom `index.jsx` renders `<ListView>`
  itself rather than delegating unconditionally to the generated `App`/`HeaderPage`.
- `purchase-invoice` needed the **opposite** correction: it never had `hidePrint` set before
  this ticket, so its list-view print was **visible**. An earlier iteration set
  `"hidePrint": true` to hide the form unconditionally, which also hid the previously-visible
  list print — a second, different regression. Fix: use `"hidePrintWhen": true` instead (the
  unconditional-match literal — see the field row above), which hides only the form and leaves
  `hidePrint`/`listViewOptions` undeclared, so the list keeps its original, untouched, always-
  visible behavior.
- `sales-order`/`sales-quotation` went through the **same** `listViewOptions: {hidePrint:true}`
  fix as `sales-invoice`/`purchase-order` above — until a separate, unrelated ticket (ETP-4729,
  "print unification onto the generic icon — print restored") landed on `epic/ETP-3504` and
  **deliberately removed** the pre-existing `hidePrint: true` from both windows' `decisions.json`
  (plus `goods-shipment`'s), restoring their list-view print to always-visible as the new,
  tested, intended baseline — `tools/app-shell/src/windows/custom/sales-order/__tests__/index.test.js`
  has an explicit regression guard (`'does not hardcode hidePrint on ListView (ETP-4729 — print
  restored)'`) asserting this. ETP-4714's original `listViewOptions` fix for these two windows
  is now obsolete and was removed — do **not** reintroduce it; the list stays unconditionally
  visible for `sales-order`/`sales-quotation`, only the detail-view `hidePrintWhen` gate applies.

**Rule of thumb:** before changing a window's Print visibility, check what its list-view print
buttons looked like *before* your change, and make sure they still look the same *after* it —
match to the pre-existing `hidePrint: true` (→ add `listViewOptions.hidePrint: true`) or absence
(→ use `hidePrintWhen: true`/an object condition, never the plain `hidePrint`) case above.

### Send Document (`window.sendDocument`)

Recipient-edit policy overrides (ETP-4226). The generator copies these keys
verbatim into the generated `sendDocument` prop; ListView forwards the object
to `SendDocumentModal` as `sendPolicy`. Absence of a key means the shared
default applies — editable To/CC chips are the platform default, so **no
window needs this section at launch**.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `editableRecipients` | boolean | `true` | Set to `false` to restore the read-only To input (recipients locked to the server-resolved contact). |
| `cc` | boolean | `true` | Set to `false` to hide the "Add CC" affordance (no CC channel). |
| `maxRecipients` | number | `10` | Maximum recipients across To and CC. Must not exceed the backend contract limit. |

```json
{
  "window": {
    "sendDocument": {
      "editableRecipients": false,
      "cc": false,
      "maxRecipients": 5
    }
  }
}
```

### Status Bar (`window.statusBar`)

Generates a `{WindowName}StatusBar` component inside `@sf-generated` markers. The component renders colored metric cards and an optional progress bar.

```json
{
  "statusBar": {
    "cards": [
      { "field": "depreciatedValue", "label": "Depreciated Value", "color": "blue", "icon": "TrendingDown" },
      { "field": "depreciatedPlan",  "label": "Depreciated Plan",  "color": "teal", "icon": "TrendingDown" }
    ],
    "progress": {
      "numerator": "depreciatedValue",
      "denominator": "assetValue",
      "condition": "depreciate",
      "label": "Depreciation",
      "color": "orange",
      "completedColor": "green",
      "completedIcon": "CheckCircle2"
    }
  }
}
```

**`cards` array** — each card is a colored metric tile:

| Property | Type | Purpose |
|----------|------|---------|
| `field` | string | Entity field name to display (formatted as a number). |
| `label` | string | Label shown below the value. |
| `color` | string | One of `blue`, `teal`, `orange`, `green`. Controls Tailwind color classes. |
| `icon` | string | Lucide icon name (e.g., `TrendingDown`, `CheckCircle2`). Auto-imported. |

**`progress` object** — optional progress bar card (shows percentage):

| Property | Type | Purpose |
|----------|------|---------|
| `numerator` | string | Entity field for the numerator of the percentage. |
| `denominator` | string | Entity field for the denominator. |
| `condition` | string | Boolean entity field — progress only renders when this is `true` or `'Y'`. |
| `label` | string | Label shown below the percentage. |
| `color` | string | Color when progress is incomplete (e.g., `orange`). |
| `completedColor` | string | Color when progress reaches 100% (e.g., `green`). |
| `completedIcon` | string | Lucide icon shown at 100% (e.g., `CheckCircle2`). |

The generator emits `headerContent={(data) => <{WindowName}StatusBar data={data} />}` on the DetailView prop automatically.

### Status Pills (`window.statusPills`)

Renders one or more additional status pills next to the standard document-status pill on the detail view's action bar (the row that already shows Cancel + the `DocumentStatusPill` bound to `documentStatus`). Each entry reads a boolean-like header field and shows a `DocumentStatusPill` in one of two states, without any custom component.

```json
{
  "statusPills": [
    {
      "field": "posted",
      "trueKey": "postedStatus",
      "falseKey": "notPostedStatus",
      "_note": "Accounting status pill"
    }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `field` | string | Header field to read (`data[field]`). Etendo `'Y'`/`'N'`-aware: truthy when `true`, `'Y'`, or `'true'`. |
| `trueKey` | string | i18n key (resolved through `useUI()`) shown when the field is truthy. Renders with `tone: "success"`. |
| `falseKey` | string | i18n key shown when the field is falsy. Renders with `tone: "warning"`. Omit for a **one-sided pill** that only appears in the truthy state — `DetailView` guards against rendering the generator's literal `'undefined'` fallback and hides the pill instead when the current value's key is missing. |
| `visibleWhenCapability` | string | Optional. Same capability gate as the field-level property of the same name (see `visibleWhenCapability` under Grid cell flags below) — the pill is omitted entirely (not just disabled) when the named capability resolves `false` for the current role. |
| `_note` | string | Optional free-text comment, ignored at runtime. Useful for documenting *why* the pill exists inline in `decisions.json`. |

**Mechanics:** the generator resolves this array into an `extraBadges` array of `{ key: field, type: 'statusPill', trueKey, falseKey, visibleWhenCapability }` entries, emitted inside an `@sf-generated-start extraBadges:{Window}` marker and passed to `<DetailView extraBadges={extraBadges} />`. `DetailView.jsx` renders each `statusPill` entry as a `DocumentStatusPill` when the field's value is non-null and a resolvable i18n key exists for its current state. (`extraBadges` also accepts an older plain-badge shape — `{ key, label, style, hideWhenStatus, when }` — predating the `statusPill` type; new windows should always go through the `statusPills` decision above, which emits `type: 'statusPill'` entries, not the legacy shape directly.)

**Real example — `posted` on `purchase-invoice`/`sales-invoice` (ETP-4520) and `return-to-vendor-shipment`/`return-material-receipt` (ETP-4707, 3rd window on the pattern):** shown above. Pair with the field-level `badge`/`badgeLabels`/`badgeVariants` properties (see Grid cell flags below) to show the same true/false state as both a grid-column pill and a form-header pill, driven by one `posted` field.

### Attachments (`window.attachments`)

Adds a generic "Attachments" tab to the detail view, sitting alongside the standard tabs (Lines, Notes, Related Documents, etc.). The tab is **auto-enabled** on every window whose `layoutType` is `"default"` — no opt-in required. Set `attachments: false` to disable it on a specific window, or pass an object to tune client-side limits.

**Layout gate:** the tab only renders when `window.layoutType === "default"`. Kanban, calendar, gallery, and custom layouts never get the tab, regardless of the `attachments` value.

**Short form** (boolean toggle):
```json
{
  "window": {
    "attachments": true
  }
}
```

**Opt-out:**
```json
{
  "window": {
    "attachments": false
  }
}
```

**Extended form** (object with client-side limits):
```json
{
  "window": {
    "attachments": {
      "enabled": true,
      "maxSizeMB": 10,
      "allowedMimeTypes": ["application/pdf", "image/*"]
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master toggle. Set to `false` for the same effect as `attachments: false`. |
| `maxSizeMB` | number | `10` | Max file size enforced client-side before upload. The NEO servlet has its own hard limit of 10 MB (`MultipartConfig`); raising this beyond 10 will surface a server error. |
| `allowedMimeTypes` | string[] | `undefined` (any) | MIME-type allow-list applied client-side. Supports wildcards like `"image/*"`, `"application/*"`. When omitted, every MIME type is accepted. |

**Note:** the frontend resolves the target `tableName` from `frontendContract.entities.header.tableName` automatically — you do **not** configure it in `decisions.json`. The tab does a lazy fetch on activation (no request until the user opens it). Backend storage uses the standard Etendo `AttachImplementationManager` and the `C_FILE` table.

### Custom Panel Tabs (`window.customPanelTabs`)

Adds custom tabs to the bottom tab strip in the detail view, alongside the standard Attachments tab. The generator reads this array and emits the corresponding `customTabs` prop on `DetailView`. Each tab maps to a component imported from `tools/app-shell/src/windows/custom/{window}/`.

Use this when a window needs supplementary panels (e.g., a pricing breakdown, a related-document viewer, a custom notes area) that sit at the same level as Attachments without modifying generated code.

```json
{
  "customPanelTabs": [
    { "key": "pricing", "labelKey": "price", "component": "ProductPriceBar" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique tab identifier. Used as the tab's `key` prop. |
| `labelKey` | string | i18n key resolved through `useUI()`. Rendered as the tab label. |
| `component` | string | Component name from `tools/app-shell/src/windows/custom/{window}/`. The generator imports it automatically. |

**Note:** Use `customTabsAfterBottom: true` alongside this property to position the custom tabs after the standard bottom section (lines, notes, etc.) rather than interleaved with primary tabs.

### Secondary Tabs (`window.secondaryTabs`)

Declares one or more tabs rendered beside the header's detail/lines content —
Accounting, Tax, Payment Plan, Customer/Vendor Accounting, Bank Account, etc.
Each key is the backing entity name; `resolveSecondaryTabDefs` (in
`generate-frontend.js`) reads this object and emits the corresponding
`Table`/`Form`/`Panel` imports and the `secondaryTabs` prop array on the
generated `<Page>` component, sorted by `tabOrder`.

```json
{
  "secondaryTabs": {
    "accounting": {
      "tabOrder": 1,
      "label": "Accounting",
      "addLineFields": ["fixedAsset", "productExpense", "productRevenue", "productCOGS"],
      "requireSavedRecord": true,
      "maxDetailLines": 1
    }
  }
}
```

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `tabOrder` | number | `99` | Global sort weight across the ENTIRE tab strip (ETP-4415) — not just among secondary tabs. Lower sorts first. Also settable on `customPanelTabs[]`/`extraTabs[]` items and `attachments` (default `999`, i.e. after secondaryTabs); the lines tab uses `window.detailTabOrder` (or the legacy `window.detailTabIndex`, see below) instead, since it isn't declared per-entry. A window declaring no `tabOrder` anywhere renders in exactly the pre-ETP-4415 order. |
| `label` | string | `toLabel(key)` | Tab label (menu-translatable via `tMenu`). |
| `tabMode` | string | `null` | `"form-only"` renders `isFormTab: true` (a plain form bound to the header's own state, not a child table) — see `SecondaryFormTab`'s prop contract in `docs/ui-customization.md` §17. Any other value (or `"table-form"`) is a genuine child-entity table + detail form. |
| `addLineFields` | array | `[]` | Field keys shown in the tab's inline add-row. Resolved against the entity's own contract fields (labels, lookups, defaults, etc. carried over automatically). |
| `requireSavedRecord` | boolean | `false` | Blocks opening/adding to this tab until the header record itself has been saved (no `id` yet). |
| `customPanel` / `customTable` / `customForm` | string | `null` | Overrides the generated `Table`/`Form` with a hand-written component name, resolved via `resolveCustomImport()` (pipeline-window convention: `artifacts/{window}/custom/`, hand-built convention: `tools/app-shell/src/windows/custom/{window}/`). `customPanel` renders a freeform `Panel` instead of a table (see the `Panel` prop contract in `docs/ui-customization.md` §17). |
| `customAddModal` | string | `null` | Opens a hand-written modal component instead of the inline add-row (e.g. `locationAddress`'s `LocationEditorModal`). |
| `readOnlyLogic` | AD logic string | `null` | Compiled with the same translator as field-level `readOnlyLogic`; evaluated against the current header record, independent of the document's own draft/completed state. |
| `maxDetailLines` | number | `null` | **(ETP-4565)** Caps this tab's own child count, mirroring the top-level `window.maxDetailLines` semantics for the `detailEntity` pattern but scoped per secondary tab — a window can declare several `secondaryTabs`, each needing an independent cap (e.g. `contacts`' `customerAccounting` vs. `vendorAccounting`). `N > 0` hides the add-line button, the empty-state add trigger, and the inline add-row once the tab's child count reaches `N` (e.g. `1` for a "registro único" accounting-schema row). `0` disables manual add entirely for that tab. Undeclared (default) stays uncapped. Implemented by `resolveCanAddSecondaryLines(st, childrenCount)` in `tools/app-shell/src/components/contract-ui/DetailView.jsx`, fed by the `maxDetailLines` prop the generator emits on the tab's entry in `buildSecondaryTabPropEntry` (`generate-frontend.js`, `schema_forge_core`). |

**Real examples:** `product`/`asset-group` (`secondaryTabs.accounting.maxDetailLines: 1`), `contacts` (`secondaryTabs.customerAccounting.maxDetailLines: 1` and `secondaryTabs.vendorAccounting.maxDetailLines: 1`) — all four cap their accounting-schema row at exactly one record, the `secondaryTabs`-pattern equivalent of `window.maxDetailLines: 1` on `product-category`/`business-partner-category`/`tax`'s `detailEntity`. Full extension-point reference (Panel/Form prop contracts, custom-window wiring): `docs/ui-customization.md` §17.

**Cross-group ordering (ETP-4415).** `tabOrder` used to only sort within `secondaryTabs`; it now sorts the whole tab strip (`secondaryTabs` + lines + `customPanelTabs`/`extraTabs`/`attachments`) together, computed at runtime in `buildInitialTabs()` (`tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx`). This lets a classic tab (e.g. Contabilidad) render after a custom tab (e.g. Precio) — previously impossible since classic tabs were always emitted before custom ones. `relatedDocuments` does not participate (it renders via a separate footer path, not this tab strip, regardless of this feature).

**The lines tab** is positioned by `window.detailTabOrder` (number, new, preferred) or the legacy `window.detailTabIndex` (a splice index among `secondaryTabs`, kept working for backward compatibility but not recommended for new windows — it's a position, not a weight, and interacts less predictably with custom tabs). Neither declared → the lines tab renders first, matching pre-ETP-4415 behavior.

**Side effect:** the detail view opens on whichever tab ends up first after sorting (`activeTab` starts at index 0). Reordering a window's tabs can change its default-open tab — this is expected, not a bug to work around with a separate "default tab" key.

**Incompatible with `customTabsAfterBottom: true`.** That flag renders custom tabs in a separate strip below `bottomSection`, entirely outside this sort — any `tabOrder` on a custom tab in that mode is a silent no-op, flagged by pipeline-validator rule F21 (see `docs/pipeline-validator-reference.md`).

### Subset Filters (`window.subsetFilters`)

> See [`list-filters.md`](list-filters.md) for the full toolbar layout (subset / quick / document-type / advanced), URL-param conventions, and when to use which surface.

Radio-style segmented control above the list. Exactly **one** entry is always active (first one by default). Clicking a different entry switches selection; clicking the already-active entry does nothing. Filters are applied to the backend query **before** quick filters and column filters.

Use when the window exposes mutually exclusive views of the data — i.e., the user is choosing "which slice am I looking at".

```json
{
  "subsetFilters": [
    { "label": "all" },
    {
      "label": "Customers",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22customer%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"
    },
    {
      "label": "Vendors",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22vendor%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"
    }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | i18n key resolved through `useUI()`. Rendered as the button text. |
| `filter` | string | Optional. URL-encoded `criteria=...` string applied to the list API query. Omit for an "All" / no-filter option. |
| `rowFilter` | function | Optional. Client-side predicate `(item) => boolean` used in addition to the backend `filter`. Only relevant when the generator passes a JS function reference (not used in plain `decisions.json`). |

**Behavior:**
- Always exactly one active — first entry wins on initial mount.
- Replaces (never adds to) the selection — pure segmented control.
- Combined with `quickFilters` and column filters via AND at the backend query level.

### Quick Filters (`window.quickFilters`)

Independent toggle pills above the list. Each pill can be on or off — any subset (including empty) is valid. Refines the active `subsetFilters` row selection further.

Use when the window has optional refinements that the user turns on or off individually — e.g., "show only overdue", "only pending delivery".

```json
{
  "quickFilters": [
    {
      "label": "overdueOnly",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22dueDate%22%2C%22operator%22%3A%22lessThan%22%2C%22value%22%3A%22today%22%7D%5D"
    },
    {
      "label": "pendingDeliveryOnly",
      "filter": "criteria=..."
    }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | i18n key resolved through `useUI()`. Rendered as the button text. |
| `filter` | string | URL-encoded `criteria=...` string applied when the pill is active. |
| `rowFilter` | function | Optional. Client-side predicate, same semantics as `subsetFilters.rowFilter`. |

**Behavior:**
- Multi-select — clicking toggles the pill independently.
- All active pills' criteria are merged with the active subset via AND.
- Starts empty unless the parent component passes `initialQuickFilterIndex` (only the 4 custom sales/purchase windows do this today).

### Row Quick Actions (`window.rowQuickActions`)

Hover-revealed action overlay on each row of the list grid. Mirrors the edit-view toolbar so users can run common actions without opening the record. ETP-3914.

**Feature is ON by default for every window — no contract block is needed.** The runtime renders the four canonical actions plus the kebab automatically when `decisions.json` does not declare the section. You only declare this block to:
- disable the feature on a specific window (`enabled: false`),
- hide one of the canonical actions (`actions.<key>.show: false`),
- promote a non-canonical process to a fixed button (instead of the kebab),
- attach a `visibleWhen` predicate to an action.

When you do declare it, write **only the delta** — there is no need to repeat `enabled: true` or `actions.edit.show: true`. Defaults are resolved at runtime.

```json
{
  "rowQuickActions": {
    "enabled": true,
    "editMode": "navigate",
    "actions": {
      "edit":      { "show": true },
      "duplicate": { "show": true },
      "email":     { "show": true },
      "delete":    { "show": true },
      "completeOrder": { "show": "fixed", "visibleWhen": "@DocumentStatus@='DR'" },
      "voidIt":        { "show": "kebab" }
    }
  }
}
```

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `enabled` | boolean | `true` | Toggle the entire overlay for this window. When `false`, the generator skips emission and the list behaves as before. |
| `editMode` | string | `"navigate"` | `"navigate"` opens the detail view (same as double-click). `"inline"` is reserved for inline-row editing and currently shows a "coming soon" toast. |
| `actions` | object | Canonical four shown | Per-action overrides. Keys are either canonical (`edit`, `duplicate`, `email`, `delete`) or a process key declared in `menuActions[].key` / `processOverrides`. |

Each entry in `actions` accepts:

| Property | Type | Purpose |
|----------|------|---------|
| `show` | boolean \| string | `true` (default) renders the action. `false` removes it from both the fixed buttons and the kebab. `"fixed"` promotes a non-canonical action to a fixed button slot (after the canonical four, before the kebab). `"kebab"` forces an action into the kebab dropdown only. |
| `visibleWhen` | string | Optional Etendo display-logic predicate (`@Field@='Value'`, AND-chained, `!=` supported). Evaluated against the row data and ANDed with the existing edit-view visibility rules (delete gate, `documentPreview`, `action.visible`). |

**Canonical keys are always valid** — `edit`, `duplicate`, `email`, `delete` never need a matching `menuActions` entry. Non-canonical keys must exist in `window.menuActions` or `window.processOverrides`; the pipeline validator F11 enforces this.

**Resolution behavior** (`resolve-curated.js`):
- Section absent in `decisions.json` → no `rowQuickActions` block is written to the contract. The feature still mounts at runtime with canonical defaults.
- Section declared → copied verbatim to the contract. The runtime merges canonical defaults on top, so a partial declaration like `{ actions: { email: { show: false } } }` hides email without affecting the other canonical buttons.

**Generator behavior** (`generate-frontend.js`):
- When the contract has `enabled === false`, the `rowQuickActions` prop is omitted from `<ListView>` and no row overlay is mounted.
- Otherwise the prop is always emitted — either with the declared delta or as `{}` for windows that use full defaults. Runtime handlers (`onEdit`, `onClone`, `onEmail`, `onDelete`, `onMenuActionExecuted`) are wired by the host page or `ListView` itself.

### Subset vs Quick — when to use which

| Signal | Use `subsetFilters` | Use `quickFilters` |
|--------|---------------------|--------------------|
| "Which slice am I viewing?" (tabs/segments) | ✅ | ❌ |
| "Refine the current slice" (on/off flags) | ❌ | ✅ |
| Always at least one active | ✅ | ❌ |
| Can all be off | ❌ | ✅ |
| Mutually exclusive | ✅ | ❌ |
| Combinable | ❌ | ✅ |

The two can coexist in the same window — subsets render first (segmented control), quick filters render after (toggle pills).

### Custom Components (`window.customComponents`)

Override generated components with custom implementations from `artifacts/{window}/custom/`. The generator emits the correct imports and DetailView props automatically.

```json
{
  "customComponents": {
    "headerTable": "InvoiceHeaderTable",
    "bottomSection": "InvoiceBottomPanel",
    "topbarRight": "InvoiceTopbarExtra"
  }
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `headerTable` | string | Custom table component name. Replaces the generated `{Entity}Table` import. File must exist at `artifacts/{window}/custom/{value}.jsx`. |
| `bottomSection` | string | Custom bottom panel component. Replaces the default totals + footer layout. Receives `recordId`, `data`, `token`, `apiBaseUrl`, `api`, `summary`, `notesField`, `onFieldChange`, `notesFocused`, `setNotesFocused`. |
| `topbarRight` | string | Custom component rendered on the right side of the detail topbar (before icon buttons). Receives `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess`. When present, the default status badge is hidden. |

### Menu Actions (`window.menuActions`)

Additional actions shown in the detail view's "more" menu (triple dot icon). Each action can have visibility conditions based on document status.

```json
{
  "menuActions": [
    { "key": "duplicate", "label": "Duplicate" },
    { "key": "cancel", "labelKey": "cancel", "destructive": true, "visibleWhenStatus": "CO" },
    { "key": "reactivate", "labelKey": "reactivate", "visibleWhenStatus": "CO", "visibleWhenFieldFalse": "hasLinkedDocuments", "documentAction": "RE", "successKey": "actionCompleted" },
    { "key": "reverse", "label": "Reverse Payment", "destructive": true, "visibleWhenStatus": ["RPPC", "RPR"], "columnName": "aPRMReversePayment" },
    { "key": "post", "label": "Post", "labelKey": "post", "action": "post", "successKey": "documentPosted" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier for the action. |
| `label` | string | Display label in the menu. |
| `labelKey` | string | i18n key for the label (alternative to `label`). |
| `destructive` | boolean | If `true`, renders in red as a destructive action. |
| `visibleWhenStatus` | string or string[] | Only show the action when document status matches. Omit to always show. |
| `visibleWhenFieldTrue` | string | Show the action only when the named field in the record `data` **is** truthy. Etendo `'Y'`/`'N'`-aware: the field is treated as true when it equals the string `'Y'` or boolean `true`. Combines with `visibleWhenStatus` using AND. Requires the backend to expose the field (e.g. via a NeoHandler `afterHandle`). When used, the generator emits `({ data, status }) =>` instead of `({ status }) =>`. Emitted as `(data?.<field> === 'Y' || data?.<field> === true)`. |
| `visibleWhenFieldFalse` | string | Show the action only when the named field in the record `data` is **not** true — the exact logical complement of `visibleWhenFieldTrue`. Etendo `'Y'`/`'N'`-aware: a field of `'N'` (which is a truthy JS string!) correctly counts as "false", so an unposted (`posted='N'`) document still shows the action. Combines with `visibleWhenStatus` using AND. Requires the backend to expose the field. When used, the generator emits `({ data, status }) =>` instead of `({ status }) =>`. Emitted as `!(data?.<field> === 'Y' || data?.<field> === true)`. |
| `documentAction` | string | Invokes the standard DocAction endpoint with this value (`"RE"`, `"CO"`, `"VO"`, etc.). The record refreshes automatically on success. |
| `columnName` | string | If set, triggers the named process column via `hook.handleProcess`. If omitted (and no `action`), generates an empty `onClick` placeholder. |
| `action` | string | Invokes a generic NEO action endpoint (`POST {apiBaseUrl}/{entity}/{recordId}/action/{action}`) via the `useNeoAction` hook — e.g. `"post"` / `"unpost"`. The backend must handle the named action server-side. Emitted as `neoAction: '<value>'` in the contract. **Handler precedence:** `documentAction` > `columnName` > `action` > empty `onClick`. |
| `successMessage` | string | Text shown in the success banner after `documentAction` resolves. |
| `successKey` | string | i18n key for the success banner message (alternative to `successMessage`). |

### New Actions (`window.newActions`)

Additional actions shown in the dropdown of the split "New" button in the list view. The `ChevronDown` caret is only visible when at least one action is declared.

```json
{
  "newActions": [
    { "key": "import-csv", "label": "Import from CSV", "component": "ImportCsvModal" },
    { "key": "duplicate", "label": "Duplicate last" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier for the action. Also used as `data-testid="action-new-{key}"`. |
| `label` | string | Display label in the dropdown menu. |
| `component` | string | Optional. Name of a custom component in `tools/app-shell/src/windows/custom/{window}/`. When set, the generator imports it, creates a `show{Key}Modal` state, and passes `onClick: () => setShow{Key}Modal(true)`. If omitted, generates an empty `onClick` placeholder. |

The component receives: `token`, `apiBaseUrl`, `windowName`, `onClose`. The `token` prop remains for legacy compatibility while existing generated custom components are migrated. New or migrated components that need authenticated API calls should use `useApiFetch(apiBaseUrl)` instead of constructing raw auth headers.

### Process Overrides (`window.processOverrides`)

Override the presentation and behavior of process buttons rendered in the detail view. Each key is a process name or column name from the backend contract. The generator matches overrides by `p.name` first, then falls back to `p.columnName`.

```json
{
  "processOverrides": {
    "completeOrder": { "label": "Approve", "style": "positive" },
    "voidOrder": { "exclude": true },
    "customAction": { "add": true, "label": "Custom Action", "style": "neutral", "displayLogicRaw": "data.status === 'DR'" }
  }
}
```

Each override entry supports the following properties:

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | Override the default process label. |
| `style` | string | Button style: `"positive"`, `"destructive"`, `"neutral"`. Default inferred from name. |
| `displayLogicRaw` | string | JavaScript expression controlling button visibility (e.g., `"data.status === 'DR'"`). |
| `exclude` | boolean | If `true`, hides this process button entirely. |
| `add` | boolean | If `true`, defines a new process button not present in the backend contract. |
| `columnName` | string | Column name to include in the action POST payload (used with `add: true` when the process maps to a specific column). |
| `requiresLines` | boolean | If `true`, the button is disabled until at least one line exists. |
| `requiresFieldMax` | array | Validation rules checked before firing the action. Each entry: `{ field, max, conditionalOnField?, conditionalValue?, errorKey }`. |
| `params` | array | Parameter definitions for a pre-process dialog. When at least one non-hidden param is present, clicking the button opens `ProcessParamDialog` first; the collected values are passed to `handleProcess` as `paramValues`. Each entry: `{ key, type, label, required?, hidden?, options? }`. Supported `type`: `"select"` (renders a dropdown using `options: [{ value, label }]`). The first option is pre-selected. See [Process Parameter Dialog](#process-parameter-dialog-params) below. |
| `labelToggle` | object | Optional. Switches the button caption based on a record field value. Shape: `{ field, equals, label }`. When the current record's `field` value strictly equals `equals`, the button shows `label`; otherwise it shows the default `label` property. Both captions are translated via `useMenuLabel`. Purely opt-in — omitting it leaves the button behavior byte-identical. Mirrors Etendo Classic buttons backed by a list reference (e.g. Assets ref 800042: N→Create Amortization, Y→Recalculate Amortization keyed on `processed`). |

When `style` is not specified, the generator defaults to `"destructive"` for processes whose names contain destructive keywords (e.g., `void`, `cancel`, `reverse`) and `"positive"` for all others.

**Example — dynamic caption with `labelToggle`:**

```json
"processOverrides": {
  "processAsset": {
    "add": true,
    "label": "Create Amortization",
    "style": "positive",
    "labelToggle": { "field": "processed", "equals": "Y", "label": "Recalculate Amortization" }
  }
}
```

The button reads "Create Amortization" while `processed !== 'Y'` and flips to "Recalculate Amortization" once `processed === 'Y'`.

#### Process Parameter Dialog (`params`)

When a `processOverrides` entry contains a `params` array with at least one entry where `hidden !== true`, the detail toolbar button opens `ProcessParamDialog` before invoking the process. The dialog collects the user's choices and passes them as `paramValues` to `hook.handleProcess(process, paramValues)`, which merges them into the `fieldValues` POST body.

**Example — Open/Close Period Control:**

```json
"processOverrides": {
  "openClose": {
    "params": [
      {
        "key": "openClose",
        "type": "select",
        "label": "Action",
        "required": true,
        "options": [
          { "value": "O", "label": "Open" },
          { "value": "C", "label": "Closed" },
          { "value": "P", "label": "Permanently closed" }
        ]
      }
    ]
  }
}
```

The backend NeoHandler receives the chosen value via `context.getRequestBody().optJSONObject("fieldValues").optString("openClose", null)`.

Hidden params (`hidden: true`) are excluded from the dialog but can be used in future for server-side context passing.

## Entity Properties (`entities.{entityName}.*`)

Entity keys use **camelCase from tabName** (e.g., `"header"`, `"lines"`, `"basicDiscounts"`).

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `name` | string | Entity key | Override display name. |
| `exclude` | boolean | `false` | Omit entire entity from schema. |
| `fields` | object | `{}` | Field-level decisions. |
| `draftMode` | object | `null` | Draft/Processed workflow config. |
| `javaQualifier` | string | `null` | CDI qualifier for custom NeoHandler. |
| `namedFilters` | array | `null` | **Hand-authored named HQL filters** the NEO Headless MCP exposes as `{ "status": "<name>" }` list filters. See below. |
| `virtualFields` | array | `[]` | Columns with **no AD column behind them**, injected per row by the entity's NeoHandler in `afterHandle`. See below. |
| `handlesDefaults` | boolean | `true` | **HandleDefaults.** When `true` (default), a new detail line's add-row fetches `GET /{detailEntity}/defaults?parentId=…` on open and pre-fills empty editable fields from the backend-resolved defaults (reusing the header-defaults normalization). Set `false` to opt this detail entity out — the add-row keeps literal-only seeding and no `/defaults` request is made. Emitted to the contract / runtime `api.crud` only when `false`. |
| `hideDelete` | boolean | `false` | Disables the CRUD delete capability for **this entity only** (`apiPrediction.crud.<entity>.delete: false`) — unlike `window.hideDelete`, which disables delete uniformly across every entity in the window. `DetailView`'s row-delete handler, bulk-delete bar, and delete-eligibility checks all gate directly on this same `crud.delete` flag, so setting it also removes the row-level delete icon/checkbox in the UI, not just the declared API capability — for **both** plain `DataTable` list/lines tabs and `linesLayout: "inlineEditable"` tabs (`InlineLinesPanel`, see ETP-4565: before that fix the icon still rendered — and silently no-opped on click — on `inlineEditable` tabs, since only `DataTable` gated its trash button on `onDeleteRow`). Use for a child/detail entity whose rows are exclusively managed as a side effect of the parent's own save (e.g. a NeoHandler syncing a join table from a parent field) — manual row deletion there would let a user bypass that invariant. Added ETP-4512 (`userRoles` on the `user` window). **Note (ETP-4745):** the "declared API capability" language above described `contract.json` only — until ETP-4745 wired `hideDelete` through to `ETGO_SF_ENTITY.ISDELETE`, a direct API `DELETE` request against a `hideDelete: true` entity (including `userRoles`) still succeeded server-side; only the UI icon was actually gated. `userRoles` needs a re-push (`make regen ONLY=user PUSH_TO_NEO=1` + `./gradlew export.database`) once ETP-4745 ships to close that gap for real — see `docs/feedback.md`. |

### Virtual fields (`entities.{name}.virtualFields`)

For a column the backend computes and injects but that has **no AD column** — so
extraction can never discover it. The entity's `NeoHandler` must `put` it into each row
in `afterHandle`; NEO will not derive it (no AD column → no OBDal property → no value).

```json
"account": {
  "javaQualifier": "financialAccountHeaderHandler",
  "virtualFields": [
    { "name": "pendingCount", "column": "pendingCount", "label": "Pending",
      "type": "integer", "visibility": "readOnly", "form": false,
      "grid": true, "gridOrder": 4 }
  ]
}
```

- **`column` must match the JSON key the handler writes exactly** — that is how the row
  value is found. It is not an AD column name.
- Keep `visibility: "readOnly"`: there is nothing to write to.
- `form: false` keeps it out of the generated form; `grid` + `gridOrder` place it in the grid.
- Safe with `push-to-neo`: no `ad_column` matches, so the field is skipped rather than
  inserted into `ETGO_SF_FIELD`.
- **Only a closed set of keys is copied** (`name`, `column`, `label`, `type`, `visibility`,
  `required`, `form`, `grid`, `gridOrder`, `section`). Anything else — notably `cellType`,
  `gridLabelKey`, `seq` — is silently dropped, so a virtual field cannot declare its own
  renderer; bind it in the consuming component instead.

Shipped by: `payment-in`, `payment-out`, `return-material-receipt`,
`return-to-vendor-shipment` (`invoiceDocumentNo`) and `financial-account` (`pendingCount`).

### Line HandleDefaults (`entities.{name}.handlesDefaults`)

When a user opens a new detail line, `DetailView` calls `useEntity.fetchChildDefaults(parentId)` → `GET /{detailEntity}/defaults?parentId=…`, normalizes the response with the same `normalizeDefaultValue` the header uses, and passes it to the add-row as `resolvedDefaults`. `DataTable.buildEmpty` then fills **empty** editable fields (fill-empties-only: literal defaults, the client `lineNo`, parent-derived display seeds, and `skipDefault` fields are never overridden). This is how a line field whose AD default is a macro — e.g. a journal line `Description` defaulting to `@DESCRIPTION1@` (the parent journal's description, resolved by NEO's auxiliary-input pipeline) — gets pre-filled. On by default; opt out per entity (`handlesDefaults: false`) or per field (`skipDefault: true`). Covers the inline add-row of the primary lines tab and secondary detail tabs.

### Draft Mode (`entities.{name}.draftMode`)

Enables a two-button save workflow: "Save Draft" (save only) + "Save & {label}" (save + execute process).

```json
{
  "draftMode": {
    "enabled": true,
    "processField": "documentAction",
    "processValue": "CO",
    "label": "Complete"
  }
}
```

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `enabled` | boolean | `false` | Activate draft mode for this entity. |
| `processField` | string | `"documentAction"` | Field name that controls the process. Used both as the action endpoint name (`/action/{processField}`) and as the key inside `fieldValues`. |
| `processValue` | string | `"CO"` | Value to submit for processing (e.g., `"CO"` = Complete). |
| `label` | string | `"Process"` | Button label suffix: "Save & {label}". |
| `extraParams` | object | `null` | Extra params merged at the **top level** of the action POST body (not inside `fieldValues`). Required when the AD process validates a mandatory parameter against the request root rather than `fieldValues` — e.g. `M_Internal_Consumption_Post` needs `{ "action": "CO" }`. Example: `"extraParams": { "action": "CO" }`. |
| `completedStatuses` | string[] | _(falls back to `processed`/`documentStatus==='CO'`)_ | When set, only these `documentStatus` values hide the Save/Confirm pair. Omit to let the generic `processed === 'Y'` flag drive button hiding. |

**When disabled** (default): single "Save" button.
**When enabled**: "Save draft" + "Save & {label}" buttons, plus process buttons from `processEndpoints`.

### Named Filters (`entities.{name}.namedFilters`)

Hand-authored named business filters the NEO Headless **MCP** exposes to AI agents as a
`{ "status": "<name>" }` filter on `neo_list`. Each entry pairs a stable `name` with an **HQL `where`
fragment** over the entity alias `e`. This is the canonical way to give an agent document-status
semantics (paid / unpaid / partial) that plain `key=value` or range filters cannot express — the
fragment can compare field-to-field and use HQL functions (`abs`, `now`, …).

```json
"entities": {
  "header": {
    "namedFilters": [
      { "name": "completed", "label": "Paid", "description": "Fully paid invoices.",
        "where": "e.paymentComplete = true" },
      { "name": "pending", "label": "Unpaid", "description": "Nothing collected yet.",
        "where": "e.paymentComplete = false and abs(e.outstandingAmount) >= abs(e.grandTotalAmount)" },
      { "name": "partial", "label": "Partially paid", "description": "Some collected, balance remains.",
        "where": "e.paymentComplete = false and abs(e.outstandingAmount) > 0 and abs(e.outstandingAmount) < abs(e.grandTotalAmount)" }
    ]
  }
}
```

| Property | Type | Required | Purpose |
|----------|------|----------|---------|
| `name` | string | ✅ | Stable filter key the agent passes as `{ "status": name }`. First entry wins on duplicate names. |
| `where` | string | ✅ | HQL boolean fragment over alias `e` (the entity). Spliced verbatim into the fetch `WHERE`. |
| `label` | string | — | Short human label surfaced in `neo_schema` docs. |
| `description` | string | — | One-line explanation surfaced in `neo_schema` docs. |

**Flow:** `decisions.json` → `resolve-curated` (normalize, trim, drop entries missing `name`/`where`,
dedupe by `name`) → `contract.json` (`backendContract.entities[e].namedFilters`) → `push-to-neo`
(`ETGO_SF_ENTITY.NAMED_FILTERS`, a `text`/CLOB column) → MCP. `neo_schema` returns each filter's
`name`/`label`/`description` (**never the `where`**) so the agent can discover the available statuses;
an unknown name returns the valid list as a clean handled error, not a 500.

**Authoring rules (MANDATORY):**
- Author the `where` **only over persisted, queryable columns.** Never reference a computed/transient
  column (e.g. an invoice's `eTGODueDate`) — Hibernate cannot put it in a `WHERE` and the query throws
  at creation. This is exactly why `overdue` (overdue-by-date) is intentionally **not** authored on the
  invoice header: `C_Invoice` has no persisted due-date column.
- The fragment is spliced verbatim and runs with the same trust as the rest of the spec — treat it as
  trusted code, never interpolate user input into it.
- An entity with no `namedFilters` falls back to a plain column match on `status`, so this is
  backward-compatible.

## Field Properties (`entities.{name}.fields.{fieldName}.*`)

Field keys use **camelCase from raw schema** (e.g., `"businessPartner"`, `"orderDate"`).

### Visibility & Display

| Property | Type | Default | Values | Purpose |
|----------|------|---------|--------|---------|
| `visibility` | string | From extraction | `"editable"`, `"readOnly"`, `"system"`, `"discarded"` | User interaction level. See `docs/field-visibility-types.md`. |
| `grid` | boolean | Per visibility | `true`/`false` | Show in list/grid view. |
| `form` | boolean | Per visibility | `true`/`false` | Show in detail/form view. |
| `searchable` | boolean | `false` | `true`/`false` | Enable as filter parameter in list API. |
| `section` | string | `null` | `"principal"`, `"other"`, custom | Group fields into form sections. |
| `inline` | boolean | `false` | `true`/`false` | When `true`, keeps the field in the normal form grid flow even if the generator would otherwise pull it out. Currently relevant for image-type fields: an image field with `inline: true` renders inside the form grid using `row-span-2`, spanning two rows for visual balance instead of being extracted to a separate slot. |
| `skipDefault` | boolean | `false` | `true`/`false` | **HandleDefaults opt-out (per field).** When `true`, the line add-row never applies a backend-resolved default to this field (it stays empty / keeps its literal seed) even when the entity's `handlesDefaults` is on. Emitted to the contract / add-row literal only when `true`. |
| `clearsField` | string | `null` | Sibling field key | **Mutual exclusion.** Names a sibling field that is cleared (set to `0`/empty) whenever this field gets a non-zero value — e.g. a journal line where entering a Debit clears the Credit, and vice versa. The two fields form a "one-of" group: in the inline add-row's required-field check, an empty member is **not** flagged as missing while its partner carries a value (so a debit-only line submits). A required boolean/checkbox is likewise never treated as missing (unchecked is valid). |

**Visibility defaults** (when not overridden):

| Visibility | `grid` | `form` | `searchable` |
|-----------|--------|--------|-------------|
| `editable` | false | true | false |
| `readOnly` | false | true | false |
| `system` | false | false | false |
| `discarded` | false | false | false |

### Grid cell flags

Applied to fields with `grid: true` to control how the list cell renders.

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `gridOrder` | integer | `null` | 1-based insertion position of the column in the grid. Only tagged fields move; untagged fields keep their relative order. |
| `badge` | boolean | `false` | Render an enum/list value as a badge/chip. |
| `inlineToggle` | boolean | `false` | Render a boolean column as an inline `Switch` that `PATCH`es `{entity}/{id}` with `{ [field]: checked }` on change (used by `list-modal` and inline-line layouts). |
| `inlineEdit` | boolean | `false` | Mark a column as inline-editable (carried into the contract as `inlineEdit: true`). Consumed by `list-modal`; editing is also available via the modal. |
| `gridReadOnly` | boolean | `false` | Make an otherwise-editable column read-only in the grid. |
| `grow` | boolean | `false` | Let the column grow to fill available width. |
| `cellType` | string | `null` | Names the cell renderer for this column. Carried decisions → contract for **any** window, but **who honours it depends on the layout** — it is not generic to every grid. See the `cellType` section below for the three paths. |
| `multiField` | object | `null` | Compose this "host" grid field with sibling fields into **one** composite column: bold title + optional subtitle chip + optional authenticated media image. See below. |
| `dimensionsPanel` | boolean | `false` | Collect this field into the ONE synthetic `type: 'dimensionsPanel'` grid column instead of its own column — see below. Read regardless of the field's own `grid` value (typically `grid: false`, since the field renders inside the expand-row panel, not as a standalone column). |
| `visibleWhenCapability` | string | `null` | Names a capability key (e.g. `"showAccountingFields"`) from the `capabilities` map returned by the `GET /sws/neo/windowaccessmap` webhook (NEO pseudo-spec bridge — see `com.etendoerp.go/docs/neo-headless.md` §4.10). Opt-in — absent means always visible. Gates both the grid column and any `window.statusPills` entry referencing this field; the field is omitted entirely (not disabled) when the capability resolves `false`. Full mechanics (generator wiring, fail-closed behavior): `schema_forge_core`'s `docs/decisions-reference.md`. Shipped example: `posted` on `sales-invoice`/`purchase-invoice` — see those windows' `docs/generated-custom-windows/*.md` guides. |

#### Boolean badge rendering (`badge`, `badgeLabels`, `badgeVariants`)

For a **boolean** grid column, these three field-level properties render the cell as a colored pill/chip instead of the default plain Yes/No text. Shipped first on `posted` (`purchase-invoice`/`sales-invoice`, ETP-4520), then reused unchanged on `return-to-vendor-shipment`/`return-material-receipt` (ETP-4707 — the 3rd window on the pattern).

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `badge` | boolean | `false` | Renders the boolean column as a `Tag` pill instead of plain Yes/No text. Requires the field to resolve as a boolean at runtime (`type: "boolean"`, or an Etendo `'Y'`/`'N'`-serialized value). |
| `badgeLabels` | object | `null` | `{ "true": <label>, "false": <label> }`. Each `<label>` is either a plain string or a per-locale object `{ en_US, es_ES }`. Resolved at render time by `createBadgeLabelResolver` (`tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx`) against the active locale, falling back to `en_US` and then to the generic `statusComplete`/`statusInProcess` i18n keys when the object (or that side of it) is absent. |
| `badgeVariants` | object | `{ "true": "green", "false": "neutral" }` | `{ "true": <Tag variant>, "false": <Tag variant> }`. Any variant accepted by the shared `Tag` component (e.g. `"green"`, `"orange"`, `"blue"`, `"purple"`, `"red"`). |

**Filtering:** `resolveFilterMode()` (`tools/app-shell/src/lib/gridQuery.js`) auto-detects `type: "boolean"` + `badgeLabels` present and switches the column's Advanced Filter (funnel icon) to `booleanLabel` mode, offering the two `badgeLabels` strings themselves (not raw `true`/`false`) as the selectable filter values — no extra `decisions.json` flag needed beyond what is already set for the badge.

**Example — `posted` on `return-to-vendor-shipment`/`return-material-receipt` (ETP-4707):**

```json
"posted": {
  "visibility": "readOnly",
  "form": false,
  "grid": true,
  "gridOrder": 8,
  "type": "boolean",
  "badge": true,
  "visibleWhenCapability": "showAccountingFields",
  "badgeLabels": {
    "true":  { "en_US": "Posted",     "es_ES": "Contabilizado" },
    "false": { "en_US": "Not posted", "es_ES": "Sin contabilizar" }
  },
  "badgeVariants": { "true": "green", "false": "orange" }
}
```

Renders a green "Contabilizado" pill or an orange "Sin contabilizar" pill in the grid, and both strings become the two selectable options in that column's Advanced Filter. Pair with `window.statusPills` (see the Window Properties section above) to also surface the same true/false state as a pill on the detail-view form header, driven by the same field.

#### Composite list column (`multiField`)

Declares a single list column that stacks a bold **title**, an optional **subtitle**
chip, and an optional **media** image (e.g. a product photo) — the pattern used by
the Product list identity cell — without any custom JSX. The decorator sits on the
**host** grid field (whose value becomes the title); it absorbs the sibling fields it
references so they no longer render as their own columns. The absorbed fields' data is
still fetched (the list request sends no field projection — NEO Headless returns every
configured entity field), so the renderer, per-part sort, and advanced filter keep
working.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `subtitle` | string | `null` | Field name whose value renders as the subtitle chip under the title. Omit for a title-only column. |
| `media` | object | `null` | `{ field, kind: "neoImage", fallback: "box" }`. `field` is the row property holding the image id; `kind: "neoImage"` fetches `{neoBase}/image/{id}` with the auth token; `fallback: "box"` shows the package glyph when empty. Omit for no image. |
| `parts` | array | `[title, subtitle]` | Ordered segments that behave like real columns for the header per-part sort and the advanced-filter expansion. Each entry: `{ field, sortable?, filterable?, labels?, label? }`. `sortable`/`filterable` default `true`; set `false` to opt a segment out. `labels` (`{ en_US, es_ES }`) or `label` override the contract field's own label for that segment's header — use it to relabel a segment (e.g. show *Identifier* for `searchKey`) without renaming the underlying field. When `parts` is omitted, defaults to the title field plus the subtitle field (if any). The composite header joins the segment labels in order using `partSeparator`. |
| `partSeparator` | string | `" & "` | String rendered between part labels in the composite column header. |

The generator resolves each `parts[].field` (and the `subtitle`/`media.field`) against
the contract to fill the runtime `key`/`column`/`type`/`label(s)`, so references must be
real fields on the same entity. Fields used for sort (`sortable !== false`) must be
queryable (in the entity's searchable/supported filters). Both constraints are enforced
by pipeline validator rule **F18**.

**Example — a Product-style identity column on the `name` field:**

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
    ]
  }
}
```

This renders one column: the product name in bold, the search key as a chip below it,
and the product image (or a box fallback) to the left. `searchKey` and `image` no longer
appear as standalone columns, but sorting/filtering by name or search key still works via
the two header segments. Part order drives the composite header — here it reads
*"Identifier & Name"* (*"Identificador & Nombre"*), with each segment relabeled via its
own `labels` rather than the contract field's default (`Search Key` / `Name`).

#### Accounting dimensions panel (`dimensionsPanel`)

Fields flagged `dimensionsPanel: true` (any number, on any inline-editable-layout entity) are collected by `generateTableComponent` into ONE synthetic column instead of individual grid columns:

```js
{
  key: 'dimensions',
  type: 'dimensionsPanel',
  label: 'Accounting dimensions',
  labels: { en_US: 'Accounting dimensions', es_ES: 'Dimensiones contables' },
  dimensionFields: [
    { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', reference: 'Project', inputMode: 'search' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'Costcenter', inputMode: 'selector' },
  ],
}
```

`InlineLinesPanel` never renders this column type in the grid itself (ETP-4610 — no header cell, no width, no per-row badges). Instead it drives two things: a leading expand-chevron column (unchanged since ETP-4529) and an adaptive "Add dimensions"/"Edit dimensions" entry in the row's hover-action strip, next to the Edit/Delete icons, shown only when at least one `dimensionFields` candidate is currently visible. Clicking either the chevron or the hover action expands the same full-width sub-row of selectors below the data row — see `docs/ui-customization.md` §14b for the full UX and the shared `DimensionsPanel.jsx` building blocks (still used for the expanded `DimensionGrid`; the collapsed `DimSummary` badge/trigger is no longer used by `InlineLinesPanel`).

**Rules:**

- Emitted **only** when at least one field on the entity has `dimensionsPanel: true`; otherwise the entity's `columns` array is byte-for-byte the same as before this feature existed (fully additive).
- Always emitted **last** in the `columns` array — `gridOrder` does not apply to it (it only reorders normal grid columns).
- Each `dimensionFields` entry reuses the same per-field extraction as a normal grid column (`mapFieldType` for `type`, static baked `label`, FK `reference`/`inputMode`, `required`/`lookup`/`popup`) — trimmed to what `DimensionsPanel.jsx` (`DimSummary`/`DimensionGrid`), `SelectorInput`, and `selectorCatalog.js` actually read.
- The panel's own `label`/`labels` are baked by the generator (not translated via `useUI()` — the `columns` array is module-scope code, so it cannot call a hook); `emptyLabel` is left unset so the empty-state trigger falls back to the generic `dimensionsPanelEmpty` i18n key at render time.
- Only affects the **grid/table** rendering. A field flagged `dimensionsPanel: true` still appears as its own field in the lines entity's `addLineFields` (the add-new-row form) if `form: true` — the add-row flow is a separate, flat-form UX not covered by this flag.
- A field with `grid: true` AND `dimensionsPanel: true` is collected into the panel only — it is excluded from `gridFieldsRaw` regardless of its own `grid` value.

**`dimensionsPanelFieldKeys` — per-window dimension-macro trust (ETP-4610):**

`generatePageComponent` (`schema_forge_core`'s `generate-frontend.js`) also collects the same `dimensionsPanel: true` field keys for the lines entity and forwards them to the generated `<DetailView dimensionsPanelFieldKeys={[...]} />` prop — omitted entirely when the entity has none, so this is purely additive. `DetailView.jsx` uses it to widen, **scoped to that one window instance**, which keys its `lineHiddenColumns` computation (and the expanded-row `DetailForm`'s `displayLogic`) is willing to trust as config-driven "dimension macro" visibility: a key is trusted if it's in the component's small global `DIMENSION_MACRO_KEYS` allowlist (`project`/`costcenter`/`costCenter`/`businessPartner`) **or** it's listed in this prop.

This exists because `product` cannot be added to the global allowlist: in `sales-invoice`/`purchase-invoice` it's a real per-line field with its own record-dependent AD `displayLogic` (`@Financial_Invoice_Line@='N'`), and trusting it globally would reintroduce the ETP-4530 regression (product/listPrice/grossAmount silently vanishing from those windows' grids). `simple-g-l-journal`, however, genuinely flags `product` `dimensionsPanel: true` as an `@ACCT_DIMENSION_DISPLAY@` accounting dimension — so its generated page passes `dimensionsPanelFieldKeys={['businessPartner', 'product', 'project', 'costCenter']}`, and only *that* window instance trusts `product`'s config-hide signal. Windows that never flag any lines field `dimensionsPanel: true` get no prop at all and see no behavior change. See `DetailView.lineHiddenColumns.vitest.jsx` for both the fix proof (simple-g-l-journal) and the non-regression proof (sales-invoice-shaped instances).

**Real example** (`sales-invoice`, `purchase-invoice`, `goods-shipment`, `goods-receipt` — `lines.project`/`lines.costcenter`):

```json
"project": {
  "visibility": "editable",
  "grid": false,
  "dimensionsPanel": true
},
"costcenter": {
  "visibility": "editable",
  "grid": false,
  "dimensionsPanel": true
}
```

#### Status column rendering (`columnType` and `enumValues`)

Two field-level props control how the grid column renders raw values as labeled badges — without touching the underlying Etendo AD column reference.

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `columnType` | string | Inferred | Forces the grid column renderer. `"status"` renders the cell as a status badge. `"signedDelta"` renders a signed numeric delta (see below). When absent, the renderer is inferred from the field name/type via `mapFieldType` in `generate-frontend.js`. |
| `enumValues` | array | `null` | Maps raw cell values to display labels. Each entry: `{ "value": "<raw>", "name": "<i18nKeyOrLabel>" }`. The generator emits these as `enumLabels: { '<raw>': '<name>' }` on the table column descriptor. |

**How `enumValues` is resolved at runtime:**

1. `statusLabel()` in `tools/app-shell/src/lib/statusBadge.js` looks up `name` in `dictionary.genericLabels[name]`, then via the active `translate` function, and falls back to rendering `name` literally.
2. `DistinctEnumPicker` (in `AdvancedFilterBuilder.jsx`) reads `enumLabels` to populate the advanced/conditional filter value dropdown — so the filter shows translated labels instead of raw values.
3. `ListFilterBar.jsx` uses the same `enumLabels` to drive the status quick-filter pills above the list.

**"All statuses" dropdown label resolution (ETP-4696):** `labelForStatus` in `ListFilterBar.jsx` — the function that renders each option text in the "All statuses" quick-filter dropdown — delegates 100% to `statusLabel(code, dictionary, ui, statusCol?.enumLabels)`, the exact same resolution function `DataTable.cellRenderers.jsx` uses for the grid cell badge (also used by `DocumentStatusPill.jsx`, `CloneOrderModal.jsx`, `ReportDrawer.jsx`, `useInvoicePreview.js`). It previously had its own local lookup that bypassed `statusLabel()`, so codes without a fortuitous translation (`PWNC`, `RDNC`, `ETGO_CI`, `RPVOID`) rendered in raw/English form in the dropdown while the grid cell for the same row translated correctly. There is no second translation mechanism to maintain: extending the catalog — a new `enumValues` entry in `decisions.json`, a `genericLabels` key in `{es_ES,en_US}.json`, or an `AD_Ref_List_Trl` row — is picked up by `statusLabel()` once, and both the grid cell and the dropdown reflect it automatically.

**Key rules:**

- This is a **Schema Forge display mapping only** — the Etendo AD column reference is never modified.
- The mapping is **per-window**: the same raw value (e.g. `false`) can map to `statusDraft` in one window and a different key (e.g. `statusIncomplete`) in another. The shared `statusLabel` function stays generic.
- `name` should be an existing key in `genericLabels` (in `packages/app-shell-core/src/locales/{es_ES,en_US}.json`) so both locales resolve correctly. If you use a literal string it renders as-is in all locales.
- If you introduce a **new** key, add it to **both** `en_US.json` and `es_ES.json` (per `docs/i18n-guide.md`).
- If the raw schema already supplies `enumValues` (from an AD list reference), `decisions.json` `enumValues` **overrides** them.

**Example — `goods-movements` `processed` field** (an Etendo `YesNo` boolean the API serializes as `true`/`false`):

```json
"processed": {
  "visibility": "readOnly",
  "label": "Status",
  "grid": true,
  "form": false,
  "columnType": "status",
  "enumValues": [
    { "value": "true",  "name": "statusProcessed" },
    { "value": "false", "name": "statusDraft" }
  ],
  "gridOrder": 4
}
```

This renders the badge as "Processed"/"Draft" (EN) and "Procesado"/"Borrador" (ES), reusing the existing `statusProcessed`/`statusDraft` keys from `genericLabels`. The advanced filter and the status quick-filter pill also show these labels instead of raw `true`/`false`.

#### Signed delta column rendering (`columnType: "signedDelta"`)

Renders a numeric delta with sign + semantic color, for lines-grid columns that show a
computed difference (e.g. physical-inventory's `etgoQtydiff` "Difference" column between
counted and book quantity).

| Value | Text | Color |
|-------|------|-------|
| `< 0` | `-N` | `#D50B3E` (negative) |
| `= 0` | `±0` (only exactly zero) | `#121217` (neutral) |
| `> 0` | `+N` | `#1E874C` (positive) |

Implementation: `formatSignedDelta()` in `tools/app-shell/src/lib/formatSigned.js` is the
single source of truth for the text/tone computation — both the inline lines grid
(`InlineLinesPanel.jsx` `ReadCell`) and the main `DataTable` (`DataTable.cellRenderers.jsx`
`renderSignedDeltaCell` via `CELL_RENDERERS.signedDelta`) call it, so the two grids render
identically. It deliberately does **not** apply thousands grouping — sibling quantity
columns in the same lines grid (e.g. `bookQuantity`, `quantityCount`) render their raw
value with no `Intl` formatting, and `signedDelta` stays consistent with them rather than
introducing a different number format for one column.

**Example — `physical-inventory` `etgoQtydiff` field:**

```json
"etgoQtydiff": {
  "visibility": "readOnly",
  "label": "Difference",
  "columnType": "signedDelta",
  "grid": true,
  "gridOrder": 5,
  "grow": true,
  "columnWidth": 192,
  "readOnlyLogic": null
}
```

#### Cell renderers (`cellType`) — three paths, not one

`cellType` always survives decisions → `contract.json`, but **which grids act on it
differs**, so check which path your window is on before declaring one:

| Path | Who honours it | What you can declare |
|---|---|---|
| **`layoutType: "list-modal"`** | `buildListModalColumns` emits it into the column descriptor; `ListModalWindow` renders it through the registry in `tools/app-shell/src/components/contract-ui/listModalCells.jsx` | the 7 values in the table below |
| **The standard generated table** | The generator recognises only three hardcoded, window-specific values — `depreciationProgress`, `taxRate`, `taxScope` — and inlines a `render:` for them. `DataTable` itself never reads `cellType`. | nothing new without a `schema_forge_core` change |
| **A `customComponents.headerTable` slot** | The slot builds its own column descriptors, so it can read `cellType` off the contract and resolve it against a window-scoped registry | any name that registry defines |

The third path is how `financial-account`'s accounts list works: `cellType` names
(`accountName`, `accountType`, `accountBalance`, `reconcilePill`) resolve through
`components/financial-accounts/accountCellTypes.jsx`. Use it when the cells are
window-specific enough that they do not belong in a shared registry, and note what it
buys: the **binding** (which column uses which renderer) becomes declarative, the
renderers stay React.

Nothing validates `cellType` — no pipeline-validator rule, no whitelist. An unknown
value degrades to the generic type-based renderer rather than failing.

The `list-modal` renderers below are generic and backend-agnostic — every cell reads
only from the row payload and the column descriptor. When no `cellType` is set, the
cell falls back to a plain value (with enum-label / FK identifier resolution).

| `cellType` | Extra keys | Renders |
|------------|-----------|---------|
| `priorityPill` | — | A bordered neutral pill with the numeric value. |
| `nameWithSubline` | `subField` (field name whose `$_identifier` feeds the sub-line), `subPrefix` (default `"→ "`) | Bold name plus a muted sub-line sourced from another field. |
| `conditionChip` | `kindField` (discriminator field, e.g. `C`/`S`/`R`), `patternField` (literal-text field), `kindLabels` (map of kind value → i18n key) | A chip with derived text `<kindLabel>: "<pattern>"`. |
| `typePill` | `tones` (map of enum value → tone: `neutral`/`blue`/`green`/`amber`/`red`) | A rounded-full pill showing the enum label, optionally toned. |
| `percent` | — | The numeric value rendered as `N%`. |
| `boldText` | — | The value in semibold (e.g. a count column). |
| `toggle` | — | An inline `Switch` that `PATCH`es `{entity}/{id}` with `{ [field]: checked }`. Equivalent to `inlineToggle`. |

### Reference & Input Mode (FK fields)

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `reference` | string \| null | Auto from targetTable | Catalog name for FK lookup (e.g., `"BusinessPartner"`). Set `null` to omit. |
| `inputMode` | string \| null | Auto from reference type | `"selector"` (dropdown), `"search"` (searchable), `"dependent"` (cascading). Set `null` to omit. |
| `searchSelect` | boolean | `false` | **Legacy/ignored (post-ETP-4600).** Since ETP-4600, the searchable combobox (`CreatableSearchSelect`) is the DEFAULT rendering for every `inputMode: "selector"` FK field AND every `type: 'select'` fixed-list enum with options — the plain pick-only dropdown (`SelectorInput`) is only used for the `DocumentType` reference carve-out (which keeps its own `optionTranslator`). Setting `searchSelect: true` is now a no-op; leaving it out (or removing it) does not change rendering. **Not** the same as `searchable` (which enables a field as a list-API filter parameter). |
| `allowCreate` | boolean | `false` | Opt-in (future): on a selector/enum field, surface the inline "+ create" action in the combobox. Currently OFF for all windows — the flag flows through the pipeline so a field can wire `createLabel`/`onCreateRequest` later without a generator change. |
| `clearable` | boolean | `true` (header) / `!required` (line grid) | Controls the chip's clear (`×`) button. On the header's unified `CreatableSearchSelect`, defaults to `true` (shown) for every selector/enum field, including required ones — the header form has an explicit Save step, so a required field cleared to empty is caught before it ever reaches the backend. On the **line grid**'s `InlineSearchCombo` (`artifacts/{w}/generated/.../DataTable.jsx`, `InlineLinesPanel.jsx`), every field edit auto-saves immediately with no review step, so the `×` defaults to **hidden** whenever `field.required === true` (e.g. Sales Order line's `tax`) — clearing it there always fails against a NOT NULL column and the grid can't turn the resulting generic backend error into a helpful field-level message. Set `"clearable": false` to force-hide it on a specific field regardless of `required`, or `"clearable": true` to force-show it (opt back into the risk) on a required field that has a safe fallback (e.g. a server-side default kicks in on save). |
| `dependsOn` | object \| null | `null` | Parent field dependency for cascading selectors. |

**`DocumentType` carve-out — saved-value translation is window-scoped (ETP-4737):** the `optionTranslator`
built for `reference: 'DocumentType'` fields (renames/hides options — reversed/credit/return/rectificativa
tabs) is generic to every window, but the extra step that also translates the already-saved/selected value
through that same translator (so a saved record shows the same label the options list would show) is
gated to `sales-invoice` and `purchase-invoice` ONLY, via a `windowName` prop threaded from each window's
`index.jsx` → `HeaderPage` → `DetailView` → `EntityForm` (see `SAVED_VALUE_TRANSLATION_WINDOWS` in
`EntityForm.jsx`). `payment-out` (`documentType`) and `purchase-order` (`transactionDocument`) keep showing
the raw AD identifier for their saved value — their real doc-type vocabulary ("AP Payment", "Credit Order",
etc.) doesn't match the translator's invoice-specific keywords and would otherwise mislabel the field (e.g.
falling back to "Factura"). This is a hardcoded window-name gate inside a shared component — a deliberate,
narrow exception (same class as the pre-existing `DocumentType` carve-out itself), not a decisions.json
option; there is nothing to configure per-window here.

**dependsOn format:**
```json
{
  "field": "businessPartner",
  "filterKey": "C_BPartner_ID"
}
```

Setting `dependsOn` automatically sets `inputMode` to `"dependent"`.

### Lookup Drawer Override (`lookupDrawer`, `lookupTitle`, `onSelectMappings`)

For a `lookup: true` field (the inline add-row / inline-edit product picker), these
properties swap in a different picker component and control what happens when a row is
selected.

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `lookup` | boolean | `false` | Enables the drawer-style picker for this field (instead of a plain search input). |
| `lookupDrawer` | string \| null | `null` (→ `"default"`) | Key into `LOOKUP_DRAWERS` (`tools/app-shell/src/components/contract-ui/lookupDrawers.js`). `"default"` is the plain `ProductSearchDrawer`. `"product-stock"` is the shared, window-agnostic product+stock picker (groups by product, warehouse-filter pills, expand/collapse per-locator rows) — used by any window whose product field needs to resolve a storage bin/warehouse on selection. |
| `lookupTitle` | string \| null | Field label | Title shown in the drawer header. |
| `onSelectMappings` | array \| null | `null` | Maps data from the selected raw selector row onto other fields in the same line. Each entry: `{ "from": "<path into the row, e.g. _aux._LOC>", "to": "<sibling field key>", "labelFrom": ["<row key>", ...] }`. `labelFrom` is tried in order — the first non-empty value becomes the label shown for `to`. Applied by `applyOnSelectMappings` in `DataTable.jsx`, caller-side; the drawer itself never writes to sibling fields. |

```json
"product": {
  "grid": true,
  "lookup": true,
  "lookupDrawer": "product-stock",
  "lookupTitle": "Product",
  "onSelectMappings": [
    { "from": "_aux._LOC", "to": "storageBin", "labelFrom": ["warehouse", "warehouse$_identifier", "storageBin"] }
  ]
}
```

### Custom Renderer (`customRenderer`)

Swap in a custom React component as the input widget for a single field inside `EntityForm`.
The component receives `{ value, onChange, record, readOnly }` and is responsible for its
own internal layout. `onChange` must be called with the new **full** value string (e.g. an
8-char account code, not just the suffix).

```json
"searchKey": {
  "visibility": "editable",
  "form": true,
  "customRenderer": "AccountCodeField"
}
```

The generator emits an import statement for the named component (resolved by
`resolveCustomImport`, which checks `artifacts/{window}/custom/` first, then
`tools/app-shell/src/windows/custom/{window}/`), and adds `customRenderer: AccountCodeField`
to the field descriptor in the fields array. `EntityForm` renders the component
instead of the default input when it detects this property.

**Rules:**
- The component file must exist in `artifacts/{window}/custom/<ComponentName>.jsx` or in
  the app-shell custom-windows directory.
- Component must accept `{ value, onChange, record, readOnly }` props.
- `onChange(newValue)` must always fire with the full field value (no partial writes).
- If the component needs i18n, use `useUI()` from `@/i18n` and add keys to **both**
  `en_US.json` and `es_ES.json` under `genericLabels`.
- This is a form-only feature: the grid column always uses the standard cell renderer.

### Input Prefix (`inputPrefix`)

Renders a fixed, non-editable chip immediately before a text input inside `EntityForm` —
e.g. a `"https://"` scheme for a website field whose stored column value is only the part
after the scheme. Purely visual + validation-aware; the chip's text is never part of the
value the field reads from or writes to `data`.

```json
"etgoWeb": {
  "visibility": "editable",
  "form": true,
  "inputPrefix": "https://"
}
```

The generator emits `inputPrefix: 'https://'` verbatim into the field descriptor in the
generated fields array. `EntityForm`'s `renderInputField` wraps the input in a chip +
input row (same visual pattern as `OrganizationPage.jsx`'s hand-built "Sitio web" field)
whenever `f.inputPrefix` is present; fields without it render exactly as before.

**Validation:** `recipientEdits.js`'s format validators (`getEmailFieldError`,
`getWebsiteFieldError`, `getPhoneFieldError` — wired into `useEntity.js`'s save gate)
reconstruct the full value as `field.inputPrefix + value` before checking, so a prefixed
field validates identically to an unprefixed one storing its full value directly. This is
generic — not website-specific — so an email or phone field could adopt a fixed prefix
later with zero validator code changes.

**Rules:**
- Only meaningful on text-type fields rendered via the default `<Input>`/`<DeferredInput>`
  path in `renderInputField` — declaring it on a select/FK/checkbox field has no effect.
- The prefix text itself is a literal string, not an i18n key — it is not expected to
  vary by locale (e.g. `"https://"` is the same everywhere). If a locale-varying prefix
  is ever needed, that is a new, separate feature, not a use of this property.
- Do not confuse with `subPrefix` (`generate-frontend.js`/`listModalCells.jsx`) — an
  unrelated concept for composite **grid-cell** rendering, not a form input.

**Known limitation — legacy data:** the value shown in the input is always the raw stored
column value, verbatim. If a field already has existing records whose stored value
includes the scheme (e.g. `etgoWeb = "https://hola.com"` from before `inputPrefix` was
enabled), the chip renders on top of that, showing the scheme twice (`https:// | https://hola.com`)
until the underlying data is cleaned up — `EntityForm` does not strip a duplicated prefix
from the displayed value. Saving without touching the field persists the value unchanged
(no data corruption), but the visual duplication remains until fixed. Prefer enabling
`inputPrefix` on new fields, or pair it with a data migration when adding it to a field
that already has values stored with the scheme included.

### Logic & Behavior

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `name` | string | Raw field name | Override field's public API name. |
| `required` | boolean | From AD mandatory | Force field as required. |
| `min` | number | `undefined` | Minimum allowed value for numeric fields. In **grid / inline rows** (DataTable) the UI autocorrects values below this limit to `min` on blur. In **detail forms** (EntityForm) a value below `min` raises a `fieldMinValueError` toast on blur and blocks the save (via `getNumericFieldViolation` in `useEntity`). The toast interpolates the declared threshold — "Value must be at least `{min}`" — so a `0` on a `min: 1` field is reported accurately (never as "negative"). Travels through the full pipeline (`decisions.json` → `resolve-curated` → contract → generated FieldDefs). |
| `max` | number | `undefined` | Maximum allowed value for numeric fields. On blur the grid UI autocorrects values above this limit to `max`. Travels through the full pipeline (`decisions.json` → contract → generated FieldDefs). Example: `"max": 100` on a discount (%) field prevents values above 100. |
| `integer` | boolean | `undefined` (decimals allowed) | When `true`, the numeric field rejects decimal values. In detail forms a decimal raises a `fieldIntegerError` toast on blur and blocks the save. **Default (flag absent or `false`) accepts decimals** — omit it for the common case; only set `integer: true` for whole-number fields (e.g. Assets `usableLifeMonths` / `usableLifeYears`, declared `"min": 1, "integer": true`). Fully backwards-compatible: a field that declares neither `min` nor `integer` performs no numeric validation. Travels through the full pipeline (`decisions.json` → `resolve-curated` → contract → generated FieldDefs). |
| `readOnlyLogic` | string \| null | `null` | Expression for conditional read-only. Set `null` to omit. |
| `displayLogic` | string \| null | `null` | Expression for conditional visibility. Set `null` to omit. |
| `businessCritical` | boolean | `false` | Advisory-only metadata flag. When `true`, marks the field as business-critical data. This flag does **not** change any functional behavior (validation, read-only logic, visibility, etc.). It travels through the pipeline (`decisions.json` → `resolve-curated` → `contract.json` → `push-to-neo` → `ETGO_SF_FIELD.ISBUSINESSCRITICAL`) so that downstream consumers (e.g., AI agents reading `neo_schema`) know they must confirm with the user before creating or updating records that include this field. |
| `agentPrompt` | string | `null` | Per-field guidance for AI agents. Carried into the curated field and persisted to `ETGO_SF_FIELD.AGENT_PROMPT`, from where `neo_schema` returns it inside each field object. Empty or whitespace-only values clear the persisted prompt and are omitted from the MCP response. |

> **MCP-oriented field config:** `businessCritical`, `agentPrompt`, `visibility`, a per-field `defaultValue`, and an entity's `Java_Qualifier` are the per-field knobs the NEO Headless **MCP** surfaces to AI agents (via `neo_schema` / `neo_defaults`). They are decided **only here in `decisions.json`** — the MCP/NEO Java reads and surfaces them, never decides them. The flag→`ETGO_SF_FIELD` column→surfacing map and the `make regen … PUSH_TO_NEO=1` → `./gradlew export.database` fix recipe are in `docs/agentic-validation/mcp-field-flags-pipeline.md`. A request to change one of these is upstream-config, not an MCP code change.

### Explicit null

Setting a property to `null` removes it from the curated output and contracts:
```json
{
  "reference": null,
  "inputMode": null,
  "readOnlyLogic": null
}
```

## Discard Patterns (`discardPatterns`)

Array of glob patterns to auto-exclude fields. Supports:

| Pattern | Match | Example |
|---------|-------|---------|
| `"prefix*"` | Starts with | `"EM_*"` matches `EM_Aprm_AddPayment` |
| `"*suffix"` | Ends with | `"*_old"` matches `price_old` |
| `"exact"` | Exact match | `"someField"` matches only `someField` |

Case-insensitive. **Explicit field `visibility` overrides discard patterns** (human decision wins).

```json
{
  "discardPatterns": ["EM_*"],
  "entities": {
    "header": {
      "fields": {
        "emSomeImportantField": { "visibility": "editable" }
      }
    }
  }
}
```

## Rules (`rules.{ruleName}.*`)

Rule keys use **extended names** (including trigger column suffix for multi-trigger rules).

| Property | Type | Values | Purpose |
|----------|------|--------|---------|
| `type` | string | `"callout"`, `"displayLogic"`, `"readOnlyLogic"`, `"validation"`, `"process"`, `"eventHandler"` | Rule category. |
| `entity` | string | Entity name | Which entity this rule applies to. |
| `decision` | string | `"Keep"`, `"Omit"`, `"Simplify"`, `"Replace"`, `"pending"` | Whether to implement this rule. |
| `description` | string | — | What the rule does. |
| `impactIfOmitted` | string | — | Business impact of not implementing. |
| `translated` | string | — | JavaScript translation of Etendo logic expression. |

## Common Patterns

### Enable draft mode for a transactional window
```json
{
  "entities": {
    "header": {
      "draftMode": { "enabled": true, "label": "Complete" },
      "fields": {
        "documentAction": { "visibility": "editable" }
      }
    }
  }
}
```

### Make a field searchable in the grid
```json
{
  "entities": {
    "header": {
      "fields": {
        "businessPartner": { "grid": true, "searchable": true }
      }
    }
  }
}
```

### Cascading dependent selector
```json
{
  "entities": {
    "header": {
      "fields": {
        "partnerAddress": {
          "reference": "BusinessPartnerLocation",
          "dependsOn": { "field": "businessPartner", "filterKey": "C_BPartner_ID" }
        }
      }
    }
  }
}
```

### Exclude an entire entity
```json
{
  "entities": {
    "legacyTab": { "exclude": true }
  }
}
```

### Custom NeoHandler for an entity
```json
{
  "entities": {
    "accounting": { "javaQualifier": "factAcctHandler" }
  }
}
```

## Key Invariants

1. **Entity keys = tabName (v2+)** — Use simplified names from raw schema's `tabName`, not table names.
2. **Field names are stable** — The raw field `name` is the decision key, unchanged across extractions.
3. **Explicit `null` = omit** — Different from absent. `"readOnlyLogic": null` removes the property from contracts.
4. **Visibility priority:** `discardPatterns` → raw extraction → `field.visibility` (human decision wins).
5. **Reference auto-derived** — FK catalog name stripped from targetTable if not explicitly set.
6. **draftMode is entity-level** — Typically on the header/primary entity only.
7. **Rules are declarative** — Metadata only; actual logic lives in Etendo AD tables.

## Pipeline Flow

```
decisions.json
    │
    ├─→ resolve-curated.js    (merges raw + decisions → curated schema)
    ├─→ generate-contract.js  (visibility, reference, inputMode, draftMode → contracts)
    ├─→ generate-frontend.js  (grid, form, section, name, dependsOn → React components)
    └─→ push-to-neo.js        (visibility → isIncluded/isReadOnly in NEO DB)
```
