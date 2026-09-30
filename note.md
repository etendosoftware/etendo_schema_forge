---
task: ETP-4928
note: ETP-4928/3a88fbe6
kind: backfill
date: 2026-09-23T12:25:42.000Z
authors:
  - Santiago Alaniz
agents:
sessions:
commits:
  - 96e11c7d04
  - bd1b8e3980
files:
  - tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AutoMatchSuggestionModal.vitest.jsx
---

## Resumen
Se corrigieron problemas de alineación en el modal de sugerencias automáticas: solapamiento de columnas y desalineación de headers respecto al divider de filas. Se agregaron pruebas para validar la alineación.

## Decisiones
- Resolver en dos commits separados — primero un fix rápido del overlap, luego una refactorización más completa con tests que asegure la alineación duradera
