---
task: ETP-5266
note: ETP-5266/0d4a3e6d
kind: backfill
date: 2026-09-10T20:17:01.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 3f3ecbfd05
  - 42c289cfb2
files:
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - e2e/tests/flows/contacts-integration.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.calloutHelpers.vitest.js
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Se actualizó la dependencia `schema_forge_core` a versión 0.3.50 en las definiciones de contrato y dependencias del proyecto. Posteriormente se corrigieron problemas en la generación de callouts y en las pruebas E2E para el flujo de eliminación de contactos.

## Decisiones
- Mantener sincronización de versiones con pins lockstep para `schema_forge_core` — asegura consistencia entre múltiples ubicaciones del proyecto
- Agregar suite de tests para calloutHelpers — detecta o previene regresiones en la lógica de generación de callouts

## Descartado
- El commit log no expone alternativas consideradas ni rechazadas

## Deuta dejada
- El nombre del segundo commit ("Fix the callout generation bump") es impreciso respecto a qué se rompió exactamente tras el bump de versión
- Los cambios en `contacts-integration.spec.js` (117 líneas) sugieren correcciones significativas en flujo E2E, pero no está documentado qué comportamiento incorrecto se detectó
- No hay comentarios en el nuevo archivo `DetailView.calloutHelpers.vitest.js` explicando los casos cubiertos o por qué eran necesarios

## Pendiente
- Documentar el cambio de comportamiento en la generación de callouts tras la actualización a 0.3.50
