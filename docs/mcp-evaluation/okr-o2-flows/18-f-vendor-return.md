# 18. `f-vendor-return` — Devolución a proveedor

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Albarán de compra (`/goods-receipt`), Albarán de devolución de compras
  (`/return-to-vendor-shipment`).
- **Pedido funcional:** "Dos de las Cervezas que recibimos de Proveedor Mayorista vinieron
  vencidas. Devolvéselas."
- **Verificación:** albarán de devolución completado, con origen la recepción y 2 unidades; el
  stock baja en 2.
- **Datos previos:** albarán de compra completado.
- **Evidencia UI:** 👁 botón "Crear Devolución" en el albarán de compra completado.
- **Holded:** verificar.
