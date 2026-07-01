---
tags:
  - etendo
  - devops
  - onboarding
  - seba
created: '2026-06-05'
status: draft
---
# Configuración inicial de un cliente en Etendo GO

> Notas de investigación para Seba — hallazgos al crear un cliente de prueba para validar el comportamiento de impuestos a nivel de sistema (`ad_client_id='0'`).

---

## Contexto

En el modelo SaaS de Etendo GO, los impuestos se provisionan a nivel de sistema (`c_tax.ad_client_id='0'`) para que sean visibles por todos los tenants. Al crear un cliente nuevo para probar el posting de facturas con esos impuestos, el cliente no queda completamente configurado con solo crear el ledger desde la UI.

---

## Tablas del plan contable (General Ledger)

Cuando se crea un cliente nuevo desde la UI de Etendo, la tabla `c_acctschema_table` (30 registros) se genera automáticamente, pero el resto del esquema contable queda vacío. Hay que poblarlo manualmente o correr el proceso "Initial Organization Setup".

| Tabla                  | Propósito                                                | ¿Se crea solo?      |
| ---------------------- | -------------------------------------------------------- | ------------------- |
| `c_acctschema`         | El ledger en sí                                          | ✅ (usuario lo crea) |
| `c_acctschema_table`   | Qué tablas postean a este ledger                         | ✅ automático        |
| `c_element`            | Árbol de cuentas                                         | ❌ vacío             |
| `c_elementvalue`       | Valores del árbol (cuentas contables)                    | ❌ vacío             |
| `c_validcombination`   | Combinaciones contables válidas                          | ❌ vacío             |
| `c_acctschema_element` | Dimensiones (Org, Cuenta, Producto, BP, Proyecto)        | ❌ vacío             |
| `c_acctschema_gl`      | Cuentas GL (suspenso, compensación, resultado ejercicio) | ❌ vacío             |
| `c_acctschema_default` | Cuentas por defecto de todos los tipos de documento      | ❌ vacío             |

### Solución rápida (para pruebas)

Clonar la estructura del cliente GOOrg via SQL:
1. Crear `c_element` para el nuevo cliente (árbol de cuentas)
2. Copiar las ~30 `c_elementvalue` que referencia el ledger de GOOrg (solo las necesarias)
3. Crear `c_validcombination` para el nuevo cliente con los nuevos IDs
4. Insertar 5 dimensiones en `c_acctschema_element` (OO, AC, PR, BP, PJ)
5. Insertar `c_acctschema_gl` (suspenso, cuadre, compensación, resultado)
6. Insertar `c_acctschema_default` con todas las cuentas por defecto

> En producción, usar el proceso "Initial Organization Setup" de Etendo que hace todo esto automáticamente.

---

## Error: "The organization of the lines is different and does not depend on the organization associated with the header"

### Síntoma

Al intentar completar una factura del cliente nuevo, Etendo lanza este error aunque la cabecera y la línea tienen la **misma organización**.

### Causa raíz

La función `AD_ISORGINCLUDED(child_org, parent_org, client_id)` devuelve `-1` (no incluida) para cualquier organización del cliente nuevo, incluso al comparar la organización consigo misma.

Esta función consulta la tabla `AD_ORG_TREE`, que es una caché precalculada de la jerarquía de organizaciones. **Esa tabla queda vacía** porque no se disparó el proceso "Set Organization as Ready" que la puebla.

```sql
-- Verificar: debería devolver 1 (misma org), devuelve -1 si el problema existe
SELECT AD_ISORGINCLUDED(
  'DB294FB926884F33A253D6F0FB28DF8B',  -- TaxesOrg
  'DB294FB926884F33A253D6F0FB28DF8B',  -- TaxesOrg (misma)
  'F226CBA6FFA549F6B8D90FF8064C6727'   -- cliente nuevo
);
```

### Solución

Insertar manualmente los 2 registros que `AD_ORG_TREE` necesita para cada organización:
- **Autoreferencia** (`levelno = 1`): la org se incluye a sí misma
- **Hija del `*`** (`levelno = 2`): la org es hija de la org raíz (`ad_org_id = '0'`)

