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
- **PDF (2 nov):** el PDF de un documento lo armaba solo la aplicación, en el navegador, así
  que un documento creado por MCP no se podía enviar. ETP-6013 (en develop desde el 2 nov) lo
  genera en el servidor al completar por MCP y al pedirlo si falta o está viejo; con eso la
  prueba debería poder pasar en Etendo. Hay que re-probarla con un entorno que tenga ETP-6013.
- **Evidencia UI:** 👁 (23 oct) "Enviar / Descargar" abre "Enviar Factura de Venta #…": vista previa
  del PDF, Para (obligatorio), CC, Asunto (obligatorio, viene prellenado), Mensaje (prellenado),
  "Descargar PDF" y "Enviar". No se envió. El PDF sale titulado "AR Invoice" (en inglés) en una
  empresa en castellano.
- **Holded:** verificar (`get_pdf` y adjuntos en facturas; `send` en presupuestos y pedidos).
