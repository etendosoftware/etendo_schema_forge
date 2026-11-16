# KR2.1 — Cierre del 5 de noviembre de 2026

**KR2.1 = 60 %**: Etendo gana 21 de las 35 pruebas posibles en ambos MCP (meta 80 %). Medición
parcial y no oficial: 43 de 43 pruebas corridas, REPEAT=3 en las dos plataformas, cuenta de Holded
española con datos de pilotos (ver *Para la medición oficial*).

| | Pruebas |
|---|---:|
| Etendo Win | 21 |
| Holded Win | 14 |
| Solo Etendo (no entran en el %) | 8, de las que 2 Etendo no resolvió siempre |

- En las 21 victorias Etendo usa en promedio **66,5 % menos tokens** que Holded (mediana 70,3 %,
  agregado 75,4 %; 20 comparables, `f-void-invoice` fuera porque Holded no la resolvió nunca).
- **Ninguna derrota es porque Etendo no haya hecho la tarea**: en las 14, Etendo resolvió 3 de 3.
  Se pierden por dos motivos:
  - **Errores sin recuperar (7)**: la tarea sale, pero en el camino hubo un error que Holded no tuvo.
    El paso 2 de la regla va antes que los tokens. En 5 de esas 7 Etendo gastaba menos tokens.
  - **Fuga de llamadas (7)**: sin errores, Holded hace lo mismo más barato.

Fuentes: `mcp-tests/runs/<run>/` de cada prueba (columna *Corrida* del KPI en etendo-kpis) y los
transcriptos de cada intento (`targets/jwt/probes/<prueba>/attempt-N.json`).

## Dónde se van las llamadas

Promedio por intento de Etendo en las 14 derrotas:

| Tipo de llamada | Llamadas por intento |
|---|---:|
| Metadatos: `etendo_whoami`, `etendo_discover`, `etendo_schema`, `etendo_defaults`, `etendo_selectors` | 6,8 |
| `docs` (Context7) | 0,9 |
| Lecturas: `etendo_list`, `etendo_get`, reportes | 8,1 |
| Escrituras: create, update, action | 2,5 |
| **Total** | **18,3** |
| De esas, con error | 0,8 |

Holded resuelve las mismas tareas en 2 a 10 llamadas. **En Etendo solo 2,5 de cada 18 llamadas
escriben**; el resto es preparar la escritura: descubrir el spec, pedir schema, defaults y
selectores, y buscar ids que la herramienta de creación no resuelve sola.

## Fallos donde Etendo no se recuperó

Errores que el agente no pudo dar vuelta en el mismo intento (cuentan en el paso 2 de la regla).

### f-bank-account-transfer — Holded Win, paso 2

Etendo 18 llamadas y 746 mil tokens; Holded 19 y 2,4 M.

- a1 #3: `docs` respondió 429 *Monthly quota exceeded* (Context7).
- a1 #12, #14 y a2 #11: `etendo_list` con `spec: financial-account`, `entity: accountingConfiguration`
  y `parentId` responde `financialAccountId is required`.
  - **Bug:** el `parentId` no se traduce al filtro del padre en esa entidad hija.
- Igual creó la cuenta y transfirió (`transferDestinations` + `transferFunds`) en los 3 intentos.
- **Sin estos errores la ganaba por tokens (69 % menos).**

### q-financial-reports — Holded Win, paso 2 (frágil)

Etendo 6 llamadas y 232 mil tokens; Holded 8 y 1,1 M.

- a2 #4: el único error es `docs` con 429 de Context7.
- El resto es el camino corto: `etendo_widget`, `generate_aging_receivable` y `etendo_list`.
- **Un solo error de infraestructura le hizo perder una prueba donde gastaba 80 % menos.**

### f-order-direct-invoice — Holded Win, paso 2

Etendo 21 llamadas y 799 mil tokens; Holded 19 y 2,2 M.

- a2 #2: `etendo_list` de contactos con `commercialName contains` responde *Field 'commercialName' is
  not available for filtering on entity 'businessPartner'*.
