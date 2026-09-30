---
task: ETP-5321
note: ETP-5321/40acd5df
kind: backfill
date: 2026-09-21T00:07:17.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 6f396263d3
  - 7c2c69957d
files:
  - docs/plans/2026-09-18-etp5321-total-discount-decimal-fix.md
  - tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentTotalsPanel.vitest.jsx
---

## Resumen
Se mejoró el panel de totales de documentos, arreglando un problema con cálculo de decimales en descuentos totales. Se agregaron tests y se documentó el análisis de validación de montos.

## Decisiones
- Reparar manejo de decimales en `DocumentTotalsPanel` — el cálculo del total de descuentos presentaba imprecisiones
- Agregar cobertura de tests para la lógica de totales — validar el comportamiento con diferentes montos
- Documentar análisis de `MaskedAmountInput` — quedó registro del comportamiento observado en matriz de pruebas

## Deuda dejada
- Análisis de `MaskedAmountInput` quedó registrado en notas pero no está claro si se implementaron cambios adicionales por ello; puede requerir seguimiento
