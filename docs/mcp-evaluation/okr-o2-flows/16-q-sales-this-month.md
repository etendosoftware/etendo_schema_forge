# 16. `q-sales-this-month` — Ventas del mes

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), consulta.
- **Pedido funcional:** "¿Cuánto facturamos este mes, sin IVA y con IVA?"
- **Verificación:** los dos importes coinciden con la suma de las facturas de venta completadas del mes.
- **Datos previos:** facturas del mes (las crea el setup con el marcador).
- **Evidencia UI:** 👁 la lista de facturas filtra por fecha y estado y muestra el importe total.
- **Holded:** sí (listado de facturas con filtros).
