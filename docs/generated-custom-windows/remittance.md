# Remittance

"Remesas" in Spanish. Epic ETP-3504; this guide covers ETP-6148 (SEPA remittances foundation).
Backend: `com.etendoerp.go`, the remittance handlers bound by `@NeoExtension(spec = "remittance", …)`
and the feature flag `sepa-remittances` (`docs/feature-flags.md`).

## Intent

A remittance groups customer collections (SEPA CORE direct debit) or vendor payments (SEPA credit
transfer) that the company sends to its bank in one file. The window reuses the Classic remittance
model and processes of `org.openbravo.module.remittance` (REM): AD window "Remittance"
(`FF8080812E71F7C7012E71FD0499001B`), header tab `REM_Remittance`, lines tab `REM_RemittanceLine`.

The design rule is to reuse the Classic columns and add as little as possible. Etendo GO adds no
column to the remittance tables. The status is the remittance module's own column
`REM_REMITTANCE.REMITTANCE_STATUS` (AD column `Remittance_Status`, DAL property `remittanceStatus`).
It was added in ETP-6148 on `feature/ETP-6148` of `org.openbravo.module.remittance` and is set by
REM's own processes. The module version is bumped when the module is published, not in the feature
branch. `com.etendoerp.go`'s `module.remittance` floor is raised to that version in the same
release. The full order is the `release-order` item of `flags-registry.json`.

This task ships the list, the header form and the read-only lines, with the status that REM's
processes maintain. Lines are added only through «Seleccionar desde factura» (see below).

Not in this task:
- selecting payments or orders into a remittance;
- returns (the Classic buttons are hidden; confirming and reactivating are Etendo GO actions, see
  «Confirmar» / «Reactivar» below; ETP-6247 added confirming with settlement and the SEPA XML file,
  see «Confirmar» y fichero SEPA);
- the structured address.

## Access gate

The window is behind the per-account flag `sepa-remittances`, published to the SPA as the
capability `sepaRemittances` (`SEPA_REMITTANCES_CAPABILITY` in `lib/capabilityVisibility.js`):

| Axis | Source | Where it is checked |
|---|---|---|
| Rollout (per account) | `capabilities.sepaRemittances` from `SFWindowAccessMap`, the backend evaluation of the flag | menu entry `capability`, route guard `windows/custom/remittance/index.jsx` |
| Role | `windowAccess['FF8080812E71F7C7012E71FD0499001B']` | menu entry `accessWindowId`, route guard |
| API | the remittance handlers | `403 feature_disabled` with the flag off, on REST, batch and MCP |

The Financiero role template gets the window through `TemplateRoleWindowAccess`.

Wiring:
- **Menu** (`menu.json`): group Finance (Finanzas / Tesorería), right after Cuentas
  (`financial-account`). Item `remittance`, label `Remittance` (menu label «Remesas» in Spanish),
  `accessWindowId: "FF8080812E71F7C7012E71FD0499001B"`, `capability: "sepaRemittances"`. The
  sidebar shows it only when both are granted. The reviewed navigation baseline
  (`windows/__tests__/navigationExpectations.js`) lists it with the same two gates.
- **Registry** (`windows/registry.js`): `customLoaders.remittance` loads the route guard, so
  `sf-validate-pipeline` F3 is satisfied.
- **Route guard** (`windows/custom/remittance/index.jsx`, `RemittanceRoute`): a copy of the
  invoice-inbox guard. It shows `ListProgressBar` (`data-testid="remittance-access-loading"`)
  while the access maps load (`accessLoaded === false`). It shows `AccessDeniedMessage` when the
  capability is missing or the window tier is `none`; that screen does not reveal whether the
  feature exists. Otherwise it mounts the generated window
  (`@generated/remittance/generated/web/remittance/index.jsx`). The generated page still applies
  its own `useWindowAccess` check (read-only tier, `WindowAccessGuard`).

## Data architecture

- NEO spec `remittance` (`artifacts/remittance/decisions.json`, `category: "finance"`, default
  layout), registered in `cli/config/regen-windows.json`. Agent prompt:
  `agent-prompts/remittance/spec.md`.
- Entity `remittance` (header, `REM_Remittance`): every method.
- Entity `lines` (`REM_RemittanceLine`): `methods: ["GET", "GETBYID"]` and `readOnly: true`. Create,
  update and delete answer 405, from NEO and from the lines handler.
- Tabs `Bank Instructions`, `Settled` and `Protested` are `exclude: true`, so their
  `ETGO_SF_ENTITY` rows have `ISINCLUDED = 'N'`. The window has no Accounting tab.
- `discardPatterns: ["EM_*"]`. No remittance field is an exception: the status is a REM column, not an `EM_*` one.

### List

| Order | Key | Column | Label (es_ES) | Notes |
|---|---|---|---|---|
| 1 | `documentNo` | `DocumentNo` | Nº documento | first column, by user decision (2026-11-06) |
| 2 | `name` | `Name` | Nombre | detail title (`titleField`); `grow: true`, absorbs the leftover width |
| 3 | `remittanceType` | `REM_Remittance_Type_ID` | Tipo de remesa | its name ("Remesa de cobro" / "Remesa de pago") gives both the direction and the SEPA scheme; `columnWidth: 260` («Remesa de cobro (adeudo SEPA)» fits) |
| 4 | `financialAccount` | `FIN_Financial_Account_ID` | Cuenta | `columnWidth: 290`, enough for a typical account name |
| 5 | `transactionDate` | `Datetrx` | Fecha | default order `transactionDate desc` |
| 6 | `dueDate` | `Duedate` | Fecha de cargo/abono | |
| 7 | `remittanceStatus` | `Remittance_Status` | Estado | `columnType: "status"` |

Column order and widths are a user decision (2026-11-06, Holded-inspired).
- A plain list gives exactly one column the leftover width (`withImplicitGrowColumn`,
  `lib/linesColumnWidth.js`). Undeclared, that was the first descriptive non-code column,
  `remittanceType`: it grew to about 520px while the account was cut at its 192px selector default.
- `grow` on `name` makes it the absorber. `columnWidth` sizes the type and the account, and every
  other column keeps its type width.
- **Truncation tooltip: known limits, left as is (user decision, 2026-11-06).** The generic cell
  (`renderDefaultCell` in `DataTable.cellRenderers.jsx`) has two limits:
  - only a value longer than 30 characters gets the `TruncatedText` tooltip;
  - a non-`grow` column caps that text at 200px.

  The generic DataTable is unchanged. The widths above fit the usual values.

Every column is a real AD column, so it sorts and filters on the server. Labels come from
`window.labelOverrides` (`es_ES`, `es_AR`, `en_US`).

**Row menu (⋮).** Each row's menu has ONE «Cambiar estado» entry (clock icon) whose submenu opens to the
left (as Holded does) and lists the flow's statuses as chips, labelled and toned like the status chip:
Pendiente de envío (`PR`), Enviada al banco (`SB`), Cobrada (`CT`). Only the transitions the detail header
offers are clickable: from `PR` → «Enviada al banco» (`RemittanceSentDialog`) and from `SB` → «Cobrada»
(`RemittanceCollectDialog`, with the «A → B» chips). The current status, the way back and PR → Cobrada
stay listed but dimmed, never hidden. The entry is hidden on a row with no transition (`PE`, `CT`, `PT`,
`CP`, `PP`, `AN`). Visibility reads the two process overrides' own `displayLogicRaw` on the row, so the grid
and the detail cannot drift. «Devolver» and «Reactivar» are not in the row menu.

Below it, **«Descargar fichero»** (download icon) is offered on a confirmed row (`PR`, `SB`, `CT`, `PT`,
`CP`, `PP`; not `PE`, which has no file yet, nor `AN`). It reuses the same logic as the detail's button, shared as
`resolveLatestRemittanceFile` in `remittanceFileApi.js` (`fileReadiness.latestFile`, falling back to the
newest `.xml` attachment) and `downloadRemittanceFile`, through `useApiFetch`; the row carries no
attachment id, so it is resolved the same way the detail button does. It only downloads: nothing opens. A row with
no file toasts `remittanceFileNone` and a failure toasts the translated `remittanceFileDownloadError`
(both existing keys, no new i18n).

The shared `RowQuickActions` kebab gained generic, backwards-compatible **submenu** support: a `menuActions`
entry with `submenu: [{ key, label | labelKey, content?, disabled?, onClick }]` renders as a row with a
chevron that opens a side panel on hover or click (the panel closes when the pointer leaves or the kebab
closes); `content` replaces the text (here a `StatusTag` chip), a `disabled` item is dimmed and not
clickable, and a click closes the kebab and calls `item.onClick({ row, ... })`. Entries without `submenu`
are unchanged. The route (`tools/app-shell/src/windows/custom/remittance/index.jsx`) passes `menuActions`
as a function of the row (the existing function form), keeps the open step, hands the row to the dialog as
its `record` and refreshes the grid through `refreshTrigger` when the dialog finishes. It re-states
`decisions.window.rowQuickActions` (duplicate and email hidden) because the props it passes replace the
generated page's `rowQuickActions` as a whole. No `decisions.json` change was needed.

