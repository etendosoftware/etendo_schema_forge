---
task: ETP-5274
note: ETP-5274/160ea946
kind: backfill
date: 2026-09-17T00:23:00.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 0591b75918
  - a0e266377a
  - 5fd57c4c28
  - 6888d4139c
files:
  - artifacts/purchase-invoice/__tests__/contract-integrity.test.js
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderTable.jsx
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderForm.jsx
  - docs/generated-custom-windows/purchase-invoice.md
  - tools/app-shell/src/hooks/__tests__/useEntity-save-helpers.test.js
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - e2e/tests/flows/purchase-order-return-rectificativa.integration.spec.js
  - e2e/tests/flows/sales-order-return-rectificativa.integration.spec.js
  - cli/src/data-fixes/sql/20260916T120000Z__R37-deactivate-reversed-invoice-doctypes.sql
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - cli/test/data-fixes-report-regression.test.js
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Se corrigió el bloqueo de edición en facturas borrador guardadas (readOnlyLogic ahora se basa en estado Processed en lugar de persistencia), se mostró el número de documento interno, y se desactivaron los doctypes invertidos heredados en todos los tenants mediante data-fix R37.

## Decisiones
- readOnlyLogic basada en estado `Processed` — permite edición en Draft después de guardar header, manteniendo validación correcta
- Detección unificada de placeholders de secuencia — evita enviar valores stale que bloquean renumeración del backend
- Desactivación sobre eliminación en R37 — preserva referencias históricas de FK sin borrar datos
- Matching estructural por `isreturn + docbasetype` — agnóstico a nombres traducibles e IDs por tenant

## Descartado
- Guardia hardcodeada en R37 — reemplazada por lectura de estado vivo post-cambio, que no requiere lista de excepciones

## Deuda dejada
- Cambios de doctypes en drafts ya guardados con placeholders antiguos: podría haber artefactos en datos existentes no cubiertos por la detección
