# Payment Term

## Intent

Maintain the rules that determine when a receivable or payable becomes due and which term is treated as the default option for downstream document entry. Since ETP-5978 the window is deliberately minimal: a term is a **name** and a **number of days**, plus the two flags `Default` and `Next Business Day`. Everything else a payment term needs (its search key, its month offset) is derived by the server.

## What this window should allow

- List existing payment terms and find them by `Nombre` (`Name`).
- Open a term to review or edit its four visible fields: `Nombre` (`Name`), `Días` (`Days`; AD column `NetDays`, AD name `Overdue Payment Days Rule`), `Por defecto` (`Default`) and `Siguiente día hábil` (`Next Business Day`).
- Create, update, and delete payment-term headers through the standard generated CRUD flow.
- See at a glance in the list whether a term is the default and whether it moves due dates to the next business day: `Por defecto` and `Siguiente día hábil` are both rendered as `Sí`/`No` badges (green/neutral).
- Use the maintained term later from other transaction windows that expose `Payment Terms` selectors, such as sales and purchase documents (which can also create a term from a number of days, see ETP-5826 below).

## Interaction model

- **Route:** `/payment-term` for the list and `/payment-term/:recordId` for detail.
- **Visibility:** visible in **System > Settings** from `tools/app-shell/src/menu.json`; not marked hidden.
- **Implementation type:** generated default-layout window loaded from `tools/app-shell/src/windows/registry.js` into the generic `/:windowName` shell route.
- **Window shape:** header-only. `decisions.json` excludes the `lines` (`C_PaymentTermLine`) and `translation` entities, so neither the contract nor the NEO spec exposes them (`ETGO_SF_ENTITY.IsIncluded = 'N'`); there are no `/lines` endpoints.
- **Detail tabs:** none besides the form. Attachments are switched off (`window.attachments: false`, ETP-5978), so the detail view has no **Attachments** tab.

### Form (ETP-5978)

The form has exactly four fields on two rows, each spanning 2 columns (`span: 2`):

| Row | Field (es_ES label) | Key / AD column | Notes |
|-----|---------------------|-----------------|-------|
| 1 | `Nombre` | `name` / `Name` | Required. Renaming updates the translations too (see *Renaming a term* below) |
| 1 | `Días` | `overduePaymentDaysRule` / `NetDays` | Required. Whole number 0–365 (ETP-5826 rules) |
| 2 | `Por defecto` | `default` / `IsDefault` | Checkbox |
| 2 | `Siguiente día hábil` | `nextBusinessDay` / `IsNextBusinessDay` | Checkbox, **ticked by default on a new record** |

`requiredHeaderFields` is `['name', 'overduePaymentDaysRule']`. The detail view hides **Print** and **More**.

**Saving.** The window declares `autoSaveOnBlur: true`. On an **existing** record each text/number field is saved when it loses focus, and each checkbox as soon as it is toggled; a backend refusal (e.g. an out-of-range or duplicate number of days) is shown with the same translated message as a **Guardar** save, and nothing is persisted. A **new** record is only saved with **Guardar** — leaving a field of an unsaved record never creates it.

### Layout configuration

The look mirrors the contact-category settings window (`business-partner-category`, see [business-partner-category.md](business-partner-category.md) → *Layout configuration*): tight paddings, no header border, white form. All keys live in `decisions.json → window`:

| Key | Value | Effect |
|-----|-------|--------|
| `attachments` | `false` | No Attachments tab |
| `autoSaveOnBlur` | `true` | Existing records save field by field (above) |
| `noHeaderBorder` | `true` | Removes the border/card around the header form |
| `whiteFormBackground` | `true` | White form card and white input backgrounds |
| `formCardPadding` | `"p-2"` | Tighter padding on the form card |
| `formScrollPaddingX` | `"px-2"` | Horizontal padding on the form scroll column |
| `tabsBarPaddingX` | `"px-2"` | Horizontal padding on the tabs bar |
| `toolbarBorderBottom` / `toolbarPaddingX` | `true` / `"px-2"` | No effect since ETP-5601 (the record toolbar is standardized); declared for parity with the reference window |
| `listbarPaddingX` / `tablePaddingX` | `"px-2"` | Horizontal padding on the list toolbar and the list table |
| `hidePrint` / `hideMoreMenu` | `true` | No **Print** and no **More** menu, on list and detail |
| `hideLink` | `true` | No copy-link button in the list toolbar |