**Tabs «Todas / Cobros / Pagos».** `window.subsetFilters`, the segmented control above the list:

| Tab (key) | es_ES / en_US | Criteria |
|---|---|---|
| `remittanceTabAll` | Todas / All | none (default) |
| `remittanceTabCollections` | Cobros / Collections | `remittanceType$paymentMethod$payinAllow equals true` |
| `remittanceTabPayments` | Pagos / Payments | `remittanceType$paymentMethod$payoutAllow equals true` |

- `REM_Remittance` has no direction column; the direction is the remittance type's payment method.
  No new column is added.
- NEO passes `criteria` through to core's `AdvancedQueryBuilder`, which resolves the two-step `$`
  path into joins. developer-1 confirmed this by reading the code; the live check is still pending.
- The value is a real boolean `true`. NEO's `Y`/`N` rewrite does not resolve dotted paths.
- A Classic payment method with both directions on would make its remittances show under both
  tabs. The provisioned SEPA methods have one direction each.

### Header form

**Layout (round 3, user decision):** `window.noHeaderBorder: true`, the option Sales Invoice
declares. DetailView drops its default rounded, bordered card around the header fields, so they
sit flush on the page between the blue status banner and the Líneas tab. The banner is unchanged.

| Key | Visibility | Notes |
|---|---|---|
| `financialAccount` | editable, required | first editable field (after `documentNo`). The handler's selector offers active Bank accounts with the remittance payment methods linked (Bank accounts get them when created; there is no «Admite remesas» switch). Accounts without a valid IBAN are offered too, with a «Sin IBAN» badge (`optionBadge`); their IBAN is entered in «Datos para el fichero SEPA». A header write with another account is refused with 422: `ETGO_RemittanceAccountNotBank`, `ETGO_RemittanceAccountIbanRequired` or `ETGO_RemittanceAccountNotAllowed` (no remittance methods: an account created before the feature or with the flag off; no backfill), mapped in `backendErrors.js` |
| `remittanceType` | editable, required | `dependsOn: { field: "financialAccount", filterKey: "FIN_Financial_Account_ID" }`. The selector request carries the chosen account, and the handler only offers the types whose payment method is linked to it |
| `dueDate` | editable, required | the date the bank charges or credits the remittance. `"minDate": "today"`: the picker disables past days, and a typed past date is refused with «La fecha no puede ser anterior a hoy.» (`fieldMinDateError`); the save is blocked too. Only a new value is checked, so a saved remittance with a past date still opens. The backend refuses the same with 422 `ETGO_RemittanceDueDatePast`, translated through `backendErrors.js` (`backendError.remittanceDueDatePast`) |
| `name` | editable, required | at most 60 characters, checked by the handler. The AD field has no read-only logic, so `decisions.json` adds `readOnlyLogic: "@Processed@='Y'"`, the same lock as the other header fields; the handler already refuses the edit (422 `ETGO_RemittanceProcessedNotEditable`) |
| `transactionDate` | readOnly | mandatory. `NeoMandatoryDefaultsService` injects the AD default `@#Date@` on create |
| `documentNo` | readOnly, first field | «Nº documento», from the `REM_REM` document type sequence |
| `remittanceStatus` | readOnly, `form: false` | set by REM's processes, never written by the user. Not a form field: the header shows it only as the top-bar status pill (`statusField`, auto-detected by the generator from the entity fields, so it does not need the form). It is still served by NEO and shown as the list column |
| `documentType` | system | `C_Doctype_ID`, the client's `REM_REM` document type (AD default or handler) |
| `processed` | readOnly, `form: false` | stays in the payload because every editable header field has `readOnlyLogic` `@Processed@='Y'` (`financialAccount`, `remittanceType` and `dueDate` from the AD, `name` from `decisions.json`) |

Discarded: `chargedate` (discount date), `singlePayment`, `payment`, `posted`, and the Classic
buttons `selectpayments`, `createLinesFrom`, `getFile`, `processRemittance` and
`selectInvoicesAndOrders`. A discarded field has `ISINCLUDED = 'N'`, so NEO and MCP answer 404 for
its action. `processOverrides` also excludes those buttons from the detail view, so the generated
`processes` array is empty. Print, Send document, and the Duplicate / Email row actions are off.
`summaryFields: []` stops the summary strip from repeating the read-only fields.

### Lines (no add; «A remesar» editable and delete while pending)

| Order | Key | Column | Label (es_ES) |
|---|---|---|---|
| 1 | `invoiceDocumentNo` | path `paymentScheduleDetail.invoicePaymentSchedule.invoice.documentNo` | Factura (`grow: true`) |
| 2 | `invoiceDate` | path `….invoice.invoiceDate` (`yyyy-MM-dd`) | Fecha factura |
| 3 | `dueDate` | path `paymentScheduleDetail.invoicePaymentSchedule.expectedDate` (`yyyy-MM-dd`) | Vencimiento |
| 4 | `businessPartner` | path `paymentScheduleDetail.businessPartner` (FK, shown as its identifier) | Cliente |
| 5 | `invoiceGrandTotal` | path `….invoice.grandTotalAmount` | Total factura (line currency) |
| 6 | `invoiceOutstanding` | path `….invoice.outstandingAmount` | Pendiente (line currency) |
| 7 | `amount` | `Amount` | A remesar (line currency) |
| 8 | `status` | Classic path `payment.status` | Estado del recibo (status badge) |

The column set is a user decision (2026-11-06).
- **Factura, Fecha factura, Vencimiento, Cliente, Total factura and Pendiente are property-path fields** (`propertyPath` in `decisions.json`,
  see `docs/decisions-reference.md`). They are declared only in decisions, with no REM column.
  - They are read through many-to-one steps from the line, served by NEO under their key and
    always read-only.
  - Their headers come from per-field `labels`, because the target column `DocumentNo` would
    otherwise take the window's «Nº documento» override.
  - Vencimiento is `expectedDate`, the same date «Seleccionar desde factura» shows and filters
    on, not the Classic identifier's `Duedate`.
  - They need the `ETGO_SF_FIELD.PROPERTY_PATH` column in the database before the push.
  - On the lines entity they are seven `ETGO_SF_FIELD` rows, counting `payment.status`: `AD_COLUMN_ID` NULL,
    `PROPERTY_PATH` set, `JAVA_QUALIFIER` = the key, `ISREADONLY = 'Y'`, visibility `readOnly`. The
    other Classic property fields of the tab (`invoice`, `order`, `displayedAccount`, …) do not opt
    in, so they keep the legacy treatment and stay discarded.
  - The amounts (Total factura, Pendiente, A remesar) use `currencyField: "currency"`, the
    line's currency, and are right-aligned as `amount` columns. The column order follows Holded
    (user decision 2026-11-06).
  - Check: `SELECT property_path, java_qualifier, isreadonly FROM etgo_sf_field WHERE
    property_path IS NOT NULL` (joined to the `remittance` spec).
- `paymentScheduleDetail` (the due item) is no longer a column (`grid: false`). It is still
  served, because the API and the picker rely on it.
- **Estado del recibo** is the Classic property field `payment.status`, opted in per field with
  `"propertyPath": "payment.status"` and `"visibility": "readOnly"` in its decision. As a path
  field it is never required and has no default, so it stays out of `addLineFields`. It is a status badge: the
  labels are the payment status keys (`statusRpap`, `statusRpr`, `statusRemSent` «Remesado»,
  `statusRemCancel` «Liquidado en remesa», …) and the tone comes from `getStatusTone`. It is empty
  while the remittance is pending, because the line has no payment yet.
- **Grid only.** `window.hideDetailForm: true`, so the generated page passes no `DetailForm` and
  clicking a line opens nothing. Before, it opened a nearly empty side panel with only the amount.
  The generator still emits `LinesForm.jsx` and its import; both are unused.
- **Only «A remesar» is editable** (round 3, user decision, Holded pattern), so a due can be
  remitted in part.
  - `entities.lines.rowEdit: false` makes the generated `LinesTable.jsx` pass `rowEditDisabled`
    to `InlineLinesPanel`. There is no Edit (pencil) and no row edit mode.
  - `amount.editInPlace: { resetToField: "dueOutstanding", maxField: "dueOutstanding" }` makes the
    column an always-visible amount input (`ResettableAmountInput`). It has a ↻ button that
    restores the due's outstanding. The button is disabled while the amount already equals it, so
    the number stays in place on every row.
  - The input refuses inline an empty amount, 0, a sign different from the due's, or an amount
    over the due's outstanding (`lib/boundedAmount.js`). The refusal shows a red border, the
    message as tooltip and a toast, and nothing is sent.
  - A valid amount is committed on blur or Enter through the generic inline handler:
    `PATCH /lines/{id}` with the whole row. NEO writes only `amount`, the one line field with
    `ISREADONLY = 'N'`, and drops the read-only and path keys.
  - RemittanceLinesHandler (com.etendoerp.go) enforces the same rule with 422s:
    - `ETGO_RemittanceLineAmountInvalid` for an amount out of range;
    - `ETGO_RemittanceProcessedNotEditable` on a processed remittance;
    - `ETGO_RemittanceLineAmountNotEditable` for a line without a due.
  - Once the remittance is processed, the document lock (`isDocumentReadOnly`) turns the column
    into plain read-only text.
  - `entities.lines.methods` is `["GET","GETBYID","PATCH","DELETE"]`. The trash icon (line
    delete) and «Seleccionar desde factura» stay.
