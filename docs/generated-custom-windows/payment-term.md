# Payment Term

## Intent

Maintain the rules that determine when a receivable or payable becomes due and which term is treated as the default option for downstream document entry. Since ETP-5978 the window is deliberately minimal — a list plus a create/edit popup, no detail view: a term is a **name** and a **number of days**, plus the two flags `Default` and `Next Business Day`. Everything else a payment term needs (its search key, its month offset) is derived by the server.

## What this window should allow

- List existing payment terms and find them by `Nombre` (`Name`).
- Create a term, or edit one of its four visible fields — `Nombre` (`Name`), `Días` (`Days`; AD column `NetDays`, AD name `Overdue Payment Days Rule`), `Por defecto` (`Default`) and `Siguiente día hábil` (`Next Business Day`) — in a small popup, without leaving the list.
- Delete one term (hover trash) or several at once (selection checkboxes + bulk delete).
- See at a glance in the list whether a term is the default and whether it moves due dates to the next business day: `Por defecto` and `Siguiente día hábil` are both rendered as `Sí`/`No` badges (green/neutral).
- Use the maintained term later from other transaction windows that expose `Payment Terms` selectors, such as sales and purchase documents (which can also create a term from a number of days, see ETP-5826 below).

## Interaction model

- **Layout (ETP-5978):** `layoutType: "list-modal"` — a grid plus a create/edit **popup**, rendered by the generic `ListModalWindow` (`tools/app-shell/src/components/contract-ui/ListModalWindow.jsx`) in its compact variant (`ListModalCompactDialog.jsx`). There is **no detail view** any more. Shared behaviour: `docs/window-templates.md` → *`list-modal`*, *Compact look*, *Deep link*.
- **Route:** `/payment-term` — a single list screen. `/payment-term/<recordId>` (the generic `:windowName/:recordId` route) no longer opens a detail page: it opens the list **with that term's edit popup already open**. A record missing from the loaded list is read with `GET header/<id>`; one the server does not return shows the `recordNotFoundTitle` toast. Closing the popup (or the not-found case) replaces the URL with `/payment-term`, so a reload does not reopen it. A read-only role gets the plain list. Opening a term from the list does not change the URL. Nothing else in the app builds a `/payment-term/<id>` link (the "+ Crear condición de pago" selectors write to the spec, they do not navigate), so no caller needed a change.
- **Visibility:** visible in **System > Settings** from `tools/app-shell/src/menu.json`; not marked hidden.
- **Implementation type:** generated `list-modal` window loaded from `tools/app-shell/src/windows/registry.js` into the generic `/:windowName` shell route. The generator emits only `HeaderPage.jsx` (plus `index.jsx`, `labels.js`, `mockCatalogs.js`); the default-layout `HeaderForm.jsx` / `HeaderTable.jsx` were removed in ETP-5978. `mockData.js` stays because `App.jsx` loads it for mock mode.
- **Window shape:** header-only. `decisions.json` excludes the `lines` (`C_PaymentTermLine`) and `translation` entities, so neither the contract nor the NEO spec exposes them (`ETGO_SF_ENTITY.IsIncluded = 'N'`); there are no `/lines` endpoints. No attachments (a list-modal window has no attachments tab).

### List toolbar and rows (ETP-5978)

