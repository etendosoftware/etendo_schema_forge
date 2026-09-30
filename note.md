---
task: ETP-5392
note: ETP-5392/539152a2
kind: backfill
date: 2026-09-18T03:03:54.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - f586c219cb
  - eee8c6026e
files:
  - artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
  - artifacts/tax/contract.json
  - artifacts/tax/contract.mcp.json
  - artifacts/tax/decisions.json
  - artifacts/tax/generated/web/tax/TaxTable.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.calloutRace.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.columnChrome.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.inlineAddValidation.test.js
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.test.js
  - tools/app-shell/src/lib/linesColumnWidth.js
  - tools/app-shell/src/lib/postedStatus.js
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.defaultSort.vitest.jsx
  - tools/app-shell/src/windows/custom/product/ProductCustomTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceTopbar.vitest.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
---

## Resumen
Se resolvió una race condition en validación inline-add, se optimizó el layout de tablas con una columna que absorbe espacio sobrante, y se mejoraron las interacciones visuales del componente DataTable.

## Decisiones
- Reordenar validación inline-add para esperar que se registren callouts pendientes antes de validar campos requeridos, y diferir la confirmación por Enter un tick para que las callouts de la misma acción tengan tiempo de registrarse
- Ocultar iconos de quick-actions hasta hover/focus manteniendo el espacio reservado (sin transición)
- Renombrar "credit-available" a "A favor" y truncar con tooltip solo si excede ~6 dígitos
- Expandir el chip Posted-status para acomodar códigos de razón más largos sin afectar otras columnas booleanas
- Agregar bandera `grow` opcional a columnas para que una designada absorba el ancho sobrante en listas dispersas, evitando que todas se estiren bajo `table-layout: fixed`
- Limpiar timeouts de close-line en unmount para evitar memory leaks

## Descartado
- Aplicar cambios de layout uniformemente: se optó por un flag opt-in en columnas específicas (Tax, Product)

## Deuda dejada
- Validación inline-add depende de timing con `defer by tick`: comportamiento frágil si la ejecución del browser cambia
- Cambios de layout aplicados solo en Tax y Product: otras tablas podrían beneficiarse del `grow` flag
