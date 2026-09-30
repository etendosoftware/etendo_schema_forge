---
task: ETP-5216
note: ETP-5216/eb9dfa64
kind: backfill
date: 2026-09-09T23:45:43.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 6a58e6bbbe
  - 756ab218be
  - fea9c329e3
  - 94d70dd022
  - 9f483aced2
  - f11f5b2271
  - 4b60864395
  - c60f9942c0
  - 9096e532e8
  - 51b457fca8
  - d928d1c64f
  - 3236985c3f
  - b87e91197a
  - 15322362f2
  - 97efc9455c
  - cd3ce11ab5
  - b640a498c8
  - ea341e8463
  - 060f310a5c
  - d68f7ca3cd
  - 5c50a4d2a8
  - c9448bd134
  - 8ccf3e6246
  - 6ad9d19c62
  - 46ac771028
files:
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - .claude/agents/reviewer.md
  - .claude/agents/schema-forge-developer.md
  - .claude/agents/window-agent.md
  - .claude/agents/workflow.md
  - CLAUDE.md
  - artifacts/purchase-invoice/__tests__/contract-integrity.test.js
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderTable.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/mockData.js
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderTable.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/mockData.js
  - artifacts/sii-monitor/contract.json
  - artifacts/sii-monitor/contract.mcp.json
  - cli/cache/ad-snapshot/1528ad402e4172a499e4774b58e0454d81f9585eaac77e3e7eec11ca438fc9a6.json
  - cli/cache/ad-snapshot/255a1d8008c10ff6ac0c2ebe27613983aff00eb379150de63202655776329010.json
  - cli/cache/ad-snapshot/33fce2a42dc4a60ef65b69acf4cca88d374e2769325d5a2d7b87c8f8e4bb830b.json
  - cli/cache/ad-snapshot/5320e296c3201279fa0f82f816654f9f0b7526b454419311b0405be05b4e377a.json
  - cli/cache/ad-snapshot/8f0fec656617c7258be4a117b300dba1f4791d820c2451c13cf14af614e377a7.json
  - cli/cache/ad-snapshot/a248d5b3f106809b799190d64666655fdce8f762d117224a86bdd1b03c42d051.json
  - cli/cache/ad-snapshot/dac2bbcc5a15f7bf74cf1a6760cb99133419ffb7c7baa4885ce8b625117b52a2.json
  - cli/cache/ad-snapshot/ed6297b4abbc26e5258faff30840b5d60f4f4930a1363f8327067f4a4efbe97e.json
  - docs/feedback.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/plans/2026-09-08-tbai-status-computed-column-migration.md
  - e2e/tests/flows/purchase-invoice-batuz-column.mocked.spec.js
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/tbaiStatusColumnFilterable.test.js
  - .claude/agents/qa.md
  - .claude/skills/stored-computed-column/SKILL.md
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/hooks/__tests__/useEntity.coverage.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/components/contract-ui/InlineSearchCombo.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineSearchCombo-loading.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineSearchCombo.vitest.jsx
  - docs/plans/2026-09-09-invite-acceptance-session-conflict.md
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/lib/flags/__tests__/clearAccountIdentity.vitest.js
  - tools/app-shell/src/lib/flags/bootstrap.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
---

## Resumen
Se blindó el flujo de invitaciones contra conflictos de sesión, se respaldó una columna sintética con una columna real de BD, y se mejoraron seletores de línea con feedback de carga.

## Decisiones
- Respaldar columnas sintéticas con columnas reales de BD (EM_ETGO_Tbai_Status) en lugar de inyectores; permite que filtrado y ordenamiento funcionen sin sorpresas en producción
- Crear skill reutilizable para columnas computed almacenadas: documenta las trampas conocidas (FROM dual faltante, sincronía que exige totality) con verificación que requiere cambiar datos en BD, no confiar en build verde
- Guard en aceptación de invitación: solo logout preventivo si otra persona está conectada; no bloquea reintentos del usuario propio en otro tenant
- Entrar al tenant correcto tras aceptar invitación, no permanecer en el anterior
- Pantalla de sin-acceso: dropdown de empresas para usuarios con rol pero sin ventanas asignadas; distinguir entre "sin rol" y "rol que no abre nada"
- Registrar el conflict y las lecciones en guías de reviewer, developer, QA y window-agent

## Descartado
- Cambio de padding en InlineLinesPanel (revertido en el mismo PR)

## Deuda dejada
- Verificación de columnas computed sigue siendo manual: resolver sin FROM dual reporta log.warn que pasa inadvertido
- Usuario invitado cae en pantalla bloqueante hasta que alguien asigne un rol; la salida existe pero no previene

## Pendiente
- ETP-5202 (segunda mitad del conflicto de sesión en invitaciones)
