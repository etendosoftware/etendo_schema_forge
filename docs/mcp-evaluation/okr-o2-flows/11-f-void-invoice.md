# 11. `f-void-invoice` — Anular una factura emitida

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "La factura de Cliente MCPFLOW salió con el cliente equivocado. Anulala."
- **Verificación:** la factura ya no figura como emitida ni pendiente de cobro: borrada, o anulada
  con una rectificativa por el total. Falla si dice que la anuló y sigue completada.
- **Datos previos:** factura completada y contabilizada, sin cobros.
- **Evidencia UI:** ✅ (23 oct) no hay "Anular". El camino es menú ⋮ → "Reactivar": la factura
  vuelve a Borrador y se descontabiliza sola ("Sin contabilizar"), conservando su número. En
  borrador aparece la papelera; "Eliminar" la borra ("Registro eliminado"). Queda un hueco en la
  numeración (FV1000001) y el presupuesto de origen sigue diciendo "Cerrado - Factura creada".
  La otra vía es la rectificativa (`f-credit-note`).
- **A decidir:** en España una factura emitida no se debería borrar (lo correcto es rectificarla).
  ¿La prueba acepta el borrado como resultado correcto, o solo la rectificativa?
- **Holded:** no.
