---
task: ETP-5436
note: ETP-5436/a8c20701
kind: backfill
date: 2026-09-22T23:50:46.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 65d071cce3
  - 5b268b4eae
  - ac30c92783
  - faaf55f25d
files:
  - artifacts/goods-movements/contract.json
  - artifacts/goods-movements/contract.mcp.json
  - artifacts/goods-movements/decisions.json
  - artifacts/goods-movements/generated/web/goods-movements/MovementForm.jsx
  - artifacts/goods-movements/generated/web/goods-movements/MovementPage.jsx
  - artifacts/goods-movements/generated/web/goods-movements/MovementTable.jsx
  - artifacts/goods-movements/generated/web/goods-movements/mockData.js
  - docs/feedback.md
  - docs/generated-custom-windows/goods-movements.md
  - tools/app-shell/src/components/contract-ui/DocumentStatusPill.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentStatusPill.vitest.jsx
  - tools/app-shell/src/lib/__tests__/postedStatus.test.js
  - tools/app-shell/src/lib/postedStatus.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/goods-movements/__tests__/GoodsMovementsWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-movements/index.jsx
  - tools/app-shell/src/components/CommandPalette.jsx
  - tools/app-shell/src/components/__tests__/CommandPalette.vitest.jsx
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/menu.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se corrigió el flujo de post/unpost para movimientos de mercadería: la acción no estaba wired en el contrato (campo `posted` faltante, clave duplicada en decisiones), y el kebab de fila no ofrecía unpost. Se completó también la ocultación del menú de prueba de concepto en búsqueda para alinearse con el sidebar.

## Decisiones
- Declarar `posted` como field readOnly en lugar de acción implícita para que sea visible al contrato
- Reutilizar el knob `includeUnpost` existente de ETP-5378 (deshabilitado por defecto) para ofrecer unpost en fila, evitando duplicación de lógica
- Mapear el flag `proof-of-concept-menu` en CommandPalette y SideMenu para consistencia: si la UI lo oculta en un lugar, también en búsqueda

## Deuda dejada
- Pin temporal a preview package de schema_forge_core (PR #244): requiere actualización manual al version released cuando se mergee a develop

## Pendiente
- Actualizar dependencia de schema_forge_core al release oficial de PR #244
