# ETP-5260 — Plan de implementación: orden de botones de acción en documentos de Compras y Ventas

- **Ticket:** ETP-5260 (Historia, prioridad Menor)
- **Rama:** `feature/ETP-5260`
- **Fecha:** 2026-09-10
- **Estado del plan:** Fases 1-4 completas y verificadas (código y tests en stage, sin commitear); Fase 5 (documentación) en curso.

### Estado por fase (actualizado 2026-09-11)

| Fase | Tareas | Estado |
|---|---|---|
| 1 — Núcleo compartido | T1, T2 | ✅ Completa. `DetailView.jsx` acepta `topbarSecondary`, con `renderSlotAction` compartido y el comentario de clasificación junto al de ETP-4933 |
| 2 — Componente secundario | T3 | ✅ Completa. `DocumentSecondaryActions.jsx` en `shared/`, orden Copiar enlace → Clonar → Enviar, `children` para extensiones por ventana |
| 3 — Migración por ventana | T4-T12 | ✅ Completa. 9 ventanas migradas, verificadas manualmente en navegador |
| 4 — Tests | T13 | ✅ Completa. Suite verde (unit + regresión ETP-4933 explícita) |
| 5 — Documentación | T14, T15 | 🔄 En curso (esta sesión) |

**No mover esta carpeta a `docs/plans/completed/` todavía — el trabajo está en stage, sin commitear ni mergeado.**

---

## 1. Problema

En la vista de **detalle** de un registro, la barra superior renderiza las acciones
secundarias (Copiar enlace, Clonar, Enviar por email) **a la derecha** de las acciones
primarias (Guardar, Confirmar, acciones de flujo). El Diseño Funcional de Compras y
Ventas define el orden inverso: secundarias a la izquierda, primarias a la derecha.

Evidencia confirmada en `purchase-order`, `sales-invoice` y `purchase-invoice`, estado
Borrador:

```
Actual:   [papelera] [Guardar] [Confirmar] [Clonar] [Copiar enlace]
Esperado: [Copiar enlace] [Clonar] -> [Guardar] [Confirmar]
```

### Fuera de alcance (confirmado con el solicitante)

- Botón **Cancelar** (extremo izquierdo): su posición ya es correcta.
- Icono **papelera / eliminar**: queda tal cual, no forma parte del bug visual.
- **Presencia** de botones: el ticket es de *orden*, no de qué acciones existen. Si una
  ventana no muestra "Enviar por email" donde el DF lo habilita, es otro ticket.

---

## 2. Causa raíz

Toda la barra de detalle es **un único `flex-row`** en
`tools/app-shell/src/components/contract-ui/DetailView.jsx:2884-3072`. Ahí el **orden del
código es el orden visual**. La secuencia actual es:

| Orden | Qué se renderiza | Línea |
|---|---|---|
| 1 | Botón eliminar (papelera) | ~2920 |
| 2 | `DetailMoreActionsMenu` (kebab) | 2932 |
| 3 | `extraActions` | 2949 |
| 4 | `renderSaveActions` si `saveActionsFirst` (opt-in por ventana) | 2951 |
| 5 | Botones de proceso del servidor | 2954 |
| 6 | Botones de detail-process | 3014 |
| 7 | `renderSaveActions` — **Guardar / Confirmar** | 3037 |
| 8 | Slot **`topbarRight`** | 3048 |

**El bug:** Clonar y Copiar enlace viven dentro del slot `topbarRight` (posición 8), que se
renderiza *después* de Guardar/Confirmar (posición 7).

**Por qué no alcanza con mover el slot:** el slot `topbarRight` es **un solo balde que
mezcla las dos clases de botón**. Ejemplos verificados:

- `artifacts/purchase-order/custom/PurchaseOrderActions.jsx:213-224`
  → `[Gestionar recepción y factura (PRIMARIA)] [Clonar] [Enviar email] [Copiar enlace]`
  La primaria va **primera** dentro del slot.
- `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx:122-161`
  → `[Clonar] [Crear Devolución (PRIMARIA)] [Copiar enlace:153] [Crear Factura (PRIMARIA):155]`
  Completamente **intercalado**.

Mover el slot completo a la izquierda arreglaría sólo **Borrador** (donde casi todo el
contenido del slot está gateado por `isCompleted` y sobreviven únicamente Clonar y Copiar
enlace) y dejaría **Completado** igual de roto, porque las primarias viajarían a la
izquierda junto con las secundarias.

### Trampa de regresión documentada (ETP-4933)

