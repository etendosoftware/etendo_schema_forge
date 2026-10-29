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

### Gotcha — a hand-rolled `index.jsx` prop can silently shadow `decisions.json` (ETP-4839)

Some windows have a hand-written `windows/custom/{window}/index.jsx` wrapper (not the pipeline-window
`artifacts/{name}/custom/` convention) that renders `<HeaderPage>` itself and passes a prop it built by
hand instead of the one the generator would have produced from `decisions.json`/`contract.json`. When
that happens, **the hand-rolled prop wins completely** — the generated value is never even reached, and
`decisions.json` looks correct while the running UI does something else entirely.

Real example: `purchase-invoice/index.jsx` and `sales-invoice/index.jsx` both call the shared
`getInvoiceDraftMode(ui, options)` helper (`windows/custom/shared/useInvoiceWindow.js`) and pass its
return value as `draftMode={draftModeOverride}` to `<HeaderPage>`. This completely replaces the
`draftMode` object the generator would otherwise have built from `decisions.json → window.draftMode`.
Adding a new `draftMode` key in `decisions.json` (e.g. `keepSaveWhenCompletedFields`, see
`docs/decisions-reference.md`) regenerates a perfectly correct `contract.json`/generated `HeaderPage.jsx`
— and still does **nothing** in the browser for these two windows, because their `index.jsx` never reads
the generated value at all. The fix has to be made by hand at the override site (here, by adding a new
option to `getInvoiceDraftMode` and passing it from the one window that needs it), not by touching
`decisions.json` again.

**ETP-5692 — the two invoice windows now carry two such lists in both places:**
`keepSaveWhenCompletedFields` and `editableLineFieldsWhenCompleted` are declared in
`artifacts/{sales,purchase}-invoice/decisions.json → window.draftMode` (so the contract and the
generated `HeaderPage` are right) AND passed by hand to `getInvoiceDraftMode` in each `index.jsx`
(which is what actually reaches `DetailView`). Change both: the sync is guarded by the
`passes the decisions.json completed-document allowlists through the draftMode override` test in
`tools/app-shell/src/windows/custom/{sales,purchase}-invoice/__tests__/index.vitest.jsx`, which
fails if the `index.jsx` override drifts from `decisions.json`. Reading the lists from one source was considered
and not done: it would mean importing the window's whole `decisions.json`/`contract.json` into the
SPA bundle, or changing how the generated `HeaderPage` merges `draftMode`.

**When adding/changing a `decisions.json → window.*` key, grep for a hand-rolled prop with the same
name** (`grep -rn "draftMode={" tools/app-shell/src/windows/custom/`, or the equivalent for the prop
you're changing) before assuming a `make regen` alone is enough. This is the same "custom files are
never overwritten by the pipeline" guarantee working against you: it also means they are never
auto-synced when a generated prop's shape changes.

---

## Default column widths by field type (ETP-5833)

One lookup (`tools/app-shell/src/lib/linesColumnWidth.js`) sizes **and** expands every grid column from its `type`. `columnFlex()` feeds the lines grid (`InlineLinesPanel`) and the add-row colgroup; `columnMinWidthPx()` feeds the plain list (`DataTable` list mode, header + body + `<col>`). Both read the same tables, so the surfaces cannot disagree. Bases are **constants per type, never measured from content**: sorting or paging cannot move a column (ETP-5182), and there is no autofit. The only measured input is the plain-list **header label** (below), which depends on label + locale, never on row data. **One exception, lines grid only (ETP-5133):** a no-truncate column (any lookup selector, or `noTruncate: true` — see `docs/decisions-reference.md`) gets `contentWidthPx` from `withContentWidths()` (`lib/linesContentWidth.js`): the widest identifier among the loaded lines plus the add-row draft (published by `DataTable` through `lib/linesScrollHost.js`), measured with `measureTextPx` in the cell font. `columnFlex()` only ever raises the type basis to it (no maximum), so header, lines, totals and the add-row colgroup stay aligned and the grid's horizontal scroll absorbs the overflow.

| Type | Width (px) | Expands? | Why |
|---|---|---|---|
| `string`, `text` | 224 | **yes** (`1 0`) | descriptive: absorb the leftover width |
| leading `selector`/`search`/`foreignKey` (idx 0) | 192 | yes | the product/identity column; selectors at idx > 0 are fixed |
| `date` | 176 | no (`0 0`) | sized for the longest representative translated header ("Fecha de presupuesto", ~129px) + 24 padding + sort icon; the value itself needs ~120. Longer labels are covered by the header floor below |
| `amount` / `price` / `quantity` / `integer` / `decimal` / `number` / `signedDelta` | `amount`: 172 lines / 130 list; 152 (rest) | no | `number` is the type the generator emits for every numeric field; it used to fall to the 120 default. The lines `amount` tier is sized for an editable input; a read-only list cell needs ~120 |
| `percent` | 152 lines / 104 list | no | compact progress circle |
| `status` | 184 | no | the pill ("Cobro depositado") clips below it; same in lines and list |
| `enum`, `select` | 224 | no | value + chevron ("Use Generic Account No."); codes/states do not stretch |
| `boolean` + `badge` | 152 (240 for the Posted status) | no | the pill |
| `display: 'tag'` | 144 | no | UoM-style grey pill |
| `multiField` | 240 (list only) | no | media + title + chip |
| anything else | 120 | no | safe fallback |

**List header floor (ETP-5833 QA) — no list header is ever truncated.** A plain-list header never wraps (`whitespace-nowrap` + ellipsis), so in list mode a column's width is `max(type basis or col.minWidth, rendered header)`. The rendered header is the label the header actually shows — resolved in `DataTable` with the same `resolveColumnLabel(col, locale, t)` as the header cell (often an AD label from `useLabel`, not `col.label`; for a `multiField`, the joined part labels) — measured by `measureHeaderLabelPx` (`OffscreenCanvas` `measureText` with the header font, `600 12px` + the body font family, resolved once per render pass; a deterministic 7px/char estimate where there is no `OffscreenCanvas` — jsdom, node — or the canvas measures 0. A width is cached only once `document.fonts.check(font)` passes: while Inter is still swapping in, the fallback face is measured but not cached, and `DataTable` re-measures exactly once when `document.fonts.ready` resolves) plus `LIST_HEADER_CHROME_PX` = 42 (cell padding 24 + the sort arrow 14, reserved even when unsorted so a click never resizes, + 4 slack), plus 18 when the computed-freshness clock renders. `DataTable` stores it as `col.headerMinWidthPx` on its list columns only, and `columnMinWidthPx` folds it in, so the header `<th>`, the body `<col>`/cells and `listTableMinWidthPx` agree. Opt-outs: `headClass` (pinned width) and `headerWrap` (the header wraps onto two lines — the default for `percent`; `AttachmentsTable` uses it to keep its 130px dates). The lines grid is not affected: its headers are flex cells that wrap, and its widths come from `columnFlex`, which ignores the floor.

**The absorber is descriptive, not a code.** `withImplicitGrowColumn` / `withLinesAbsorberColumn` skip columns whose AD column (`col.column`) is `DocumentNo` or `Value` (a document number or a search key is a short code) while another descriptive column exists — so on Sales Invoice the business partner, not "Nº documento", takes the leftover width. A code column only absorbs when it is the only descriptive column. The test is structural (the AD column name), never a window or spec name.

Overrides win over the type: `col.minWidth` (decisions `columnWidth`; elastic by the ETP-5332 contract) and `col.grow: true` (decisions `grow`). A plain list always keeps exactly one width-less column to absorb the leftover (`withImplicitGrowColumn`, ETP-5510). On a narrow viewport every column keeps its basis and the scroll container scrolls (`overflow-x: auto`, ETP-5133), so nothing overlaps or becomes unreachable.

**Date with time — documented exception.** There is no `datetime` tier: no list or lines column carries one today (the only `datetime` fields in the contracts are the hidden `created`/`updated` audit columns; the generator maps a visible datetime to `string`, and a `date` column renders date-only). When a datetime column is ever exposed, add its tier together with its renderer (and the generator mapping in `schema_forge_core`).

**Surfaces covered:** the standard list (`ListView` → `DataTable`) and the standard lines grid (`InlineLinesPanel` + the `DataTable` add-row row). **Explicit overrides inventoried** (they keep their own width, unchanged): decisions `columnWidth` in `contacts` (4), `goods-movements`, `internal-consumption`, `physical-inventory` (3), `manual-journals`; custom `minWidth` in `components/attachments/AttachmentsTable.jsx` (both dates, 130 + `headerWrap` — narrow side panel), `financial-account/custom/AccountsHeaderTable.jsx` and `sales-invoice/custom/InvoiceHeaderTable.jsx`. **Excluded (bespoke tables, not adapted):** `windows/custom/{amortization,assets,calendar}`, `ReconciliationSplitPanel`, `CreateReturnWizard`, `ListModalWindow`, `OcrLinesReviewModal`, `ReportDrawer`, `AccountTreeView`, and the settings pages (`RolesAccessMatrix`, `ApiKeysPage`, …). No new view persistence or user resizing is part of this; the defaults are the fallback when one is added. Regeneration-safe: the behaviour lives in the shared lib, never in generated output.

Tests: `lib/__tests__/linesColumnWidth.test.js` (basis per type, list = lines basis, "only descriptive types grow"), plus the geometry specs `e2e/tests/flows/sales/sales-quotation-list-column-widths.mocked.spec.js` (list) and `e2e/tests/flows/platform/lines-grid-narrow-viewport.mocked.spec.js` (lines), and the `linesAddRowColumnAlignment.vitest.jsx` cases. The implicit absorber is `withImplicitGrowColumn` (list) / `withLinesAbsorberColumn` (lines + add-row): a descriptive non-code column when one exists (never a `tag` pill, never `DocumentNo`/`Value` while something else describes), otherwise the first unpinned column (e.g. the leading amount on Product > Costo). Header floor: `linesColumnWidth.test.js` (*list header floor*) and `DataTable.percentHeader.vitest.jsx` (*plain list header floor*: AD-resolved label drives `<th>`, cells and table min-width; sorting does not move a column).

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

Props received: `recordId`, `data`, `token`, `apiBaseUrl`, `api`. **Real examples:** `contacts`, `user`.

For `contacts`, the custom `BillingPreferencesForm` keeps customer/vendor billing controls disabled
until the header record exists (`data.id` present). This mirrors Classic behavior where billing
details are edited after the Business Partner is created.

For `user`, `AssignTemplateRolesControl` (ETP-4906) renders a multi-select chip control for
composing 1+ system-level template roles onto an existing user, with its own save-first
placeholder while `data.id` is absent — see `docs/generated-custom-windows/user.md` → "Role
assignment — multi-role composition" for the full mechanism.

---

### 3b. `window.customComponents.topbarSecondary` — secondary/utility actions, left of Save (ETP-5260)

Injects a component into the detail topbar, rendered **before** Save/Confirm — i.e. to their
**left**. This is a second, narrower slot alongside `topbarRight` (§4): both share the exact
same prop contract (`data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess`, `onRefresh`,
`onSave`, `isDirty`, `saveGate`), rendered by `DetailView`'s shared `renderSlotAction` helper —
the only difference between the two slots is **where** in the flex row each one is called.

```json
"window": {
  "customComponents": {
    "topbarSecondary": "PurchaseOrderSecondaryActions"
  }
}
```

**Read this before you add a button to either `topbarRight` or `topbarSecondary`.** The bug
that created this slot (ETP-5260) was exactly this: Copy link / Clone / Send lived *inside*
`topbarRight`, and no amount of reordering them within that slot could put them to the left of
Save — **the position of a button inside a slot's JSX never determines its position relative to
Save; only which slot it is in does.** `topbarRight` is one `{topbarRight && …}` block rendered
as a whole, after Save; `topbarSecondary` is a different block, rendered as a whole, before Save.
Moving a button from the front to the back of one slot's internal JSX changes nothing about
which side of Save it lands on.

**The classification rule — decide by what the button IS, not by habit or by copying the
nearest window:**

| Slot | Carries | Renders | Examples |
|---|---|---|---|
| `topbarSecondary` | **Secondary/utility actions** — actions that operate on the record but are not part of advancing its document flow | Left of Save/Confirm | Copy link, Clone, Send by email |
| `topbarRight` | **Primary document-flow actions** and status indicators — the actions that move the document forward, plus badges | Right of Save/Confirm (unchanged since ETP-4933) | Confirm-with-credit, "Gestionar recepción y factura", "Crear factura", payment-status/SII badges |

A quick test: if the action's own label reads as a step in completing or advancing the
document (Confirm, Create Invoice, Manage Receipt), it is primary → `topbarRight`. If it reads
as "do something *with* this record that doesn't change its status" (copy its link, duplicate
it, send a copy by mail), it is secondary → `topbarSecondary`.

**Use `DocumentSecondaryActions`, don't write your own.** For the three common secondary
actions, do not hand-roll buttons — reach for the shared
`tools/app-shell/src/windows/custom/shared/DocumentSecondaryActions.jsx`, which renders them in
the DF-mandated order **Copy link → Clone → Send** and already carries the Clone modal. Before
this component existed there were **three divergent copies** of the Clone button
(`purchase-order`, `sales-order`, and a mostly-unused shared `CloneButton.jsx`) — that
divergence is exactly how ETP-4781's clone-button styling bug happened. A new window wanting
this group wraps `DocumentSecondaryActions` in a small per-window adapter (own gating, own
Clone/Send wiring) rather than duplicating its buttons; see
`artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx` for the reference adapter to
copy. Key props: `windowName`, `clone` (`false` | `true` | an overrides object — see the
component's own JSDoc for the full shape), `showSend` + `onSendClick`, `showCopyLink` (default
`true`), and `children` for a window-specific secondary action that isn't Copy link/Clone/Send
(e.g. a fiscal "send to SII/TBAI" button) but still belongs in the DF's "Enviar" position.

**Clone result verification (ETP-5547) — shared `CloneOrderModal` behaviour.** Every clone, from the
grid or from `DocumentSecondaryActions`, is re-read with `GET /{headerEntity}/{id}` after the clone
POST. Each result row is `ok` (link), `notFound` (404 — red, not clickable, `cloneResultNotFound`),
`unverified` (any other GET failure — still clickable, flagged with `cloneResultUnverified`) or
`missingId` (2xx POST with no usable id — not clickable, `cloneResultMissingId`). The done title
counts only clones not proven missing and switches to `cloneFailedTitle*` when none exist; only
openable ids reach `onCloned`. Legacy callers without `routePrefix` now also wait for these GETs and
stay on the result view (instead of closing and navigating) when a clone cannot be opened. Relies
on the server committing before the POST response (no early flush in `NeoServlet`).

**A `SendDocumentModal` needs client-rendered PDF context `DocumentSecondaryActions` does not
have.** Nine migrated windows (see the table below) keep their existing `SendDocumentModal`
inside their `topbarRight` component instead of duplicating it, and bridge the Send *button* in
`topbarSecondary` to the existing modal via a `window` `CustomEvent`
(`'<window>:open-send-modal'`, e.g. `'purchase-order:open-send-modal'`) — see
`docs/document-printables.md` → "Where the printables are used", entry 3, for the full pattern
and why the modal did not move.

**Do not move `topbarRight` to the left of Save.** `DetailView.jsx` carries an explicit ETP-4933
comment on this: a `topbarRight` component may host PRIMARY actions, and moving the slot — or
reintroducing its old pre-`topbarSecondary` behavior — puts them to the left of Save, which is the
regression ETP-4933 fixed. The `topbarSecondary` slot exists specifically so this never has to be
revisited: it is additive and `topbarRight` is untouched. (The two return windows,
`return-material-receipt` and `return-to-vendor-shipment`, used to be the example: they rendered a
PRIMARY Borrador Confirm inside `topbarRight`. Since ETP-5408 that Confirm is the generic draftMode
button like every other document window — `draftMode.onConfirm` dispatches
`'<window>:open-confirm-modal'` and their `topbarRight` `ConfirmWithCreditButtonBase` only runs the
confirm flow and renders the Completado-state invoice action.)

**Windows migrated to `topbarSecondary` (ETP-5260):** `purchase-order`, `sales-order`,
`sales-quotation`, `goods-receipt`, `goods-shipment`, `purchase-invoice`, `sales-invoice`,
`return-material-receipt`, `return-to-vendor-shipment`. See each window's guide under
`docs/generated-custom-windows/` for its exact button set and gating.

**The kebab ("more actions") menu also moved (ETP-5260, global change).** `DetailMoreActionsMenu`
now renders right after `topbarSecondary` and before Save — reasoning: the kebab is itself a
container of secondary actions (`window.menuActions`, §5 below), so it belongs in the same visual
group. This is a `DetailView.jsx`-level change, so it affects **every** window that declares
`menuActions`, not only the 9 migrated above — including `amortization`, `chart-of-accounts`,
`fiscal-calendar`, `goods-movements`, `matched-purchase-invoices`, `physical-inventory`, and
`manual-journals`.

---

### 4. `window.customComponents` — replace or inject structural components

Injects custom components into specific structural slots of `DetailView`. Each key maps to a component name (file must exist at `windows/custom/{window}/{value}.jsx`).

**Use when:** a specific part of the standard layout needs a fully custom implementation.

```json
"window": {
  "customComponents": {
    "topbarRight":    "GoodsShipmentActions",
    "subHeader":      "ProductCostBanner",
    "bottomSection":  "InvoiceBottomPanel",
    "sidePanel":      "PaymentActivityPanel",
    "sidePanelStyle": { "width": "40%", "minWidth": 260 },
    "headerTable":    "InvoiceHeaderTable"
  }
}
```

| Key | Prop emitted | Renders where | Props received |
|-----|-------------|---------------|----------------|
| `topbarSecondary` | `topbarSecondary={X}` | Left side of detail topbar, before Save/Confirm — see §3b | `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess`, `onRefresh`, `onSave`, `isDirty`, `saveGate` |
| `topbarRight` | `topbarRight={X}` | Right side of detail topbar (replaces status badge), after Save/Confirm | `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess`, `onRefresh`, `onSave`, `isDirty`, `saveGate` |
| `subHeader` | `headerContent={(data) => <X data={data} />}` | Full-width strip between the toolbar and the form — the first child of the detail content container | `data` |
| `bottomSection` | `bottomSection={X}` | Bottom of detail view (replaces totals + footer) | `recordId`, `data`, `token`, `apiBaseUrl`, `api`, `summary`, `notesField`, `onFieldChange`, `notesFocused`, `setNotesFocused` |
| `sidePanel` | `sidePanel={X}` | Right-side panel alongside the detail form | `recordId`, `data`, `token`, `apiBaseUrl` |
| `sidePanelStyle` | `sidePanelStyle={…}` | CSS style for the side panel container | — (style object, not a component) |
| `sidebarFormScrollPaddingX` | `sidebarFormScrollPaddingX=""` (DetailView prop, opt-in, hand-built windows only) | Replaces the detail content column's padding when the window HAS a side panel / sidebar (default there: `px-2 pb-2` inline/compact, `pr-2` otherwise). `""` removes it. Ignored without a sidebar; independent of `formScrollPaddingX`. | — (string) |
| `headerTable` | replaces `{Entity}Table` import | List table in the master list view | Standard table props |
| `newRecordComponent` | `onNew={() => setShowNewModal(true)}` on `ListView`, plus `{showNewModal && <X … />}` after it | Replaces the list toolbar's New button flow (a modal instead of the generic create form). Needs `hideCreate: false`; ListView still hides New for a read-only window | `token`, `apiBaseUrl`, `windowName`, `onClose` — nothing else, so any page state it needs (a selected row, loaded data) must come from a shared store or the URL |

**Real examples:**
- `topbarSecondary`: see §3b — 9 windows, all wrapping the shared `DocumentSecondaryActions`
- `topbarRight`: `goods-shipment` (`GoodsShipmentActions`), `sales-invoice` (`InvoiceTopbarExtra`)
- `subHeader`: `product` (`ProductCostBanner`, ETP-5245 — the "this stocked product has no cost" warning, see `docs/generated-custom-windows/product.md`)
- `bottomSection`: `payment-in` (`PaymentBottomPanel`), `sales-invoice` (`InvoiceBottomPanel`)
- `sidePanel`: `payment-in` (`PaymentActivityPanel`)
- `newRecordComponent`: `payment-in` (`NewPaymentModal`), `chart-of-accounts` (`NewSubAccountCreateModal`, ETP-5593 — reads the tree's selected row from `chartOfAccountsTreeStore.js`, see `docs/generated-custom-windows/chart-of-accounts.md`)
- `headerTable`: `sales-invoice` (`InvoiceHeaderTable`), `user` (`UserHeaderTable`, ETP-4906 — swaps in a role-chips cell + toolbar role filter, see `docs/generated-custom-windows/user.md`); `chart-of-accounts` (`AccountTreeView`, a self-fetching tree whose controls are its `ToolbarQuickFilter` static slot, ETP-5593, see `docs/generated-custom-windows/chart-of-accounts.md`)

**`subHeader` is the slot for a page-wide notice** (ETP-5245). Use it when the message belongs to the whole record rather than to one field: a blocking warning, a state explanation, a "this record is locked because…" strip. The generator emits it as `DetailView`'s `headerContent` prop, so it renders above the form, above the primary-tab content, and at full content width — the same place the built-in credit-limit / BP-on-hold banner (`BlockingBpBanner.jsx`) occupies. The component receives only `data` (the current record), so any other state it needs must be derived from the record or fetched by the component itself. Return `null` to render nothing — the slot has no visibility gate of its own. Pair it with the shared `InfoBanner` primitive (`@/components/InfoBanner`) rather than a bespoke box, and pick the tone deliberately: `info` (blue) for a notice, `warning` (amber) when the condition also blocks an action, `danger` for an error. If the notice must also **prevent saving**, keep the banner and the save gate reading one shared predicate (product puts it in `lib/productCostRequirement.js`, consumed by both `ProductCostBanner.jsx` and `useEntity.js`) so the two can never disagree.

**Every `InfoBanner` is dismissible by default (ETP-5245).** The X is rendered unless the caller passes `dismissible={false}`, and with no `onDismiss` the banner hides itself — supplying `onDismiss` switches it to controlled mode, where the caller owns visibility (that is what `ListModalWindow` does). A banner that explains a **block** must not stay closed while the user keeps hitting that block: pass `reopenSignal={useSaveBlockSignal('<stable-toast-id>')}` (`@/hooks/useSaveBlockSignal.js`) and it re-opens itself every time `useEntity`'s save gate actually refuses a save for that reason. The id is the same stable toast id the gate already passes to `reportInvalidFormatField`, so the banner and the toast can never describe different refusals; a new blocking rule gets the behaviour just by passing a `toastId`. See `ProductCostBanner.jsx` for the reference wiring.

**Save-before-confirm contract for `topbarRight` and `CustomLines` (ETP-4940 follow-up).** If a `topbarRight` component or a `CustomLines` component (e.g. `payment-in`'s `ApplyToInvoices.jsx`, whose "apply + process" flow fires its own `documentAction` request) triggers its own documentAction request, it MUST call `maybeSaveBeforeConfirm({ isDirty, handleSave: onSave })` (`@/components/contract-ui/detailViewHelpers.jsx`) before that request fires — otherwise a header edit made without clicking Save first is silently discarded, and the action runs against the last-persisted value. This mirrors the guard `DetailView.jsx`'s own draftMode Confirm button and `DetailMoreActionsMenu.jsx`'s kebab documentAction already apply; `topbarRight` and `CustomLines` were the two choke points that bypassed it until this fix. A `topbarRight` component that only reacts to the generic Confirm's `draftMode.onConfirm` event (the return windows' `ConfirmWithCreditButtonBase` since ETP-5408, like `GoodsReceiptActions`) must NOT save again: `runDraftModeConfirm` in `saveActions.jsx` has already saved before calling `onConfirm`, and the listener's `isDirty` may still hold the pre-save value. `onSave` and `isDirty` are always passed to every `topbarRight` component, and both are also passed into `CustomLines` alongside its existing `onSave` — a component that never fires its own documentAction (e.g. a payment-status badge) can ignore both.

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

**Save-before-action guard (ETP-4940).** Before invoking a `documentAction` entry, `DetailMoreActionsMenu.jsx`'s `runDocumentAction` now calls `maybeSaveBeforeConfirm` (`tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx`) to persist any pending header edit first — otherwise an edit made without clicking Save first was silently discarded, the action running against the last-persisted value. On save failure the action does not run (the existing `handleSave` error toast surfaces the failure). **Known gap:** unlike the draftMode Confirm button (which guards on the fuller `isDirty` — header OR line-edit/add-row state), this guard is scoped to `hook.isDirtyHeader` only, so a pending line-row edit with a clean header is not saved before a kebab `documentAction` fires. This is currently unreachable via any shipped generated window — the only kebab `documentAction` is `reactivate` (RE), which only appears once a document is already Completed, where lines are normally read-only — but it is pinned by an explicit regression test (`DetailMoreActionsMenu.saveBeforeConfirm.vitest.jsx`, look for "KNOWN GAP W1") so it does not silently widen if a future window wires a kebab action for a non-completed status.

**Dynamic kebab entries — `customComponents.moreMenuContent`.** When an entry's caption or visibility depends on more than the document status or a record field (e.g. the org's fiscal configuration), declare a component instead: `"customComponents": { "moreMenuContent": "<Component>" }`. It is rendered inside the menu after the `menuActions` items and receives `data`, `recordId`, `token`, `apiBaseUrl`, `onClose`, `onRefresh` and `isDirty` (the header has unsaved edits — `hook.isDirtyHeader`, header fields only, not pending line edits; ETP-5700); returning `null` hides it. The menu unmounts it on close (a click inside a modal closes the menu too), so an entry that opens a modal must delegate the modal to a host that the window mounts **unconditionally** — not to a sibling that may itself be hidden, such as a topbar button.

Example (ETP-5700): `SifSendMenuItem` (`tools/app-shell/src/windows/custom/shared/`, re-exported from `artifacts/{sales,purchase}-invoice/custom/`) computes the pending fiscal targets with `useInvoiceSifSending`, closes the menu and calls `requestSifSendModal(specName, recordId, pendingTargets)` from `sifSending.js`. That dispatches the `sif:open-send-modal` window event; `SifSendModalHost`, which the invoice window wrapper (`index.jsx`) renders next to the form for as long as a record is open, filters it with `isSifSendRequestFor` (same spec, same record id) and portals the shared `SifSendingModal`. After a successful send it fires `${specName}:invoice-updated` so the topbar refreshes the record. Since ETP-5700 this kebab entry is the invoice form view's only send entry point: the topbar `SendToSifButton` was removed because the action showed twice.

```json
"customComponents": { "moreMenuContent": "SifSendMenuItem" }
```

```jsx
// tools/app-shell/src/windows/custom/sales-invoice/index.jsx — detail branch
<SifSendModalHost apiBaseUrl={apiBaseUrl} recordId={recordId} />
```

The kebab content has no save handle, so it cannot flush pending header edits itself. An entry whose action must see the saved values should use `isDirty` to refuse to run on a dirty form: `SifSendMenuItem` renders disabled (`aria-disabled`, dimmed) with the `sendToSifSaveFirst` tooltip ("Guarda los cambios antes de enviar") and ignores clicks until the user saves. Field reference: `docs/decisions-reference.md` → Custom Components.

**The ⋮ button auto-hides when empty.** `DetailView` only renders the "more" button when, for the current record state, there is at least one visible `menuActions` entry **or** a `customComponents.moreMenuContent` is set. If every action is gated out (e.g. all `visibleWhenStatus: "CO"` while the document is in Draft), the button is not shown at all — it never renders as an empty, clickable dropdown.

**Real examples:** `goods-shipment` (cancel), `payment-in` (reverse via `columnName`), `sales-invoice` (duplicate, cancel), `sales-order` (reactivate via `documentAction: "RE"`).

#### Posting actions follow "Show Accounting Fields" (ETP-5684)

Contabilizar / Descontabilizar are hidden from every role whose `capabilities.showAccountingFields` is not `true` (`AD_Role.EM_ETGO_Show_Acct_Fields`, derived from the Finance template; admins always have it). **You declare nothing for this.** The three action renderers drop any descriptor whose `neoAction` (form kebab, row kebab) or `value` (bulk toolbar) is `post` or `unpost`:

| Renderer | Surface |
|---|---|
| `DetailMoreActionsMenu.jsx` | form kebab (`menuActions`) |
| `RowQuickActions.jsx` | row kebab (`rowQuickActions` menu entries, incl. hand-rolled ones in a window's `index.jsx`) |
| `BulkDocumentAction.jsx` | bulk toolbar, whichever builder produced the list (`buildPostActions`, a window's own builder) |

All three call `filterPostingActions(actions, capabilities)` from `tools/app-shell/src/lib/capabilityVisibility.js`. It keys on the generic posting action that `DocumentPostingService` serves for every document — a structural contract, not an entity name — and ignores `key`, which is a free label. The gate fails closed, so a component test without an `AuthProvider` loses Post/Unpost: grant the capability with `src/test/capabilitiesSafeMock.js` (see its header). Reactivate's `preUnpost` calls `unpost` directly, not through a menu, so it is unaffected.

The posting **status** (the `posted` field) is NOT automatic: declare `"visibleWhenCapability": "showAccountingFields"` on it in `decisions.json`, and on any hand-written `posted` list column (`visibleWhenCapability: ACCOUNTING_CAPABILITY`). `ListView` then also drops the column from the advanced filter, the sort popover and the export, and strips a restored filter or sort on it. `tools/app-shell/test/accounting-capability-guard.test.js` fails the build on an ungated `posted` in either place. Hand-rolled financial-account surfaces gate themselves (movements dot + sort segment + kebab, reconciliations column/filter/sort, reconciled-transactions modal, payment timeline "Asiento contabilizado"). Confirm-dialog warnings about removing the accounting entry are kept on purpose: they describe a consequence of an action the user is allowed to take.

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

**Gallery card grid (ETP-5516).** A `{Name}Gallery.jsx` must lay its cards out with the shared
`GalleryGrid` (`tools/app-shell/src/components/ui/gallery-grid.jsx`), never with viewport
breakpoint classes (`xl:grid-cols-6`, ...). `GalleryGrid` is width-driven: its columns are
`repeat(auto-fill, minmax(min(GALLERY_CARD_MIN_WIDTH_PX, 100%), 1fr))`, so the number of cards per
row follows the width of the gallery's own container. Expanding the Navigation Rail or narrowing
the window makes cards wrap to the next row instead of shrinking below the minimum, and a wider
container fits more cards. `GALLERY_CARD_MIN_WIDTH_PX` (220 px, taken from the Figma product
gallery) is the single place to change that minimum. The report catalog gallery
(`ReportViewerPage.jsx`) uses the same component, so the two galleries cannot drift apart.

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
| Spec | `window.agentPrompt` | `ETGO_SF_SPEC.AGENT_PROMPT` | `etendo_discover` (per spec) |
| Field | `entities.{e}.fields.{f}.agentPrompt` | `ETGO_SF_FIELD.AGENT_PROMPT` | `etendo_schema` (per field) |

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

#### 7.a Sales and purchase documents: one definition for the form and the list preview (ETP-5527, ETP-5539)

For the five sales documents (`sales-quotation`, `sales-order`, `sales-invoice`, `goods-shipment`, `return-material-receipt`) and the four purchase documents (`purchase-order`, `purchase-invoice`, `goods-receipt`, `return-to-vendor-shipment`, ETP-5539, defined in `purchaseRelatedDocs.js` as `PURCHASE_RELATED_DOCS` / `getPurchaseRelatedDocs(spec)`, same shape) the form's "Related documents" section and the list preview's `RelatedDocumentsCard` render **the same definition**, so they always list the same documents with the same chips, statuses and navigation. Do not add a related-document source to only one of the two views — add it to the definition.

| Piece | Location (`tools/app-shell/src/components/related-documents/`) | Role |
|---|---|---|
| `SALES_RELATED_DOCS`, `getSalesRelatedDocs(spec)` | `salesRelatedDocs.js` | One entry per sales spec: `spec`, `entity` (header entity), optional `refreshEvent`, optional `depsKey(record)`, and `sources[]`. Each source has a `key`, a `type` (a `DOCUMENT_CHIP_TYPES` key, or `(doc) => key`) and either `select(record)` (synchronous, read from the record) or `fetch({ id, record, token, apiBaseUrl })` (async). `getSalesRelatedDocs` returns `null` for any non-sales spec. |
| `useRelatedDocuments({ definition, id, record, token, apiBaseUrl, refreshSignal })` | `useRelatedDocuments.js` | Resolves a definition into `{ items: [{ type, doc }], loading, refresh }`, deduplicating by chip type + id. `record === undefined` → the hook loads the **detail** record itself (preview mode); `record === null` → waits for it (form still loading). Listens to `refreshEvent`; refetches async sources when `depsKey` or `refreshSignal` changes. |
| `RelatedDocumentsSection` | `RelatedDocumentsSection.jsx` | Form renderer (`RelatedDocumentsShell` + `DocChip`). Each window's `RelatedDocuments.jsx` is now a thin wrapper passing `SALES_RELATED_DOCS['<spec>']` / `PURCHASE_RELATED_DOCS['<spec>']`. The refresh button is shown only when the definition has at least one `fetch` source. |
| `fetchListInvoices` | `helpers.js` | Invoices through the `listInvoices` header action (also finds invoices linked only through their lines); available on sales and purchase orders. |
| `fetchOriginInvoicesOf(spec)` | `helpers.js` | Source `fetch` for the invoices linked through "Import from Source Invoice" (`originInvoices`), shared by sales-invoice and purchase-invoice. |

Payments (cobros) are deliberately **not** related documents: no sales or purchase order/invoice lists its payments as chips (functional decision, ETP-5527 / ETP-5539). Do not add a payments source to a definition.

The definition always reads the **detail** record: `linkedShipments`, `sourceInvoice`, `originInvoices` and the goods-shipment `linked*` fields are injected by the backend handlers on the detail GET only, so a list row is not enough.

`RelatedDocumentsCard` (`tools/app-shell/src/windows/custom/shared/preview-cards/`) gained two optional props:

- `definition` — a `SALES_RELATED_DOCS` / `PURCHASE_RELATED_DOCS` entry. When set it **replaces** `specs`/`fetchExtra`, and the refresh button follows the same rule as the form section.
- `record` — with `definition` only: the detail record when the caller already has it. Omit it and the card loads the detail record itself. (`return-material-receipt` passes the row, because its handler injects `sourceShipments`/`returnInvoices` on the list GET too; `return-to-vendor-shipment` and `goods-receipt` omit it so the detail is loaded.)

Without `definition` the card keeps the legacy `specs`/`fetchExtra` behavior, kept for back-compat (`ReturnDocStatsPanel` still accepts `specs`; the migrated sales and purchase windows pass `definition`). `InvoicePreview` takes the `relatedDocs` definition (sales-invoice list, fiscal monitor, purchase-invoice list); without it the card is not rendered. `ReturnDocStatsPanel` takes `relatedDefinition` plus `relatedLoadsDetail` (skip the row, load the detail).

Each preview row (`DocRow`) is a single line: the document title and amount are never truncated; when space runs out the status tag shrinks with an ellipsis and shows the full status on hover.

```jsx
// Preview: the card loads the detail record and lists what the form lists.
<RelatedDocumentsCard documentId={row.id} token={token} apiBaseUrl={apiBaseUrl}
  definition={SALES_RELATED_DOCS['sales-order']} />

// Form (artifacts/sales-order/custom/RelatedDocuments.jsx)
<RelatedDocumentsSection definition={SALES_RELATED_DOCS['sales-order']}
  recordId={recordId ?? data?.id} record={data} token={token} apiBaseUrl={apiBaseUrl}
  docsRefreshSignal={docsRefreshSignal} />
```

Parity is locked by `tools/app-shell/src/components/related-documents/__tests__/relatedDocumentsParity.vitest.jsx`; per-window sources by `salesRelatedDocs.vitest.js` and the hook by `useRelatedDocuments.vitest.jsx`.

---

### 7.b `window.attachments` — file attachments tab

Adds a transversal **Attachments** tab to the detail view for uploading, listing, downloading, and deleting files attached to the current record. The tab is **auto-enabled on every window** with `layoutType: "default"` — no opt-in needed. Set `attachments: false` to disable it, or pass an object to tune client-side limits. **A window that sets `attachments: false` must also set `MCP_CONFIG.attachments.enabled: false` on its root entity in `com.etendoerp.go` sourcedata (`ETGO_SF_ENTITY.xml`), or the MCP will still offer attachments there (ETP-5715).**

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
- The tab label shows the real number of attachments as soon as the record opens (ETP-5526): while the tab is inactive only the count is fetched (`.../count` endpoint below), the full list stays lazy. Once the list is read the label follows its length. If the count cannot be fetched (older backend without the endpoint, network error) the label shows no number — never `0` — until the tab is opened; no error is shown for it.
- Hard upload limit of **10 MB** enforced by the NEO servlet (`MultipartConfig`). `maxSizeMB > 10` will fail at upload time.

**Endpoints exposed by NEO Headless:**

| Method | URL | Action |
|--------|-----|--------|
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}` | List attachments for the record |
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}/count` | `{ "count": N }` — number of attachments without loading them (tab badge, ETP-5526) |
| `POST` | `/sws/neo/attachments/{tableName}/{recordId}` (multipart/form-data) | Upload a new attachment |
| `GET` | `/sws/neo/attachments/file/{attachmentId}` | Download a single attachment |
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}/zip` | Download all attachments as a ZIP archive |
| `GET` | `/sws/neo/attachments/{tableName}/{recordId}/zip?ids=a,b` | Download only those attachments as a ZIP (ETP-5526). Every id must belong to `{recordId}` — a foreign or unknown id answers `404` and streams nothing; `ids` present but empty answers `400` |
| `DELETE` | `/sws/neo/attachments/file/{attachmentId}` | Delete an attachment |
| `PATCH` | `/sws/neo/attachments/file/{attachmentId}` body `{ "description": "..." }` | Update the attachment description |

The handler delegates to the standard Etendo `AttachImplementationManager` and stores metadata in the `C_FILE` table — attachments uploaded through this tab are visible in Classic Etendo and vice versa.

**Frontend behavior:** drag-and-drop drop zone + tabular listing with per-row actions (download, edit description, delete). The `tableName` is resolved from `frontendContract.entities.header.tableName` automatically — there is no manual wiring.

**Bulk actions live in the selection bar (ETP-5526).** Ticking rows raises the shared `SelectionToolbar` — the same floating pill Contactos, Cuentas financieras, Amortización, Activos and the list views use — carrying the selected count, a ZIP download of just those files, and a delete that asks for confirmation first. The old header-wide **Descargar todo (ZIP)** and **Eliminar todo** controls are gone from this tab; the table header is exactly the five Figma columns (file name, size, upload date, last update, uploaded by) plus the hover action cell.

**The grid is the generic `DataTable` (ETP-5526).** `AttachmentsTable` no longer hand-builds a `<table>`: it feeds `DataTable` its own rows (attachments are not a NEO entity — `C_File` has no AD tab — so `ListView` does not apply), the same shape as `NotPostedDocumentsPage`. It therefore shares every list's row visuals (*List row visuals* in §13): the lift hover with Shadows/lg and the redrawn top separator (via `rowHoverStyle="lift-always"`, because attachment rows have no click target of their own), the `#F5F7F9` checked row, and the fade behind the row actions. The per-row Download / Delete buttons render through `rowQuickActions.render` with the shared `ROW_ACTION_BUTTON_NEUTRAL` / `ROW_ACTION_BUTTON_DESTRUCTIVE` classes and `IconicTrashIcon`, revealed on hover. Columns sort client-side (`useClientSort`); in-flight uploads stay on top with a spinner, a disabled checkbox (when selection is on — `isRowSelectable` is false for them) and no actions. Dates follow Figma: abbreviated weekday, day and month, in the UI locale and the viewer's local time — "Jue 30 abr" in es_ES, "Thu Apr 30" in en_US — with the year appended after a single space only when the date is not in the current year (local time): "Jue 30 abr 2024", "Thu Apr 30 2024"; parts in the locale's own order, weekday capitalized, no abbreviation dots. They are formatted by `formatAttachmentDate` through the columns' own `render` (the backend sends UTC instants, so this is not a `parseCalendarDate` case); `DataTable`'s shared date cell is untouched, and sorting still uses the raw ISO value, so it stays chronological.

`AttachmentsTable` is shared, so selection there is an **opt-in, caller-owned** capability: a caller that passes `selectedIds` + `onSelectionChange(ids)` gets the checkbox column, and a caller that does not gets no checkbox column at all. `DataTable` keeps its own checkbox state; `AttachmentsTable` pushes the caller's changes down to it (an emptied Set clears it through `clearSelectionTrigger`; a selected row that left the list is dropped through `deselectTrigger`). `SifAttachmentsSection` (the SII/TBAI/Verifactu "Adjuntos" block) is the second caller: it opts out — which also removed the checkboxes it used to show and could not act on — and keeps its own "Download all (ZIP)" control (now a link right-aligned above the grid), which is why `onDownloadAll` still exists on the table.

**A processed/completed document no longer blocks attachment work (ETP-5526).** `isDocumentReadOnly` — the generic lock `DetailView` wires from the document's own state — used to hide delete and disable the dropzone; it now does neither. Attachments are evidence *about* a document, not part of it, and a closed invoice is exactly when the signed copy has to be filed. The separate `readOnly` prop is unchanged: it still hides every delete action (per-row and the bar's) while leaving upload and download alone, which is what blocks deleting a non-draft fiscal declaration's justificante (ETP-5432). Consequence, known and accepted: there is currently no way to express a fully read-only attachments view through `AttachmentsTab`.

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
**Note (ETP-4745):** at ETP-4464 time, `hideDelete`'s "API capability" side was
declarative only — it reached `contract.json` but not `ETGO_SF_ENTITY.ISDELETE`,
so a direct API `DELETE` call still succeeded. ETP-4745 closed that gap; `tax`
needs a re-push (`make regen ONLY=tax PUSH_TO_NEO=1` + `./gradlew export.database`)
to pick up the real server-side enforcement — see `docs/feedback.md`.

---

### 9c. Standardized delete UX, the unified delete criterion & `listViewOptions.hideBulkDelete` (ETP-4656 · ETP-5111)

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
directly from a hand-written `windows/custom/{window}/index.jsx` wrapper (no
window does so today — `contacts`, the only former user, migrated to the
generic action in ETP-5758). **That object REPLACES — it does not merge with —
the `listViewOptions` the generated page already passes to `ListView`**, so the
wrapper must repeat every flag the generated page sets (`hidePrint`,
`hideCounter`, `hideLink`, …) alongside `hideBulkDelete`, or those get silently
dropped. `tools/app-shell/src/windows/custom/contacts/index.jsx` shows the
replace-not-merge pattern (it repeats the generated flags, without
`hideBulkDelete`).

> **ETP-4644:** the selection bar's "Vista Previa" (eye) button — and its
> `listViewOptions.hideEye` / `hideEyeCount` opt-out flags — were removed
> entirely from `ListView.jsx`. The button had no working backend and did not
> apply to any window, so it is gone unconditionally, with no flag needed or
> supported anymore.

**`contacts` migrated (ETP-5758):** `contacts` used to set `hideBulkDelete: true`
and render its own, older bulk delete (a trash button via
`selectionBarRightActions` plus its own confirm dialog). That dialog closed
before the deletes ran and left the trash button enabled, so a user could
launch several batches over the same rows. It now uses the generic action,
whose dialog stays open and read-only (buttons disabled, no Esc/overlay close)
until the batch settles, while the toolbar button is `disabled={bulkDeleting}`.
A window that opts out with `hideBulkDelete` and rolls its own bulk delete must
give it the same in-flight guard — in practice, by building it on
`useBatchDeleteDialog` (below) rather than by hand.

**One implementation for every bulk delete (ETP-5758).** `useBatchDeleteDialog`
(`tools/app-shell/src/hooks/useBatchDeleteDialog.jsx`) + `DeleteConfirmDialog`
are the app's single "selection → confirm-with-count → batch delete → one outcome
toast" implementation. `useBulkRowDelete` is now a thin wrapper over it that only
supplies the per-row `DELETE /{entity}/{id}` (with the backend message and the
HTTP status on failure) and the `bulk-delete` testid scope; its public shape
(`requestBulkDelete`, `bulkDeleteDialog`, `deleting`) is unchanged. Every
multi-record delete goes through the generic hook:

| Surface | How |
|---|---|
| `ListView` / `ListModalWindow` "Delete selected" (every generated grid, Contacts, Cuentas financieras…) | `useBulkRowDelete` → `useBatchDeleteDialog`, testids `bulk-delete-*` |
| Financial Account → Movimientos / Extractos importados | `useBatchDeleteDialog` directly, testids `batch-delete-*` |
| `DetailView` lines bulk delete — primary lines (classic toolbar **and** inlineEditable toolbar) and every secondary table tab | ONE `useBatchDeleteDialog` per DetailView; each request carries its own `deleteOneFn` (`buildChildRowDeleteFn` in `lib/batchDelete.js`) and `onOutcome`, testids `lines-bulk-delete-*` |
| `amortization` lines table, `assets` Amortización panel | `useBatchDeleteDialog` directly, testids `batch-delete-*` |

`requestBatchDelete(items, { deleteOneFn, onOutcome })` — the optional second
argument overrides the hook-level functions for that request only, which is how
one DetailView dialog serves the primary lines and every secondary tab.

**The in-progress state lives in `DeleteConfirmDialog` (ETP-5758).** After the
user confirms, the dialog does **not** close: the destructive button turns into
a 14px spinner + *"Eliminando…"* (`bulkDeleteInProgress`), the description
becomes *"Eliminando {count} registro(s). Esto puede tardar unos segundos."*
(`bulkDeleteInProgressMessage`), Cancel is disabled, the corner X is hidden,
Escape / overlay clicks are swallowed, and the dialog content carries
`aria-busy="true"`. It closes only once the whole batch has settled, and then the
single outcome toast fires. A double click on confirm cannot start a second batch
(ref-guarded in the hook, not just `disabled`), and a `requestBatchDelete` made while a
batch is running is ignored. If the host's `onOutcome` throws, the hook logs it, shows the
generic `networkError` toast and still closes the dialog and releases the lock. Before ETP-5758 the DetailView
lines bulk delete (primary + secondary tabs) went through the promise-based
`confirmDelete` prompt, which closed **before** the DELETEs ran — the same bug
Contacts had; `confirmDelete` now only serves single-line deletes. The
amortization lines table and the assets Amortización panel deleted with **no
confirmation at all**; they now ask first.

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

Dropping the idle bar also drops the toolbar/body separator that comes with it
(ETP-5509 — the line is a `border-b` on the native bar, see `docs/list-filters.md`
→ "Toolbar layout"). A slot that draws its own toolbar draws its own line, as
`AccountsHeaderTable.jsx` does.

`ListView` forwards its authoritative **`selectedRows`** in the Table-slot props, read-only for the
slot. **What you must do with it is destructure it out of the spread**, whether or not you use it:

```jsx
function MyHeaderTable({ data, meta, selectedRows, ...props }) {
  //                                  ^ keep this, even unused — see below
  return <DataTable {...props} data={data} /* selectable stays at its default */ />;
}
```

`selectedRows` is also the name of `DataTable`'s own internal selection state, so letting it
through the spread reads as a controlled-selection prop `DataTable` does not have.
`artifacts/financial-account/custom/AccountsHeaderTable.jsx` — the slot this whole mechanism was
built for — carries it under an explicit `// eslint-disable-next-line no-unused-vars` with a comment
saying not to delete it. That is the current state of the art: the prop is a **fence**, not an
input.

> **Historical, and no longer recommended: the toolbar swap.** A slot used to be expected to
> *unmount its own toolbar* while a selection existed (`{!selectionActive && <MyToolbar />}`,
> derived from `selectedRows`), so `ListView`'s selection bar read as its replacement. ETP-4972
> turned that bar into a viewport-fixed portal to `document.body`, at which point the two were no
> longer competing for the same space and the swap only cost the user the toolbar's other actions —
> and ETP-5111 removed it from `AccountsHeaderTable`, its only consumer. **No window does this
> today.** If you ever do bring it back, the one trap worth knowing is: derive `selectionActive`
> from the `selectedRows` prop and **never** mirror the selection into slot-local state via
> `onSelectionChange` — `DataTable` empties and prunes its internal `Set` silently from its
> `clearSelectionTrigger` / `deselectTrigger` effects **without** calling `onSelectionChange`, so a
> mirror still reads "selected" after a successful bulk delete or a cancel and the toolbar never
> comes back. That is the bug that cost this window its bulk delete once already.

`ListView` also forwards **`userRefreshTrigger`** (ETP-5387): a counter that starts at `0` and is
bumped **only** when the user presses the toolbar Refresh button. It exists for slots that fetch
their own dataset instead of rendering `ListView`'s paginated `data` — the Refresh button's
`hook.refresh()` reloads that page, which such a slot never shows, so without this signal Refresh
does nothing visible there. React to a *change* of the value (the value you mount with is a baseline,
not a request) and show your own loading state; see `artifacts/chart-of-accounts/custom/AccountTreeView.jsx`.
It is deliberately not bumped by `onDataMutated` reloads (save, delete, toggle), which should stay
quiet, nor by the host's `refreshTrigger` **input** prop on `ListView` (a host bumps that to make
`ListView` itself reload — same idea, opposite direction). A slot that spreads its remaining props
onto a DOM element must destructure `userRefreshTrigger` out of the spread, like `selectedRows`.

`ListView` also forwards **`windowReadOnly`** (ETP-5593). It is the same view-only flag that hides
New in the toolbar and Print / bulk delete in the selection bar: the runtime read-only access tier,
or `window.readOnly`. A
custom table with its own inline edits must disable them when it is `true`. The chart-of-accounts
status switch does this. `DataTable` ignores the flag.

**The toolbar Share button copies the page URL (ETP-5593).** The link button in `ListView`'s idle
bar (`list-share-link`, hidden by `hideLink`) had no handler on any list; it now calls
`useCopyPageLink()` (`hooks/useCopyLinkAction.js`), which copies `window.location.href` with the
`linkCopied` / `copyFailed` toasts. Not-posted documents' own toolbar uses the same hook, so pages that build
their own toolbar should use it too. Anything a window keeps in the query string travels with the
link. For example, chart-of-accounts keeps `q` and `accountType` there, so a shared link reproduces
the filtered tree. Put filter state in the URL when you want Share to reproduce it.

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

**The reason is named only when exactly ONE record is selected (ETP-5085, narrowed by
ETP-5111).** Counting failures without saying why leaves the user with nothing to act on — reading
"No se pudo eliminar ninguno de los 1 registros seleccionados" after deliberately picking a single
undeletable row is the worst case of it. So `runBatchDelete` returns `errors` (the rejection reason
per failed item, aligned with `failed`) and `toastBatchDeleteOutcome` shows that sentence **instead
of** the counter message when `total === 1`. For anything larger it never does: the two
`…WithReason` branches that used to append a shared reason to the partial-failure and all-failed
counters are gone, and so are their keys.

**Why it was narrowed.** ETP-5111 gave the bulk trash button on the Financial Account detail tabs a
meaning that depends on the size of the selection — one row means Payment Removal, several rows mean
a plain delete (see `docs/generated-custom-windows/financial-account.md`, "Unified delete rule").
Once a multi-row batch can fail for genuinely per-row reasons, a single sentence hoisted out of it
stops summarising the batch and starts making a claim about rows it may not describe, with no way
for the user to tell which row it came from. A one-record selection is the only case where the
sentence is unambiguously about the thing the user picked.

Two guards still gate that single-record sentence, and they are the point of the design:

- **Only a 4xx counts as a reason.** `Promise.allSettled` catches every rejection alike — a dropped
  connection, a `TypeError` from a bug in `deleteOneFn`, a 500 whose message is by design a log
  pointer ("Please check logs for details"). A 4xx is the one case where the server answered "no,
  because …" on purpose. So `deleteOneFn` must reject with an error carrying `status` (as
  `useCreateMovement.postAction` and, since ETP-5111, `useStatementActions.post` do) for its message
  to be shown at all. Parsing the message is only half the job; without the status it is discarded.
