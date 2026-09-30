---
task: ETP-5276
note: ETP-5276/1c77b3b8
kind: backfill
date: 2026-09-11T16:42:34.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - cd5e9b562d
  - e9815ff768
files:
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-order.md
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se tradujeron los mensajes de error de creación de envío/recepción que el backend adelantó en el flujo. Los errores ahora se mapean y localizan a través de `translateBackendError` en lugar de mostrarse en bruto.

## Decisiones
- Usar el mecanismo existente de traducción de errores backend (`translateBackendError`) — mantiene consistencia con el patrón establecido
- Completar la tabla de mapeos con literales en inglés y claves de región (`es_AR`) que faltaban — cobertura integral de idiomas soportados
- Reubicar el nuevo mapeo fuera del bloque de duplicación detectado por Sonar — evitar que el nuevo código incremente la densidad de duplicación sin motivo

## Deuda dejada
- El archivo `backendErrors.js` tiene un bloque duplicado preexistente que Sonar ya flaggeaba; el commit solo relocalizó el nuevo mapeo para no añadir más duplicación, pero la duplicación base persiste
