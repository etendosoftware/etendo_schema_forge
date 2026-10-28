# Window Template Extensibility

Windows can opt into alternative layouts by setting `layoutType` in `schema-curated.json` (`window` object).

## Layout Types

| `layoutType` | Behavior |
|---|---|
| `"default"` (or absent) | Standard ListView/DetailView — no change to existing behavior |
| `"kanban"` | Generated page uses `KanbanBoard` from `@/components/contract-ui` |
| `"calendar"` | Generated page uses `CalendarView` from `@/components/contract-ui` |
| `"list-modal"` | Generated page uses `ListModalWindow` from `@/components/contract-ui` — a grid (list) + create/edit MODAL, with NO drill-in detail view |
| `"custom"` | Pipeline generates a scaffold in `windows/custom/` — developer builds on top |

## `list-modal`

For catalog / master-data windows that are a **grid + create/edit modal** with **no drill-in detail view** (e.g. Match Rule, a future product catalog). Records are created/edited in a modal; the list supports an inline `toggle` column and inline-editable cells.

The generated page is **self-contained**: the generator emits only `<Header>Page.jsx`, `index.jsx` and `mockCatalogs.js` — no per-entity `Table`/`Form` files and no `mockData.js`. Everything (grid columns, modal fields grouped by section, the NEO CRUD endpoint, the i18n title/banner) is read from the contract by the generic `ListModalWindow` component, so the same template serves any window that opts in.

**Column sorting (ETP-4921).** Every column header is clickable (none → asc → desc → none) and
the toolbar carries the same "Ordenar por" popover the standard lists have
(`contract-ui/ListSortPopover.jsx`). It is **client-side**: `ListModalWindow` fetches the whole
list in one `useNeoResource` request and every filter it offers already runs in memory, so
re-fetching to reorder buys nothing — see `lib/clientSort.js` for the shared comparator. The
resting order is whatever the window declares (`templateConfig.autoPriorityField` ascending, e.g.
match rules evaluated in priority order), and the third click returns to it. Nothing to declare
per window: this comes for free with the layout.

A 44px drag-handle column used to lead every row. It was visual only — its own comment read
"drag-to-reorder deferred" — so it advertised a reordering that does not exist, and it is gone.

CRUD follows the generic NEO Headless **W** convention (no per-window Java unless custom validation is needed):

```
list   GET    {baseUrl}/{entity}
create POST   {baseUrl}/{entity}
update PUT    {baseUrl}/{entity}/{id}
patch  PATCH  {baseUrl}/{entity}/{id}   (inline toggle / inline edit)
delete DELETE {baseUrl}/{entity}/{id}
```

### decisions.json

```json
"window": {
  "layoutType": "list-modal",
  "templateConfig": {
    "titleKey": "matchRuleNewTitle",          // i18n key for the create-modal title
    "editTitleKey": "matchRuleEditTitle",      // i18n key for the edit-modal title
    "bannerKey": "matchRuleBanner",            // optional info banner above the grid
    "searchPlaceholderKey": "matchRuleSearchPlaceholder",
    "newLabelKey": "matchRuleNew",             // "+ New" button label
    "autoPriorityField": "priority",           // field auto-seeded on create…
    "autoPriorityStep": 10,                     // …as max(field) + step (computed in the frontend, no backend endpoint)
    "sections": [                               // ordered modal sections (label is an i18n key, optional)
      { "key": "general" },
      { "key": "dimensions", "label": "matchRuleSectionDimensions" }
    ]
  }
}
```

All `templateConfig` strings are **i18n keys** (added to both `en_US.json` and `es_ES.json`), never raw user text.

### Compact look (ETP-5978)

Small catalogs (a payment term is a name, a number of days and two flags) waste most of the
default wide, multi-column modal. These opt-in keys switch the window to the compact Figma look;
each one defaults to the historical match-rule look, so a window that declares none renders
exactly as before.

