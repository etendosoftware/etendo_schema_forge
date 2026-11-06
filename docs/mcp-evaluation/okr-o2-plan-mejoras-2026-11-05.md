# KR2.1 — Plan de correcciones (después del cierre del 5 de noviembre)

Sale de `okr-o2-cierre-2026-11-05.md`: 14 derrotas, ninguna por no hacer la tarea. 7 se pierden por
un error sin recuperar y 7 por fuga de llamadas. Este plan dice qué cambiar, dónde, cómo se prueba y
qué pruebas del KR se vuelven a correr para medirlo.

Código: `modules/com.etendoerp.go` (GO). Specs: `schema_forge/artifacts/<spec>/decisions.json`
(la pipeline lo publica con `push-to-neo`). Reglas del repo que aplican: lo específico de una
ventana va en un `NeoHandler` de esa entidad, nunca en `NeoCrudHandler`, `NeoSelectorService`,
`NeoDefaultsService` ni `NeoServlet`.

## Resumen

| Fase | Qué | Tipo de cambio | Derrotas que ataca | KR esperado |
|---|---|---|---|---|
| 0 | Context7 y el harness | Configuración | q-financial-reports | 63 % (22/35) |
| 1 | Bugs y mensajes de error | Código chico | f-bank-account-transfer (con la fase 0) | 66 % (23/35) |
| 2 | Filtros que faltan | Specs (decisions.json) y un handler | w-draft-order-edit-delete; f-order-direct-invoice y f-physical-inventory (con la fase 1) | 74 % (26/35) |
| 3 | Menos metadatos por escritura | Textos de herramientas | los 7 de fuga | [INFERENCIA] se mide |
| 4 | Escrituras en una llamada | Handlers por entidad | w-cost-center-project, w-warehouse-crud, w-product-crud, stock | [INFERENCIA] se mide |

Los porcentajes de las fases 0 a 2 salen de dar vuelta las derrotas donde Etendo ya gastaba menos
tokens (21 → 26 de 35). Las fases 3 y 4 apuntan a las 7 de fuga; hacen falta 2 de ellas para el 80 %.

## Fase 0 — Configuración (sin código)

### 0.1 `docs-sin-context7`: cuota de Context7

- **Problema**: `docs` respondió 429 *Monthly quota exceeded* en 6 pruebas. Es un error de la
  herramienta y cuenta como error sin recuperar.
- **Dónde**: `mcp/Context7DocsClient.java`, llamado desde `McpToolRouter#handleDocs`, que lee la
  clave de la preferencia `PREF_CONTEXT7_TOKEN` (`resolveContext7Token`). Sin preferencia, la
  llamada va sin autenticar y comparte la cuota gratuita.
- **Cambio**: cargar la preferencia con una API key de Context7 con cuota en el entorno de medición
  (y en producción).
- **Después, en la fase 1**: si Context7 falla, que `docs` responda con el índice local de temas y un
  aviso, no con error.
- **Medir**: `q-financial-reports`, `f-bank-account-transfer`.

### 0.2 Harness

- `e-closed-period`: cerrar diciembre en el setup de **cada** intento. Hoy un intento que abre el
  período deja abierto el siguiente (en la corrida del 5 nov, a2 lo abrió y a1 completó sin error).
  Va en `mcp-tests/suites/okr.yaml` (setup de Etendo de esa prueba).
- `w-send-invoice`: correrla solo en un entorno con jsreport (ETP-6013).

## Fase 1 — Bugs y mensajes de error (código chico)

### 1.1 `parentId-accountingConfiguration`

- **Problema**: `etendo_list` con `spec: financial-account`, `entity: accountingConfiguration` y
  `parentId` responde `financialAccountId is required` (f-bank-account-transfer, 3 veces).
- **Dónde**: `schemaforge/FinancialAccountAccountingHandler#resolveAccountId` solo lee
  `financialAccountId`; el router pasa el padre como `parentId`
  (`McpConstants.PARAM_PARENT_ID`). `ReconciliationHandler` (línea ~1128) tiene la misma
  validación: revisar si tiene el mismo problema.