`DetailView.jsx:3039-3047` lleva un comentario explícito: el slot **ya estuvo** antes de las
save actions y se movió **a propósito**, porque ponía el Confirmar de las ventanas de
devolución a la izquierda de Guardar. `return-material-receipt` y
`return-to-vendor-shipment` renderizan `ConfirmWithCreditButton` (una **primaria**) en
**Borrador**, dentro del slot.

> Mover el slot a ciegas reintroduce exactamente la regresión de ETP-4933.

---

## 3. Arquitectura de wiring (mapa completo verificado)

Las 9 ventanas desembocan en la **misma prop `topbarRight`** de `DetailView`, pero llegan por
**dos caminos distintos**:

**Camino A — declarativo** (`decisions.json` → `customComponents.topbarRight` → `HeaderPage`
generado):

| Ventana | Componente del slot |
|---|---|
| `purchase-order` | `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` |
| `sales-order` | `artifacts/sales-order/custom/OrderCreateInvoice.jsx` |
| `sales-quotation` | `artifacts/sales-quotation/custom/QuotationTopbarActions.jsx` |
| `goods-receipt` | `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx` |
| `goods-shipment` | `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` |

**Camino B — prop hardcodeada** en `tools/app-shell/src/windows/custom/<ventana>/index.jsx`,
que **shadowea** cualquier `topbarRight` de `decisions.json`:

| Ventana | Wiring | Componente del slot |
|---|---|---|
| `sales-invoice` | `custom/sales-invoice/index.jsx:202` | `custom/sales-invoice/SalesInvoiceTopbar.jsx:27-34` |
| `purchase-invoice` | `custom/purchase-invoice/index.jsx:198` | `custom/purchase-invoice/PurchaseInvoiceTopbar.jsx:50-63` |
| `return-material-receipt` | `custom/return-material-receipt/index.jsx` | `ConfirmWithCreditButton.jsx` |
| `return-to-vendor-shipment` | `custom/return-to-vendor-shipment/index.jsx` | `ConfirmWithCreditButton.jsx` |

Nota: `sales-invoice` declara `topbarRight: "InvoiceTopbarExtra"` en `decisions.json`, pero la
prop explícita del wrapper gana; `SalesInvoiceTopbar` **nestea** `InvoiceTopbarExtra` dentro
(para el badge de estado de pago / SII), y añade Clonar y Copiar enlace por su cuenta.

**Consecuencia clave para el plan:** como los 9 casos pasan por la misma prop de
`DetailView`, y como las 9 ventanas ya tienen wrapper custom propio en `registry.js`,
**el fix NO requiere tocar el generador** (`generate-frontend.js` /
`generate-contract.js` / `resolve-curated.js`) ni publicar `schema_forge_core`.
Tampoco requiere `make regen`, porque no se modifica ningún `decisions.json`.

---

## 4. Solución propuesta: partir el slot en dos

Un solo slot no puede satisfacer un contrato de dos posiciones. La propuesta es **añadir un
segundo slot** en `DetailView`, de forma **aditiva y retrocompatible**:

```
[papelera] [kebab] [extraActions]
  -> topbarSecondary   <-- NUEVO: Copiar enlace, Clonar, Enviar por email
  -> process buttons
  -> renderSaveActions (Guardar / Confirmar)
  -> topbarRight       <-- SIN CAMBIOS: primarias de flujo por ventana
```

**Por qué aditivo y no mover el slot existente:** `topbarRight` conserva su posición actual,
así que ninguna ventana cambia de comportamiento hasta que se migren explícitamente sus
botones secundarios. En particular, el `ConfirmWithCreditButton` de las dos ventanas de
devolución **se queda en `topbarRight`**, a la derecha de Guardar — la regresión de ETP-4933
no puede reproducirse por construcción, no por vigilancia.

### Orden interno del grupo secundario

El DF define el orden **`Copiar enlace · Clonar · Enviar por email`**. El código actual
renderiza **Clonar antes que Copiar enlace** en todas las ventanas. Por lo tanto **también
hay que invertir el orden dentro del grupo**, no sólo mover el grupo. Esto es trabajo real y
fácil de pasar por alto.

---

## 5. Tareas

### Fase 1 — Núcleo compartido (1 archivo)

- **T1.** En `DetailView.jsx`: aceptar la prop `topbarSecondary` y renderizarla entre
  `extraActions` (2949) y el bloque de botones de proceso (2954), con el mismo contrato de
  props que recibe hoy `topbarRight` (`data`, `recordId`, `token`, `apiBaseUrl`, `api`,
  `onProcess`, `onRefresh`, `onSave`, `isDirty`, `saveGate`).
- **T2.** Documentar en un comentario, junto al de ETP-4933, **cuál slot es para qué clase de
  acción**, para que el próximo que agregue un botón no vuelva a mezclarlas.

