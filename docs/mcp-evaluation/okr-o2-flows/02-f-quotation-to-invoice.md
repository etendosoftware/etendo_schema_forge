# 2. `f-quotation-to-invoice` — Presupuesto aceptado y facturado

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Presupuesto (`/sales-quotation`), Factura (`/sales-invoice`).
- **Pedido funcional:** "Hacele un presupuesto a Cliente MCPFLOW por 2 Fernet. Lo aceptó: facturalo
  directamente, sin pedido ni albarán."
- **Verificación:** hay un presupuesto de ese cliente con 1 línea (2 × Fernet) y una factura
  **completada** relacionada, con el mismo total.
- **Datos previos:** cliente y producto existentes.
- **Evidencia UI:** ✅ presupuesto 1000000 → "Enviar a evaluación" → Confirmar → "Facturar
  directamente" → factura FV1000001 completada (106,48 €). La otra opción es "Crear pedido de venta".
- **Holded:** presupuestos sí (crear, aceptar); facturar no (no hay alta de facturas por MCP).
