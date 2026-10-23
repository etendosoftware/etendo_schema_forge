# 9. `f-purchase-receive-invoice` — Pedido de compra → recepción → factura

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido, Albarán y Factura de Compras (`/purchase-order`, `/goods-receipt`,
  `/purchase-invoice`) y Relación albarán-factura (`/matched-purchase-invoices`, solo lectura).
- **Pedido funcional:** "Pedile 10 Cervezas a Proveedor Mayorista para el almacén principal. Ya
  llegaron: registrá la recepción y cargá su factura con el número MCPFLOW-FC-1."
- **Verificación:** pedido completado; albarán de compra completado con 10 unidades; factura de
  compra completada con esa referencia; en Relación albarán-factura aparece el vínculo entre la
  línea del albarán y la de la factura; el stock sube en 10.
- **Datos previos:** proveedor con dirección y producto.
- **Evidencia UI:** 👁 obligatorios del pedido: contacto, fecha, dirección, **fecha de entrega
  esperada**, almacén, condiciones de pago, moneda y tarifa. La factura de compra pide además
  tipo de documento, fecha contable y método de pago. No ejecutado.
- **Holded:** pedido de compra y recepción sí; factura de compra (purchases/bills) verificar.
