# General Ledger Configuration

> **Story:** ETP-4246.
> AD window `125` (`General Ledger Configuration` / `Configuración contable`).

## Intent

Expose the accounting schema setup as a focused 4-tab custom window aligned to the approved Figma, not the earlier Claude design. The window concentrates the day-to-day schema configuration surface into:

- **General**
- **Valores por defecto**
- **Dimensiones**
- **Cuentas generales**

> **ETP-4452 cleanup:** the earlier "Documentos" tab was removed. It only ever rendered hardcoded mock seed rows (`buildDocumentSeeds()` in the Java handler / `DOCUMENTS_SEED` in `mockCatalogs.js`) with no real backend read/write path, and had been documented as a placeholder pending a product decision that never happened. It is no longer part of this window.

The current frontend is production-shaped but still backed by local mock data because the NEO spec for window `125` is greenfield. Save currently clears dirty state locally; real multi-entity persistence belongs to the Phase-3 backend work.

## Route And Layout

- Menu entry: `Finanzas / Esquema contable`
- Slug: `general-ledger-configuration`
- Window type: `layoutType: custom`
- Top metadata: breadcrumb `Finanzas / Esquema contable` (built from the shared `ui('finance')` key + `ui('glc.title')`, ETP-4945)
- Top bar (`glc-toolbar`): follows the record (form view) toolbar standard (ETP-5736) — 56px, 8px padding, inset bottom rule, via the shared `getLinesToolbarClassName()` (`components/contract-ui/toolbarClasses.js`)
- Left side of the top bar: the 4 tabs, rendered by the shared segmented control `SegmentedTabs` (40px group, 32px tabs, same as the list subset tabs; group label = translated window title)
- Right side of the top bar: dirty-state `Guardar cambios` button, 40px via the shared `getSaveBtnCls()`; primary colour from the semantic tokens (ETP-5752 brand blue), not hardcoded

## Tab Behavior

### General

Two sections (the former "Políticas contables" section, which held only the `Allow
negative` toggle, was removed entirely — see below):

1. **Identidad del esquema**
2. **Calendario y moneda**

Backed editable fields:

- `Nombre del esquema` → `name`
- `Descripción` → `description`
- `Moneda principal` → `currency`

Hidden-but-kept backend fields:

- `Esquema contable` / `gAAP` stays persisted in the ledger but is not user-editable in this custom surface.
- `Criterio contable` / `accrual` (`IsAccrual`) is hidden and internally fixed to Devengo (accrual = true) — Etendo Go doesn't support Caja (cash-basis) for taxes. `decisions.json` marks it `system`-visibility, and `GeneralLedgerConfigurationHandler.applyGeneralChanges()` no longer accepts a client-supplied value for it, so it cannot be flipped away from Devengo through this window or through a raw NEO write (ETP-5372).
- `Allow negative` / `Allownegative` — `decisions.json` marks `allowNegative` as
  `system`-visibility and `GeneralLedgerConfigurationHandler.applyGeneralChanges()` no
  longer accepts a client-supplied value for it; the checkbox was removed entirely from
  the General tab (ETP-4947). The value is still reported on GET via `buildGeneral()`.

Read-only fields sourced from the organization-level backend relation in the delivered implementation:

- `Organización`
- `Calendario fiscal`

Current delivered state:

- both read-only values are loaded from the organization-backed aggregate endpoint
- in the current local dataset that relation resolves from `AD_Org` / `AD_Org_AcctSchema`

### Valores por defecto

Editable account selectors, **derived at module-load time from `contract.json`** (`buildDefaultsGroups()` in `mockCatalogs.js`, consuming `frontendContract.entities['Valores por defecto'].fields`) rather than hand-typed. `contract.json` is produced by the standard Schema Forge pipeline (`extract-from-db.js` → `decisions.json` → `resolve-curated.js` → `generate-contract.js`) from real AD metadata — `AD_Field.IsActive`, `IsDisplayed`, `AD_FieldGroup`, `AD_Column.IsMandatory` — so activating/deactivating a field, or changing its required-ness, now takes effect via `make regen ONLY=general-ledger-configuration` instead of a hand-edit. Full design: `docs/superpowers/specs/2026-07-07-glc-defaults-ad-driven-grouping-design.md`.

