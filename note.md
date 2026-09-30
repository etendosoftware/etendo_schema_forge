---
task: ETP-5268
note: ETP-5268/91dc5aed
kind: backfill
date: 2026-09-16T19:41:16.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - 0ca5751d16
  - 87eafa6a9f
  - 086a1df33c
  - 06bbfbc7c9
  - 7015e71d24
  - 20762b9845
  - 502556b77f
  - 165054328d
  - d20df6d33c
  - 6466fb45cc
  - ce078b3565
  - 29d7c13a8c
  - 362826f1e1
  - c09b692374
  - c98238ab80
  - 7d97ae8331
files:
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.columnChrome.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx
  - tools/app-shell/src/lib/__tests__/semanticThemeUsage.test.js
  - tools/app-shell/src/lib/linesColumnWidth.js
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx
  - artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.rowHoverStyle.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx
---

## Resumen
Se corrigió que la barra de acciones rápidas de filas cubría contenido de la tabla. Se reemplazó un seguimiento imperativo del scroll con CSS sticky y se añadieron controles de ancho por columna e indicadores visuales (scrollbar espejo, header adhesivo).

## Decisiones
- **Reemplazar scroll-tracked por sticky CSS** — más simple, menos overhead imperativo, comportamiento nativo del navegador.
- **Mirror scrollbar para columna adhesiva** — mantiene visibilidad de scroll horizontal donde no se ve de otro modo.
- **Sticky header separado para documento-list** — evita conflictos con contenedor scroll que no puede hostedar thead sticky funcional.
- **Enforcer minimum width por columna** — previene oscilación y collapso de contenido durante resize/scroll.
- **Background translúcido para actions pill** — coincide con tint hover de la fila en lugar de color plano.

## Descartado
- Enfoque imperativo de scroll-tracking — reemplazado por reglas CSS nativas tras múltiples ajustes de oscilación.

## Deuda dejada
- Palette literals hardcoded (valores de scroll thumb y sticky mask) — sin token semántico equivalente.
- Complejidad cognitiva en DataTable (límite 15) resuelta parcialmente; puede requerir refactoring futuro si sigue creciendo.

## Pendiente
- Validar comportamiento en listas muy largas y viewports pequeños en producción.
