# Business Partner Category

## Intent

Business Partner Category lets users maintain the category master record used to classify business partners (customers, vendors, employees, etc.) and configure the accounting accounts associated with each category per accounting schema. The main form covers the category header fields; the **Accounting** tab exposes the GL accounts linked to each accounting schema for that category.

## What this window should allow

Users should be able to:

- browse contact categories (columns depend on the `contact-category-type` flag, see below)
- open a category and maintain its header fields: Search Key, Name, Description, Default, and — with the flag on — the **contact type** (Customer and/or Vendor/Creditor — at least one is required)
- view and edit the category's accounts from the Accounting tab — with the flag on grouped by contact type: Customers (receivables, prepayment, write-off) and Vendor/Creditor (liability, prepayment) — see *Contact type — ETP-5791* below

> **Feature flag `contact-category-type` (ETP-5791, default OFF).** Everything under *Contact type —
> ETP-5791* is shown only while the flag is on. With the flag **off** the window looks and behaves
> as before ETP-5791: list columns Search Key and Name; form Search Key, Name, Description and
> Default (no "Tipo de contacto" group, no required type check); the generated inline-editable
> Accounting table; no "saved with associated contacts" notice. The flag is visual gating only —
> `com.etendoerp.go` evaluates the same key and enforces the contact-type rules on its own.
> Registry entry: `flags-registry.json` → `contact-category-type`.

## Interaction model

- **Route:** `/business-partner-category`, `/business-partner-category/:recordId`
- **Visibility:** visible in the **Settings** menu as **Business Partner Category** (EN) / **Categoría de Contacto** (ES) (AD window ID `192`)
- **Implementation type:** generated window behind a thin wrapper — `registry.js` points to `tools/app-shell/src/windows/custom/business-partner-category/index.jsx` (ETP-5791), which renders the generated entry point and is the toggle point of the `contact-category-type` flag for the record view: it passes a `Form` that excludes `etgoIscustomer` (and its required-gate entry) while the flag is off, and, while it is on, `DetailTable={null}` + `CustomLines={BpCategoryAccountingPanel}`. The list's columns are gated by the `customComponents.headerTable` component `BpCategoryTable`. Custom components live in `artifacts/business-partner-category/custom/`
- **Window shape:** master + detail; `businessPartnerCategory` is the header entity (table `C_BP_Group`) and `accounting` is the detail entity (table `C_BP_Group_Acct`), rendered by the generated inline grid (flag off) or by the custom `BpCategoryAccountingPanel` (flag on)
- **List behavior:** `decisions.json` declares every column (Search Key, Name, Customer, Vendor/Creditor, Default; `gridOrder` 1–5) and `BpCategoryTable` hides them through `hiddenColumns`: flag **off** → Search Key, Name (as before ETP-5791); flag **on** → Name, Customer, Vendor/Creditor, Default (Yes/No badges, real AD columns, so all four filter and sort)
- **Record behavior:** opening a category record renders a detail view with the category header form plus the **Accounting** tab (generated grid with the flag off, the custom panel with the flag on)
- **Accounting tab behavior (flag off — the generated grid):** shows one row per accounting schema. Each row exposes 20 ValidCombination FK selectors (`Customer Receivables No.`, `Customer Prepayment`, `Vendor Liability`, `Vendor Prepayment`, `Write-off`, `Write-off Revenue`, plus 15 secondary GL accounts covering non-invoiced receipts/receivables/revenue, payment discount expense/revenue, realized/unrealized gain/loss, unearned revenue, vendor service liability, and doubtful/bad-debt accounts). `Customer Receivables No.`, `Write-off`, and `Vendor Liability` are mandatory (`ismandatory=Y` in the AD). The five primary columns (`customerReceivablesNo`, `customerPrepayment`, `vendorLiability`, `vendorPrepayment`, `writeoff`) share the available width via `grow: true`; the remaining GL accounts are added as ordinary editable columns without `grow`.
- An **Attachments** tab is available in the detail tab strip (standard `AttachmentsTab` wiring, same as other generated master/detail windows).

