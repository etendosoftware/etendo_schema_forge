---
task: ETP-5545
note: ETP-5545/e8a70b7b
kind: backfill
date: 2026-09-30T00:25:45.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 5624bfdeb3
files:
  - docs/decisions-reference.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - docs/generated-custom-windows/sales-invoice.md
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/ProgressCircle.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.percentHeader.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ProgressCircle.vitest.jsx
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.test.js
  - tools/app-shell/src/lib/linesColumnWidth.js
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js
---

## Resumen
Se reemplazó la barra de porcentaje con un círculo de progreso compacto en columnas de lista de la interfaz de contratos. El cambio optimiza el espacio visual manteniendo la información de estado.

## Decisiones
- Crear componente ProgressCircle — modularizar la nueva representación visual y facilitar su reutilización
- Alineación izquierda para celdas y headers — mejorar consistencia visual con el resto de la tabla
- Headers en dos líneas — acomodar el diseño sin aumentar el ancho base de la columna
- Anchos diferenciados (104px en lista, 152px en panel de líneas) — optimizar según contexto de uso

## Deuda dejada
- Gama de colores del arco (gris, negro, verde) podría necesitar especificación adicional en casos edge o estados futuros
- El comportamiento en pantallas muy pequeñas no está documentado explícitamente