- **No «+ Añadir línea».** `window.maxDetailLines: 0` (the import-only lines pattern, as in
  return-material-receipt) makes the generated page pass an `addLineGuard` that is always false.
  Without it the editable `amount` lands in `addLineFields.entry`, and DetailView's add-line area
  (gated by «has entry fields» and `canAddLines`) showed an «+ Añadir línea» that could only fail
  (lines have no POST).
- **`dueOutstanding`** is a hidden decisions-only path field, `paymentScheduleDetail.amount`: the
  amount of the payment schedule detail the line points to, i.e. the due's outstanding. It is the
  bound REM itself checks (`REM_OutOfRangeAmount`), and the reset value and maximum of «A
  remesar». It is not `invoiceOutstanding`, which is the whole invoice's outstanding and is wrong
  for an invoice with several dues.
- **Factura opens the invoice** (round 3). `invoiceDocumentNo.link` renders the number underlined
  with ↗, like «Pago» in Financial Account › Movimientos.
  - The target id is `invoice`, the Classic property field
    `paymentScheduleDetail.invoicePaymentSchedule.invoice`, opted in as a hidden read-only path
    field.
  - The target window comes from the invoice itself: `invoiceSalesTransaction`
    (`….invoice.salesTransaction`, a hidden decisions-only path field). `true` opens
    `/sales-invoice/<id>`, `false` opens `/purchase-invoice/<id>`.
  - A line with no invoice keeps a plain cell. See `docs/ui-customization.md` → *Per-column
    link*.
- **Importe carries the currency** («53,24 €»). `amount.currencyField: "currency"` names REM's
  virtual SQL-logic column `REM_GETREMLINECURRENCY(REM_RemittanceLine_ID)`. NEO serves it as a
  plain text code, and `resolveRowCurrency` (`lib/rowCurrency.js`, opt-in through
  `currencyField`) accepts that 3-letter code when the field has no `$_identifier` twin. Moneda
  (`currency`) is therefore no longer a column (`grid: false`), but it is still served.
- **Pago is hidden** (`payment`, `grid: false`, still served). A line created from an invoice due
  amount has no payment until the remittance is processed. The lines grid cannot hide a column
  based on the header's `processed` state: it only hides the accounting-dimension keys
  (`lineHiddenColumns`).
- `lineNo` (`Line`) is not shown (`grid: false`, `form: false`), but it is still served. Lines are
  ordered by `window.detailSortBy: "lineNo asc"`. The AD Lines tab declares no
  `HQL_OrderBy_Clause`, so without it NEO would order by id.
- The Lines tab offers no column sort or filter for any column: DetailView passes no `onSort` to
  the lines table. The MCP list path does handle computed columns (ETP-5705).
- **Footer.** The lines total reads «Total (1 línea)» (`remittanceLinesTotalOne`) or «Total (N
  líneas)» (`remittanceLinesTotal`). The footer's top border is `hsl(var(--border-subtle))`. The
  old `var(--color-border-tertiary, hsl(var(--foreground)))` fell back to a near-black line,
  because that token is not defined.

Discarded:
- the Classic AD_Field property-path fields (see below). They now arrive with their path, but the
  Lines tab uses its own path fields above instead;
- the SQL-logic column `orderPaymentInPlan` (order payment plan);
- `origstatus`.

#### Classic property-path fields

The Classic Lines tab shows the invoice, the payment plan and the payment status through AD_Field
`Property` paths. These are not columns of `REM_RemittanceLine`. Since ETP-6148 the extractor emits
them with `propertyPath` (keyed by the last segment, read-only), and the pipeline can serve them
through `ETGO_SF_FIELD.PROPERTY_PATH`. This window keeps all of them discarded, so no row is
written for them:

| Field | `AD_Field.Property` |
|---|---|
| `invoice` | `paymentScheduleDetail.invoicePaymentSchedule.invoice` |
| `invoicePaymentSchedule` | `paymentScheduleDetail.invoicePaymentSchedule` (due date + amount) |
| `order` | `paymentScheduleDetail.orderPaymentSchedule.order` |
| `status` | `payment.status` |
| `displayedAccount`, `displayedAccount2` | `…eTABAMBankaccount.displayedAccount` |

The Lines tab shows the document number, the business partner and the expected date through its
own decisions-only paths (the table above the «Discarded» list). The AD has no property-path field
for the business partner.

### «Confirmar» / «Reactivar», status banner and lines total

**Header actions**, declared in `window.processOverrides` as `add` entries. They are the generic
header process buttons (DetailView `processes`), running `hook.handleProcess`, which POSTs
`/remittance/{id}/action/<name>` with `{ fieldValues }`.

**Order (round 3):** trash · Guardar · Confirmar (or Reactivar). The primary action is the
right-most button, as in Sales Invoice. Sales Invoice gets that order because its Confirmar is the
draftMode button that follows Guardar. Here Confirmar is a declared process, which DetailView puts
before the save actions. So the route wrapper `windows/custom/remittance/index.jsx` passes
`saveActionsFirst`, the same DetailView opt-in payment-in and payment-out use. It changes the
order only, not `saveBeforeProcesses`.

| Entry | Button | Visible | Asks | Backend |
|---|---|---|---|---|
| `confirm` (ETP-6247, was `process`) | «Confirmar», primary (`positive`) | `@Processed@='N'` and `requiresLines` | `confirmModal: true` routes it to `customComponents.processConfirmModal` → `RemittanceProcessConfirmModal` → `RemittanceConfirmDialog` (see «Confirmar y fichero SEPA» below). The dialog reads the grouping from the entry's `params` (default `P` «Sin agrupar», or `GGPD` «Agrupar por cliente y vencimiento») | `confirm`, posted by the dialog itself → `{ status, attachmentId, fileName, downloadUrl }` |
| `markSent` (ETP-6247) | none: not a header button. The step is chosen from the status chip (`RemittanceStatusSelector`) or the grid's row menu | `@RemittanceStatus@='PR'` in `decisions.json` (`exclude: true` + `add: true`: declared, not emitted) | `RemittanceSentDialog` (the chips «Pendiente de envío → Enviada al banco» and what it does), which posts the action itself | `markSent` → `{ status: 'SB' }` |
| `markCollected` (ETP-6247) | none: same as `markSent` | `@RemittanceStatus@='SB'` (no longer straight from PR in the UI; the backend still allows it) | `RemittanceCollectDialog` (the chips «Enviada al banco → Cobrada» and the settlement warning), which posts the action itself | `markCollected` → `{ status: 'CT'\|'PT', settledOn }` |
| `reactivate` | «Reactivar», `primary-danger` | PR or SB (same clause as `markCollected`): once collected, partial or voided it is refused (422 `ETGO_RemittanceReactivateNotAllowed`) | a confirmation, because it deletes the payments the process created: `customComponents.processConfirmModal` → `RemittanceProcessConfirmModal` | `reactivate` → `{ status: 'PE' }` |

The gates name the data key (`remittanceStatus`, or `eTARAutomaticprocess`), not the column. `evalDisplayLogicRaw`
lower-cases only the first letter of `@X@`, and a key that is not in the record counts as visible,
so `@EM_ETAR_AUTOMATICPROCESS@` would always pass. For the key to be in the record,
`eTARAutomaticprocess` (`EM_Etar_Automaticprocess`, module `com.etendoerp.automated.remittance`) is
`readOnly` with `form`/`grid` false, like `processed`; the server sets it to Y on create and on
confirm.

- **Success (Reactivar):** `handleProcessSuccess` toasts (`reactivateCompleted`) and
  force-reads the header and the lines. Processed makes the document read-only, which hides line
  delete and «Seleccionar desde factura»; reactivating restores them.
- **Refusals** are translated through `backendErrors.js`: `ETGO_RemittanceAlreadyProcessed`,
  `ETGO_RemittanceNoLines`, `ETGO_RemittanceProcessFailed`, `ETGO_RemittanceNotProcessed` and
  `ETGO_RemittanceReactivateFailed`. The two `*Failed` sentences take `{detail}`; without
  `messageParams` the key route yields and REM's text is shown.
- **Body shape:** both contracts must be `withFieldValuesBody()`, so that `grouping` is read from
  `fieldValues` and `{fieldValues:{}}` is accepted. This was requested from developer-1.

