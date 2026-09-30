---
task: ETP-5304
note: ETP-5304/869ffc7f
kind: backfill
date: 2026-09-18T00:51:20.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - eec9b0c0aa
  - 4632843477
files:
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreviewModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/EmailsCard.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/EmailsCard.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/GenericPreviewModal.vitest.jsx
---

## Resumen
Mejoró usabilidad en vistas previas: destinatarios se revelan en tooltip al truncarse, y la barra de pestañas se oculta cuando hay una sola pestaña.

## Decisiones
- Usar TruncatedText para revelar destinatarios completos en hover — mantiene compacidad sin perder información
- Renderizar barra de pestañas solo si hay múltiples — elimina UI inactiva que parecía clickeable
- Stubear EmailsCard en tests de InvoicePreviewModal — aisla comportamiento del tooltip en su propio test

## Deuda dejada
- El valor de activeTab siempre defaultea a la primera pestaña; si en futuro hay variaciones, esta lógica podría simplificarse