## Layout configuration

The window uses these layout overrides (all set in `decisions.json → window`, mirroring `product-category`):

| Key | Value | Effect |
|-----|-------|--------|
| `detailEntity` | `"accounting"` | Accounting tab as the primary child entity |
| `detailVisibleWhenCapability` | `"showAccountingFields"` | **(ETP-5648)** The Accounting tab is this window's detail tab, so it is hidden, and never fetched, for a role without the capability; the header form stays available. The server refuses `<spec>/accounting` with `403` for such a role anyway |
| `linesLayout` | `"inlineEditable"` | Inline editing on Accounting rows |
| `noHeaderBorder` | `true` | Removes the border under the header form |
| `toolbarBorderBottom` | `true` | No effect since ETP-5601 (the record toolbar is standardized) |
| `formCardPadding` | `"p-2"` | Tighter padding on the form card |
| `formScrollPaddingX` | `"px-2"` | Horizontal padding on the scroll column |
| `toolbarPaddingX` | `"px-2"` | No effect since ETP-5601 (the record toolbar is standardized) |
| `tabsBarPaddingX` | `"px-2"` | Horizontal padding on the tabs bar |
| `hidePrint` / `hideLink` | `true` | Print and link actions hidden from the detail chrome |
| `maxDetailLines` | `1` | Accounting grid shows one row per accounting schema |

## Reactive behavior and dependencies

- The Accounting grid depends on the selected category record and loads rows filtered by `parentId`.
- All 20 accounting fields are ValidCombination FK selectors (`ad_reference_value_id = 95E2A8B50A254B2AAE6774B8C2F28120`, `OBUISEL_Selector Reference` type), the same selector family used by Product Category's accounting tab.
- `accountingSchema` (`C_AcctSchema_ID`) is classified as a `system` field with `addLineFromSibling: true` — it is not user-editable; it is filled from the sibling accounting-schema record when a new accounting row is created, exactly like Product Category.
- `Processing` (the "Copy Accounts" button) and `Status` are discarded — not exposed to the user.
- No callouts, display logic, or validation rules were found in the AD for either tab (`rules-raw.json` reports only the "Copy Accounts" process, no callout/validation/display-logic rows).

## Gap assessment

- **Java handler implemented.** `decisions.json → entities.accounting.javaQualifier` is set to `"businessPartnerCategoryAccountingHandler"`, matching the pattern used by `ProductCategoryAccountingHandler.java` in `com.etendoerp.go`. `BusinessPartnerCategoryAccountingHandler.java` exists on that repo's `feature/ETP-4402` branch (commit `7d86a652`, `@Named("businessPartnerCategoryAccountingHandler")`), with a matching `BusinessPartnerCategoryAccountingHandlerTest.java`. `C_AcctSchema_ID` has no native AD default value, so the handler's `handle()` auto-fills `accountingSchema` from the client's default active `AcctSchema` on POST when the field is absent, mirroring the `ProductCategoryAccountingHandler` pattern exactly.
- Accounting rows are pre-created by Etendo (one per accounting schema); the window allows editing existing rows, but adding/deleting accounting-schema rows is not a typical use case and is not explicitly gated.
- No totals, financial reactions, or callout chains are visible in the accounting entity contract.
- Since ETP-5791 a custom wrapper exists (`tools/app-shell/src/windows/custom/business-partner-category/index.jsx`, Product Category pattern) only to gate the contact-type UI behind its flag. When the flag is retired (shipped), move the panel back to `window.customLinesComponent` in `decisions.json` and drop the wrapper.

## Manual verification

Flag `contact-category-type` **off** (default):

- The list shows Identificador and Nombre only; the form shows Identificador, Nombre, Descripción and Valor por defecto, with no "Tipo de contacto" group, and saves without any type; the Accounting tab is the generated one-row inline grid; saving a category with contacts shows only "Registro guardado".

Flag **on** (`VITE_FEATURE_FLAGS={"contact-category-type":true}` locally, or the remote control plane):

