# ETP-5273 — Fecha Contable independiente de la Fecha del documento

**Estado:** ✅ implementado y validado por el usuario (compilado, probado en Sales Invoice y Purchase Invoice, 2026-09-11)
**Fecha:** 2026-09-11
**Rama:** `feature/ETP-5273` (ya creada en ambos repos)
**Tipo:** Historia — Prioridad Mayor
**Repos afectados:** `etendo_schema_forge` (config + docs) y `com.etendoerp.go` (backend Java + AD)

---

## 1. Contexto — esto es un re-revert, no una feature nueva

El campo `accountingDate` (columna AD `DateAcct`) ya existió como campo independiente y editable.
Se revirtió el **2026-07-17**, **dentro de la misma PR** que lo implementó (no hubo PR de revert
separada), por una redefinición de alcance de producto en ETP-4531.

| Hito | Commit | Qué hizo |
|---|---|---|
| Implementación original | (previo a `c6d0aabc`) | `accountingDate` editable + guard `blockCalloutFieldUpdate` |
| Reversión backend | `c6d0aabc` | Quitó el guard, introdujo `mirrorAccountingDate` |
| Reversión config | `aa009f51` | `visibility: editable` → `system` en 4 ventanas |
| Merge | PR 741 + PR 914 | `feature/ETP-4531` → `epic/ETP-3504`, 2026-07-20 |

**No hubo motivo técnico para la reversión.** Los reviews de ambas PRs son aprobaciones limpias
(`fran-roig`, `IrinaUrri`, `RubenEtendo`) + Sonar verde. `docs/feedback.md:319-334` lo registra
explícitamente como *"this is not a bug entry — it records a scope reversal"*.

Consecuencia: el "antes" a restaurar es recuperable de esos dos commits. No hay que reinventar el diseño.

---

## 2. Alcance

> ## ⚠️ ALCANCE REDUCIDO — 2026-09-11 (Vale, autora del ticket)
>
> **El ticket se reescribió: aplica ÚNICAMENTE a Factura de Venta y Factura de Compra.**
> Pedidos y albaranes quedan FUERA. Todo lo implementado para esas 4 ventanas fue revertido
> (config, backend y NEO). Las secciones 2.1, 5 y 6.1 de abajo describen el alcance ORIGINAL de 6
> ventanas y se conservan solo como registro histórico — ver §2.3 para el estado real.
>
> Lo que SOBREVIVE del trabajo de pedidos/albaranes: nada de código. Sí sobreviven dos hallazgos
> documentados que siguen siendo válidos y útiles (§6.2 y el de la moneda en albaranes).

### 2.1 Dentro de alcance

| Ventana | Artifact | Estado actual de `accountingDate` | Naturaleza del trabajo |
|---|---|---|---|
| Factura de Venta | `sales-invoice` | `system` | **Revert puro** |
| Factura de Compra | `purchase-invoice` | `system` | **Revert puro** |
| Albarán de Venta | `goods-shipment` | `system` | **Revert puro** |
| Albarán de Compra | `goods-receipt` | `system` | **Revert puro** |
| Pedido de Venta | `sales-order` | `system` (sin override) | **Construcción nueva** |
| Pedido de Compra | `purchase-order` | `system` | **Construcción nueva** |

**Los pedidos nunca tuvieron el guard.** `AbstractOrderHeaderHandler.mirrorAccountingDate` es
funcionalidad neta de la PR 741, no el reemplazo de un guard previo. Para órdenes hay que construir
el bloqueo del cascade desde cero, siguiendo el patrón de facturas.

### 2.2 Fuera de alcance (por ahora)

- **`sales-quotation`** — se decide por separado. Hoy está `discarded` (no `system`), nunca estuvo
  en ETP-4531, y no tiene concepto de `Posted` (no es documento contabilizable), así que la regla
  "bloqueado al contabilizar" no aplica tal cual. Requiere una decisión funcional previa.
- **`amortization.accountingDate`** — excepción ya confirmada, concepto distinto de `startingDate`.
- **`financial-account.transaction.dateAcct`** — ya era `system` desde antes de ETP-4531.

---

### 2.3 Alcance y estado REALES tras la reducción (2026-09-11)

| Ventana | Estado |
|---|---|
| `sales-invoice` | ✅ implementado y validado por el usuario (CP-1 a CP-5) |
| `purchase-invoice` | ✅ implementado |
| `sales-order`, `purchase-order` | ⏪ **revertido** — `accountingDate` vuelve a `system` |
| `goods-shipment`, `goods-receipt` | ⏪ **revertido** — `accountingDate` vuelve a `system` |
| `sales-quotation` | nunca entró |