| Key | Values | Effect |
|-----|--------|--------|
| `modalVariant` | `"default"` (absent) / `"compact"` | `compact`: a 400px popup (`ListModalCompactDialog.jsx`) — title, the fields in **one column** in section order with **no section headings** (`span` ignored), consecutive checkboxes stacked as a group, footer with an outline **Cancelar** pill (closes) and a primary **Guardar** pill with a save icon, round X close top-right. The create pill also reads **Guardar** unless `submitLabelKey` says otherwise. `footerToggleField` and `sectionGrid` have no effect in compact (the toggle field renders in the body like any other). |
| `hideBackButton` | `true` / `false` | Drops the toolbar back ("Cancelar") button. |
| `hideSearch` | `true` / `false` | Drops the local search box (the app's global search sits in the top bar). The page's `filters` (the `searchable` columns) only feed that box, so they then have no effect in the UI; the advanced filter does not depend on them and still offers every column. |
| `newButtonVariant` | `"default"` (absent) / `"primary"` | `primary`: the "+ New" button uses the blue primary button of the generated lists instead of the ink button. |
| `rowClickEdit` | `true` / `false` | Clicking a row opens its edit modal (the hover pencil keeps working). Clicks on the selection checkbox, an inline toggle or the hover actions do not open it. Never for a read-only role. |
| `listVariant` | `"default"` (absent) / `"compact"` | `compact`: the Figma list density — 40px rows (cells vertically centred, no vertical padding), a 32px checkbox column with 8px left padding, header text tracking −0.005em, and white fill + xs shadow on the toolbar outline buttons (Filtros, sort, refresh), Filtros with 12px / 16px side padding and an 8px icon gap. |

**Fixed column widths.** A grid column declares `columnWidth` (px, emitted as `minWidth`) and
optionally `columnMaxWidth` (px, emitted as `maxWidth`) in `decisions.json`. Both measure the
cell frame, its 12px + 12px padding included. The column starts at `columnWidth`; a longer value
widens it up to `columnMaxWidth`, past which it is cut with an ellipsis. As soon as one column declares a width, the grid adds an empty spacer column before the
row actions: the free width stays empty on the right, no data column stretches, and the hover
edit / delete sit at the far right edge. Declare a width on every column for a fully fixed grid
(`grow` is not read by list-modal). A grid that declares no width lays out exactly as before.

**Advanced filter (Filtros).** It offers every entity column — the grid columns plus the modal
fields. A boolean / checkbox / toggle column is a `Sí`/`No` picker (worded by its `badgeLabels`,
matched against `true`/`'Y'` alike), except when a `toolbarFilters` entry already filters that
field (match-rule's `active`, behind "Todas las reglas"), so one field never gets two controls.
Since ETP-5978; before, every boolean column was dropped.

**Saving the modal.** The submit button (both variants) stays disabled while a required field is
empty; `handleSave` re-checks the required fields anyway (`requiredFieldsMissing`, a backstop).
Before any request it then checks each field's numeric rules (`min`, `integer` — the same
`getNumericFieldError` the detail form uses, via `firstFieldViolation` in `listModalSave.js`); a
violation is shown once, in the modal's error box (the field's blur toast is withdrawn), nothing
is sent, and the box clears as soon as a field is edited. On an integer `stepper` field this gate
is a backstop, since the input already refuses the offending keystroke. A backend refusal is read with the shared `extractErrorMessage`, so a keyed NEO
message (`messageKeys` / `messageParams`, e.g. `ETGO_PaymentTermDaysInvalid`) is shown in the
UI language — in the error box for a create / edit, as a toast for an inline toggle or a row
delete. A `stepper` field with `integer: true` refuses any typed or pasted non-digit (a decimal separator,
a letter, a `%`, a minus sign when `min` ≥ 0) and digits beyond the length of `max`, and says why
under the field.

**Keyboard.** With `rowClickEdit`, each row is focusable; Enter or Space on the focused row opens
it (not when the focus is on its checkbox, toggle or hover actions).

Toolbar order is fixed for every list-modal window: left — back (unless hidden), toolbar
dropdown filters, **Filtros**; right — search (unless hidden), sort, refresh, "+ New". This is the
same sort → refresh order every generated list uses.

The compact modal pairs with the field-level `stepper: true` flag (an integer input with − / +
buttons, bounded by `min` / `max`), documented in `docs/decisions-reference.md` → *Logic &
Behavior*.

### Deep link: `/<window>/:recordId`

The generic `:windowName/:recordId` route hands `recordId` to the generated page, which passes it
to `ListModalWindow`. Since ETP-5978 a list-modal window renders the **list with that record's edit
modal open** (any variant). The record is taken from the loaded list; one the list does not carry
is read with `GET {entity}/{id}`. A record the server does not return shows the
`recordNotFoundTitle` toast. Closing the modal (or the not-found case) replaces the URL with
`/<window>`, so a reload does not reopen it — note the route change remounts the window and
re-reads the list. A read-only role gets the plain list. Opening a record from the list does not
change the URL.

