# 11. `w-send-invoice` — Enviar una factura por correo

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Factura (`/sales-invoice`).
- **Pedido funcional:** "Mandale a Cliente MCPFLOW su última factura por correo, a compras@mcpflow.test."
- **Verificación:** a definir: queda registro del envío o el PDF generado para esa factura (no hay buzón de prueba).
- **Datos previos:** factura completada; cliente con correo.
- **Evidencia UI:** 👁 botón "Enviar / Descargar" en la ficha de factura (también en pedidos y presupuestos). No ejecutado.
- **Holded:** verificar (`get_pdf` y adjuntos en facturas; `send` en presupuestos y pedidos).
