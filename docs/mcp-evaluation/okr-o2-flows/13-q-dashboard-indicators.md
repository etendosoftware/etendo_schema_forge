# 13. `q-dashboard-indicators` — Indicadores del negocio

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Inicio (`/dashboard`).
- **Pedido funcional:** "¿Cómo viene el negocio? Decime cuánto ingresamos y gastamos en los últimos 12 meses, qué tengo vencido por cobrar y por pagar, y cuál es el producto que más vendemos."
- **Verificación:** cada cifra coincide con la que muestra el panel en ese momento (se calculan desde los datos al correr la prueba, no se fijan).
- **Datos previos:** ninguno (usa los datos del tenant sembrado).
- **Evidencia UI:** 👁 el panel muestra: Tareas pendientes (facturas de venta vencidas, pagos vencidos, recepciones pendientes…), Resumen financiero (ingresos, gastos, beneficio, últimos 12 meses), Clientes destacados, Ventas recientes, Cobros y pagos (por cobrar / por pagar), Evolución financiera y Productos más vendidos.
- **Holded:** parcial (facturas con filtros y previsión de tesorería; sin panel).