**Changeset final.**

`etendo_schema_forge`:
- `artifacts/{sales,purchase}-invoice/` — decisions + contratos + generado
- `tools/app-shell/src/components/contract-ui/{DetailView.jsx,detailViewHelpers.jsx}` — el fix de §6.2

`com.etendoerp.go`:
- `AbstractInvoiceHeaderHandler.java` — guard removido + javadoc
- `SalesInvoiceHeaderHandler.java`, `PurchaseInvoiceHeaderHandler.java` — usan `mirrorAccountingDateOnCreate`
- `NeoHandlerUtils.java` — `mirrorAccountingDateOnCreate` nuevo; `blockCalloutFieldUpdate` eliminado (sin call sites)

**Revertido por completo** (vuelto a HEAD): `AbstractOrderHeaderHandler`, `GoodsReceiptHeaderHandler`,
`GoodsShipmentHeaderHandler`, `NeoDefaultsCascadeHelper`, `NeoCrudHandler` y los artifacts de las 4
ventanas. NEO re-pusheado: esas 4 volvieron a `isreadonly='Y'` / `visibility='system'`, verificado
por consulta directa a `ETGO_SF_FIELD`.

**Detalle a no perder:** pedidos y albaranes conservan el diseño unificado, donde `accountingDate`
está oculto y DEBE seguir a la fecha del documento en CADA write. Por eso siguen usando el
`mirrorFieldValue` incondicional a través de su propio wrapper `mirrorAccountingDate(NeoContext)`,
y NO deben migrarse a `mirrorAccountingDateOnCreate` sin antes hacer visible su fecha contable.
Está documentado en el javadoc de ese método.

### 2.4 Hallazgos colaterales — NO son de ETP-5273, merecen ticket aparte

1. **Conversión de moneda apagada en albaranes.** `goods-shipment` y `goods-receipt` no declaran
   `window.documentDateField`, caen al default `'orderDate'` (campo inexistente ahí) y el efecto de
   `DetailView.jsx:1871` aborta siempre. Ambas ventanas tienen campo de moneda.
2. **Drift de AD en `goods-receipt`.** Al regenerar con extract fresco apareció el campo
   `descriptionOnly` (`IsDescription`) en las líneas, ausente del `contract.json` commiteado. Se
   excluyó del changeset por estar fuera de alcance. **Ojo: el push a NEO de la restauración sí lo
   incluyó**, así que la DB local quedó con ese campo mientras el repo no. Conviene regenerar y
   commitear `goods-receipt` en una tarea propia para cerrar la brecha.
3. **`export.database` borró archivos ajenos.** La corrida dejó `AD_MESSAGE_TRL.xml` BORRADO (venía
   de `10a4baad`, ETP-5175) y `ETGO_ACCOUNT.xml` modificado. Es el comportamiento conocido de
   `export.database`: exporta lo que hay en TU base, y lo que no tenés cargado se borra.
   **Restaurar ambos antes de commitear.**

---

## 3. Estado actual del código (verificado 2026-09-11)

### 3.1 Backend — `com.etendoerp.go` en `feature/ETP-5273`

| Elemento | Ubicación | Estado |
|---|---|---|
| `NeoHandlerUtils.mirrorFieldValue(body, src, dst)` | `NeoHandlerUtils.java` | Presente — helper genérico |
| `NeoHandlerUtils.mirrorAccountingDate(ctx, src, dst)` | `NeoHandlerUtils.java` | Presente |
| `AbstractOrderHeaderHandler.mirrorAccountingDate` | `AbstractOrderHeaderHandler.java:103` | Presente — `orderDate` → `accountingDate` |
| `GoodsReceiptHeaderHandler.mirrorAccountingDate` | `GoodsReceiptHeaderHandler.java:121`, llamado en `:86` | Presente — `movementDate` → `accountingDate` |
| `GoodsShipmentHeaderHandler.mirrorAccountingDate` | `GoodsShipmentHeaderHandler.java:71+` | Presente — `movementDate` → `accountingDate` |
| `AbstractInvoiceHeaderHandler` mirror | `AbstractInvoiceHeaderHandler.java:1156-1168` | Presente — `invoiceDate` → `accountingDate` |
| `NeoHandlerUtils.blockCalloutFieldUpdate` | — | **AUSENTE** (removido en `c6d0aabc`) |
| `NeoFieldFilter.resolveWritablePropName` | `NeoFieldFilter.java:457` | Presente — fix de plataforma, **conservar** |
| Captura pre-filtro de `accountingDate` | `NeoCrudHandler.java:965-997` | Presente — workaround por campo read-only |

