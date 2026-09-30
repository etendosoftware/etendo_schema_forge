---
task: ETP-5537
note: ETP-5537/cf2c3873
kind: backfill
date: 2026-09-30T00:03:16.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - 726b233b76
  - 6ff3229d1c
  - 119bd277ac
  - 2f67e989fb
  - 3642dd38c8
  - af1f70be97
  - 6caa6e6197
  - 62f15b4ee2
  - 3a63424056
  - e3810bbf05
files:
  - cli/src/data-fixes/sql/20260928T140000Z__R41-personal-role-owner-backfill.sql
  - cli/test/data-fixes-r41-personal-role-owner-backfill.test.js
  - cli/test/data-fixes-report-regression.test.js
  - docs/feedback.md
  - e2e/tests/flows/fiscal/fiscal-config.mocked.spec.js
  - e2e/tests/flows/system/user-invitation.email.integration.spec.js
  - e2e/tests/helpers/product-helpers.js
  - tools/app-shell/src/hooks/__tests__/useEntity-helpers.test.js
  - tools/app-shell/src/hooks/__tests__/useEntity-save-helpers.test.js
  - tools/app-shell/src/hooks/__tests__/useEntity.helpers.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - e2e/tests/flows/purchases/purchase-order-to-invoice.integration.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.calloutHelpers.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.helpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.render.vitest.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Se implementaron múltiples capas de defensa contra errores 422 que el backend comenzó a devolver tras ETP-5347, que rechaza campos read-only. El trabajo abarca filtrado preventivo en payloads de CREATE y PATCH, exclusión de campos de callout, salto de identificadores FK, y retry automático con remoción de campos rechazados.

## Decisiones
- Arquitectura defensiva en capas: filtrado frontend preventivo en buildCreatePayload/buildPatchPayload, más safety net reactivo (retry)
- Mantener userChangedKeysRef aunque callout toque un campo, para protección contra overwrite por /defaults y refreshHeaderTotals
- Consultar contractFields además de mounted-form registry para read-only lookup
- Retry solo en 422 read_only_field, máximo 5 intentos, removiendo solo el campo exacto que el backend nombra
- No cambiar legacy lowercase FK pattern (ad_org_id) sin observar fallo real

## Descartado
- Tocar el generador de código o enviar full contract.json al bundle — problema estructural pero out of scope

## Deuda dejada
- PATCH-side 422 no resuelta: callout escribe en `editing` independientemente del payload, causando divergencia editing/selected que re-envía el campo
- Problema estructural: campos readOnly en contract.json pero ausentes en formularios importados quedan invisibles al filtrado frontend
- Retry es safety net ante metadatos incompletos, no solución definitiva
- Legacy FK pattern en PATCH sin verificación observada

## Pendiente
- Resolver divergencia editing/selected post-callout para cerrar PATCH-side 422
- Solución arquitectónica para metadatos de contract completos en frontend
