# 4. `f-order-direct-invoice` — Pedido facturado sin albarán

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido (`/sales-order`), Factura (`/sales-invoice`).
- **Pedido funcional:** "Cliente MCPFLOW nos encargó 2 horas de instalación. Cargá el pedido y facturalo directamente: no hay nada que entregar."
- **Verificación:** pedido completado y factura completada relacionada, por el mismo total; no se generó albarán.
- **Datos previos:** cliente; un producto de tipo servicio (o el que corresponda sin entrega).
- **Evidencia UI:** 👁 el diálogo de Confirmar del pedido ofrece "Crear factura: se generará y confirmará una factura con las cantidades del pedido", sin marcar "Crear albarán".
- **Holded:** no (no crea facturas por MCP).