```sql
INSERT INTO ad_org_tree (
  ad_org_tree_id, ad_client_id, isactive, created, createdby, updated, updatedby,
  ad_org_id, ad_parent_org_id, levelno
) VALUES
  -- Autoreferencia (levelno=1)
  (upper(replace(gen_random_uuid()::text,'-','')),
   '<CLIENT_ID>', 'Y', now(), '0', now(), '0',
   '<ORG_ID>', '<ORG_ID>', 1),
  -- Hija del * (levelno=2)
  (upper(replace(gen_random_uuid()::text,'-','')),
   '<CLIENT_ID>', 'Y', now(), '0', now(), '0',
   '<ORG_ID>', '0', 2);
```

Después de insertar, `AD_ISORGINCLUDED` devuelve `1` (misma org) y `2` (hija del `*`), que es el comportamiento correcto.

---

## Contexto adicional: impuestos a nivel de sistema (`c_tax.ad_client_id='0'`)

### Por qué no aparecían en el selector

El selector de impuestos (`C_Tax_ID`, referencia 158) tiene una regla de validación SQL (`C_Tax_IsSOTrx_Date`) que filtra por `AD_CLIENT_ID = @AD_CLIENT_ID@`. Al resolverse, ese parámetro toma el cliente de la sesión — nunca el cliente `'0'` — y por eso los impuestos de sistema no aparecían.

### Fix implementado en `com.etendoerp.go`

Se creó `SystemClientSelectorRegistry.java` que:
1. Registra los IDs de referencia AD que deben incluir datos del cliente `'0'` (actualmente solo `"158"` — C_Tax)
2. Bypasea el ruteo por `ComboReferenceSelectorExecutor` para esas referencias
3. Expande el predicado `e.client.id = 'X'` → `e.client.id IN ('X', '0')` en el filtro HQL de validación

El resto de la lógica de validación (fecha, tipo SO/PO) sigue aplicando normalmente.

### Escalabilidad

Para añadir otra entidad que necesite ver datos de cliente `'0'`, basta con agregar su `AD_Reference.id` al set `SYSTEM_CLIENT_REFS` en `SystemClientSelectorRegistry.java`.

---

## Control de períodos y calendario fiscal

### Campos involucrados (tabla `ad_org`)

| Campo | Propósito | Valor correcto |
|-------|-----------|----------------|
| `isperiodcontrolallowed` | Habilita el control de períodos | `'Y'` |
| `ad_periodcontrolallowed_org_id` | Org que controla los períodos (autorreferencia) | mismo `ad_org_id` |
| `c_calendar_id` | Calendario fiscal asociado | ID del calendario de la org |

Cuando se crea una organización nueva, estos tres campos quedan vacíos/en `'N'`. Al intentar completar un documento Etendo lanzará un error de período si no están configurados.

### El calendario debe tener años y períodos

Verificar que el calendario tenga al menos el año en curso con sus 12 períodos:

```sql
SELECT cy.c_year_id, cy.year, count(cp.c_period_id) as periodos
FROM c_year cy
LEFT JOIN c_period cp ON cp.c_year_id = cy.c_year_id
WHERE cy.c_calendar_id = '<CALENDAR_ID>'
GROUP BY cy.c_year_id, cy.year;
```

### Fix SQL

```sql
UPDATE ad_org
SET isperiodcontrolallowed         = 'Y',
    ad_periodcontrolallowed_org_id = '<ORG_ID>',  -- autorreferencia
    c_calendar_id                  = '<CALENDAR_ID>',
    updated                        = now(),
    updatedby                      = '100'
WHERE ad_org_id = '<ORG_ID>';
```

> En producción esto se configura desde la UI en **Organización > General > Control de períodos**.

---

## Árbol de cuentas completo

Al clonar vía SQL solo se copian las ~30 cuentas que referencia el ledger fuente en sus tablas `c_acctschema_gl` y `c_acctschema_default`. El árbol completo (1790 cuentas en el caso de GOOrg) queda incompleto.

**Hay que copiar TODAS las cuentas del árbol fuente**, no solo las referenciadas por defecto:

