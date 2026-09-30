---
task: ETP-5398
note: ETP-5398/a8eb3f27
kind: backfill
date: 2026-09-24T14:44:20.000Z
authors:
  - Luciano Palacio
agents:
sessions:
commits:
  - e8229d8b8a
  - 00d417e089
  - 48fb2b3842
  - 2d0bc55ea7
  - 9ea5cb71a0
  - 045bc154f4
  - f30a09f64b
  - 59cccfcd27
  - 42069a5836
  - 12a1b28ce1
files:
  - tools/app-shell/src/components/contract-ui/ModalCloseButton.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/modal-styles.test.js
  - tools/app-shell/src/components/contract-ui/modal-styles.js
  - artifacts/sales-quotation/custom/CreateRejectReasonModal.jsx
  - artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
  - artifacts/sales-quotation/custom/RejectQuotationModal.jsx
  - artifacts/sales-quotation/custom/SendToEvaluationModal.jsx
  - artifacts/sales-quotation/custom/__tests__/RejectQuotationModal.test.js
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - docs/ui-design-guidelines.md
  - docs/plans/2026-09-24-ETP-5398-action-modal-design-contract.md
  - docs/plans/2026-09-24-ETP-5398-remediation-map.md
  - tools/app-shell/test/action-modal-style-contract.test.js
  - artifacts/sales-quotation/custom/QuotationTopbarActions.jsx
  - artifacts/sales-quotation/custom/__tests__/SendToEvaluationModal.test.js
  - tools/app-shell/src/components/contract-ui/ActionModalSummary.jsx
  - tools/app-shell/src/index.css
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/sales-quotation/index.jsx
  - artifacts/sales-quotation/custom/__tests__/QuotationConfirmModal.test.js
---

## Resumen
Se resolvió deuda técnica en modales de acción (cotización, rechazo, clonación) centralizando su chrome en DOCUMENT_ACTION_MODAL, eliminando violaciones de token contract que causaban contraste bajo e inconsistencia visual, y documentando reglas para evitar regresiones.

## Decisiones
- **Fuente única DOCUMENT_ACTION_MODAL** — evitar duplicación y las tres variaciones de botón que llevaban a pares de tokens rotos
- **--foreground en lugar de --primary para botón dark** — --primary gira a azul bajo `.dark`, --foreground es invariante
- **Swap en lugar de opacidad en disabled** — opacidades distintas aplicadas al mismo hex creaban dos colores en pantalla
- **Test guard en declaration level** — pintar el contrato (nunca *-bg backing button, --card nunca border, disabled text en --text-disabled, scrim en --scrim) con excepciones explícitas para decorative icons

## Descartado
- Convertir CloneReceiptModal a genérica — se mantiene como bespoke modal
- Reload de página post-DR en SendToEvaluationModal — implementar onRefresh era la fix anterior, replicada en ambos mount sites

## Deuda dejada
- OptionCard unselected mantiene --muted como text color (follow-up reportado)
- Modal button widths sin normalizar (fuera de scope)
- Tokens accent/blue para banner solo en index.css de app, no en core (limitación del ticket)

## Pendiente
- Aplicar ActionModalSummary a otros modales que repitan su estructura
- Normalizar anchos de botones en modales