- **Toolbar:** left — **Filtros** (advanced filter); right — sort, refresh, and the blue primary **+ Nueva condición de pago** (`New payment term`). No back/"Cancelar" button (`hideBackButton`) and no local search box (`hideSearch`; the app's global search sits in the top bar). The sort → refresh order is the app-wide order, kept on purpose even though the Figma shows refresh first.
- **Row click** opens the term's edit popup (`rowClickEdit`). Clicks on the selection checkbox or the hover actions do not.
- **Row hover:** pencil (edit popup) and red trash (delete with confirmation) at the right edge. No clone (`allowClone` off).
- **Bulk delete:** ticking rows shows the selection bar ("N seleccionados") with a delete button; after confirmation the outcome toast reports all / partial / none deleted.
- **Sorting** is client-side (header click or the sort popover) over the loaded list.

### Popup (ETP-5978)

A 400px popup, title **Nueva condición de pago** on create / **Editar condición de pago** on edit (`templateConfig.titleKey` / `editTitleKey` → `paymentTermNewTitle` / `paymentTermEditTitle`). The four fields stack in one column, in `seq` order:

| # | Field (es_ES label) | Key / AD column | Notes |
|---|---------------------|-----------------|-------|
| 1 | `Nombre` * | `name` / `Name` | Required. At most **60 characters**: the input stops accepting text at the column length (`maxLength: 60`, taken from the DB column by the generator). Renaming updates the translations too (see *Renaming a term* below) |
| 2 | `Días` * | `overduePaymentDaysRule` / `NetDays` | Required. Integer with − / + stepper buttons inside the input (`stepper`, `min: 0`, `max: 365`, `integer`) — the backend range of ETP-5826. The input holds at most **3 digits** and nothing else; a refused keystroke or paste leaves the box as it was. Any non-digit — a decimal separator (`,` or `.`), a letter, a `%`, a `-` — is refused with the inline message "Introduce un número entero de días, sin decimales, letras ni porcentajes." under the field (`stepperRejectedKey: "paymentTermDaysNotInteger"`, en_US "Enter a whole number of days, with no decimals, letters or percentages.") — the same message as the selectors' "+ Crear condición de pago" modal. A 4th digit is refused with "El máximo permitido es 365" (`qtyMaxAllowed`). The message clears on the next accepted keystroke or on blur |
| 3 | `Por defecto` | `default` / `IsDefault` | Checkbox |
| 4 | `Siguiente día hábil` | `nextBusinessDay` / `IsNextBusinessDay` | Checkbox, **ticked on a new term** (`defaultValue: "Y"`) |

The two checkboxes are stacked as one group. Footer: outline **Cancelar** pill (closes, nothing saved) and blue **Guardar** pill with a save icon, on create and on edit. A round X close button is visible top-right and closes the popup like **Cancelar**.

**Saving.** Nothing is saved until **Guardar**: create is a `POST header`, edit a `PUT header/<id>`, then the list reloads. **Guardar** stays disabled while `Nombre` or `Días` is empty (the `requiredFieldsMissing` message inside the popup is only a backstop behind that). `Días` can only ever hold 0–365: the **stepper** buttons are disabled at their bound (0 and 365), so a click never leaves the range; a typed 3-digit value above 365 (e.g. `400`) is clamped to 365 on blur; and a decimal, a sign, a letter or a 4th digit cannot be entered at all (see the table above). **Guardar** still re-checks `min` / `integer` before any request (`firstFieldViolation`, `listModalSave.js`) and, on a violation, sends nothing and shows the message in the popup's error box — but with the keystroke guard in place that gate is a backstop that is hard to reach from the UI. A backend refusal (out-of-range or duplicate days, duplicate name) is translated by `lib/backendErrors.js` and shown inside the popup, which stays open; delete refusals are translated the same way, as a toast.

**`autoSaveOnBlur` no longer applies.** Before ETP-5978 the detail form saved field by field on blur; the popup has no per-field save, so the key was removed from `decisions.json`.

### List columns (ETP-5978)

- **Columns**, in this order (`gridOrder`): selection checkbox | `Nombre` (semibold, `cellType: "boldText"`) | `Días` | `Siguiente día hábil` | `Por defecto` (English: `Name` | `Days` | `Next Business Day` | `Default`). `Siguiente día hábil` and `Por defecto` are both badges: `Sí` (green) / `No` (neutral), `Yes`/`No` in English (`badge`, `badgeLabels`, `badgeVariants` on each field). Columns have **fixed widths** and none grows (`grow` was dropped in ETP-5978): `Nombre` 164px, widening to fit a longer name up to 240px and truncated with an ellipsis beyond (`columnWidth: 164, columnMaxWidth: 240`); `Días` 124px up to 148px (`columnWidth: 124, columnMaxWidth: 148`) — both caps are the full column width, cell padding included; `Siguiente día hábil` and `Por defecto` 158px each (`columnWidth: 158`). The free space stays empty on the right (the grid adds an empty spacer column), and the hover actions sit at the far right edge. See `docs/window-templates.md` → *Fixed column widths*.
- **Density:** `templateConfig.listVariant: "compact"` gives the Figma list: 40px rows with vertically centred cells, a 32px checkbox column, and white outline toolbar buttons (Filtros, sort, refresh).
- **Filters:** the API search filter list is `Nombre` only (`searchable: true` on `name` → `supportedFilters: ["name"]` and the page's `filters`); since the local search box is hidden (`hideSearch`), it has no control in this window. The advanced filter (**Filtros**) offers `Nombre`, `Días`, `Siguiente día hábil` and `Por defecto`; the two flags are `Sí`/`No` pickers worded like their badges (ETP-5978 — before this fix a list-modal window dropped every boolean column from the advanced filter). There is no `Clave` column and no filter by search key.
- **English labels.** `window.labelOverrides.en_US` maps `Name` → `Name`, `NetDays` → `Days`, `IsDefault` → `Default` and `IsNextBusinessDay` → `Next Business Day`, and the `nextBusinessDay` field's own `labels.en_US` is `Next Business Day`, so neither the column header nor the popup label falls back to the AD name `Overdue Payment Days Rule`. The Spanish labels (`Días`, `Nombre`, `Siguiente día hábil`, `Por defecto`) are unchanged.

### Layout configuration

All keys live in `decisions.json → window`:

| Key | Value | Effect |
|-----|-------|--------|
| `layoutType` | `"list-modal"` | Grid + create/edit popup, no detail view |
| `templateConfig.modalVariant` | `"compact"` | 400px one-column popup (`ListModalCompactDialog`) |
| `templateConfig.titleKey` / `editTitleKey` | `paymentTermNewTitle` / `paymentTermEditTitle` | Popup title on create / edit |
| `templateConfig.newLabelKey` | `paymentTermNew` | "+ Nueva condición de pago" button label |
| `templateConfig.newButtonVariant` | `"primary"` | Blue primary new button |
| `templateConfig.hideBackButton` | `true` | No toolbar back button |
| `templateConfig.hideSearch` | `true` | No local search box |
| `templateConfig.rowClickEdit` | `true` | Row click opens the edit popup |
| `templateConfig.listVariant` | `"compact"` | Figma list density: 40px rows, 32px checkbox column, white toolbar outline buttons |
| `labelOverrides` | es_ES / en_US | Field and column labels (above) |

Column widths are field-level (`columnWidth` / `columnMaxWidth`, emitted as `minWidth` / `maxWidth` in the `HeaderPage.jsx` column literals), see *List columns* above.

The default-layout keys the window declared until ETP-5978 (`attachments`, `autoSaveOnBlur`, `noHeaderBorder`, `whiteFormBackground`, `formCardPadding`, `formScrollPaddingX`, `tabsBarPaddingX`, `toolbarBorderBottom`, `toolbarPaddingX`, `listbarPaddingX`, `tablePaddingX`, `hidePrint`, `hideMoreMenu`, `hideLink`) and the field-level `span` / `grow` were removed: neither `generateListModalPage` nor `ListModalWindow` reads them, so they had no effect. The list-modal toolbar has no Print, More or copy-link control anyway.

## Server-derived fields: `Clave` and `Meses de desplazamiento` (ETP-5978)

`Clave` (`searchKey` / `Value`) and `Meses de desplazamiento` (`offsetMonthDue` / `FixMonthOffset`) are mandatory in the AD but are **not** shown anywhere in the window. Both are `visibility: "system"` in `decisions.json` (`derivation: "fromConfig"`) and `ETGO_SF_FIELD.IsReadOnly = 'Y'` / `Visibility = system` in `com.etendoerp.go`.

| Operation | `searchKey` (`Value`) | `offsetMonthDue` (`FixMonthOffset`) |
|-----------|-----------------------|-------------------------------------|
| Create, field not sent (the window never sends it) | Filled by `PaymentTermHandler`: `<days>D` (`12D`, `30D`), `I` for 0 days | Filled with `0` |
| Create, field sent by an API caller (REST / batch / MCP) | **Kept** — the handler never overwrites a caller value | **Kept** |
| Update (REST `PATCH`/`PUT`, MCP `etendo_update`) | Cannot be changed: the field is read-only, so the NEO write filter (`filterWriteRequest`) silently drops it | Same |

**Duplicate keys are allowed, by decision.** `C_PaymentTerm` has no unique constraint on `Value` (the only unique constraint, `C_PAYMENTTERM_NAME`, is on client + organization + name), so two terms may share a key. The real duplicate case — two simple terms with the same days — is already refused with the 409 `ETGO_PaymentTermDaysDuplicate` (ETP-5826), and the key is hidden from the user, so no extra uniqueness check was added.

Because `offsetMonthDue` can no longer be edited here, a term with a month offset can only be created through the API (REST create with an explicit `offsetMonthDue`) or the classic UI. Existing terms with an offset keep it.

The full server contract (MCP enrichment, channel parity) is in `modules/com.etendoerp.go/docs/neo-headless.md` §5.3.5.

## Reactive behavior and dependencies

- **`Siguiente día hábil` starts ticked on a new record.** The list-modal create popup does not call `/defaults`, so `decisions.json` declares both `"defaultValue": "Y"` (seeds the popup, coerced to `true`) and `"defaultExpr": "Y"` (pushed to `ETGO_SF_FIELD.DefaultValue`, so `GET /sws/neo/payment-term/header/defaults` and the MCP contract still return it for API callers). It matches what the server derives for a non-zero number of days, and because the popup always sends the field, the user's choice is what gets persisted.
  - **Known divergence (accepted):** a **0-day** term created from this popup is saved with `Siguiente día hábil` ticked unless the user unticks it, whereas a 0-day create from a selector's "+ Crear condición de pago" or from MCP without the field derives `false` (the `Inmediato` shape). In practice a 0-day create is normally refused anyway by the 409 duplicate-days rule, because every tenant has the seeded `Inmediato` term.
- `Default` and `Next Business Day` are rendered as badge-style booleans in the list, so users can quickly identify which terms are flagged as default and which move to the next business day.
- No parent/child interaction is visible in the generated page. The `lines` child structure is excluded in decisions, so users cannot manage installment or split-term detail from this screen.

### Renaming a term (ETP-5978)

`C_PaymentTerm.Name` is translatable and is the entity's only identifier column, so every payment-term selector (and, before ETP-5978, the detail record title and breadcrumb) shows the **translated** name (`C_PaymentTerm_Trl.Name`). The database trigger copies the name into the translations only on insert; on update it just marks them `IsTranslated = 'N'`. Before ETP-5978 a rename therefore left the old name in the selectors (and the detail title and breadcrumb) while the `Nombre` field showed the new one.

Since ETP-5978 `PaymentTermHandler` (after a successful rename) copies the new name into **every** language's `C_PaymentTerm_Trl.Name` and into the `_identifier` echoed by the save response. Since the list-modal switch the list reloads after **Guardar**, so the row shows the new name at once.

- **All languages are overwritten, by design** — Etendo GO has no translation tab for payment terms, so nothing else could correct them.
- **Not atomic with the rename:** the translation update runs in a second transaction after the rename is committed. If it fails, the error is logged and the rename stays saved; the identifier stays stale until the term is renamed again.
- **Terms renamed before this fix** keep their stale translations until they are renamed again.

## Personal list-column views

Since ETP-5978 the Payment Term list renders through `ListModalWindow` with a stable scope (spec
`payment-term`, entity `header`, base URL `/sws/neo/payment-term`), so it carries the personal
Columns and Save view controls behind the `grid-column-views` flag (off by default). Its row
selection, actions and filter/sort state are not part of a saved view. Identity checks and
load/save failures: [shared grid-view policy](../feature-flags.md#personal-business-grid-views).

Specific to this window's fixed widths (see *List columns* above):

- **With a personal view active**, the user's widths win. The declared `columnWidth` values become
  the view's default widths — `Nombre` 164px, `Días` 124px, `Siguiente día hábil` 158px,
  `Por defecto` 158px. The `columnMaxWidth` cap (240 / 148) and the empty spacer column do not
  apply, so the table is exactly as wide as its columns and the hover edit / delete sit right
  after the last column.
- **Without a view** (flag off, or no view saved), the fixed widths, the caps and the spacer stand
  as described above.

## Gap assessment

- Due-date semantics are narrower in the shipped UI than in the backend model. The backend contract includes hidden header fields such as `fixedDueDate`, `maturityDate1/2/3` and `overduePaymentDayRule`, and since ETP-5978 also `offsetMonthDue`; the window only exposes the number of days and the next-business-day flag. Fixed-date, multi-date or month-offset terms are maintained through the API or the classic UI, not here.
- The AD tab model has `C_PaymentTermLine` lines (percentage, remainder, payment method, exclude-tax, due-date fields), but they are excluded from this window. If installment schedules or line-level term breakdowns are expected, that is a current gap.
- The business meaning of `Default` suggests it may need uniqueness or downstream auto-selection behavior, but the current frontend evidence only shows an editable boolean with badge rendering. No UI evidence confirms exclusive enforcement, warnings, or automatic propagation, so that remains an open ambiguity.
- `Description` is discarded. If users need explanatory text to distinguish similar payment terms, that capability is not visible in the current window.

## Manual verification

1. Open `/payment-term`: the list shows 40px rows, a selection checkbox and the fixed-width columns `Nombre` (semibold, 164px) | `Días` (124px) | `Siguiente día hábil` (158px) | `Por defecto` (158px), with empty space on the right and no stretched column, both flag columns as `Sí` (green) / `No` (grey) badges, no `Clave` column. The toolbar shows **Filtros** on the left and sort, refresh and a blue **+ Nueva condición de pago** on the right — no back button, no search box, no Print/More/copy-link. Switch the UI to English: headers `Name` | `Days` | `Next Business Day` | `Default` (never `Overdue Payment Days Rule`), `Yes`/`No` badges, button `New payment term`.
2. Click **+ Nueva condición de pago**: a 400px popup titled **Nueva condición de pago** shows, in one column, `Nombre` *, `Días` * (with − / + buttons), then `Por defecto` and `Siguiente día hábil` stacked — the latter already ticked. No `Clave`, no `Meses de desplazamiento`.
3. In `Días` press − at 0 and + at 365: the button is disabled at the bound. Type `400` and leave the field: it becomes 365. Type `7` then `,` (or `.`): it is not entered, the box keeps `7`, and "Introduce un número entero de días, sin decimales, letras ni porcentajes." shows under the field; it disappears on the next accepted digit or when the field loses focus. In an empty box type `-`: same message. Type `7a`, `7-` or `7%`, or paste `12abc`: not entered, same message. With three digits in the box, type a fourth: it is refused and the message reads "El máximo permitido es 365". In `Nombre`, a 61st character cannot be typed. With either required field empty, **Guardar** is disabled.
4. Type a name and `40` days, press **Cancelar**: nothing is created. Reopen, fill again and press **Guardar**: the popup closes, the list reloads with the new term; through the API (`GET /sws/neo/payment-term/header/<id>`) its `searchKey` is `40D` and its `offsetMonthDue` is `0`.
5. Click a row (not its checkbox): the popup opens titled **Editar condición de pago** with the term's values. Hover a row: the pencil opens the same popup, the red trash asks for confirmation and deletes. Tick two rows: the selection bar's delete button removes both after confirmation.
6. Rename a term (e.g. `45 Días` → `45 días netos`) and **Guardar**: the row shows the new name; after a reload a payment-term selector in a sales invoice lists it, in every UI language.
7. Save a term with the days of another simple term: the popup stays open and shows "Ya existe la condición de pago «…» con esos días".
8. Open `/payment-term/<recordId>` directly: the list opens with that term's edit popup open; close it and the URL becomes `/payment-term` (a reload does not reopen it). `/payment-term/<unknown id>` shows the not-found toast and the plain list.
9. Through the API, read a term (`GET /sws/neo/payment-term/header/<id>`) and `PATCH` it with `{"nextBusinessDay": false, "searchKey": "X", "offsetMonthDue": 2, "updated": "<the updated value just read>"}`: the request succeeds, `nextBusinessDay` is saved, and `searchKey` and `offsetMonthDue` keep their stored values. The `updated` field is required by NEO's optimistic locking (pre-existing, not specific to this window): without it the `PATCH` answers 400 `missing_updated` and nothing is saved.
10. Confirm no fixed-date, month-offset or child-line installment control is exposed.

## Automated evidence

- `artifacts/payment-term/__tests__/contract-integrity.test.js` (ETP-5978, 44 tests, `node --test`) guards the list-modal window against a regeneration undoing it:
  - **Layout:** `layoutType: "list-modal"` in decisions and contract; no `HeaderForm.jsx` / `HeaderTable.jsx` generated; each `templateConfig` opt-in key (`modalVariant`, `hideBackButton`, `hideSearch`, `newButtonVariant`, `rowClickEdit`, `listVariant`) declared and carried into `HeaderPage.jsx`'s `listModalConfig`; no attachments tab.
  - **Server-derived fields:** `searchKey` / `offsetMonthDue` are `system` in decisions and absent from the contract fields, the generated popup and grid, and every `supportedFilters` list.
  - **Popup:** exactly `name` and `overduePaymentDaysRule` required; fields in `seq` order in decisions, generated page and contract form; the days field is a 0–365 integer stepper with `stepperRejectedKey: "paymentTermDaysNotInteger"`, translated in `en_US` and `es_ES`, and no other field has a refusal key; `name` capped at `maxLength: 60` from the contract validation, and no other field capped; `nextBusinessDay` starts ticked (`defaultValue`).
  - **Grid:** columns in `gridOrder`; bold name; no growing column; each column's `minWidth` / `maxWidth`; `default` and `nextBusinessDay` as green/neutral badge columns; list search on `name` only.
  - **Labels and defaults:** the `en_US` label overrides; `nextBusinessDay.defaultExpr = "Y"` server-side.
  - **MCP create contract:** only `name` and `overduePaymentDaysRule` in `minimumCreate`; the server-derived fields absent from the `createHeader` example and `formState`.
- `artifacts/payment-term/contract.json` defines a `list-modal` frontend contract (`window.layoutType`, `window.templateConfig`) with `detailEntity: null`, the four popup fields (`stepper`/`min`/`max`/`integer` on the days, `defaultValue: "Y"` on `nextBusinessDay`, `cellType: "boldText"` on the name), the fixed column widths (`columnWidth`/`columnMaxWidth`), `templateConfig.listVariant: "compact"`, badge metadata for `default` and `nextBusinessDay`, the `es_ES`/`en_US` label overrides, and a list filter on `name` only. It declares only the `header` entity.
- `artifacts/payment-term/generated/web/payment-term/HeaderPage.jsx` carries the `columns` / `fields` / `sections` literals and the `listModalConfig` passed to `ListModalWindow`.
- Shared behaviour is covered in `tools/app-shell/src/components/contract-ui/__tests__/`: `ListModalWindow.vitest.jsx` (toolbar options, row-click edit, deep link, save gate, translated save / toggle / delete errors, fixed widths and spacer column), `ListModalCompactDialog.vitest.jsx` (compact popup), `NumberStepperInput.vitest.jsx` (bounds, keystroke refusal and its messages), `listModalCells.vitest.jsx` (boolean text / badge cells), `listModalFilterColumns.vitest.js` (boolean columns in the advanced filter) and `listModalSave.vitest.js` (`firstFieldViolation`).
- Server side (`com.etendoerp.go`): `PaymentTermHandlerTest` covers the create enrichment (including the MCP early path `resolveServerCreateFields` and the dropping of server-filled values), the rename → translation sync and the echoed `_identifier`.
- Shared-component fix found while testing this window: the editable numeric inputs rendered by `EntityForm` (`MaskedAmountInput`) now carry `id={f.key}`, so the field label is associated with its input again (clicking `Días` focuses it; `getByLabelText` finds it). Guarded by `EntityForm.commaDecimal.vitest.jsx` and `fields.MaskedAmountInput.vitest.jsx`.
- `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js` confirm menu visibility and route registration.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; at the time this window had no required header fields so the array was empty and there was no behavioral change. Since ETP-5978 the page is a `list-modal` page with no `requiredHeaderFields`; `name` and `overduePaymentDaysRule` carry `required: true` on their popup field literals instead.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## Days validation, duplicates and days-only create — ETP-5826

Payment terms can now be created from every payment-term selector ("+ Crear condición de pago") by typing only a number of days. The server-side rules live in `PaymentTermHandler` (`com.etendoerp.go`, `@NeoExtension(spec = "payment-term", entity = "header")`) and apply to this window too, on every channel (REST, batch, MCP). Full contract: `modules/com.etendoerp.go/docs/neo-headless.md` §5.3.5.

- **Days (`Días` / `Overdue Payment Days Rule`)** must be a whole number between 0 and 365. Anything else answers 400 (`ETGO_PaymentTermDaysInvalid` / `ETGO_PaymentTermDaysOutOfRange`). On update the range is only checked when the days change, so a legacy term stays editable.
- **No duplicates by days:** a second *simple* term (no lines, not fixed-due, month offset 0 or empty) with the same days in the same client — any organization, active or inactive — answers 409 `ETGO_PaymentTermDaysDuplicate`, naming the existing term. Saving an edited term that keeps its days does not trigger the check.
- **Messages in the SPA:** these refusals are translated by the shared `lib/backendErrors.js` (by message key, with `messageParams`), so this window's save and the "+ Crear condición de pago" modal show the same sentences: out of range "El número de días debe estar entre {min} y {max} (indicado: {value}).", duplicate by days "Ya existe la condición de pago «{name}» con esos días" and by name (`ETGO_PaymentTermNameDuplicate`) "Ya existe una condición de pago llamada «{name}» en esta organización", each adding "pero está desactivada. Reactívala en Condiciones de pago" when the existing term is inactive.
- **No duplicate names:** a name another term of the same client already uses in the same organization (exact match, active or inactive) answers 409 `ETGO_PaymentTermNameDuplicate` instead of a database error. This covers a non-simple term (month offset, fixed due date, lines) named like the `N Días` a days-only create derives (QA BUG-1). Checked on create and when a term is renamed.
- **Create defaults:** when not sent, the name is derived as `N Días` (`1 Día`), the search key as `ND` (`12D`), `Offset Month Due` = 0 and `Next Business Day` = on — the same shape as the seeded terms (zero days follows `Inmediato`: key `I`, `Next Business Day` off). Since ETP-5978 the search key and the offset are never shown in this window (see *Server-derived fields* above), and the popup's `Siguiente día hábil` starts ticked, so a create from the popup always sends the user's choice.
- **`Next Business Day`** (`IsNextBusinessDay`) is an editable checkbox in the popup (it was discarded before ETP-5826), so the derived value is persisted and can be changed here. When on, a due date falling on a weekend moves to the next Monday.

### Manual verification

1. Create a term with only `Días` = 12 (via the selector in a sales invoice): it is saved as `12 Días`, offset 0, `Next Business Day` on; through the API its `searchKey` is `12D` (the key is not shown in this window since ETP-5978).
2. Create another term with 30 days: refused with "already exists", nothing created.
3. Through the API, send 366, -5 or 7.5 days: refused with the range / whole-number message. In this window the popup's `Días` cannot hold such a value: the stepper keeps it in 0–365 and a decimal separator or a sign is refused as it is typed (see *Popup* above).
4. Edit the name of an existing term without touching its days: saves normally (and, since ETP-5978, the list row shows the new name).
5. Through the API, create a term with 22 days, `offsetMonthDue` 1 and name `22 Días` (`POST /sws/neo/payment-term/header` with `{"name": "22 Días", "overduePaymentDaysRule": 22, "offsetMonthDue": 1}` — the month offset can no longer be set from this window), then create `22` from a selector: refused with "a payment term named '22 Días' already exists", no 500.