Current state: **9 groups, 39 fields**:

1. `Banco` (AD group "Bank") — 5 fields
2. `Diario` (AD group "Cash Journal") — 3 fields
3. `Contactos` (AD group "Business Partner", labeled "Contactos" per product decision) — 11 fields
4. `Impuestos` (AD group "Tax") — 4 fields
5. `Producto` (AD group "Product") — 9 fields
6. `Activos` (AD group "Assets": `depreciation`, `accumulatedDepreciation` only) — 2 fields
7. `Proyecto` (AD group "Project": `workInProgress`) — 1 field
8. `Almacén` (AD group "Warehouse") — 2 fields
9. `Otras cuentas` — the catch-all for any editable field with no curated `section` in `decisions.json`. Currently: `disposalGain`, `disposalLoss` (both Active+Displayed in AD but with no AD Field Group).

A field's label prefers its curated `glc.acct.<apiKey>` i18n key; if none exists yet (e.g. a brand-new AD field nobody has translated), it falls back to the field's raw AD English name (`resolveFieldLabel()` in `mockCatalogs.js`) rather than rendering a raw i18n key.

**Fields intentionally excluded** (`AD_Field.IsActive = 'N'` or `IsDisplayed = 'N'` on tab `252`): `bankInterestRevenue`, `bankInterestExpense`, `bankUnidentifiedReceipts`, `unallocatedCash`, `bankSettlementGain`, `bankSettlementLoss`, `cashBookExpense`, `cashBookReceipt`, `projectAsset`, `taxExpense` (all inactive), plus `paymentSelection` (`IsDisplayed='N'`) — 11 fields total, matching Classic exactly. The backend's `DEFAULT_FIELD_MAPPINGS` (Java) still maps their DB columns; excluding them here is display-only.

### Dimensiones

Editable toggle list over `C_AcctSchema_Element` rows.