### List (ETP-5978)

- **Columns**, in this order (`gridOrder`): `Nombre` | `Días` | `Siguiente día hábil` | `Por defecto` (English: `Name` | `Days` | `Next Business Day` | `Default`). `Nombre` is the only growing column (`grow: true`) and takes the remaining width. `Siguiente día hábil` and `Por defecto` are both badges: `Sí` (green) / `No` (neutral), `Yes`/`No` in English (`badge`, `badgeLabels`, `badgeVariants` on each field).
- **Filters:** `Nombre` only (`supportedFilters: ["name"]`). There is no `Clave` column and no filter by search key any more.
- **English labels.** `window.labelOverrides.en_US` maps `Name` → `Name`, `NetDays` → `Days`, `IsDefault` → `Default` and `IsNextBusinessDay` → `Next Business Day`, and the `nextBusinessDay` field's own `labels.en_US` is `Next Business Day`. Before, the English column header and form label for the days fell back to the AD name `Overdue Payment Days Rule`. The Spanish labels (`Días`, `Nombre`, `Siguiente día hábil`, `Por defecto`) are unchanged.

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

- **`Siguiente día hábil` starts ticked on a new record.** `decisions.json` declares `"defaultExpr": "Y"`, pushed to `ETGO_SF_FIELD.DefaultValue`, so `GET /sws/neo/payment-term/header/defaults` returns it and the form opens with the box ticked. It matches what the server derives for a non-zero number of days, and because the form always sends the field, the user's choice is what gets persisted.
  - **Known divergence (accepted):** a **0-day** term created from this form is saved with `Siguiente día hábil` ticked unless the user unticks it, whereas a 0-day create from a selector's "+ Crear condición de pago" or from MCP without the field derives `false` (the `Inmediato` shape). In practice a 0-day create is normally refused anyway by the 409 duplicate-days rule, because every tenant has the seeded `Inmediato` term.
- `Default` and `Next Business Day` are rendered as badge-style booleans in the list, so users can quickly identify which terms are flagged as default and which move to the next business day.
- No parent/child interaction is visible in the generated page. The `lines` child structure is excluded in decisions, so users cannot manage installment or split-term detail from this screen.

### Renaming a term (ETP-5978)

`C_PaymentTerm.Name` is translatable and is the entity's only identifier column, so the record title, the breadcrumb and every payment-term selector show the **translated** name (`C_PaymentTerm_Trl.Name`). The database trigger copies the name into the translations only on insert; on update it just marks them `IsTranslated = 'N'`. Before ETP-5978 a rename therefore left the old name in the title, breadcrumb and selectors while the `Nombre` field showed the new one.

Since ETP-5978 `PaymentTermHandler` (after a successful rename) copies the new name into **every** language's `C_PaymentTerm_Trl.Name` and into the `_identifier` echoed by the save response, so the title and breadcrumb repaint immediately.

- **All languages are overwritten, by design** — Etendo GO has no translation tab for payment terms, so nothing else could correct them.
- **Not atomic with the rename:** the translation update runs in a second transaction after the rename is committed. If it fails, the error is logged and the rename stays saved; the identifier stays stale until the term is renamed again.
- **Terms renamed before this fix** keep their stale translations until they are renamed again.

## Gap assessment

