# 13. `w-send-invoice` — Enviar una factura por correo

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "Mandale a Cliente MCPFLOW su última factura por mail, a compras@mcpflow.test."
- **Verificación (2 nov, ETP-5848):** el historial de envíos del documento tiene un correo `SENT` a
  compras@mcpflow.test. Se lee con `etendo_send_document_email` en `preview:true`, que desde
  ETP-5848 lista los envíos anteriores en `history` (los mismos que la tarjeta "Emails" de la
  vista previa); el harness lo lee con `expectEffect.rowsAt: history`. Antes la verificación era
  provisional (la respuesta nombraba la dirección) y la prueba pasaba sin que se enviara nada.
- **Datos previos:** factura completada; cliente con correo (compras@mcpflow.test).
- **Límite conocido de Etendo:** el PDF de un documento lo arma la aplicación, en el navegador. Un
  documento creado por MCP no tiene PDF hasta que alguien abre su vista previa en la aplicación,
  y sin PDF no se puede enviar. Por eso esta prueba **falla en Etendo** hoy: es un límite real
  frente a Holded, no un fallo de la prueba. Desde ETP-5848 los dos mensajes de "sin PDF" dicen
  que solo la aplicación lo genera y que no se reintente; antes se remitían uno al otro (13
  llamadas y 604k tokens; ahora 7 llamadas y 261k). Generar el PDF del lado del servidor, con el
  mismo diseño, es una tarea aparte (ver H6 en `../okr-o2-sweep-analysis.md`).
- **Evidencia UI:** 👁 (23 oct) "Enviar / Descargar" abre "Enviar Factura de Venta #…": vista previa
  del PDF, Para (obligatorio), CC, Asunto (obligatorio, viene prellenado), Mensaje (prellenado),
  "Descargar PDF" y "Enviar". No se envió. El PDF sale titulado "AR Invoice" (en inglés) en una
  empresa en castellano.
- **Holded:** verificar (`get_pdf` y adjuntos en facturas; `send` en presupuestos y pedidos).