### 3.2 Config — `etendo_schema_forge`

Las 6 ventanas tienen en `decisions.json`:

```json
"accountingDate": {
  "visibility": "system",
  "_note": "ETP-4531 (redefined 2026-07-17): accounting date is now hidden and unified..."
}
```

Las reglas `READONLY_Posted_AccountingDate` (facturas/albaranes) y `readOnly_DateAcct_order`
(`sales-order/decisions.json:1197`) **siguen declaradas** con `decision: "Keep"` — están dormidas
porque el campo no se renderiza. No hay que reintroducirlas, solo reactivarlas exponiendo el campo.

---

## 4. Decisiones de diseño a tomar antes de codear

### D1 — Destino de `mirrorAccountingDate` (BLOQUEANTE)

El ticket pide dos cosas que están en tensión con el mirror actual:

- **CA:** "Al crear un documento, la Fecha Contable toma el mismo valor que la Fecha del documento."
- **CP-2:** "Al modificar la Fecha Contable, la Fecha del documento no cambia" — e implícitamente,
  la Fecha Contable editada a mano **no debe ser pisada** por un write posterior.

Hoy `mirrorAccountingDate` corre al tope de `handle()` en **cada** write (POST/PUT/PATCH) y pisa
`accountingDate` incondicionalmente. Eso mata CP-2.

> **RESUELTO 2026-09-11 (decisión del usuario):** se implementa el comportamiento literal del ticket
> y **no se decide R1 en abstracto**. Una vez implementado, el usuario probará el comportamiento real
> en **Classic** y después en **GO**, y a partir de esa comparación se define la semántica definitiva.
> Es la decisión correcta: el ticket pide explícitamente *"alinear el comportamiento con Classic"*,
> así que Classic —no una discusión de diseño— es la fuente de verdad. R1 pasa de bloqueante a
> **pendiente de validación empírica post-implementación**.

**Propuesta:** degradar el mirror de *"espejo en cada write"* a *"default en creación"*:

| Método | Comportamiento propuesto |
|---|---|
| `POST` (creación) | Mirror activo **solo si** el cliente no envió `accountingDate` |
| `PUT` / `PATCH` | Mirror **desactivado** — el valor del cliente manda |

La sincronización Fecha → Fecha Contable de CP-1 la sigue haciendo el **callout clásico nativo**
(`SifInvoiceOperationDateCallout`, `SL_InOut_AccountingDate`) ejecutado server-side por
`NeoCalloutService`. El guard `blockCalloutFieldUpdate` es lo que impide que ese callout se dispare
cuando el trigger **no** es la fecha del documento.

> **Ojo — matiz funcional a confirmar con producto:** con el guard restaurado tal como estaba en el
> diseño original, si el usuario edita la Fecha Contable a mano y *después* cambia la Fecha del
> documento, el callout **sí** vuelve a pisar la Fecha Contable (el trigger es la fecha del documento,
> así que el guard deja pasar la actualización). Eso es exactamente lo que pide CP-1 leído al pie de
> la letra, pero puede sorprender al usuario que ya había ajustado la fecha contable a mano.
> **Este plan asume el comportamiento literal del ticket.** Ver §8, riesgo R1.

### D2 — Destino del workaround de `NeoCrudHandler:965-997`

Esa captura pre-filtro existe **porque `accountingDate` es read-only** (`ISREADONLY='Y'` en AD) y
`filterWriteRequest` lo descarta. Al volverlo escribible (`ISREADONLY='N'`), el campo atraviesa el
filtro normalmente y el workaround queda sin propósito.

**Propuesta:** eliminar la captura pre-filtro específica de `accountingDate`, **conservando**:
- `NeoFieldFilter.resolveWritablePropName` — fix de plataforma, útil independientemente.
- La captura equivalente de `updated` (`updatedBeforeFilter`, línea 983) — problema distinto, no tocar.

### D3 — `seq` y `section` en pedidos

Facturas y albaranes tenían `section: "principal"`, `seq: 35`. Los pedidos nunca tuvieron declaración
editable. **Propuesta:** replicar `section: "principal"` y ubicar por `seq` inmediatamente después de
`orderDate` en cada ventana, respetando la numeración existente de cada `decisions.json`.

---

## 5. Plan de implementación

