# 5. `w-draft-order-edit-delete` — Corregir y descartar un pedido en borrador

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido (`/sales-order`).
- **Pedido funcional:** "Anotá un pedido de 5 Cervezas para Cliente MCPFLOW. Mejor que sean 4. Al final se arrepintió: borralo."
- **Verificación:** al final no queda ningún pedido activo de 4 Cervezas para ese cliente: borrado si quedó en borrador, o anulado si lo confirmó. Antes del final, el pedido tuvo 4 unidades.
- **Datos previos:** cliente y producto.
- **Evidencia UI:** 👁 un pedido guardado sin confirmar queda en "Borrador" con botón Eliminar; un
  pedido completado no lo tiene. Obligatorios de cabecera: contacto, fecha, dirección, moneda,
  tarifa, condiciones de pago y **almacén** (no se completa solo; sin almacén no deja guardar).
- **Holded:** pedidos de venta: crear, modificar y borrar sí.