- **Cambio**: aceptar también `parentId` como id de la cuenta.
- **Test**: JUnit del handler: lista con `parentId` y sin `financialAccountId` devuelve las filas;
  sin ninguno de los dos, el mismo error de hoy.
- **Medir**: `f-bank-account-transfer`.

### 1.2 `errores-no-reintentables`: PDF que no existe

- **Problema**: `etendo_get_document_pdf` responde *This document has no PDF yet* y el agente
  reintenta en loop (15 veces en w-send-invoice) o lo pide sin necesidad (f-order-direct-invoice).
- **Dónde**: `mcp/McpDocumentPdfTool#unavailable`, caso `MISSING`, y su `missingHint`.
- **Cambio**: distinguir "todavía se está generando, probá en N segundos" de "no hay servicio de
  PDF en este entorno, no reintentes". Un error que no se puede resolver desde el agente debería
  decirlo para que pare.
- **Test**: JUnit de `unavailable` para los dos casos.
- **Medir**: `f-order-direct-invoice`, `w-send-invoice` (en un entorno con jsreport).

### 1.3 `acciones-fuera-de-alcance`

- **Problema**: el agente abre un período cerrado (`open-close-period-control`, acción
  `openClose`) para poder completar una factura (e-closed-period), y contabiliza un inventario
  (`posted`) que nadie pidió (f-physical-inventory, falla porque el costo no está calculado).
- **Cambio**:
  - En el error de *período cerrado* (`PeriodNotAvailable`, `McpMessageKeyHints`), decir que abrir
    el período es una decisión del usuario: preguntar antes.
  - Revisar si `posted` debe ofrecerse como acción en `physical-inventory`
    (`MCP_CONFIG.actions` puede ocultarla).
- **Medir**: `e-closed-period`, `f-physical-inventory`.

## Fase 2 — Filtros que faltan

Los filtros que se pueden usar salen del spec: `McpQuerySupport#resolveFilterProperty` rechaza un
campo que no es propiedad de la entidad o que el spec excluyó. Cada caso hay que diagnosticarlo
antes de cambiarlo.

| Filtro que pidió el agente | Pruebas | Qué revisar |
|---|---|---|
| `commercialName` en `contacts/businessPartner` | f-order-direct-invoice, e-ambiguous-customer, f-overpay-sales-invoice | [INFERENCIA] en Etendo el nombre comercial es la propiedad `name2`; ver si el spec la expone con otro nombre o la excluye |
| `businessPartner` en `bp-location/bpLocation` | e-ambiguous-customer (3 veces) | si el spec excluye el vínculo al padre; listar direcciones de un cliente es lo que el agente quiere |
| precio de un producto en una tarifa | w-draft-order-edit-delete, e-closed-period | el agente filtra `price-list` por `product`; el precio está en `productPrice`. Ofrecer el camino directo (filtro por producto y tarifa en `productPrice`, o el precio en la lectura del producto) |
| `warehouse` en `warehouse` | f-physical-inventory | contenido de un almacén: hoy son `storageBin` + `binContents` |

- **Cambio**: en `artifacts/<spec>/decisions.json`, exponer los campos; publicar con
  `push-to-neo` y `./gradlew export.database`. Actualizar la guía de cada ventana en
  `docs/generated-custom-windows/` (regla del repo).
- **Medir**: `w-draft-order-edit-delete`, `f-order-direct-invoice`, `e-ambiguous-customer`,
  `f-overpay-sales-invoice`.

## Fase 3 — Menos metadatos por escritura (textos)

En las derrotas, un intento hace 6,8 llamadas de metadatos (`etendo_whoami`, `discover`,
`schema`, `defaults`, `selectors`) y 2,5 escrituras.

### 3.1 `crear-en-pocas-llamadas`

- **Hecho que ya existe**: `etendo_create` y `etendo_update` aceptan el nombre en los campos que
  apuntan a otro registro (`McpFkResolver`, IMP-4).
- **Problema**: la descripción de `etendo_create` (`ToolRegistry`, línea ~904) no lo dice, y
  recomienda llamar a `etendo_defaults` antes de crear. Los agentes lo hacen y después buscan ids.