### Fase 0 — Preparación

- [ ] 0.1 Confirmar decisiones D1, D2 y D3 con el usuario.
- [ ] 0.2 Confirmar que `feature/ETP-5273` está creada y sincronizada en ambos repos
      (`etendo_schema_forge`, `com.etendoerp.go`), partiendo de `develop`.
- [ ] 0.3 Recuperar el "antes" exacto de los commits `c6d0aabc` (backend) y `aa009f51` (config)
      como material de referencia — no aplicar el revert automático, la base cambió desde julio.

### Fase 1 — Metadato AD: NO se edita a mano (corrección 2026-09-11)

> **`ETGO_SF_FIELD.xml` es un artefacto EXPORTADO, no una fuente.**
> Verificado en `schema_forge_core/cli/src/push-to-neo.js:441,522` → `mapVisibility()`
> (`cli/src/lib/field-visibility.js`) colapsa `visibility` en `{isIncluded, isReadOnly}`:
> `system` y `readOnly` → `Y/Y`; `editable` → `isReadOnly: 'N'`.
> `push-to-neo.js` escribe esos flags en la tabla `ETGO_SF_FIELD`, y `./gradlew export.database`
> los vuelca al XML. El cambio `ISREADONLY` `Y`→`N` de la PR 741 fue la **consecuencia** del cambio
> de `visibility` en la PR 914, no un edit manual.

Por lo tanto **no hay tarea manual en esta fase**. El flip de `ISREADONLY` sale solo de:

```
Fase 4 (decisions.json: visibility → editable)
   → Fase 5 (make regen ... PUSH_TO_NEO=1)
   → ./gradlew export.database
   → diff en com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_FIELD.xml
```

- [ ] 1.1 **Verificar** (no editar) que tras la Fase 5 el diff del XML muestra `ISREADONLY='N'`
      para los registros con `JAVA_QUALIFIER=accountingDate` de las 6 ventanas.
- [ ] 1.2 Confirmar que existen registros `ETGO_SF_FIELD` para `accountingDate` en las ventanas de
      **pedidos**. Si `push-to-neo` no los crea porque el campo nunca estuvo incluido, el upsert los
      generará al pasar a `editable` — verificar que efectivamente aparecen en el diff.
      Si hiciera falta algún ID nuevo a mano: **`make uuid`, nunca inventarlo.**
- [ ] 1.3 Commitear el diff del XML en el repo `com.etendoerp.go`, junto con los cambios Java.

### Fase 2 — Backend: guard del cascade (`com.etendoerp.go`)

- [ ] 2.1 Reintroducir `NeoHandlerUtils.blockCalloutFieldUpdate(JSONObject updates, String triggerField, String fieldName)`
      con el javadoc que justifica el invariante cross-table (referencia: el patrón hermano
      `blockCalloutCurrencyUpdate` / ETP-4029, que sigue vigente).
- [ ] 2.2 `AbstractInvoiceHeaderHandler#handleInvoiceAfterCallout` — restaurar la llamada
      `blockCalloutFieldUpdate(fields.updates(), fields.triggerField(), FIELD_ACCOUNTING_DATE)`
      y el texto de logging `[ETP-4029/ETP-5273/ETP-4535]`.
- [ ] 2.3 `GoodsReceiptHeaderHandler` — restaurar el override `afterCallout()` completo
      (hoy cae al no-op de `NeoHandler`), con su `try/catch` no fatal.
- [ ] 2.4 `GoodsShipmentHeaderHandler` — ídem.
- [ ] 2.5 `AbstractOrderHeaderHandler` — **nuevo**: añadir override `afterCallout()` siguiendo el
      patrón de albaranes, para `sales-order` y `purchase-order`.
- [ ] 2.6 `NeoDefaultsCascadeHelper#processCalloutForField` — restaurar la constante
      `FIELD_ACCOUNTING_DATE` y la llamada al guard **antes** de `mergeCalloutUpdates`.
      Cubre `GET /defaults` y `POST create`.

### Fase 3 — Backend: ajuste del mirror y limpieza (`com.etendoerp.go`)

- [ ] 3.1 Según D1: acotar `mirrorAccountingDate` a creación sin valor explícito, en los 4 handlers
      (`AbstractInvoiceHeaderHandler`, `AbstractOrderHeaderHandler`, `GoodsReceiptHeaderHandler`,
      `GoodsShipmentHeaderHandler`). Actualizar el javadoc de cada uno — hoy dice
      *"The user never sees or edits accountingDate directly"*, que deja de ser cierto.
