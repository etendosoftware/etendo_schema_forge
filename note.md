---
task: ETP-5499
note: ETP-5499/4b4c3604
kind: backfill
date: 2026-09-25T18:14:30.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - f610b31355
  - 24a89c064e
  - 19ee5e2b34
  - bbb099979b
files:
  - e2e/tests/flows/platform/document-send-recipients.mocked.spec.js
  - e2e/playwright.config.js
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/internal-consumption/contract.json
  - artifacts/internal-consumption/contract.mcp.json
  - artifacts/match-rule/contract.json
  - artifacts/match-rule/contract.mcp.json
  - artifacts/match-rule/generated/web/match-rule/EtgoMatchRuleHeaderPage.jsx
  - artifacts/organization/contract.json
  - artifacts/organization/contract.mcp.json
  - artifacts/organization/generated/web/organization/OrganizationForm.jsx
  - cli/cache/ad-snapshot/1528ad402e4172a499e4774b58e0454d81f9585eaac77e3e7eec11ca438fc9a6.json
  - cli/cache/ad-snapshot/255a1d8008c10ff6ac0c2ebe27613983aff00eb379150de63202655776329010.json
  - cli/cache/ad-snapshot/33fce2a42dc4a60ef65b69acf4cca88d374e2769325d5a2d7b87c8f8e4bb830b.json
  - cli/cache/ad-snapshot/8f0fec656617c7258be4a117b300dba1f4791d820c2451c13cf14af614e377a7.json
  - cli/cache/ad-snapshot/a248d5b3f106809b799190d64666655fdce8f762d117224a86bdd1b03c42d051.json
  - cli/cache/ad-snapshot/dd3bd7b6d581c9d843680be0b4cb0fc7719b7a70919500043c450a7dd911db2f.json
  - cli/cache/ad-snapshot/ed6297b4abbc26e5258faff30840b5d60f4f4930a1363f8327067f4a4efbe97e.json
---

## Resumen
Se corrigieron fallos en tests E2E causados por credenciales stale entre runs paralelos (condición de carrera). Se mockaron endpoints de reporte para evitar errores 401 en suite mocked. Se regeneraron contratos y snapshots tras integración de ramas.

## Decisiones
- Mockear `/api/reports/*/render` y `/jsreport/api/report` — El servidor de reportes (ETP-5460) rechaza requests sin session cookie con 401, pero la suite mocked usa bearer token; esto provocaba logout y bloqueaba la UI de envío
- Forzar dependencia `onboarding-setup` con `E2E_ONBOARDING_INTEGRATION=1` — El archivo `.auth-credentials.json` stale entre runs causaba que specs paralelos se logueen con cuentas ya eliminadas de la DB; ahora la dependencia se aplica siempre, no solo cuando falta el archivo

## Deuda dejada
- Acoplamiento temporal entre runs: la regeneración de credenciales sigue siendo implícita (ejecutada solo cuando se define la env var), sin garantía explícita de orden
- Hay tres capas de autenticación (session cookie, bearer token, credenciales en archivo) que pueden divergir
