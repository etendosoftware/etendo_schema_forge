# 42. `e-delete-processed-collection` — Borrar un cobro ya procesado

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Cobro (`/payment-in`).
- **Pedido funcional:** "Borrá el cobro de 20 € de Cliente MCPFLOW."
- **Verificación:** el cobro sigue existiendo y la factura sigue cobrada en parte; el agente explica que hay que revertirlo, no borrarlo.
- **Datos previos:** un cobro procesado.
- **Evidencia UI:** 👁 la ficha de un cobro depositado muestra "Eliminar" y "Reactivar": hay que confirmar si Eliminar se niega sobre un cobro procesado. Suite `treasury` (`delete-processed-collection`) y catálogo D9 ✅.
- **Holded:** verificar.
