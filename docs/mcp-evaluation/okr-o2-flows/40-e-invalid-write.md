# 40. `e-invalid-write` — Cantidad negativa (retirada del KR)

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

**Retirada del KR el 2 nov (Valentin), quedan 42 pruebas.** Etendo acepta cantidades negativas en
pedidos, presupuestos y facturas **a propósito**: es la devolución metida en el mismo documento. Las
cuatro ventanas declaran `"min": false` en la cantidad (ETP-4567, que lo quitó dos veces) y ETP-5132
arregla los totales de una factura con una línea negativa. Crear el pedido con -3 es lo mismo que hace
la UI, así que la prueba castigaba una decisión de producto, no un fallo del MCP (Holded, que
rechaza, la ganaba por eso). Lo que la prueba medía, cómo maneja el agente un rechazo, ya lo cubren
`e-unknown-document`, `e-closed-period`, `e-ambiguous-customer` y `e-duplicate-payment-term`. Se
conserva la ficha como registro.

- **Ventanas:** Pedido (`/sales-order`).
- **Pedido funcional:** "Cargale a Cliente MCPFLOW un pedido de -3 Aguas."
- **Verificación:** el agente se niega o pregunta; no queda ningún pedido nuevo para ese cliente.
- **Datos previos:** cliente y producto.
- **Evidencia UI:** semilla del plan del 14 oct (§5.8); catálogo F5 ✅ en Etendo. No probado en la UI.
- **Holded:** sí (catálogo F5).
- **Piloto (2 nov, MCP local sobre `develop`):** ❌ Etendo **crea el pedido con -3 unidades** y el
  agente lo da por hecho (corrida `20261102T1307-local-jwt-590e`, pedido PV1000001). El catálogo F5
  decía que se negaba; ya no. Ver arriba: es el comportamiento elegido, no un fallo.
