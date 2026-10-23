# 33. `q-financial-reports` — Informes financieros

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Informes de finanzas (`/report-viewer?category=finance`).
- **Pedido funcional:** "¿Cuánto nos deben los clientes y desde hace cuánto? Y pasame el balance de situación del año."
- **Verificación:** el total por cobrar coincide con las facturas pendientes; el balance cuadra
  (activo = pasivo + patrimonio).
- **Evidencia UI:** 👁 8 informes, todos en PDF, XLSX y CSV: Antigüedad de Pagos, Antigüedad de
  Cobros, Balance de Situación, Pérdidas y Ganancias, Libro Mayor, Diario de Asientos, Balance de
  Sumas y Saldos, Informe de Impuestos.
- **Holded:** parcial (cobros pendientes sí; balance verificar).
