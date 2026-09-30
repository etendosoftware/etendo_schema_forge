---
task: ETP-5254
note: ETP-5254/96bec3ad
kind: backfill
date: 2026-09-15T04:17:38.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 64d2b77ecc
  - 2265a44931
  - 6fbf0dd186
  - 9b498419b7
  - 64e3149a50
  - 6d8610d052
  - 45d1487e9d
  - ad52cbcd3b
  - 70b13002e6
  - 0d2421761c
files:
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/product.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - docs/ui-customization.md
  - flags-registry.json
  - tools/app-shell/src/components/contract-ui/ProductDrawerShell.jsx
  - tools/app-shell/src/components/contract-ui/ProductSearchDrawer.jsx
  - tools/app-shell/src/components/contract-ui/RecordCreateModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.addRowProductLookup.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ProductDrawerShell.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ProductStockSearchDrawer.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RecordCreateModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/lookupCreateTargets.vitest.js
  - tools/app-shell/src/components/contract-ui/lookupCreateTargets.js
  - tools/app-shell/src/locales/__tests__/lookup-create-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/EmbeddedWindowFrame.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.calloutRace.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.fieldHelpers.vitest.jsx
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/lib/embeddedWindow.js
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountTreeView.vitest.jsx
  - tools/app-shell/src/test/lucideIconMock.js
  - tools/app-shell/src/components/contract-ui/EmbeddedWindowRoute.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.productCostGate.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.productCostSave.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/hooks/useSaveBlockSignal.js
  - tools/app-shell/src/lib/productCostRequirement.js
  - tools/app-shell/src/lib/saveBlockSignal.js
  - tools/app-shell/src/locales/__tests__/etp5245-product-cost-keys.vitest.js
  - tools/app-shell/src/windows/custom/product/ProductCostBanner.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductCostBanner.vitest.jsx
---

## Resumen
Permite crear productos desde líneas de documento mediante un formulario emergente que monta la ventana de Productos en el árbol React, sin abandonar el documento. Incluye dos fases: POST del encabezado y edición con autosave de campos individuales.

## Decisiones
- Montar ventana en tree, no iframe — la iframe costaba ~460 ms de arranque frío; el árbol reduce a 80-345 ms reutilizando providers y sesión.
- Aislar PageMetaProvider, EmbeddedWindowContext y recordId prop — evita que el diálogo reescriba el breadcrumb del documento o pierda flags al navegar tras guardar.
- Extraer funciones (resolveEmbeddedSidebarContent, DetailCancelButton) — mantienen DetailView bajo el límite de complejidad cognitiva (Sonar S6481).
- Remover bloqueo de guardado por costo faltante — el producto nuevo nace sin costo; la advertencia queda en la banner.
- Drift tests entre decisiones.json y ProductPage.jsx — previenen desincronización en copias de código.
- Centralizar lucide-react mock — evita fallos de carga de archivo de test cuando el grafo de imports crece.

## Descartado
- Iframe same-origin — penalizaba arranque; nesting de routers es legal si se reseta LocationContext a null.

## Deuda dejada
- Tab Accounting no cubierta (flagged en flags-registry.json).
- Specs de Playwright fuera de alcance.
- Fallback a formulario generado si módulo window falla — solo existe documentado.

## Pendiente
- Ninguno explícito.
