# 8. `f-overpay-sales-invoice` — Cobro mayor que la factura

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), Cobro (`/payment-in`).
- **Pedido funcional:** "Cliente MCPFLOW nos pagó 50 € por una factura de 43,56 €. Registrá el cobro y decime qué pasa con la diferencia."
- **Verificación:** la factura queda cobrada y la diferencia (6,44 €) queda registrada a favor del cliente; la respuesta lo dice.
- **Datos previos:** factura completada y pendiente.
- **Evidencia UI:** 👁 el formulario "Nuevo cobro" muestra Total factura, Dinero, Aplicado y **Diferencia**, con botón "Igualar". No ejecutado con diferencia.
- **Holded:** verificar.
