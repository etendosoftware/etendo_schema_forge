# Figma visual spec — Configuración contable (window 125)

> Source: Figma node `5028-50969` (SaaS Etendo 2025). MCP has no read access to the file, so this
> markdown is the canonical visual reference for agents building the UI. Derived from 4 approved
> screenshots (General · Valores por defecto · Dimensiones · Documentos). **Figma wins** over the
> Claude Design prototype. Build as a `layoutType: custom` window (fiscal-config pattern).

## Global frame (all tabs)
- **Header bar**: window title **"Configuración contable"** with a kebab (⋮) affordance next to it;
  breadcrumb below: **"Tesorería / Configuración contable"**. (Global search + AI/＋/🔔 icons belong to
  the app shell, not this window.)
- **Tab bar** (left-aligned pills): **General · Valores por defecto · Dimensiones · Documentos**.
  The "Documentos" tab shows a count badge **"8"**.
- **Right side of the tab row**: an overflow (⋮) button and a primary button **"✓ Guardar cambios"**.
  The Guardar button is **disabled/greyed when the form is not dirty**, enabled on change.
- **Card surface**: white rounded container on a light-grey page; generous padding.
- Section pattern: a **left column** with the section **title** (bold) + a small grey **subtitle/description**,
  and a **right area** with the fields laid out in a responsive grid (up to 4 columns on wide screens).
- Required fields show a **red asterisk** `*` after the label. Inline validation errors render in **red**
  below the field (example on General: *"La fecha de inicio no puede ser posterior a la fecha de cierre."*),
  and the offending field gets a **red border**.

## Tab 1 — General
Three stacked sections, divided by hairline rules.

1. **Identidad del esquema** — subtitle "Configuración básica del esquema contable."
   Fields (row of selects/inputs):
   - **Nombre del esquema** \* — select/input, e.g. "Contabilidad España — EUR"
   - **Esquema contable** \* — select, e.g. "PGC 2007 · España"
   - **Organización** — select, e.g. "Todas las organizaciones"
   - **Criterio contable** — select, e.g. "Devengo"
   - **Descripción** — full-width input below, e.g. "Esquema contable PGC 2007 para operaciones nacionales en España."

2. **Calendario y moneda**
   - **Calendario fiscal** \* — select, e.g. "Ejercicio 2026 · Ene–Dic" (this is the field showing the red validation error in the mock)
   - **Moneda principal** \* — select, e.g. "EUR — Euro"
   - **Tipo de conversión** — select, e.g. "Spot · BCE diario"
   - **Precisión de costes** — select, e.g. "2 decimales"

3. **Políticas contables** — subtitle "Reglas que afectan el registro y cálculo contable."
   **Three iOS-style toggle switches**, each with a label and optional grey sub-caption:
   - **Asientos en periodos cerrados** — OFF in mock. (Backed by `AutoPeriodControl`.)
   - **Conciliación automática** — ON in mock. ⚠️ **UNBACKED placeholder** — mark visually as non-functional.
   - **Numeración de asientos** — ON in mock; sub-caption "Automática por diario". ⚠️ **UNBACKED placeholder** — mark visually as non-functional.
   > "Mark as non-functional" = a subtle indicator the value isn't persisted (e.g. a small "no guardado"/
   > "sin conexión a datos" helper text or an info icon with tooltip). Decide a clean treatment; it must be
   > obvious to a developer/QA that these two don't save, without shouting at the end user.

## Tab 2 — Valores por defecto
**Account selector** control style (reused across this tab): a pill showing a **grey rounded code badge**
(e.g. `5723`) followed by the **account name** (e.g. "Bancos, cuenta puente"), with a dropdown chevron.
Four labeled groups (the 4th, "Otras cuentas", is the approved addition not shown in the mock):

1. **Tesorería y banco** — subtitle "Cuentas utilizadas para movimientos de efectivo y conciliación bancaria."
   Examples in mock: Banco en tránsito `5723 Bancos, cuenta puente`; Gastos bancarios `626 Servicios bancarios`;
   Gastos financieros `662 Intereses de deudas`; Activo de banco `572 Bancos c/c`; Ingresos financieros
   `769 Otros ingresos financieros`.
2. **Clientes y proveedores**
   Cuenta a cobrar \* `430 Clientes`; Cuenta a pagar \* `400 Proveedores`; Anticipos de clientes
   `438 Anticipos de clientes`; Anticipos a proveedores `407 Anticipos a proveedores`; Dto. pronto pago
   concedido `665 Descuentos s/ventas por pp`; Dto. pronto pago obtenido `765 Descuentos s/compras por pp`.