```sql
INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical,
  isbankaccount, isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT
  upper(replace(gen_random_uuid()::text, '-', '')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  ev.value, ev.name, ev.description, ev.accounttype, ev.accountsign,
  coalesce(ev.isdoccontrolled, 'N'), '<NEW_ELEMENT_ID>',
  ev.issummary, ev.postactual, ev.postbudget, ev.postencumbrance, ev.poststatistical,
  coalesce(ev.isbankaccount,'N'), coalesce(ev.isforeigncurrency,'N'),
  coalesce(ev.showelement,'Y'), ev.showvaluecond, ev.elementlevel, ev.isalwaysshown
FROM c_elementvalue ev
WHERE ev.c_element_id = '<SOURCE_ELEMENT_ID>';
-- Si ya se copiaron algunas, filtrar: AND ev.value != ALL(ARRAY['12901','28200',...])
```

### Cuenta por defecto en la dimensión Account

En la subtab **Dimensión** del ledger, la dimensión `AC` (Account) tiene un campo "Cuenta" que debe apuntar a la cuenta por defecto del plan. En GOOrg es `90030 - Cuenta por defecto`.

Actualizar después de tener todas las cuentas copiadas:

```sql
-- 1. Obtener el ID de la cuenta 90030 del nuevo cliente
SELECT c_elementvalue_id FROM c_elementvalue
WHERE ad_client_id = '<NEW_CLIENT_ID>' AND value = '90030';

-- 2. Asignarlo a la dimensión AC del ledger
UPDATE c_acctschema_element
SET c_elementvalue_id = '<EV_ID_90030>'
WHERE c_acctschema_id = '<SCHEMA_ID>' AND elementtype = 'AC';
```

---

## Control de períodos: tipos de documento por período (`c_periodcontrol`)

### Comportamiento esperado

Cuando se inserta un período en `c_period`, el trigger `c_period_trg()` crea automáticamente un registro `c_periodcontrol` por cada tipo de documento (`docbasetype`), con `periodstatus='N'` (Never Opened). Luego, desde la UI se abre manualmente período a período con el botón **Open Period**, que cambia el estado a `'O'`.

### Por qué falló en TaxesOrg — dos causas simultáneas

El trigger `c_period_trg()` tiene esta condición para determinar a qué organizaciones crear los registros:

```sql
WHERE o.ISREADY = 'Y'
  AND o.ISPERIODCONTROLALLOWED = 'Y'
  AND exists (
    SELECT 1 FROM C_Year, c_calendar
    WHERE C_Year.c_calendar_id = c_calendar.c_calendar_id
    AND c_calendar.c_calendar_id = o.ad_inheritedcalendar_id   -- ← ojo: campo heredado
    AND C_Year.C_Year_ID = new.C_Year_ID
  )
```

**Causa 1 — orden de operaciones:** el calendario y sus períodos se crearon desde la UI *antes* de setear `isperiodcontrolallowed='Y'` en la organización (lo hicimos después via SQL). Cuando el trigger disparó al insertar cada período, la condición `ISPERIODCONTROLALLOWED='Y'` era falsa → no creó nada.

**Causa 2 — `ad_inheritedcalendar_id` nulo:** el trigger no usa `c_calendar_id` sino `ad_inheritedcalendar_id`. Este campo quedó vacío porque Etendo lo puebla solo al configurar el calendario desde la UI correctamente. Aunque se hubiera respetado el orden, el trigger igualmente hubiera fallado.

### Campos que deben estar seteados ANTES de crear el calendario

```sql
UPDATE ad_org
SET isperiodcontrolallowed         = 'Y',
    ad_periodcontrolallowed_org_id = '<ORG_ID>',
    c_calendar_id                  = '<CALENDAR_ID>',
    ad_inheritedcalendar_id        = '<CALENDAR_ID>',   -- ← crítico para el trigger
    updated   = now(),
    updatedby = '100'
WHERE ad_org_id = '<ORG_ID>';
```

Si los períodos ya existen y los registros no se crearon, hay que insertarlos manualmente con `periodstatus='N'` (Never Opened):