- [ ] 3.2 Según D2: eliminar la captura pre-filtro de `accountingDate` en `NeoCrudHandler:965-997`,
      **conservando** `resolveWritablePropName` y la captura de `updated`.

### Fase 4 — Config de ventanas (`etendo_schema_forge`)

Para cada una de las 6 ventanas, en `artifacts/<window>/decisions.json`:

- [ ] 4.1 `sales-invoice` — `accountingDate`: `visibility: "editable"`, `grid: false`, `form: true`,
      `section: "principal"`, `seq: 35`, `readOnlyLogic: "@Posted@='Y'"`, `_note` ETP-5273.
- [ ] 4.2 `purchase-invoice` — ídem.
- [ ] 4.3 `goods-shipment` — ídem.
- [ ] 4.4 `goods-receipt` — ídem.
- [ ] 4.5 `sales-order` — **nuevo override** (hoy no existe la clave), con `seq` según D3.
- [ ] 4.6 `purchase-order` — ídem.
- [ ] 4.7 Revertir `decision` de las reglas de callout `DateAcct_Default`,
      `SE_Invoice_AccountingDate`, `SL_InOut_AccountingDate` de `"Keep"` a `"Replace"`,
      con la descripción que documenta el guard.
- [ ] 4.8 Revisar la nota de `SE_Invoice_TaxDate` en facturas — vuelve a ser alcanzable.

**La `_note` de `readOnlyLogic` debe conservar el razonamiento original:** se usa `@Posted@` y no
`@Processed@` porque `Processed='Y'` también bloquearía la fecha durante un intento de contabilización
fallido, donde el usuario todavía necesita corregirla antes de reintentar.

### Fase 5 — Regeneración

- [ ] 5.1 `make regen ONLY=sales-invoice,purchase-invoice,goods-shipment,goods-receipt,sales-order,purchase-order`
- [ ] 5.2 Verificar contract integrity con el script del paso 3 del *Window Change Integrity Protocol*
      (`CLAUDE.md`) para cada ventana.
- [ ] 5.3 Verificar que `accountingDate` aparece en `frontendContract.entities.header.fields` con
      `readOnlyLogic` no nulo.
- [ ] 5.4 `npx sf-validate-pipeline --scope=<cada ventana>` → 0 violaciones.
- [ ] 5.5 `make regen ... PUSH_TO_NEO=1` y luego `./gradlew export.database` en Etendo root.

**Deuda colateral detectada:** `artifacts/purchase-invoice/generated/web/purchase-invoice/InvoiceForm.jsx:17`
todavía renderiza `accountingDate` como editable — es un artefacto **huérfano** (no lo importa
`index.jsx`, que usa `HeaderPage.jsx` → `HeaderForm.jsx`). Sin tocar desde 2026-03-31. Aprovechar
esta tarea para limpiarlo o confirmarlo como muerto.

### Fase 6 — Tests

Delegar a **Tester** (`test-generator`), según la regla de delegación de `CLAUDE.md`.

- [ ] 6.1 `NeoHandlerUtilsTest` — cobertura de `blockCalloutFieldUpdate` (bloquea cuando el trigger
      es otro campo; deja pasar cuando el trigger es el propio `accountingDate`).
- [ ] 6.2 `AbstractInvoiceHeaderHandlerTest` — restaurar `handleCurrencyAfterCallout_blocksAccountingDateFrom*`.
- [ ] 6.3 `GoodsReceiptHeaderHandlerTest` / `GoodsShipmentHeaderHandlerTest` — tests de `afterCallout`.
- [ ] 6.4 `AbstractOrderHeaderHandlerTest` — **nuevos**, el guard en pedidos no tiene precedente.
- [ ] 6.5 `NeoDefaultsCascadeHelperTest` — los dos entry points (`executeCalloutCascade` y
      `executeCalloutCascadeForCreate`) bloqueando el cascade.
- [ ] 6.6 Ajustar los tests de `mirrorAccountingDate` al nuevo contrato de D1 (hoy `AbstractInvoiceHeaderHandlerTest:3346-3400`
      afirma que PUT pisa un `accountingDate` stale — eso deja de ser cierto).
- [ ] 6.7 E2E Playwright cubriendo CP-1 a CP-5 sobre al menos una factura y un albarán.
      Leer `docs/e2e-testing-guide.md` antes; referencia canónica `e2e/tests/flows/row-quick-actions.mocked.spec.js`.

### Fase 7 — Documentación

