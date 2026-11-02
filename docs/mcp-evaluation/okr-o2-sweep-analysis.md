# Análisis del barrido — por qué falla y por qué gasta tanto el MCP de Etendo

**Fecha:** 2 nov 2026 · **Tarea:** ETP-5848 · **Datos:** barrido inicial del lado Etendo
(`docs/mcp-evaluation/okr-o2-sweep.md`), 43 pruebas, 1 intento cada una, última corrida de cada una.
Entorno local-env `ETP-5848` (`develop` del 2 nov), modelo `gemini/gemini-3.8-flash`, tope de 50 pasos.
Código citado: `modules/com.etendoerp.go` en `develop`.

**Objetivo:** decidir correcciones (documentación, descripciones de tools, mensajes de error o código),
aplicarlas y volver a correr las pruebas afectadas para medir el antes y el después.

## 1. Los números

| Medida | Valor |
|---|---|
| Llamadas a tools en las 43 pruebas | 724 (41 con error) |
| Llamadas que **hacen** algo (crear, cambiar, ejecutar) | 113 (**15 %**) |
| Leer registros (muchas veces ajenos, para imitarlos) | 31 % |
| Entender campos (`schema`, `defaults`) | 20 % |
| Orientarse (`whoami`, `discover`, `docs`, `vector_search`) | 19 % |
| `etendo_feedback` | 5 % (40 llamadas en 43 pruebas) |
| Pruebas que arrancan con `whoami` / `discover` | **43 de 43** |
| Llamadas antes de la primera acción | mediana 8,5 · máximo 40 |
| Tokens por prueba | mediana **659.092** · total 30,2 millones |
| Tokens por llamada | mediana **~41.600** (cada turno reenvía el catálogo, ~27k) |

**Lectura:** cada llamada cuesta ~40k tokens, así que el costo de una tarea es casi proporcional a
la cantidad de llamadas. Bajar llamadas de orientación y de exploración es la palanca principal, y la
mayoría se resuelve con descripciones, mensajes de error y documentación, sin tocar la lógica.

## 2. Hallazgos

Orden: impacto estimado (llamadas y tokens que ahorra × pruebas que toca).
Tipo de corrección: **D** descripción de tool / instrucciones · **H** mensaje de error (hint) ·
**M** metadatos de campo (`agentPrompt`) o de acción · **C** código · **E** entorno de pruebas.

### H1. Ritual fijo de arranque — D

- **Evidencia:** 43/43 pruebas empiezan con `etendo_whoami` y/o `etendo_discover`; 40 llamadas a
  `etendo_feedback`. `q-hello` ("Hola") gasta **82.139 tokens** en 3 turnos por este ritual.
- **Causa:** las descripciones lo piden.
  - `etendo_whoami`: "*Changes nothing and is cheap: **call it first***…"
  - `etendo_discover`: "*Use this first to discover what specs and entities are available.*"
  - `etendo_feedback`: "*Send one consolidated report **per task***…"
- **Costo:** ~3 llamadas × ~40k = **~120k tokens por tarea** antes de empezar.
- **Propuesta:** whoami solo "cuando necesites saber rol, empresa o fecha"; discover "cuando no sepas
  qué spec usar" (la mayoría de las tareas lo resuelven con el nombre de la spec); feedback "solo si
  algo te confundió o falló" (no en cada tarea). Mantener el valor del feedback para producto, sin
  convertirlo en paso obligatorio.
- **Dónde:** textos de las tools (`McpConstants` / definiciones de tool en `mcp/`).
- **Re-probar:** `q-hello` y cualquier tarea corta (`w-product-category-crud`, `q-top-customers`).

### H2. Adivina el nombre de la entidad — C o H

- **Evidencia:** 10 errores `not_found` como `No entity 'contacts' in spec 'contacts'` y
  `No entity 'header' in spec 'contacts'` (en 9 pruebas distintas, casi siempre la 2.ª llamada).
- **Causa:** cada spec nombra distinto su entidad principal (`header`, `businessPartner`,
  `productCategory`…); el agente prueba el nombre de la spec o `header`. El error sí devuelve la lista
  de entidades (`available`), así que cuesta una llamada extra, no una falla.
- **Propuesta:** aceptar la entidad omitida o igual al nombre de la spec como la entidad principal
  (`discover` ya conoce `primaryEntity`). Alternativa barata: que la descripción de `etendo_list`
  diga que cada spec tiene su `primaryEntity`.
- **Dónde:** `McpRoutingException.java:236` (error) y la resolución de entidad del routing.
- **Re-probar:** las que lo sufrieron: `f-order-ship-invoice`, `f-overpay-sales-invoice`,
  `f-purchase-receive-invoice`, `f-vendor-return`, `f-quotation-to-invoice`, `w-send-invoice`.

### H3. Buscar un registro por nombre — C + E

