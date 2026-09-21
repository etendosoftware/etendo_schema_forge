# ETP-5321 — "Descuento total": Decimales y Límite de 100 — Investigación y Plan de Solución

**Ticket:** [ETP-5321](https://etendoproject.atlassian.net/browse/ETP-5321) — El campo "Descuento total" no permite ingresar valores decimales
**Relacionados:**
- [ETP-5107](https://etendoproject.atlassian.net/browse/ETP-5107) — Input de precio: separador decimal inconsistente. Introdujo `parseLocaleNumber()` (`tools/app-shell/src/lib/parseLocaleNumber.js`), el parser canónico que esta tarea reutiliza. Ver `docs/plans/2026-09-08-etp5107-price-input-locale-fix.md`.
- [ETP-4277](https://etendoproject.atlassian.net/browse/ETP-4277) — Añadió `min:0`/`max:100` al campo de descuento por línea en `decisions.json` (commit `c7c0ae9fb`). Ese trabajo ya cubre parte de lo que pide este ticket.
- [ETP-5132](https://etendoproject.atlassian.net/browse/ETP-5132) — Fix del signo del descuento con cantidad negativa, mismo archivo (`DocumentTotalsPanel.jsx`) que esta tarea vuelve a tocar.
**Branch:** `feature/ETP-5321` (creada desde `develop`, checkout principal, sin worktree — commit base `3e94e93a8`)
**Fecha:** 2026-09-18
**Estado:** Investigación completa, causa raíz confirmada en vivo contra `https://app.etendo.software/`. Implementación NO iniciada — plan pendiente de confirmación con el usuario antes de pasar a DEV.

## 0. Resumen (leer primero)

El ticket reporta dos problemas sobre los campos de descuento (Presupuesto, Pedido y Factura, compra y venta):

1. "Descuento total" (cabecera) no acepta decimales.
2. Ni "Descuento total" ni "% de descuento" por línea limitan el valor a 100.

**Hallazgo principal: de los dos problemas reportados, solo uno sigue vigente.**

- El **Problema 2 en la línea** ("% de descuento" por línea no limita a 100) y el **Problema 1 en la línea** (decimales) **YA ESTÁN RESUELTOS** en el código actual de `develop`, y se confirmó en vivo que funcionan correctamente. Provienen de trabajo previo: ETP-4277 (min/max en `decisions.json`) y ETP-5107 (parseo con separador decimal `,`/`.` vía `parseLocaleNumber` en `InlineLinesPanel.jsx`).
- El **Problema 1 en la cabecera** ("Descuento total" no acepta decimales) **SÍ ES UN BUG REAL**, confirmado en vivo. Vive en `DocumentTotalsPanel.jsx` — el único componente de totales compartido por las 6 ventanas del ticket (renderizado por `DetailView.jsx` para todo documento no de partida doble). Su input hace su propio parseo numérico ad-hoc en vez de usar `parseLocaleNumber()`, el helper canónico que ETP-5107 creó exactamente para esta clase de bug. Al escribir `10,5`, la coma se descarta silenciosamente (`e.target.value.replace(/[^\d.]/g, '')`), quedando `105`, que el clamp existente (`Math.min(100, ...)`) convierte en `100`. El campo *parece* rechazar decimales o comportarse como entero, pero la causa real es la pérdida de la coma, no un tipo de columna entero (la columna AD subyacente `EM_Etgo_Total_Discount` es `decimal`, confirmado en `schema-raw.json` de las 5 ventanas).
- El **Problema 2 en la cabecera** es consecuencia directa del anterior: el clamp a 100 en sí funciona, pero opera sobre un valor ya corrompido — el usuario que escribe un descuento fraccionario termina, sin darse cuenta, con un descuento del 100%. Es corrupción de datos, no solo un problema de UX.

**La solución:** hacer que el input de "Descuento total" en `DocumentTotalsPanel.jsx` reutilice `MaskedAmountInput` (`tools/app-shell/src/components/forms/fields.jsx`, ETP-5107) — el mismo componente que `InlineLinesPanel.jsx` ya usa hoy para el campo de descuento **por línea** (confirmado funcionando en vivo) — en vez de su regex + `Number()` caseros. `MaskedAmountInput` encapsula el filtrado de teclas (dígitos + un separador decimal, coma o punto según locale) y siempre reporta hacia afuera el valor limpio y el `Number` ya parseado (usa `parseLocaleNumber` internamente), así que no hace falta recablear el parseo a mano. Al ser un componente compartido por las 6 ventanas, un único fix las cubre todas.

## 1. Qué reporta ETP-5321

Dos problemas en los campos de descuento de Presupuestos, Pedidos y Facturas (compra y venta):

1. **"Descuento total" configurado como entero** — no acepta decimales (ej. `10.5`).
2. **Sin límite máximo de 100** — tanto "Descuento total" como "% de descuento" por línea aceptan valores > 100 sin error ni límite.

Comportamiento esperado: ambos campos aceptan decimales y limitan el valor a [0, 100], mostrando un mensaje de error claro si se excede.

Módulos afectados: Presupuesto, Pedido y Factura — compra y venta (6 ventanas).

## 2. Método de investigación

1. Lectura del código fuente relevante en `tools/app-shell/src` (este repo).
2. Lectura de `artifacts/*/decisions.json` y `artifacts/*/schema-raw.json` de las 5 ventanas con línea de descuento (sales-order, purchase-order, sales-invoice, purchase-invoice, sales-quotation) para confirmar el tipo real de columna AD y la configuración `min`/`max` actual.
3. `git log`/`git log -S` para fechar cuándo se introdujo cada pieza relevante (`max:100` en `decisions.json`, `parseLocaleNumber.js`).
4. Reproducción en vivo contra `https://app.etendo.software/` (entorno que sigue `develop`; el entorno local no estaba disponible durante esta investigación). Se usó un Pedido de Venta en borrador para "Juan Perez" con una línea de producto "Fernet" (44,00 €). El borrador se eliminó al finalizar la prueba — no quedaron datos persistidos.

## 3. Causas raíz

### 3.1 "% de descuento" por línea — YA RESUELTO (sin acción)

- `artifacts/{sales-order,purchase-order,sales-invoice,purchase-invoice,sales-quotation}/decisions.json` — el campo de descuento de línea (`discount` o `etgoDiscount` según ventana) ya declara `"min": 0, "max": 100` en las 5 ventanas. Añadido por ETP-4277 (`c7c0ae9fb`), muy anterior a este ticket.
- `InlineLinesPanel.jsx`'s `clampToMax()`/`isValueBelowMin()` (líneas 659-679) ya parsean con `parseLocaleNumber()` (añadido por ETP-5107, commit `57932dd35`, 2026-09-10) — un valor tecleado con coma (`10,5`) se interpreta correctamente, y un valor por encima de 100 se clampa a 100 al confirmar (blur).
- **Confirmado en vivo:** en la línea "Fernet" del pedido de prueba, se escribió `150` en "% de descuento" → se guardó como `100`. Se escribió `10,5` → se guardó y recalculó correctamente (importe bruto de línea = 47,65 €, coherente con 10,5% de descuento + 21% IVA), sin error.

### 3.2 "Descuento total" (cabecera) — BUG REAL (causa raíz)

`tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx:192-206`:

```jsx
<input
  type="text"
  inputMode="numeric"
  value={inputPct}
  onChange={e => {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    setInputPct(raw === '' ? 0 : Number(raw));
  }}
  onBlur={e => {
    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    setInputPct(v);
    onTotalDiscountChange?.(v);
  }}
  ...
/>
```

Este input NUNCA fue migrado a `parseLocaleNumber()` durante ETP-5107 — esa tarea investigó y arregló específicamente los inputs de precio en líneas y en la ficha de Producto (`InlineLinesPanel.jsx`, `DataTable.jsx`, `ProductPriceBar.jsx`), no este widget de descuento total de cabecera. Confirmado por ausencia de cualquier mención a "descuento total"/`totalDiscount` en el plan de ETP-5107 (`docs/plans/2026-09-08-etp5107-price-input-locale-fix.md`) ni en su verificación posterior (`docs/plans/2026-09-13-etp5107-experimental-server-verification.md`) — quedó fuera de alcance de aquella tarea, no fue un olvido detectado y descartado.

El `onChange` descarta cualquier carácter que no sea dígito o `.` literal — la coma (separador decimal en locale español) se pierde en cada pulsación, no se convierte en punto. El resultado es que "escribir 10,5" termina siendo "105" antes de tocar el clamp.

**Confirmado en vivo** (mismo pedido de prueba, línea Fernet con 10,5% ya aplicado):
1. Clic en "+ Añadir descuento total", se escribió `10,5` en el input de porcentaje.
2. Mientras se escribía, el campo mostraba `105` (coma descartada) y la vista previa de descuento ya mostraba `-39,38 €` (equivalente a 100% del subtotal parcial — el clamp a 100 ya estaba actuando sobre el valor corrompido).
3. Al perder el foco: toast "Descuento total guardado" — el valor final persistido fue `100`, no `10,5`.

### 3.3 La columna AD subyacente no es un entero

`schema-raw.json` de las 5 ventanas confirma que `EM_Etgo_Total_Discount` es `"type": "decimal"` (maxLength 22) en todas — contradice la causa que plantea el ticket ("configurado como campo numérico entero"), pero produce un síntoma equivalente desde la perspectiva del usuario: un decimal tecleado con coma se convierte silenciosamente en un entero grande, que luego se clampa a 100. **No se necesita ningún cambio de metadata AD/backend** — es puramente un bug de parseo en el frontend.

## 4. Propuesta de solución

**Alcance:** únicamente `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx` (componente compartido único; sin cambios en `decisions.json` de ninguna ventana, sin cambios de generador, sin cambios de AD/backend).

**Reutilizar `MaskedAmountInput` en vez de recablear `parseLocaleNumber` a mano.** `tools/app-shell/src/components/forms/fields.jsx` ya exporta `MaskedAmountInput` (ETP-5107) — el componente que `InlineLinesPanel.jsx`'s `EditCell` usa hoy, en modo `bare`/sin agrupación de miles, para el campo "% de descuento" **por línea** que confirmamos funcionando correctamente en vivo (§3.1):

```jsx
// InlineLinesPanel.jsx:841-851 — patrón ya en producción para un campo numérico tipo 'number'/percent
<MaskedAmountInput
  bare
  grouping={isTwoDecimal}      // false para 'number'/'percent' — sin separador de miles
  inputMode={col.type === 'integer' ? 'numeric' : 'decimal'}
  value={value}
  onCommit={(parsed, clean) => onCommit(clean)}
  className={editInputClassName(isNumeric, isInvalid)}
/>
```

`MaskedAmountInput` ya resuelve, con una sola implementación canónica y probada: filtrado de teclas (dígitos + el separador decimal configurado, coma o punto, según `getCurrencyFormatConfig()`), rechazo silencioso de letras/segundo separador, y reporta siempre hacia afuera el valor limpio (`clean`, string sin separador de miles) y el `Number` ya parseado (`parsed`, vía `parseLocaleNumber` interno) — nunca el string de pantalla agrupado. No hay que reimplementar nada de ese parseo en `DocumentTotalsPanel.jsx`.

Cambios concretos en `DocumentTotalsPanel.jsx` (líneas 192-206 actuales):

1. Importar `MaskedAmountInput` desde `@/components/forms/fields.jsx` (mismo path que `InlineLinesPanel.jsx`).
2. Sustituir el `<input type="text">` manual por:
   ```jsx
   <MaskedAmountInput
     bare
     grouping={false}
     inputMode="decimal"
     value={inputPct}
     onChange={(clean, parsed) => setInputPct(parsed ?? 0)}
     onCommit={(parsed) => {
       const v = Math.max(0, Math.min(100, parsed ?? 0));
       setInputPct(v);
       onTotalDiscountChange?.(v);
     }}
     className="w-12 rounded border border-border-control px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-focus-ring"
     data-testid="TotalDiscountInput"
   />
   ```
   `inputPct` sigue siendo un `Number` en el estado del componente (sin cambios en `resolvePersistedTotals`/`hasPendingEdit`/`computeDocumentTotals`, que ya asumen `Number` hoy) — el cambio queda contenido al propio input.
3. **Signo negativo:** `MaskedAmountInput`/`filterMaskChars` permite un `-` inicial por diseño (lo necesita para precios negativos, ETP-4567) — no expone una prop para desactivarlo a nivel de componente. Para "Descuento total" (que nunca debe ser negativo), el `Math.max(0, ...)` existente en `onCommit` ya lo neutraliza al confirmar — igual que hoy. Si se quiere bloquear el carácter `-` también mientras se escribe (no solo al confirmar), sería una mejora aparte a `MaskedAmountInput` (prop `allowNegative`), fuera del alcance mínimo de este ticket — dejar como nota para DEV, no bloqueante.
4. Mantener por ahora el clamp silencioso (sin toast) al superar 100 — coherente con el comportamiento actual del campo de línea, que tampoco muestra error al clampar (ver Pregunta abierta en §5).

No se requieren cambios en: `decisions.json` de ninguna ventana, la definición de columna AD, `InlineLinesPanel.jsx`, `MaskedAmountInput`/`fields.jsx`, archivos de generador/pipeline. Es un fix de Developer (Schema Forge Developer) puro, y de alcance más pequeño de lo inicialmente estimado — reutiliza un componente existente en vez de introducir una segunda ruta de parseo.

## 4.1. Post-implementación: ¿`MaskedAmountInput` "a secas" pierde las restricciones de la implementación anterior? (verificado en vivo, 2026-09-20)

Pregunta que surgió tras implementar el fix: la implementación anterior (el regex casero) solo dejaba escribir dígitos positivos, sin signo y sin separador de miles — `MaskedAmountInput` es un componente pensado para importes, que sí permite un `-` inicial y sí sabe agrupar miles (cuando `grouping: true`). ¿Al reusarlo "a secas" para "Descuento total" se perdieron esas restricciones?

**Respuesta corta: no, porque esas restricciones NUNCA vivieron dentro del input — ni antes ni ahora.** `MaskedAmountInput` es puramente un enmascarador de caracteres (dígitos + un separador decimal + opcional `-` inicial); no conoce el concepto de "mínimo"/"máximo" de ningún campo. La limitación de negocio (rango `[0, 100]`) siempre fue responsabilidad del **llamador**, aplicada en `onCommit`/blur — así funcionaba ya la implementación anterior de `DocumentTotalsPanel.jsx` (`Math.max(0, Math.min(100, ...))` ya existía antes de este fix) y así funciona hoy el campo de línea "% de descuento" (`InlineLinesPanel.jsx`'s `clampToMax`/`isValueBelowMin`, fuera de `MaskedAmountInput`). Confirmado con 4 pruebas en vivo contra el entorno local (rama `feature/ETP-5321`), pedido de venta de prueba, producto "E2E Product Alpha" (12,00 €):

| Caso | Campo de línea (`InlineLinesPanel.jsx`) | Campo de cabecera (`DocumentTotalsPanel.jsx`, este fix) |
|---|---|---|
| Escribir `150` | Se clampa a `100` silenciosamente (`clampToMax`) | Se clampa a `100` silenciosamente (`Math.min(100,...)`) — **idéntico** |
| Escribir `-50` | El carácter `-` SÍ aparece mientras se escribe (mismo `MaskedAmountInput`) — pero al perder el foco, `isValueBelowMin` lo **rechaza con un toast** ("El valor debe ser al menos 0") y el valor **vuelve a 0** (no al valor negativo, ni a 0 silenciosamente) | El carácter `-` también aparece mientras se escribe — al perder el foco, `Math.max(0, ...)` lo clampa **silenciosamente a 0**, sin toast (mismo comportamiento que la implementación VIEJA de este mismo campo, que ya tenía ese mismo `Math.max(0,...)` antes de este fix) |

La única diferencia real entre los dos campos es **min**, no max: el campo de línea usa un patrón "rechazar + toast" (`isValueBelowMin`) para el mínimo, mientras que cabecera usa "clampar en silencio" (`Math.max`) — pero esa diferencia **ya existía en el código previo al fix** (el regex casero de cabecera ya hacía `Math.max(0, ...)` sin toast); este fix no la introduce ni la agrava. Es la misma asimetría ya anotada como pregunta abierta más abajo (mensaje de error explícito), no un defecto nuevo.

**Sobre "poner miles":** con `grouping={false}` (el modo usado tanto en línea como en cabecera), no hay agrupación visual de miles, y al ESCRIBIR, `filterMaskChars` interpreta cualquier `.`/`,` tecleado como EL separador decimal (nunca como agrupador) — escribir `1.234` produce el valor `1,234` (uno con tres decimales), no mil doscientos treinta y cuatro. La única vía real para que "miles" aparezcan es **pegar** (paste) un texto con forma de importe agrupado (ej. pegar `1.500`): `handlePaste` siempre usa la heurística `parseAmountInput` (pensada para CSV/Excel) que SÍ interpreta un separador seguido de exactamente 3 dígitos como agrupador de miles → pegar `1.500` se leería como `1500`. Esto es un comportamiento del componente compartido, **idéntico en el campo de línea ya existente** (mismo código, mismo `handlePaste`, no depende de `grouping`) — no es algo que este fix introduzca de forma exclusiva en cabecera. Y en cualquier caso, el valor resultante (`1500`) queda igualmente acotado por el `Math.min(100, ...)` al confirmar, igual que un `150` tecleado a mano.

**Conclusión:** no hizo falta un componente nuevo. Seguir el mismo patrón que ya usa "% de descuento" por línea (`MaskedAmountInput` + clamp externo en el llamador) es justamente lo consistente con cómo está diseñado el resto de la app — el propio campo de referencia que se menciona en la pregunta usa exactamente el mismo mecanismo. Construir un componente de "descuento" aparte solo para hornear el rango `[0,100]` adentro duplicaría lo que el patrón `col.min`/`col.max` + clamp-on-commit ya resuelve en todos los grids de líneas, e introduciría una segunda forma de expresar la misma regla de negocio.

### 4.1.1. Matriz exhaustiva en vivo — campo "Descuento total" (cabecera), 2026-09-20

Batería de 11 casos probados en vivo contra el entorno local (`localhost:3100` + backend `:8080`, rama `feature/ETP-5321`), pedido de venta de prueba (contacto "E2E Contact Code", línea "E2E Product Alpha" a 12,00 €). Pedido eliminado al finalizar.

| # | Caso | Se escribe | Mientras se escribe | Al confirmar (blur) | Resultado |
|---|---|---|---|---|---|
| 1 | Positivo simple | `50` | `50` | `50` | ✅ 50%, -6,00 € |
| 2 | Decimal con coma | `10,5` | `10,5` | `10,5` | ✅ -1,26 € |
| 3 | Decimal con punto | `10.5` | `10,5` (normalizado al separador del locale) | `10,5` | ✅ punto también aceptado — mismo resultado que el 2 |
| 4 | Excede 100 | `150` | `150` | `100` | ✅ clamp a 100, -12,00 € |
| 5 | Decimal que excede 100 | `150,5` | `150,5` | `100` | ✅ clamp a 100, -12,00 € |
| 6 | Negativo entero | `-50` | `-50` (el `-` sí se muestra) | `0` | ✅ clamp silencioso a 0, sin toast de error, panel se colapsa |
| 7 | Negativo decimal | `-10,5` | `-10,5` | `0` | ✅ clamp silencioso a 0 |
| 8 | "Miles" **tecleado** | `1.234` | `1,234` | `1,234` | ✅ el punto tecleado se lee como separador decimal, NUNCA como agrupador — no se convierte en 1234 |
| 9 | Doble separador decimal | `10,5,5` | `10,55` | `10,55` | ✅ el segundo separador se ignora; los dígitos siguientes se anexan a la parte decimal ya abierta |
| 10 | Letras mezcladas | `10a5` | `105` (la `a` se descarta) | `100` | ✅ ninguna letra llega al valor final; el resultado numérico igual queda acotado por el clamp |
| 11 | Campo vacío | *(borrado)* | — | `0` | ✅ se guarda como "sin descuento", panel se colapsa |
| 12 | "Miles" **pegado** (`1.500`, paste real) | — | — | — | ⚠️ **no reproducible en vivo** en esta sesión — `navigator.clipboard.writeText`/`execCommand('copy')` quedan bloqueados sin gesto de usuario real en este contexto automatizado. Verificado solo por lectura de código (`parseAmountInput`/`normalizeSeparators`, `parseAmountInput.js:126-140`): un paste que reemplaza todo el campo con `1.500` se leería como `1500` (regla "un separador seguido de exactamente 3 dígitos agrupa miles") — pero el resultado sigue acotado por `Math.min(100,...)` al confirmar, igual que el caso 4. Mismo comportamiento en el campo de línea (mismo `handlePaste`, no depende de `grouping`) — no es exclusivo de este fix. Pendiente de una verificación manual real (pegado desde teclado humano) si se quiere cerrar el 100% de la matriz.

**Conclusión de la matriz:** en los 11 casos reproducibles en vivo, el campo nunca terminó fuera de `[0, 100]`, nunca aceptó una letra en el valor final, y el separador decimal (coma o punto) se interpretó siempre correctamente — igualando el comportamiento ya validado del campo de línea, con la única asimetría conocida y pre-existente (min: rechazo-con-toast en línea vs. clamp-silencioso en cabecera, documentada en 4.1) sin cambios por este fix.

## 5. Preguntas abiertas para DEV/QA

- **¿Mensaje de error explícito al superar 100?** El ticket pide literalmente "el sistema rechaza el valor o lo limita a 100, **mostrando un mensaje de error claro al usuario**". Hoy ni el campo de línea ni el de cabecera muestran un toast al clampar (a diferencia del clamp de mínimo en `InlineLinesPanel`, que sí usa `toast.error(ui('fieldMinValueError', ...))`). Confirmar con QA/reportante si el clamp silencioso ya satisface el criterio (literalmente lo hace — "o lo limita a 100") o si hace falta añadir un toast en ambos campos (línea y cabecera) para cumplir también la parte del mensaje.
- **Cobertura de regresión en las 6 ventanas:** al ser un componente compartido, se recomienda al menos una verificación en vivo por familia de ventana (Pedido, Factura, Presupuesto) ya que cada una llega a `DetailView.jsx` a través de un `HeaderPage.jsx` generado distinto.
- **No regresionar ETP-4777/ETP-5132:** este mismo archivo tiene lógica sensible de totales persistidos (`resolvePersistedTotals`, el cálculo de `factor`) y de signo con cantidad negativa. El cambio de `inputPct` de `Number` a "string mostrado + valor parseado" debe revisarse con cuidado para no romper `hasPendingEdit` ni el cálculo de `factor` en `resolvePersistedTotals`.

## 6. Enrutamiento en el pipeline

- **DEV** — Schema Forge Developer. Archivo principal: `DocumentTotalsPanel.jsx`. Tests existentes a revisar/extender: `__tests__/DocumentTotalsPanel.vitest.jsx`, `__tests__/DetailView.totalDiscountRefresh.test.js`.
- **REVIEW** — Alex: confirmar que el import de `parseLocaleNumber` sigue el patrón canónico documentado en `CLAUDE.md`; confirmar que no hay regresión en la lógica de ETP-4777 (`resolvePersistedTotals`, factor) ni ETP-5132 (signo con cantidad negativa) en este mismo archivo; `npx sf-validate-pipeline` (no se esperan cambios en `decisions.json`/`generated/`, debería ser un no-op limpio).
- **QA** — Sentinel: los casos Given/When/Then del ticket en las 6 ventanas; regresión específica sobre ETP-4777 (totales persistidos al reabrir un documento con descuento total guardado) y ETP-5132 (signo con cantidad negativa), ya que ambos tocaron este mismo archivo recientemente.
- **DOCS** — Sage: revisar si algún `docs/generated-custom-windows/<window>.md` de las 6 ventanas afectadas menciona el comportamiento del input de descuento total y actualizarlo si quedó desactualizado.
