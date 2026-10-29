# 26. `f-internal-consumption` — Consumo interno

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Consumo interno (`/internal-consumption`).
- **Pedido funcional:** "Usamos 2 Quesos Sardos para una degustación. Sacalos del stock."
- **Verificación:** el stock del Queso Sardo baja en 2, con un documento confirmado que lo respalda
  (consumo interno o ajuste de inventario). Falla si cambia el stock sin documento o si no cambia.
- **Evidencia UI:** 👁 obligatorios: fecha y nombre; lista vacía en el seed. 📄 se confirma solo con
  líneas; se puede anular y contabilizar.
- **Holded:** no.