- **Cambio**:
  - La descripción dice que esos campos aceptan el nombre y que `etendo_defaults` es opcional
    (el servidor completa los defaults igual).
  - El error *Missing required fields that could not be auto-resolved* (`McpToolRouter`) trae,
    para cada campo con selector, los primeros valores posibles.
- **Test**: el de la descripción no se prueba por texto (regla del repo). El del error, JUnit:
  un campo obligatorio con selector vuelve con sus candidatos.
- **Medir**: re-correr las 7 de fuga; mirar la cantidad de llamadas de metadatos por intento.

### 3.2 `whoami-innecesario`

- Casi todos los intentos empiezan con `etendo_whoami`. Poner ese contexto (empresa,
  organización, moneda, idioma) en las instrucciones del servidor (`initialize`).

### 3.3 `sobrepago-explicado`

- El error de sobrepago ya explica `overpaymentAction` (`PaymentAgentSupport`, línea ~219). Pero
  los agentes consultan `docs` 3 o 4 veces **antes** de intentar, porque el schema de la acción
  `registerPayment` no lo menciona.
- **Cambio**: describir `overpaymentAction` (`leave-credit` / `refund`) en el schema de
  `registerPayment`.
- **Medir**: `f-overpay-sales-invoice`.

## Fase 4 — Escrituras en una llamada (handlers por entidad)

Holded hace estas tareas en 1 a 3 llamadas porque su herramienta de creación recibe todo junto.

| Mejora | Entidad | Cambio | Prueba |
|---|---|---|---|
| `searchKey-automatica` | `service-project`, `warehouse`, cuenta contable | Si no viene la clave, generarla (desde el nombre o la secuencia) en vez de pedirla. Hoy el agente lee secuencias 3-4 veces y choca con claves repetidas | w-cost-center-project, w-warehouse-crud, w-subaccount |
| `direccion-inline` | `warehouse` | Crear el almacén con calle, ciudad, CP y país en la misma llamada. Hoy la dirección (`location`) no se puede crear con las herramientas genéricas | w-warehouse-crud |
| `precios-en-producto` | `product` | Aceptar precio de compra y de venta al crear | w-product-crud |
| `stock-sin-ubicacion` | movimientos, consumo interno, inventario | Tomar la ubicación por defecto del almacén en las líneas; `etendo_defaults` de una línea con el padre | f-warehouse-transfer, f-internal-consumption, f-physical-inventory |

Cada una es un `NeoHandler` de esa entidad (o una extensión del que ya tiene), con su JUnit y la
guía de la ventana actualizada.

## Cómo se mide

- Después de cada fase, re-correr solo sus pruebas con `/tmp/okr-run-many.sh <ids> 6` (REPEAT=3);
  el resultado reemplaza su fila en el KPI.
- Cada fase se cierra con el KR actualizado y la lista de derrotas que dio vuelta.
- La medición oficial es al final: cuenta de Holded española nueva y las 43 pruebas en una sola
  corrida.

## Orden propuesto

1. Fase 0 (hoy mismo si hay API key de Context7).
2. Fase 1 y fase 2 en paralelo: son archivos distintos.
3. Fase 3.
4. Fase 4, de a una entidad, midiendo cada una.

## Estado (5 de noviembre, noche)

Hecho en GO (`modules/com.etendoerp.go`, rama `feature/ETP-5848`, commits `848ec2fc0` y
`383338e83`, sin pushear; tests unitarios de las clases tocadas en verde):

- **0.1**: preferencia `ETGO_Context7Token` cargada en la base local; `docs` responde.
  `q-financial-reports` re-corrida: Etendo Win por tokens (KR 62,9 %).
- **1.1**: `FinancialAccountAccountingHandler` acepta `parentId` como id de la cuenta.
- **1.2**: el aviso de PDF faltante limita el reintento a uno y dice que volver a preguntar o
  volver a completar el documento no lo genera.
