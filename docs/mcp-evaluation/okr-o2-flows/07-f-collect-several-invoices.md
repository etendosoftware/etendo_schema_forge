# 7. `f-collect-several-invoices` — Un cobro para varias facturas

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), Cobro (`/payment-in`).
- **Pedido funcional:** "Cliente MCPFLOW nos transfirió todo lo que nos debía de sus dos facturas, en un solo pago. Registralo."
- **Verificación:** las dos facturas quedan cobradas (saldo 0) con un único cobro por la suma.
- **Datos previos:** dos facturas completadas y pendientes del mismo cliente.
- **Evidencia UI:** 📄 guía `payment-in.md`; no ejecutado (en la UI el cobro se agrega desde cada factura).
- **Holded:** verificar.