**Status banner.** `window.customComponents.subHeader: "RemittanceStatusBanner"` in `decisions.json`.
The generator turns it into DetailView's `headerContent` prop,
`headerContent={(data) => <RemittanceStatusBanner data={data} />}` in `RemittancePage.jsx`, so
the banner renders as the first child of the detail content, under the top bar. It is the shared
`InfoBanner`. It is not dismissible, and it shows one sentence per status:

| Status | Tone | Message key |
|---|---|---|
| `PE` | info | `remittanceBannerPending` |
| `PR` | info | `remittanceBannerProcessed` (Pendiente de envío: file generated, payments in Remesado, invoices uncollected; download the file, send it to the bank and move the remittance to Enviada al banco; reactivable) |
| `SB` | info | `remittanceBannerSent` (Enviada al banco: waiting for the bank; move it to Cobrada, reactivable) |
| `CT` / `PT` | success | `remittanceBannerCollected` / `remittanceBannerPaid`; on an automated remittance (`eTARAutomaticprocess` Y, ETP-6247), `remittanceBannerCollectedFile` / `remittanceBannerPaidFile`: the payments are settled and the SEPA file is generated, download it from «Fichero SEPA» |
| `CP` / `PP` | warning | `remittanceBannerPartiallyCollected` / `remittanceBannerPartiallyPaid` |
| `AN` | danger | `remittanceBannerVoided` |