```sql
INSERT INTO c_periodcontrol (
  c_periodcontrol_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby,
  c_period_id, docbasetype, periodstatus, periodaction, processing, openclose
)
SELECT
  upper(replace(gen_random_uuid()::text, '-', '')),
  '<NEW_CLIENT_ID>', '<NEW_ORG_ID>', 'Y',
  now(), '100', now(), '100',
  dst_p.c_period_id,
  pc.docbasetype,
  'N',    -- Never Opened (estado inicial correcto)
  'N',
  'N', 'N'
FROM c_periodcontrol pc
JOIN c_period src_p ON src_p.c_period_id = pc.c_period_id
JOIN c_year   src_y ON src_y.c_year_id   = src_p.c_year_id
JOIN c_year   dst_y ON dst_y.c_calendar_id = '<NEW_CALENDAR_ID>' AND dst_y.year = src_y.year
JOIN c_period dst_p ON dst_p.c_year_id = dst_y.c_year_id AND dst_p.name = src_p.name
WHERE src_y.c_calendar_id = '<SOURCE_CALENDAR_ID>'
  AND pc.ad_org_id = '<SOURCE_ORG_ID>'
  AND NOT EXISTS (
    SELECT 1 FROM c_periodcontrol x
    WHERE x.c_period_id = dst_p.c_period_id
      AND x.docbasetype = pc.docbasetype
      AND x.ad_org_id = '<NEW_ORG_ID>'
  );
```

Resultado esperado: 43 tipos de documento × 12 períodos = **516 registros** en estado `Never Opened`. Luego abrir manualmente desde la UI con **Open Period**.

---

## Default org del usuario admin creado: `*` vs org propia

### Síntoma

Al abrir los Modelos Fiscales (303/349) con un usuario del tenant nuevo, los handlers fallan con:
- `No AcctSchema found for client=0`
- `No periods found for org=0`
- NPE en `AEAT3492010ReportDao.getOrgTaxID()` porque no existe `AD_OrgInfo` para org `'0'`

### Causa raíz

El usuario del tenant tiene `AD_User.ad_org_id = '0'` (la org `*`). El `NeoAuthenticator` lee el `orgId` directamente del claim `organization` del JWT, y ese JWT se genera en el login con el `AD_User.ad_org_id` del usuario. Por eso `OBContext.getCurrentOrganization().getId()` devuelve `'0'`.

> [!note] Distinción importante
> El "Organización: TaxesOrg" visible en la UI del rol es el `AD_Role_OrgAccess` — qué orgs puede acceder el rol — **no** la org activa de sesión. Son dos conceptos distintos.

Los handlers fiscales usan ese `orgId` para buscar períodos, `AD_OrgInfo`, `AcctSchema`, etc. — todo dato que solo existe en la org concreta del tenant, no en `*`.

```sql
-- Verificar: el usuario admin del tenant nuevo tiene org='*'
SELECT au.name, au.username, au.ad_org_id, ao.name AS org_name
FROM ad_user au
JOIN ad_org ao ON au.ad_org_id = ao.ad_org_id
WHERE au.ad_client_id = '<NEW_CLIENT_ID>';
-- resultado esperado si el problema existe: ad_org_id='0', org_name='*'
```

### Recomendación para el proceso de alta de cliente

**El usuario admin del nuevo tenant debería tener `ad_org_id` apuntando a la org propia del tenant**, no a `'0'`. Esto se puede corregir:

**Opción A — SQL post-setup:**
```sql
UPDATE ad_user
SET ad_org_id = '<NEW_ORG_ID>',
    updated   = now(),
    updatedby = '100'
WHERE ad_client_id = '<NEW_CLIENT_ID>'
  AND ad_org_id = '0';
```

**Opción B (recomendada para producción):** El proceso de onboarding automatizado debería ejecutar esta actualización como parte del flujo de alta.

### Fix en código (defense-in-depth)

Se agregó `resolveEffectiveOrg()` en `AbstractFiscalHandler` que, cuando la org de sesión es `'0'`, busca la primera org hoja (no-summary) del cliente actual:

```java
protected String resolveEffectiveOrg() {
    String orgId = OBContext.getOBContext().getCurrentOrganization().getId();
    if (!"0".equals(orgId)) return orgId;
    String clientId = OBContext.getOBContext().getCurrentClient().getId();
    List<Organization> orgs = OBDal.getInstance().getSession()
        .createQuery("from Organization where client.id = :clientId and isSummary = 'N' "
            + "and id != '0' order by name", Organization.class)
        .setParameter("clientId", clientId)
        .setMaxResults(1).list();
    if (orgs.isEmpty()) throw new OBException("No leaf org for client=" + clientId);
    return orgs.get(0).getId();
}
```