Política de `CLAUDE.md`: cambio de código + doc en la misma unidad atómica.

- [ ] 7.1 `docs/generated-custom-windows/{sales-invoice,purchase-invoice,goods-shipment,goods-receipt,sales-order,purchase-order}.md`
- [ ] 7.2 `docs/neo-headless-extensibility.md:670-734` — quitar la marca **"⚠️ Superseded (2026-07-17)"**
      del patrón `blockCalloutFieldUpdate` y actualizar a ETP-5273.
- [ ] 7.3 `docs/feedback.md` — **nueva entrada** documentando el re-revert, para que el próximo lector
      no se pierda en el trail (independiente → unificado → independiente). Es el mismo error que
      ETP-4531 dejó documentado como lección.

---

## 6. Trazabilidad: casos de prueba → implementación

> **CORRECCIÓN 2026-09-11 — las dos primeras filas estaban MAL.** Ver §6.1.

| CP | Qué valida | Fase responsable |
|---|---|---|
| CP-1 | Fecha documento cambia → Fecha Contable se actualiza | ⚠️ **El guard lo IMPIDE** — ver §6.1 |
| CP-2 | Fecha Contable cambia → Fecha documento no cambia | Se cumple solo (no hay callout sobre `DateAcct`) + mirror acotado (3.1) |
| CP-3 | Confirmado y no contabilizado → editable | `readOnlyLogic: "@Posted@='Y'"` (Fase 4) |
| CP-4 | Contabilizado → solo lectura | ídem |
| CP-5 | Descontabilizado → vuelve editable | ídem — `Posted` vuelve a `N` |
| CA "default en creación" | Al crear, toma la fecha del documento | Mirror en POST (3.1) |

### 6.1 — Hallazgo: ETP-5273 NO es un revert puro de ETP-4531

**Descubierto tras implementar la Fase 2.** El guard restaurado es:

```java
if (updates != null && updates.has(fieldName) && !fieldName.equals(triggerField)) {
    updates.remove(fieldName);   // trigger=invoiceDate, fieldName=accountingDate → ELIMINA
}
```

Cuando el usuario cambia la Fecha del documento, `triggerField` es `invoiceDate`/`movementDate`/`orderDate`
y `fieldName` es `accountingDate`, así que la condición se cumple y el guard **elimina** la actualización.
Es decir: **con el guard puesto, la Fecha Contable NO sigue a la Fecha del documento.**

El javadoc original lo dice sin rodeos: *"fully decoupled from the document's own date"*.

Los dos tickets piden cosas distintas:

| Comportamiento | ETP-4531 (alcance original) | ETP-5273 |
|---|---|---|
| Fecha doc → Fecha contable | ❌ desacople total | ✅ sincroniza (CP-1) |
| Fecha contable → Fecha doc | ❌ nunca | ❌ nunca (CP-2) |
| Editable independiente | ✅ | ✅ |

**ETP-5273 es un tercer diseño, no el revert del revert.**

Además, **CP-2 no necesita el guard**: los callouts clásicos están registrados sobre
`C_Invoice.DateInvoiced` y `M_InOut.MovementDate`, no sobre `DateAcct`. Editar la Fecha Contable no
dispara ningún cascade hacia la fecha del documento. Lo único que rompía la edición independiente era
`mirrorAccountingDate` pisando el campo en cada write — resuelto en la Fase 3.1.

Por lo tanto, la hipótesis técnica es que **la Fase 2 completa (guard + 5 call sites) sobra y además
rompe CP-1**, y que la implementación correcta sería solo Fase 4 (config) + Fase 3.1 (mirror acotado).

#### Decisión: se deja el guard puesto, pendiente de validación contra Classic

**Decidido por el usuario el 2026-09-11.** Razonamiento: el ticket pide explícitamente *"alinear el
comportamiento con Classic"*. Si Classic desacopla las fechas por completo, entonces **CP-1 está mal
redactado** y el guard es correcto. Si Classic sincroniza, el guard sobra. La prueba lo decide.

**Qué observar en la prueba de Classic** (esta es la observación decisiva):

1. Abrir una Factura de Venta en borrador en Classic.
2. Anotar Fecha y Fecha Contable (deberían coincidir).
3. Cambiar **solo** la Fecha del documento y observar la Fecha Contable **sin guardar**.
   - **Si la Fecha Contable cambia sola** → Classic sincroniza → CP-1 es correcto → **quitar el guard**
     (Fase 2 completa) y quedarse con config + mirror acotado.
   - **Si la Fecha Contable NO se mueve** → Classic desacopla → CP-1 está mal redactado en el ticket
     → **el guard se queda** y hay que corregir el ticket con producto.