- Toggle state maps to `IsActive`
- Caption combines mandatory/optional with business scope text
- `Withholding_Acct` stays out of scope
- Mandatory dimensions are visible but cannot be deactivated from this UI.
- The backing `AcctSchemaElement` query does **not** filter on `IsActive` (`setFilterOnActive(false)`, ETP-4452) — deactivating a dimension and saving keeps the row visible (unchecked) on the very next reload instead of making it disappear.
- **Label i18n (ETP-4845):** `GeneralLedgerConfigurationHandler.buildDimensions` sends each row's stable `type` (the `C_AcctSchema_Element.ElementType` / AD_Ref_List `181` code — `OO`, `AC`, `PR`, `BP`, `PJ`, `CC`, …) but no `labelKey`; `row.label` is the raw (English) `Name` column, untranslated. `mapDimensionRows()` in `mockCatalogs.js` derives `labelKey` from `type` via `DIMENSION_TYPE_LABEL_KEYS` before the row reaches `DimensionsTab.jsx`, which already preferred `labelKey` over `label`. Filter/translate by `type`, never by matching the display name (it isn't stable across locales).
- **User 1 / User 2 excluded (ETP-4845):** `mapDimensionRows()` drops rows whose `type` is `U1`/`U2` (or any *non-empty* code absent from `DIMENSION_TYPE_LABEL_KEYS`) regardless of `IsActive` — no window's contract curates `USER1_ID`/`USER2_ID` as an editable (`form: true`) field, so Etendo GO does not support them as an accounting dimension and showing the toggle is misleading. A client created through classic Etendo's default "new client" wizard seeds all 8 elements (including `U1`/`U2`); GOClient's own provisioning seeds only the 6 GO-supported ones. Edge case, documented by a test but **not fixed** (`mockCatalogs.mapDimensionRows.vitest.js`, "treats an empty-string type identically to 'no type property'"): the filter's guard is `!row.type`, a falsiness check — a real row with `type: ''` (present but empty) is indistinguishable from a mock-seed row that carries no `type` key at all, so it passes through unfiltered and untranslated, reproducing bug 1's symptom for that one row. Not observed from the live handler; tracked as a known gap in the test, not a live regression.
- **Organization / Account excluded (ETP-5120):** `OO` (Organización) and `AC` (Cuenta) are Etendo's two built-in mandatory accounting dimensions — always active on every schema and not meant to be a user-configurable toggle in this window — so they were removed from `DIMENSION_TYPE_LABEL_KEYS` and are now dropped by the exact same omission mechanism as `U1`/`U2` above (absent from `DIMENSION_TYPE_LABEL_KEYS`, filtered out of `mapDimensionRows()` regardless of `IsActive`).
- **Contacto / Producto excluded and locked (ETP-4879):** `BP` (Contacto) and `PR` (Producto) are never shown in this screen — unlike the frontend-only omissions above (`U1`/`U2`/`OO`/`AC`), this one is enforced on the **backend**: `GeneralLedgerConfigurationHandler.LOCKED_DIMENSION_TYPES = {"BP", "PR"}`, and `buildDimensions()` skips these rows before they ever reach the frontend. `applyDimensionChanges()` also silently ignores any attempt to toggle a BP/PR row's `active` flag, regardless of its stored `mandatory` value — so even a direct API call cannot re-expose the toggle. Rationale: every window that renders these two dimensions (Assets, Financial Account, Amortization) already hardcodes them as always-visible, ignoring this config entirely, so the toggle was a no-op that only confused users (it looked like disabling either one would hide the field somewhere — it never did). A companion data-fix (`cli/src/data-fixes/sql/20260917T120000Z__R37-acctdim-bp-pr-locked-active.sql`, gap `K2`) forces `C_AcctSchema_Element.IsActive='Y'` and `IsMandatory='Y'` for every existing client's BP/PR rows, and the GOClient sampledata seed (`referencedata/sampledata/GOClient/C_ACCTSCHEMA_ELEMENT.xml`, `com.etendoerp.go`) was corrected so new tenants are born already correct. Project (`PJ`) and Cost Center (`CC`) are unaffected — still editable, `false` by default.
- **FIXED — new/unsaved documents ignored dimension config entirely (ETP-4845):** `useDisplayLogic.js`'s `evaluate()` skipped calling `/evaluate-display` whenever the record had no `id` yet ("new records have no meaningful state to evaluate"). True for record-dependent logic (`@Posted@='Y'`), but the `@ACCT_DIMENSION_DISPLAY@` macro is GL-Configuration-only, not record-dependent — every brand-new document (across every window and every client) showed toggled-OFF dimension fields until the very first save, because the visibility map stayed empty and `EntityForm.jsx`'s fail-open filter never activated. Live-verified before/after on a freshly onboarded client (`Acctdim_Centrally_Maintained='Y'` default) and on GOClient (`='N'`): a brand-new purchase-invoice header now correctly hides a toggled-off dimension immediately, matching the behavior an existing (already-saved) record always had. Fix: only skip the no-`id` early return when the caller has NOT declared `cacheableKeys` (both current callers — `DetailView.jsx` and `useAccountingDimensionFields.js` — always declare them, so this fires for every dimension-macro consumer now).
- **KNOWN GAP — toggle only writes half the picture for centrally-maintained clients (ETP-4845, unresolved, backend `com.etendoerp.go`, tracked separately as ETP-4854):** `GeneralLedgerConfigurationHandler.applyDimensionChanges` only sets `C_AcctSchema_Element.IsActive`. It never syncs the parallel per-dimension `AD_Client.<Dim>_Acctdim_IsEnable/Header/Lines/Breakdown` columns (visible on the classic "Client" window's Accounting Dimension section) — the ones `DimensionDisplayUtility.getAccountingDimensionConfiguration()` reads instead of `AcctSchemaElement.IsActive` once `AD_Client.Acctdim_Centrally_Maintained='Y'`. **`'Y'` is the ONBOARDING DEFAULT for every newly provisioned client** (verified: a fresh tenant onboarded through the normal signup flow comes back `Acctdim_Centrally_Maintained='Y'` with `Project_Acctdim_IsEnable`/`Costcenter_Acctdim_IsEnable`/etc. all `'N'`) — GOClient is the outlier, manually pinned to `'N'` for local/experimental testing. For the default/majority case this tab's toggle has **zero effect** on any document regardless of the fix above. See ETP-4854 for the proposed fix (unify every client to `'N'`, two-front onboarding gap).

### Cuentas generales

The `C_AcctSchema_GL` row (AD window `125`, tab `200` "General Accounts"), added in ETP-4452. Three sections:

1. **Cuentas de suspenso** — `suspenseBalancingUse` toggle + `suspenseBalancing` account. The suspense error pair (`suspenseErrorUse` / `suspenseError`, `C_AcctSchema_GL.UseSuspenseError` / `SuspenseError_Acct`) is **not exposed** (ETP-5682): Etendo core loads it in `AcctSchema.java` but posting never uses it, so the switch and its account have no effect. Both are `discarded` in `decisions.json`; the columns stay in core.
2. **Balanceo de moneda** — `currencyBalancingUse` toggle + `currencyBalancingAcct` account.
3. **Cierre de ejercicio** — `retainedEarning`, `incomeSummary`, `cFSOrderAccount` accounts, plus the `createClosing` ("Revertir saldos de cuentas permanentes al cierre") toggle.

**Each account selector follows its own toggle (ETP-5682)**, matching the AD display logic (`@UseSuspenseBalancing@='Y'`, `@UseCurrencyBalancing@='Y'`): the selector is shown only while its toggle is on, immediately, without saving. Turning a toggle off only **hides** the selector — the stored account is kept (Classic behavior) and posting reads it only while the flag is on.

**While a toggle is on, its account is required (ETP-5724).** Core posting (`AcctSchema.java`) silently treats "switch on, no account" as off, so the row is refused instead: the selector shows the required marker and cannot be cleared, and `Guardar cambios` with the account empty is blocked on this tab with a required error under the selector. The backend enforces the same rule on every NEO channel that can write the row (REST single and MCP; batch only creates, and creating is closed) for both write paths — the aggregate save (`GeneralLedgerConfigurationHandler`) and a generic PUT/PATCH on `Cuentas generales` (`GeneralLedgerAccountsHandler` → `GeneralLedgerBalancingRule`) — answering `400 MISSING_REQUIRED_FIELDS` with `fields: ["suspenseBalancing"]` / `["currencyBalancingAcct"]`. If the backend refuses a save the page could not foresee (e.g. the account was cleared over the API meanwhile), the page marks the account, jumps to this tab and shows a translated "complete all required fields" toast. `Cuentas generales` cannot be created or deleted through the API (`methods: GET, GETBYID, PUT, PATCH` in `decisions.json` → native `405`, and MCP does not offer create/delete for it): its single row comes from the ledger setup and the window cannot load without it.

Asymmetries that are intended (do not log them as bugs):

- **Classic still accepts** a switch on without its account (unchanged on purpose).
- A row that is **already broken** blocks every aggregate save, even one that only edits `General`; a generic CRUD write to `Valores por defecto` / `Dimensiones` is not blocked.
- A **stale** PUT/PATCH on a broken row answers the 400 before the 409 (the pre-hook runs before the stale-record check).
- A stored account missing from the account list shows empty, required and not clearable (pre-existing).

`Active` (`IsActive` on `C_AcctSchema_GL`) is not surfaced in this tab — it mirrors the window-level `Active` flag and is marked `system` in `decisions.json`.

## Current Technical State

- Custom page: `tools/app-shell/src/windows/custom/general-ledger-configuration/`
- Artifact: `artifacts/general-ledger-configuration/`
- Registration already present in `menu.json`, `registry.js`, and `cli/config/regen-windows.json`
- Generic components promoted from this work:
  - `AccountSelect` (was `AccountBadgeSelect` until ETP-5681)
  - `ToggleRow`

## Known Gaps

- **Generic CRUD on `Valores por defecto` / `Dimensiones` bypasses the aggregate's rules** (required defaults, mandatory and locked dimensions), and POST/DELETE on `Valores por defecto` can leave the window unable to load. Follow-up of ETP-5724, not fixed there.

Any change to `ETGO_SF_*` for this window needs `make regen ONLY=general-ledger-configuration PUSH_TO_NEO=1` and then, in the Etendo root:

```bash
./gradlew export.database
```

## Manual Verification

1. Start the app and open `/general-ledger-configuration`.
2. Confirm the tab order and labels match the Figma: `General`, `Valores por defecto`, `Dimensiones`, `Cuentas generales`.
3. On **General**, verify the first row renders as 2 columns on wide screens: name, organization. `gAAP` (Esquema contable) and `Criterio contable` (accrual) are intentionally not shown — `gAAP` is set at schema creation time, `Criterio contable` is fixed to Devengo (ETP-5372); neither is editable from this form.
4. Confirm `Organización` and `Calendario fiscal` are read-only and show the muted `AD_OrgInfo` origin hint.
5. Edit `Nombre del esquema` and confirm `Guardar cambios` enables.
6. Clear a required field (`Nombre del esquema` or `Moneda principal`) and confirm inline required validation appears on save.
7. On **Valores por defecto**, confirm all 9 groups render (`Banco`, `Diario`, `Contactos`, `Impuestos`, `Producto`, `Activos`, `Proyecto`, `Almacén`, `Otras cuentas` — 39 fields total) and required account selectors show the required marker (20 fields, up from the previous 6). Confirm `paymentSelection` no longer renders at all, `disposalGain`/`disposalLoss` render under `Otras cuentas` (not `Activos`, and with no info-icon hint — that mechanism was retired), and that none of the 10 AD-inactive fields (see list above) render at all.
8. On **Dimensiones**, confirm optional rows can be toggled and mandatory rows stay enabled/read-only (cannot be turned off). Deactivate an optional dimension, save, and reload the window — the row must still be present and shown as inactive, not disappear. Confirm the list never shows a row for Organización (`OO`), Cuenta (`AC`), Contacto (`BP`) or Producto (`PR`) — the first two are Etendo's built-in mandatory dimensions, and Contacto/Producto are locked always-on per ETP-4879 (same as `U1`/`U2`) — while Proyecto (`PJ`) and Centro de coste (`CC`) remain visible and toggleable.
9. On **Cuentas generales**, confirm the three sections render and the two toggle+account pairs (suspense balancing, currency balancing) behave independently, and that no suspense error switch or account is shown: with a toggle off its account selector is hidden; turning it on shows it at once; turning it off again hides it, and turning it back on shows the same account (ETP-5682). Then turn a toggle on, leave its account empty and save: the save is blocked and the account shows the required marker and a required error (ETP-5724); pick an account and the save goes through.
10. Top bar (ETP-5736): in DevTools the bar (`glc-toolbar`) is 56px with 8px padding and its bottom rule is an inset `box-shadow` (no border); the tab group is 40px with 32px tabs (14px/24px, medium); `Guardar cambios` is 40px. Editing a field does not change the bar height. Compare with the Factura de venta form toolbar (`/sales-invoice/new`): same bar height, padding and rule.

## Test Design

The Confluence Group 11 checklist is obsolete for this story because the checklist concept was removed. QA should validate the Figma-driven 4-tab form instead.

Core acceptance coverage should include at least these scenarios:

1. **Tab shell fidelity**
   Confirm the route loads, the 4 tabs render in order, and the save button starts disabled.
2. **Dirty state and validation**
   Editing a backed field enables save; missing required fields block save and focus the user back on the first failing tab.
3. **Backed vs read-only behavior**
   Backed fields are interactive and `AD_OrgInfo` fields are read-only.
4. **Defaults grouping**
   All nine account groups render and the required selectors (`Cuenta a cobrar`, `Cuenta a pagar`, `IVA repercutido`, `IVA soportado`, plus the required bank accounts) validate correctly.
5. **Dimensions toggles**
   Toggling `IsActive` rows updates dirty state, and a deactivated dimension survives the next reload (does not disappear).
6. **General accounts round trip**
   The three `Cuentas generales` sections load and save independently of the other tabs.

Current automated coverage:

- `e2e/tests/flows/accounting/general-ledger-configuration.mocked.spec.js`
  captures the tabs as a visual-review seed in mock mode, drives the dirty-state save, the
  account selectors and the dimension toggles, and asserts the top bar's sizes (ETP-5736: bar
  56px with an inset rule, tab group 40px, tabs 32px, Save 40px).

