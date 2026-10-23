# 5. `f-collect-invoice` — Cobro parcial y saldo restante

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), Cobro (`/payment-in`).
- **Pedido funcional:** "Cliente MCPFLOW nos pagó 20 € en efectivo a cuenta de su última factura.
  Registralo y decime cuánto le queda por pagar."
- **Verificación:** la factura queda "Parcial · 20,00 € de 43,56 €", con un cobro de 20 € en estado
  "Cobro depositado" en caja; la respuesta dice 23,56 €.
- **Datos previos:** una factura completada pendiente de cobro.
- **Evidencia UI:** ✅ desde la factura: "Pendiente" → Cobros de la factura → Añadir cobro (importe,
  fecha, método, cuenta) → Confirmar. El cobro aparece en Cobro (filtro por defecto: últimos 30
  días). Un cobro procesado ofrece "Reactivar" y "Eliminar".
- **Holded:** pagos sí; el cobro contra una factura depende de poder leerla (verificar).
