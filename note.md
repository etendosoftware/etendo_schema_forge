---
task: ETP-5509
note: ETP-5509/fc3f3dd3
kind: backfill
date: 2026-09-30T15:15:50.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - 87ef481f1d
  - 59162751bb
  - e175b3d70f
  - 21f93c8a52
  - a1be391e7d
  - b6522c3df0
files:
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/payment-in.md
  - docs/generated-custom-windows/payment-out.md
  - docs/generated-custom-windows/product.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/warehouse.md
  - docs/list-filters.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.toolbarLayout.vitest.jsx
  - e2e/tests/flows/platform/list-toolbar-1280.mocked.spec.js
  - docs/decisions-reference.md
  - docs/e2e-testing-guide.md
  - docs/index.md
---

## Resumen
Se reorganizó el toolbar de listas en dos filas: la primera mantiene filtros rápidos y acciones principales, la segunda (cuando hay grupo de pestañas) contiene el toggle de vista y tabs de subconjuntos. Se añadió una línea separadora en la barra de lista.

## Decisiones
- Segunda fila renderizada solo cuando existe un tab group — mantiene compacta la interfaz en ventanas sin pestañas
- Separador visual en todas las ventanas con barra nativa (Pagos, Contactos, etc.) — claridad visual consistente
- Keying de tabs por item en lugar de index — estabilidad ante cambios en el orden de pestañas

## Descartado
- Expandir la línea separadora a todo el toolbar — se limitó a la barra de lista únicamente

## Deuda dejada
- Tests E2E limitados a dos resoluciones (1280x720, 1920x1080) — no cubre rango intermedio
- El cambio de keying en el último commit es mínimo y podría haberse incluido en el commit principal

## Pendiente
- Validación en resoluciones móviles o entre los puntos de quiebre ya cubiertos