Recommended next automated additions once backend/save work starts:

1. Mocked behavioral Playwright coverage for validation and dirty-state save.
2. Component-level tests for `Field` and the inverted `AutoPeriodControl` toggle binding.
3. Integration coverage for the real multi-entity save contract once the NEO handler exists.

## Account selectors — ETP-5681

Account names were cut off in **Valores por defecto** ("Socios por desembols...",
"Partidas pendi..."): every account field used `AccountBadgeSelect`, a hand-built popover exactly
as wide as its ~330 px grid cell that truncated each option. Both account tabs now use
`AccountSelect` (`tools/app-shell/src/components/contract-ui/AccountSelect.jsx`): the field is a
button showing the selected account, and clicking it opens the shared centered **search popup**
(`SearchPopup.jsx`, the same one the report filters use for "Desde la cuenta"):

- options read `"<code> - <name>"` (`accountOptionLabel`), the same string the generic
  ValidCombination selector returns, so an account reads identically here and in every generated
  accounting tab; search matches code or name;
- the popup is wide and long names wrap instead of being cut off;
- required fields cannot be cleared; optional ones show an ✕ that clears to `null`.

The catalog (`catalogs.accounts` of `GET /general-ledger-configuration/General`) now lists
**posting accounts only**: `GeneralLedgerConfigurationHandler` builds it through
`PostingAccountCombinations.forSchema()` (`com.etendoerp.go`), which drops combinations whose
account is a summary (heading) account or inactive — a default account must be one that can be
posted to. Local check: 662 → 661 accounts (the `640` heading gone, `64000000` kept).

