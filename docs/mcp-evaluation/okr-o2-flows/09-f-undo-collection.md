# 9. `f-undo-collection` — Deshacer un cobro registrado por error

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Cobro (`/payment-in`), Factura (`/sales-invoice`).
- **Pedido funcional:** "El cobro de 20 € de Cliente MCPFLOW lo registré por error: todavía no nos
  pagó. Borralo; la factura tiene que quedar pendiente."
- **Verificación:** el cobro ya no existe y la factura vuelve a estar pendiente por el total. Falla
  si dice que lo borró y sigue ahí, o si lo "arregla" con una devolución o un cobro negativo.
- **Datos previos:** factura completada con un cobro confirmado.
- **Evidencia UI:** ✅ (23 oct) la ficha de un cobro depositado tiene "Eliminar"; avisa que va a
  revertir el movimiento de la cuenta y borrar el asiento ("Eliminar de todos modos"). Al
  confirmarlo, el cobro desaparece de la lista y la factura vuelve a "Pendiente · 43,56 €". Es el
  mismo criterio que la prueba `delete-processed-collection` de la suite `treasury`.
- **Holded:** verificar.
- **Nota:** el catálogo de operaciones (D9) decía "debe negarse"; la UI y la suite `treasury` dicen
  lo contrario. Se corrige el catálogo.