1. Open `/business-partner-category` from the Settings menu: the list shows Nombre, Cliente, Proveedor/Acreedor and Valor por defecto (Sí/No badges), no Identificador column, and each column filters and sorts.
2. Open an existing category: the form shows Search Key, Name, Default and the "Tipo de contacto * (lo heredan solo los contactos nuevos)" group in the first two rows, and Description behind "Mostrar más datos".
3. Create a category: both type checkboxes start unchecked; saving with neither shows "Debe marcarse al menos un tipo de contacto: Cliente o Proveedor/Acreedor".
4. On the Accounting tab, check/uncheck Cliente and Proveedor/Acreedor (before saving): the matching section appears/disappears; with neither, the "Marca Cliente o Proveedor/Acreedor…" message shows. Re-checking a type shows its previous account values.
5. Change an account in a visible section: it saves on selection; the hidden section's mandatory accounts do not block it.
6. Save a category that has contacts (toolbar Save, or ticking a type checkbox on an existing category): only the info toast "Categoría guardada. Tiene contactos asociados…" remains — no green "Registro guardado" stacked behind it. A category without contacts shows only "Registro guardado".
7. With a role without "Show Accounting Fields", the Accounting tab is absent.
8. Open the **Attachments** tab and confirm file upload, download, and delete work as expected.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Business Partner Category** under the Settings group (`windowId: "192"`), immediately after Tax Category.
- `tools/app-shell/src/windows/registry.js` registers the `business-partner-category` slug pointing at the flag wrapper `windows/custom/business-partner-category/index.jsx` (ETP-5791), which renders the generated entry point.
- `artifacts/business-partner-category/decisions.json` defines `businessPartnerCategory` as the header entity and `accounting` as the detail entity with `linesLayout: "inlineEditable"` and `javaQualifier: "businessPartnerCategoryAccountingHandler"`.
- `artifacts/business-partner-category/contract.json` carries the `javaQualifier` through to both the frontend and backend entity sections, and lists `accountingSchema` in the `hidden`/`addLineFromSibling` slot of `addLineFields`.
- `artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryPage.jsx` renders `ListView` (with `BpCategoryTable`) for the list route and `DetailView` with `linesLayout="inlineEditable"` and the generated `AccountingTable`/`AccountingForm` for record routes; the wrapper overrides those with the custom panel while the flag is on.
- `node cli/src/validate-pipeline.js --scope=business-partner-category` reports 0 violations.
- No dedicated Business Partner Category browser test exists yet. Shared route/loading behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.

## Onboarding — ETP-4402

Window onboarded from scratch as part of feature/ETP-4402 (branch `feat/contact-category-window`):

- Registered in `cli/config/regen-windows.json` (`windowId: "192"`) — required before `make regen ONLY=business-partner-category` will pick up the window, since `regen-all.js` only processes entries that are **both** in the registry **and** have an on-disk `decisions.json`.
- `decisions.json` written mirroring Product Category's accounting-entity shape: real GL fields classified `editable` + `grid`/`grow` on the five primary columns, `accountingSchema` classified `system` with `addLineFromSibling: true`, `Processing`/`Status` discarded.
- `window.category` set to `"contact"` to align with the sibling `contacts` window (both classify business-partner-family data), rather than a new/unused category value.
- 8 missing AD field labels added to both `en_US.json` and `es_ES.json` (`fields` section): `NotInvoicedReceivables_Acct`, `NotInvoicedRevenue_Acct`, `PayDiscount_Exp_Acct`, `PayDiscount_Rev_Acct`, `RealizedGain_Acct`, `UnEarnedRevenue_Acct`, `UnrealizedGain_Acct`, `V_Liability_Services_Acct` — Spanish labels sourced from `ad_element_trl` (`ad_language='es_ES'`), English labels/descriptions sourced from `ad_column`/`ad_element`. The `windows → "Business Partner Category"` entry already existed in both locales (EN: "Business Partner Category", ES: "Grupos de Terceros") and needed no change at the time.