### Field-level flags

The list-modal grid and modal reuse the standard field flags from `decisions.json → entities.<e>.fields`:

| Flag | Effect |
|------|--------|
| `grid: true` + `gridOrder: N` | include the field as a grid column at position N |
| `inlineToggle: true` | render a boolean column as a `Switch` that `PATCH`es `{entity}/{id}` on change |
| `inlineEdit: true` | mark a column as inline-editable (carried in the contract; editing also available via the modal) |
| `badge: true` | render a boolean column as a `Sí`/`No` badge (`badgeLabels` / `badgeVariants`, default green / neutral; green / neutral / red / yellow / blue draw the `StatusTag` tokens — Sí `#EEFBF4`/`#17663A`); a boolean column without it reads `Sí`/`No` as text |
| `columnWidth` / `columnMaxWidth` | fixed column width / growth cap in px (see *Fixed column widths* above) |
| `form: true` + `section: '<key>'` + `seq: N` | include the field in the modal under the given section, ordered by `seq` |
| `required: true` | required in the modal (client-side guard before save) |
| `inputMode: 'selector'` | FK field rendered as a dropdown selector (EntityForm builds the `/selectors/<column>` URL automatically) |
| `stepper: true` + `min` / `max` | integer field rendered with − / + buttons inside the input, bounded by `min` / `max` (ETP-5978). With `integer: true` any non-digit — a decimal separator, a letter, a `%`, a space, a minus sign (when `min` ≥ 0) — or more digits than `max` has (365 → 3) is refused as typed or pasted, and the reason appears under the field in red (linked to the input with `aria-describedby`) until the next accepted keystroke or blur — the same UX as the payment-term selector's create modal. A digit too many reads "El máximo permitido es {max}" (`qtyMaxAllowed`) |
| `stepperRejectedKey` | i18n key of the reason for a non-digit refusal (separator, letter, sign, `%`); default `fieldIntegerError` ("El valor debe ser un número entero"). payment-term declares `paymentTermDaysNotInteger`, the selector's wording. The stepper vets the RAW text through `MaskedAmountInput`'s optional `isRawAllowed`, before the amount mask would strip a letter in silence |
| _(automatic)_ `maxLength` | a text / textarea field gets its column's DB length (`AD_Column.FieldLength`, the contract's `validation.maxLength`) as the input's `maxlength`, in both the default and the compact modal — the same client hard stop the standard detail form has had since ETP-5323. Nothing to declare; emitted by the list-modal generator since ETP-5978 |
| `defaultValue` | value seeded into the **create** modal. The modal does NOT call `/defaults`, so a `defaultExpr` (server-side default) alone does not pre-fill it — declare both when the create modal must start with the value |

## Setting layoutType

Edit `artifacts/{window-name}/schema-curated.json` and add to the `window` object:

```json
"window": {
  "layoutType": "kanban",
  "templateConfig": {
    "groupByField": "documentStatus",
    "columns": [{ "value": "DR", "title": "Draft", "color": "gray" }],
    "cardTitle": "documentNo",
    "cardSubtitle": "businessPartner",
    "cardValue": "grandTotal"
  }
}
```

For calendar:
```json
"layoutType": "calendar",
"templateConfig": {
  "dateField": "orderDate",
  "endDateField": null,
  "eventTitle": "documentNo",
  "eventType": "documentStatus"
}
```

For custom (no templateConfig needed):
```json
"layoutType": "custom"
```

## Custom Windows Convention

Custom windows live in `tools/app-shell/src/windows/custom/{window-name}/`:
- `index.jsx` — the hand-written React component (receives same props as generated windows)
- `mockCatalogs.js` — FK reference data for local development

The pipeline generates the initial scaffold with rich JSDoc comments (all entities, fields, processes, API patterns). The developer builds on top.

**Regeneration safety:** If `index.jsx` already exists when the pipeline runs again, the new scaffold is written as `index.jsx.new`. The existing file is never touched. Same for `mockCatalogs.js`. Use AI or a diff tool to merge updated metadata.

### Page title, breadcrumb and kebab — publish to the app TopBar

A custom window does not render its own title row. Like `ListView`/`DetailView`, it publishes
`title`, `breadcrumb`, `recordCount`, `titleExtra` (a badge or status next to the title),
`onAddToFavorites`/`isFavorite` and `onPageHelp` through `useSetPageMeta`
(`@/components/layout/PageMetaContext`), and the TopBar renders them, kebab included. Examples:
`organization/OrganizationPage.jsx` (one page), `fiscal-models/` (list plus detail pages).