- **A message that is only a status code is discarded** — the counter message is better than a
  code. `OPAQUE_REASON_RE` in `lib/batchDelete.js` screens **two** shapes, not one:
  `/^(HTTP\s*)?\d{3}\b/` for `HTTP 409` / `409 Conflict`, and `/^\S+\s+\d{3}$/` — one word followed
  by a three-digit number and nothing else — for the `<word> <status>` shape. That second half was
  added in ETP-5111 because it is exactly what `useEntity.js`'s `extractErrorMessage` returns as its
  last resort for a 4xx with a **non-JSON** body (a container error page, say):
  `` `${translate('error', 'Error')} ${res.status}` `` → literally **`Error 404`**. That string
  satisfies every other guard — it is a 4xx and it has a message — so without the second pattern the
  user would read "Error 404" as the explanation, and it is not even translated, since no locale
  defines an `error` key. ETP-5111 made this reachable app-wide by wiring `errors` through
  `useBulkRowDelete`, whose `deleteOneFn` calls exactly that helper, so it is screened once here
  rather than in each caller. A genuine business sentence never has that shape.

A third guard survives in `commonFailureReason` — several distinct reasons collapse to no reason,
since one sentence cannot summarise them and picking one failure would imply it explains all of
them — but it can no longer change an outcome, because only a one-record batch reaches a
reason-bearing branch at all. It is kept for the helper's own coherence, not because anything
depends on it.

The reason is run through `translateBackendError`, so a backend literal shows in Spanish only if it
has a `BACKEND_ERROR_MAP` entry + `backendError.*` key — the same contract as every per-row surface.
**Feeding the reason is opt-in, and a new bulk-delete surface has to do two things or it silently
falls back to counters:** pass `errors` to `toastBatchDeleteOutcome`, and reject with an error that
carries `status`. Two hooks do both — `useBatchDeleteDialog` (Financial Accounts' Movimientos and
Extractos importados tabs) has since ETP-5085, and the generic **`useBulkRowDelete`** since ETP-5111
(it previously threw a bare `new Error(extractErrorMessage(...))` and omitted `errors`, so every
`ListView` grid multi-select — Cuentas included — degraded a single-row refusal to the counter
message and discarded the server's own 409). Since ETP-5758 no caller builds the toast itself any
more: `DetailView`'s lines bulk delete (`buildChildRowDeleteFn`), `AmortizationLinesTable` and
`AssetsAmortizationPanel` all go through `useBatchDeleteDialog` and reject with `status`, so a
one-row refusal there names the backend's reason too. So
ETP-5111's narrowing has one blast radius (`useBatchDeleteDialog`, which could previously show a
reason for a multi-row batch) while its `useBulkRowDelete` fix *adds* the single-row reason to every
generic grid that never had it.