- a3 #23: `etendo_get_document_pdf` sobre la factura recién creada responde *This document has no
  PDF yet*. El agente pidió un PDF que nadie le pidió.
- Fuga: 9 llamadas de metadatos por intento (discover, defaults, schema y selectors de cabecera y
  líneas, más el schema de `createDraftInvoice`) y la búsqueda de precio por `price-list` →
  `priceListVersion` → `productPrice` (a1 #11-#15).
- **Sin los errores la ganaba por tokens (64 % menos).**

### w-draft-order-edit-delete — Holded Win, paso 2

Etendo 14 llamadas y 514 mil tokens; Holded 5 y 652 mil.

- a1 #11: `etendo_list` de `price-list` con `filters: { product }` responde *Field 'product' is not
  available for filtering on entity 'priceList'*. El agente busca el precio del producto en la
  tarifa y no tiene un camino directo.
- Fuga: discover, defaults, schema y selectors de cabecera y líneas antes de crear (6-7 llamadas);
  a2 y a3 además consultan `docs`.
- **Sin el error la ganaba por tokens (21 % menos).**

### f-physical-inventory — Holded Win, paso 2

Etendo 17 llamadas y 602 mil tokens; Holded 10 y 1,1 M.

- a2 #9: `etendo_list` de `warehouse` con `filters: { warehouse }` responde *Field 'warehouse' is not
  available for filtering on entity 'warehouse'*: el agente buscaba el contenido del almacén.
- a3 #13: `etendo_action` `posted` (contabilizar) sobre el inventario falla con *The cost of the
  product has not been calculated*. Contabilizar no era parte de la tarea.
- Fuga: `generate_inventory_stock_report` 2-3 veces por intento, y lecturas de `storageBin` y
  `binContents` para encontrar la ubicación.
- **Sin los errores la ganaba por tokens (46 % menos).**

### w-warehouse-crud — Holded Win, paso 2

Etendo 17 llamadas y 702 mil tokens; Holded 3 y 434 mil.

- a1 #5, a2 #4 y a3 #7: `etendo_schema` de `warehouse/location` responde *Entity 'location' is
  served by a dedicated handler … it cannot be written through the generic tools*. La dirección
  del almacén no se puede crear por las herramientas genéricas.
- a2 #10: `etendo_list` de `warehouse/location` responde *Unsupported operation on location: GET*.
- a2 #19: `etendo_create` falla porque ya existe un almacén con la misma clave (`searchKey`). El
  agente arma la clave a mano y repite la del intento anterior.
- a2 #20: *One or more values were rejected by field validation*.
- a2 #7: `docs` 429.
- El agente termina usando una dirección existente (`locationAddress` de otro registro) **[INFERENCIA:
  no crea la dirección "Calle Mayor 1, Madrid" pedida]**.
- Holded: `list_warehouses` → `create_warehouse` (con la dirección inline) → `get_warehouse`.
- Holded igual era más barato; los errores no cambian el resultado.

### w-cost-center-project — Holded Win, paso 2

Etendo 21 llamadas y 809 mil tokens; Holded 2 y 323 mil.

- a1 #16 y a2 #19: `etendo_create` de `service-project` con solo el nombre responde *Missing required
  fields that could not be auto-resolved: searchKey*.
- Para inventar la clave el agente lee `document-sequence` 3-4 veces (a1 #12-#15).
- a3 #20: la clave que eligió ya existía (*A record with this value already exists*).
- a2 #16: `docs` 429.
- Holded: `create_project` con el nombre y listo.
- Holded igual era más barato; los errores no cambian el resultado.

## Derrotas por fuga de llamadas (sin errores que decidan)

### w-product-crud — Holded Win, paso 3 (tokens)

Etendo 20 llamadas y 927 mil tokens; Holded 3 y 437 mil.

- Crear el producto es 1 llamada (a2 #11); poner los precios son otras 3: listar `product/price` y
  dos `etendo_update`, uno por tarifa (a2 #12-#14).
- Antes: discover, schema de producto y de precio, defaults, listar tarifas, y 1-2 `docs`.
- Holded: `create_product` con precio de compra y de venta en la misma llamada.

### w-subaccount — Holded Win, paso 3 (tokens)

Etendo 16 llamadas y 1,05 M tokens; Holded 5 y 655 mil.

- El agente lista el plan de cuentas 4-6 veces para encontrar el padre y el próximo número libre.
- a1 #7, a2 #7, a3 #11: `etendo_get` en `chart-of-accounts` con un id que salió de
  `general-ledger-configuration` responde 404 (*No chart-of-accounts/elementValue with id …*). Se
  recupera, pero es una vuelta más.
- Holded también lista 3 veces, pero cada lectura es más chica.

### w-commercial-setup — Holded Win, paso 4 (llamadas)

Etendo 12 llamadas y 415 mil tokens; Holded 3 y 433 mil.

- Empate en tokens; pierde por llamadas.
- Antes de `etendo_create` hace discover, defaults, 2 schemas, lista y get de tarifas, lista
  versiones, y 1-2 `docs` (a1 #9-#10).
- Holded: `list_price_lists` → `create_price_list` → `get_price_list`.

### f-warehouse-transfer — Holded Win, paso 3 (tokens)

Etendo 21 llamadas y 815 mil tokens; Holded 6 y 656 mil.

- Cuatro `etendo_schema` (cabecera, líneas, otra vez cabecera y `processNow`).
- Dos lecturas de `storageBin` para encontrar la ubicación de origen y destino.
- a1 #16, a2 #14 y a3 #16: `etendo_defaults` de `movementLine` sin padre responde que es hija de
  `goods-movements`. El agente crea la cabecera y recién ahí pide los defaults de la línea.
- 2 `docs` en a1 y a3.
- Holded: `update_product_stock` dos veces (sale de uno, entra al otro).

### f-internal-consumption — Holded Win, paso 3 (tokens)

Etendo 19 llamadas y 641 mil tokens; Holded 4 y 542 mil.

- El mismo patrón que el traspaso: 4-5 schemas, defaults de cabecera y línea, `storageBin` y
  `binContents`, y 2 `docs` en a1.
- a2 #13: `etendo_list` de las líneas sin padre responde *cannot be listed across every parent*.
- Holded: un ajuste de stock.

### e-ambiguous-customer — Holded Win, paso 3 (tokens)

Etendo 28 llamadas y 1,17 M tokens; Holded 10 y 842 mil.

- Las 3 veces Etendo hace lo correcto (pregunta cuál de los dos clientes y no crea nada), pero
  investiga de más: 20 lecturas por intento (contactos, direcciones, pedidos, presupuestos).
- a2 #8, a3 #9 y a4 #8: `etendo_list` de `bp-location` filtrando por `businessPartner` responde *Field
  'businessPartner' is not available for filtering on entity 'bpLocation'*.
- a4 #2: el mismo error de `commercialName` que en `f-order-direct-invoice`.
- Hasta 6 `etendo_selectors` de `sales-order` seguidos (a3).
- **[INFERENCIA]** El agente no encuentra rápido qué distingue a los dos clientes (dirección, CIF,
  actividad) y lo busca entidad por entidad.

### f-overpay-sales-invoice — Holded Win, paso 3 (tokens)

Etendo 22 llamadas y 1,1 M tokens; Holded 6 y 774 mil.

- Entre 3 y 4 consultas a `docs` por intento sobre *registerPayment*, *overpaymentAction* y
  *leave-credit*.
- El agente prueba: registra el cobro, lo borra, lo vuelve a registrar (a1 #14-#17, a2 #12-#19).
- a2 #12: *The 50.00 funding this payment (actual_payment plus creditSources) exceeds the
  installment*.
- Holded: `create_invoice_payment` con el monto de más y listo.
- El schema de `registerPayment` no deja claro qué hacer con el excedente.

## Pruebas solo de Etendo que no salieron siempre

No entran en el porcentaje, pero son fallas reales.

### e-closed-period — 1 de 3

- a2 #17: Etendo rechaza completar la factura del 15 de diciembre (*The Period does not exist or it
  is not opened*), bien.
- **a2 #23: el agente abre el período de diciembre por su cuenta** (`open-close-period-control`,
  acción `openClose`) y completa la factura. Nadie le pidió abrir un período.
- a1 corrió después que a2 y encontró el período ya abierto: completó sin error. Es contaminación
  entre intentos: **el setup no vuelve a cerrar el período en cada intento.**
- a3 hizo lo correcto: dejó la factura en borrador y avisó.

### w-send-invoice — 0 de 3

- El entorno no tiene jsreport (ETP-6013): `etendo_get_document_pdf` y `etendo_send_document_email`
  responden *This document has no PDF yet* 15 y 5 veces.
- El agente reintenta en loop (19-32 llamadas por intento), completando y re-completando la
  factura, porque el error no dice que no tiene arreglo desde el agente.
- 2 `docs` con 429.

## Plan de mejoras

Ordenado por impacto en el KR2.1. *Recupera* = derrotas que esa mejora da vuelta según los datos
de hoy.

| # | Mejora | Qué cambiar en el MCP | Pruebas | Recupera |
|---|---|---|---|---|
| 1 | `docs-sin-context7` | `docs` no puede depender de la cuota de Context7: API key con cuota, o servir los temas propios desde el módulo. Si la fuente externa falla, responder con el índice local y no con error | q-financial-reports, f-bank-account-transfer, w-warehouse-crud, w-cost-center-project, e-closed-period, w-send-invoice | 1 (q-financial-reports), y la mitad de f-bank-account-transfer |
| 2 | `parentId-accountingConfiguration` | Bug: `etendo_list` de `financial-account/accountingConfiguration` con `parentId` responde `financialAccountId is required`. Traducir `parentId` al filtro del padre | f-bank-account-transfer | 1 (con la 1) |
| 3 | `filtros-faltantes` | Habilitar los filtros que los agentes piden y hoy fallan: `commercialName` en `businessPartner`, `businessPartner` en `bpLocation`, precio de un producto en una tarifa (`productPrice` por producto y tarifa en una llamada), contenido de un almacén | f-order-direct-invoice, e-ambiguous-customer, f-overpay-sales-invoice, w-draft-order-edit-delete, f-physical-inventory, e-closed-period | 3 (w-draft-order-edit-delete; f-order-direct-invoice con la 11; f-physical-inventory con la 9) |
| 4 | `crear-en-pocas-llamadas` | Bajar las 6,8 llamadas de metadatos por intento. `etendo_create` **ya acepta nombres** en los campos que apuntan a otro registro (`McpFkResolver`, IMP-4: `taxCategory: "IVA 21%"` en vez del id), pero su descripción no lo dice y además recomienda llamar a `etendo_defaults` antes de crear. Por eso los agentes piden schema, defaults y selectores para conseguir ids. Cambiar la descripción: decir que esos campos aceptan el nombre y que `etendo_defaults` no hace falta; y que el error de campos faltantes traiga los valores posibles | todas las de ABM y flujos | [INFERENCIA] es lo que más pesa para los 7 de fuga; se mide al re-correr |
| 5 | `searchKey-automatica` | Generar la clave (`searchKey`) desde el nombre o la secuencia cuando no viene, en `service-project`, `warehouse` y cuentas contables | w-cost-center-project, w-warehouse-crud, w-subaccount | baja errores y 4-6 lecturas |
| 6 | `direccion-inline` | Crear el almacén con la dirección en la misma llamada (calle, ciudad, CP, país), como los contactos con `locationAddress`. Hoy la dirección no se puede crear por las herramientas genéricas | w-warehouse-crud | quita 3 errores por intento |
| 7 | `precios-en-producto` | Aceptar precio de compra y de venta al crear el producto (hoy son 3 llamadas más) | w-product-crud | — |
| 8 | `stock-sin-ubicacion` | En movimientos, consumo interno e inventario, tomar la ubicación por defecto del almacén; que `etendo_defaults` de una línea acepte el padre o vengan con los de la cabecera | f-warehouse-transfer, f-internal-consumption, f-physical-inventory | — |
| 9 | `acciones-fuera-de-alcance` | No ofrecer acciones que la tarea no necesita o sin aviso: contabilizar (`posted`) un inventario, abrir un período cerrado (`openClose`). Las sensibles, con confirmación explícita del usuario | f-physical-inventory, e-closed-period | 1 (con la 3) |
| 10 | `sobrepago-explicado` | Documentar en el schema de `registerPayment` qué hacer con el excedente (`overpaymentAction`: dejar a favor o devolver) y que el error del exceso diga cómo seguir | f-overpay-sales-invoice | — |
| 11 | `errores-no-reintentables` | Que *This document has no PDF yet* diga si hay arreglo desde el agente (servicio de PDF caído = no reintentar; PDF todavía no generado = cuándo estará) | w-send-invoice, f-order-direct-invoice | con la 3, f-order-direct-invoice |
| 12 | `whoami-innecesario` | Casi todos los intentos empiezan con `etendo_whoami`: poner ese contexto en las instrucciones del servidor | todas | 1 llamada por intento |

Con 1, 2, 3, 9 y 11 se recuperan las 5 derrotas en las que Etendo gastaba menos: **el KR2.1 pasaría a
74 % (26 de 35)**. Para llegar al 80 % hacen falta 2 más del grupo de fuga, y eso depende de 4, 5,
6 y 7.

### Arreglos del harness (no son del MCP)

- `e-closed-period`: cerrar diciembre en el setup de **cada** intento; hoy un intento que abre el
  período contamina a los siguientes.
- `w-send-invoice`: correrla solo en un entorno con jsreport (ETP-6013); hoy mide el entorno.

## Para la medición oficial

- Cuenta de Holded española nueva: la actual tiene datos de pilotos y corridas que cambian totales
  (por ejemplo, las facturas sobrepagadas de `f-overpay`).
- Re-correr las 43 pruebas en esa cuenta con las mejoras que entren, en una sola corrida oficial.

## Anexo: estado de las 43 pruebas al 5 de noviembre

Copia de la tabla del KPI `agent_kr21_win_rate` (etendo-kpis, `data/manual/agentic.json`) al cierre.

### Posibles en ambos (35): entran en el porcentaje

| Prueba | Resultado | Decidido en | Etendo | Holded | Corrida |
|---|---|---|---|---|---|
| `e-unknown-document` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 9 llamadas · 302.042 tokens | 3/3 éxitos · 0 errores · 15 llamadas · 1.923.095 tokens | 20261105T150504-cmp-388f |
| `f-collect-invoice` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 13 llamadas · 481.392 tokens | 3/3 éxitos · 0 errores · 12 llamadas · 1.540.864 tokens | 20261105T134230-cmp-c351 |
| `f-collect-several-invoices` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 25 llamadas · 1.330.575 tokens | 3/3 éxitos · 0 errores · 21 llamadas · 3.211.192 tokens | 20261105T142822-cmp-2989 |
| `f-credit-note` | Etendo Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 0 errores · 20 llamadas · 804.147 tokens | 3/3 éxitos · 4 errores · 18 llamadas · 2.437.001 tokens | 20261105T135715-cmp-74c3 |
| `f-customer-return` | Etendo Win | Paso 1 · éxito | 3/3 éxitos · 0 errores · 14 llamadas · 502.748 tokens | 2/3 éxitos · 1 errores · 32 llamadas · 5.246.294 tokens | 20261105T150504-cmp-388f |
| `f-manual-journal-post` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 22 llamadas · 870.800 tokens | 3/3 éxitos · 0 errores · 10 llamadas · 1.051.026 tokens | 20261105T172038-cmp-9381 |
| `f-order-ship-invoice` | Etendo Win | Paso 1 · éxito | 3/3 éxitos · 0 errores · 31 llamadas · 1.226.199 tokens | 2/3 éxitos · 1 errores · 62.5 llamadas · 6.521.674 tokens | 20261105T145522-cmp-4b03 |
| `f-pay-purchase-invoice` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 12 llamadas · 435.442 tokens | 3/3 éxitos · 0 errores · 10 llamadas · 1.242.654 tokens | 20261105T150504-cmp-388f |
| `f-purchase-receive-invoice` | Etendo Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 0 errores · 36 llamadas · 1.621.564 tokens | 3/3 éxitos · 2 errores · 36 llamadas · 5.871.342 tokens | 20261105T150504-cmp-388f |
| `f-quotation-to-invoice` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 18 llamadas · 667.797 tokens | 3/3 éxitos · 0 errores · 13 llamadas · 1.640.675 tokens | 20261105T141115-cmp-ffbc |
| `f-undo-collection` | Etendo Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 0 errores · 8 llamadas · 271.558 tokens | 3/3 éxitos · 3 errores · 7 llamadas · 965.129 tokens | 20261105T135451-cmp-b14f |
| `f-vendor-return` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 13 llamadas · 471.279 tokens | 3/3 éxitos · 0 errores · 23 llamadas · 3.712.315 tokens | 20261105T150504-cmp-388f |
| `f-void-invoice` | Etendo Win | Paso 1 · éxito | 3/3 éxitos · 0 errores · 24 llamadas · 1.215.465 tokens | 0/3 éxitos · 16 errores · 0 llamadas · sin tokens | 20261105T144708-cmp-c28b |
| `q-dashboard-indicators` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 4 llamadas · 86.093 tokens | 3/3 éxitos · 0 errores · 22 llamadas · 3.209.914 tokens | 20261105T172038-cmp-9381 |
| `q-hello` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 0 llamadas · 28.924 tokens | 3/3 éxitos · 0 errores · 0 llamadas · 108.305 tokens | 20261104T160014-cmp-bf1f |
| `q-invoice-numbering` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 6 llamadas · 205.544 tokens | 3/3 éxitos · 0 errores · 2 llamadas · 325.235 tokens | 20261105T175800-cmp-bacf |
| `q-sales-this-month` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 9 llamadas · 558.748 tokens | 3/3 éxitos · 0 errores · 14 llamadas · 2.117.038 tokens | 20261105T172038-cmp-9381 |
| `q-stock-report` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 5 llamadas · 173.632 tokens | 3/3 éxitos · 0 errores · 5 llamadas · 544.796 tokens | 20261105T150504-cmp-388f |
| `q-taxes-and-rates` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 5 llamadas · 219.852 tokens | 3/3 éxitos · 0 errores · 3 llamadas · 340.925 tokens | 20261105T150504-cmp-388f |
| `q-top-customers` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 2 llamadas · 84.943 tokens | 3/3 éxitos · 0 errores · 5 llamadas · 881.078 tokens | 20261105T150504-cmp-388f |
| `w-customer-crud` | Etendo Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 8 llamadas · 307.512 tokens | 3/3 éxitos · 0 errores · 3 llamadas · 447.610 tokens | 20261105T134028-cmp-9e42 |
| `e-ambiguous-customer` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 28 llamadas · 1.168.188 tokens | 3/3 éxitos · 0 errores · 10 llamadas · 841.505 tokens | 20261105T143615-cmp-f849 |
| `f-bank-account-transfer` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 2 errores · 18 llamadas · 746.044 tokens | 3/3 éxitos · 0 errores · 19 llamadas · 2.406.687 tokens | 20261105T172038-cmp-9381 |
| `f-internal-consumption` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 19 llamadas · 641.018 tokens | 3/3 éxitos · 0 errores · 4 llamadas · 542.259 tokens | 20261105T150504-cmp-388f |
| `f-order-direct-invoice` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 1 errores · 21 llamadas · 799.320 tokens | 3/3 éxitos · 0 errores · 19 llamadas · 2.213.014 tokens | 20261105T142333-cmp-5066 |
| `f-overpay-sales-invoice` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 22 llamadas · 1.099.969 tokens | 3/3 éxitos · 0 errores · 6 llamadas · 773.912 tokens | 20261105T144224-cmp-15c9 |
| `f-physical-inventory` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 1 errores · 17 llamadas · 602.422 tokens | 3/3 éxitos · 0 errores · 10 llamadas · 1.109.414 tokens | 20261105T150504-cmp-388f |
| `f-warehouse-transfer` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 21 llamadas · 815.068 tokens | 3/3 éxitos · 0 errores · 6 llamadas · 656.143 tokens | 20261105T150504-cmp-388f |
| `q-financial-reports` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 1 errores · 6 llamadas · 231.587 tokens | 3/3 éxitos · 0 errores · 8 llamadas · 1.135.917 tokens | 20261105T172038-cmp-9381 |
| `w-commercial-setup` | Holded Win | Paso 4 · llamadas | 3/3 éxitos · 0 errores · 12 llamadas · 414.865 tokens | 3/3 éxitos · 0 errores · 3 llamadas · 433.011 tokens | 20261105T150504-cmp-388f |
| `w-cost-center-project` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 1 errores · 21 llamadas · 808.578 tokens | 3/3 éxitos · 0 errores · 2 llamadas · 323.244 tokens | 20261105T150504-cmp-388f |
| `w-draft-order-edit-delete` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 1 errores · 14 llamadas · 514.328 tokens | 3/3 éxitos · 0 errores · 5 llamadas · 651.801 tokens | 20261105T143340-cmp-9cd3 |
| `w-product-crud` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 20 llamadas · 927.273 tokens | 3/3 éxitos · 0 errores · 3 llamadas · 437.071 tokens | 20261105T150504-cmp-388f |
| `w-subaccount` | Holded Win | Paso 3 · tokens | 3/3 éxitos · 0 errores · 16 llamadas · 1.051.210 tokens | 3/3 éxitos · 0 errores · 5 llamadas · 655.482 tokens | 20261105T150504-cmp-388f |
| `w-warehouse-crud` | Holded Win | Paso 2 · errores sin recuperar | 3/3 éxitos · 2 errores · 17 llamadas · 701.590 tokens | 3/3 éxitos · 0 errores · 3 llamadas · 434.364 tokens | 20261105T150504-cmp-388f |

### Posibles en una sola plataforma (8): cobertura, no entran en el porcentaje

| Prueba | Plataforma | Resultado | Por qué la otra no | Corrida |
|---|---|---|---|---|
| `e-closed-period` | Solo Etendo | 1/3 éxitos · 2 errores · 19 llamadas · 763.583 tokens | Holded's MCP cannot close an accounting period, so the starting state (a closed December) cannot be built. | 20261105T150504-cmp-388f |
| `e-duplicate-payment-term` | Solo Etendo | 3/3 éxitos · 4 errores · 10 llamadas · 364.370 tokens | Holded does not refuse a repeated payment term (two 30-day methods were created, 2026-11-05): the rule under test does not exist there. | 20261105T150504-cmp-388f |
| `f-asset-amortization` | Solo Etendo | 3/3 éxitos · 1 errores · 41 llamadas · 3.108.839 tokens | Holded's MCP has no fixed assets or amortization tools. | 20261105T150504-cmp-388f |
| `f-open-period` | Solo Etendo | 3/3 éxitos · 0 errores · 9 llamadas · 294.140 tokens | Holded's MCP has no tool to open or close an accounting period. | 20261105T150504-cmp-388f |
| `q-fiscal-status` | Solo Etendo | 3/3 éxitos · 2 errores · 29 llamadas · 1.606.224 tokens | No Holded tool reads the configuration of invoice submission to the tax office (SII, TicketBAI, VeriFactu) or the tax returns filed. | 20261105T150504-cmp-388f |
| `w-company-users-numbering` | Solo Etendo | 3/3 éxitos · 0 errores · 23 llamadas · 1.240.289 tokens | Holded's MCP cannot pick a sales role: no tool lists roles, and listAccountUsers shows only the owner's. | 20261105T150504-cmp-388f |
| `w-product-category-crud` | Solo Etendo | 3/3 éxitos · 1 errores · 9 llamadas · 317.445 tokens | Holded has no product categories: none of its 367 tools creates or lists them (create_product takes no category). | 20261105T150504-cmp-388f |
| `w-send-invoice` | Solo Etendo | 0/3 éxitos · 20 errores · 0 llamadas · sin tokens | Holded's send_invoice leaves nothing any of its tools can read back (get_invoice is identical before and after, 2026-11-05): the send cannot be verified through its MCP. | 20261105T150504-cmp-388f |
