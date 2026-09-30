---
task: ETP-4879
note: ETP-4879/11934f22
kind: backfill
date: 2026-09-17T14:14:04.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - db6cb0e6db
  - 6d94f6c6e4
  - 8b3abb8279
  - 826fd82690
  - 82101ed3b6
files:
  - tools/app-shell/src/components/contract-ui/SelectorChip.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/SelectorChip.test.js
  - tools/app-shell/src/components/forms/fields.jsx
  - tools/app-shell/src/windows/custom/financial-account/NewTransactionModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/NewTransactionModal.vitest.jsx
  - docs/generated-custom-windows/financial-account.md
  - docs/generated-custom-windows/general-ledger-configuration.md
  - cli/src/data-fixes/sql/20260917T120000Z__R37-acctdim-bp-pr-locked-active.sql
  - cli/test/data-fixes-r37-acctdim-bp-pr-locked-active.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - docs/feedback.md
---

## Resumen
Se bloqueó el campo de fecha en movimientos financieros procesados (no publicados) para evitar que vuelva a cambiar al guardar, manteniendo editable el G/L, dimensiones contables y descripción. Se incluyó corrección de datos en 98 clientes y cierre de gaps en tests y documentación.

## Decisiones
- **Bloqueo de fecha mediante prop `disabled`** — evita modificación en movimientos procesados; coherente con el alcance `applyEditableDimensions` del backend
- **Data-fix R37: BP/PR siempre activos/obligatorios** — asegura que Contacto/Producto nunca sean toggleables en todos los esquemas contables; validado fleet-wide
- **Corrección del mock AmountInput** — forwarding readOnly→disabled previene regresiones silenciosas donde el bloqueo de monto no se verifique realmente

## Deuda dejada
- **Bug DATEACCT-collapse** — identificado y documentado en feedback.md sin resolución en esta tarea
- **Validación visual del dimming** — el test de SelectorChip aserta el atributo pero no verifica la representación visual

## Pendiente
- Resolución del bug DATEACCT-collapse
