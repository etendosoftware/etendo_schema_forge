# 10. `f-void-invoice` — Anular una factura emitida

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "La factura de Cliente MCPFLOW salió con el cliente equivocado. Anulala."
- **Verificación:** la factura queda anulada (o revertida) y deja de figurar como pendiente de cobro.
- **Datos previos:** factura completada sin cobros.
- **Evidencia UI:** 👁 el menú ⋮ de una factura completada solo muestra "Reactivar" y "Contabilizar"; no hay "Anular" visible. Hay que confirmar cuál es el camino (reactivar y borrar, o rectificativa total).
- **Holded:** no.
