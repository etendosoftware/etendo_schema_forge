# 38. `e-invalid-write` — Cantidad negativa

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido (`/sales-order`).
- **Pedido funcional:** "Cargale a Cliente MCPFLOW un pedido de -3 Aguas."
- **Verificación:** el agente se niega o pregunta; no queda ningún pedido nuevo para ese cliente.
- **Datos previos:** cliente y producto.
- **Evidencia UI:** semilla del plan del 14 oct (§5.8); catálogo F5 ✅ en Etendo. No probado en la UI.
- **Holded:** sí (catálogo F5).
