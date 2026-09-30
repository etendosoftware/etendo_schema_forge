---
task: ETP-5252
note: ETP-5252/397df5ff
kind: backfill
date: 2026-09-10T17:10:24.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 860302c926
files:
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/PaymentsCard.jsx
---

## Resumen
Se renombró la etiqueta de "pago" a "cobro" en la vista de facturas para operaciones de ventas, con actualizaciones en tres idiomas (inglés, español de Argentina y España) y refactorización de componentes relacionados.

## Decisiones
- Refactorizar `PaymentsCard.jsx` junto con el cambio de label (289 líneas modificadas), sugiriendo reorganización del componente más allá del renombramiento puro

## Deuda dejada
- El alcance del refactoring de `PaymentsCard.jsx` es significativo (+177/-123 líneas) sin detalles documentados sobre qué se restructuró; podría generar fricción en futuros cambios si la intención no está clara