**Retired in ETP-5111: `isRowDeletable` (`ListView`) and `disabledReason`
(`BulkDeleteSelectionBar`).** Both existed to pre-disable a trash button from row eligibility.
`isRowDeletable` was §9d of this guide — a `(row) => boolean` predicate `ListView` evaluated over
the current selection, disabling the delete button and switching its tooltip to
`bulkDeleteBlockedTooltip` when any selected row failed it. `disabledReason` was the hand-rolled
equivalent for the two Financial Account tabs that mount `BulkDeleteSelectionBar` directly instead
of going through `ListView`. The prop, its JSDoc, the `blockedDeleteCount` computation, the
`disabled`/`title` branch on the button and the `bulkDeleteBlockedTooltip` key are all gone.

**The criterion that replaced them — "let them try, and explain the refusal".** The bulk trash
button is never disabled because of *what* is selected; only because a delete is in flight. A row
the server will refuse is attempted, comes back as a per-row failure, and is reported by the outcome
contract above. There is deliberately **no supported way for a window to pre-block the generic trash
button any more**, and that absence is the feature: `isRowDeletable` was a documented invitation to
re-fragment this rule one window at a time, and the three delete surfaces of `financial-account` had
already drifted into three mutually inconsistent criteria (ETP-4871, ETP-4921 + PSD2, ETP-5085)
before ETP-5111 pulled them back together. A window whose rows are conditionally deletable expresses
that on its **per-row** affordance — a kebab item that pre-checks and toasts, as
`MovementRowKebab` + `movementActionEligibility.js` do — or lets the backend's 4xx do the talking.
Never by graying out a button that covers a heterogeneous selection. A sentinel test in
`ListView.bulkDelete.vitest.jsx` asserts the rule in the positive (rows with `deletable: false`
selected → the button stays enabled with its plain `delete` title), so reintroducing the prop breaks
a test instead of passing in silence.

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
`bulkDeleteAllFailed`. Three keys from this family were **removed** in ETP-5111 and must not be
reintroduced: `bulkDeleteAllFailedWithReason` and `bulkDeletePartialFailureWithReason` (the
multi-row reason variants, see above) and `bulkDeleteBlockedTooltip` (the disabled-button tooltip
that came with `isRowDeletable`). Note `es_AR.json` never carried any `bulkDelete*` key at all —
do not assume three-way parity in this family when adding one.

**Real examples:** the generic mechanism applies to every window using the
standard `ListView` (nothing to declare). `contacts` is the one window that
currently opts out (see the known gap above).

### 9e. `SelectionToolbar` — the floating bulk-selection toolbar (ETP-4972)

Every checkbox-selectable list/tab (grid multi-select in `ListView`, and every
lines table that supports row selection — Sales Order, Physical Inventory,
Amortization, Assets' Amortization Plan tab, Financial Accounts' Movimientos/
Extractos tabs, the Periods panel's document bulk-open/close bar, contacts'
secondary tabs) shares one component for the bar that appears once ≥1 row is
checked: `tools/app-shell/src/components/contract-ui/SelectionToolbar.jsx`.
It replaces the pre-ETP-4972 `LinesSelectionBar` (kept only as a one-line
re-export shim, `LinesSelectionBar.jsx → SelectionToolbar.jsx`, for stragglers
importing the old filename — do not add new imports of it).

**Architecture — a true viewport-fixed portal, not an anchored one.** The old
`LinesSelectionBar` was portaled to `document.body` with `position: fixed`,
but its `top`/`left` came from `getBoundingClientRect()` on a sentinel
`<div>` placed at the end of the scrollable list (some callers additionally
tracked it via a `ResizeObserver` on a `barAnchorRef`). On a long list, once
that sentinel scrolled out of view, the "fixed" bar scrolled out of view with
it — a "floating" bar that wasn't actually anchored to the viewport.
`SelectionToolbar` has no ref/rect-measuring code at all: it portals to
`document.body` and hardcodes real viewport coordinates —
`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)` —
so it is bottom-center of the screen unconditionally, regardless of list
length, scroll position, or which container it's logically nested under.
That bug class cannot recur because there is no measured rect left to go
stale.

**Additive, not a swap, at the `ListView` idle-bar level.** Before ETP-4972,
`ListView` rendered the selection bar and the idle filter bar (Filtros,
ViewToggle, Nuevo, …) as either branch of one ternary occupying the same DOM
slot — selecting a row replaced the idle bar outright. Since the selection
bar is now a portal that floats independently of everything else on the
page, `ListView` renders both as independent siblings: the idle bar **stays
visible** while rows are selected, and the floating pill appears additively
on top. (This is unrelated to the slot-level "swap" described in §9c above —
a custom `headerTable` slot's *own* hand-built toolbar still unmounts while a
selection is active, because that toolbar and the grid live in the same
slot; see the corrected note there.)

**A filter change MUST clear the selection (QA finding, ETP-4972).** Any
component that combines its own filtering state with its own selection state
(checkbox `Set`/array feeding a `SelectionToolbar`) must clear that selection
— and, for `ListView`, bump `clearSelectionCounter` via `clearSelection()`
rather than a bare `setSelectedRows([])`, so `DataTable`'s own internal
checkbox `Set` resets too (see its `clearSelectionTrigger` effect) — whenever
a filter changes the visible row set. Otherwise a destructive bulk action
(e.g. "Eliminar") can fire against rows the user is no longer looking at,
which is exactly the QA-reported risk: select rows, change a filter, the
floating pill stays up over records that scrolled out of the filtered view.
**A sort-only change must NOT clear the selection** — reordering the same
rows doesn't change which ones are visible, so treat this as a bug if someone
"fixes" it by folding sort state into the same effect. The fix lives in a
`useEffect` keyed on the component's filter state (never its sort state),
guarded by a "skip the first render" ref so mounting doesn't spuriously clear
an initial selection. Implemented in:
- `ListView.jsx` — keyed on `[columnFilters, effectiveFilter, advancedFilterPart]` (covers column filters, subset/quick filters, the advanced-filter popover, `handleClearAllFilters` and `applyPreset`, since all of them flow through those same state variables).
- `windows/custom/financial-account/MovementsTab.jsx` — keyed on `[filters, advancedFilter]`.
- `windows/custom/financial-account/ImportedStatementsTab.jsx` — keyed on `[search, dateRange, status, advancedFilter]`.

A component whose selection is scoped to a sub-view that already unmounts on
navigation needs no separate fix — e.g. `PeriodsExpandablePanel.jsx` already
clears `selectedDocIds` inside `toggleExpand` because the visible documents
are only ever the currently-expanded period's, and `AssetsAmortizationPanel.jsx`
clears on `[lines]` because it has no filter UI of its own.

**Composition — children, not a data-driven `actions[]` prop.**
`SelectionToolbar` is deliberately a dumb positioning/chrome "shell": it owns
the portal, the true fixed placement, the dark-pill visual chrome (radius,
shadow, enter/exit slide animation), a 1px divider rendered after every
top-level child, and a trailing close (`X`) button that calls `onClose`. It
does **not** impose a generic `actions[]` shape on callers — the selection
counter, action buttons, and any destructive "Eliminar" affordance are all
passed as plain `children`, one top-level element per segment (a divider is
auto-inserted after each):

```jsx
<SelectionToolbar
  visible={selectedRows.length > 0}
  onClose={clearSelection}
  closeTitle={ui('close')}
>
  <span className="text-sm font-medium">
    {ui('selected').replace('{count}', selectedRows.length)}
  </span>
  <div className="flex items-center gap-2 h-10">
    {/* action buttons */}
  </div>
</SelectionToolbar>
```

Because the shell no longer provides its own cancel/X affordance for callers
to duplicate, any caller migrating from the old `LinesSelectionBar` (or a
hand-rolled bar, like `contacts`' former `selectionBarRightActions` and Financial
Accounts' `BulkDeleteSelectionBar`) should **drop its own standalone X
button** — `SelectionToolbar` always renders one as the trailing segment.

**Gotcha — use a plain `<button>`, not the shared shadcn `<Button
size="sm">`, for bulk-toolbar action buttons.** `Button`'s `size="sm"` bakes
in `text-xs` plus a `[&_svg]:size-4` descendant-selector icon rule; that
selector's specificity beats a child icon's own `h-3.5 w-3.5` classes
regardless of Tailwind/twMerge class order. Two text-bearing action buttons
in this toolbar — `BulkDocumentAction.jsx`'s "Procesar"/"Procesado masivo"
and `BulkInvoiceFromShipment.jsx`'s "Crear factura" — hit exactly this: they
rendered at visibly different icon/text sizes until both were rewritten as
plain hand-rolled `<button>` elements with the same explicit classes,
matching Figma's "Size: md" spec (padding `7px 12px`, gap `4px`) instead of
inheriting shadcn's baked-in sizing. Reach for a plain `<button>` (styled
with the `--floating-toolbar-*` CSS variables, same as the shell itself) for
any new bulk-toolbar action button, rather than `<Button size="sm">`.

**Icons: lucide-react, deliberately not Figma's "Iconic" library glyphs.**
The Figma spec for the two text-bearing buttons above sources its icons
(`file-plus`/`file-checkmark`) from the "Iconic" icon library, whose glyphs
draw the plus/check as a badge overlapping the file's corner with a heavier
stroke — visually different from this app's lucide-react set (`FilePlus`/
`FileCheck`), which draws the same glyphs contained inside the file body
with a thinner stroke. This is a **confirmed, deliberate decision, not a
drift from Figma to fix**: lucide-react's versions were kept for visual
consistency with every other icon already in this toolbar (`Trash2`, `X`,
`Printer`, `Copy` — all lucide, thin stroke) rather than pixel-matching
Figma's specific icon-library glyph. Do not "fix" this back to Iconic's glyph
shape without re-confirming with design first.

