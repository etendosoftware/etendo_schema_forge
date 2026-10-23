# 11. `f-void-invoice` — Anular una factura emitida

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "La factura de Cliente MCPFLOW salió con el cliente equivocado. Anulala."
- **Verificación:** la factura original sigue existiendo, completada y con su número, y hay una
  factura rectificativa completada ligada a ella por el total, así que no queda nada pendiente de
  cobro. **Falla** si la factura se reactiva y se borra o se modifica, o si dice que la anuló y no
  hay rectificativa.
- **Datos previos:** factura completada y contabilizada, sin cobros.
- **Evidencia UI:** ✅ (23 oct) no hay "Anular". El camino es menú ⋮ → "Reactivar": la factura
  vuelve a Borrador y se descontabiliza sola ("Sin contabilizar"), conservando su número. En
  borrador aparece la papelera; "Eliminar" la borra ("Registro eliminado"). Queda un hueco en la
  numeración (FV1000001) y el presupuesto de origen sigue diciendo "Cerrado - Factura creada".
  Ese es el camino que la prueba considera incorrecto. El correcto, la rectificativa (pestaña
  Rectificaciones, ver `f-credit-note`), está 👁: visto, no ejecutado.
- **Decidido (Valentin, 23 oct):** solo vale la rectificativa. En España una factura emitida no se
  borra ni se modifica, aunque la UI lo permita.
- **Holded:** no.