- **1.3**: la descripción de `openClose` dice que abrir o cerrar un período lo decide el usuario. El
  aviso de `PeriodNotAvailable` ya lo decía y el agente lo ignoró (e-closed-period a2 #17-#23):
  queda por ver si alcanza con el texto o hace falta una confirmación explícita.
- **2 (filtros)**: el diagnóstico cambió el arreglo.
  - `commercialName`: la propiedad existe y se llama `name2`; el error listaba 20 nombres en orden
    alfabético y la cortaba. Ahora el error pone primero los nombres que comparten una palabra con
    el que pidió el agente (`McpRoutingException.closestFirst`).
  - `businessPartner` en `bp-location`: ese spec es la dirección postal (`C_Location`), no la del
    cliente; el camino correcto es `contacts/locationAddress` con `parentId`. No es un filtro que
    falte.
  - Precio de un producto en una tarifa: las líneas de pedido y factura ya toman el precio solas
    (`McpLinePriceInjector`); el agente lo busca igual.
  - `warehouse` en `warehouse`: el contenido del almacén está en `warehouse/binContents`.
- **3.1**: la descripción de `etendo_create` dice que los campos que apuntan a otro registro
  aceptan el nombre y que `etendo_defaults` es opcional (el servidor completa los obligatorios).

Encontrado al revisar, queda pendiente:

- **3.2** (`whoami`): el MCP no manda instrucciones de servidor en `initialize`; agregarlas es un
  cambio de diseño, no de texto.
- **3.3** (sobrepago): el schema de `registerPayment` ya explica `overpaymentAction`. La fuga real
  es otra: el agente registra con `process: draft`, la respuesta del borrador dice
  `creditGenerated: 0` (el crédito se genera al confirmar), cree que el excedente se perdió, borra
  el cobro y prueba de nuevo (f-overpay a1 #14-#18). Mejora: que la respuesta del borrador diga
  qué va a pasar al confirmar.
- `docs` sin Context7: no hay índice local para responder; con la clave cargada deja de fallar.
- `posted` en `physical-inventory`: el agente la eligió sin que se pidiera; es una acción común a
  los documentos, no conviene ocultarla en una sola ventana.

Para medir: desplegar en el Tomcat local (`local-env up` en `.worktrees/ETP-5848`, reinicia
Tomcat) y re-correr `f-bank-account-transfer`, `f-order-direct-invoice`,
`w-draft-order-edit-delete`, `f-physical-inventory`, `e-ambiguous-customer` y las 7 de fuga.

## Medición después de los arreglos (corrida `20261105T194159-cmp-b67c`)

Desplegado en el Tomcat local y re-corridas las 13 derrotas: **KR2.1 = 80 % (28 de 35)**.
Tokens de menos en las victorias: 59 % (27 victorias).

| Prueba | Antes | Ahora | Decidido en |
|---|---|---|---|
| f-bank-account-transfer | Holded Win | Etendo Win | tokens (43 % menos), 0 errores |
| f-order-direct-invoice | Holded Win | Etendo Win | errores (Holded tuvo 3, Etendo 0) |
| w-draft-order-edit-delete | Holded Win | Etendo Win | tokens (58 % menos) |
| w-subaccount | Holded Win | Etendo Win | tokens (47 % menos; Etendo de 1,05 M a 416 mil) |
| f-overpay-sales-invoice | Holded Win | Etendo Win | tokens (52 % menos) |
| w-cost-center-project | Holded Win | Etendo Win (frágil) | éxito: Holded resolvió 2 de 3 |
| w-warehouse-crud | Holded Win | Holded Win | errores (Etendo 2) |
| w-product-crud | Holded Win | Holded Win | tokens |
| w-commercial-setup | Holded Win | Holded Win (frágil) | llamadas |
| e-ambiguous-customer | Holded Win | Holded Win | errores (Etendo 3) |
| f-physical-inventory | Holded Win | Holded Win | tokens (Etendo 29 llamadas) |
| f-warehouse-transfer | Holded Win | Holded Win (frágil) | errores (Etendo 1) |
| f-internal-consumption | Holded Win | Holded Win | tokens |

Parte de la mejora es variación de Holded entre corridas (en w-draft-order-edit-delete y
f-overpay Holded gastó más del doble que el 5 nov a la mañana; en f-order-direct-invoice tuvo
errores; en w-cost-center-project falló un intento). Con REPEAT=3 el número se mueve: la medición
oficial tiene que confirmar el 80 %. Las 7 que siguen perdidas son ABMs simples y movimientos de
stock: es la fase 4.
