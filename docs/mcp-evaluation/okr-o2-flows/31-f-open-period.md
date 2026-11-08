# 31. `f-open-period` — Año fiscal y apertura de período

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Calendario (`/calendar`), Esquema contable (`/general-ledger-configuration`).
- **Pedido funcional:** "Quiero facturar con fecha de hoy y no me deja porque el mes está cerrado. Abrilo."
- **Verificación:** el período del mes actual figura "Todos abiertos"; después se puede completar un
  documento con fecha de hoy.
- **Evidencia UI:** ✅ Calendario → año 2026 → Períodos → "Abrir/Cerrar Periodo" → Abierto. También
  ✅ alta, edición y baja de un año fiscal (2031). 👁 Esquema contable es una pantalla de 4 pestañas
  (General, Valores por defecto, Dimensiones, Cuentas generales): queda como consulta.
- **Holded:** no.
