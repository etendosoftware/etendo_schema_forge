# 16. `q-top-customers` — Mejores clientes

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), Inicio (Clientes destacados), consulta.
- **Pedido funcional:** "¿Cuáles son mis tres mejores clientes por lo facturado este año?"
- **Verificación:** el ranking y los importes coinciden con la suma por cliente de las facturas completadas del año.
- **Datos previos:** facturas de al menos tres clientes.
- **Evidencia UI:** 👁 el panel muestra "Clientes destacados" con su importe; la lista de facturas permite agrupar la información por contacto.
- **Holded:** parcial (hay que sumar desde el listado de facturas).
