---
task: ETP-5366
note: ETP-5366/0f0cd2b1
kind: backfill
date: 2026-09-21T16:01:19.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - c802056466
  - d1382a26ba
  - 0889e150a8
  - d03efbf65c
  - 56b1d16228
files:
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.slotRefreshHandlers.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.cache.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/windows/custom/shared/LocationEditorModal.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.vitest.js
  - docs/generated-custom-windows/contacts.md
---

## Resumen
Arregla el problema donde cambios en entidades hijo (direcciones) guardadas desde modales no se reflejaban en la lista padre hasta recargar la página. Invalida los caches de consulta tanto de la colección hijo como de la entidad padre cuando se guarda desde una modal personalizada, garantizando que la siguiente consulta llegue a la red.

## Decisiones
- Exportar `invalidateChildrenCache` de `useEntity` para llamarlo en `onSaved` antes de `handleSelect` — cierra la brecha donde las mutaciones que bypasean `handleAddChild` (modales con fetch propio) no invalidaban el cache
- Extraer handler a `buildCustomAddModalOnSaved` — mantiene `DetailView.jsx` dentro del límite de líneas y reutiliza la lógica en todas las modales personalizadas, no solo Contactos
- Invalidar también el cache de la entidad padre — campos rollup (como dirección en el grid de Contactos) y totales computados se quedaban stale al navegar de vuelta desde el detalle
- Mover estilos inline del botón save a clases CSS — los estilos inline sobrescriben reglas de Tailwind, bloqueando el hover amarillo de otras acciones primarias

## Cobertura
Incluye tests de regresión para invalidación de cache padre, cobertura de `buildCustomAddModalOnSaved`, y documentación en contactos.md explicando el problema y el fix.
