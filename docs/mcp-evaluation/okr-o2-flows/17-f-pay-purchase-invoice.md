# 17. `f-pay-purchase-invoice` — Pagar una factura de proveedor

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura de compra (`/purchase-invoice`), Pago (`/payment-out`).
- **Pedido funcional:** "Pagale por transferencia a Proveedor Mayorista la factura MCPFLOW-FC-1."
- **Verificación:** la factura queda pagada (saldo pendiente 0) y hay un pago por ese importe.
- **Datos previos:** factura de compra completada.
- **Evidencia UI:** 👁 Pago no tiene "Nuevo" en la lista: se paga desde la factura, igual que el
  cobro (`f-collect-invoice`). 📄 guía `payment-out.md`.
- **Holded:** pagos sí; verificar el vínculo con la compra.