Este fix es necesario aunque se corrija el setup del usuario: en SaaS, es probable que futuros clientes tengan usuarios con `*` como org y el handler debe ser robusto.

### Orden de operaciones actualizado

Agregar al final del checklist:

16. **Setear `ad_org_id` del usuario admin** al org propio del tenant (no `'0'`).

---

## Pendiente: comportamiento del posting con `c_tax_acct` multi-cliente

Un impuesto del sistema (`c_tax.ad_client_id='0'`) puede tener múltiples registros `c_tax_acct`, uno por cliente (cada uno con su configuración contable propia). **Aún no está validado** si el motor de posting de Etendo resuelve correctamente el `c_tax_acct` del cliente actual al postear una factura con un impuesto de sistema.

> Ver tarea pendiente en ETP-4177.


---

## Update 2026-06-09 — Cuentas contables de grupos y categorías

### Síntoma

Al intentar postear una factura del cliente nuevo se obtiene:

> `Account Not Defined For: Account || Owner: Entity || Accounting Schema: AccountingSchema`

Aunque `c_acctschema_default` y `c_tax_acct` estén correctamente definidos.

### Causa

El engine de posting de Etendo **no hace fallback al `c_acctschema_default`** para resolver las cuentas de grupos de terceros ni de categorías de producto. Necesita filas propias en:

| Tabla | Qué resuelve | ¿Creado automáticamente? |
|-------|-------------|--------------------------|
| `c_bp_group_acct` | Cuenta de clientes/proveedores por grupo de tercero y schema | ❌ |
| `m_product_category_acct` | Cuenta de ingresos/gastos por categoría de producto y schema | ❌ |

### Fix SQL

Ejecutar **después** de crear el ledger (`c_acctschema`) y los defaults (`c_acctschema_default`):

```sql
-- Para cada c_bp_group del cliente nuevo:
INSERT INTO c_bp_group_acct (
  c_bp_group_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bp_group_id, c_acctschema_id,
  c_receivable_acct, c_prepayment_acct,
  v_liability_acct, v_liability_services_acct, v_prepayment_acct,
  paydiscount_exp_acct, writeoff_acct, paydiscount_rev_acct, writeoff_rev_acct,
  notinvoicedreceivables_acct, notinvoicedrevenue_acct, notinvoicedreceipts_acct,
  unearnedrevenue_acct
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  g.c_bp_group_id, '<NEW_SCHEMA_ID>',
  d.c_receivable_acct, d.c_prepayment_acct,
  d.v_liability_acct, d.v_liability_services_acct, d.v_prepayment_acct,
  d.paydiscount_exp_acct, d.writeoff_acct, d.paydiscount_rev_acct, d.writeoff_rev_acct,
  d.notinvoicedreceivables_acct, d.notinvoicedrevenue_acct, d.notinvoicedreceipts_acct,
  d.unearnedrevenue_acct
FROM c_bp_group g, c_acctschema_default d
WHERE g.ad_client_id = '<NEW_CLIENT_ID>'
  AND d.c_acctschema_id = '<NEW_SCHEMA_ID>';

-- Para cada m_product_category del cliente nuevo:
INSERT INTO m_product_category_acct (
  m_product_category_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  m_product_category_id, c_acctschema_id,
  p_revenue_acct, p_expense_acct, p_cogs_acct, p_asset_acct,
  p_purchasepricevariance_acct, p_invoicepricevariance_acct,
  p_tradediscountrec_acct, p_tradediscountgrant_acct,
  p_revenue_return_acct, p_cogs_return_acct
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  c.m_product_category_id, '<NEW_SCHEMA_ID>',
  d.p_revenue_acct, d.p_expense_acct, d.p_cogs_acct, d.p_asset_acct,
  d.p_purchasepricevariance_acct, d.p_invoicepricevariance_acct,
  d.p_tradediscountrec_acct, d.p_tradediscountgrant_acct,
  d.p_revenue_return_acct, d.p_cogs_return_acct
FROM m_product_category c, c_acctschema_default d
WHERE c.ad_client_id = '<NEW_CLIENT_ID>'
  AND d.c_acctschema_id = '<NEW_SCHEMA_ID>';
```

### Orden de operaciones (actualizado)

Agregar estos dos pasos al final del checklist original:

10. Abrir períodos desde la UI
11. **Crear filas en `c_bp_group_acct`** para cada grupo de tercero × schema
12. **Crear filas en `m_product_category_acct`** para cada categoría de producto × schema


### Corrección al update anterior — `c_bp_customer_acct` / `c_bp_vendor_acct`

El `c_bp_group_acct` **no es suficiente**. `AcctServer.getAccountBPartner()` busca en `c_bp_customer_acct` (facturas de venta) y `c_bp_vendor_acct` (facturas de compra) por BP individual. Si no hay fila para ese BP + schema, lanza `IllegalStateException: null` aunque el grupo tenga su acct configurado.

Agregar también al SQL de provisioning:

```sql
-- c_bp_customer_acct para todos los customers del nuevo cliente
INSERT INTO c_bp_customer_acct (
  c_bp_customer_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bpartner_id, c_acctschema_id, c_receivable_acct, c_prepayment_acct
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  bp.c_bpartner_id, '<NEW_SCHEMA_ID>',
  d.c_receivable_acct, d.c_prepayment_acct
FROM c_bpartner bp, c_acctschema_default d
WHERE bp.ad_client_id = '<NEW_CLIENT_ID>' AND bp.iscustomer = 'Y'
  AND d.c_acctschema_id = '<NEW_SCHEMA_ID>';

-- c_bp_vendor_acct para todos los vendors del nuevo cliente
INSERT INTO c_bp_vendor_acct (
  c_bp_vendor_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bpartner_id, c_acctschema_id, v_liability_acct, v_prepayment_acct
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  bp.c_bpartner_id, '<NEW_SCHEMA_ID>',
  d.v_liability_acct, d.v_prepayment_acct
FROM c_bpartner bp, c_acctschema_default d
WHERE bp.ad_client_id = '<NEW_CLIENT_ID>' AND bp.isvendor = 'Y'
  AND d.c_acctschema_id = '<NEW_SCHEMA_ID>';
```

> [!warning] Mismo problema al crear nuevos BPs después del setup inicial — al crear un tercero nuevo, Etendo tampoco crea automáticamente su fila en `c_bp_customer_acct` / `c_bp_vendor_acct`. Hay que crearla en el momento de alta del tercero o via trigger/hook.

**Orden de operaciones (final):**
11. Crear `c_bp_group_acct` por grupo × schema
12. Crear `m_product_category_acct` por categoría × schema
13. Crear `c_bp_customer_acct` por BP customer × schema
14. Crear `c_bp_vendor_acct` por BP vendor × schema


### Segunda corrección — `m_product_acct`

Aunque `m_product_category_acct` esté poblado, el engine puede necesitar también la fila en `m_product_acct` (por producto individual). Agregar al SQL de provisioning:

```sql
-- m_product_acct para todos los productos del nuevo cliente
INSERT INTO m_product_acct (
  m_product_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  m_product_id, c_acctschema_id,
  p_revenue_acct, p_expense_acct, p_cogs_acct, p_asset_acct,
  p_purchasepricevariance_acct, p_invoicepricevariance_acct,
  p_tradediscountrec_acct, p_tradediscountgrant_acct,
  p_revenue_return_acct, p_cogs_return_acct
)
SELECT
  upper(replace(gen_random_uuid()::text,'-','')),
  '<NEW_CLIENT_ID>', '0', 'Y', now(), '100', now(), '100',
  p.m_product_id, '<NEW_SCHEMA_ID>',
  d.p_revenue_acct, d.p_expense_acct, d.p_cogs_acct, d.p_asset_acct,
  d.p_purchasepricevariance_acct, d.p_invoicepricevariance_acct,
  d.p_tradediscountrec_acct, d.p_tradediscountgrant_acct,
  d.p_revenue_return_acct, d.p_cogs_return_acct
FROM m_product p, c_acctschema_default d
WHERE p.ad_client_id = '<NEW_CLIENT_ID>'
  AND d.c_acctschema_id = '<NEW_SCHEMA_ID>';
```

> [!warning] Mismo patrón que para BPs — al crear un producto nuevo tampoco se crea su `m_product_acct`. Debe crearse automáticamente en el alta de producto.