- **Evidencia:**
  - filtro `contains` sobre una clave foránea rechazado (`'contains' works only on text fields`,
    `McpQuerySupport.java:664`): el agente quiere "las facturas del cliente que se llama X";
  - `allParents` rechazado en entidades hijas (`contact`, `assetAcct`, `issuedInvoices`;
    `McpRequestRefusals.java:96`): 4 errores buscando un correo entre contactos;
  - `etendo_vector_search` falla en las 7 llamadas: `The OpenAI API key is not configured` (entorno).
- **Propuesta:**
  - C: permitir filtrar por el identificador de la clave foránea (p. ej. `businessPartner$_identifier`
    con `contains`) o decirlo en el hint con el ejemplo concreto;
  - E: configurar la clave de embeddings en local-env, o no ofrecer `etendo_vector_search` cuando no
    está configurado (hoy el agente la intenta y pierde la llamada; en producción sí funciona, así
    que en el entorno de pruebas penaliza a Etendo de más).
- **Re-probar:** `f-credit-note`, `w-customer-crud`, `w-company-users-numbering`, `e-unknown-document`.
- **Resuelto (2 nov, GO `3204b1a1b`):**
  - `etendo_vector_search` ya no depende solo de los embeddings: si el proveedor falla o la búsqueda
    semántica no encuentra nada, busca los mismos targets por texto con `etendo_list` + `contains`
    sobre las columnas que indexa cada uno (`mode:"lexical"`). Pasa por el router: rol, filtro de la
    ventana y scopes como en cualquier lectura. La UI no cambia (decisión de Valentin: solo la tool).
    Ver `docs/vector-search-configuration.md` › *Text fallback in the MCP*.
  - `contains` sobre un campo relacionado devuelve el paso siguiente concreto:
    `etendo_selectors(spec, field, query)` y después filtrar por el id.
  - `allParents`: sin cambios (el mensaje ya dice qué hacer y el agente se corrige solo).
  - Re-prueba, 1 intento: `e-unknown-document` 13 → 8 llamadas, 532k → 274k tokens (la búsqueda
    ahora responde por texto en vez de fallar); `f-credit-note` 21 → 18 llamadas, 1,20 M → 0,98 M
    tokens. `f-void-invoice` 17 → 21 llamadas sin usar la búsqueda: variación del agente (leyó la
    doc dos veces e intentó contabilizar la factura), a confirmar con 3 repeticiones.

### H4. Modelo ambiguo: el correo de un cliente — M

- **Evidencia:** `w-customer-crud` hace 25 llamadas para **un** alta: 20 buscando dónde va el correo
  (`businessPartner.etgoEmail`, la entidad `contact`, la de `user`), leyendo clientes existentes uno por
  uno para imitarlos.