**Lines total.** The panel renders «Total ({count} líneas) 1.202,30 €» (`remittanceLinesTotal`, with
`formatCurrency` in the lines' `currency`).
- `fetchLinesTotal` reads every line, not just the loaded page: `GET /lines?parentId={id}&_summary={"amount":"sum","id":"count"}`.
- That is core's grid summary, answering one `response.data[0]` row `{ amount, id, isGridSummary }`.
- If that row is missing or unreadable, it sums the loaded lines.
- It is re-read whenever the lines change.
- It sits at the right edge of the footer, aligned right (the footer is always one row, with «Seleccionar desde factura» on the left). A column footer used to centre it once the trigger was hidden.

### «Confirmar» y fichero SEPA (ETP-6247)

Confirming a remittance does everything in one atomic backend action (`RemittanceHeaderHandler`,
action `confirm`):
1. it checks the file data (`fileReadiness`);
2. it processes it with REM WITHOUT the automatic settlement (backend, step-by-step flow): the
   payments are created Remitted, the invoices stay unpaid and the remittance ends **PR** (shown
   «Pendiente de envío»). The remittance keeps `EM_Etar_Automaticprocess = N`; an earlier version
   created it `Y`, so `confirm` resets it. «Enviada al banco» (`markSent`, `PR -> SB`, informational)
   and «Cobrada» (`markCollected`, from `PR`/`SB`: settles every payment on the fecha de
   cargo/abono with the automated-remittance module's `settleOnDueDate`, ends `CT`/`PT` and flags
   the remittance automated) are the later steps; see `neo-headless.md` §4.6c;
4. it generates the SEPA file (pain.008 for CORE collections, pain.001 for SCT payments);
5. it stores the file as the remittance's main attachment.

Any failure rolls everything back. **It cannot be undone**: going back is a matter of returns, which
are out of scope. The SPA pieces live in `artifacts/remittance/custom/`. The contract is in
`remittanceFileApi.js`.

| Action | Body | Response |
|---|---|---|
| `POST <spec>/remittance/{id}/action/fileReadiness` | `{}` | `{ ready, scheme, problems: [{ scope: org\|account\|line, code, message, params, organizationId?, accountId?, lineId?, lineIds?, businessPartnerId?, businessPartnerName?, invoiceId?, documentNo? }], summary: { invoiceCount, lineCount, totalAmount, currency, dueDate }, latestFile: { attachmentId, fileName } \| null }`. `message` is already localized by the backend, params substituted; the SPA shows it and uses `code` + positional `params` only as a fallback |
| `POST …/action/confirm` | `{ fieldValues: { grouping } }` | `{ status, attachmentId, fileName, downloadUrl }`. A refusal is a 422 with `error.message` (localized) and `messageKeys`; `ETGO_RemittanceFileNotReady` also carries `error.problems` |
| `POST …/action/generateFile` | `{}` | processed remittances only: a NEW main attachment (the previous files are kept); same response |
| `GET /sws/neo/attachments/file/{attachmentId}` | — | the file, saved with `downloadBlobAsFile` |

**«Antes de confirmar»** (`RemittanceFileCard`, rendered by `RemittanceSepaFileData` right under
«Datos para el fichero SEPA», in the same compact card style). On a saved remittance that is not
processed, it shows the result of `fileReadiness`:
- «Todo listo» in green; or
- the problems, grouped: the organization's, the bank account's, then one group per contact. Each
  group is titled with a ↗ link to where it is fixed: the contact (`/contacts/{id}`, for its IBAN,
  mandate or address), the account's edit modal (`/financial-account/{id}?edit=true`) or the
  organization (`/organization/{id}`). Each problem is the backend's sentence as is: it already names
  the contact or the invoice. A contact problem comes once for all the contact's lines (`lineIds`);
  the amount problem comes per line.

The card re-checks when the record's `updated` or its account change, and on «Volver a comprobar»,
since a contact fixed in another tab does not touch the remittance.

**«Confirmar» dialog** (`RemittanceConfirmDialog`). It is built on `ActionChoiceModal`, the Figma
«PopUps» confirm that the follow-up document modal also uses (same overlay, title with close icon,
summary strip, choice cards, footer with Cancelar left and the primary button right), rendered in a
portal on `document.body`. Esc, the close icon, the backdrop and Cancelar close it (never while
confirming).
- **Shows:** a summary strip with the number of invoices (`summary.invoiceCount`; without a summary,
  the lines count labelled «Recibos»), the total (`formatCurrency`) and the fecha de cargo/abono
  (`formatCalendarDate`); «Agrupación» as two choice cards (radio group, arrow keys), each with a
  one-line description (`remittanceGroupingNoneDescription`,
  `remittanceGroupingByBpAndDueDateDescription`), and with no grouping param a single static
  «Sin agrupar» card; the note that the file is generated and can be downloaded afterwards; and what confirming does, as a non-dismissible warning
  `InfoBanner` (`remittanceConfirmEffect`: the payments stay in Remesado and the invoices uncollected until the remittance is moved to Cobrada, and it can be reactivated until then). The selected card is the grouping posted. Enter on a card confirms with it, but only
  when Confirmar would be enabled.
- **Problems** use `ReadinessProblemsBlock` and «Todo listo» uses `ReadinessReadyLine`, both
  exported by `RemittanceFileCard.jsx` and shared with «Antes de confirmar», so the heading, icons,
  grouping and links are the same in both.
- **Re-checks** `fileReadiness` on open and lists any problem. Its Confirmar is disabled while
  checking, on a failed check and while there are problems.
- **Confirming** posts `confirm` itself instead of using `handleProcess`, which drops the
  response. It does **not** close the modal and downloads nothing by itself: it switches, in the same
  modal and without a toast, to the success step **«¡Remesa confirmada!»**. Without an `attachmentId`
  in the response there is no file to offer, so that case keeps the old behaviour: the toast
  `remittanceConfirmSuccessNoFile`, refresh and close.
- **The success step** (`ConfirmedStep`, `ActionChoiceModal` with zero options and `cancelLabel` «Cerrar»):
  - a subtitle: «Descarga el fichero SEPA y súbelo a la banca online de tu banco. Después, pasa la
    remesa a Enviada al banco.» (one neutral text: the response status is `PR` for collections and
    payments alike);
  - a summary card: remittance (number and name), status chip (`PR` «Pendiente de envío»), invoices (or receipts), total (`formatCurrency`), remittance type, fecha de cargo/abono
    (`formatCalendarDate`), the account with its IBAN masked as `ES91 •••• •••• 1332` (from
    `sepaFileData`, best effort: without it the account's own identifier or nothing), with the bank mark
    next to it. The file name is not shown (the button is the way to the file);
  - **«Descargar fichero»** is the primary button and uses the same path as the detail's top-bar button
    (`downloadRemittanceFile` through `useApiFetch(getApiBase())`); a failure shows the translated
    `remittanceFileDownloadError` inside the modal and the button stays usable;
  - **«Cerrar»**, the ×, Esc and the backdrop all go through one handler that calls `onRefresh` and
    `onClose`, once. The page behind is refreshed only then, so nothing unmounts the modal under the
    user (`RemittanceProcessConfirmModal` mounts the dialog from DetailView's `confirmProcess` state).
  - **Bank mark:** the shared `AccountLogoAvatar` (the one the financial-account rows and summary strip
    use). Its logo is the connected bank's `providerLogoUrl` (persisted from the PSD2 provider catalog),
    read from the financial account record (`fetchAccountLogo`, `useApiFetch(getApiBase())`); an account
    without a logo, or a logo that fails to load, gets the same generic bank icon in the rounded tile.
    No image is fetched from anywhere but the URL already stored on the account.
  - **Spacing:** the card rows copy `DocumentPickerModal`'s rhythm (`min-h-14`, `px-3 py-2`) with
    `divide-y` `border-subtle` separators, label left and muted, value right (`justify-end`, the chip
    and the avatar included); the body uses the shared modal's section gap (`gap-5`, 20 px).
  The detail has the same «Descargar fichero» in its top bar (see «Fichero SEPA» below).
- **A refusal** keeps the dialog open; `ETGO_RemittanceFileNotReady` lists `error.problems`.

**The header button itself is not disabled** when there are problems: DetailView has no hook for
that, and the gate lives in the dialog. This is registered as debt in `flags-registry.json`
(`confirm-button-not-disabled`).

**«Fichero SEPA»: actions, not a card.** The «Fichero SEPA» card (last file name, «Regenerar fichero», «Descargar
fichero») was removed from the detail body by user decision (ETP-6247); «Datos para el fichero SEPA» and
the pending «Antes de confirmar» card stay. The last file name is no longer shown (it is in «Adjuntos»).
- **«Descargar fichero»** is an outline button with the download icon in the detail's top action bar
  (`artifacts/remittance/custom/RemittanceDownloadButton.jsx`, injected by the route as the DetailView
  `topbarSecondary` slot, left of Reactivar / Guardar). It is visible on a confirmed remittance (`PR`,
  `SB`, `CT`, `PT`, `CP`, `PP`; the same rule as the row menu's item, `FILE_STATUSES`). It only
  downloads: the main file is `fileReadiness.latestFile`, or, as a fallback, the newest `.xml` in
  `/sws/neo/attachments/REM_Remittance/{id}` (`resolveLatestRemittanceFile`), saved with
  `downloadRemittanceFile`. A spinner shows while it runs; no file toasts `remittanceFileNone` and a
  failure the translated `remittanceFileDownloadError`.
- **«Regenerar fichero»** is an item of the detail kebab (⋮), only on `PR` and `SB`
  (`REGENERATE_STATUSES`): the route passes `menuActions` as a function of the record (the existing form)
  and the item's `onClick` opens `RemittanceRegenerateDialog`, a simple confirmation. It says a new main
  file is created, the old one stays in the attachments, and a bank may flag the new one as a duplicate
  (the file's `MsgId` does not change); then it posts `generateFile` and downloads the new file. With NO
  file yet (a remittance created and processed in Classic) the same call GENERATES the first file and the
  words say so (`remittanceFileGenerate*`; the dialog looks the file up when it opens). A refusal (for
  example 422 `ETGO_RemittanceFileHasReturns`, whose localized sentence is toasted as is) keeps the
  confirmation open. A collected remittance (`CT`, ...) has no regenerate: the file already went to the bank.

**Errors.** Every `ETGO_RemittanceFile*` text is localized by the backend in the request language,
with its positional params substituted, and the 422s carry no `messageParams`. So `backendErrors.js`
maps only the parameter-free `ETGO_RemittanceFileNotProcessed`. A mapped parametric key would leave
`{0}` unfilled, and `translateByMessageKey` falls back to the backend text in that case anyway.

### «Datos para el fichero SEPA» (IBAN and creditor identifier)

A block below the header form (`window.headerExtra.customForm` →
`artifacts/remittance/custom/RemittanceSepaFileData.jsx`, rendered by DetailView as its
`formFooter`). It follows the chosen Cuenta, on a new, unsaved remittance too, and shows two values.
There is no BIC (user decision).

Layout (Holded reference):
- a compact, subtle card (`rounded-xl`, `border-subtle`) on the form grid's left and right edges
  (`mx-2`, the `p-2` of DetailView's header card body), with about the form's own row gap
  (`mt-3 mb-3`) before the Líneas tabs;
- a light header strip with the title on the left and, when the IBAN is stored, «🔒 De la cuenta
  <nombre>» on the right;
- below it the header form's own grid and tokens (EntityForm's `Label`, `Input`, `FIELD_HEIGHT`,
  `ROW_GAP_Y`, 4 columns): IBAN in columns 1–2, «Identificador del acreedor» in columns 3–4.
  Each label is inline, left of its value (it wraps above on a narrow screen), so the read-only
  body is a single row. Values use the app font. Without an IBAN, «IBAN *», the input and «Guardar
  IBAN» share one row at input height, with one help line below.

- **IBAN.**
  - When the account's IBAN is valid, it is shown read-only, in groups of 4, with a lock and «De la
    cuenta <nombre>».
  - When it is missing or invalid, it is an input (placeholder «ES91 2100 0418 4502 0005 1332»).
    The input is validated inline with the Edit-account rules (`validateIbanForCountry`, same error
    keys) and has a «Guardar IBAN» button. The note says «Esta cuenta no tiene IBAN guardado. Se
    guardará en la cuenta <nombre>.» The IBAN is saved **on the account**, not on the remittance.
    The block is then re-read.
  - While the IBAN is missing, a red line says the remittance cannot be saved. The header refuses
    the save with 422 `ETGO_RemittanceAccountIbanRequired`, mapped in `backendErrors.js`.
  - On a processed remittance the block is read-only.
- **Identificador del acreedor**, computed by the backend from the organization's country and tax ID
  and the remittance type's business code (000 by default). Its info icon first says what
  it is (it identifies the company as issuer of SEPA direct debits; the bank assigns it; only for
  collection remittances), then how it is built (country, check digits, suffix, tax ID). When it cannot be computed, a warning names what is missing: «la organización no
  tiene NIF», «la organización no tiene país», «la cuenta no tiene IBAN», or that the collection
  remittance type's creditor business code is not valid (it must be 3 letters or digits; provisioning
  stores `000`, the default suffix).
- **Cuenta selector.** Accounts without a valid IBAN are offered too, marked with a «Sin IBAN» badge
  (`financialAccount.optionBadge` on the selector item's `ibanValid`, see `docs/ui-customization.md`
  → *Badge on selector options*).

**Contract (confirmed by the backend, isolated in `sepaFileDataApi.js`):**

| Call | Body | Answer |
|---|---|---|
| `POST <spec>/remittance/{id or new}/action/sepaFileData` | `{ accountId, organizationId? }` (the header's organization when set) | `{ accountId, accountName, iban, ibanValid, organizationId, country, creditorId, creditorIdAvailable, missing: ["iban"\|"orgTaxId"\|"country"\|"creditorBusinessCode"] }`. NEO actions need a record segment, so an unsaved remittance sends `new` (never loaded). `country` is the organization's country, the one inside the creditor id. `orgTaxId` is also missing when the tax ID cannot form an identifier. Refusals: 404 (account or organization not found), 422 `ETGO_RemittanceAccountNotBank` / `…NotAllowed`, 403 `feature_disabled` |
| `GET /sws/neo/financial-account/account/{id}` then `PATCH` the same | `{ iBAN, updated }` | the existing account update. `updated` is mandatory on every NEO update, hence the read first. The body carries only the IBAN; the account must already have a country (set in Edit account). Without one the backend answers 400 `ETGO_FinAccIbanRequiresCountry`, shown as «La cuenta no tiene país. Indícalo primero en Editar cuenta para poder guardar el IBAN.» (`remittanceSepaIbanNeedsAccountCountry`, also when an older backend sends only the English literal). The other refusals (the IBAN/country pair texts) go through `translateBackendError` |
| `financialAccount` selector items | — | `{ id, label, iban, ibanValid }`; accounts without a valid IBAN are offered too. DEFAULTS never prefills an IBAN-less account |

### «Seleccionar desde factura» (adding lines)

**Removing a line** uses the generic lines delete, the same as other windows: a trash icon on the row,
or row selection plus the delete bar. `entities.lines.methods` is `["GET","GETBYID","PATCH","DELETE"]`, so
the contract has `delete: true` and `ETGO_SF_ENTITY.ISDELETE = 'Y'`. DetailView hides it on a
processed remittance: `isDocumentReadOnly` derives from `processed` (`lockWhenProcessed`), and
RemittanceLinesHandler refuses the DELETE there too. There is no custom per-line «×» (user
decision). POST and PUT stay off, so DetailView shows no add-line area; PATCH carries only the «A
remesar» edit (see the Lines section). The custom empty state passes `canAddLine={false}`, so no
«+ Añadir línea» appears.

Lines cannot be created directly, and only their amount can be changed. They come from
the invoice due items, one row per installment, picked in a modal. This replaces Classic's OBUIAPP
process «Select Invoices and Orders» (`REMSelectInvoicesAndOrders`) for invoices only.

**Where.** `window.customComponents.bottomSection` → `artifacts/remittance/custom/RemittanceBottomPanel.jsx`:
- **No lines yet:** the panel's static `linesEmptyState` shows the button inside the lines empty
  state (`action-select-due-items-empty-state`). A new remittance is saved first (`onSave`), and the
  picker re-opens after the save through `forceOpen`. On success it calls the empty state's
  `onRefresh`, which re-reads the header and the lines.
- **With lines:** DetailView hides its add-line area because lines are read-only, so the panel draws
  the trigger itself (`remittance-lines-footer` / `action-select-due-items`), following the
  panel-rendered pattern in `docs/ui-customization.md`. The bottomSection contract has no refresh
  callback, so on success it reloads the page, the same as the return-material-receipt panel.
- **When it shows:** both entry points require the remittance to be not processed and to have a
  remittance type and a financial account (`canSelectDueItems`). The with-lines trigger also
  requires a saved record and is hidden on a read-only window or document.

**Picker (round 3).** `SelectDueItemsModal.jsx` renders the generic
`components/contract-ui/DocumentPickerModal.jsx`, modelled on the sales invoice «Importar desde
pedido» popup but without its per-line sub-selection. That popup itself is unchanged; only its
exported `ImportNotice` is reused. The columns follow Holded's «Añade los documentos»:

| Column | Content |
|---|---|
| Factura (the generic `invoice` key; «Documento» before) | the invoice number only, as a link (`RecordLink` + `resolveColumnLink`, `/sales-invoice/<invoiceId>` or `/purchase-invoice/<invoiceId>` by `salesTransaction`; the click closes the modal). No document type line under it (user decision) |
| Fecha factura | `invoiceDate` (`formatCalendarDate`) |
| Vencimiento | `dueDate` and, under it, the due status (`dueStatus`: Vencido / Vence hoy / Sin vencer) |
| Cliente/Proveedor | `businessPartner` |
| Total / Pendiente | `grandTotalAmount` / `outstandingAmount` (`formatCurrency`, the due's currency) |
| A remesar | the same `ResettableAmountInput` as the grid, capped at `outstandingAmount`, reset to it |

- Dues already in the remittance (`alreadyInRemittance`) open checked and `aria-selected`
  (`committedIdSet` in `selectorSelection.js`), with their current `lineAmount`. New ones start at
  their outstanding.
- Unchecking an included due marks it for removal; changing an amount marks it for update.
- The footer shows the selected count and their total.
- The primary «Importar seleccionados» is disabled while nothing changed or any selected amount is
  invalid.
- Confirming sends the difference (`diffSelection`) in ONE `syncDueItems` call. Removal is
  explicit: the list is paged and searchable, so a due that was never loaded is never touched.
- The subtitle is the remittance (`documentNo · name`).

**Backend contract.** `remittanceDueItemsApi.js` calls the actions through `useApiFetch(apiBaseUrl)`,
and RemittanceHeaderHandler serves them:

| Action | Body | Answer (`response.data`) |
|---|---|---|
| `POST /remittance/{id}/action/availableDueItems` | `{ search, page, pageSize }`, with `page` 1-based (`FIRST_PAGE`; the action defaults to 1) and `pageSize` 20 (the action defaults to 50, max 200) | `{ items: [{ id, documentNo, invoiceId, salesTransaction, invoiceDate, dueDate, dueStatus, businessPartner, businessPartnerId, grandTotalAmount, outstandingAmount, currency, alreadyInRemittance, lineAmount, lineIds }], total }`. Included dues always come back |
| `POST /remittance/{id}/action/syncDueItems` | `{ items: [{ id, amount }], remove: [id] }` | `{ created, updated, removed, message }`, in one transaction. 422s: `ETGO_RemittanceLineAmountInvalid`, `ETGO_RemittanceDueItemNotAvailable`, `ETGO_RemittanceDueItemNotIncluded` (each with `invalidIds`), `ETGO_RemittanceDueItemsSelectionFailed`, `ETGO_RemittanceProcessedNotEditable` |
| `POST /remittance/{id}/action/selectDueItems` | `{ ids }` | `{ created, message }`. Kept, no longer used by the SPA |

Which due items are offered (direction, account, organization, outstanding amount, not already in an
open remittance) is decided by the backend, following Classic's `REMSelectInvoicesAndOrders`.

**Messages.** On success a toast shows `remittanceDueItemsSynced` (`{created}`, `{updated}`,
`{removed}`); a refusal falls back to `remittanceDueItemsSyncError`. Round 3 keys: the column
labels `invoice` and `remittanceCol*`, `remittanceDueStatus*`, `remittanceDueItemsNoticeTitle/Body`,
`remittanceDueItemsFooter`, `remittanceDueItemsConfirm`, and the generic `boundedAmount*` /
`resetAmountTo`. A refusal is translated through `backendErrors.js`, using `messageKeys` first
and falling back to `remittanceDueItemsSyncError` / `remittanceDueItemsLoadError`. The three
round-3 refusals (`backendError.remittanceLineAmountInvalid`, `…LineAmountNotEditable`,
`…DueItemNotIncluded`) use the backend catalog's wording. The amount refusal leaves out the
maximum, because the backend sends it with no `messageParams` and the field already shows it
inline. Other keys of the window: `remittanceSelectFromInvoices`, `remittanceSelectDueItemsTitle`,
`remittanceSearchDueItems`, `remittanceNoDueItems`, `remittanceDueItemsLoadError` and
`remittanceLinesEmptyDescription`. The old picker's `remittanceDueItemsSelectedCount`,
`remittanceAddDueItems`, `remittanceDueItemsAdded` and `remittanceDueItemsAddError` were removed
in round 3.

### Status (`Remittance_Status`, reference `REM_RemittanceStatus`)

| Code | en_US | es_ES |
|---|---|---|
| `PE` | Pending | Pendiente |
| `PR` | Processed | Procesada (Pendiente de envío) |
| `SB` | Sent to bank | Enviada al banco |
| `CT` / `PT` | Fully collected / Fully paid | Cobrada total / Pagada total |
| `CP` / `PP` | Partially collected / Partially paid | Cobrada parcial / Pagada parcial |
| `AN` | Voided | Anulada |

REM's own processes set the value (`org.openbravo.module.remittance`, `feature/ETP-6148`). Etendo GO has no observer for it and never writes it. Settlement and return rows update it through `REM_SettleProtest`. A writer that inserts `REM_REMITTANCELINE_CANCEL` / `REM_REMITTANCELINE_RETURN` rows without going through it leaves the status stale (see the `status-bypassed-by-sql` item in `flags-registry.json`).

**Existing remittances are not backfilled** (accepted by the user on 2026-11-06). A remittance that
existed before the column gets the default `PE` and keeps it until one of REM's processes (process,
reactivate, settle, return or their undo) refreshes it.
- It shows «Pendiente» in the list, the detail pill and the status filter.
- If its type is one Etendo GO provisioned, it counts as open (`PE`, `PR`, `SB`, `CP`, `PP`).

Tracked as `existing-remittances-not-backfilled` in `flags-registry.json`.

**Labels.** The AD list ships English names only, so `decisions.json` points every code at an i18n
key: `remittanceStatus.enumValues` (`{ value, name: "remittanceStatusPe" }` … `remittanceStatusAn`) and
`window.statusEnumLabels` (same map). The keys live in `genericLabels` of `en_US`, `es_ES` and
`es_AR`. They reach the grid badge, the status quick filter, the advanced filter and the detail
status pill. The status is not a form field (`form: false`). Without the override the detail pill
showed the raw code.

**Tones.** `remittanceStatus.enumVariants` declares the per-code tones:

| Code | Tone |
|---|---|
| `PE` | neutral |
| `PR` | warning |
| `SB` | info |
| `CT`, `PT` | success |
| `CP`, `PP` | warning |
| `AN` | destructive |

The generator already emits `enumVariants` on the column. A `status` column honours it through
`resolveStatusTone(code, col.enumVariants)` (`lib/statusToneOverride.js`), in the grid cell
(`DataTable.cellRenderers.jsx`) and in the "All statuses" quick-filter pill (`ListFilterBar.jsx`).
These codes are ambiguous across windows (`PR`, `AN`, `CP`), so they are not added to the global
`getStatusTone` catalog.

**Detail status pill.** `DetailView` takes a `statusEnumVariants` prop (`{ code: tone }`) and hands it to
`DocumentStatusPill` as `enumVariants`, which resolves the tone with the same `resolveStatusTone`, so
the pill matches the grid chip. A code the map does not declare keeps the global tone; a window
without the prop is unchanged. The generated page does not emit the prop, so the window's route
(`tools/app-shell/src/windows/custom/remittance/index.jsx`) passes `statusEnumVariants` itself, read
from `decisions.json` (`entities.remittance.fields.remittanceStatus.enumVariants`, the same map the
grid column uses), and the page spreads it onto `DetailView`. A regeneration keeps it, and the
caller's own props win. It needs no `schema_forge_core` change; a future generator that emits the
prop from the status field would make the route's line redundant.

Not covered, needs `schema_forge_core`:
- **Filter order.** None of the codes is in `STATUS_ORDER`, so the status filter lists them
  alphabetically (AN, CP, CT, PE, PP, PR, PT). That catalog must stay identical to the core copy
  (`statusBadge.coreParity.test.js`).

### Flujo por pasos (ETP-6247, UI)

`PE` → **Confirmar** → `PR` Pendiente de envío → **Enviada al banco** → `SB` → **Cobrada** → `CT`/`PT`.
The advance is not a header button: **the status chip itself is the selector** (the Linear / Jira / Holded
pattern). The backend rules (what each step creates and settles) are in `neo-headless.md`; this is what
the SPA shows:

| Status | Chip (tone) | Header actions | File actions |
|---|---|---|---|
| `PE` | Pendiente (neutral) | Confirmar | «Antes de confirmar» |
| `PR` | Pendiente de envío (warning), selector | Reactivar, **Descargar fichero** (top bar) | Regenerar (kebab) |
| `SB` | Enviada al banco (info), selector | Reactivar, **Descargar fichero** (top bar) | Regenerar (kebab) |
| `CT` / `PT` | Cobrada / Pagada (success) | Devolver (CT), **Descargar fichero** (top bar) | none |
| `CP` | Cobrada parcial (warning) | Devolver (what is left), **Descargar fichero** (top bar) | none |

**Status chip selector** (`artifacts/remittance/custom/RemittanceStatusSelector.jsx`, declared as
`window.customComponents.topbarExtra`). On a `PR` or `SB` remittance the plain status pill is hidden
(`WINDOW_HIDE_STATUS_PILL_FOR.remittance` in `detailViewHelpers.jsx`, the existing per-window hook, so
`DetailView.jsx` does not grow) and the selector takes its place: the same chip with a small chevron, a
hover state and a pointer cursor. Clicking it opens a popover with the three flow statuses as chips
(`RemittanceStatusChip`, the same one as the row menu's submenu): the current one dimmed and marked
(`aria-current`), the one valid transition clickable (`PR` → «Enviada al banco», `SB` → «Cobrada») and the
rest dimmed but listed, so there is no way back and no PR → Cobrada. Choosing one opens the same dialog as
the grid. On `PE`, `CT`, `PT`, `CP`, `PP` and `AN` the selector renders nothing and the plain pill stays.
`markSent` and `markCollected` stay declared in `processOverrides` (`exclude: true`) because the selector,
the row menu and their drift test read their `displayLogicRaw`; the backend actions are untouched, so
MCP/NEO access is unaffected.

Both step dialogs (`RemittanceSentDialog`, `RemittanceCollectDialog`, `ActionChoiceModal` with no
options) open with `RemittanceStatusChange`: the shared `StatusTag` twice, labelled as the header chip,
with an arrow («Pendiente de envío → Enviada al banco», «Enviada al banco → Cobrada»), then one sentence
of what the step does. «Pasar a Enviada al banco» is informational (nothing is created or settled).
«Pasar a Cobrada» shows the receipts, the total and the fecha de cargo/abono (the settlement date) and
warns that the payments are settled at that date and the invoices become collected. Each posts its
action itself, toasts, refreshes and closes; a refusal (422 `ETGO_RemittanceMarkSentNotAllowed`,
`…MarkCollectedNotAllowed` / `…Failed`) is toasted translated and the dialog stays open.
A payment remittance shows «Pagada» in the chip (`PT`); the selector option and the dialog keep the
wording «Cobrada».

### Returns (ETP-6247)

The case where the bank does NOT collect one invoice of a confirmed remittance. First version: it is
registered manually, per line, and only on a **collection** remittance (a payment remittance shows
nothing). Importing the bank's return file, undoing a settlement and voiding are out.

**Backend contract** (spec `remittance`, same `sepa-remittances` flag, 403 when off):
- `POST …/action/returnState` `{}` → `{ collection, hasReturns, lines: { <lineId>: { state, returnable, reasonCode, returnDate, paymentId, paymentLineIds } } }`.
  `state` is PENDING, PROCESSED, SETTLED or RETURNED. `returnable` is true only for a settled line
  nothing blocks; otherwise `reasonCode` is NOT_PROCESSED, NOT_SETTLED, ALREADY_RETURNED,
  NOT_A_COLLECTION, POSTED or RECONCILED. `paymentLineIds` are the lines that share the payment
  (grouping GGPD): a return takes them all.
- `POST …/action/returnLines` `{ fieldValues: { lineIds, returnDate? } }` → `{ status, returned, returnPaymentId, returnPaymentDocumentNo }`.
  All or nothing. `returnDate` defaults to today and cannot be in the future. The status afterwards is
  `CP`, even if every line is returned. Refusals are 422 with a localized `error.message`:
  `ETGO_RemittanceReturnNotAllowed` (also `error.problems: [{ lineId, reasonCode, documentNo, message }]`,
  the codes above plus SHARED_PAYMENT), `…ReturnLineNotFound`, `…ReturnDateInvalid`, `…ReturnFailed`.
  No `backendErrors` mapping: the message is already localized.

**UI**
- **«Devolver»** is a header process declared in `decisions.json` (`processOverrides.returnLines`:
  `add`, `primary-danger`, `confirmModal`, `requiresLines`, `displayLogicRaw`
  «not PE/PR/SB/PT/PP/AN» on the data key `remittanceStatus`, i.e. only on Cobrada `CT` or partially collected `CP`, never before it is collected). Its
  click goes to `customComponents.processConfirmModal` → `RemittanceProcessConfirmModal` →
  `RemittanceReturnDialog`, the same routing as «Confirmar». A payment remittance cannot be told
  apart from the record, so the button shows on it too; the dialog then says that only collection
  remittances accept returns (from `returnState.collection`) and offers no list.
- **`RemittanceReturnDialog`** is built on `ActionChoiceModal` with ZERO options (the modal now allows
  it: no question, no choice card, just the summary strip, the body and the footer). It reads
  `returnState` and the lines (`GET /lines?parentId=…`) on open and uses the shared controls, copied
  from `DocumentPickerModal`, the sibling picker:
  - the search box (`Search` icon + the picker's input classes);
  - «Seleccionar todo» / «Deseleccionar todo» (`SquareCheck` button, the `selectAll` / `deselectAll`
    keys; it takes the visible returnable lines);
  - the shared `Checkbox`, and `role="option"` rows (hover, selected state, spacing, a row click toggles);
  - the shared `DateField` for the return date (locale order, default today).
  It lists **every** line with invoice, partner and `formatCurrency` amount. A returnable line is
  enabled; the others are dimmed, `aria-disabled`, and show why (`remittanceReturnReason*`, or
  «Devuelta el {date}»). Ticking a line ticks every line of its payment (`paymentLineIds`), so a
  shared payment is returned whole. The list scrolls (`max-h-56`). `DateField` has no `maxDate`
  (only `minDate`), so a later day is accepted by the field and refused by the dialog:
  `remittanceReturnDateFuture` under the field and the primary disabled; a `maxDate` would need
  `schema_forge_core`. A danger `InfoBanner` says the payment is voided, the invoices are pending
  again and the remittance ends partially collected. A 422 `ETGO_RemittanceReturnNotAllowed` lists
  `error.problems` and keeps the dialog open.
- **After success:** toast, `onRefresh` (re-reads the header and the lines, so the chip and banner show
  `CP`) and close.
- **Lines grid:** the «Estado del recibo» column shows `payment.status`. A return voids the payment
  (`RPVOID`), which read «Anulado»; `lines.status.enumValues` in `decisions.json` now names `RPVOID`
  «Devuelto» (`remittanceReceiptReturned`), so a returned receipt reads as returned. The other codes
  keep their existing labels. It needs a regeneration (done by `make regen`).
- There is no extra section on the page: an earlier «Devoluciones» card under the lines was removed.

Testids: `remittance-return-dialog`, `-count`, `-total`, `-date-label`, `-loading`, `-load-error`,
`-not-collection`, `-search`, `-select-all`, `-lines`, `-line` (`data-state`, `data-code`), `-check` (the Checkbox label),
`-note`, `-date` (the DateField input), `-date-error`, `-warning`, `-problems`, and the dialog's primary button `action-confirm-modal`.

### SEPA creditor identifier

It is not stored, neither on the account nor on the remittance, and it is not shown. It is computed
when the SEPA XML is built:
- the organization tax ID (NIF);
- plus the `Creditor_Business_Code` parameter of the remittance type, default `000`.

The XML belongs to another team.

## Ticket fields not covered by a Classic column

These need a new column, which the scope rules out, or a later task. None was invented:

| Ticket field | Status |
|---|---|
| List "Tipo" (collection / payment) | covered by the `remittanceType` name |
| List "Nº de documentos" and "Total" | **not covered**. Both are aggregates of the lines; there is no Classic column |
| Header SEPA scheme | covered by the `remittanceType` name. There is no separate field |
| Header creditor identifier | left out (computed at XML time, see above) |
| Line due date | covered: «Vencimiento», property path `paymentScheduleDetail.invoicePaymentSchedule.expectedDate` |
| Line invoice number | covered: «Factura», property path `….invoice.documentNo` |
| Line business partner | covered: «Cliente», property path `paymentScheduleDetail.businessPartner` (declared in decisions; Classic has no field for it) |
| Line status | **not covered**. The Classic `payment.status` property-path field could now be served, but it is not shown: the payment is empty until the remittance is processed |

## Selectors and callout

- `financialAccount`: `GET /sws/neo/remittance/remittance/selectors/financialAccount`, filtered in
  the remittance header handler's `handle()`. It does not use a `SelectorContextPolicy`, because
  that would also filter every other financial-account selector.
- `remittanceType`: `GET /sws/neo/remittance/remittance/selectors/remittanceType?FIN_Financial_Account_ID=<id>`
  (`dependsOn.filterKey`). The account also travels in the selector context
  (`source: field, field: financialAccount`).
- The Classic callout `REM_RemittanceType_FinAccount` runs when `REM_Remittance_Type_ID` changes.
  Whether it overwrites the chosen account has to be checked; if it does, the handler overrides it.

## Files

- `artifacts/remittance/decisions.json`, generated output under `artifacts/remittance/generated/web/remittance/`.
- `agent-prompts/remittance/spec.md`.
- `cli/config/regen-windows.json` (entry `remittance`).
- `tools/app-shell/src/windows/custom/remittance/index.jsx` (route guard), `windows/registry.js`
  (`customLoaders.remittance`), `menu.json` (Finance, after `financial-account`).
- `tools/app-shell/src/lib/statusToneOverride.js` (per-column status tones).
- `artifacts/remittance/custom/RemittanceBottomPanel.jsx`, `SelectDueItemsModal.jsx` and
  `remittanceDueItemsApi.js` («Seleccionar desde factura»), on the generic
  `components/contract-ui/DocumentPickerModal.jsx`, `ResettableAmountInput.jsx`, `RecordLink.jsx`
  and `lib/boundedAmount.js`. The shared `InvoicePickerModal.jsx` is back to its pre-ETP-6148
  shape: the optional row props round 2 added for remittance were removed in round 3.
- ETP-6247: `artifacts/remittance/custom/remittanceFileApi.js` (fileReadiness / confirm /
  generateFile / attachment download), `RemittanceFileCard.jsx` («Antes de confirmar» / «Fichero
  SEPA», rendered by `RemittanceSepaFileData.jsx`), `RemittanceConfirmDialog.jsx` (routed from
  `RemittanceProcessConfirmModal.jsx`), and the CT/PT file texts in `RemittanceStatusBanner.jsx`.
- i18n: `genericLabels.remittanceStatusPe` … `remittanceStatusAn` in `locales/{en_US,es_ES,es_AR}.json`;
  ETP-6247 adds `remittanceFile*`, `remittanceConfirm*`, `remittanceBannerCollectedFile` /
  `remittanceBannerPaidFile` and `backendError.remittanceFileNotProcessed`.

### Test ids

| Element | `data-testid` |
|---|---|
| Access maps loading (route guard) | `remittance-access-loading` |
| Access-denied screen | the shared `AccessDeniedMessage` |
| Status badge in the grid | `StatusTag__eb5261`, with `data-tone` carrying the tone |
| Status options in the quick filter | `StatusTag__filter-option` |
| «Seleccionar desde factura», empty state / with lines | `action-select-due-items-empty-state` / `action-select-due-items` |
| Lines footer (trigger + total) | `remittance-lines-footer` |
| Lines total | `remittance-lines-total`, `-label`, `-amount` |
| Status banner | `remittance-status-banner` (`data-status` = the code) |
| «Antes de confirmar» | `remittance-file-readiness`, `-loading`, `-ready`, `-problems`, `-error`, `-recheck`; problem list `remittance-file-problems` with groups `remittance-file-problems-org` / `-account` / `-partner-{bpId}` (their links add `-link`) and each sentence `remittance-file-problem` (`data-code`) |
| «Confirmar» dialog | `remittance-confirm-dialog`, `remittance-confirm-count`, `-total`, `-due-date` (the summary values), `remittance-confirm-grouping-P` / `-GGPD` (the cards), `remittance-confirm-file-note`, `remittance-confirmed-dialog` (the success step: `-subtitle`, `-summary`, `-name`, `-status`, `-count`, `-total`, `-type`, `-due-date`, `-account`), `remittance-confirm-irreversible`, `remittance-confirm-checking`, `-check-failed`, `-ready`, `-problems`; the buttons are ActionChoiceModal's: `action-confirm-modal` (primary) and Cancelar (by text) |
| File actions | `remittance-file-download` (the top-bar button), `menu-action-regenerateFile` (the kebab item), `ConfirmDialog__remittance-regenerate` |
| «Confirmar» / «Reactivar» | the generic process buttons; the reactivate confirmation is the shared `ConfirmDialog` (`components/OAuth2ClientDialog.jsx`), which takes no `data-testid` of its own: target its `DialogContent__4aea7f` / `Button__4aea7f`, or the dialog role and its title |
| Due-item picker | `document-picker-modal`, `-search`, `-select-all`, `-list`, `-row-{id}` (`aria-selected`), `-check-{id}`, `-amount-{id}` (`-input`, `-reset`), `-amount-error-{id}`, `-status`, `-confirm`, `-cancel`; the document link `remittance-due-item-link-{id}`, the due status `remittance-due-status-{id}` |
| «A remesar» in the grid | `line-in-place-amount-{lineId}` (`-input`, `-reset`) |

## Regeneration

```bash
make regen ONLY=financial-account,remittance PUSH_TO_NEO=1
# then, in the Etendo root:
./gradlew export.database
```

Push only to a database whose `org.openbravo.module.remittance` already has `REM_REMITTANCE.REMITTANCE_STATUS` (the merged and built ETP-6148 change), and whose `REM_*` tables carry no `EM_ETGO_*` column.

ETP-6247: `eTARAutomaticprocess` became `readOnly`, so the push opens its `ETGO_SF_FIELD` row
`7F6A3B65CE804149AE7C87D6E905CF3D` (`ISINCLUDED`/`ISREADONLY` Y). Until it is pushed and exported,
the offline regen-check reports that one row as drift, and NEO does not serve the key, so
«Reactivar» is gated on `remittanceStatus` instead.
A push creates `ETGO_SF_FIELD` rows that point to the `AD_COLUMN` rows of the spec's tables.

## Manual verification

Prerequisites: the `sepa-remittances` flag on, the spec pushed, and at least one Bank account with a
valid IBAN created while the flag was on (so it has the remittance payment methods).

1. With the flag off, there is no menu entry, `/remittance` shows the access-denied screen, and
   `GET /sws/neo/remittance/remittance` answers 403. With the flag on, «Remesas» appears in
   Finanzas right after Cuentas. A role without the Remittance window grant sees neither the entry
   nor the page.
2. The list shows Fecha, Tipo de remesa, Nombre, Cuenta, Fecha de cargo/abono and Estado. Every
   column sorts and appears in "Filtro por condicionales".
3. In a new remittance, Cuenta only offers Bank accounts with a valid IBAN and the remittance
   payment methods. Tipo de remesa is empty
   until an account is chosen, and then only offers the types linked to that account.
4. After saving, Fecha is today, Nº documento is filled in (first field, and first list column) and Estado is Pendiente (a neutral
   badge in the grid; «Pendiente» in the form and the detail pill).
   In Fecha de cargo/abono, past days are disabled in the calendar. A typed past date reverts
   and shows the message «La fecha no puede ser anterior a hoy».
5. There are no Classic process buttons in the detail view. A pending remittance with lines shows
   «Confirmar». A Pendiente de envío remittance (PR) shows «Reactivar» and its status chip is a selector that offers «Enviada al banco»; an Enviada al banco one (SB) shows «Reactivar» and a selector that offers «Cobrada»; a Cobrada (CT)
   shows only «Devolver», and a Pagada (PT) shows none.
5a. (ETP-6247) Under «Datos para el fichero SEPA», «Antes de confirmar» lists what the file needs:
   remove a customer's IBAN or mandate date and «Volver a comprobar» shows it under that customer,
   with a link to the contact. Confirmar opens a dialog with the invoices, the total and the fecha
   de cargo/abono, the grouping and the warning; with a problem its Confirmar is disabled. With
   everything right, confirming generates the `.xml` without downloading it, the remittance turns Pendiente de envío, a «¡Remesa confirmada!» step offers the file,
   the banner says what is pending, and the top bar offers «Descargar fichero» and the kebab
   «Regenerar fichero» (only while PR or SB; it asks first and downloads a new file). Download is only done from the button.
6. On a processed remittance, the header fields are locked.
7. The Líneas tab has no add or edit. While the remittance is pending, a line can be deleted with
   the trash icon or by selecting it; once processed, delete is gone. «Seleccionar desde factura» opens
   the due-item picker. Rows already in the remittance are checked and disabled. Confirming adds
   the lines, shows a toast with the count, and refreshes the lines.
8. English and Spanish: no untranslated text.
