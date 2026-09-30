---
task: ETP-5462
note: ETP-5462/cb87cc67
kind: backfill
date: 2026-09-24T12:01:23.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 0beb856de1
  - ecc768e798
  - 1624c2e703
  - 68a21d75a7
  - c675a913d7
files:
  - tools/ai-bff/.env.example
  - tools/ai-bff/README.md
  - tools/ai-bff/src/server.js
  - tools/ai-bff/src/usage.js
  - tools/ai-bff/test/usage.test.js
  - docs/plans/2026-09-23-usage-events-plan.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se implementó registro de uso de tokens desde el AI BFF con módulo `usage.js`, tests comprensivos y documentación de plan. Se actualizó la dependencia core a versión preview para soporte del cliente de uso de UI.

## Decisiones
- Centralizar el registro en `tools/ai-bff/src/usage.js` — arquitectura de BFF para trackear tokens del agente
- Documentar con plan en `docs/plans/2026-09-23-usage-events-plan.md` — complejidad requería diseño previo
- Tests exhaustivos (343 líneas) — validar funcionalidad crítica de medición de uso

## Deuda dejada
- Plan con "progress status" — indica que el plan establece fases aún por completar
- Variables de entorno en `.env.example` — requiere configuración en deployment que no está implementada
- Dependencia en versión preview de core — puede necesitar actualización cuando salga versión estable

## Pendiente
- Completar las fases del plan según el estado de progreso documentado
