# 12. `w-send-invoice` — Enviar una factura por correo

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "Mandale a Cliente MCPFLOW su última factura por mail."
- **Verificación:** a definir. No se probó el envío, así que no se sabe qué rastro deja; el entorno
  no tiene buzón de prueba. Opciones: un buzón de prueba (p. ej. Mailpit) o el registro de correos
  enviados, si el MCP lo expone.
- **Datos previos:** factura completada; cliente con correo (compras@mcpflow.test).
- **Evidencia UI:** 👁 (23 oct) "Enviar / Descargar" abre "Enviar Factura de Venta #…": vista previa
  del PDF, Para (obligatorio), CC, Asunto (obligatorio, viene prellenado), Mensaje (prellenado),
  "Descargar PDF" y "Enviar". No se envió. El PDF sale titulado "AR Invoice" (en inglés) en una
  empresa en castellano.
- **Holded:** verificar (`get_pdf` y adjuntos en facturas; `send` en presupuestos y pedidos).
