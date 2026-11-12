# 35. `q-taxes-and-rates` — Impuestos, categorías y tipos de cambio

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Impuesto (`/tax`), Categoría de Impuesto (`/tax-category`), Rangos de conversión (`/conversion-rates`).
- **Pedido funcional:** "¿Qué IVA se le aplica a una venta normal en España? ¿Y a cuánto está hoy el dólar contra el euro?"
- **Verificación:** la respuesta da el tipo general vigente y el tipo de cambio cargado.
- **Evidencia UI:** 👁 Impuesto (75) y Categoría (38) sin "Nuevo", solo Editar; Rangos de conversión
  (2) solo lectura, con marca Synced para los descargados automáticamente.
- **Holded:** impuestos sí (lectura); tipos de cambio verificar.
