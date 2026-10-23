# 35. `w-commercial-setup` — Tarifa y condiciones de pago

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Tarifa (`/price-list`), Condiciones de pago (`/payment-term`).
- **Pedido funcional:** "Creá la tarifa de venta MCPFLOW Mayoristas y una condición de pago a 45
  días. Después cambiales la descripción y el nombre, y al final borralas."
- **Verificación:** las dos existen con los valores editados y después ya no.
- **Evidencia UI:** ✅ alta, edición (releída) y baja de las dos. Condiciones de pago **rechaza una
  segunda condición con los mismos días** ("Ya existe la condición de pago … con esos días"):
  sirve también para una prueba `e-`.
- **Holded:** tarifas sí (verificar alta); condiciones de pago verificar.
