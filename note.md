---
task: ETP-5319
note: ETP-5319/d8e89095
kind: backfill
date: 2026-09-15T11:20:39.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - fbce3a9ae0
files:
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.inlineRowUpdate.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.snapshotHelpers.vitest.js
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Se añadió validación para impedir la edición inline de columnas marcadas como readOnly al ejecutar un PATCH. Los cambios incluyen lógica de protección en `detailViewHelpers.jsx` y cobertura de tests completa.

## Decisiones
- Implementar la validación en los helpers reutilizables en lugar de en el componente, para centralizar la lógica
- Refactorizar `DetailView.jsx` para aplicar la validación antes de intentar el update

## Deuda dejada
- No se observa claramente qué casos edge se cubrieron; el volumen de tests sugiere cobertura de escenarios múltiples de readOnly, pero sin acceso al contenido específico de los tests no se puede precisar
