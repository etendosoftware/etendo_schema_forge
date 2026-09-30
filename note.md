---
task: ETP-5525
note: ETP-5525/1fe1372d
kind: backfill
date: 2026-09-29T11:24:08.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 6dbc400a3b
  - 63298f462d
  - 285a3aed58
files:
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - docs/generated-custom-windows/sales-order.md
  - docs/request-policy.md
  - tools/app-shell/src/auth/__tests__/useApiFetch.vitest.jsx
  - tools/app-shell/src/auth/useApiFetch.js
  - tools/app-shell/src/lib/__tests__/crossSpecCacheInvalidation.test.js
  - tools/app-shell/src/lib/crossSpecCacheInvalidation.js
  - tools/app-shell/src/windows/custom/sales-order/__tests__/GeneratedOrderCreateInvoice.manageDocsLauncher.vitest.jsx
---

## Resumen
Se implementó validación de descuentos totales en órdenes de venta: se oculta la acción "gestionar envío" cuando existe descuento total. Se agregó sistema de invalidación de caché para refrescar datos cuando documentos relacionados se modifican.

## Decisiones
- Implementar `crossSpecCacheInvalidation` para asegurar sincronización entre cambios en documentos hijo y datos de orden de venta, evitando inconsistencias
- Ocultar opción de manage shipment condicionalmente basado en presencia de descuento total
- Ampliar cobertura de tests para modal de gestión de documentos, incluyendo casos de descuento y fallback

## Deuda dejada
- Nueva dependencia de cache invalidation (66 líneas): evaluar si lógica es reutilizable en otros contextos o si puede simplificarse
- Fallback de descuento en modal: criterio de activación no documentado en commits, podría requerer revisión cuando se agreguen nuevos tipos de descuento
