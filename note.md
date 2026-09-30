---
task: ETP-5397
note: ETP-5397/97372dc0
kind: backfill
date: 2026-09-18T13:27:18.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 14ae9a4d8a
  - bb8b629a9e
files:
  - artifacts/goods-receipt/contract-changelog.json
  - artifacts/goods-receipt/contract.json
  - artifacts/goods-receipt/contract.mcp.json
  - artifacts/goods-receipt/contract.prev.json
  - artifacts/goods-receipt/decisions.json
  - artifacts/goods-receipt/generated/web/goods-receipt/GoodsReceiptForm.jsx
  - artifacts/goods-receipt/generated/web/goods-receipt/GoodsReceiptPage.jsx
  - artifacts/goods-receipt/generated/web/goods-receipt/GoodsReceiptTable.jsx
  - docs/generated-custom-windows/goods-receipt.md
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se corrigió la terminología de contacto y el campo de dirección en el formulario de recibo de mercancías, con mejora en el manejo de errores de backend mediante nueva función y cobertura de tests.

## Decisiones
- Actualizar esquema de contrato (contract.json y artefactos relacionados) para reflejar los cambios de terminología
- Implementar función centralizada de manejo de errores de backend en lugar de lógica dispersa
- Agregar cobertura de tests exhaustivos (94 líneas) para validar los casos de error
- Internacionalizar textos de error en inglés y español
- Refactor de backendErrors.js para evitar duplicación de código detectada por Sonar

## Descartado
No hay alternativas documentadas en los commits.

## Deuda dejada
- El segundo commit parece un ajuste reactivo a Sonar CPD; la estructura actual de `backendErrors.js` podría beneficiarse de una refactorización más estratégica
- No hay evidencia de tests de integración específicos para validar el flujo completo con la terminología actualizada