### Fase 2 — Componente secundario compartido (1 archivo nuevo)

- **T3.** Crear `tools/app-shell/src/windows/custom/shared/DocumentSecondaryActions.jsx`
  que renderice, en el orden del DF: `CopyRecordLinkButton` → `CloneButton` →
  `SendDocumentButton`, cada uno con su propio gate de visibilidad vía props
  (`windowName`, `onClone`, `showSend`, …).

  Esto ataca de raíz la deuda ya registrada en ETP-4781: hoy existen **tres copias
  divergentes** del botón Clonar (`purchase-order`, `sales-order` y un `CloneButton.jsx`
  compartido que casi nadie usa). Un único componente secundario elimina la divergencia y
  garantiza que el orden sea consistente por construcción — que es literalmente el criterio
  de aceptación nº 5.

### Fase 3 — Migración por ventana (9 ventanas)

Para cada ventana: **quitar** `CopyRecordLinkButton` / `CloneButton` / `SendDocumentButton`
de su componente `topbarRight`, y **pasar** `DocumentSecondaryActions` como
`topbarSecondary`. El componente `topbarRight` queda **sólo con las primarias de flujo**.

Orden de ejecución sugerido (de menor a mayor riesgo):

1. **T4.** `purchase-order` — es el caso reportado y el más simple (slot con 1 primaria).
2. **T5.** `sales-order`
3. **T6.** `sales-quotation`
4. **T7.** `purchase-invoice`
5. **T8.** `sales-invoice` — cuidado: hay que preservar el nesting de `InvoiceTopbarExtra`
   (badge de saldo pendiente / Pagado), que por el DF debe quedar en el **extremo derecho**.
6. **T9.** `goods-receipt` — el peor caso: primarias y secundarias intercaladas.
7. **T10.** `goods-shipment`
8. **T11.** `return-material-receipt` — zona ETP-4933, verificar Borrador explícitamente.
9. **T12.** `return-to-vendor-shipment` — ídem.

Para las ventanas del **camino A**, la prop nueva se agrega en su
`windows/custom/<ventana>/index.jsx` (todas tienen wrapper propio, confirmado en
`registry.js`), evitando por completo el generador.

### Fase 4 — Tests

- **T13.** Delegar a **Tester** (`test-generator`), obligatorio por convención del repo.
  Cobertura mínima:
  - Unit sobre `DetailView`: con `topbarSecondary` + `topbarRight` + save actions, el orden
    de aparición en el DOM es secundarias → Guardar/Confirmar → primarias.
  - Unit sobre `DocumentSecondaryActions`: orden Copiar enlace → Clonar → Enviar email, y
    cada gate de visibilidad.
  - **Test de regresión ETP-4933**: en las dos ventanas de devolución, en Borrador,
    `ConfirmWithCredit` sigue apareciendo **después** de Guardar.
  - E2E (según `docs/e2e-testing-guide.md`, referencia
    `e2e/tests/flows/row-quick-actions.mocked.spec.js`): matriz de orden por documento y por
    estado, usando la tabla del ticket como oráculo.

### Fase 5 — Documentación

- **T14.** Actualizar `docs/ui-customization.md` con el nuevo punto de extensión
  `topbarSecondary` y la regla de clasificación primaria/secundaria.
- **T15.** Actualizar las guías `docs/generated-custom-windows/<ventana>.md` de las 9
  ventanas tocadas (política de documentación atómica del repo: cambio de código + doc en la
  misma unidad).

---

## 6. Punto de decisión — RESUELTO (2026-09-10)

> **Decisión confirmada:** la reubicación de Guardar queda **FUERA DE ALCANCE** de ETP-5260.
> Se revisará en un ticket posterior si hace falta. No se toca el mecanismo
> `saveActionsFirst`. Detalle del análisis que llevó a la decisión, abajo.


El DF, para `goods-receipt` en Completado, lista
`[Crear Factura] [Crear Devolución] [Guardar]` — es decir **Guardar después de las primarias
de flujo**. Pero `DetailView` renderiza `renderSaveActions` **antes** del slot de primarias.

