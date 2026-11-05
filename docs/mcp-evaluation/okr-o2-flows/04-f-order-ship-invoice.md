# 4. `f-order-ship-invoice` — Pedido → albarán → factura

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido (`/sales-order`), Albarán (`/goods-shipment`), Factura (`/sales-invoice`).
- **Pedido funcional:** "Cliente MCPFLOW nos pidió 3 Aguas. Mandáselas y facturáselas."
- **Verificación:** pedido completado con 1 línea (3 × Agua); albarán completado con 3 unidades
  enlazado al pedido; factura completada por el mismo total (43,56 € con la tarifa del seed),
  "Entregado 100 %".
- **Datos previos:** cliente con dirección, producto con stock, **período contable del día abierto**
  (ver Hallazgos).
- **Evidencia UI:** ✅ pedido PV1000000 → Confirmar (con "Crear albarán") → albarán 1000000 →
  Confirmar (con "Crear factura de venta") → factura FV1000000 completada.
- **Holded:** pedido y albarán sí; factura no.
