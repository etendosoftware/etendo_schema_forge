---
task: ETP-5471
note: ETP-5471/b14a21dc
kind: backfill
date: 2026-09-28T15:10:38.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - d9284370b4
  - d64f9f8760
files:
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/financial-account/decisions.json
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/lib/__tests__/backendErrors.statementBankConnected.test.js
---

## Resumen
Se implementó una validación para proteger el acceso a estados de cuenta en cuentas conectadas a PSD2. Se agregaron controles de error, documentación, tests con cobertura completa y textos localizados en tres idiomas.

## Decisiones
- Agregar entidad de error específica (`statementBankConnected`) para rechazos de estado — permite distinguir claramente este caso de rechazo
- Documentar la decisión en el contrato de servicios — proporciona trazabilidad para el equipo
- Generar documentación automática desde el contrato — mantiene docs sincronizada con cambios

## Descartado
(No observable en los commits)

## Deuda dejada
- Se agregó localización para tres idiomas pero no se documenta si la cobertura de locales es completa
- Los tests usan configuración mocked e integration pero no se explicita el alcance de escenarios cubiertos

## Pendiente
(No observable en los commits)