- **Propuesta:** `agentPrompt` en `businessPartner.etgoEmail` ("correo de la empresa o cliente; los
  correos de personas de contacto van en `contact`") y un tema de `docs` "dar de alta un cliente".
- **Dónde:** metadatos del campo (`ETGO_SF_FIELD` / `decisions.json` de `contacts`).
- **Re-probar:** `w-customer-crud` (esperado: < 8 llamadas).

### H5. Anular una factura: el MCP no lleva a la rectificativa — H + D

- **Evidencia:** `f-void-invoice`. El agente intenta lo correcto, `docAction: VO`; el MCP responde
  "*not offered…; send one of [CO, RE]*" (`McpDeclaredActions.java:150`). Con eso, el agente
  **reactiva** la factura (RE) y la da por anulada. Decisión del 23 oct: solo vale la rectificativa.
- **Propuesta:** cuando se pide anular (`VO`) una factura completada, el hint debe decir "una factura
  emitida no se anula: se rectifica" y nombrar la acción o entidad de la rectificativa
  (`f-credit-note` muestra que el agente sabe hacerla cuando se la piden). Agregar lo mismo a `docs`.
- **Re-probar:** `f-void-invoice`, `f-credit-note`.

### H6. Enviar una factura creada por MCP: no hay PDF — C (bug)

- **Evidencia:** `w-send-invoice`. `etendo_send_document_email` y `etendo_get_document_pdf` responden
  `no_pdf` ("*open the document's preview in the application…*"). Los dos hints se remiten uno al
  otro. **Un documento creado por MCP no se puede enviar ni descargar desde el MCP.**
- **Propuesta:** generar el PDF del lado del servidor cuando falta (el mismo que guarda la vista previa
  de la aplicación), en lugar de pedirle al agente que abra la aplicación. Mientras tanto, corregir el
  hint para que no sea circular.
- **Dónde:** `McpDocumentPdfTool.java:238` (`missingHint`), `NeoDocumentPdf`.
- **Re-probar:** `w-send-invoice` (con una verificación que no pase si no se envió: ver §3).
- **Decisión (2 nov, Valentin):** arreglar los mensajes y dejar el envío sin PDF como límite
  conocido; el render del lado del servidor queda como tarea aparte. El PDF lo arma el navegador
  (`documentPdf.js` → jsreport), así que generarlo en el servidor con el mismo diseño pide correr
  ese módulo fuera del navegador; usar las plantillas `print-*` mandaría al cliente otro diseño
  (regla "un documento, un diseño" de `docs/document-printables.md`).
- **Hecho (GO `ea4de6848` + el historial):**
  - Los mensajes de "sin PDF" y "PDF viejo" de las dos tools dicen que solo la aplicación genera el
    PDF y que no se reintente; ya no dicen "o envialo por correo", que el agente leía como la otra
    tool. `w-send-invoice`: 13 → 7 llamadas, 604k → 261k tokens; el agente avisa que no hay PDF.
  - `etendo_send_document_email` con `preview:true` lista los envíos anteriores del documento
    (`history`: fecha, estado, destinatarios, asunto; los últimos 10). Sirve al agente para no
    reenviar y a la prueba para verificar el envío (`expectEffect.rowsAt`), que antes pasaba sin
    enviar nada. Sin tool nueva.

### H7. Usuario con permisos: el rol no se asigna por MCP — C o D (decisión de producto)

- **Evidencia:** `w-company-users-numbering`. Con 25 pasos se perdía; con 50 crea el usuario (32
  llamadas, **2,8 millones de tokens**) y dice "*role assignment is read-only via API*". La acción
  `roles` es de solo lectura (`UserRoleAssignmentHandler.java:281`, ETP-5852).
- **Propuesta:** decidir si la asignación de rol se expone por MCP. Si no, decirlo en la descripción
  del spec `user` desde el principio (ahorra la exploración) y que la prueba quede como límite
  conocido.
- **Re-probar:** `w-company-users-numbering`, con la verificación del rol (§3).

### H8. Pedido con cantidad negativa — resuelto: prueba retirada del KR

- **Evidencia:** `e-invalid-write`. Crea el pedido PV1000001 con **-3 unidades** y lo da por hecho.
  El catálogo de operaciones (F5) decía que se negaba.
- **Análisis (2 nov):** no es un fallo. La UI acepta cantidades negativas a propósito, para la
  devolución dentro del mismo documento: `"min": false` en la cantidad de pedidos, presupuestos y
  facturas (ETP-4567), y ETP-5132 arregla los totales de una factura con una línea negativa. El MCP
  hace lo mismo que la UI.
- **Decisión (Valentin):** la prueba se retira del KR (quedan 42). Medía una diferencia de diseño con
  Holded, no la calidad del MCP; el manejo de rechazos ya lo cubren las otras cuatro pruebas `e-*`.

### H9. Acciones con parámetros mal declarados — M o C (bugs)

- `financial-account` › `transferFunds` exige `glItemId` (`Action 'transferFunds' requires
  parameter(s) glItemId`) para una transferencia entre cuentas propias.
- `internal-consumption` › `processNow` falla con `Missing mandatory parameter: action (Action)`.
- **Re-probar:** `f-bank-account-transfer`, `f-internal-consumption`.

### H10. Topes de columnas que el agente no conoce antes — M (menor)

- **Evidencia:** 8 `validation_error` por largo (código de producto y de categoría 40, nombre 60). En
  parte lo provoca el marcador largo de las pruebas.
- **Propuesta:** exponer el largo máximo en `etendo_schema(view: "create")`.

### Entorno (no es del MCP)

- `etendo_vector_search` sin clave de embeddings (H3).
- `f-physical-inventory`: al contabilizar, "*The cost of the product has not been calculated*"
  (proceso de costos en segundo plano del entorno).

## 3. Verificaciones de las pruebas que hay que reforzar

| Prueba | Problema | Cambio |
|---|---|---|
| `w-send-invoice` | Pasó sin enviar nada (solo miraba la respuesta) | Verificar el registro del envío o el PDF guardado |
| `w-company-users-numbering` | Solo mira que exista el usuario | Agregar el rol de ventas |
| `f-warehouse-transfer`, `f-internal-consumption` | No distinguen un intento de otro | Aislar por marcador (nombre del documento) |
| `q-fiscal-status` | Solo busca "no" en la respuesta | Verificación por respuesta más específica |

## 4. Plan de corrección y re-prueba

| Orden | Hallazgo | Tipo | Esfuerzo | Pruebas a re-correr |
|---|---|---|---|---|
| 1 | H1 ritual de arranque | D | bajo | todas (mide el ahorro global) |
| 2 | H2 entidad principal por defecto | C | bajo | 6 |
| 3 | H4 correo del cliente | M | bajo | 1 |
| 4 | H5 anular → rectificativa | H + D | bajo | 2 |
| 5 | H9 parámetros de acciones | M/C | bajo | 2 |
| 6 | H8 cantidad negativa | C/M | bajo | 1 |
| 7 | H3 filtro por nombre de FK | C | medio | 4 |
| 8 | H6 PDF del lado del servidor | C | medio | 1 |
| 9 | H7 asignar rol por MCP | decisión | — | 1 |
| — | Entorno: clave de embeddings | E | bajo | 4 |

**Cómo se re-prueba:** las correcciones van en la rama `feature/ETP-5848` de `com.etendoerp.go` (ya
existe en el entorno, vacía) y se levantan con `local-env up`; después se corre otra vez el barrido de
las pruebas afectadas (1 intento, de a una) y se compara llamadas y tokens contra este informe.
