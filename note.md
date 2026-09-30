---
task: ETP-5434
note: ETP-5434/27923bd4
kind: backfill
date: 2026-09-23T10:54:14.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - c2d9405e47
  - caaa86808f
  - 897df04aa8
  - 5904b76b54
files:
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - docs/request-policy.md
  - tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.vitest.jsx
---

## Resumen
Se actualizaron las dependencias core del proyecto a versiones preview de ETP-5434 y se refactorizó el modal de entrada de pagos para que los campos no esperen el estado de `paymentPlan`, eliminando una dependencia innecesaria.

## Decisiones
- **Usar versiones preview de paquetes core** — requerido para implementar la funcionalidad de ETP-5434
- **Eliminar espera en paymentPlan del modal** — simplifica la lógica de inicialización de campos sin bloqueos
- **Re-aplicar pin de preview tras merge con develop** — mantiene las versiones correctas después de integración

## Descartado
- Mantener espera en paymentPlan — innecesaria según el flujo rediseñado

## Deuda dejada
- Las dependencias core están en preview, no en versión estable: requieren revisión cuando se publique la versión final de ETP-5434
- Modal de pago tiene cobertura de tests expandida (vitest) pero la lógica removida de paymentPlan podría afectar otros flujos no evidentes en los cambios

## Pendiente
- Estabilizar versiones de paquetes core cuando ETP-5434 salga de preview
- Validar que otros componentes que dependían de paymentPlan en el modal continúen funcionando correctamente
