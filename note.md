---
task: ETP-5492
note: ETP-5492/02483e89
kind: backfill
date: 2026-09-28T13:25:39.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 523d703392
files:
  - artifacts/inventory-stock-report/report-contract.json
  - artifacts/inventory-stock-report/template.hbs
  - tools/app-shell/test/report-inventory-stock-grouped-cards.test.js
---

## Resumen
Se añadió soporte para etiqueta de unidad de medida (UoM), ajuste de ancho de columnas y corrección de corte PDF en el reporte de stock.

## Decisiones
- Modificar el contrato del reporte para incluir metadatos de UoM — permitir configuración uniforme en la definición del reporte
- Actualizar la plantilla Handlebars — implementar lógica de renderizado para las nuevas propiedades
- Ajustar tests correspondientes — mantener cobertura con los cambios de contrato