Manual check: open **Valores por defecto**, click any account field → a centered popup with full
names; typing a code (`572`) or a word (`puente`) filters; no summary heading (e.g. `640`) is offered.

## Tenant-scoped ids on save — ETP-5722

`GET`/`POST /general-ledger-configuration/General` (REST and MCP) only accept ids of the caller's own
tenant, or of client 0. This covers every account in `generalAccounts` and `defaults`, `general.currency`,
and `selectedOrgId` (query, or POST body). An id of another tenant gets the same 400 as a missing one:
*Accounting combination / Currency / Organization not found: &lt;id&gt;*. Before, these ids were written
into the other tenant's ledger setup. The UI never sends such ids, because its selectors are already
tenant-scoped, so nothing changes on screen.

Any 400/500 from this endpoint now rolls back the whole request, so a body is never half-saved.
Before, a valid `general.name` plus a bad account answered 400 and still renamed the ledger.

Backend detail: `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` (example "tenant-scoped
ids (ETP-5722)").

## ETP-5693 — Posting accounts only, on write

Saving an account field of the Defaults and General Accounts tabs now refuses a summary (heading) account, an inactive account or combination, and an account of another accounting schema than the row's; on update the row's accounting schema cannot change. The account selectors already hide those accounts (ETP-5681), so in the UI this only shows up in a race, as a translated toast (`backendError.accountIsSummary` / `accountIsInactive` / `accountWrongLedger` / `ledgerNotUpdatable`); REST and MCP callers get a 400 whose text names the field and the account. A value already stored is not re-checked, so existing rows stay saveable. Backend: `PostingAccountGuard` via `GeneralLedgerConfigurationHandler` (aggregate save, rolled back on refusal) and the `@NeoExtension` handlers of the generic `Valores por defecto` / `Cuentas generales` entities (`com.etendoerp.go`, see `neo-headless.md`).

Error display: a failed save used to show nothing (the page had no `catch`). `useGeneralLedgerConfig.save` now throws with the backend message and body (`throwHttpError`), and `GeneralLedgerConfigPage` shows it as a toast translated by `messageKeys` (any backend error, not only these).