3. **Impuestos**
   IVA repercutido \* `477 H.P. IVA repercutido`; IVA soportado \* `472 H.P. IVA soportado`; Gasto por
   impuesto `631 Otros tributos`.
4. **Otras cuentas** — the ~16 product / warehouse / asset / project `*_Acct` defaults (not in the mock).

## Tab 3 — Dimensiones
Single section **"Dimensiones contables"** — subtitle "Reglas que afectan el registro y cálculo contable."
A vertical list of **toggle rows**, each: switch + label + grey sub-caption describing obligation/scope.
From the mock (ON unless noted):
- **Centro de coste** — ON — "Obligatorio · Facturas y asientos"
- **Producto** — ON — "Opcional · Ventas y compras"
- **Proyecto** — ON — "Opcional · Todos los documentos"
- **Campaña** — OFF
- **Activo fijo** — OFF
- **Región de ventas** — OFF
> Toggle = `IsActive`; the sub-caption combines `IsMandatory` ("Obligatorio"/"Opcional") + a scope phrase.

## Tab 4 — Documentos  (READ-ONLY)
A **table**, three columns:
- **Tipo de documento** (bold) — e.g. Factura de venta, Factura de compra, Nota de crédito (venta),
  Nota de crédito (compra), Cobro, Pago, Asiento manual, Amortización.
- **Cuenta / Diario contable** — an account badge `code name` (e.g. `700 Ventas de mercaderías`), OR a plain
  label for journals (e.g. "Diario general" for Asiento manual — no code badge).
- **Estado** — a **green "Mapeado"** status chip.
No edit controls; this tab is informational. The tab pill carries the count badge ("8").

## Field data-binding treatment (LOCKED — General tab)
The General tab mixes backed, read-only-from-elsewhere, and unbacked fields. Bind exactly as below.

| Field | Treatment |
|---|---|
| Nombre del esquema | **editable** → `name` (required) |
| Esquema contable | **intentionally hidden** — `gAAP` is set at schema-creation time; not editable from this window. Field present in contract but omitted from the custom form. |
| Criterio contable | **editable select** → `accrual` (`IsAccrual` bool → Devengo/Caja) |
| Descripción | **editable** → `description` |
| Moneda principal | **editable select** → `currency` (required) |
| Asientos en periodos cerrados | **editable toggle** → `automaticPeriodControl`, **bound INVERTED** (toggle ON ⇒ `AutoPeriodControl = N`) so the label stays truthful |
| **Calendario fiscal** | **READ-ONLY**, real value read from `AD_OrgInfo.C_Calendar_ID` (Phase-3 backend supplies it). Not editable here. The red start/end validation in the mock is just a mock state — for read-only, show the value. |
| **Organización** | **READ-ONLY**, real value from `AD_OrgInfo` (schema→org scope). Not editable here. |
| **Tipo de conversión** | **non-functional placeholder**, marked unbacked (no AD column). |
| **Precisión de costes** | **non-functional placeholder**, marked unbacked (only `CostingMethod` exists, discarded). |
| Conciliación automática | **non-functional placeholder**, marked unbacked. |
| Numeración de asientos | **non-functional placeholder**, marked unbacked. |

> 4 marked placeholders total (2 selects + 2 toggles). 2 read-only-from-`AD_OrgInfo`. Everything else backed/editable.
> Other tabs: Valores por defecto = editable selectors (4 groups); Dimensiones = editable toggles; Documentos = fully read-only.

## Component inventory for the Developer
- `TabBar` (4 tabs, count badge support) — fiscal-config has a `TabBar.jsx` to model after.
- **AccountBadgeSelect** — code-badge + name dropdown (promote to generic `contract-ui` if clean).
- **ToggleRow / ToggleGroup** — switch + label + sub-caption; supports an "unbacked/non-functional" variant.
- **DocumentMappingTable** — read-only table with account badge + status chip.
- Section shell — left title/subtitle + right field grid; required `*`, inline error, red border.
- Dirty-state primary "Guardar cambios" button in the tab row.
- All strings via i18n (`useUI`/`useLabel`/`useMenuLabel`), keys in BOTH `en_US.json` + `es_ES.json`.
- Consult `docs/ui-design-guidelines.md` (z-index, overlays, column alignment) and `docs/ui-customization.md`.