**Orden de operaciones (final revisado):**
11. `c_bp_group_acct` por grupo × schema
12. `m_product_category_acct` por categoría × schema
13. `c_bp_customer_acct` por BP customer × schema
14. `c_bp_vendor_acct` por BP vendor × schema
15. `m_product_acct` por producto × schema


---

## Update 2026-06-10 — `AD_Org.AD_LegalEntity_Org_ID` nulo rompe los defaults SII (y todo lo que resuelve la entidad legal)

> Misma familia que los problemas de "Set as Ready" ya documentados (`ad_org_tree`, `ad_inheritedcalendar_id`, control de períodos): la denormalización del proceso **AD_Org_Ready quedó incompleta**. Aquí faltan **dos columnas más**: `AD_LegalEntity_Org_ID` y `AD_CalendarOwner_Org_ID`.

### Síntoma

Al crear una **factura de venta nueva** para TaxesOrg desde la app Go, los campos `em_aeatsii_descripcion_sii` (**Descripción SII**), `em_aeatsii_description_id`, `em_aeatsii_clave_tipo` (**Clave tipo**) y `em_aeatsii_estado` quedan **vacíos**. En GOOrg se autocompletan (`Ventas` / `F1` / `PE`).

### Causa raíz (confirmada)

Los 4 campos `em_aeatsii_*` se rellenan con **defaults `@SQL=` de columna** (NO con el callout `SiiInvoiceOrganizationCallout`, que ni siquiera está cableado a `AD_Org_ID` — esa columna usa el core `SE_Invoice_Organization`). Los 4 comparten el mismo guard:

```sql
WHEN (SELECT c.insiisystem FROM aeatsii_config c
      WHERE c.ad_org_id = ad_get_org_le_bu(@AD_Org_ID@,'LE')) = 'Y'
THEN (...) ELSE null END
```

`AD_GET_ORG_LE_BU(org,'LE')` **NO recorre el árbol**: lee directamente la columna denormalizada **`AD_Org.AD_LegalEntity_Org_ID`**. En TaxesOrg está **NULL** (en GOOrg = su propio id) → el guard devuelve NULL → `NULL='Y'` es falso → los 4 defaults colapsan a null.

```
TaxesOrg.AD_LegalEntity_Org_ID = NULL   (isready='Y' pero columna sin poblar)
  -> ad_get_org_le_bu('DB294...','LE') = NULL
     -> guard insiisystem='Y'  = NULL  -> CASE = null
        -> Descripción / Clave Tipo / Description_ID / Estado = null
```

Los datos de `aeatsii_description` / `aeatsii_config` están bien, y el cliente/org de sesión se resuelven correctamente (`@ad_client_id@='F226...'`, `@AD_Org_ID@='DB294...'`). El único dato roto es la denormalización de la entidad legal. (Descarta las hipótesis previas de "admin mode oculta el filtro" / "filtro de cliente" / "el callout SII" — ninguna aplica.)

### Estado encontrado (TaxesOrg vs GOOrg)

| Columna (`ad_org`)               | GOOrg (OK) | TaxesOrg (roto)     |
| -------------------------------- | ---------- | ------------------- |
| `ad_legalentity_org_id`          | sí mismo   | **NULL**            |
| `ad_businessunit_org_id`         | NULL       | NULL (ok, no es BU) |
| `ad_periodcontrolallowed_org_id` | sí mismo   | sí mismo            |
| `ad_calendarowner_org_id`        | sí mismo   | **NULL**            |
| `isready`                        | Y          | Y                   |

Entidades: TaxesClient `F226CBA6FFA549F6B8D90FF8064C6727` / TaxesOrg `DB294FB926884F33A253D6F0FB28DF8B`; GOClient `802509E12436405C86BA1FD5B1DF508C` / GOOrg `61849243BE89460EB70866880A545D50`.

### Dónde está el bug en el alta (`com.etendoerp.go.onboarding`)

- `steps/CreateOrgStep.java` → crea la org con `InitialOrgSetup.createOrganization(...)`, tipo `"1"` (Legal with accounting), padre `"0"`. **Correcto** (la org sí nace como entidad legal y con nodos de árbol).
- `steps/MarkOrgReadyStep.java` (líneas 73-81) y `OnboardingMarkOrgReadyService.markOrgReady` (líneas 64-73): ejecutan el proceso core `AD_Org_Ready` vía `ProcessRunner` y luego, **de forma defensiva, fuerzan `org.setReady(true)`** si el proceso no lo dejó ready.