**List and detail in one window.** If the list stays mounted (hidden) while a detail page is open,
for example to keep polling, the hidden list must not publish anything. `useSetPageMeta`'s cleanup
resets the TopBar on every dependency change, so a hidden list that re-publishes, even `{}`, wipes
the detail's title. Publish the list meta from a small child component rendered only while the
list is active. On close, the detail's cleanup withdraws its meta and the remounted child
re-publishes the list's. Reference: `ListPageMeta` in `fiscal-models/FmListPage.jsx` and
`useFmDetailPageMeta` in `fiscal-models/FmDetailChrome.jsx`, described in
`docs/generated-custom-windows/fiscal-models.md` › "Detail page header, action bar and 1280×720
layout".

## Registry: customLoaders

`tools/app-shell/src/windows/registry.js` contains a `customLoaders` map alongside `windowLoaders`. When the pipeline creates a custom scaffold for the first time, it auto-registers the loader. Resolution order:

```
windowLoaders[name] || customLoaders[name] || PlaceholderWindow
```

## Hidden menu items: `redirect` and `routeOnly` (ETP-5795)

`buildWindowMap()` decides which `/:windowName` URLs resolve, from the `menu.json` flags of each item (an item inside a `hidden: true` group counts as hidden):

| menu.json item | Sidebar | URL `/<name>` |
|---|---|---|
| visible (no `hidden`) | shown | loads the window |
| `hidden: true` | stripped | not registered: "Window not found" |
| `hidden: true` + `"redirect": "/path"` | stripped | `<Navigate to="/path" replace />` (old bookmarks keep working) |
| … + `"redirectKeepPath": true` (ETP-5720) | stripped | same, but `/<name>/<id>?q#h` goes to `/path/<id>?q#h`. Only for a renamed window (`simple-g-l-journal` → `manual-journals`); a redirect to a different window must not carry a foreign record ID |
| `hidden: true` + `"routeOnly": true` | stripped | loads the window (use only when an in-app link needs it: overview page buttons, row actions) |

Dedicated routes in `runtime-routes.jsx` (`/smart-scan`, `/hr`, `/report-viewer`...) win over `:windowName`, so hidden pages and reports are unaffected. A hidden window that has a `windowId` shared with a visible one (e.g. `business-partner` and `contacts`, 123) therefore no longer slips through role access: declare `redirect` to the window that replaced it. Do not add a link to a window that is hidden without one of the two flags.

## Flow: layoutType → contract → generator

```
schema-curated.json (layoutType, templateConfig)
    ↓
generate-contract.js → frontendContract.window.layoutType
    ↓
generate-frontend.js → generatePageComponent() branches by layoutType
    - "custom"     → generateCustomScaffold() → windows/custom/{name}/
    - "kanban"     → generateKanbanPage() → artifacts/{name}/generated/
    - "calendar"   → generateCalendarPage() → artifacts/{name}/generated/
    - "list-modal" → generateListModalPage() → <ListModalWindow> (grid + modal, no detail)
    - "default"    → generatePageComponent() [unchanged]
```

For `list-modal`, `generateAll()` also skips the per-entity `Table`/`Form` files — the
`<Header>Page.jsx` carries the `columns`/`fields`/`sections` literals and `ListModalWindow`
renders them.

## Flow: linesLayout → contract → generator

`window.linesLayout` is an orthogonal flag — it modifies how the Lines tab inside the
`default` (header-detail) layout renders, regardless of `layoutType`. It does not introduce
a new top-level page template.

```
decisions.json (window.linesLayout)
    ↓
resolve-curated.js → schema.window.linesLayout (via WINDOW_TRUTHY_PROPS)
    ↓
generate-contract.js → frontendContract.window.linesLayout (defaults to "classic")
    ↓
generate-frontend.js → emits linesLayout="<value>" on <DetailView>
    ↓
Generated <Window>LineTable.jsx switches at runtime:
    - "classic"        → <DataTable columns={columns} ... />          (current behavior)
    - "inlineEditable" → <InlineLinesPanel columns={columns} ... />   (Figma redesign)
```

`InlineLinesPanel` lives in `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx`.
Validator F11 enforces the enum. Default is `"classic"`, so windows that don't opt in are
unaffected by the new component.