Los criterios de aceptación del ticket **no piden** eso: el AC nº 2 sólo exige que las
secundarias queden a la izquierda de las primarias de flujo, y no dice nada sobre Guardar
frente a las primarias. **Propuesta: dejarlo fuera de alcance** y no tocar el mecanismo
`saveActionsFirst` existente. Requiere confirmación antes de empezar la Fase 3.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Regresión ETP-4933 (Confirmar a la izquierda de Guardar en devoluciones) | El slot `topbarRight` no se mueve; el cambio es aditivo. Más test de regresión explícito (T13). |
| Clasificar mal un botón como secundario | Revisar botón por botón contra la tabla del ticket; los botones de flujo con etiqueta de texto son primarios, los de icono suelto son secundarios. |
| Redundancia en `registry.js` (`sales-invoice` 42/247, `sales-quotation` 39/248, `goods-movements` 36/244) | Ver corrección en §8 — no bloquea este ticket, ni es un bug real, pero conviene un ticket de limpieza. |
| Divergencia futura vuelve a aparecer | Fase 2 la elimina de raíz con un componente único en vez de 9 copias. |

## 8. Hallazgos colaterales (no parte de este ticket)

- **Código huérfano:** `tools/app-shell/src/windows/custom/purchase-order/PurchaseOrderActions.jsx`
  no lo importa nadie; el real vive en `artifacts/purchase-order/custom/`. No tocar.
- **`registry.js` — corrección sobre lo anotado en la Fase 3 original:** no son "claves duplicadas"
  en el sentido de un error de sintaxis JS — son **dos objetos distintos**, `windowLoaders` (línea
  17) y `customLoaders` (línea 231), y la resolución `customLoaders[item.name] ||
  windowLoaders[item.name]` (línea ~275, comentada explícitamente como
  `customLoaders > windowLoaders > PlaceholderWindow`) hace que `customLoaders` gane **siempre por
  diseño**, no por accidente de "última clave gana". Verificado: `goods-movements` aparece en
  ambos objetos (17→36 y 231→244) y `sales-invoice`/`sales-quotation` también (42/247, 39/248).
  `goods-shipment`, en cambio, **NO** está duplicado — sólo vive en `customLoaders` (línea 40); la
  entrada de la tabla original del plan que lo agrupaba con `goods-movements` era imprecisa.
  El hallazgo real, entonces, no es un riesgo de comportamiento (el resolver ya hace lo correcto)
  sino **código muerto**: las tres entradas de `windowLoaders` para ventanas que también están en
  `customLoaders` nunca se alcanzan y podrían eliminarse en un ticket de limpieza aparte.
- **Hover muerto:** los handlers `onMouseEnter`/`onMouseLeave` de los botones Clonar asignan
  el mismo valor en ambas ramas — el hover no hace nada (ya detectado en ETP-4781).
- **Hook `check-detailview-growth.mjs` (`.claude/hooks/`):** bloquea cualquier `Write`/`Edit` sobre
  `DetailView.jsx` que aumente su cantidad de líneas respecto del merge-base con `develop`. La
  Fase 1 lo cumplió por diseño: el bloque `topbarRight` viejo (18 líneas, con el comentario extenso
  de ETP-4933) se reemplazó por una llamada de una línea a `renderSlotAction` (helper compartido
  con `topbarSecondary`, definido una sola vez), de modo que el archivo terminó con **menos**
  líneas que al empezar pese a agregar una prop y un slot nuevos. Cualquier trabajo futuro sobre
  este archivo debe planificar una extracción equivalente si necesita agregar código, no asumir
  que el hook se puede silenciar.
- **Las dos ventanas de devolución estuvieron mal hasta la corrección final** — el borrador inicial
  de la migración movió el slot `topbarRight` completo (siguiendo el malentendido "el orden interno
  del slot alcanza"), lo que reintrodujo momentáneamente la regresión ETP-4933 en
  `return-material-receipt`/`return-to-vendor-shipment` (`ConfirmWithCreditButtonBase` a la
  izquierda de Guardar en Borrador). La corrección fue exactamente la que motivó la regla de
  clasificación documentada en `docs/ui-customization.md` §3b: no mover `topbarRight`, migrar sólo
  el botón Copiar enlace (sin Clonar/Enviar, que estas dos ventanas no tienen) a `topbarSecondary`.
- **Movimiento global del kebab (`DetailMoreActionsMenu`):** al insertar `topbarSecondary` antes de
  Guardar, el kebab también se reubicó — antes vivía inmediatamente después del botón eliminar
  (papelera) y antes de `extraActions`; ahora vive después del grupo secundario y antes de Guardar,
  porque el kebab es en sí mismo un contenedor de acciones secundarias (`window.menuActions`). Este
  es un cambio a nivel de `DetailView.jsx`, así que afecta a las **15 ventanas** que declaran
  `menuActions`, no sólo a las 9 migradas a `topbarSecondary`: las 8 de Compras/Ventas del ticket
  más `amortization`, `chart-of-accounts`, `fiscal-calendar`, `goods-movements`,
  `matched-purchase-invoices`, `physical-inventory`, y `simple-g-l-journal`.
