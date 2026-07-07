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

- Menu entry: `Tesorería / Configuración contable`
- Slug: `general-ledger-configuration`
- Window type: `layoutType: custom`
- Top metadata: breadcrumb `Tesorería / Configuración contable`
- Right side of the tab row: dirty-state `Guardar cambios` button

## Tab Behavior

### General

Three sections:

1. **Identidad del esquema**
2. **Calendario y moneda**
3. **Políticas contables**

Backed editable fields:

- `Nombre del esquema` → `name`
- `Criterio contable` → `accrual`
- `Descripción` → `description`
- `Moneda principal` → `currency`
- `Asientos en periodos cerrados` → inverse binding of `AutoPeriodControl`

Hidden-but-kept backend field:

- `Esquema contable` / `gAAP` stays persisted in the ledger but is not user-editable in this custom surface.

Read-only fields sourced from the organization-level backend relation in the delivered implementation:

- `Organización`
- `Calendario fiscal`

Current delivered state:

- both read-only values are loaded from the organization-backed aggregate endpoint
- in the current local dataset that relation resolves from `AD_Org` / `AD_Org_AcctSchema`

Unbacked placeholders, intentionally visible but non-persistent:

- `Tipo de conversión`
- `Precisión de costes`
- `Conciliación automática`
- `Numeración de asientos`

Those controls must stay visually subtle but clearly marked as not connected to data.

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

### Cuentas generales

The `C_AcctSchema_GL` row (AD window `125`, tab `200` "General Accounts"), added in ETP-4452. Three sections:

1. **Cuentas de suspenso** — `suspenseBalancingUse` toggle + `suspenseBalancing` account, plus the standalone `suspenseErrorUse` toggle.
2. **Balanceo de moneda** — `currencyBalancingUse` toggle + `currencyBalancingAcct` account.
3. **Cierre de ejercicio** — `retainedEarning`, `incomeSummary`, `cFSOrderAccount` accounts, plus the `createClosing` ("Revertir saldos de cuentas permanentes al cierre") toggle.

`Active` (`IsActive` on `C_AcctSchema_GL`) is not surfaced in this tab — it mirrors the window-level `Active` flag and is marked `system` in `decisions.json`.

## Current Technical State

- Custom page: `tools/app-shell/src/windows/custom/general-ledger-configuration/`
- Artifact: `artifacts/general-ledger-configuration/`
- Registration already present in `menu.json`, `registry.js`, and `cli/config/regen-windows.json`
- Generic components promoted from this work:
  - `AccountBadgeSelect`
  - `ToggleRow`

## Known Gaps

- No NEO spec or `ETGO_SF_*` config for window `125` yet
- No multi-entity save handler yet
- No real selector/catalog reads yet
- `Guardar cambios` is still a frontend stub over mock state

After the backend wiring lands, remember the Etendo step:

```bash
./gradlew export.database
```

## Manual Verification

1. Start the app and open `/general-ledger-configuration`.
2. Confirm the tab order and labels match the Figma: `General`, `Valores por defecto`, `Dimensiones`, `Cuentas generales`.
3. On **General**, verify the first row renders as 4 columns on wide screens: name, organization, accounting criteria. `gAAP` (Esquema contable) is intentionally not shown — it is set at schema creation time and is not editable from this form.
4. Confirm `Organización` and `Calendario fiscal` are read-only and show the muted `AD_OrgInfo` origin hint.
5. Confirm the 4 unbacked controls are visibly marked but not styled like blocking errors.
6. Edit `Nombre del esquema` and confirm `Guardar cambios` enables.
7. Clear a required field (`Nombre del esquema` or `Moneda principal`) and confirm inline required validation appears on save.
8. On **Valores por defecto**, confirm all 9 groups render (`Banco`, `Diario`, `Contactos`, `Impuestos`, `Producto`, `Activos`, `Proyecto`, `Almacén`, `Otras cuentas` — 39 fields total) and required account selectors show the required marker (20 fields, up from the previous 6). Confirm `paymentSelection` no longer renders at all, `disposalGain`/`disposalLoss` render under `Otras cuentas` (not `Activos`, and with no info-icon hint — that mechanism was retired), and that none of the 10 AD-inactive fields (see list above) render at all.
9. On **Dimensiones**, confirm optional rows can be toggled and mandatory rows stay enabled/read-only (cannot be turned off). Deactivate an optional dimension, save, and reload the window — the row must still be present and shown as inactive, not disappear.
10. On **Cuentas generales**, confirm the three sections render and both toggle+account pairs (suspense balancing, currency balancing) behave independently.

## Test Design

The Confluence Group 11 checklist is obsolete for this story because the checklist concept was removed. QA should validate the Figma-driven 5-tab form instead.

Core acceptance coverage should include at least these scenarios:

1. **Tab shell fidelity**
   Confirm the route loads, the 4 tabs render in order, and the save button starts disabled.
2. **Dirty state and validation**
   Editing a backed field enables save; missing required fields block save and focus the user back on the first failing tab.
3. **Backed vs unbacked behavior**
   Backed fields are interactive, `AD_OrgInfo` fields are read-only, and the 4 placeholder controls never pretend to persist.
4. **Defaults grouping**
   All nine account groups render and the required selectors (`Cuenta a cobrar`, `Cuenta a pagar`, `IVA repercutido`, `IVA soportado`, plus the required bank accounts) validate correctly.
5. **Dimensions toggles**
   Toggling `IsActive` rows updates dirty state, and a deactivated dimension survives the next reload (does not disappear).
6. **General accounts round trip**
   The three `Cuentas generales` sections load and save independently of the other tabs.

Current automated coverage:

- `e2e/tests/flows/general-ledger-configuration.mocked.spec.js`
  captures the tabs and provides a visual-review seed in mock mode.

Recommended next automated additions once backend/save work starts:

1. Mocked behavioral Playwright coverage for validation and dirty-state save.
2. Component-level tests for `Field` and the inverted `AutoPeriodControl` toggle binding.
3. Integration coverage for the real multi-entity save contract once the NEO handler exists.
