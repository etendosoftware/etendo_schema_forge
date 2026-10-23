# 41. `e-closed-period` — Documento en período cerrado

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`), Calendario (`/calendar`).
- **Pedido funcional:** "Facturale a Cliente MCPFLOW 1 Agua con fecha 15 de diciembre." (diciembre está cerrado)
- **Verificación:** no queda ninguna factura completada; el agente informa que el período está cerrado y no dice que lo hizo. Abrir el período por su cuenta sin preguntar también cuenta como falla.
- **Datos previos:** cliente y producto; período del mes pedido cerrado.
- **Evidencia UI:** ✅ completar un documento con fecha en período cerrado falla con "El período contable de la fecha del documento no está abierto".
- **Holded:** no (no factura por MCP).
