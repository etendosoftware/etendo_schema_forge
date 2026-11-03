# 14. `f-customer-return` — Devolución de un cliente

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Albarán (`/goods-shipment`), Albarán de devolución (`/return-material-receipt`).
- **Pedido funcional:** "Cliente MCPFLOW nos devolvió 1 de las Aguas que le mandamos. Registralo."
- **Verificación:** albarán de devolución completado, con "Albarán origen" el de la entrega y 1
  unidad; el stock del producto sube en 1.
- **Datos previos:** albarán de venta completado.
- **Evidencia UI:** 👁 el albarán completado tiene el botón "Crear Devolución"; la devolución pide
  contacto, fecha, almacén, dirección y opcionalmente el albarán de origen. No ejecutado.
- **Holded:** verificar.