- Due-date semantics are narrower in the shipped UI than in the backend model. The backend contract includes hidden header fields such as `fixedDueDate`, `maturityDate1/2/3` and `overduePaymentDayRule`, and since ETP-5978 also `offsetMonthDue`; the window only exposes the number of days and the next-business-day flag. Fixed-date, multi-date or month-offset terms are maintained through the API or the classic UI, not here.
- The AD tab model has `C_PaymentTermLine` lines (percentage, remainder, payment method, exclude-tax, due-date fields), but they are excluded from this window. If installment schedules or line-level term breakdowns are expected, that is a current gap.
- The business meaning of `Default` suggests it may need uniqueness or downstream auto-selection behavior, but the current frontend evidence only shows an editable boolean with badge rendering. No UI evidence confirms exclusive enforcement, warnings, or automatic propagation, so that remains an open ambiguity.
- `Description` is discarded. If users need explanatory text to distinguish similar payment terms, that capability is not visible in the current window.

## Manual verification

1. Open `/payment-term` and confirm the list shows the columns `Nombre` | `Días` | `Siguiente día hábil` | `Por defecto` in that order, `Nombre` taking the free width, both checkbox columns as `Sí` (green) / `No` (grey) badges, no `Clave` column, and that the filter offers `Nombre` only. The list toolbar shows no copy-link, Print or More control. Switch the UI to English: the headers read `Name` | `Days` | `Next Business Day` | `Default` (never `Overdue Payment Days Rule`), with `Yes`/`No` badges, and the form labels match.
2. Open `/payment-term/<recordId>` and confirm the detail page hides **Print** and **More**, shows no **Attachments** tab, and uses the tight white form layout (no card border around the form).
3. Confirm the form shows exactly `Nombre` and `Días` on the first row and `Por defecto` and `Siguiente día hábil` on the second — no `Clave`, no `Meses de desplazamiento`.
4. On an existing record, change `Nombre` and click outside the field: the record saves without pressing **Guardar**. Toggle `Por defecto`: it saves at once and the list badge reflects it.
5. Rename a term (e.g. `45 Días` → `45 días netos`): the record title and breadcrumb show the new name immediately, and after a reload a payment-term selector in a sales invoice lists the new name. Switch the UI language and confirm the new name is shown there too.
6. Click **Nuevo**: `Siguiente día hábil` is already ticked. Type a name and `40` days, leave the fields without saving — nothing is created. Press **Guardar**: the term is created; through the API (`GET /sws/neo/payment-term/header/<id>`) its `searchKey` is `40D` and its `offsetMonthDue` is `0`.
7. Through the API, `PATCH` an existing term with `{"nextBusinessDay": false, "searchKey": "X", "offsetMonthDue": 2}`: the request succeeds, `nextBusinessDay` is saved, and `searchKey` and `offsetMonthDue` keep their stored values.
8. Attempt to find fixed-date, month-offset or child-line installment controls and confirm they are not exposed.

## Automated evidence

- `artifacts/payment-term/__tests__/contract-integrity.test.js` (ETP-5978) guards the simplification against a regeneration undoing it: `searchKey`/`offsetMonthDue` are `system` in decisions and absent from the contract fields, the generated form and grid, `requiredHeaderFields`, every `supportedFilters` list and the MCP create contract (`minimumCreate`, the `createHeader` example, `formState`); attachments off with no `AttachmentsTab`/`customTabs`; form order and `span: 2`; grid order, `grow` on `name` only, `default` and `nextBusinessDay` as green/neutral badge columns; the `en_US` label overrides (decisions, contract and the generated page `api`); `autoSaveOnBlur`; `nextBusinessDay.defaultExpr = "Y"` (25 tests).
- `artifacts/payment-term/contract.json` defines a default-layout frontend contract with `detailEntity: null`, the four-field form, badge metadata for `default` and `nextBusinessDay`, the `es_ES`/`en_US` label overrides, and a list filter on `name` only. It declares only the `header` entity.
- `artifacts/payment-term/generated/web/payment-term/HeaderForm.jsx`, `HeaderTable.jsx`, and `HeaderPage.jsx` confirm the list/detail rendering, the visible field set and the layout props.
- Server side (`com.etendoerp.go`): `PaymentTermHandlerTest` covers the create enrichment (including the MCP early path `resolveServerCreateFields` and the dropping of server-filled values), the rename → translation sync and the echoed `_identifier`.
- Shared-component fix found while testing this window: the editable numeric inputs rendered by `EntityForm` (`MaskedAmountInput`) now carry `id={f.key}`, so the field label is associated with its input again (clicking `Días` focuses it; `getByLabelText` finds it). Guarded by `EntityForm.commaDecimal.vitest.jsx` and `fields.MaskedAmountInput.vitest.jsx`.
- `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js` confirm menu visibility and route registration.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; at the time this window had no required header fields so the array was empty and there was no behavioral change (since ETP-5978 it is `['name', 'overduePaymentDaysRule']`).
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## Days validation, duplicates and days-only create — ETP-5826

