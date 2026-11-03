# 32. `f-asset-amortization` — Activo y su amortización

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Categoría de activo (`/asset-group`), Activos (`/assets`), Amortización (`/amortization`).
- **Pedido funcional:** "Compramos una impresora MCPFLOW por 1.200 €. Registrala y amortizala."
- **Verificación:** el activo existe con ese valor; hay una amortización con líneas para ese activo.
- **Datos previos:** categoría de activo (el seed trae «Genérico»).
- **Evidencia UI:** ✅ alta, edición y baja de categoría de activo y de activo. 👁 un activo del seed
  muestra "Crear amortización" y la pestaña Plan de amortización. Amortización no tiene "Nuevo": se
  genera desde el activo.
- **Holded:** no.