4. Repetir cambiando **solo** la Fecha Contable: la Fecha del documento no debe moverse en ningún
   escenario (CP-2 se cumple en ambos diseños).
5. Repetir el mismo guion en GO y comparar.

Hasta que esa prueba se haga, **el CP-1 de la suite E2E (Fase 6.7) no se puede escribir** — no está
definido qué debe afirmar.

### 6.2 — Bug de frontend destapado: la Fecha Contable quedaba "pegada"

**Reportado por el usuario el 2026-09-11 probando facturas en GO.** Secuencia:

| Paso | Acción | Classic | GO (antes del fix) |
|---|---|---|---|
| 1 | Cambiar Invoice Date | Accounting Date sigue ✅ | sigue ✅ |
| 2 | Editar Accounting Date a mano | Invoice Date queda ✅ | queda ✅ |
| 3 | Volver a cambiar Invoice Date | Accounting Date sigue ✅ | **pegada** ❌ |

**Causa raíz — no la introdujo ETP-5273.** El guard "user-touched fields" de
`detailViewHelpers.jsx` (`applyCalloutFieldUpdates`), introducido por `2fd136c82`
**ETP-3836: Protect user-touched fields from callout overwrites**:

```js
if (key !== triggerField && userTouchedRef.current.has(key) && userHasValue) continue;
```

`userTouchedRef` se llena en `DetailView.jsx#fireCallout` con cada edición y **solo se limpia
cuando cambia `recordId`**. Tras el paso 2, `accountingDate` queda marcado para siempre y el
paso 3 descarta el update. Era un bug latente: solo se manifiesta ahora que el campo es editable.

El mecanismo es correcto para campos **independientes** (elegir otro `businessPartner` no debe
pisar el `paymentTerms` que el usuario ajustó). Lo que le faltaba era distinguir esos del
**destino declarado de una cascada unidireccional**.

**Fix aplicado** — `isDocumentDateCascadeTarget(key, triggerField, documentDateField)` en
`detailViewHelpers.jsx`, exento del guard. Se apoya en el prop `documentDateField` que
`DetailView` **ya recibía** (`DetailView.jsx:1082`), así que no toca el pipeline ni los
generadores, y cubre cada ventana por su propia declaración.

Verificación: **4179 tests de `contract-ui` en verde, 0 fallos**, incluidos los 51 de
`DetailView.calloutHelpers.vitest.js` que cubren el caso original de ETP-3836.

> Nota de implementación: el hook `check-detailview-growth` bloquea el crecimiento de
> `DetailView.jsx`. El cambio ahí es de una sola palabra en el `ctx`; toda la explicación vive
> en el helper.

#### Albaranes quedan fuera — decisión consciente del usuario (2026-09-11)

`goods-shipment` y `goods-receipt` **no declaran `window.documentDateField`**, así que caen al
default del prop (`'orderDate'`), un campo que no existe en esas ventanas. La exención no se
activa ahí.

Declararles `documentDateField: "movementDate"` arreglaría el bug, pero **enciende por primera
vez** la conversión de moneda: `DetailView.jsx:1871` usa el mismo prop y hoy aborta siempre
porque `hook.selected?.['orderDate']` es `undefined`. Ambas ventanas tienen campo de moneda
(`etgoCurrency`), así que no es teórico.

**Decisión: NO declararlo.** Un cambio de comportamiento no pedido dentro de una tarea de fechas
es riesgo innecesario. ETP-5273 cierra cubriendo facturas y pedidos.

**Deuda registrada (tarea aparte):** la conversión de moneda está silenciosamente apagada en
`goods-shipment` y `goods-receipt` por un `documentDateField` sin declarar. Ese ticket debe
declararlo y validar el efecto de conversión, y de paso hereda gratis el fix de 6.2.

---

## 7. Orden de ejecución y dependencias

```
Fase 0 (decisiones)
   │
   ├──▶ Fase 1 (AD metadata) ──┐
   │                            ├──▶ Fase 5 (regeneración + push) ──▶ Fase 6 (tests) ──▶ Fase 7 (docs)
   ├──▶ Fase 2 (guard) ────────┤
   ├──▶ Fase 3 (mirror) ───────┤
   └──▶ Fase 4 (decisions) ────┘
```

