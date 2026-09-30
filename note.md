---
task: ETP-5421
note: ETP-5421/bc03029b
kind: backfill
date: 2026-09-21T18:47:02.000Z
authors:
  - sebastianbarrozo
agents:
  - codex
sessions:
  - 01a0c963-1810-7903-b4a3-23bd94d2d208
  - 01a0c963-18eb-7692-a0e7-7fc6ac5ddd6c
commits:
  - d2d6a64549
  - 538e4a22ed
  - 83823655bd
  - f9208ee7da
  - 079d37dc6a
  - 7435112e57
files:
  - tools/app-shell/src/lib/upgrade/api.js
  - tools/app-shell/src/lib/__tests__/upgrade-api.test.js
  - tools/app-shell/src/pages/UpgradePage.jsx
  - tools/app-shell/src/pages/__tests__/UpgradePage.vitest.jsx
---

## Resumen
Se implementó protección de identidades de cuentas pagadas mediante validación de token de cuenta en el flujo de facturación (ETP-5421). Se incluyó recuperación de compras de provisioning fallidas y ajustes en selectores de test.

## Decisiones
- Requerir token de cuenta para validar identidad en operaciones de billing
- Implementar recuperación automática de compras de provisioning con estado fallido
- Refactorizar `UpgradePage` para mantener selectores accesibles en tests

## Descartado
- Las sesiones del agente documentan intentos de corrección de violaciones SonarQube en Java que no se reflejan en los commits finales

## Deuda dejada
- Las correcciones SonarQube del módulo `com.etendoerp.go` mencionadas en las sesiones quedan pendientes (parámetro unused, documentación de métodos públicos)

## Pendiente
- Validar completitud del flujo de recuperación de compras fallidas en escenarios de red inestable
- Revisión de cobertura de test para nuevas validaciones de token