**ETP-4402 update:** the Spanish label for this window was renamed from "Grupos de Terceros" (and the tab-section variant "Grupos de terceros") to **"Categoría de Contacto"**, matching the ticket's original Spanish terminology. All three `es_ES.json` occurrences of the `"Business Partner Category"` key — `windows`, `tabs`, and `menus` sections — were updated to the new label. The English label (`en_US.json`) and the unrelated `C_BP_Group_ID` / `bpGroupField` field-level labels (which also read "Grupos de terceros" but refer to the generic Business Partner Group selector field, not this window) were left untouched. No pipeline regeneration or NEO push was needed — window/menu/tab display labels are resolved client-side from these locale JSON files via `useMenuLabel()`/`tMenu()`, independent of the pushed contract config.
- **Resolved:** `businessPartnerCategoryAccountingHandler` Java NeoHandler referenced by `decisions.json` is implemented in `com.etendoerp.go` (`feature/ETP-4402`, commit `7d86a652`) — see Gap assessment.

## ETP-4565 — Accounting tab: entity-level non-deletable

**`entities.accounting.hideDelete: true`** added — the pre-existing `window.maxDetailLines: 1` already caps the Accounting tab at one record; this pass adds the matching entity-level delete guard (`apiPrediction.crud.accounting.delete: false`). Regenerated via `make regen ONLY=business-partner-category`; `sf-validate-pipeline --scope=business-partner-category` reports 0 violations. Regression test: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js`.

**Auto-creation gap (requirement 3, DB-verified):** of the 33 most-recently-created `C_BP_Group` records, only 29 (88%) have a corresponding `C_BP_Group_Acct` row — a partial gap, not a total failure like `financial-account`/`warehouse` (see the coordinator report on ETP-4565). Flagged for follow-up investigation in `com.etendoerp.go`, not fixed in this pass.

## Account selectors — ETP-5681

Every account field of the **Accounting** tab (all 21 customer/vendor account fields) declares `"lookup": true` +
`"lookupDrawer": "account"` in `decisions.json`: the cell (inline edit and add row) and the side
form open the shared centered account search popup (`AccountLookupPopup` → `SearchPopup`, the one
the report filters use for "Desde la cuenta") instead of a dropdown that cut long names off. The
popup is titled with the translated field label, shows each `"<code> - <name>"` in full, searches
by code or name and lists **posting accounts only** (`PostingAccountCombinationSelectorPolicy` in
`com.etendoerp.go` hides summary headings).

## Contact type — ETP-5791

**Behind the `contact-category-type` feature flag (default off).** This whole section describes the
flag-on behaviour; with the flag off the window is the pre-ETP-5791 one (see the note at the top).
The DB columns, the agent prompts (MCP) and the `C_BP_Group` data-fixes R50/R51 are not gated.

A category now defines whether its contacts are **Customer**, **Vendor/Creditor** or both. Backend
(`com.etendoerp.go`): columns `EM_Etgo_Iscustomer` / `EM_Etgo_Isvendor` on `C_BP_Group` (API
`etgoIscustomer` / `etgoIsvendor`, YesNo, default `N`) and `BusinessPartnerCategoryHandler`, which
refuses a category saved with neither (`messageKeys: ["ETGO_BPGroupContactTypeRequired"]`). The
flags are copied into a contact when the contact is created; they never change existing contacts.

**Header — "Tipo de contacto".** `etgoIscustomer` declares `customRenderer: "ContactTypeField"`
(`span: 4`). The component has `ownsLabel = true`, so it draws the legend "Tipo de contacto *
(lo heredan solo los contactos nuevos)" and the two checkboxes "Cliente" / "Proveedor/Acreedor";
both are the shared `SquareCheckbox` (`windows/custom/shared/SquareCheckbox.jsx`), so they look
like the generic "Valor por defecto" checkbox of the same form (square `border-primary` box with a
check mark), are keyboard-toggled with Space and are dimmed and inert when the form is read-only
(`disabled`). It writes `etgoIsvendor` (declared `form: false`) through EntityForm's `onFieldChange`. A new
category starts with both unchecked. On an existing record each toggle autosaves (`onCommit`,
the window's `autoSaveOnBlur`); unchecking the last type is refused by the backend and the error
toast reads "Debe marcarse al menos un tipo de contacto: Cliente o Proveedor/Acreedor"
(`lib/backendErrors.js` maps `ETGO_BPGroupContactTypeRequired`, and the contact-side
`ETGO_BPartnerContactTypeRequired`), and the toggle rolls back.

**Header layout.** The form holds Search Key, Name, Description (`textarea`, `span: 2`) and
Default, then the full-width (`span: 4`) "Tipo de contacto" group. **Description** was briefly
removed from the form during ETP-5791 (it is not in the design prototype); the PM decided it
stays, unconditionally (not behind the flag), exactly as before ETP-5791. The shared header form
shows only its first 2 rows before the "Mostrar más datos" toggle (`initialRows={2}`, ETP-5513),
and on overflow it moves the required fields first (`partitionInitialRows`): with the flag on,
Search Key, Name and Default fill row 1, the "Tipo de contacto" group row 2, and Description goes
behind the toggle. With the flag off the four fields fit in two rows and no toggle appears.

**Accounting tab — `BpCategoryAccountingPanel`.** Passed by the window wrapper as `CustomLines`
(label `customLinesLabel: "Accounting"`, with `DetailTable={null}` so it replaces the generated
grid) while the flag is on — not declared in `decisions.json`, so the generated grid stays
available with the flag off. It loads the category's single `C_BP_Group_Acct` row
(`accounting?parentId=<id>`) and shows two sections. **They look and behave like the account
tabs of the Esquema contable window** (PO decision, "Valores por defecto" / "Cuentas generales"),
built from the same shared components, not a look-alike: each section is a `SectionShell` card
(title + grey subtitle on the left, hairline rule between sections) holding a 1/2/3-column grid
of `AccountSelect` fields (label with the red required `*`, a search button showing
`"<code> - <name>"` that opens the centered `SearchPopup`, an ✕ to clear an optional account).
Section subtitles: `bpCategoryCustomersSectionSubtitle` / `bpCategoryVendorsSectionSubtitle`.

| Section | Accounts |
|---|---|
| Clientes | Recibos de clientes (`customerReceivablesNo`), Prepago del cliente (`customerPrepayment`), Cancelaciones (`writeoff`) |
| Proveedor/Acreedor | Pasivo del proveedor/acreedor (`vendorLiability`), Pagos por adelantado del proveedor/acreedor (`vendorPrepayment`) |

- Each section follows its header checkbox **live**, before saving: the panel reads DetailView's
  editing record (`data`).
- The section of an unchecked type is **hidden**; with no type checked the tab shows "Marca
  Cliente o Proveedor/Acreedor para configurar sus cuentas contables.". Values are never cleared.
- Hiding the unchecked section is the confirmed behaviour (PO decision): the ticket's read-only /
  padlock wording was superseded by the design, so there is no read-only variant
  (`resolveAccountSections` in `custom/bpCategoryContactTypes.js` returns only the checked
  sections).
- Account catalog: each `AccountSelect` is fed by the field's own NEO selector
  (`<apiBaseUrl>/accounting/selectors/<column>`, the endpoint the generic `lookupDrawer:
  'account'` popup uses) through `loadPage={useAccountSelectorPages(url)}`, so search and paging
  are server-side and only **posting accounts** are listed (`PostingAccountCombinationSelectorPolicy`,
  the same rule `PostingAccountCombinations` applies to the Esquema contable catalog). The
  selected label is the row's `<key>$_identifier`. No backend change.
- Each account is PATCHed on its own (an optional one cleared with ✕ PATCHes `null`; a refused
  PATCH shows the error toast and restores the previous value). The mandatory accounts of a hidden section never take part in a save: the row is
  created by `c_bp_group_trg` with the accounting schema defaults (verified on the shared DB: all
  739 `C_BP_Group_Acct` rows have receivables, write-off and vendor liability filled).
- A new (unsaved) category shows "Guarda la categoría para configurar sus cuentas contables.".
- The tab stays gated by `detailVisibleWhenCapability: "showAccountingFields"` — the gate now
  also covers a `CustomLines` tab (`gateDetailTab`).
- The 16 secondary GL accounts of `C_BP_Group_Acct` are no longer shown in the UI; their values
  are untouched.

**"Saved with associated contacts" notice.** After a category is saved — toolbar Save or
autosave, detected as a change of the record's `updated` token — or after an account is changed
in the panel, the window reads one row of `contacts/businessPartner` filtered by
`businessPartnerCategory`. If there is one, an info toast says "Categoría guardada. Tiene
contactos asociados: los cambios no los modifican y solo se aplicarán a los contactos nuevos."
(`custom/useAssociatedContactsNotice.js`). The notice **replaces** the generic "Registro guardado"
toast instead of stacking on it: it is raised with the generic save toast's own id
(`RECORD_SAVE_TOAST_ID`, `hooks/useEntity.js`), which sonner turns into an in-place update — the
same mechanism the User window uses for its create toast. A category without contacts keeps the
plain "Registro guardado". A role that cannot read Contacts gets no notice.

**Labels.** `fields.EM_Etgo_Iscustomer` / `fields.EM_Etgo_Isvendor` are in the locales (the module
has no es_ES translation pack). The two vendor accounts are renamed **in this tab only**: their
entries in `ACCOUNT_SECTIONS` (`custom/bpCategoryContactTypes.js`) carry a `labelKey`, which the
panel resolves with `useUI()` instead of the AD column label — `bpCategoryVendorLiability`
("Pasivo del proveedor/acreedor" / "Vendor/Creditor Liability") and `bpCategoryVendorPrepayment`
("Pagos por adelantado del proveedor/acreedor" / "Vendor/Creditor Prepayment"). Every other
account keeps `t(column)`. The global `fields.V_Liability_Acct` / `fields.V_Prepayment_Acct` labels
and the posting-error names `backendError.account.vendorLiability` / `vendorPrepayment` are
unchanged ("Pasivo del proveedor" / "Pagos por adelantado del proveedor"), so Contactos (Vendor
Accounting), Configuración contable and the posting error messages keep the AD wording (PO
decision).

**MCP schema hints.** `etendo_schema view:"create"` lists `etgoIscustomer` / `etgoIsvendor` as
optional with `serverDefaulted: true` (the AD default `N` is resolved), which on its own suggests
both can be omitted, but omitting both is refused with `ETGO_BPGroupContactTypeRequired`. Each
field therefore declares an `agentPrompt`
(`agent-prompts/business-partner-category/category.etgo-iscustomer.md` / `category.etgo-isvendor.md`,
persisted to `ETGO_SF_FIELD.AGENT_PROMPT`) that says at least one of the two must be true and that
new contacts in the category inherit them.

## ETP-5693 — Posting accounts only, on write

Saving an account field of the accounting tab now refuses a summary (heading) account, an inactive account or combination, and an account of another accounting schema than the row's; on update the row's accounting schema cannot change. The account selectors already hide those accounts (ETP-5681), so in the UI this only shows up in a race, as a translated toast (`backendError.accountIsSummary` / `accountIsInactive` / `accountWrongLedger` / `ledgerNotUpdatable`); REST and MCP callers get a 400 whose text names the field and the account. A value already stored is not re-checked, so existing rows stay saveable. Backend: `PostingAccountGuard` via `BusinessPartnerCategoryAccountingHandler` (`com.etendoerp.go`, see `neo-headless.md`).

## Read-only role tier: no attachment uploads — ETP-5830

With a `read-only` tier on this window the Attachments tab lists, previews and downloads files but shows no upload dropzone and no delete or description edit (`AttachmentsTab` `accessReadOnly`). Before ETP-5830 the dropzone stayed enabled and the upload failed with the raw backend 403; that error is now translated too. Full list of gates: [`app-shell-functional-flows.md`](app-shell-functional-flows.md) → *Read-only role access — every write path is gated*.