Fases 1–4 son paralelizables entre sí. La Fase 5 es la barrera de sincronización: necesita el
metadato AD (1.1) y la config (Fase 4) listos antes de regenerar.

**Coordinación entre repos:** ambos comparten nombre de rama (`feature/ETP-5273`). El backend debe
mergear junto con la config, o el campo se expone en el frontend sin el guard que protege CP-2.

---

## 8. Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| **R1** | **Semántica del guard ante edición manual + cambio posterior de fecha del documento** (§D1). El callout pisa la fecha contable editada a mano. Es el comportamiento literal del ticket, pero puede sorprender al usuario. | **No bloqueante.** Se implementa el comportamiento literal; el usuario valida después contra **Classic** (fuente de verdad según el ticket) y contra GO, y ahí se define la semántica final. Si resultara que hay que "congelar tras edición manual", el guard solo no alcanza — haría falta rastrear el estado *dirty* del campo. |
| **R2** | Bugs de plataforma en `NeoFieldFilter`: mutación in-place de `filterWriteRequest` y remapeo de API-key a nombre DAL antes del filtro. Fueron los **únicos dos bugs reales** de ETP-4531 en producción. | `resolveWritablePropName` sigue presente (`NeoFieldFilter.java:457`) — **no revertirlo**. Verificar en QA que el write de `accountingDate` persiste realmente. |
| **R3** | Pedidos son terreno nuevo: nunca tuvieron el guard ni el campo expuesto. | Tests dedicados (6.4) + validación funcional explícita sobre pedidos, no solo facturas. |
| **R4** | Regeneración con `make regen` puede arrastrar drift no relacionado. La PR 914 ya perdió un flag `editModal` en `warehouse/contract.json` por esto. | Revisar el diff de regeneración campo por campo. **Nunca `git checkout artifacts/` para "limpiar" el diff.** |
| **R5** | Si se corre `make regen` sin `LOCAL_CORE=1` en ciertas ventanas, se pierden props declaradas. | Confirmar el perfil de dev antes de regenerar (`docs/repo-topology.md`). |
| **R6** | Falta `ETGO_SF_FIELD` para pedidos → el campo no se expone aunque la config esté bien. | Paso 1.2 explícito de verificación. |

---

## 9. Definition of Done

- [x] Los 5 casos de prueba del ticket pasan manualmente sobre Factura de Venta y Factura de Compra
      (alcance final tras la reducción de §2.3).
- [x] `npx sf-validate-pipeline` limpio para las 2 ventanas.
- [x] Suite JUnit de `com.etendoerp.go` verde — `AbstractInvoiceHeaderHandlerTest` reescrito para
      reflejar `mirrorAccountingDateOnCreate` (POST-only, no pisa PUT/PATCH).
- [x] E2E de CP-1 a CP-5 + CA + regresión del bug §6.2 — 14/14 en verde
      (`e2e/tests/flows/invoice-accounting-date.mocked.spec.js`).
- [x] Vitest de `contract-ui` — 4179/4179 en verde (incluye los 51 de ETP-3836).
- [x] Sonar Java — 0 issues en líneas cambiadas (`check-sonar-issues.sh develop`).
- [~] Sonar coverage frontend — **NO verificable**: `sonar-coverage.sh`/`sonar-check.sh` viven ahora
      en `schema_forge_core` post-split y resuelven la raíz del repo relativa a su propia ubicación,
      así que el project key devuelto no coincide con `schema_forge`. Confirmado como bug de
      tooling, no de este cambio — descartado en vez de reportar un dato falso. Merece ticket propio.
- [x] Docs actualizadas: `sales-invoice.md`, `purchase-invoice.md`, `neo-headless-extensibility.md`,
      `feedback.md` (nueva entrada del re-revert) — verificadas contra el código real, sin
      inconsistencias.
- [ ] PR en ambos repos con el template obligatorio: Tests agregados, Tests ejecutados,
      Validación funcional.

---

## 10. Referencias

- Ticket: https://etendoproject.atlassian.net/browse/ETP-5273
- PR de la reversión (backend): https://github.com/etendosoftware/com.etendoerp.go/pull/741
- PR de la reversión (config): https://github.com/etendosoftware/etendo_schema_forge/pull/914
- Commits del "antes": `c6d0aabc` (backend), `aa009f51` (config)
- `docs/feedback.md:319-334` — registro de la redefinición de alcance de ETP-4531
- `docs/neo-headless-extensibility.md:670-734` — patrón `blockCalloutFieldUpdate`
- `CLAUDE.md` — Window Change Integrity Protocol, política de documentación
