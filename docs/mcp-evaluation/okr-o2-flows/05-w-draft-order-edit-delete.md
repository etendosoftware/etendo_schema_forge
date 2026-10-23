# 5. `w-draft-order-edit-delete` — Corregir y descartar un pedido en borrador

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Pedido (`/sales-order`).
- **Pedido funcional:** "Empezá un pedido para Cliente MCPFLOW con 5 Cervezas, pero no lo confirmes.
  Ahora cambiá la cantidad a 4. Al final el cliente se arrepintió: borrá ese pedido."
- **Verificación:** mientras existe, el pedido está en borrador con 4 unidades; al final no existe.
- **Datos previos:** cliente y producto.
- **Evidencia UI:** 👁 un pedido guardado sin confirmar queda en "Borrador" con botón Eliminar; un
  pedido completado no lo tiene. Obligatorios de cabecera: contacto, fecha, dirección, moneda,
  tarifa, condiciones de pago y **almacén** (no se completa solo; sin almacén no deja guardar).
- **Holded:** pedidos de venta: crear, modificar y borrar sí.