Payment terms can now be created from every payment-term selector ("+ Crear condición de pago") by typing only a number of days. The server-side rules live in `PaymentTermHandler` (`com.etendoerp.go`, `@NeoExtension(spec = "payment-term", entity = "header")`) and apply to this window too, on every channel (REST, batch, MCP). Full contract: `modules/com.etendoerp.go/docs/neo-headless.md` §5.3.5.

- **Days (`Días` / `Overdue Payment Days Rule`)** must be a whole number between 0 and 365. Anything else answers 400 (`ETGO_PaymentTermDaysInvalid` / `ETGO_PaymentTermDaysOutOfRange`). On update the range is only checked when the days change, so a legacy term stays editable.
- **No duplicates by days:** a second *simple* term (no lines, not fixed-due, month offset 0 or empty) with the same days in the same client — any organization, active or inactive — answers 409 `ETGO_PaymentTermDaysDuplicate`, naming the existing term. Saving an edited term that keeps its days does not trigger the check.
- **Messages in the SPA:** these refusals are translated by the shared `lib/backendErrors.js` (by message key, with `messageParams`), so this window's save and the "+ Crear condición de pago" modal show the same sentences: out of range "El número de días debe estar entre {min} y {max} (indicado: {value}).", duplicate by days "Ya existe la condición de pago «{name}» con esos días" and by name (`ETGO_PaymentTermNameDuplicate`) "Ya existe una condición de pago llamada «{name}» en esta organización", each adding "pero está desactivada. Reactívala en Condiciones de pago" when the existing term is inactive.
- **No duplicate names:** a name another term of the same client already uses in the same organization (exact match, active or inactive) answers 409 `ETGO_PaymentTermNameDuplicate` instead of a database error. This covers a non-simple term (month offset, fixed due date, lines) named like the `N Días` a days-only create derives (QA BUG-1). Checked on create and when a term is renamed.
- **Create defaults:** when not sent, the name is derived as `N Días` (`1 Día`), the search key as `ND` (`12D`), `Offset Month Due` = 0 and `Next Business Day` = on — the same shape as the seeded terms (zero days follows `Inmediato`: key `I`, `Next Business Day` off). Since ETP-5978 the search key and the offset are never shown in this window (see *Server-derived fields* above), and the form's `Siguiente día hábil` starts ticked, so a create from the form always sends the user's choice.
- **`Next Business Day`** (`IsNextBusinessDay`) is an editable checkbox in the form (it was discarded before ETP-5826), so the derived value is persisted and can be changed here. When on, a due date falling on a weekend moves to the next Monday.

### Manual verification

1. Create a term with only `Días` = 12 (via the selector in a sales invoice): it is saved as `12 Días`, offset 0, `Next Business Day` on; through the API its `searchKey` is `12D` (the key is not shown in this window since ETP-5978).
2. Create another term with 30 days: refused with "already exists", nothing created.
3. Enter 366, -5 or 7.5 days in this window and save: refused with the range / whole-number message.
4. Edit the name of an existing term without touching its days: saves normally (and, since ETP-5978, the title and breadcrumb show the new name).
5. Through the API, create a term with 22 days, `offsetMonthDue` 1 and name `22 Días` (`POST /sws/neo/payment-term/header` with `{"name": "22 Días", "overduePaymentDaysRule": 22, "offsetMonthDue": 1}` — the month offset can no longer be set from this window), then create `22` from a selector: refused with "a payment term named '22 Días' already exists", no 500.