**Real examples:** `ListView.jsx` (grid multi-select), `DetailView.jsx` (two
usages), `AmortizationLinesTable.jsx`, `AssetsAmortizationPanel.jsx`,
`tools/app-shell/src/components/financial-accounts/BulkDeleteSelectionBar.jsx`
(Financial Accounts' Movimientos/Extractos tabs), `windows/custom/calendar/
PeriodsExpandablePanel.jsx` (document bulk-open/close), `windows/custom/
contacts/index.jsx`.

#### The `bulkActions` slot contract — refetch in place, never reload the page (ETP-5302)

`ListView`'s `bulkActions` prop is a **plain function**, not a component: it is
invoked as `bulkActions({ ... })` inside the selection toolbar's JSX, so
anything reached from it must stay hook-free (see the ETP-5209 note in
`BulkDocumentAction.jsx` — a hook whose call count depends on whether the
toolbar is mounted produces *"Rendered more hooks than during the previous
render"* in production). The context object it receives:

| Key | What it is |
|---|---|
| `selectedRows` | the checked rows, full row objects |
| `clearSelection` | clears the checkbox `Set` *and* bumps `clearSelectionCounter` so `DataTable` resets too |
| `token`, `apiBaseUrl`, `windowName` | wiring for the per-row calls |
| `api` | the list's data hook, for callers that need more than a refetch |
| `refresh` | **ETP-5302** — in-place refetch of the current page of rows. Identity is stable across renders (it reads `hook.refresh` through a ref), so it is safe in a dependency array |

**The rule: a bulk action ends with `clearSelection()` → toast → `refresh()`.**
It must not call `window.location.reload()`.

Until ETP-5302 every bulk host did reload the whole browser page, which threw
away scroll position, the active filters and the entire SPA boot. The reload was
never about the data: it was the mechanism that let the result toast survive,
because the result was written to `sessionStorage` under `bulkActionResult` and
`useBulkActionToast()`'s mount effect read it back on the *next* mount. Showing
the toast directly removes the only reason to reload.

```jsx
// inside a bulkActions slot function
const result = await runMyBulkAction(...);   // → { ok, omitted, failed }
if (refresh) {
  clearSelection();
  showBulkActionToast(ui, result);           // from '@/hooks/useBulkActionToast'
  refresh();
  return;
}
// Host mounted outside ListView's bulkActions slot: legacy persist-then-reload.
persistBulkActionResult(result);
setTimeout(() => { clearSelection(); window.location.reload(); }, 1500);
```

**Keep the fallback branch.** `refresh` only exists for a host mounted inside
`ListView`'s slot; a bulk host mounted anywhere else still has to hand its result
to the next mount, and dropping the branch would silently lose the toast instead
of failing loudly.

**Use the exported `showBulkActionToast(ui, result)`, not `useBulkActionToast()`,
when you already hold a `useUI()` result.** The hook's real job is the mount
effect that *drains* `sessionStorage`; mounting it just to reach `showResult`
also installs that effect, and it re-runs whenever `ui` changes identity — so it
consumes the caller's own persisted result before the fallback reload can hand it
to the next mount. `useBulkActionToast()` belongs at the list level (it is called
once in `ListView.jsx`, covering every window), not inside an action.

A bulk action that produces a result and does *not* refetch is a bug of its own
class, not merely a missed nicety: `BulkInvoiceFromShipment.jsx` ("Crear
Factura") neither reloaded nor refreshed before ETP-5302, so the rows it had just
invoiced kept rendering a stale invoicing status with nothing on screen hinting
they were out of date.

**Hosts on this contract:** `BulkDocumentAction.jsx` (all nine mounts),
`artifacts/sales-order/custom/BulkOrderMoreMenu.jsx`,
`artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx`,
`artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx`. The two
`runBulk*Action` helpers behind the order kebabs now **return** `{ ok, failed }`
instead of writing it to `sessionStorage` themselves — persisting is the caller's
decision, and only on the fallback path.

#### `BulkDocumentAction`'s `actionMode` — bulk actions that are not DocActions

`BulkDocumentAction.jsx` provides the "Procesar"/"Procesado masivo" button, its
modal, the action dropdown, the per-row `Promise.allSettled` loop and the
ok/failed toast. The button text comes from the `labelKey` prop. The nine
document-action mounts all pass `labelKey="process"` ("Procesar" / "Process");
the accounting mounts pass `labelKey="post"` ("Contabilizar", four windows) and,
since ETP-5302, `labelKey="unpost"` ("Descontabilizar" — first `goods-receipt`
and `goods-shipment`, since ETP-5692 also `sales-invoice` and `purchase-invoice`
with their own CO-gated pair; see the pair below). `"bulkCompletion"` ("Procesado masivo")
is only the prop default, which no window currently relies on.
Inside the dropdown, `CO` is labeled **Confirmar** /
**Confirm** (`labelKey: 'confirm'`) and `RE` **Reactivar** / **Reactivate**.
Until ETP-5302 the button read "Confirmar" (`labelKey="confirmBulk"`, a key that
no longer exists) and the `CO` entry read "Procesar" (`labelKey: 'book'`) — the
two were swapped because on a window like `matched-purchase-invoices`, whose
dropdown only offers *Contabilizar*/*Descontabilizar*, "Confirmar" named an
action that was never on offer. It used to be **DocAction-only**: the per-row call was always
`POST …/{id}/action/documentAction` with a `{docAction}` body, so each
`buildActions` value had to be a DocAction code (`CO`, `RE`, …).

`actionMode` (ETP-5075) opens it to any window whose bulk actions are *generic
NEO actions* instead:

| Value | Per-row call | Each `buildActions` value is |
|---|---|---|
| `'documentAction'` (default) | `POST …/{id}/action/documentAction`, body `{docAction}` | a DocAction code |
| `'neoAction'` | `POST …/{id}/action/{value}` | an action name (e.g. `post`, `unpost`) |

The default keeps every pre-existing consumer byte-identical. First user:
`artifacts/matched-purchase-invoices/custom/MatchedInvoiceBulkActions.jsx`, whose
window has no `documentStatus`/DocAction at all — its bulk actions are the
accounting `post`/`unpost` served by `DocumentPostingService`, the same endpoint
its detail kebab uses.

In `'neoAction'` mode the component wraps `useNeoAction.execute` in an adapter
that **throws** when the result is not successful. This is load-bearing, not
ceremony: `useNeoAction` *resolves* with `{ success: false }` on failure (unlike
`useDocumentAction`, which throws — its own javadoc draws the contrast), while
`handleDone` classifies failures via `Promise.allSettled`'s `'rejected'` status.
Without the adapter every failed row is silently counted as a success and the
toast reports "N ok, 0 failed" while nothing happened. If you add a third
`actionMode`, normalise its error contract the same way.

In `'neoAction'` mode each action object returned by `buildActions` may also carry
two optional keys:

| Key | Effect |
|---|---|
| `neoActionName` (ETP-5414) | Wire action name used in the URL instead of `value`. Lets `value` stay the user's intent (what `rowFilter` receives) while the request hits the real AD button, e.g. `{ value: 'confirm', neoActionName: 'processNow' }`. |
| `neoActionBody` (ETP-5445) | Plain object sent as the JSON request body, passed to `useNeoAction.execute(recordId, actionName, requestBody)`. Needed when the action is an AD process whose mandatory parameters are validated at the request root — without it NEO answers "Missing mandatory parameter". Absent → the body stays the literal `'{}'`, so every existing caller is byte-identical. Ignored in `'documentAction'` mode. |

First user of `neoActionBody`: Internal Consumption's bulk **Confirmar**
(`tools/app-shell/src/windows/custom/internal-consumption/index.jsx`), which sends
`{ fieldValues: { processNow: 'CO' }, action: 'CO' }` to `processNow` — the exact
body the form's draftMode Confirm sends.

Pair it with `rowFilter` when a selection can legitimately mix states: returning
a string from `rowFilter(row, action)` pre-blocks that row with that message
(shown in the failure list) instead of sending a request the backend will reject
with an opaque error.

**The dialog's confirm button says "Aceptar" / "Accept" (`accept`), not
"Completado" (`done`) — ETP-5302.** `done` translates to *"Completado"*, which is
the name of a document **state**: the very list behind the dialog has an "Estado
doc." column showing it. On a dialog whose whole subject is document actions,
that button read as if pressing it would mark the selected documents as
completed. `accept` is a new key in all three locales; `done` was deliberately
left alone because `RecordCreateModal.jsx` still uses it.

#### `preUnpostActions` — replaying the detail kebab's "unpost first" rule in bulk

Some document actions must **reverse the record's accounting before they run**.
The rule is declared per window in `decisions.json` as `preUnpost: true` on a
`menuActions` entry (today: `sales-invoice`, `purchase-invoice`, `amortization`),
and it is implemented once, in `tools/app-shell/src/lib/preUnpost.js`:

| Export | Contract |
|---|---|
| `isPosted(row)` | `true` only for `posted === 'Y'` / `true`. The AD *Posted status* domain also carries `T`, `E`, `D`, `p`, `i` — **none of which mean "posted"** |
| `runPreUnpost({ recordId, record, enabled, execute })` | → `{ ran, success, message }`. `ran: false` means the step did not apply (not enabled, or the record was not posted) and callers treat that as success |

It is a plain module, **deliberately not a hook**, because `BulkDocumentAction`
is reached from the `bulkActions` slot, which `ListView` invokes as a flat
function call (the ETP-5209 constraint above).

Both call sites now go through it: `DetailMoreActionsMenu.jsx` (which had the
rule inlined, and duplicated across its two branches — observable behaviour
unchanged) and `BulkDocumentAction`'s new `preUnpostActions` prop:

```jsx
<BulkDocumentAction {...props} labelKey="process" preUnpostActions={['RE']} />
```

Each row then runs *unpost → document action*. A failed unpost **aborts that
row** — a document still carrying its accounting entries is never reactivated —
and the row is reported with the translated backend message like any other
failure.

**It is opt-in per window on purpose.** Invoices need it: Core's
`C_INVOICE_POST` raises `@InvoiceDocumentPosted@` ("Factura contabilizada") if
`RE` arrives while `Posted='Y'`. Orders must **not** have it: `C_ORDER_POST1` has
no posted-state guard on its `RE` branch at all, so unposting there would be a
gratuitous accounting reversal for no functional gain. Do not "harmonise" this by
applying `preUnpostActions={['RE']}` to every window that offers `RE`.

#### `buildUnpostActions` / `unpostRowFilter` — the bulk "Descontabilizar" pair

A mirror of `buildPostActions`/`postRowFilter`, exported from the same file:

| Export | Behaviour |
|---|---|
| `buildUnpostActions(rows)` | offers `{ value: 'unpost', labelKey: 'unpost' }` when **any** selected row is posted |
| `unpostRowFilter(row, action, ui)` | blocks a not-posted row with `ui('bulkRowNotPosted')` |

Mount it as a third `BulkDocumentAction` instance with
`actionMode="neoAction"` and `labelKey="unpost"` — it hits
`POST …/{id}/action/unpost` (`DocumentPostingService`), the same endpoint the
detail kebab's *Descontabilizar* already used, so no backend or i18n work was
needed.

**Why a separate pair rather than teaching `buildPostActions` to also emit
`unpost`:** a window opts into the standalone unpost explicitly, and only a
window whose detail kebab also declares a standalone *Descontabilizar*
(`menuActions` entry with `action: "unpost"`) should mount the unpost pair — a
window must not grow the action in the bulk bar only. ETP-5302 shipped with
`sales-invoice` and `purchase-invoice` deliberately excluded (invoice unposting
lived only *inside* Reactivate, via `preUnpost`); **ETP-5692 reversed that**:
both invoice windows now declare the `unpost` menu action, offer it in the row
kebab (`buildInvoiceRowQuickActions`) and mount a bulk unpost button, so an
invoice can be unposted and stay Completed. Reactivate keeps its own `preUnpost`
step. The invoice button uses its own pair, `buildInvoiceUnpostActions` /
`invoiceUnpostRowFilter` in `windows/custom/shared/useInvoiceWindow.js`, which
also requires status `CO` (a non-Completed row is rejected with
`bulkRowNotCompleted` and counted as skipped — like every row filter, the reason is
not shown: the result toast only carries counters, ETP-5316); the posted-only pair
above is unchanged for the albarán windows.

**Why its own button rather than a second option inside "Contabilizar":** the
dropdown lives under a button whose label is the action — a window offering both
would present *Descontabilizar* under a button reading "Contabilizar", named as
the opposite of what it does. Since `buildUnpostActions` only yields an action
when a posted row is selected and `buildPostActions` only when a
processed-not-posted one is, the two buttons are rarely on screen together
anyway.

---

### 9f. The two shared delete-confirmation components — `DeleteConfirmDialog` and `LifecycleConfirmModal` (ETP-4500 · ETP-5111)

**Pick by what is at stake, and pick before you write anything:**

| Component | Job | Reach for it when |
|---|---|---|
| `components/contract-ui/DeleteConfirmDialog.jsx` | neutral *"¿Estás seguro de que deseas eliminar N registro(s)?"* | the delete has **nothing to enumerate** — one row or a thousand, draft records, or an action that will turn out to be refused |
| `windows/custom/shared/LifecycleConfirmModal.jsx` | the red **cartel**: names each downstream effect and warns | the action really will undo something — a reconciliation, an accounting entry — and the user should see what, before confirming |

**Picking the enumerating one when there is nothing to enumerate is the exact bug ETP-5111 kept
re-discovering**, in three different disguises: a fallthrough that described a draft as posted, then
a cartel shown for a delete that could not proceed at all. The guidance is one line —
*never let a confirmation promise an effect it will not deliver* — and it is a stronger rule than
"branch per state", because it also catches the case where every branch is correct and the dialog
is still the wrong dialog.

#### `DeleteConfirmDialog` (extracted in ETP-5111)

Lifted verbatim out of `useBatchDeleteDialog` — same markup, same i18n keys
(`bulkDeleteConfirmTitle` / `bulkDeleteConfirmMessage`), same `data-testid`s — so a per-row delete
and a bulk delete of the same record are not two dialogs that merely resemble each other; they are
this component, rendered twice. The hook now renders it (output byte-identical), and the Movimientos
row kebab renders it directly with `count={1}`.

Props: `open`, `count`, `deleting`, `onConfirm`, `onClose`, and `testIdScope` (ETP-5758, default
`batch-delete`). The scope prefixes every testid — `Dialog__<scope>`, `DialogContent__<scope>`,
`DialogTitle__<scope>`, `DialogDescription__<scope>`, `Button__<scope>-cancel`, `<scope>-confirm`,
`<scope>-spinner` — so `useBulkRowDelete` keeps publishing the `bulk-delete-*` family ListView's
specs use while the financial-account surfaces keep `batch-delete-*`. While `deleting` is true it
renders the in-progress state described in §9c (spinner + *"Eliminando…"*, progress description,
`aria-busy`, not dismissible) — a single-record caller such as the Movimientos kebab or Modelos
fiscales gets it too, with `count={1}`.

It is deliberately **presentational**: no selection state, no delete call, no outcome toast. The
caller owns what confirming means. That is what lets the row kebab keep its own per-row success
message and still show the identical dialog.

**Why the hook is not the reuse vehicle** — worth knowing before you route a single-row action
through `useBatchDeleteDialog` "because it already has the dialog": it owns the outcome toast, whose
counter wording would replace *"Movimiento eliminado"* with *"1 registros eliminados
correctamente."*; it always renders its dialog node, so a long grid pays one hidden Radix `Dialog`
per row; and it gives the caller no way to **decline** after the user has confirmed, which a surface
with a client-side eligibility pre-check needs.

#### `LifecycleConfirmModal`

The one confirm dialog for a destructive **lifecycle** action on a record with downstream effects —
delete, reactivate, unreconcile. Its anatomy is a red title, a subtitle naming exactly which effects
apply, a bulleted list of those effects, a yellow warning box, and a confirm/cancel footer.

**Callers pass pre-resolved strings, not keys.** Each domain owns its own copy and its own state
tiering, then hands this component finished text — `title`, `sub`, `warning`, `confirmLabel`, and
the `itemConciliacion` / `itemTransaccion` / `itemAsiento` pairs (or a ready-made `explicitItems`
array). The component decides only *which* items to show, from the `reconciled` / `hasTransaction` /
`posted` booleans. Four consumer families:
`windows/custom/financial-account/MovementLifecycleConfirmModal.jsx` (Movimientos),
`windows/custom/shared/PaymentLifecycleConfirmModal.jsx` (Cobros/Pagos, itself used by
`PaymentHeaderTableBase`), `components/contract-ui/ReconciliationSplitPanel.jsx`, and
`windows/custom/financial-account/BankConnectionDeleteConfirmModal.jsx`.

**`warning` is optional, and so is the whole body (ETP-5111).** It used to be required in practice:
the yellow box rendered unconditionally, so a domain with *nothing to warn about* could not say so.
Three things are now conditional — the items list (`items.length > 0`), the warning box (`warning`
truthy), and **the padded body wrapper itself** (`items.length > 0 || warning`), because with both
halves hidden it rendered as ~24px of dead space between the subtitle and the buttons. Each half is
guarded separately, so a caller with only one of the two still looks right.

This existed because a confirmation can legitimately have no consequences to enumerate: deleting a
**draft** movement undoes no reconciliation and reverses no journal entry, and the only true thing
left to say is that the delete is permanent. Before this, `MovementLifecycleConfirmModal` had no way
to express that and fell through to its posted-state copy, telling the user a nonexistent accounting
entry would be reversed — see `docs/generated-custom-windows/financial-account.md` ("Unified delete
rule" and the Movimientos kebab bullet) and the `resolveStateKey` entry in `docs/feedback.md`.

**If you write a new consumer**, in priority order:

1. **First ask whether you want this component at all** — if the action has no effects to name, the
   answer is `DeleteConfirmDialog`. Routing effect-less cases away is what Movimientos ended up
   doing, and it is a better fix than making this dialog degrade gracefully.
2. Pass `warning` only when you have something to warn about.
3. Resolve your state tiers with an **explicit branch per state**, never a catch-all `return`
   naming one specific state. That catch-all is what produced the false copy described above, and
   it stayed invisible for exactly as long as an unrelated caller in another file happened to gate
   the unreachable case.
4. Keep the defensive branch even once routing makes it unreachable. Movimientos' `'neither'` tier
   has no live caller any more and is retained on purpose, because deleting it restores the
   fallthrough: a future caller arriving with no flags set would be reported as posted rather than
   getting empty copy. A wrong answer is worse than an empty one, and a coverage report flagging
   that branch is expected rather than a gap.

> **One cosmetic delta, an improvement rather than a regression.** The items `<div>` carried
> `marginBottom: 16`, so a caller that produced an *empty* items list still paid 16px of space above
> its warning box. `PaymentLifecycleConfirmModal` on a **draft** payment is exactly that case
> (`reconciled`/`hasTransaction`/`posted` all false → `items = []`, with a truthy generic
> `paymentConfirmWarning`), so its warning box now sits 16px higher than before ETP-5111. No other
> existing dialog changes at all — the other three consumers always pass a real `warning` and at
> least one item.

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

`addLineGuard` receives current form data and must return `true` to enable adding lines. It gates both the button inside the empty state (`canAddLine` prop) and the `+ Add Line` button in the lines table header. Without a guard, the default gate is the generated `requiredHeaderFields` list (`resolveCanAddLines` in `detailViewHelpers.jsx`): adding is allowed once every listed header field holds a value, and always when the list is empty. `generate-frontend.js` builds that list from the header's `required` + `form` fields the user can fill — it excludes `visibility` `discarded`, `system` **and `readOnly`** (ETP-5676), because a readOnly field such as `grandTotalAmount`/`summedLineAmount`, `documentNo` or `docStatus` is filled by the backend after the save and would otherwise hide the button until then. A field that is only locked by `readOnlyLogic` (e.g. after completion) is still editable in draft and stays in the list.

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

**Footer layout (`LinesBottomSection`, ETP-5756).** The Totals column is `min(520px, max(320px, calc(100% - 469px)))` wide: a flat 520 px whenever the footer row leaves the left column at least 469 px (16 p-2 + 1 divider + 24 px-3 + 96 label + 12 gap + 320 content; every window without a side panel), shrinking to a 320 px floor only when the footer area itself is narrow (e.g. purchase-invoice's 320 px OCR sidebar at 1280x720). `%` follows the real container, not the viewport. `DocumentTotalsPanel` collapses its `pr-12` the same way (`clamp(0px, calc(100% - 456px), 48px)`: 48 px at the full width, 0 when narrow). The Docs and Notes rows are `flex-wrap`; their content has a 20rem (320 px) minimum, so when it no longer fits beside the 96 px label it drops under it instead of being squeezed (chips wrap, the Notes placeholder keeps its width). `DocChip` stays a single-line pill (`max-w-full`): the title is `min-w-0 truncate` (full text in its `title` attribute) while icon, amount and status badge are `shrink-0`, so the badge never drops to a second line.

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

// Data-driven — hide until the record is persisted and completed:
function hideMenu({ data }) {
  return !data?.id || data?.documentStatus !== 'CO';
}
<GeneratedApp {...props} hideMoreMenu={hideMenu} />
```

Use this when menu actions are only valid for persisted records, or when the whole kebab is only meaningful once the document reaches a given status. **Do not** also hide the kebab on the status a `menuAction` needs in order to become visible (e.g. `visibleWhenFieldTrue: "processed"`) — `DetailMoreActionsMenu.jsx` checks `hideMoreMenu` *before* evaluating `menuActions`, so a predicate that hides on that same status blocks the action from ever rendering. This exact mistake shipped on `physical-inventory` (hid on `data?.processed === true`, the very state the `post` action required) until ETP-5360; see `docs/generated-custom-windows/physical-inventory.md` § Design changes — ETP-5360.

**Real examples:** `goods-shipment`/`goods-receipt` (hide ⋮ unless `data?.documentStatus === 'CO'`); `physical-inventory` (hides ⋮ only when `!data?.id`).

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

**Button and cell visuals (ETP-5600, Figma "Fila Contactos / Hover").** Buttons are *sm Round Tertiary*: 32×32, `rounded-full`, no fill at rest, 20px icons, 2px apart (`gap-0.5`), 200ms ease-in. **One icon family (ETP-5600 Figma *Sticky Acciones*):** in the list band the order is Edit, Copy, Mail, kebab, Trash, and every one is the Figma Iconic glyph on the 20×20 frame from app-shell-core `custom-icons.jsx` — `IconicEditIcon`, `IconicCopyIcon`, `IconicMailIcon`, `IconicDotsVerticalIcon` (the kebab), `IconicTrashIcon` (the lucide `Copy`/`Mail`/`MoreVertical` are gone; the testids `Copy__ec6673` / `Mail__ec6673` / `MoreVertical__ec6673` were kept). The document-line strip has no kebab. The trash is drawn on a 24×24 frame for the topbar Delete, and at `size-5` it is exactly the Figma 20×20 trash, so it is not redrawn per size. Colours map to tokens: neutral `#828FA3` is `--sf-icon-outline-secondary` (`index.css`, Figma `icon/outline/secondary`, lighter in dark mode), destructive `#D50B3E` is `--status-destructive-fg`. Edit is the Figma Iconic edit (`IconicEditIcon`, app-shell-core `custom-icons.jsx`, 20×20 frame; the icon testids `Pencil__ec6673` / `Pencil__3b7ec2` were kept stable). Neutral buttons keep the `#828FA3` icon (`--sf-icon-outline-secondary`) in every state and hover to a `#121217` @ 5% overlay; Delete keeps the `#D50B3E` Iconic trash (`IconicTrashIcon`, app-shell-core `custom-icons.jsx`) and hovers to the light destructive tint `#FEF0F4` — never a solid red fill. Focus-visible paints a white fill with a two-ring halo (2px white gap + 4px `#121217`, or `#F53D6B` for Delete). The buttons sit in the Figma *Sticky Acciones* band (`ROW_STICKY_ACTIONS` in `contract-ui/rowVisuals.js`, rendered by `RowQuickActions`): absolute at the right of the reserved cell and exactly as wide as it (`min-w-full`), padding 0 12px, buttons flush right, background `linear-gradient(90deg, rgba(255,255,255,0) 0%, var(--row-hover-bg) 10.58%)`, no border, no shadow — so the column it floats over fades out. The reserved cell itself (`quickActionsColumnClassName` in `DataTable.jsx`) only turns sticky on hover and paints nothing, and reserves at least `QUICK_ACTIONS_MIN_BAND_PX` (100px, `rowVisuals.js`) on the canonical path (`quickActionsReservedWidthPx`), so with 1–2 buttons the band never overflows the cell into the last data column (review W1; before, a 56px/90px cell let a 100px band cover it on hover); a cell-level gradient left a vertical seam at the cell's left edge (ETP-5600 QA pass 2). A custom `rowQuickActions.render` has no band, so its cell keeps the former 12px cell fade. Every `DataTable` row sets `--row-hover-bg` to its own hovered background (see *List row visuals* below), so the fade always ends on the real row colour and no window sets the variable itself. This changes the look of the quick actions on **every** list with `rowQuickActions`. **Document lines share the same buttons:** the hover strip of `InlineLinesPanel` (`data-testid="line-actions"` — extra `rowActions`/Add dimensions, Edit, Delete) renders the very same class strings, which live in `contract-ui/rowVisuals.js` (`ROW_ACTION_BUTTON_NEUTRAL`, `ROW_ACTION_BUTTON_DESTRUCTIVE`) and are imported by both components — change them there, never per component. Line icons are 20px (Edit is `IconicEditIcon`, testid `Pencil__3b7ec2`; Delete is `IconicTrashIcon`, testid `IconicTrashIcon__3b7ec2`), the line strip uses the same 2px gap, so four buttons are exactly the Figma 158px band and fill the 158px action slot (`ACTION_SLOT_WIDTH_PX`, 160 before ETP-5600), the slot is sticky to the visible right edge of the lines scroll box while its actions show (see *Where the hover-action strip goes* below), there is no pill (`QUICK_ACTIONS_USE_PILL = false`), and the Edit button of the line being edited keeps the 5% overlay at rest (`ROW_ACTION_BUTTON_ACTIVE`) as its active cue. The detail topbar's Delete (`DetailDeleteButton.jsx`, `data-testid="action-delete"`, every window) follows the matching *md Rounded Secondary Outline Destructive* spec: 40×40, radius md, 1px `#FBB1C4` border on white, 24px `#D50B3E` Iconic trash; hover `#FEF0F4` + a 1px/2px 5% shadow; focus-visible white + the 2px/4px `#F53D6B` halo.

**List row visuals (ETP-5600, Figma "Fila").** The `DataTable` row look is shared by every list (Sales Invoices, Quotations, Sales Orders, Documents, Purchase Invoices, Contacts, Accounts…) and is chosen by the `rowHoverStyle` prop, a direct `DataTable` prop (not a `decisions.json` key):

| `rowHoverStyle` | Rest | Hover (clickable rows only) |
|---|---|---|
| `lift` (default; `elevated` is the former name, kept as an alias) | transparent, 1px `border-subtle` separator | opaque `bg-card` (white), Shadows/lg (`0 4px 6px -2px rgba(18,18,23,.05), 0 10px 15px -3px rgba(18,18,23,.08)`), raised with `z-10`, **no borders** (its own and the previous row's line turn transparent), **instant** (no colour transition: a fading background made the chips inside the row flash under the shadow) |
| `tint` (explicit opt-out) | transparent | the pre-ETP-5600 `bg-muted/50` wash, `transition-colors` |
| `lift-always` (ETP-5526) | as `lift` | as `lift`, but on **every** row, clickable or not (cursor stays default). For a grid with hover actions and no row click — the attachments table |

- **Separators.** Resting rows keep their 1px separator. A hovered (lifted) row has **no lines at all** — Figma "Fila Contactos / State=Hover" is white + Shadows/lg only: `ROW_LIFT_HOVER_NO_BORDERS` (`rowVisuals.js`) makes the row's own `border-b` and the previous row's `border-b` (its top line in the collapsed-border grid, reached with `[&:has(+tr:hover)]`) transparent, and no cell paints an inset line. This reverts the ETP-5600 pass-1 inset top separator (`[&:hover>td]:shadow-[inset_0_1px_0_…]`), which stacked on the previous row's border into a double line that thinned under the quick-actions band (QA pass 2). The token `--border-subtle` is `#E1E7EF`; the Figma divider (`color/border/menu/divider`) is `#E8EAEF`, a near match kept on the shared token.
- **Selected / checked rows** use Figma's *Selected* colour `#F5F7F9` (`--field-hover`, exact match) and no shadow at rest. Selection always wins over hover: a checked (or active `selectedId`) row keeps its selection colour while hovered, and under `lift` it still gets the hover shadow, so every clickable row gives the same pointer feedback. The inline-lines focus row (`selectedRowId`) keeps its `bg-muted` + focus ring and does not lift.
- **Quick-actions fade.** Each row sets `--row-hover-bg` for its state — `hsl(var(--card))` on a lifted hover, `--field-hover` when checked, the composited tint under `tint` — and the *Sticky Acciones* band (`ROW_STICKY_ACTIONS`) ends its gradient on it.
- **Non-clickable rows** (no `onRowClick`/`onNavigate`) never lift; they keep the shared `TableRow` base `hover:bg-muted/50` — unless the grid passes `rowHoverStyle="lift-always"`, which lifts them too (and adds the last-row shadow room below).
- **Last-row shadow, without a gap.** Under `lift` with clickable rows (and not `linesLayout="inlineEditable"`), the table wrapper adds `[&>div]:pb-6` so the last row's shadow is not clipped by `<Table>`'s own `overflow-auto` box (ETP-5388), and takes that room back from the layout with `!-mb-6` on itself (ETP-5600). Figma ends a list at its last row (or the 40px totals row) and runs a tab grid straight into its add-line bar, so nothing below the table sees a 24px gap: the following element (pagination, add-line bar, Total block) starts right under the last row and overlaps the empty padding, which is made click-through (`[&>div]:pointer-events-none`, `auto` again on the `<table>`) because `<Table>`'s wrapper is `position: relative` and would otherwise swallow clicks on the top 24px of that element. The hovered row's shadow (`z-10`) paints over it; a shadow is never a hit target. The negative margin sits on the outer wrapper, not the inner one, because the outer wrapper is itself a scroll container (`overflow-x-auto` forces `overflow-y: auto`): an inner `-mb-6` would overflow it, raising a stray vertical scrollbar and clipping the shadow again. A vertically scrolling ancestor (ListView's ScrollPane, the Accounts scroll region) still counts the wrapper's full border box as scrollable overflow, so scrolled to the bottom the shadow keeps its 24px and no row ends up behind what follows. The `!` is required: the parent's `space-y-0` zeroes `margin-bottom` on every child after the sticky header with a stronger selector. ListView's own `tablePaddingBottom` (`pb-6` on its ScrollPane) is the page's bottom gutter, not shadow room, and is unchanged.
- **Document lines (`InlineLinesPanel`, `linesLayout="inlineEditable"`, Figma "Fila Producto" / "Fila Editable" / "Fila Desplegable dimensiones").** Its rows are flex `<div>`s, not `DataTable` rows, but they take the same values from `components/contract-ui/rowVisuals.js`, shared with `DataTable`: rest `bg-card` (white); hover keeps white and adds Shadows/lg (`ROW_LIFT_SHADOW`), instant (`transition-none`), no border change, raised with `hover:relative hover:z-20`; a line being edited keeps the same Shadows/lg (`ROW_LIFT_SHADOW_STATIC`). A checked line uses `ROW_CHECKED_BG` (`#F5F7F9`, `--field-hover`) — Figma has no Selected variant for lines, so it takes the list's, and hover keeps it (it was `bg-primary/5` before ETP-5600). The open-line highlight (`selectedRowId`) keeps `bg-muted/40` + `ring-1 ring-focus-ring`. Unlike list rows, which drop **both** separators on hover (`ROW_LIFT_HOVER_NO_BORDERS`: their own `border-b` and the previous row's), document lines **keep theirs**: a flex row never overlaps the row above, so its top separator (the previous line's `border-b`) and its own stay visible under the lift. **Full-width rows (ETP-5600 QA pass 2).** Each line's `minWidth` is its whole flex track (`computeLineTrackWidthPx`: chevron + checkbox + every column's flex basis + the action slot + the 48px right spacer, which equals the scroll box's `scrollWidth` when the cells overflow), so its background, `border-b` and hover/edit Shadows/lg span the overflowing columns too. Before, the row was only as wide as the scroll box: scrolled to the right the lift stopped mid-row and the trailing columns and the action strip had none. Without overflow the row still fills the box and the grow columns share the surplus exactly as the header does. The balance-footer row and the dimensions sub-row keep the scroll-box width. Lines of a read-only (completed) document do not lift — Figma shows no hover there. **Last-line shadow.** The lines' body box is an `overflow-x-auto` scroll box (so it also clips vertically) and shows the native horizontal scrollbar. When the lines can lift and nothing else follows the last line inside that box (no open add-row, no balance footer), `computeBodyScrollClassName` adds `pb-4` (16px, enough for the visible ~14px Shadows/lg tail) so the last — often only — line's shadow is not cut. Without horizontal overflow (measured on resize, column-set and row-count changes) the box takes the room back with `-mb-4`, as `DataTable` does, so no gap shows and the add-line bar starts right under the last line; the padding is click-through (`pointer-events-none`, `auto` again on its children), and the bar, `sticky z-10`, still wins clicks on the overlap while the hovered line (`z-20`) paints its shadow over it. With horizontal overflow there is no negative margin (the bar would cover the scrollbar, and click-through would disable it): the scrollbar simply sits 16px lower.
- Pass `rowHoverStyle="tint"` only where a raised white row reads wrong — a grid sitting on a grey panel. No current consumer needs it. Hand-built tables that do not use `DataTable` (`fiscal-models` `.fm-table`) mirror the same hover in their own CSS: Shadows/lg and no lines (the hovered row's and the previous row's `border-bottom` turn transparent via `tr:has(+ tr:hover)`).

**Custom action content in hand-built tables.** A hand-built window that needs domain-specific row actions can reuse `DataTable`'s same reserved column, hover-sticky positioning, background mask and horizontal-scroll behavior instead of appending a synthetic actions column. Pass `rowQuickActions.render(row)` for the custom content and `rowQuickActions.buttonCount` for the maximum number of 32px buttons it renders. If the content does not follow the canonical button geometry, pass `rowQuickActions.reservedWidthPx` instead; it takes priority over `buttonCount`. These are direct `DataTable` props for custom React tables, not `decisions.json` keys. Without `render`, the standard `RowQuickActions` behavior is unchanged.

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
  - **The current selection is identified when the selector is reopened (ETP-5846).** Reopening an `InlineSearchCombo` (chip click, cell focus, chevron toggle) always shows an **empty** search box and the full list (ETP-4600), and the committed label becomes the input's placeholder (ETP-5005). On top of that, the option that currently holds the value is now **marked**: `aria-selected="true"` on that `role="option"`, a check icon inside the row, and it is scrolled into view (`block: 'nearest'`) when it sits outside the panel's visible area. This state is derived from the `value` prop alone (`resolveSelectedIndex`), never from the keyboard state, so it cannot drift from what the parent holds.
  - **Two independent per-row states, deliberately not conflated.** `aria-selected` means *"this is your committed value"*; the keyboard/hover highlight is a separate `data-highlighted` marker plus the info background, exposed to assistive tech through `aria-activedescendant` on the input. Before ETP-5846 a single `aria-selected` was derived from the highlight index, so neither was readable — and since opening resets the highlight to `-1`, nothing could ever mean "the value you already chose". A row may legitimately be both (you arrowed onto your own value).
  - **Resolving a value that is off the loaded page.** The list pages 50 rows at a time, so a committed value can be anywhere in the catalog. Once the opening page has landed and the value is in neither the local `options` nor the fetched pages, the combo fires **one** lookup per open on the *same* selector with the value's known label as `q` (`limit=20`) and merges back only the rows whose **id equals the value** — `q` is a substring match, so a label like `IVA 4%` can also match `IVA 4% Recargo`. Pages appended by scroll-triggered "load more" never repeat it (`pinAttemptedRef` remembers the id already requested in this open); once a page brings the real row, the pinned copy is no longer prepended and the marker moves onto it. The lookup carries the identical `selectorContext` as every other selector call, so a value the caller's context forbids simply never comes back and nothing is marked; it is a lookup, not a list page, so `offsetRef`/`hasMoreRef`, scroll-triggered "load more" and the first-page skeleton are untouched. A resolved row is dropped as soon as the value changes, a new query is typed, or the panel opens or closes, so a previous selection is never shown as the current one, and it is subject to the same `excludeId` filter as any other option.
  - **Enter never substitutes the first option for the current value.** With no committed value, `Enter` still commits the first match (the fast "type + Enter" / one-shot grid-entry flow), and after a typed query it still commits the first *match* — both are explicit intent, as is any arrow/Home/End key, which selects exactly the navigated row. But reopening a cell that already holds a value and pressing `Enter` **without typing and without navigating** closes the panel and leaves the value untouched: it is not a choice, so it must not be turned into one. Before ETP-5846 that case took the `filtered[0]` fallback and silently rewrote the user's own selection with whatever sorted first (measured on the unmodified component: committed `iva21` + `Enter` → `onChange("iva10")`).
- Pencil and trash carry full logic. No other action icons are rendered in this iteration.
- **Where the hover-action strip goes (ETP-5245, revised by ETP-5600):** the strip is always appended at the **end** of the row's flex container, in its own 158px slot (`ACTION_SLOT_WIDTH_PX`, the Figma band width: 4 × 32 + 3 × 2 + 24). **Since ETP-5600 (QA pass 2) an editable (draft) table always reserves that slot** on the header, every row, the balance footer and the add-row colgroup (`resolveTrailingColumn(visibleColumns, { editable })` / `reservesActionSlot` in `tools/app-shell/src/lib/linesActionSlot.js`, shared by `InlineLinesPanel` and `DataTable`), and no cell is suppressed on hover any more. While its actions show, the slot turns `sticky right-0` (`LINE_STICKY_ACTIONS_SLOT` in `contract-ui/rowVisuals.js`) so, with horizontal overflow, the buttons stay on the **visible** right edge of the lines scroll box instead of being cut off past it; the buttons sit in the list's *Sticky Acciones* band (`LINE_STICKY_ACTIONS_BAND`: padding 0 12px, at least 100px, the same `linear-gradient(90deg, transparent 0%, var(--row-hover-bg) 10.58%)` as `ROW_STICKY_ACTIONS`), so a column it floats over fades out behind an opaque background. The rest of the slot paints nothing and is click-through. Scrolled to the end, the strip sits in its own slot, so the last column (e.g. *Importe bruto de línea*) is always fully readable. Each line sets `--row-hover-bg` for its state (card at rest, `--field-hover` when checked, the composited `bg-muted/40` when highlighted). Before ETP-5600 the swap below applied to editable tables too: the trailing amount disappeared on hover and the strip took its place, which with horizontal overflow cut the buttons off on the far left and read as the buttons covering the amount on the far right. The former rule now only shapes a **read-only** table (completed documents look unchanged): when the **last** visible column is an `amount` without `noTrailing`, no slot is reserved (`trailingColumn`). In **every other** shape — no amount column at all (Cuenta Bancaria, Persona) *or* an amount that is not last (Product > Cost: `cost`, `startingDate`, `endingDate`) — `reserveActionSlot` reserves a permanent action slot (now 158px) on the header and on every row instead. Selecting the sacrificed cell by column *type* rather than by position was the ETP-5245 bug: on the Cost tab it suppressed the **first** cell, so hovering deleted the amount and slid the dates one slot left, out of alignment with the header. See `docs/feedback.md` and `InlineLinesPanel.trailingAmountColumn.vitest.jsx`.
- **Delete icon gating (ETP-4565):** the trash icon only renders when the caller passes a real `onDeleteRow` handler — `InlineLinesPanel` derives `canDelete = onDeleteRow != null` and wraps the Trash2 button in it, mirroring `DataTable`'s pre-existing `{onDeleteRow && (...)}` gate on its own row-delete button. When an entity declares `hideDelete: true` (see `docs/decisions-reference.md`), `apiPrediction.crud.<entity>.delete` resolves to `false` and `DetailView` never passes `onDeleteRow` down — before this fix, the icon still rendered on `inlineEditable` tabs and silently no-opped on click (the frontend simply had no handler to call; nothing told the user why nothing happened). Purely additive: every caller that already passes `onDeleteRow` (the default for every window with a deletable lines entity) renders byte-for-byte the same as before. **Correction (ETP-4745):** the original write-up here claimed "the backend correctly rejected the delete" — that was inaccurate even at ETP-4565 time. `hideDelete` did not reach `ETGO_SF_ENTITY.ISDELETE` until ETP-4745; before that fix a raw API `DELETE` against this same entity (`userRoles` on the `user` window) would have succeeded server-side. The ETP-4565 fix genuinely removed the dead UI affordance, it just didn't (and couldn't, at the time) rely on any real backend rejection.
- Designed for desktop. Tablet/mobile responsive support (a genuinely reflowed/stacked layout) is still out of scope for this iteration — but **ETP-5133** fixed the specific narrow-viewport failure mode: at laptop widths (e.g. 1366×768) with a wide column set, the table now scrolls horizontally within its own bounds instead of overflowing past the detail pane and overlapping the sidebar (and, on windows with a right-side panel, that panel too). See "How horizontal overflow is scoped" below.
- **Date columns (ETP-5245):** a `type: 'date'` column renders the shared `DateField` (calendar trigger + locale-masked text input, emitting `yyyy-MM-dd`) in **all three** paths that can edit it — `EntityForm.renderDateField` (form mode), `DataTable.renderInlineAddFieldControl` (the add-line row) and `InlineLinesPanel.EditCell` (inline edit of an existing row). Each of those keeps its **own** field-type `if` chain, so a new field-type control has to be added to all three or it degrades silently into that path's fall-through renderer — which is exactly how add-row dates shipped as bare text boxes. Two accepted limits inside the add-row/inline-edit cells: `DateField` takes no `ref` (no `firstInputRef` autofocus if it is the first add-row field) and no `onKeyDown` (row-level Enter/Escape does not fire from inside it; `DateField` binds both itself).
- **Add-line flow** keeps using the existing `DataTable` inline-add row (callouts, focus management, defaults from header context). The generated `<Window>LineTable.jsx` falls back to `<DataTable>` while `addRow.active` is true and returns to `<InlineLinesPanel>` once the new line is saved or cancelled. This avoids duplicating the heavyweight add-row machinery and keeps a single source of truth for line creation.
- **Dynamic column visibility (ETP-4543):** `InlineLinesPanel` accepts a `hiddenColumns = []` prop (mirroring `DataTable`'s existing one) that hides columns whose key is in the list, on top of any static `col.hidden` flag. `DetailView.jsx` computes this list from `lineDisplayLogic.visibility` (the same live evaluate-display map already threaded into the secondary `DetailForm`) and passes it to the primary lines table — so a grid column whose field resolves to `visibility: false` (e.g. a config-gated accounting dimension behind `@ACCT_DIMENSION_DISPLAY@`) is hidden at runtime rather than always shown just because it exists as a column. This makes `grid: true` fields under `inlineEditable` layouts respect the same runtime visibility rules non-grid fields already got via `DetailForm` — see `docs/feedback.md` ("ETP-4543") and `docs/generated-custom-windows/sales-invoice.md` for the full write-up.

**How it threads through the pipeline:**
- `cli/src/resolve-curated.js` — added to `WINDOW_TRUTHY_PROPS` (auto-passes through).
- `cli/src/generate-contract.js` — defaults to `"classic"` and is copied into `frontendContract.window.linesLayout`.
- `cli/src/generate-frontend.js` — emits `linesLayout="<value>"` on `<DetailView>` only when non-default.
- Generated `<Window>LineTable.jsx` — switches between `<DataTable>` (classic) and `<InlineLinesPanel>` (inlineEditable) based on the prop.
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` — owns rendering of the table block (header strip + rows + hover-action strip).

**Real example:** `sales-quotation` (pilot — the first window to ship the new layout).

**How horizontal overflow is scoped (ETP-5133):** `InlineLinesPanel`'s columns are a flex row with non-shrinking, fixed-basis widths (`columnFlex()`/`FIXED_BASIS_PX`/`ELASTIC_BASIS_PX` in `tools/app-shell/src/lib/linesColumnWidth.js`), so a window with many/wide columns can be wider than the viewport at laptop widths. Without a scoped scroll boundary, that overflow used to fall through to a distant ancestor (`getDetailContentContainerClassName` in `DetailView.jsx`, which sets `overflow-y-auto`) — per the CSS2.1 overflow computation, `overflow-x: visible` next to `overflow-y: auto` resolves to `overflow-x: auto` on *that* ancestor, so the whole detail-content pane (header form + tab strip + lines grid) became the scroll boundary instead of just the table, visibly overlapping the sidebar (and any right-side panel).

The fix could **not** simply wrap the header row + body rows together in one `overflow-x-auto` div — the header uses `position: sticky; top: 0` to stay pinned while the page scrolls, and that same CSS overflow-interdependence rule means any `overflow-x` wrapper placed between the sticky header and its real scrolling ancestor forces that wrapper's `overflow-y` to `auto` too, which silently breaks the header's stickiness (verified empirically before landing this shape — see the ETP-5133 comments in the component). The header strip and the body rows are therefore **two independently-scrolled wrappers**: the header's own inner div uses `overflow-x-hidden` and is driven programmatically (`scrollLeft`) by the body rows' `overflow-x-auto` wrapper's `onScroll` handler, so columns stay pixel-aligned while the header keeps its own (unaffected) sticky ancestor chain. `pb-6` on the rows wrapper mirrors the same bottom padding `DataTable`'s classic (non-inlineEditable) path already uses around its own `<Table>`, for the same reason: the forced `overflow-y: auto` would otherwise clip a hovered last row's shadow.

**The add-row companion table (the ETP-5133 known gap, closed by ETP-5332):** the add-line form is rendered by a separate, header-hidden/data-hidden `<DataTable>` instance (see the generated `<Window>LineTable.jsx` — it mirrors `InlineLinesPanel`'s own flex column widths via a `<colgroup>`) that sits as a **sibling** below `InlineLinesPanel`, not inside it. ETP-5133 left it opted out of all local overflow handling (`[&>div]:!overflow-visible`), to avoid the same sticky-header conflict, so an active "Add line" row with a wide column set overflowed past the pane. The create-contact popup (§19b) made that unavoidable rather than merely narrow — Contacts' *Persona* tab needs 1464px of columns and *Cuenta Bancaria* 1968px against the dialog's ~1134px, so no configuration makes them fit and horizontal scroll is mandatory. Three things had to change together:

1. **The colgroup now declares literal pixels, not `calc()`.** `growColumnWidth()` used to emit `calc((100% - Fixed) / N + Basis)` per growing column. **Chrome does not honour that inside `table-layout: fixed`** — it ignores the differing `Basis` terms and splits the space equally, which is why Persona's five columns (real bases 224/224/320/224/224) all measured an identical 243px. Wrapping it in `max()` changed nothing; the whole expression is what it declines to resolve per column. `DataTable` therefore measures its own container with a `ResizeObserver` and does flexbox's arithmetic in JS: `basis + max(0, leftover / growCount)`. Before the first measurement it returns the bare basis, so a column can never render narrower than its own width demand.
2. **The companion table carries a `minWidth`.** `getTableContainerStyle(minWidthPx)` adds it, so `width: '100%'` can no longer squeeze columns below what the `<colgroup>` asked for; the excess becomes scroll instead. The `[&>div]:!overflow-visible` opt-out is now scoped to `!hideHeader`, so only this companion gets a real `overflow-x-auto` — every other `inlineEditable` mount keeps the original behaviour.
3. **The two siblings share one scroll position.** ETP-5133's `scrollLeft` handoff runs *inside* `InlineLinesPanel` (its rows drive its sticky header) and cannot reach across the sibling boundary, so both now join a group keyed by entity in `tools/app-shell/src/lib/linesScrollSync.js`. A late joiner adopts the group's current offset, which matters because the add-row mounts only when the user clicks "Add …" — without it, it would appear at `scrollLeft` 0 beneath an already-scrolled header.

**A caveat for anyone testing this area:** jsdom has no layout engine and no `ResizeObserver`, so a render-based test always exercises the pre-measurement branch and every grow column comes out at its bare basis. The distribution arithmetic is pinned by direct unit tests on `growColumnWidth()` in `linesAddRowColumnAlignment.vitest.jsx`, not through a render — and for the same reason `linesScrollSync.vitest.js` drives stub elements rather than real DOM nodes, whose `scrollLeft` always reads back 0 under jsdom and would make its assertions pass vacuously.

---

### 14b. `dimensionsPanel` — expand-row accounting-dimension panel (`InlineLinesPanel` column type)

**What it does:** an opt-in column `type` for `InlineLinesPanel`, either declared directly in a hand-written `columns` array or generated automatically from a `"dimensionsPanel": true` flag on a field in `decisions.json` (see "Pipeline-generator support" below).

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
`dimensionFields` entries are ordinary column-shaped objects (`key`/`column`/`type`/`label`) — `InlineLinesPanel` reuses the same `commitField` path every other inline edit uses to persist a dimension-field change, so no special save wiring is needed. Drop the column entirely (don't include it in `columns`) when every candidate would be hidden — the generator's `generateTableComponent` follows this same `dimensionFields.length > 0 ? [...] : []` pattern.

**ETP-5692 — editable on a completed document, per field (`draftMode.editableLineFieldsWhenCompleted`):** while the document is locked by completion the whole sub-row is read-only, exactly as before — unless `DetailView` passes `InlineLinesPanel` the optional prop `isFieldEditableWhenReadOnly(row, fieldKey) => boolean`, built from that `draftMode` list by `lib/completedLineEdits.js` (fail-closed; each field still obeys its own `readOnlyLogic` evaluated on `{ ...header, ...line }`). `InlineLinesPanel` then (a) lets `commitField` through for exactly those fields and (b) hands `DimensionGrid` the optional per-field predicate `isFieldReadOnly(field) => boolean`, which takes precedence over the grid-wide `readOnly` when present. The save goes through `DetailView`'s `buildCompletedLineFieldUpdateHandler` (`inlineLineUpdateHandlers.js`): a one-field PATCH, since `buildInlineRowUpdateHandler` returns `undefined` on a locked document. Both props are absent for every other caller, which therefore renders and behaves exactly as before. See `docs/decisions-reference.md` → `draftMode`.

**Fully additive/opt-in:** a table that never declares a `dimensionsPanel` column renders byte-for-byte the same as before this feature shipped — no leading chevron column, no expand state, no "Edit dimensions" hover action. Verified against the full existing `InlineLinesPanel` test suite.

**ETP-4803 fix — the exclusion must ALSO apply to `DataTable`'s hidden add-row colgroup.** `DataTable.jsx` computes a hidden `<colgroup>` (used only while `hideHeader=true`, i.e. the inline add-line form) that must reproduce `InlineLinesPanel`'s flex math exactly — see `tools/app-shell/src/lib/linesColumnWidth.js`'s file header. When `DataTable`'s own `visibleColumns` filter never dropped `dimensionsPanel` (unlike `InlineLinesPanel`'s), any window with that column type got a phantom fixed-width column in the colgroup that the real header didn't have, desyncing `growColumnWidth()`'s fixed/grow totals for every column after it — misaligning the add-line form's inputs against the saved-rows header on purchase-invoice, sales-invoice, purchase-shipment, and sales-shipment. Fixed by extracting the exclusion into `isLineGridColumn(col)` (`linesColumnWidth.js`) and having **both** `InlineLinesPanel` and `DataTable` filter `visibleColumns` through it, so the two renderers can't diverge on this axis again. Any future column type that renders out-of-band (not as a fixed grid column in either renderer) must be added to `NON_GRID_COLUMN_TYPES` in that same file, not to one renderer's filter alone.

**Shared building blocks:** `tools/app-shell/src/components/contract-ui/DimensionsPanel.jsx` exports `DimBadge`, `DimSummary`, `DimensionGrid`. `InlineLinesPanel` only uses `DimensionGrid` now (the expanded content). **Update (same ticket, follow-up pass):** `AmortizationLinesTable.jsx` also stopped using `DimSummary`/`DimBadge` — it hand-patched the same static Layers/"Edit dimensions" hover-action pattern (see below) instead of the permanent grid-column summary it used to render. `DimSummary`/`DimBadge` currently have no consumer left in this repo but remain exported as reusable building blocks.

**Pipeline-generator support (unchanged by ETP-4610):** `generateTableComponent` (`schema_forge_core`'s `cli/src/generate-frontend.js`) still emits this column type directly from `decisions.json` — no generator change was needed for the column-hiding requirement, since `InlineLinesPanel` (a generic component owned entirely by this functional repo, not part of `@etendosoftware/app-shell-core`) decides how the metadata renders, not the generator. Flag a field `"dimensionsPanel": true` (any `grid` value; see `docs/decisions-reference.md`) and the generator collects it into the synthetic column automatically for the pipeline-generated `<Window>LineTable.jsx`/`LinesTable.jsx`/`GoodsShipmentLineTable.jsx`/`GoodsReceiptLineTable.jsx` files. Fully additive — an entity with zero `dimensionsPanel: true` fields generates byte-for-byte the same `columns` array as before.

**Real example:** the generated `LinesTable.jsx` (sales-invoice, purchase-invoice), `GoodsShipmentLineTable.jsx`/`GoodsReceiptLineTable.jsx` (goods-shipment, goods-receipt), and `GLJournalLineTable.jsx` (manual-journals) — all driven purely by `decisions.json`, all 5 in-scope windows regenerated and validated as part of ETP-4610. `goods-shipment` needed two extra local-DB regen attempts reverted (this sandbox's incomplete `AD_Ref_List_Trl` es_ES data silently strips unrelated translations on this window) before ultimately regenerating clean via the pre-push hook's offline/cached-AD-snapshot pipeline run — see `docs/feedback.md` for the full trail.

**ETP-5133 cleanup — the hand-written `InvoiceLinesTable.jsx`/`SalesInvoiceLinesTable.jsx`/`InvoiceLineTableCustom.jsx` were deleted.** These were the "hand-written `columns` array" example referenced above until this ticket. `docs/feedback.md` (ETP-4543/ETP-4529 entries) already documented them as unreachable from the running app — neither `sales-invoice` nor `purchase-invoice`'s `decisions.json` ever set `window.customLinesComponent`, so `HeaderPage.jsx` always rendered the pipeline-generated `LinesTable.jsx` instead. A live-browser check during ETP-5133 found a fix (`noTruncate` on the `product` column) had been mistakenly applied to this dead file instead of the generated one, which is what prompted finally removing it rather than continuing to carry it as documented dead weight. The generated `LinesTable.jsx` is now the only "hand-written-shape `columns` array" example left for this column type.

**`AmortizationLinesTable.jsx` — hand-patched, not an `InlineLinesPanel` consumer (follow-up pass, same ticket).** This component is a wholly custom `<table>` (its own fetch/CRUD, multi-select, and inline add-row draft-line flow — none of which `InlineLinesPanel` has an equivalent for), so wrapping it in `InlineLinesPanel` was investigated and rejected as disproportionate rework relative to this ticket's actual gap (see `docs/feedback.md` for the full comparison). Instead, its own hover strip was hand-patched to match the *visible* mechanism above: the permanent "Accounting dimensions" grid column was removed, and a third hover-action button (`Layers` icon, static `editDimensionsTooltip` — the same i18n key, no separate one introduced) was added ahead of its existing Pencil/Trash, gated on `dimensionFields.length > 0` and `!isReadOnly`, toggling the same `expandedId` state its pre-existing chevron already drove. Two independent implementations of the same UX on purpose — not a shared code path — because this component was never built on top of `InlineLinesPanel` to begin with.

**`RowExpandToggle` — the shared expand chevron (ETP-5593).** The circular outline chevron that
opens a row's sub-row is now one component, `components/contract-ui/RowExpandToggle.jsx`, used by
`InlineLinesPanel` (`dimensions-panel-toggle`), `AmortizationLinesTable`, financial-account's
`MovementsTable` / `StatementsTable` / `ReconciliationListTable` and the chart-of-accounts tree.
Before, each of them had its own copy of the same markup. Props:

- `expanded`, `onToggle`;
- `label` (aria-label; defaults to `expand` / `collapse`);
- `orientation`: `vertical` is the default, a down chevron that turns 180°; `horizontal` is a right chevron that turns down, for tree folders;
- `stopPropagation`, opt-in: set it when the row's own click opens the record;
- `iconTestId`.

Any other prop goes to the `<button>`. Use it for any new expandable row instead of copying the
classes.

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

**Real example:** the internal "Edit dimensions" action is the only current consumer of the *raw* `InlineLinesPanel` prop; no external caller passes `rowActions` directly. See `tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.vitest.jsx`'s `rowActions — generic hover-action extension slot` describe block for the mechanism's own regression tests (rendering, static `show: false`, per-row `show` function, declared-order rendering). §14d below is the first caller-level (`DetailView`/window) consumer.

---

### 14d. `DetailView`'s `lineRowActions` prop — window-level entry point for §14c (ETP-4888)

**What it does:** forwards a `rowActions`-shaped array (§14c) from a WINDOW down to the generated lines grid, without `DetailView.jsx` (a shared, entirely generic component) ever knowing which window populated it or why. `DetailView` just does `<DetailTable ... rowActions={lineRowActions} />` — the prop defaults to `[]`, so every window that doesn't pass it renders byte-for-byte the same as before this prop existed.

**Why a new prop instead of declaring it on `decisions.json` end-to-end:** the natural home for a NEW per-window boolean is `decisions.json` + `generate-frontend.js` baking a literal prop into the generated `HeaderPage.jsx` (like `hidePrintWhen`, `documentDateField`, etc.). `generate-frontend.js` lives in `schema_forge_core` — out of reach for a window-specific feature living entirely in this repo. The decision is still declared in `decisions.json` (`window.lineTaxSifTrigger`, see `docs/decisions-reference.md`) as the source of truth; only the WIRING is hand-mirrored today, exactly like this repo's `sales-invoice`/`purchase-invoice` `index.jsx` already hand-mirrors `subsetFilters`/`labelOverrides` for their hand-rolled list route (see the comments on `SUBSET_FILTERS`/`LABEL_OVERRIDES` in those files). If a future ticket adds `generate-frontend.js` support for this, the hand-mirrored constant + hook call in each window's `index.jsx` can simply be deleted.

**Real example — "tax needs SIF configuration" trigger (ETP-4888 point 5):** originally shipped as a `rowActions` entry (see the superseded note in §14e below); the design-polish round moved it to the `cellBadges` slot instead so the warning icon sits inline next to the `tax` value it's about, not grouped with Edit/Delete at the far right of the row. See §14e for the current mechanism and the full real-example writeup.

---

### 14e. `InlineLinesPanel` per-column trailing-badge extension slot (`cellBadges` prop) — ETP-4888 design-polish round

**What it does:** a generic extension point, sibling to §14c's `rowActions`, for rendering a small icon/badge INLINE next to a specific column's own cell value (in both read and edit mode) instead of grouping it into the row's hover-action strip at the far right. Added when the "tax needs SIF configuration" trigger (§14d's real example) turned out to "go unnoticed" living in the generic, neutral-colored, hover-only `rowActions` strip, far from the value it was actually about.

**Prop shape:**
```jsx
<InlineLinesPanel
  columns={columns}
  data={data}
  // ...
  cellBadges={{
    tax: (row) => (isTaxMissingSomething(row) ? <WarningIconButton onClick={...} /> : null),
  }}
/>
```
- Keys are column `key`s (matching `columns[].key`, e.g. `tax`). Each value is `(row) => ReactNode | null` — return `null`/`undefined` to render nothing extra for that row.
- `InlineLinesPanel`'s `renderLineCell` only wraps the cell's own content (`EditCell`/`ReadCell`) in the extra flex row when a badge is ACTUALLY returned for that row — a column with no badge, or a caller that never passes `cellBadges` at all (every existing caller before this slot existed), renders byte-for-byte the same single-child markup as before.
- Rendered in BOTH read and edit mode — unlike `rowActions` (hover/edit-only, gated by `!isDocumentReadOnly`), a `cellBadges` renderer decides its own visibility per row/mode; nothing in `InlineLinesPanel` itself gates it on hover or document read-only state.

**Real example — "tax needs SIF configuration" trigger (ETP-4888 point 5, design-polish round):** on `sales-invoice`'s and `purchase-invoice`'s lines grid, the `tax` cell shows an amber warning icon (`text-status-warning-foreground` — the same warning-color token `SifTab.jsx`'s `PILL_CLS.pending` uses) right next to the tax value itself, ONLY when the selected tax is missing its TBAI/Verifactu key — never for SII (which has nothing to configure at tax level; see `docs/decisions-reference.md`'s `lineTaxSifTrigger` row). Clicking it opens `TaxSifModal.jsx` (see `docs/ui-design-guidelines.md`-compliant modal: rounded card, tax-name pill, single-line label, `EnumSearchSelect` code+description picker, caption, footer). Unlike the superseded `rowActions` placement, this badge is NOT gated by hover or `isDocumentReadOnly` — the shortcut edits the TAX record, not the invoice, so it stays actionable even on a completed invoice.

**Follow-up round — extended to `sales-order`/`purchase-order`:** the identical mechanism (hand-mirrored `LINE_TAX_SIF_TRIGGER_ENABLED` + `useTaxSifLineRowActions()` + `lineCellBadges` wiring) was added to these two order windows' `index.jsx` after a real-world sales-order line used a tax missing its "Clave Régimen Especial IVA" and the user only found out via a cryptic Classic error from `C_Order_Post` at confirmation time — exactly the failure mode this feature exists to surface earlier. Both order windows route their detail view through `GeneratedApp` (`@generated/{spec}/generated/web/{spec}/index.jsx`) rather than importing `HeaderPage` directly, but `GeneratedApp` spreads its own `...rest` straight into `HeaderPage`, which itself spreads `{...props}` into `DetailView` — so passing `lineCellBadges` on `<GeneratedApp>` reaches the line grid exactly like it does on invoices' `<HeaderPage>`, with zero extra plumbing. `useTaxSifLineRowActions()` and `TaxSifModal.jsx` required **no frontend changes** — both already took `apiBaseUrl`/`token`/`recordId`/`windowCategory` as generic params with no invoice-specific hardcoding. `goods-shipment` (albarán) is explicitly OUT OF SCOPE: its `lines` entity carries no fields at all in Etendo's data model, so there is no `tax` field to attach a badge to.

**Backend scoping MUST be extended too, or the badge false-positives:** `InvoiceLineTaxSifSelectorPolicy`'s enrichment (see below) is scoped by `AD_Window_Id`, and `useTaxSifLineRowActions.jsx`'s `isTaxSifMissing()` treats an ABSENT enrichment column the same as a genuinely BLANK one (`value == null || value === ''`), while `selectSifFields()` still resolves a régimen field even without the `taxExempt`/`notTaxable` enrichment flags. So adding a window's `index.jsx` wiring alone, without adding its `AD_Window_Id` to the backend policy's `IN_SCOPE_WINDOW_IDS`, does not merely "show no badge" — it makes the badge fire on every TBAI/Verifactu tax on that window, including correctly configured ones. `IN_SCOPE_WINDOW_IDS` now covers all four windows (`167`/`183`/`143`/`181`).

**Compound/summary-tax resolution (ETP-4888 follow-up — replaces the earlier backend-only fallback):** a live incident showed a Spanish compound tax ("Entregas IVA+RE 21+5.2% ISP", `c_tax.issummary='Y'`) attached to an order line while its "Clave Régimen Especial IVA" lived on a CHILD tax row (`parent_tax_id` pointing back at the summary, `em_obspti_isequivalentcharge='N'` — the base-rate component; a sibling child with `='Y'` is the equivalence-charge/"Recargo" component and never needs the key). Filling the field on the summary tax — what the trigger opened against before this fix — never satisfied Classic's completion check, which reads the CHILD's own column. Two earlier defensive fallbacks (a `COALESCE` with the parent in `ETVFAC_ORDER_VFAC_VALIDATION.xml`, a `VerifactuUtils.resolveRegimeKey()` fallback in `InitialValidator.java`, both in `com.etendoerp.verifactu`) patched the READ side; this follow-up fixes the WRITE side at the source instead, so the ambiguity no longer needs a fallback at all:

- `TaxSifModal.jsx` resolves the record it actually edits: it fetches the tax `taxId` names, and if `summaryLevel` (`IsSummary`) is true, fetches its children via `fetchByCriteria(tax, tax, 'parentTaxRate', taxId, …)` and picks the ONE child where `oBSPTIEquivalentCharge` (`EM_OBSPTI_IsEquivalentCharge`) is not true (`pickRegimeChild()` in `TaxSifField.jsx` — the shared pure rule, documented there in full, mirroring the exact criterion `ETVFAC_ORDER_VFAC_VALIDATION.xml`/`InitialValidator.java` use). It then reads/PATCHes THAT child, not the summary. The summary tax's own name still shows as the top badge (that's what the user clicked), and a caption clarifies which rate component is actually being edited whenever it differs. Zero or more than one non-equivalent-charge child is treated as unresolved — the modal falls back to editing the summary tax directly (the pre-follow-up behavior) rather than guessing.
- `isTaxSifMissing()` needed the same fix on the READ side: the completeness map (`taxById`) is keyed by the id that appears on the line — the summary tax — so checking its own (always-blank) SIF columns made the badge either never clear (after a correct child-level save) or never appear (if the summary's own irrelevant field looked filled). `resolveEffectiveTaxRow(taxRow, taxById)` applies the SAME `pickRegimeChild()` rule client-side, using the child's own entry already present in the SAME full-catalog `taxById` map — no extra request. This requires 3 extra enrichment columns from the backend: `InvoiceLineTaxSifSelectorPolicy` (`com.etendoerp.go`) now also projects `isSummary`/`parentTaxId`/`isEquivalentCharge` alongside the existing SIF value columns.
- The `tax` spec's `summaryLevel`/`parentTaxRate`/`oBSPTIEquivalentCharge` fields were promoted from `visibility: "discarded"` to `visibility: "system"` in `artifacts/tax/decisions.json` (hidden from the Tax window's own UI, but now present in the CRUD entity's GET response and usable as a `fetchByCriteria` filter — see `docs/decisions-reference.md`'s Field-Level Overrides table for what `discarded` vs `system` means for API exposure) — a pure decisions.json/regen change, no new `generate-frontend.js` capability needed.

```
tools/app-shell/src/windows/custom/shared/
  useTaxSifLineRowActions.jsx  // hook: builds `cellBadges.tax` (§14e shape) + the modal JSX
  TaxSifModal.jsx              // the quick-fix dialog (own vertical layout, EnumSearchSelect per field)
  TaxSifField.jsx              // pre-existing; selectSifFields() is reused, not duplicated
tools/app-shell/src/components/contract-ui/
  EnumSearchSelect.jsx         // generic searchable code+description picker for static enum fields
```

The "missing" check needs each row's tax record without an extra per-tax fetch. Instead of enriching every line's own GET response, the hook reads the whole tax catalog from the SAME tax selector (`{apiBaseUrl}/lines/selectors/C_Tax_ID`) the tax field's own search combo uses, **paging through it** with an `offset`/`hasMore` loop until the server reports `hasMore: false` — the backend (`InvoiceLineTaxSifSelectorPolicy` in `com.etendoerp.go`, a `SelectorEnrichmentPolicy`) projects `taxExempt`/`notTaxable` plus the TBAI/Verifactu key columns onto each selector item, scoped via `NeoSelectorService.SOURCE_WINDOW_ID_PARAM` to exactly the in-scope windows' `AD_Window_Id`s so no other window's tax/product selectors are affected. As of the ETP-4888 follow-up round `IN_SCOPE_WINDOW_IDS` covers all four consuming windows — sales-invoice (`167`), purchase-invoice (`183`), sales-order (`143`), purchase-order (`181`) — the class/file name stays invoice-flavored (kept as a single diff, not a rename; a spec-neutral rename is a reasonable future Alex-review call). The frontend then re-runs `selectSifFields()` against each enriched tax row and flags it "missing" when any resolved field's value is blank — the same pure function decides WHICH fields apply on both the Tax window's own form and this modal, so the business rule is never duplicated.

The paging loop is NOT premature generality: `NeoSelectorService.MAX_LIMIT` (100) silently clamps whatever `limit` the client asks for, so the hook's requested `TAX_SELECTOR_PAGE_LIMIT = 200` never actually returns more than 100 items. A client whose catalog exceeds one page (seen live: 179 taxes) came back truncated with `hasMore: true`, and every tax outside the first page was silently treated as "nothing to fix" — the ETP-4888 bug the loop exists to prevent. Consequences of that clamp, all handled in `loadTaxCatalog()`:
- `offset` advances by **each page's own item count**, never by the requested `limit`, so the cursor stays correct despite the server-side clamp.
- The loop stops as soon as `hasMore` is false or a page comes back empty, so the common single-page case still costs exactly ONE selector request — the paging only kicks in for large catalogs.
- A failed/malformed page (non-OK response, or a body with no `items`) also stops the loop, but — unlike a total failure fetching page 1 — it does **not** discard pages already collected: `loadTaxCatalog()` breaks out and commits whatever `allItems` holds so far, emitting a `console.warn` naming the failed page number and offset. This degrades the completeness check to a partial catalog instead of silently reporting nothing needs fixing, which is what an earlier version did by returning on the first failed page (ETP-4888 QA finding).
- `TAX_SELECTOR_MAX_PAGES = 20` caps the iterations as a termination guard (in case `hasMore` ever misbehaves), emitting a `console.warn` when hit so an operator can tell the completeness check ran on a partial catalog.

One more request precedes the paging: the selector **fails closed** (returns an EMPTY catalog, not the full one) unless it receives the same context params `InlineSearchCombo` sends in edit mode (`parentId`, `isSOTrx`/`IsSOTrx`, `priceList`, `DateInvoiced`, `C_BPartner_Location_ID`, `currency`). The hook therefore fetches the invoice's own header record (`{apiBaseUrl}/header/{recordId}`, unwrapping NEO's `{ response: { data: [...] } }` envelope) and feeds it to `buildLineSelectorContext` — the SAME helper `DetailView.jsx` uses — rather than hand-rolling a second context builder.

**`DetailView`'s `lineCellBadges` prop** mirrors §14d's `lineRowActions` exactly: `<DetailTable ... cellBadges={lineCellBadges} />`, defaulting to `{}` so every window that doesn't pass it renders byte-for-byte the same as before this prop existed. `sales-invoice`/`purchase-invoice`/`sales-order`/`purchase-order`'s `index.jsx` each hand-wire it from `useTaxSifLineRowActions`'s `cellBadges` return value, same convention as §14d.

---

### 15. `window.balanceFooter` — debit/credit balance totals

**What it does:** replaces the product/discount/tax totals panel with debit/credit totals (**Σ debit**, **Σ credit**) for double-entry windows, and **disables the Save button** (with a tooltip) only when the entry is **unbalanced** (`Σ debit ≠ Σ credit`). An empty/zero entry is balanced and savable as a draft.

**Where the totals render depends on `linesLayout` (ETP-5210):**
- `linesLayout: "inlineEditable"` (the common case) — `InlineLinesPanel` renders the totals as a row **inside the lines grid itself**, pixel-aligned under the actual `debitField`/`creditField` columns (via the grid's own `columnFlex()` — no parallel width math, no drift). Every other column gets a blank cell. No Difference amount, no balanced ✓/✗ badge — display-only totals, trimmed since ETP-4917.
- classic (`DataTable`) `linesLayout` — no window uses this combination yet. `renderTotalsBlock()` falls back to the older standalone `BalanceFooterPanel`, rendered **below** the grid (not column-aligned), which still shows only Σ debit/Σ credit for the same ETP-4917 reason.

Either way the **save/complete gating logic is identical and unaffected** — both paths read `computeBalanceGate()`'s `balanceState` directly, never anything a renderer displays.

**Add-row and `DataTable`'s generic footer-totals (ETP-5210):** for `inlineEditable` windows, when the add-row form is active `GLJournalLineTable` (and every generated `*LineTable.jsx` for this layout) renders `InlineLinesPanel` (existing lines + the balanceFooter row above) **alongside** a second, header/data-hidden `DataTable` instance used only to host the add-row form. `DataTable` has its own, unrelated, longstanding generic footer-totals feature (`showFooterTotals`, on by default whenever amount columns exist) — without a guard, that hidden instance would render a *second*, unformatted totals row directly under the add-row form, stacked below the properly `€`-formatted, column-aligned one from `InlineLinesPanel`. `DataTable` now accepts a `balanceFooter` prop (already threaded through via `{...props}` at the `*LineTable.jsx` call site) whose mere presence forces its own `showFooterTotals` to `false`, regardless of the `showFooterTotals` prop's own value — the specialized row already covers it. Independently of `balanceFooter`, a `DataTable` rendered with `hideDataRows` never renders the generic footer-totals row either (ETP-5771): it has no visible rows to total, and because the call site spreads the full lines list in as `data`, the row otherwise summed every `amount` column (e.g. unit prices plus a duplicate of the document total) right under the add-row form on windows without `balanceFooter` — exposed once a header summary stopped carrying `amount` fields and the `showDetailFooterTotals` default flipped to `true`. Normal `DataTable`s (no `hideDataRows`) keep rendering the generic footer-totals exactly as before.

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
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — `computeBalanceGate()` produces `balanceState` (gates Save/Complete) and, for `inlineEditable` windows, `buildBalanceFooterGridTotals()` (in `detailViewHelpers.jsx`) formats it into the `balanceFooter` prop threaded into `<DetailTable>` → `InlineLinesPanel`. `renderTotalsBlock()` renders the classic-layout `BalanceFooterPanel` fallback instead of `DocumentTotalsPanel` only when `linesLayout !== "inlineEditable"`.
- `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` — `renderBalanceFooterRow()` renders the column-aligned totals row for `inlineEditable` windows.
- `tools/app-shell/src/lib/balanceTotals.js` / `BalanceFooterPanel.jsx` — pure aggregation + the classic-layout fallback renderer.
- `tools/app-shell/src/components/contract-ui/DataTable.jsx` — accepts `balanceFooter` and, when truthy, suppresses its own generic per-amount-column footer-totals row; `hideDataRows` suppresses it too (ETP-5771) (see "Add-row and `DataTable`'s generic footer-totals" above).

**Real example:** `manual-journals` (Manual Journals — the first and only window to ship the balance footer, on `inlineEditable` `linesLayout`).

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
   `customForm`, `customAddModal`, `readOnlyLogic`, the per-tab `maxDetailLines` cap added in
   ETP-4565, and the per-tab `visibleWhenCapability` role gate added in ETP-5116 — used by
   `product`/`asset-group`/`assets`/`warehouse`/`contacts`'s Accounting tab(s) to hide behind
   `showAccountingFields`): `docs/decisions-reference.md` → "Secondary Tabs (`window.secondaryTabs`)".
   A capability-hidden tab is also never fetched in the background (ETP-5648). When the
   accounting tab is the window's *detail* tab (`detailEntity`, as in `product-category` and
   `business-partner-category`), gate it with `window.detailVisibleWhenCapability` instead.
   **Cross-group tab ordering (ETP-4415).** `tabOrder` on any tab-strip entry
   (`secondaryTabs.<key>`, `customPanelTabs[]`, `extraTabs[]`, `attachments`) now sorts against
   every other entry, not just within its own group — see `docs/decisions-reference.md`'s
   `secondaryTabs` section for the full reference and the `customTabsAfterBottom` incompatibility.
   **Gating a custom tab until the record is saved (ETP-5309).** A `placement: 'tab'` custom
   component that cannot work on an unsaved record declares it through two statics:
   `Component.requiresSavedRecord` (`true`, or a predicate over the tab's `props`) and
   `Component.savedRecordHintKey` (i18n key). While `isNew`, DetailView renders that tab button
   disabled with the hint as tooltip, in both tab strips (`getCustomTabSaveFirstHint` in
   `detailViewHelpers.jsx`). Without `savedRecordHintKey` the tab is still disabled, only with no
   tooltip — always declare both. The component should still guard its own panel, since
   `location.state.openSecondaryTab` can open it. `AttachmentsTab` is the reference: it requires a
   saved record unless its `config.saveBeforeAttach` is set.
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

#### The "More" overflow menu of the Form View tab strip (ETP-5515)

The Form View's bottom tab strip (`DetailTabStrip.jsx`, rendered by `DetailView`) shows **every tab
when they all fit** in the strip's width and puts only the ones that do not fit behind a
"Más" / "More" menu (showing the hidden count); there is no fixed cap, so a wide screen shows all
of them and a narrow one groups the rest. Labels never wrap (`whitespace-nowrap`). When everything
fits there is no menu. No `decisions.json` option: the rule is generic, so it applies to every
window, declarative or custom.

- **Dynamic slot.** The last visible tab (before "Más") is a slot. Picking a hidden tab from the menu puts
  it in the slot and the tab that was there drops into the menu; selecting any fixed tab (any
  tab before the slot) restores the original arrangement. The arrangement is derived purely from the
  active tab key (`resolveTabStripLayout` in `detailTabStripLayout.js`), so it also follows
  deep links (`location.state.openSecondaryTab`).
- **Width-aware.** The visible count is the largest number of tabs (up to all of them) that fit in the
  strip's own width, "Más" included whenever something is hidden (`useFittingTabCount.js` +
  `computeFittingTabCount`). The rules (slot, reset, active tab always visible) hold for any count.
  Floor: 1 fixed tab + the slot; if even that does not fit, the strip clips
  (`min-w-0 overflow-hidden`) instead of overlapping the side panel. While geometry is unknown
  (jsdom, no `ResizeObserver`, zero width) it falls back to 4 visible tabs.
  Natural widths come from an invisible probe row rendered inside the strip (same box classes as `TabStripButton`, shared via `tabStripButtonBaseCls`; labels and counters are drawn with CSS `::after{content:attr(data-text)}`, so the probe adds no text nodes, test ids or focusable elements to the DOM); a `ResizeObserver`
  on the strip and the probe re-measures on resize, sidebar open/close, zoom and font changes.
- **Never left scrolled (CP-3).** The strip is clipped, not scrollable. The probe row lives in its
  own `overflow-hidden` clip box so it never counts as scrollable overflow of the strip (a wider
  absolutely positioned row used to inflate `scrollWidth`, so a focus/`scrollIntoView` on the More
  trigger scrolled the strip and it never scrolled back, cutting off the first tab). On top of that
  the strip resets `scrollLeft` to 0 on any scroll event and on every re-measure.
- **Counters** (e.g. "Dirección 1") and the save-first disabled hint travel with the tab into and
  out of the menu.
- **Test ids.** Visible tabs keep `tab-<key>`; the trigger is `detail-tab-more` and menu entries
  are `detail-tab-more-item-<key>`. A test that clicks `tab-<key>` for a tab that may be hidden must
  open `detail-tab-more` first.
- Hand-built windows that render their own tab strip (e.g. financial-account `DetailTabs`) are not
  affected.

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

### 19. Inline record creation from a lookup drawer (`lookupCreateTargets.js` + `RecordCreateModal`) — ETP-5254

**What it does:** pins a **`+ Create product` / `+ Crear producto`** row at the top of the product
lookup drawer opened from a document line. Clicking it opens a **two-phase** dialog that renders the
**Products window's own chrome** — its generated `ProductForm.jsx`, its primary-tab strip, its field
labels — collects the header fields and POSTs them (*phase 1*), then reveals the window's **own Price
and Attachments panels** mounted against the record that was just saved (*phase 2*). The new product
is selected into the line the user was editing when the popup is **closed**, through exactly the same
path a hand-picked row takes.

**Before this ticket:** the drawer offered search and nothing else. A user who discovered mid-document
that the product did not exist had to abandon the line, navigate to the Products window, create the
product there, set its price, and re-open the document.

**Where it lives — and what it deliberately did NOT touch.** None of the three lookup *trigger*
components changed: `DataTable`'s `LookupField`, `InlineLinesPanel`'s `LookupTrigger` and
`EntityForm`'s `LookupFormField` are all untouched. Everything is resolved inside
`ProductDrawerShell`, from the `selectorUrl` it already receives, because that URL encodes both the
document's spec and the NEO root:

```
{neoBaseUrl}/{spec}/{entity}/selectors/{column}
   e.g.  /sws/neo/sales-order/lines/selectors/product
```

`parseSelectorUrl()` splits it, and the created record is funnelled back through the shell's own
`select()`, so every trigger receives it through its existing `onSelect` contract.

**The registry shape** (`tools/app-shell/src/components/contract-ui/lookupCreateTargets.js` —
a deliberate sibling of `lookupDrawers.js`, a plain map plus a resolver, so a second creatable entity
is a new entry rather than new branching inside the drawer):

```js
// This Set IS the scope switch — greppable in exactly one place.
export const CREATE_PRODUCT_SPECS = new Set([
  'sales-quotation', 'sales-order', 'purchase-order',
  'sales-invoice', 'purchase-invoice',
  'goods-shipment', 'goods-receipt',
]);

export const LOOKUP_CREATE_TARGETS = {
  product: {
    key: 'product',
    entity: 'product',            // NEO entity under the `product` spec: POST target + FK selector base
    ctaKey: 'createProduct',      // i18n keys, resolved through useUI()
    titleKey: 'createProductTitle',
    errorKey: 'createProductError',
    allowedSpecs: CREATE_PRODUCT_SPECS,
    prefill: (query) => (query ? { name: query } : {}),  // seeds the name with what was typed

    // ── Phase 1: the window's own form, tabs and labels ──
    // Lazy: a document window must not pay for the Products form unless the popup is opened.
    // ProductForm.jsx ONLY — never ProductPage.jsx, which would drag DetailView/ListView along.
    loadForm:   () => import('@generated/product/generated/web/product/ProductForm.jsx'),
    loadLabels: () => import('@generated/product/generated/web/product/labels.js'),
    labelOverrides: { /* mirrors window.labelOverrides in decisions.json */ },
    tabs: [                       // mirrors window.primaryTabs + the EntityForm section each renders
      { key: 'general',        label: 'General',         section: 'principal' },
      { key: 'additionalInfo', label: 'Additional Info', section: 'other' },
    ],
    tabsVariant: 'pill',          // mirrors window.primaryTabsVariant
    cols: 3,                      // the window's own field-grid width

    // ── Phase 2: the window's own panels, available only once the record exists ──
    loadPostCreateTabs: () => Promise.all([
      import('@/windows/custom/product/ProductPriceBar.jsx'),
      import('@/components/attachments'),
    ]).then(([price, attachments]) => ([
      { key: 'pricing',     labelKey: 'price',       Component: price.default },
      { key: 'attachments', labelKey: 'attachments', Component: attachments.AttachmentsTab,
        props: { tableName: 'M_Product', config: {} } },
    ])),
  },
};

// → { ...target, apiBaseUrl } when the spec is allowlisted AND the caller opted in, else null.
resolveLookupCreateTarget({ selectorUrl, createEnabled });
```

**The prop:** `ProductDrawerShell` takes `createEnabled` (default `false`). `ProductSearchDrawer`
passes `createEnabled={!keepOpenOnSelect}`; `ProductStockSearchDrawer` deliberately does not pass it
at all.

- **Why an allowlist and not "every window using the default product drawer":** ~10 other specs share
  that drawer (requisition, physical inventory, cost adjustment, return to vendor…), and the
  goods-movements / internal-consumption **line forms** used to reach it too, because
  `EntityForm.LookupFormField` hardcoded `ProductSearchDrawer` instead of honouring the window's
  `lookupDrawer` (the key documented in [`docs/decisions-reference.md`](decisions-reference.md) →
  *Lookup Drawer Override*). ETP-5681 closed that inconsistency: `LookupFormField` now resolves the
  drawer through the same `lookupDrawers.js` registry as the add-row and the inline edit, so those two
  line forms open their declared `product-stock` drawer (which does not forward `createEnabled`). The
  allowlist still keeps the feature to the specs that asked for it.
- **The `product-stock` variant never shows the row.** Creating a stockless product inside a picker
  that filters by stock returns an immediately empty result, so the stock drawer opts out simply by
  not forwarding the flag. Multi-select pickers (`keepOpenOnSelect`, e.g. the report viewer) opt out
  too — creation is a single-pick affordance.
- **The create row is NOT part of the arrow-key navigation ring.** Each drawer variant's
  `onNavKeyDown` indexes into `results` with its own arithmetic, and a virtual row would mean editing
  every variant. It is reachable by **Tab and by pointer** only. Deliberate limitation, not an
  oversight.
- **The row is pinned at the top of the results list, not in the footer** — the footer is gated on
  `hasResults`, i.e. hidden in exactly the "nothing found, I need to create it" moment the affordance
  exists for.
- **While the modal is open the drawer is hidden but stays mounted**, so `query` and `results` survive
  a cancel untouched, and the shell suppresses the fetch hook's **document-level** Escape handler
  (bound at document level, so a portalled sibling modal cannot stop it with `stopPropagation`) —
  without that, Escape inside the modal would also tear down the drawer behind it.
- **Purely additive.** A caller that does not pass `createEnabled` (every caller except
  `ProductSearchDrawer`), and any spec outside `CREATE_PRODUCT_SPECS`, gets `resolveLookupCreateTarget`
  → `null` and renders byte-for-byte the same drawer as before this slot existed.

#### The popup IS the window — mounted in the host's own React tree

The dialog does not render a form that resembles the Products window: it mounts **the Products window
itself**, at its own `new` route, inside the dialog body (`data-testid="record-create-window"`). That
is why the tab strip shows **Price, Cost, Accounting and Attachments** from the first paint, why the
header stays editable after saving, and why a tab added to the window tomorrow appears here with no
change to this code. Cost and Accounting can arrive no other way — their renderers are welded to
`DetailView`'s per-tab hooks, so reusing them means reusing `DetailView`.

`EmbeddedWindowRoute.jsx` is what makes an application window mountable inside another one:

```jsx
<LocationContext.Provider value={null}>          {/* satisfies the nested-router invariant */}
  <RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
    <MemoryRouter initialEntries={[`/${windowName}/new?embedded=interactive`]}>
      <PageMetaProvider>                          {/* the window's title/breadcrumb stop here */}
        <Routes>
          <Route path={`/${windowName}`}            element={element} />
          <Route path={`/${windowName}/:recordId`}  element={element} />
        </Routes>
      </PageMetaProvider>
    </MemoryRouter>
  </RouteContext.Provider>
</LocationContext.Provider>
```

- **React Router's "you cannot render a `<Router>` inside another `<Router>`" is narrower than it
  reads.** The invariant is `!useInRouterContext()`, and `useInRouterContext()` only asks whether
  `LocationContext` is non-null *at that point*. Re-providing `null` — the context's own default —
  satisfies it. `RouteContext` is reset alongside it, or the inner routes would be matched relative to
  the host's current match (`/sales-invoice/:id`) instead of from the root. These are `UNSAFE_`
  exports: acceptable here because the version is pinned and the failure mode is a loud invariant
  throw at mount, not silent wrongness.
- **A memory router cannot move the host.** The window navigates when it saves — `/<spec>/new` →
  `/<spec>/<id>` — and `createMemoryHistory` never touches `window.history`, so that navigation stays
  inside the dialog. Watching it is how the popup learns the record id.
- **The window is handed `recordId` as a PROP, not left to read the route.** Windows switch
  list-vs-detail on the prop `WindowLoader` extracts from the route, so a child mounted without it
  renders the product **list** inside the dialog however correct the inner URL is. `EmbeddedWindowRoute`
  injects it from `useParams()`, which also makes the window flip to the saved record by itself.
- **`PageMetaProvider` is not optional.** `ListView` and `DetailView` publish title, breadcrumb and
  record count through `useSetPageMeta`, which the host's TopBar reads — without a nested provider the
  dialog rewrites the *document's* header, turning an open invoice's breadcrumb into
  *Inventario / Producto*.
- **The chrome is dropped through a CONTEXT, never the URL.** `EmbeddedWindowContext`
  (`lib/embeddedWindow.js`) is provided above the memory router and read by `useChromelessEmbed`, so
  the sidebar, topbar, palette, widgets, the **stock side panel** and the window's own "cancel back to
  the list" all disappear while the window stays usable. The flag lived on the URL twice and was lost
  twice the same way — the window navigates to `/<spec>/<id>` when it saves and the query string does
  not survive it, which put the stock panel back inside the dialog at the exact moment the product was
  created. Re-applying it from an effect is a race the user sees. A context is set by the host and
  nothing the window does to its own location can drop it. The URL form (`?embedded=1` /
  `=interactive`) is still honoured for a preview opened directly by link, where there is no host
  component above it — `embedded=1` additionally disables pointer events, which is why the two stay
  apart.

**Why in-tree and not an iframe.** The first implementation hosted the window in a same-origin iframe,
on the reading that nesting routers was impossible. It worked, but it cost a second cold boot of the
whole application — entry chunk, session refresh, window-access map, then the window: **~460 ms against
~180 ms** for navigating to the same window in-app, and the gap was reported in a demo. Mounted
in-tree the providers, the session and the already-parsed chunks are the host's, and the measured open
time is **146–345 ms** — at parity with opening the window normally.

**Escape ownership is the one thing the iframe gave away for free.** In a separate document a keypress
inside the form could not reach the host; in-tree it can, and *both* the dialog and the selector's
fetch hook listen for `keydown` on `document` in the same native dispatch. The dialog's listener runs
first, React flushes its state update synchronously (keydown is a discrete event), and the hook's
listener — still the same keypress — then reads an already-closed modal and tears the drawer down with
the user's search inside it. Reading a `createOpen` flag is therefore not enough: `ProductDrawerShell`
holds a ref that stays set for one macrotask **after** the modal closes, so one Escape closes exactly
one layer. `RecordCreateModal` additionally stops the synthetic Escape at its `DialogContent`, which
keeps it out of the host's inline add-row handler.

If the window module fails to load, the modal falls back to the two-phase generated form described
next; that path is otherwise dormant.

#### Fallback: the two-phase generated form

Used only when the window module cannot be loaded. `RecordCreateModal.jsx` declares no field list, no tab strip of its own and no labels. Every visible
piece is the Products window's:

- **The form.** `target.loadForm()` lazily imports the generated `<Entity>Form.jsx` through the
  `@generated` vite alias and renders it as-is, so labels, types, options, requiredness, defaults,
  references and compiled `readOnlyLogic` stay owned by `artifacts/product/decisions.json`: a
  `make regen ONLY=product` propagates into the popup for free. This was deliberately unlike
  `CreateContactModal` / `EntityCreationModal`, which hand-rolled their field lists and had drifted
  from the Contacts window they mirrored — both deleted by ETP-5332 (see §19b).
- **The tab strip.** `renderPrimaryTabButtons(target.tabsVariant, tabs, …)` from
  `detailViewHelpers.jsx` — the same helper and the same `'pill'` variant `ProductPage` passes to
  `DetailView`, so the General / Additional Info strip is literally the same control. Captions run
  through `useMenuLabel()`, and `target.tabs` mirrors `window.primaryTabs` in `decisions.json` (key
  and label verbatim) plus the `EntityForm` `section` each tab renders. `cols: 3` keeps the field grid
  the same width as the window's.
- **Both tab panels stay MOUNTED** — the inactive one is only hidden. Unmounting it would fire
  `EntityForm`'s `registerFields` cleanup and silently drop that tab's fields from validation:
  `taxCategory` is required, lives in the `other` section and has no static default, so submitting
  from the General tab would sail past the check into a backend 400. For the same reason, a failed
  validation **switches to the offending tab** — an inline error on a hidden panel is no error at all.
  That is also why the `other` tab cannot simply be dropped from the registry.
- **The field labels.** `target.loadLabels()` loads the target window's own label slice and the modal
  re-provides the merged dictionary for its subtree through `LocaleProvider`, exactly the way
  `WindowLoader` does for a routed window. **This fixes a subtle bug that will recur if the slice is
  ever dropped:** `WindowLoader` only loads the slice of the window being routed to, so inside a sales
  invoice the dictionary holds the invoice's columns and none of the product-only ones —
  `ProductType`, `C_UOM_ID`, `C_TaxCategory_ID`… fell back to the raw English AD label while `Name`
  and `Description` happened to resolve, producing a half-translated form.
- **The label overrides.** `target.labelOverrides` is a **copy** of `window.labelOverrides` in
  `decisions.json`, which the generator emits only into `ProductPage.jsx` — a module that cannot be
  imported here without dragging `DetailView`, `ListView`, the sidebar, the price bar and the gallery
  into every document bundle. Without it the popup would say *Identificador* / *Categoría del
  producto* / *Tipo de producto* where the window says *Código* / *Categoría* / *Tipo*.

#### Two phases, and why it cannot be one

A POST does **not** complete the popup. On success the modal keeps the created record, loads
`target.loadPostCreateTabs()` and reveals a second tab strip carrying the Products window's **own**
Price (`ProductPriceBar`) and Attachments (`AttachmentsTab`) panels — same components, same extra
props `DetailView` hands its `customTabs`, mounted against the saved record. They persist themselves
against `/price` and the attachment endpoints; the popup saves nothing on their behalf.

**The header form stays editable in phase 2, and commits on blur.** This is not a choice the popup
made: `artifacts/product/decisions.json` declares `autoSaveOnBlur: true`, so committing each field as
the user leaves it is precisely what *behaves like the Products window* means here — the same
derived-from-the-window principle as the tabs and the labels above. Mechanically, phase 2 passes
`onFieldBlur` and `savingField` to the embedded forms (phase 1 passes neither, so nothing can commit
before the record exists); an edited field is sent as `PATCH {apiBaseUrl}/{entity}/{id}` with
`{ <key>: <value>, updated }`, a field the user never touched fires nothing — tabbing through the form
is silent — and `savingField` drives `EntityForm`'s per-field spinner. The PATCH response **refreshes
the record's `updated`**, which is what lets a second edit succeed: carrying the stale version instead
would make it a 409. A failed PATCH surfaces the backend message and leaves the record unchanged.
A drift test guards the premise, failing with *"the Products window no longer autosaves on blur —
RecordCreateModal phase 2 still does"* if that decision is ever flipped.

**Why two phases is structural, not a UX preference:** those panels cannot exist before the record is
saved. `ProductPriceBar` derives its `recordId` from `data?.id` and reads `/price?parentId=<id>`, and
an attachment needs a record to attach to. Splitting at the POST is the only way the window's real
panels — rather than an imitation of them — can appear inside the popup at all. It is also what makes
the price of a brand-new product actionable on the spot: the user sets the tariff price before the
product ever reaches the line.

**`onCreated` fires exactly once, at the end.** `Done`, the X, the overlay and Escape all route
through `dismiss()`, which calls `finish()` once a record exists and `onCancel()` before that. So
there is a single completion point, and it is the one that selects the product in the line.

**Accounting is absent from the FALLBACK's phase 2** (the live window mode shows it, because it shows the window). Price and Attachments are self-contained custom
panels; Accounting is a `secondaryTabs` entry whose renderer `SecondaryTableTab` takes `DetailView`'s
`hook`, `secondaryHooks` and `addingSecondaryLine`, so reusing it means recreating that per-tab
`useEntity` machinery, and imitating it would mean reimplementing a panel rather than reusing one. It
is additionally gated behind the `showAccountingFields` capability, so most users never see it in the
window either. Registered as debt: `accounting-tab-not-in-popup` in `flags-registry.json`.

**Not replicated at all:** callouts (the Products window itself wires none — its `decisions.json`
`rules` is empty and no callout is emitted into its generated form, so the popup is no worse than the
window it embeds), optimistic-lock `updated` (a POST has no prior version), `evaluate-display` (these
fields carry no `displayLogic`), and processes. `image` is excluded from the form because it
needs the `/image` upload endpoint and a saved record.

The `GET {apiBaseUrl}/{entity}/defaults` call made on open is not optional polish: `productCategory`'s
`defaultValue` in the generated form is the literal macro `@SQL=SELECT MAX(...)`, which the client
cannot evaluate — without the call that string would be POSTed as an FK value. The response is merged
with `mergeDefaultsPreservingUserEdits` so a slow `/defaults` cannot clobber what was already typed,
and the synthetic `id` it returns is deleted before merging.

#### Drift guards — what keeps the copied config honest

Three pieces of the registry are copies of the Products window's own configuration (`labelOverrides`,
`tabs`/`tabsVariant`, and the post-create tab list). Tests read `artifacts/product/decisions.json` and
the generated `ProductPage.jsx` and compare them against the registry, so a divergence fails the
build with an explicit instruction: **fix `lookupCreateTargets.js`, never `decisions.json`.** The
Accounting omission is asserted too, so dropping it stays a decision rather than an accident. See the
`registry copies stay in sync with artifacts/product/decisions.json` and `post-create tabs mirror
ProductPage customTabs` describe blocks in `lookupCreateTargets.vitest.js`.

#### Why the created record is re-queried through the selector

A freshly POSTed record is a plain CRUD row: no `label`, no `standardPrice`, and crucially no
`_aux._PSTD/_PLIM/_UOM/_CURR`, which the line's pricing callout needs. When the popup completes,
`handleCreated()` re-queries the **drawer's own** selector by the new record's `searchKey` and hands
`select()` the canonical selector row, keeping `applyOnSelectMappings`, `mergeSelectorAuxFields` and
the callout running exactly as for a hand-picked product. When that row does not come back — the
selector is called with the **document's** `priceList`, and a product priced in phase 2 on a different
tariff (or left unpriced) may legitimately not match — the exported `synthesizeCreatedItem()` fallback
builds a minimal selector-shaped row (prices `0`, UoM carried in both shapes) so the line stays usable
instead of silently losing the product.

#### Known limitations — expected behaviour, not defects

| Behaviour | Why it is expected |
|---|---|
| The popup does **not** create a cost line. | ETP-5245 owns the rule *a product is expected to have a defined cost* and surfaces it with a warning banner in the Products window. Restating it here would be a second copy of the same rule in a second place, free to drift — and the popup mounts that window, so the banner and the **Cost** tab both appear inside it and the user can add the line before finishing. That rule used to also REFUSE the save, which made a product created from a line unsavable the moment it existed; the block was removed by product decision and the banner is advisory now. |
| **Accounting** and **Cost** are missing from the *fallback* form. | They are `secondaryTabs` entries driven by `DetailView`'s per-tab `useEntity` machinery. The live popup mounts the window itself and therefore shows both; only the dormant fallback lacks them. Tracked as `accounting-tab-not-in-popup`. |
| Closing the popup after the product was created **completes**; it does not undo anything. | The record already exists — the POST happened at the end of phase 1. Cancelling is only possible *before* that: in phase 1 the `Cancel` button leaves the document untouched and nothing is written. In phase 2 there is no `Cancel`, only `Done`, and the X / overlay / Escape mean the same thing. |
| The line can still arrive at **price 0**. | Phase 2 lets the user price the product immediately, which is the normal path. If they skip it — or price it on a tariff other than the document's — the selector re-query finds nothing and the synthesized fallback row is used. The user types the price on the line, exactly as for any product with no row in that tariff. |
| No arrow-key access to the create row. | See the navigation-ring bullet above. |
| No callouts inside the popup. | The Products window wires none either. |

**Also fixed here (latent bug):** the drawer's "no results" state was gated on a non-empty query, so
an empty search that legitimately returned nothing rendered a completely blank body — which reads as
broken, doubly so with a create row sitting above it. It now renders `productSearchNoResults` when a
query is present and `noProductsFound` when it is not.

**i18n:** three keys were added to all three locale files (`en_US`, `es_ES`, `es_AR`) —
`createProduct`, `createProductTitle` and `createProductError`; see
[`docs/i18n-guide.md`](i18n-guide.md). The tab captions are **not** among them: phase 1's come from the
menu dictionary through `useMenuLabel()` (which is what makes them read identically to the window's),
and phase 2 reuses the existing `price`, `attachments` and `done` keys.
`tools/app-shell/src/locales/__tests__/lookup-create-keys.vitest.js` fails the build if a locale is
missing one.

**Real example:** the affordance is live on the seven document specs in `CREATE_PRODUCT_SPECS` —
`sales-quotation`, `sales-order`, `purchase-order`, `sales-invoice`, `purchase-invoice`,
`goods-shipment`, `goods-receipt` — reached from the lines grid, the inline lines panel and the line
form alike, since all three trigger the same shell. Regression coverage:
`tools/app-shell/src/components/contract-ui/__tests__/lookupCreateTargets.vitest.js` (the scope switch,
URL parsing and the drift guards above), `RecordCreateModal.vitest.jsx` (phase 1: defaults merge,
cross-tab required-field validation, payload shaping, response unwrapping — plus a
`— post-create phase` describe block for the phase-2 tabs, the read-only header and the
close-means-done semantics), `ProductDrawerShell.vitest.jsx` (`— create affordance`,
`— handleCreated`, `— empty state` and `synthesizeCreatedItem`),
`ProductStockSearchDrawer.vitest.jsx` (asserts the stock variant opts **out**) and
`DataTable.addRowProductLookup.vitest.jsx` (the create row inside a real add-row lookup).

**Cross-references:**
- [`docs/generated-custom-windows/product.md`](generated-custom-windows/product.md) — the Products
  window whose form, tabs, labels and Price/Attachments panels this popup embeds.
- The seven window guides in [`docs/generated-custom-windows/`](generated-custom-windows/) — the
  per-window note on the affordance.
- [`docs/request-policy.md`](request-policy.md) — the `useApiFetch`/`apiFetch` helper both the modal
  and the selector re-query go through.

### 19b. The second target: Contacts (`LOOKUP_CREATE_TARGETS.contact`) — ETP-5332

**What it does:** the **"+ Crear contacto"** row in a document's `Contacto` selector now opens the
**real Contacts window**, mounted at `/contacts/new` inside the dialog by the §19 machinery. It used
to open `CreateContactModal`, a hand-rolled reimplementation of that window.

**What was deleted** — ~1,972 lines: `CreateContactModal.jsx` (667), `EntityCreationModal.jsx` (737,
whose only real importer was CreateContactModal), `AddressSection.jsx` (224), `FinancialSection.jsx`
(263), `contactModalConfig.js` (81), plus their tests. `contactsFieldValidation.js` **stays** — it is
shared by `EntityForm`, `DataTable`, `useEntity`, `InlineLinesPanel` and `OrganizationPage`.

**What did NOT change, and why that is the point.** None of the six document windows
(`sales-order`, `sales-quotation`, `sales-invoice`, `purchase-order`, `purchase-invoice`,
`goods-shipment`) were touched. The trigger chain is untouched too — `CreateContactContext` →
`EntityForm.SearchSelectField` → `CreatableSearchSelect.onCreateRequest`. The single change point is
what `useCreateContactModal`'s `onOpen` renders, and `onSelect` still receives `{ id, name }`.

**The affordance is NOT resolved from a selector URL.** Unlike `product`, the contact target never
goes through `resolveLookupCreateTarget`: that function is the product *drawer's* resolver, keyed off
`{neoBaseUrl}/{spec}/{entity}/selectors/{column}`. The Contacto affordance predates the drawer
pattern and is context-wired, and `useCreateContactModal` already knows the contacts API base and the
document's sale/purchase nature — so it spreads the registry entry with its own `apiBaseUrl`. There is
no `allowedSpecs` on this entry.

#### Seeding a new record — the `initialData` extension point

Window mode mounts the window at its own `new` route, and the window runs **its own** `useEntity`.
`target.prefill` only ever reached the *fallback* generated form, so in window mode there was no way
to pre-fill anything. Three things depended on it:

- the typed query filling Razón social,
- the document's sale/purchase nature checking **Cliente** or **Proveedor** — not cosmetic: a contact
  created from a purchase invoice that is not flagged `vendor` never comes back in a purchase
  selector, so the user creates it, uses it once and cannot find it again,
- the Copilot OCR flow's extracted values.

`useEntity` therefore takes an `initialData` option, applied in `handleNew`:

```js
const seed = initialDataRef.current ?? {};
userChangedKeysRef.current = new Set(Object.keys(seed));   // ← the whole trick
setEditing({ ...seed });
```

**Marking the seeded keys as user-changed is the entire mechanism.** The pre-existing ETP-4741 guard
`mergeDefaultsPreservingUserEdits` already refuses to overwrite a user-changed key, so the in-flight
`GET /<entity>/defaults` response cannot clobber the seed — no new race handling was written. It also
stops `shouldSkipPayloadField` from dropping a seeded legacy-looking numeric FK id out of the POST.

- `initialData` is held in a **ref**, not in `handleNew`'s dependency array. `useNewRouteEditingReset`
  (`detailViewHelpers.jsx`) has `handleNew` in its effect deps, so an unstable `handleNew` — which any
  caller passing an object literal would cause — re-fires that effect.
- `DetailView` forwards the prop into its `useEntity` call. From there it reaches the Contacts window
  through the **existing** `{...props}` spreads (`ContactsWindow` → `BusinessPartnerPage` →
  `DetailView`); no intermediate file needed changing.
- **The caller must memoise `target`.** `RecordCreateModal`'s reset effect has `target` in its
  dependency array: a fresh object per render reloads the window module and refetches `/defaults` on
  every keystroke in the document behind the dialog.

Seed keys are verified `businessPartner` field names — `name`, `customer`, `vendor` — built by the
exported `buildContactSeed(query, { documentType })`.

The contact **category** (`businessPartnerCategory`) is seeded separately because its id is per client
and needs an async lookup: `useContactCategorySeed` (backed by `resolveContactCategorySeed`) maps
purchase to the `Proveedor` group and sale to `Cliente` by search key
(`CONTACT_CATEGORY_KEY_BY_DOCUMENT_TYPE`), and the popup is mounted only once it settles. A missing
group or a failed lookup leaves the form's own default. A seeded key beats `/defaults` because
`useEntity.handleNew` registers every seeded key as user-changed.

**`initialChildData` — seeding a child tab's add modal (ETP-5654).** `initialData` seeds the
**header record only**. A child tab that opens its own `customAddModal` (Contacts' `locationAddress`)
is seeded through a sibling prop, `initialChildData`, keyed by the secondary tab's `key`:

```js
initialChildData = { locationAddress: { address, postalCode, city, countryName } }
```

It travels `CreateContactModalAdapter` → `RecordCreateModal` → `WindowApp` → the generated page's
existing `{...props}` spread → `DetailView`, which hands `initialChildData[st.key]` to the modal as
`initialValues`. The decision lives in `resolveCustomAddModalSeed` (`detailViewHelpers.jsx`): the seed
is passed **only** when the modal opens in create mode (no `rowId`) **and** the tab has no rows yet
(`secondaryHooks[idx].children`), so a second address or an edit never gets the one-off OCR data.
`LocationEditorModal` applies the text keys without marking the form dirty, resolves `countryName`
against the country selector (`matchOptionByLabel`) and falls back to Spain when it is empty or
unresolved. Region is never seeded. Optional everywhere: with no `initialChildData` nothing changes.

**Auto-open after the first save.** The modal does not wait for the user to find "Añadir dirección":
the FIRST save of the new record opens it, prefilled, for review (nothing is saved until the user
presses Guardar). Every save handler navigates `/new` → `/:id` with `state.justSaved`, and
`DetailView`'s existing one-shot `justSaved` cleanup now builds the next router state through
`buildPostCreateState` (`detailViewHelpers.jsx`): when `initialChildData` has a seed for a secondary
tab with a `customAddModal`, it adds the same `openSecondaryTab` + `openAddSecondaryLine` state that
`runSecondaryAddLineFlow` uses, and the existing open-modal effect switches to the tab and opens the
modal in create mode. Once-only: `justSaved` exists only on the navigation that follows a create, and
the open-modal effect clears the state, so a cancelled modal, later saves and re-renders never reopen
it; the manual button keeps working and prefilling while the tab has no rows. Without
`initialChildData`, the cleanup produces exactly the previous state.

**Person vs company captions.** A company carries `name`; a PERSON is stored as
`etgoFirstname`/`etgoLastname` and may have an empty `name`, so callers resolve the selector caption
through the exported `resolveContactName(record)` rather than reading `name` directly.

---

### 19c. Inline create from a selector — `allowCreate` + inline-create variants (ETP-5826)

Not the same thing as §19. §19 opens the TARGET window's own form from a lookup drawer; this one is a
one-input modal for small catalogs whose record can be created from a single value (a name, a number of
days). Field-level, declared in decisions.json:

```json
"transactionType": { "allowCreate": true, "createSpec": "transaction-type", "createEntity": "transactionType",
                     "createLabelKey": "matchRuleTypeCreate", "createTitleKey": "matchRuleTypeCreateTitle",
                     "createNamePlaceholderKey": "matchRuleTypeNamePlaceholder" }
```

`EntityForm.renderSearchSelectField` renders `InlineCreateSelector` instead of the plain
`CreatableSearchSelect` when `allowCreate && createSpec && createEntity` (and the form has an
`apiBaseUrl`). The "+ create" row is always the first row of the dropdown; it opens `InlineCreateModal`
pre-filled with the typed text, POSTs to `/sws/neo/{createSpec}/{createEntity}` (`buildCreateUrl` swaps
the host window's spec segment) through `useApiFetch`, and auto-selects the created record.

**Variants.** How the record is created is a property of the TARGET spec, so it is declared once in
`tools/app-shell/src/lib/inlineCreateVariants.js` (a plain module next to `paymentTermDays.js`; the generic
components only read from it), keyed by `createSpec`, and every field pointing at that spec picks it up:

| Variant key | Effect |
|---|---|
| `inputLabelKey` / `inputSuffixKey` | Modal input label (default "Name") and a unit after the input. |
| `inputMode` | The input's `inputMode` (e.g. `numeric`). The input stays `type="text"` so a wrong value gets a message instead of being silently blocked by the browser. |
| `validate(value)` | `null` or `{ key, params }`; shown under the input, nothing is sent. With a validator the empty input can be submitted so the "required" message shows. |
| `inputPattern` / `inputMaxLength` | Restrict what the input can hold, as it is typed or pasted. A change that does not match (or is longer) is refused on the spot: the previous value stays and the message `validate` gives for the refused value is shown (else `inputRejectedKey`). A selector pre-fill that does not match opens the modal empty. Use a RegExp without the `g` flag. |
| `inputRejectedKey` | Message for a refused change that `validate` has no message for (e.g. a trailing space). |
| `buildBody(value)` | POST body (default `{ name }`). |
| `sortOptions` | Comparator passed to `CreatableSearchSelect`'s generic `sortOptions` prop. |
| `errorMessagesByKey` | `{ [backendMessageKey]: (messageParams) => ({ key, params }) \| null }` — a failed create whose `error.messageKeys` holds that key shows the translated message; the builder receives `error.messageParams`. |
| `fallbackErrorKeysByStatus` | `{ 409: 'i18nKey' }` — only for a failed create that carries **no** backend message key. |

Anything matched by neither goes through the shared `translateBackendError` (`lib/backendErrors.js`: backend
message keys first, then known backend texts). That is where a backend message key belongs whenever another
screen can show it too — the variant only maps what is specific to the modal. When nothing translates it, a 4xx
keeps the backend text (a refusal written for the user), but a 5xx or a status-less failure shows the generic
translated error, never the raw text (it can carry SQL); a network failure keeps its own translated message.
`resolveCreateErrorMessage(variant, error)` holds the variant rules, `describeCreateError` in
`InlineCreateSelector.jsx` the rest. A refused create never selects anything: the modal stays open with the message
(rendered with `role="alert"`, so screen readers announce it).

Registered: `payment-term` — digits only, at most 3 (`inputPattern: /^\d*$/`, `inputMaxLength: 3`): `5.541`,
`5,45`, `123abc`, `-5` or `50%` can never be typed or pasted, and the refusal shows "Introduce un número entero de
días…" (a 4th digit shows the 1–365 range message); `validate` (`lib/paymentTermDays.js`) remains the submit-time
check for empty, `0` and `> 365`. Body `{ overduePaymentDaysRule: N }`,
options ordered "Inmediato" first then by days. Errors: `PaymentTermHandler`'s refusals are translated by the
shared translator, so the Payment Term window's save shows the same text — `ETGO_PaymentTermDaysDuplicate`
(409) → "Ya existe la condición de pago «{name}» con esos días", `ETGO_PaymentTermNameDuplicate` (409) → "Ya
existe una condición de pago llamada «{name}» en esta organización", each with "… pero está desactivada.
Reactívala en Condiciones de pago" when `messageParams.paymentTermActive` is false;
`ETGO_PaymentTermDaysInvalid` / `ETGO_PaymentTermDaysOutOfRange` (400, `{min}`/`{max}`/`{value}`). The variant
itself keeps only `fallbackErrorKeysByStatus: { 409: 'paymentTermNameDuplicate' }` for a 409 without a key (the
C_PaymentTerm `(client, org, name)` unique constraint caught by the generic CRUD path) → "Ya existe una
condición de pago con ese nombre en esta organización". The existing term is never auto-selected.
No entry = name-only (match-rule is unchanged).

**Only for roles that can write the target.** The "+ create" row is hidden unless the current role may
write the window behind `createSpec` — the same rule NEO applies to the POST: an active
`AD_Window_Access` on that window with `IsReadWrite = 'Y'` (tier `"full"` in `SFWindowAccessMap`), or the
admin / client-admin bypass (`capabilities.isAdminOrClientAdmin`). `useCanCreateInSpec(createSpec)`
(`hooks/useCanCreateInSpec.js`, pure rule in `lib/specWriteAccess.js`) resolves the spec to its window
through `menu.json` (`name` = spec → `windowId`) and reads the role's `windowAccess` map. Applies to every
`allowCreate` field.

| Situation | "+ create" row |
|---|---|
| Admin / client-admin | shown |
| Role tier `full` on the target window | shown |
| Tier `read-only`, no grant, or access map not loaded yet / failed | hidden (fail closed) — e.g. the Sales and Purchasing templates have Payment Term (141) read-only |
| `createSpec` has no `windowId` in `menu.json` (today: `transaction-type`, used by match-rule) | shown, as before: the SPA cannot tell which window authorizes it, and the backend still answers 403 to a role it refuses. Add a `menu.json` entry with the `windowId` to gate it |

Fail closed does not flicker: `windowAccess` is loaded at role selection, before any window renders, and
the row only exists inside the closed dropdown. With the row hidden the field is an ordinary searchable
selector.

**Hand-built forms** spread the exported props instead of copying keys:
`{ key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', ...PAYMENT_TERM_CREATE_FIELD_PROPS }`
(contacts `BillingPreferencesForm`, both customer and vendor sides).

**Other forms see the new record.** Selector option pages are cached under `entity: 'selector'` for
the catalog window, keyed by the host document's selector URL, which does not name the target table. A
POST to the `payment-term` spec is therefore listed in `WRITE_INVALIDATES_ENTITIES`
(`lib/crossSpecCacheInvalidation.js`), applied centrally by `useApiFetch`: every cached selector page goes
stale and refetches on its next open — a term created from a contact appears in a purchase invoice's
dropdown without a reload. A new variant whose records feed other selectors needs the same entry.

**Limitation.** `sortOptions` sorts what has been loaded. In `serverSearch` mode that is the pages fetched
so far (50 per page), which is fine for short catalogs such as payment terms; it is not a substitute for
server-side ordering on a large catalog.

---

### 20. Follow-up documents — `FollowUpDocumentButton` + `draftMode.afterProcess` (ETP-5576)

A generic flow that offers the document that naturally follows a completed one (today:
invoice → shipment / goods receipt; designed so orders → shipment **and** invoice, and
shipment → invoice, can reuse it). Not a `decisions.json` option: it is wired in the
window's custom wrapper and `topbarRight` component, because both pieces are functions.

**Backend contract.** The source spec annotates every header GET with
`followUp: { available: [<key>…], <key>: { needed, reason, pendingLines, action, targetSpec, targetEntity } }`
(`available` = keys still needed, in display order; empty for credit notes, returns, or when
nothing is pending). `POST <spec>/header/{id}/action/<action>` creates a Draft with only the
pending lines and answers `201 {response:{data:{id, documentNo, followUp, spec, entity, lineCount}}}`
or `{error:{code,…}}`. The frontend never derives "pending" itself. When the backend needs a
value it cannot decide on its own, the error carries an `input` block and the POST is retried
with the chosen value — see **Input-required round-trip** below.

**Pieces** (`tools/app-shell/src/components/follow-up-documents/`):

| Piece | Role |
|---|---|
| `followUpDocuments.js` | Pure helpers: `readFollowUpEntries`, `buildFollowUpActionUrl`, error-code → i18n key map (`FOLLOW_UP_ERROR_KEYS`, fallback `followUpErrorGeneric`), the input-required helpers (`readFollowUpInputRequest`, `followUpInputLabels`, `mergeFollowUpInputValues`), the prompt hand-off (`requestFollowUpPrompt` / `consumeFollowUpPrompt`) and `createFollowUpAfterProcess(spec, options)` |
| `useFollowUpDocuments` | State machine `closed → choice → (loading) → result`; POSTs through `useApiFetch`; keeps a backend-requested input (`session.inputRequest`, `session.inputs`, `setInputValue`); on success dispatches `<spec>:document-created` and calls `onCreated` |
| `FollowUpDocumentModal` | Choice phase on `ActionChoiceModal` — layout decided only by how many configured follow-ups are available: ONE → single-option confirmation (summary, the window's question, ONE static option card — title + badge + description with the pending count, no radio — and a label-only primary button named after the action, focused so Enter creates); TWO+ → one Figma choice card per follow-up. No "not now" card: Cancel / X / Esc / backdrop reject. Result phase on `ConfirmResultModal` (see §21 — the component owns the dialog, its title and its keyboard handling; this modal only maps the created documents to `docs`); errors inline |
| `FollowUpDocumentButton` | `topbarRight` entry point: renders only while a configured follow-up is available (never for a read-only window); always mounts the modal, so the post-Confirm prompt also opens it |

**Per-window config** — a map keyed by the backend follow-up key (see
`windows/custom/shared/invoiceFollowUp.js`):

```js
questionKey,                       // question above the option(s), e.g. 'followUpInvoiceQuestion'
                                   // («¿Qué vas a hacer con esta factura?»); default 'followUpQuestion'
options: {
  shipment: {
    labelKey,                      // card title (static card or choice card) — «Crear albarán de venta»
    descriptionKey,                // card description; receives { count } = pendingLines
    descriptionOneKey,             // optional singular variant (count === 1)
    badgeKey, badgeTone,           // optional badge; tone 'success' (green, default) | 'info' (blue)
    actionLabelKey,                // primary button in the single-option layout («Crear albarán»)
    icon,                          // lucide component
    titleKey, buttonLabelKey,      // used when this is the only follow-up offered; separate keys: the
                                   // modal title asks («¿Gestionar envío?»), the button does not («Gestionar envío»)
    resultDocType,                 // ConfirmResultModal doc type (see §21 for the full list) — drives the
                                   // result popup's title, card label, badge gender and «Ver …» button.
                                   // Today: 'salida' (sales-invoice) | 'entrada' (purchase-invoice)
  },
},
summary: { documentLabelKey /* required */,
           documentNoField /* default 'documentNo' — the INTERNAL number; never a partner reference
                              such as purchase-invoice `orderReference` (the supplier's own number) */,
           dateLabelKey, dateField, contactField, totalField, currencyField,
           linesLabelKey /* pending-lines column, single follow-up only; default 'lines' («Líneas») */ },
```

`questionKey` is passed to `FollowUpDocumentButton` (→ `FollowUpDocumentModal`) as a prop next to
`options` / `summary`, because the wording names the source document.

A key the backend offers but the window does not configure is ignored. With several keys
the modal shows one card per key (title `titleKey` prop or `followUpManageTitle`, button
`buttonLabelKey` prop or `followUpManageButton`).

**Opening right after Confirm.** Pass `draftMode.afterProcess = createFollowUpAfterProcess(spec, options)`
(invoices: `getInvoiceDraftMode(ui, { afterProcess })`). When the processed record still has a
configured follow-up it queues a prompt and returns `{ stay: true }`, so the user stays on the
document instead of being sent to the list (the fresh record is primed into the form, see
`runAfterProcess`); `FollowUpDocumentButton` consumes the prompt (immediately, or on mount after a
`/new → /{id}` move). A prompt nobody consumes within 30 s (`FOLLOW_UP_PROMPT_TTL_MS`) is discarded. See `docs/decisions-reference.md` →
`draftMode.afterProcess`.

**After creation** the button calls the slot's `onRefresh` (record re-read: the annotation empties
and the button disappears) and the `<spec>:document-created` event refreshes related documents
(`SALES_RELATED_DOCS['sales-invoice'].refreshEvent`, `PURCHASE_RELATED_DOCS['purchase-invoice'].refreshEvent`).
Later writes to the created document (completing the shipment / receipt after following the link)
happen in another window; they mark the source invoice's cached record stale through the
cross-spec map in `lib/crossSpecCacheInvalidation.js` (`goods-shipment → sales-invoice`,
`goods-receipt → purchase-invoice`), so going back to the invoice refetches it. A new follow-up
pair (e.g. order → shipment) must add its own row there — see `docs/request-policy.md`.

**Keyboard.** `ActionChoiceModal` (shared, also used by sales-quotation) traps Tab (focus parks on
the dialog while every control is disabled), Esc cancels (never while a request is in flight, and
never an Esc that a layer opened on top already handled), the cards are a roving-tabindex radio
group (Arrow/Home/End) where Enter selects the focused card AND continues, every control has a
visible `:focus-visible` outline, and the layout stacks below 640px. With a single option the
radio group is replaced by the direct confirmation and focus starts on the primary button (the
static card is not a Tab stop). The result
phase is `ConfirmResultModal`, which has the same Tab trap and Esc rule of its own and focuses its
primary button («Ver albarán» for one created document) — see §21.

**Input-required round-trip.** When the backend cannot decide a value the follow-up document
needs (today: the target warehouse of the shipment / receipt), it answers the action POST with an
error that carries an `input` block, and accepts the same POST again with that value in the body:

```
POST …/action/createShipment   body {}
→ 409 {"error":{"code":"FOLLOW_UP_WAREHOUSE_REQUIRED","status":409,"message":"…",
               "input":{"key":"warehouseId","options":[{"id":"…","name":"…"}, …]}}}
POST …/action/createShipment   body {"warehouseId":"<id>"}
→ 201 (created) | 400 FOLLOW_UP_INVALID_INPUT (the id is not one of the valid options)
```

- Detection is by shape, not by code: any failed answer whose `error.input` has an identifier
  `key` (`/^[A-Za-z]\w*$/`, and not a name inherited from `Object.prototype` such as
  `constructor`) and at least one option with an `id` (`readFollowUpInputRequest`). Chosen values
  are always read as own properties (`readFollowUpInputValue`).
  It is **not** an error state: no alert, the modal stays open and a required selector appears
  below the option card(s). The key and the options come from the backend — the generic
  components contain nothing warehouse- or invoice-specific.
- The selector is the searchable combo the other document modals use (`CreatableSearchSelect`
  over static options, as `PriceListSelectField` does), inside a `<fieldset>` named by its label and
  described by its helper text. Label `followUpInput<Key>` (`warehouseId` → `followUpInputWarehouseId`,
  «Almacén»), falling back to `followUpInputGeneric` («Selecciona una opción»); helper text
  `followUpInput<Key>Help` («Elige el almacén donde se creará el documento.»), omitted when the key
  has no translation. A new input key only needs those two i18n keys.
- With exactly one option it is preselected (and still shown); with several the value starts
  empty. The primary button (`ActionChoiceModal`'s new `primaryDisabled`) stays disabled until a
  value is chosen, and the hook refuses a POST without it (so Enter on a choice card cannot bypass
  it). The retry body is `{ ...valuesCollectedSoFar, [input.key]: value }` — if the backend then
  asks for a second key, the first value is kept; a previous choice that is no longer offered is
  dropped. The values belong to the follow-up key whose action asked (`inputs.forKey`); creating
  another follow-up starts from `{}`.
- Multi-option layout: the selector and the disabled primary apply only while the selected card
  is `inputs.forKey`. Selecting another card releases the request (`releaseInput`, wired through
  `ActionChoiceModal`'s `onSelectionChange`): the selector disappears, the primary creates the
  other follow-up with `{}`, and going back to the first card does not bring the selector back —
  its next POST asks again if the backend still needs the value.
- Keyboard / a11y: focus moves to the selector when it appears (the search input, or the chip of
  a preselected option) — `ActionChoiceModal` keeps that focus instead of moving it back to the
  primary when loading ends. Arrows / Enter pick in the open list and Esc closes the list; with
  the list closed, Enter retries (same as the primary) and Esc cancels the modal. The double-submit
  guard and "Esc / backdrop ignored while loading" apply unchanged; the fieldset is disabled while
  the retry is in flight.
- Errors: `FOLLOW_UP_INVALID_INPUT` → `followUpErrorInvalidInput` (selector kept, choose again);
  `FOLLOW_UP_WAREHOUSE_REQUIRED` arriving **without** an `input` block (no candidate warehouse) →
  `followUpErrorWarehouseRequired`, shown inline like any other error.

`ActionChoiceModal` gained three optional, backward-compatible props for this: `children` (rendered
between the option(s) and the error) and `primaryDisabled` — each either a plain value or a function
of the selected option id — and `onSelectionChange(id)` (called on every later change of the
selection, not on mount). sales-quotation passes none of them.

**Single vs multi layout** is generic: `ActionChoiceModal` switches to the single-option mode when
it receives exactly one option. Single-option layout, top to bottom: title, summary, `question`,
ONE static option card, footer (Cancel left, primary right). The static card looks like an idle
choice card (1px border, 12px radius, icon box, title + badge, muted description) but is laid out
icon-left and is plain content: no radio indicator, no `role="radio"` / `radiogroup`, not
focusable, not clickable. Its description is the dialog's `aria-describedby`. The primary button
carries the option's `actionLabel` and no arrow icon (the spinner still shows while loading).
Options take an optional `badgeTone` (`'success'` default, `'info'`), mapped to the
`--status-success-*` / `--status-info-*` tokens. sales-quotation always passes two options, no
`badgeTone`, and is unaffected (green «Recomendado», arrow on the primary).

### 21. Generated-documents popup — `ConfirmResultModal` (ETP-5674)

`tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx` is THE result popup every flow
shows after it created one or more documents, on both Sales and Purchases: confirming an order with
shipment / receipt / invoice, invoicing a shipment or a receipt (single and bulk), the rectificative
invoice of a return, a purchase return created from a receipt, a quotation turned into an order or
an invoice, and the follow-up documents of §20. Do not build a window-local result view — pass
`docs` to this component.

**Props.** Callers only describe *what* was created; all the copy is derived inside the component,
so two flows that create the same document can never word it differently.

```jsx
<ConfirmResultModal
  docs={[
    { type: 'salida',       num: 'ALB-0001', documentStatus: 'DR', route: '/goods-shipment/<id>' },
    { type: 'facturaVenta', num: 'FAC-0042', documentStatus: 'CO', route: '/sales-invoice/<id>' },
  ]}
  navigate={navigate}            // (route) => void — opens a document
  onClose={resetConfirmedState}  // «Cerrar», the X icon and Esc
  onNavigate={() => { navigatedRef.current = true; }}  // optional; runs INSTEAD of onClose
/>                                                      // right before navigating (default: onClose)
```

| `docs[i]` key | Meaning |
|---|---|
| `type` | A `TYPE_CONFIG` key (table below). An unknown type falls back to `facturaCompra`. |
| `num` | Document number, rendered as «Nº &lt;num&gt;» (`confirmResultModal.docNumber`). |
| `documentStatus` | Optional. `'CO'` → green «Completado/Completada» badge (gendered by type); anything else, including missing → neutral «Borrador». Always pass the real status from the action response — invoices are confirmed on creation while a shipment in the same popup can still be a draft. |
| `route` | Optional. Without it the card is shown but is not clickable, and no «Ver …» button is offered. |

There is **no** `title`, `primary`, `currency` or per-doc `amount`/`status` prop: the popup shows
no amount, and its title, banner and buttons are computed:

| `docs.length` | Title | Banner | Footer |
|---|---|---|---|
| 1 | per-type title (e.g. «Albarán creado», «Factura creada») | «Se ha generado un documento» / «Ábrelo para consultarlo.» | with a `route`: «Cerrar» (secondary) + «Ver …» (primary, opens it); without: «Cerrar» only |
| 2+ | «Documentos creados» (`confirmResultModal.title.many`) | «Se han generado N documentos» / «Abre cualquiera de ellos para consultarlo.» | «Cerrar» only (primary); the cards navigate |
| 0 | `followUpDocumentCreated` fallback | none | «Cerrar» only |

**Document types** (`TYPE_CONFIG`; i18n keys under `confirmResultModal.*` in `en_US` / `es_ES` /
`es_AR`):

| `type` | Card label (es_ES) | Title when alone (es_ES) | «Ver …» key | Badge gender | Used by |
|---|---|---|---|---|---|
| `salida` | Albarán de venta | Albarán creado | `soViewShipment` | masculine | sales-order confirm, sales-invoice follow-up |
| `entrada` | Albarán de compra | Albarán creado | `poViewReceipt` | masculine | purchase-order confirm, purchase-invoice follow-up |
| `facturaVenta` | Factura de venta | Factura creada | `soViewInvoice` | feminine | sales-order confirm, goods-shipment invoicing (single / bulk / row Confirmar), sales-quotation «Facturar directamente» |
| `facturaCompra` | Factura de compra | Factura creada | `poViewInvoice` | feminine | purchase-order confirm, goods-receipt invoicing (single / bulk / row Confirmar) |
| `facturaRectificativa` | Factura rectificativa | Factura rectificativa creada | `soViewInvoice` | feminine | return-material-receipt |
| `facturaRectificativaCompra` | Factura rectificativa | Factura rectificativa creada | `poViewInvoice` | feminine | return-to-vendor-shipment (same wording as `facturaRectificativa`; the type only differs in purchases routing / `data-doc-type`) |
| `devolucionCompra` | Devolución de compra | Devolución de compra creada | `confirmResultModal.view.devolucion` | feminine | goods-receipt «Crear devolución» (opens `/return-to-vendor-shipment/{id}`) |
| `pedidoVenta` | Pedido de venta | Pedido creado | `sqViewOrder` | masculine | sales-quotation «Crear pedido» |

Adding a document type = one `TYPE_CONFIG` row (label key, title key, view key, lucide icon,
gender) plus its `confirmResultModal.docType.*` / `confirmResultModal.title.*` keys in all three
locales. Shared hooks pass the type through instead of a title: `invoiceDocType` in
`useRowConfirmAction` / `ReturnWindowShell`'s `confirmAction`, `invoiceType` in
`ConfirmWithCreditButtonBase` / `useConfirmWithCredit`, `primaryDoc.type` / `invoiceDoc.type` in
`useOrderWindow`, `resultDocType` in the follow-up config (§20). `confirmedTitleKey` survives in
`useOrderWindow` / `useRowConfirmAction` only for the success **toast** shown when a confirm
created no document — it never reaches the popup.

**Dialog behaviour** (owned by the component — callers must not wrap it in their own dialog or
focus trap): the panel is `role="dialog" aria-modal="true"` labelled by its title; focus moves to
the primary button on open (so Enter runs it) and returns to the opener on unmount; Tab is trapped
inside (`useDialogFocusTrap`, shared with `ActionChoiceModal`); Esc closes only when it is this
dialog's own (`isOwnEscape`); a navigable card is a native `<button>` (Enter / Space open it).
Overlay `zIndex: 50` (the app's modal tier — see `docs/walkthrough-flows.md`).
The primary button (the lone «Cerrar» with 2+ documents, «Ver …» with one) uses the design-system
primary blue with the same classes as the shared default Button (`bg-primary`, `hover:bg-primary/90`,
`shadow`), the same as the «Confirmar» of the order windows; the secondary «Cerrar» stays white with a border.

**Stable selectors** (E2E and walkthroughs):

| `data-testid` | Element |
|---|---|
| `confirm-result-modal` | overlay |
| `confirm-result-dialog` | the `role="dialog"` panel |
| `confirm-result-title` | title |
| `confirm-result-banner` | green banner (`role="status"`), absent with 0 docs |
| `confirm-result-card-<i>` | card `i`, with `data-doc-type` (the `type`) and `data-doc-status` (`CO` or `DR`) |
| `action-confirm-result-view` | «Ver …» (only with exactly one navigable doc) |
| `action-confirm-result-close` | «Cerrar» — present in **both** footer variants; target of the `create-sales-order` walkthrough's last step (`confirmed-ack`), do not rename |
| `action-confirm-result-dismiss` | the X icon |

Pure helpers `getConfirmResultTypeConfig(type)` and `getConfirmResultCopy(docs, ui)` are exported for
reuse and tests. Unit coverage: `tools/app-shell/src/components/contract-ui/__tests__/ConfirmResultModal.vitest.jsx`.

### 22. Header currency and exchange rate — `CurrencyRatePicker` (ETP-5840)

Not a `decisions.json` option: `EntityForm` swaps the header `C_Currency_ID` selector for
`components/contract-ui/CurrencyRatePicker.jsx` on the quotation, order and invoice windows
(`isCurrencyRateSelectorField`). The rate it edits is the header's hidden
`eTGOCurrencyRate` (`EM_ETGO_Currency_Rate`, `form: false`), which is the document's only
exchange rate: totals, previews, the Confirm/Complete check and the invoice «Tipos de cambio»
tab all read it.

**Rate reference date.** The rate comes from the conversion ranges valid on the reference date
currently in the FORM (unsaved edits included), resolved structurally by
`resolveRateDateField(fields, documentDateField)` — exported from `CurrencyRatePicker.jsx`:

| Header form declares | Reference date | Windows today |
|---|---|---|
| a field bound to AD column `DateAcct` | that field (`accountingDate`, «Fecha contable») | sales-invoice, purchase-invoice |
| no `DateAcct` field | `window.documentDateField` | sales-quotation, sales-order, purchase-order (`orderDate`) |

`documentDateField` is deliberately NOT repointed to `accountingDate` on invoices: it also
drives the `invoiceDate → accountingDate` cascade (`isDocumentDateCascadeTarget`). `DetailView`
threads `documentDateField` into the header `<Form>` calls; no generator change is involved.

**Behavior**

- Options come from `GET {entity}/{id|new}/action/currencyOptions?date=yyyy-MM-dd&organization=<form org>`
  (the org scopes a NEW document's rates; a saved one uses its own org), fetched
  eagerly on load and again whenever the record or the reference date changes, plus on every
  open. Listed: the org currency plus every currency with a conversion range to or from it
  on ANY date (client or system, document org or `0`); a currency with no range at all is not
  offered. One whose ranges do not cover the reference date has `rate: null` and shows «—»
  (tooltip `currencyRateNotAvailable`). The dropdown header shows the reference date as
  «Conversiones al dd/mm/yyyy» / «Conversions as of dd/mm/yyyy» (`currencyRatesAtDate`,
  `formatCalendarDate`; worded «Conversiones», not «Tipos», since ETP-5840 QA).
- Selecting a currency ALWAYS stages its rate — `null` when there is no range — so neither the
  previous currency's rate nor a manual rate survives a currency change. There is no
  client-side blocking anymore: the old «Cambio de moneda cancelado» revert
  (`validate-exchange-rate` + `noConversionRateError`) was removed from `DetailView.fireCallout`.
- The pencil (`currency-rate-pencil`) is offered on new and saved documents whenever the
  selected option is not the org currency (`isOrgCurrency` from `currencyOptions`; the former
  `rate === 1` sentinel is gone). A manual rate is kept until the reference date or the
  currency changes.
- **Recalculation.** The header callout on `currency`, the declared `documentDateField` and
  `accountingDate` returns the recalculated `eTGOCurrencyRate` (or `null`).
  `applyCalloutFieldUpdates` applies it through `isCurrencyRateRecalcTarget`
  (`detailViewHelpers.jsx`), which exempts exactly that key from the two guards that would
  otherwise drop it: the user-touched guard (so recalculation overrides a manual rate) and the
  empty-value guard (so «no range» clears a stale rate). On invoices an `invoiceDate` change
  recalculates too, because its callout also cascades `accountingDate`.
- Saving a foreign currency with an empty rate is refused by the backend (HTTP 422,
  `exchange_rate_missing`); the toast composes the sentence from the refusal's identity (or shows
  the backend prose for an unkeyed refusal) and the form stays in edit. The org currency needs no
  rate.
- The list-row Confirm of orders (`useOrderWindow.jsx`) no longer pre-checks
  `validate-exchange-rate`; the backend completion check is the authority. The quotation
  confirm modal only blocks when the document itself has no rate on a foreign currency, with the
  same sentence as the backend completion refusal (`backendError.exchangeRateMissingOnComplete`).

**i18n keys:** `currencyRateSearchPlaceholder`, `currencyRateSelectPlaceholder`,
`currencyRateEdit`, `currencyRateNotAvailable`, `currencyRatesAtDate` (plus the existing
`noResults`, `confirm`, `cancel`, `loading`).

**Create.** On a NEW document a rate applied by a callout (not typed or picked) is left out of
the create POST by the ETP-5537 rule 1 (`eTGOCurrencyRate` is not a mounted form field), which is
fine: the backend computes the rate on create from the reference date whenever it is absent.

**Refusals.** The save and complete refusals carry their identity (`ETGO_ExchangeRateMissingOnSave`
/ `ETGO_ExchangeRateMissingOnComplete` + params) and are composed in the UI locale by
`backendErrors.js` — see `docs/i18n-guide.md`, mechanism 3.

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
│   ├─ Full-width notice/banner above the form (record-wide warning, locked state)
│   │   └─ → window.customComponents.subHeader
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

## Custom `headerTable` toolbar & column hooks (ETP-5188, not `decisions.json` options)

Three generic mechanisms, introduced together for the Users window's list role filter and reusable
by any other window's custom `headerTable` component. Unlike every numbered option above, none of
these is a `decisions.json` key — they only apply to a window that already has a hand-written
`window.customComponents.headerTable` component (§4), where the column list is a plain JS array
declared by hand rather than derived from grid fields.

### `Table.ToolbarQuickFilter` — companion toolbar-slot component

**What it does:** lets a custom `headerTable` component expose a second component as a static
property — `MyHeaderTable.ToolbarQuickFilter = SomeComponent` — that `ListView.jsx` renders inline
in its OWN toolbar row, immediately left of the "Filtros" (advanced filter) trigger, alongside
"Ordenar por"/"Actualizar"/quick filters — that is the toolbar's main row; since ETP-5509 the
subset-filter tabs share that row while it fits and move to a line of their own only when it
does not, and the slot stays in the filters cluster either way (`docs/list-filters.md` →
"Toolbar layout"). The fit check counts the slot at its natural (max-content) width, so a slot
root that grows (`flex-1`, `w-full`) or wraps its own content (`flex flex-wrap`, as
`ChartOfAccountsToolbarSlot.jsx` does) is measured correctly; a slot does not need to size itself
for the measurement. What it must not do is take width it does not need on one line (e.g. a
`min-w-[600px]`), since that width is what the tabs are measured against. Same convention `DetailView.jsx` already
uses for `formFooter.inlineInHeaderCard` (§3) — a companion flag/property attached to a slot
component so the generic shell can special-case how it renders.

**Use when:** a custom `headerTable`'s own quick-filter control (built inside its own wrapper
markup) needs to sit in the SAME toolbar row a built-in quick filter (e.g. Purchase/Sales
Invoice's "Todos los estados") occupies, instead of a separate region above the table.

**How to use it:** attach the component to the `Table` reference your window's
`customComponents.headerTable` decision resolves to:

```jsx
// tools/app-shell/src/windows/custom/{window}/MyHeaderTable.jsx
export default function MyHeaderTable(props) { /* ... */ }
MyHeaderTable.ToolbarQuickFilter = MyToolbarQuickFilterSlot;
```

`ListView.jsx` checks `Table?.ToolbarQuickFilter` and, only when present, renders
`<Table.ToolbarQuickFilter entity windowName token apiBaseUrl data-testid="TableToolbarQuickFilter__620cbc" />`.
A slot component is free to ignore any/all of those four props and source its own state
elsewhere — the reference implementation, `RoleQuickFilterToolbarSlot.jsx`, ignores all four and
reads/writes the `role` URL search param directly via `useSearchParams()` instead, which is also
how it stays in sync with `UserHeaderTable`'s own live read of that same param (both component
instances mount under the same Router).

**Real example:** `tools/app-shell/src/windows/custom/user/RoleQuickFilterToolbarSlot.jsx`, attached
at the bottom of `UserHeaderTable.jsx` — moves the "Todos los roles" quick filter from its own
wrapper div into the toolbar row. See `docs/generated-custom-windows/user.md` → "Users list role
filter" for the full worked example.

**Second example — several controls and shared state:**
`artifacts/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx`, attached as
`AccountTreeView.ToolbarQuickFilter` (ETP-5593). It puts three controls in the row (expand/collapse
all, a search box, an account-type `DistinctValuesFilter`) and replaces the tree's own toolbar.
Filter values live in the URL (`q`, `accountType`, `chartOfAccountsFilters.js`), so the toolbar
Share button reproduces them. State that is not a filter (the expanded folders) is in a
window-local `useSyncExternalStore` store (`chartOfAccountsTreeStore.js`) that the slot and the
table both subscribe to, because they are siblings with no common parent of their own.

**Writing URL params from a timer or debounce:** do not use react-router's functional
`setSearchParams((prev) => …)` updater there. `prev` holds the params of the render that created the
callback, not the live URL, so a delayed write rewrites the URL as it was then and drops any param
set in between. Build the next params from a ref updated on every render instead (see
`useChartOfAccountsFilters` in `chartOfAccountsFilters.js`).

### `col.toQueryParams(row)` — per-column raw query-param hook

**What it does:** opts one column's advanced-filter condition OUT of the generic `criteria=` JSON
mechanism entirely, translating it instead into a raw `key=value[&key=value]` query-string segment
appended to the list request. Declared as a `toQueryParams` function on the column metadata object
(see the column-metadata shape documented at the top of `tools/app-shell/src/lib/gridQuery.js`).

**When to use it instead of `col.buildCriteria`:** `buildCriteria` still produces SmartClient
criteria JSON — an alternate shape within the same `criteria=` mechanism. `toQueryParams` is for a
condition the generic criteria layer cannot express AT ALL — typically because the field targets a
collection-valued relation (an N:M or backward FK) that needs a JOIN/subquery, not a dot-path
property NEO's HQL criteria builder can resolve. Real trigger: Users' "Rol" field needed to filter
by role composition (`AD_Role_Inheritance`), and a naive `criteria=` entry against that collection
returned a live `500` from NEO Headless.

**Contract:** `(row: {operator, value}) => string|null` — a URI-encoded `key=value` segment, or
`null` when this operator/value combination has nothing to contribute. Returning `null` does **not**
mean "let this condition fall through to `criteria=` instead" — see the next paragraph.

**A condition is ALWAYS stripped once its column declares `toQueryParams`, regardless of what the
hook returns for that row.** `extractQueryParamConditions()` (`gridQuery.js`) — called by
`ListView.jsx`'s `advancedFilterPart` before `buildAdvancedFilterCriteria` runs on what remains —
decides whether to strip a condition based on whether the column intercepted it, never on whether
the hook actually produced a segment. (This was a real ETP-5188 bug during development: the
early-return used to key off whether ANY segment was produced across the whole conditions array, so
a hook legitimately returning `null` for one operator let that condition leak straight back into
`criteria=` — exactly what this mechanism exists to prevent. Fixed before shipping; the regression
is now pinned in `gridQuery.vitest.jsx`.)

**Requires `filterable: true`** on the column — a `type: 'custom'` column with no
`column`/`backendFilterKey` is otherwise silently dropped from the advanced-filter field list
(`isFilterableColumn`, see this repo's top-level `CLAUDE.md` → "List Columns Must Be Real Columns").
When the column must never render as an actual grid cell, also set `filterOnly: true` (next
section).

**No-op for every column/window that doesn't declare it** — confirmed byte-identical before/after
against a window with no `toQueryParams` column (Purchase Invoice's own advanced filter).

**Real example:** `buildRoleFilterQueryParams` (`tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx`),
assigned as `roleFilterColumn.toQueryParams` in `UserHeaderTable.jsx` — translates the "Rol" field's
4 advanced-filter operators (Es/No es/Está vacío/No está vacío) into `RoleIds=`/`NoRole=`/
`RoleFilterNegate=` query params, consumed server-side by `UserRoleAssignmentHandler#applyRoleFilter`
(`com.etendoerp.go` — see that repo's `docs/neo-headless.md` §5.3).

### `col.filterOnly: true` — advanced-filter-only synthetic column

**What it does:** a generic, type-independent column flag that excludes a column from the actual
rendered grid (no header, no cell) while still letting it flow through to the advanced-filter field
list — i.e. the column exists purely so its field appears as an option in "Filtros avanzados",
never as a real grid column.

**Consumed by** `isLineGridColumn()` (`tools/app-shell/src/lib/linesColumnWidth.js`):
`col.filterOnly !== true && !NON_GRID_COLUMN_TYPES.has(col.type)`. A `filterOnly: true` column still
flows through `DataTable`'s raw `columns` prop into its `onColumnsReady` callback → `ListView`'s
`filterColumns`, which is the only place it needs to exist.

**Use when:** declaring a synthetic field with no backing AD column at all (no `column:` value) —
most commonly paired with `toQueryParams` above, since a field with no real backend property has
nothing for `criteria=` to filter on directly, but the field itself is still a legitimate thing
users want to filter by.

**Distinct from `NON_GRID_COLUMN_TYPES`** (e.g. `dimensionsPanel`, ETP-4610): that set opts an
entire column TYPE out of ever rendering as a grid column, everywhere it's used. `filterOnly` is
per-column and type-independent — any column type can opt out of grid rendering this way without
hijacking an unrelated type's own semantics.

**Real example:** `roleFilterColumn` in `UserHeaderTable.jsx` — `type: 'custom'`,
`filterOnly: true`, `filterMode: 'enumLabel'`, no `column:` at all; it never renders as a 7th grid
column, only as the "Rol" entry in the advanced-filter field list.

**Cross-references:** `docs/generated-custom-windows/user.md` → "Users list role filter" for the
full worked example combining all three mechanisms; `com.etendoerp.go`'s `docs/neo-headless.md`
§5.3 for the backend half (`UserRoleAssignmentHandler#applyRoleFilter`).

---

## `ListView` / `DetailView` wrapper props (ETP-5600, not `decisions.json` options)

Generic props a hand-written window wrapper (`tools/app-shell/src/windows/custom/{window}/index.jsx`)
passes to the generated page, which forwards them to `ListView` / `DetailView`. The generator does
not emit any of them; a window opts in from its own wrapper. Reference consumer: the Contacts window
(`docs/generated-custom-windows/contacts.md`).

### `newActions[].opensImportDialog` — import from the split "New" menu

An item of the `newActions` prop may declare `opensImportDialog: true` instead of an `onClick`.
`ListView` then wires it to the window's own import dialog (`window.import`), so the window does not
reimplement how the import opens.

```jsx
newActions={[{ key: 'import', label: ui('importContacts'), opensImportDialog: true }]}
```

Rules, all in `ListView.jsx`:

- The item is **dropped** when the window has no enabled import (`importConfig.enabled` false), so the
  menu never shows an action that does nothing.
- When the split menu offers the import, the **standalone import icon** in the toolbar
  (`ListView__importButton`) is **not rendered**, because the menu already offers it.
- The standalone icon **stays** whenever the menu is unavailable (read-only window, `hideCreate`), so
  the import is never left unreachable.

The generator's own `window.newActions` (`docs/decisions-reference.md` → *New Actions*) still emits only
`key`/`label`/`onClick`; `opensImportDialog` is set from the wrapper.

### `emptyListContext` — whole-window empty state for a custom list Table

`ListView` passes every list Table (generated or a `customComponents.headerTable`) an
`emptyListContext` prop. It is **non-null only when the window has no records at all**:

| Condition | `emptyListContext` |
|---|---|
| Still loading (`hook.loading`) | `null` |
| Fetch failed (`hook.meta` is only set on a successful response) | `null` |
| The response has rows | `null` |
| A column filter, the search box, the advanced filter, a quick filter with a server-side `filter`, or a subset filter with a server-side `filter` is active | `null` |
| A **client-side** `rowFilter` subset is active (e.g. Contacts' Personas/Empresas) | not counted: `hook.items` always holds the unnarrowed rows, so a subset that hides every row keeps the normal grid |
| None of the above: successful fetch, zero rows | `{ onCreate, onImport, importFormats }` |

The window's permanent `baseFilter` is not a user choice and does not count as narrowing.

The object carries the window's own entry points, so the Table renders a "start here" state without
re-deriving them:

| Key | Value |
|---|---|
| `onCreate` | The list's New action (`onNew` or navigation to `/{window}/new`). `undefined` when the window is read-only or `hideCreate`. |
| `onImport(file?)` | Opens the window's import dialog. Pass a `File` (e.g. one dropped on the empty state) and it is forwarded to the core `ImportDialog` as `initialFile`, which processes it as if picked in its own dropzone and shows a processing indicator (`labels.processing`) meanwhile. `undefined` when the window has no enabled import. |
| `importFormats` | `importConfig.formats` when the import is enabled, else `undefined`. |

A Table that does not use the prop ignores it and keeps rendering its grid. Usage:

```jsx
export default function MyTable({ emptyListContext = null, ...rest }) {
  if (emptyListContext) return <MyEmptyState context={emptyListContext} />;
  return <DataTable {...rest} />;
}
```

Render each entry point only when it is defined. The reference implementation,
`windows/custom/contacts/ContactsEmptyState.jsx`, also uses two optional app hooks: `useCopilotOptional()`
(`components/CopilotContext.jsx`, returns `null` instead of throwing without a `CopilotProvider`) to show
an "Ask Copilot" button that calls `copilot.open`, and `useLaunchWalkthrough(source)`
(`lib/walkthrough/useLaunchWalkthrough.js`, see `docs/walkthrough-flows.md` §9) to start a guided tutorial.

The core `ImportDropzone` (`@etendosoftware/app-shell-core/components/import/ImportDropzone.jsx`) is shared
by every window's `ImportDialog` and by this empty state, so its look changes everywhere at once (ETP-5600):
by default a 1px dashed gray/200 border with no fill; on hover a 5% `#121217` overlay and a gray/400 border
(200ms ease-in); while a file is dragged over, the primary highlight. An optional `disabled` prop (default
`false`) renders the disabled fill, drops `tabIndex` to -1 and ignores clicks and drops.

### `primarySave` — keep Save as the primary button on existing records

On an existing record, `DetailView` renders Save with the secondary (outline) look by default
(`saveActions.jsx` → `renderExistingRecordSaveAction`). A window whose Save remains the only primary
action of the detail view passes `primarySave={true}` to keep the default filled `Button` variant.
Default `false`; it does not change the new-record path, where `hasExternalPrimaryAction` is the
equivalent switch in the other direction.

### Bottom tab-strip icons — `components/contract-ui/tabIcons.js`

The icon before each secondary-tab label in the detail view's bottom tab strip is resolved by
`resolveTabIcon(tabKey)` (used by `TabStripButton.jsx`) from the `TAB_ICONS` map, keyed by tab key
(`secondaryTabs` key, or `custom:<key>` for `customTabs`). Unknown keys fall back to `List`. To give a
tab an icon, add its key to `TAB_ICONS`. The map is keyed by tab, not by window, so every window
with a tab of that key gets the same icon. Current entries include `custom:attachments`, `custom:sif`,
`custom:pricing`, `products`, and the business-partner tabs `contact`, `bankAccount`, `locationAddress`,
`customerAccounting`, `vendorAccounting`. The map lives outside `DetailView.jsx` because that file is
under the no-growth guardrail (`.claude/hooks/check-detailview-growth.mjs`).

---

## FK click-through navigation (`fkNavigation.js`)

**Makes a read-only foreign-key value clickable, opening the record it points at — in the
detail form and the list grid alike.** Added in ETP-5075; first consumer is
`matched-purchase-invoices`.

This is **not** a `decisions.json` option. It is a registry in the app-shell:

`tools/app-shell/src/components/contract-ui/fkNavigation.js`

```js
export const FK_NAVIGATION_TARGETS = {
  C_InvoiceLine_ID: { window: 'purchase-invoice', idField: 'invoiceHeaderId' },
  M_InOutLine_ID:   { window: 'goods-receipt',    idField: 'receiptHeaderId' },
};
```

Keyed by **AD column name**, deliberately — not by `reference`. The generated form
descriptors carry both `column` and `reference`, but generated *grid* columns carry only
`column`; keying by column lets one registry drive both surfaces with no change to the
generators in `schema_forge_core`, i.e. no core release.

Two kinds of entry:

| Entry | When | Target id |
|---|---|---|
| `{ window }` | The FK already points at a document header with a window of its own (`C_BPartner_ID` → `business-partner`) | The FK's own value |
| `{ window, idField }` | The FK points at a **line**, which has no window — navigation only ever reaches a header | `record[idField]`, injected per row by the entity's `NeoHandler` |

For the second kind the parent id is not in the payload (an FK returns the id plus a
`$_identifier` label and nothing else) and there is no declarative server-side derivation
to compute one, so the entity needs a `javaQualifier` handler that `put`s it into each GET
row in `afterHandle`. See `MatchedInvoiceHandler` in `com.etendoerp.go` for the pattern,
and `docs/generated-custom-windows/matched-purchase-invoices.md` for the worked example.

**Consumed by** (both already wired — nothing to do per window):

- `EntityForm.jsx` → `renderReadOnlyFk()`, the single point every read-only FK passes
  through (`type: 'selector'` and `type: 'search'` both land there).
- `DataTable.jsx` → `renderCellValue()`, wrapped at the dispatch point rather than inside
  each cell renderer, so it works whatever cell type the column resolves to.

**It fails closed, by design.** No registry entry, no resolvable id, or no `navigate`
handed down ⇒ `resolveFkNavigation()` returns `null` and the field/cell renders exactly as
before. That is what makes it safe to have in components every window renders. `navigate`
is passed as a prop (from `DetailView`/`ListView`) rather than pulled from `useNavigate()`,
so `EntityForm`/`DataTable` stay Router-agnostic and their existing unit tests, which mount
them without a Router, keep working.

**To make another window's FK navigable:** add one line to the registry. If the FK points
at a line rather than a header, also add the handler that injects the parent id. Nothing
else — no `decisions.json` key, no generator change, no regeneration of the window.

> Watch out for `stopPropagation()` in the grid: without it a cell click also triggers the
> row's own `onNavigate`, which wins and sends the user to *this* window's record instead.
