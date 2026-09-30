---
task: ETP-4914
note: ETP-4914/4005a249
kind: backfill
date: 2026-09-17T11:19:25.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - b368af5c51
  - 6a567aefec
  - ff076414e2
files:
  - artifacts/assets/contract.json
  - artifacts/assets/contract.mcp.json
  - artifacts/assets/decisions.json
  - artifacts/assets/generated/web/assets/AssetsForm.jsx
  - artifacts/assets/generated/web/assets/AssetsPage.jsx
  - artifacts/assets/generated/web/assets/mockData.js
  - tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx
  - docs/generated-custom-windows/assets.md
  - tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.test.js
  - tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.vitest.jsx
---

## Resumen
Se implementó el mostrar siempre el campo "Contacto" en la cabecera de Assets, corrigiendo la matriz de configuración del módulo. Incluye actualización de configuración, componentes, datos mock, documentación y tests.

## Decisiones
- Mostrar "Contacto" permanentemente en la cabecera de Assets según matriz corregida — cambio de comportamiento de UI que requería actualizar configuración y componentes
- Incluir actualización de tests durante la implementación — mantener cobertura de tests sincronizada con los cambios de comportamiento

## Deuda dejada
- La modificación de `AssetsDetailPanel.jsx` (línea agregada) sugiere ajuste puntual sin refactorización mayor; la extensión de la matriz podría requerir revisión de otros campos dependientes
