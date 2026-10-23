# 10. `f-credit-note` — Factura rectificativa

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`, pestaña Rectificaciones; filtro "Factura rectificativa").
- **Pedido funcional:** "Una de las 3 Aguas que le facturamos a Cliente MCPFLOW vino rota. Hacele la
  rectificativa por esa unidad."
- **Verificación:** existe una factura rectificativa completada, ligada a la original, por 1 unidad.
- **Datos previos:** factura completada.
- **Evidencia UI:** 👁 la factura completada tiene pestaña Rectificaciones y el menú ⋮ ofrece
  "Reactivar" y "Contabilizar". No ejecutado.
- **Holded:** no (no crea facturas ni notas de crédito por MCP; solo las lee).