El proceso core `AD_ORG_READY` (`src-db/database/model/functions/AD_ORG_READY.xml`) es el que computa y persiste:
```
AD_LegalEntity_Org_ID   := ad_get_org_le_bu_treenode(org,'LE');
AD_BusinessUnit_Org_ID  := ad_get_org_le_bu_treenode(org,'BU');
AD_CalendarOwner_Org_ID := ad_org_getcalendarownertn(org);
```

**Hipótesis principal (a verificar por Seba):** `AD_Org_Ready` corre sobre la conexión del `DalConnectionProvider`/`ProcessRunner` (su propia transacción), mientras que `setReady(true)` se commitea por la conexión de OBDal/Hibernate (otra transacción). Si los `UPDATE` de denormalización del PL/SQL **no se commitean / se rollbackean** pero el `setReady(true)` de OBDal sí → queda exactamente `isready='Y'` + `AD_LegalEntity_Org_ID=NULL`. **El fallback defensivo enmascara el fallo**: marca la org como ready aunque la denormalización nunca ocurrió.

### Qué arreglar en el flujo de onboarding

1. **No enmascarar.** Tras correr `AD_Org_Ready`, **verificar** que `AD_LegalEntity_Org_ID` quedó poblado; si está NULL → fallar el step (o recomputar). Nunca `setReady(true)` a ciegas.
2. **Transacción/visibilidad.** Garantizar que la denormalización del proceso se commitea antes de seguir, y que las escrituras previas de `InitialOrgSetup` (tipo legal + nodos de árbol) sean visibles para la conexión que corre `AD_Org_Ready`.
3. Si no se puede garantizar lo anterior, **recomputar explícitamente** tras el proceso (mismo cálculo que `AD_ORG_READY`):

```sql
UPDATE ad_org
SET ad_legalentity_org_id   = ad_get_org_le_bu_treenode(ad_org_id,'LE'),
    ad_businessunit_org_id  = ad_get_org_le_bu_treenode(ad_org_id,'BU'),
    ad_calendarowner_org_id = ad_org_getcalendarownertn(ad_org_id)
WHERE ad_org_id = '<ORG_ID>';
```

### Reparación manual aplicada (TaxesOrg, 2026-06-10)

```sql
UPDATE ad_org
SET ad_legalentity_org_id   = ad_get_org_le_bu_treenode(ad_org_id,'LE'),   -- -> DB294...
    ad_businessunit_org_id  = ad_get_org_le_bu_treenode(ad_org_id,'BU'),   -- -> null (igual que GOOrg)
    ad_calendarowner_org_id = ad_org_getcalendarownertn(ad_org_id)         -- -> DB294...
WHERE ad_org_id = 'DB294FB926884F33A253D6F0FB28DF8B';
```

Verificado tras el fix: `ad_get_org_le_bu('DB294...','LE')` = `DB294...`, guard = `Y`, default de Descripción = `Ventas`. Los 4 campos SII se autocompletan.

### Query de detección (orgs afectadas en cualquier tenant)

```sql
SELECT c.name AS client, o.name AS org, o.ad_org_id
FROM ad_org o
JOIN ad_orgtype ot ON o.ad_orgtype_id = ot.ad_orgtype_id
JOIN ad_client  c  ON o.ad_client_id  = c.ad_client_id
WHERE o.isready = 'Y'
  AND ot.islegalentity = 'Y'
  AND o.ad_legalentity_org_id IS NULL
  AND o.ad_org_id != '0';
```

### Referencias

- `src-db/database/model/functions/AD_ORG_READY.xml` — computa/persiste LE/BU/calendar-owner
- `src-db/database/model/functions/AD_GET_ORG_LE_BU.xml` — lee la columna denormalizada (requiere org "ready")
- `src-db/database/model/functions/AD_GET_ORG_LE_BU_TREENODE.xml` — variante que recorre el árbol
- `modules/com.etendoerp.go/src/com/etendoerp/go/onboarding/steps/MarkOrgReadyStep.java`, `OnboardingMarkOrgReadyService.java`
- Investigación completa: **ETP-4177**
