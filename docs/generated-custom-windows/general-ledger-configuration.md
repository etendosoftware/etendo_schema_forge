# General Ledger Configuration

> **Story:** ETP-4246.
> AD window `125` (`General Ledger Configuration` / `Configuración contable`).

## Intent

Expose the accounting schema setup as a focused 4-tab custom window aligned to the approved Figma, not the earlier Claude design. The window concentrates the day-to-day schema configuration surface into:

- **General**
- **Valores por defecto**
- **Dimensiones**
- **Documentos**

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

Editable account selectors grouped into 4 sections:

1. `Tesorería y banco`
2. `Clientes y proveedores`
3. `Impuestos`
4. `Otras cuentas`

The fourth group is intentional even though it is not shown in the Figma screenshot: it exposes the real `C_AcctSchema_Default` account set that would otherwise be hidden.

### Dimensiones

Editable toggle list over `C_AcctSchema_Element` rows.

- Toggle state maps to `IsActive`
- Caption combines mandatory/optional with business scope text
- `Withholding_Acct` stays out of scope
- Mandatory dimensions are visible but cannot be deactivated from this UI.

### Documentos

Read-only mapping table.

- Column 1: document type
- Column 2: account badge or plain journal label
- Column 3: green `Mapeado` status chip
- No inline editing

The tab badge shows the current mock count (`8`).

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
2. Confirm the tab order and labels match the Figma: `General`, `Valores por defecto`, `Dimensiones`, `Documentos`.
3. On **General**, verify the first row renders as 4 columns on wide screens: name, organization, accounting criteria. `gAAP` (Esquema contable) is intentionally not shown — it is set at schema creation time and is not editable from this form.
4. Confirm `Organización` and `Calendario fiscal` are read-only and show the muted `AD_OrgInfo` origin hint.
5. Confirm the 4 unbacked controls are visibly marked but not styled like blocking errors.
6. Edit `Nombre del esquema` and confirm `Guardar cambios` enables.
7. Clear a required field (`Nombre del esquema` or `Moneda principal`) and confirm inline required validation appears on save.
8. On **Valores por defecto**, confirm the 4 groups render and required account selectors show the required marker.
9. On **Dimensiones**, confirm optional rows can be toggled and mandatory rows stay enabled/read-only (cannot be turned off).
10. On **Documentos**, confirm there are no editable controls and every row shows `Mapeado`.

## Test Design

The Confluence Group 11 checklist is obsolete for this story because the checklist concept was removed. QA should validate the Figma-driven 4-tab form instead.

Core acceptance coverage should include at least these scenarios:

1. **Tab shell fidelity**
   Confirm the route loads, the 4 tabs render in order, the save button starts disabled, and the Documentos badge shows the expected count.
2. **Dirty state and validation**
   Editing a backed field enables save; missing required fields block save and focus the user back on the first failing tab.
3. **Backed vs unbacked behavior**
   Backed fields are interactive, `AD_OrgInfo` fields are read-only, and the 4 placeholder controls never pretend to persist.
4. **Defaults grouping**
   All four account groups render and the required selectors (`Cuenta a cobrar`, `Cuenta a pagar`, `IVA repercutido`, `IVA soportado`, plus the required treasury accounts) validate correctly.
5. **Dimensions toggles**
   Toggling `IsActive` rows updates dirty state without affecting the read-only Documentos tab.
6. **Document mappings**
   The table stays informational only, with correct status chips and account/journal rendering.

Current automated coverage:

- `e2e/tests/flows/general-ledger-configuration.mocked.spec.js`
  captures the 4 tabs and provides a visual-review seed in mock mode.

Recommended next automated additions once backend/save work starts:

1. Mocked behavioral Playwright coverage for validation and dirty-state save.
2. Component-level tests for `Field`, `DocumentsTab`, and the inverted `AutoPeriodControl` toggle binding.
3. Integration coverage for the real multi-entity save contract once the NEO handler exists.
