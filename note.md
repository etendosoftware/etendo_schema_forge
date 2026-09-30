---
task: ETP-5237
note: ETP-5237/e972611b
kind: backfill
date: 2026-09-09T13:02:55.000Z
authors:
  - Santiago Alaniz
agents:
sessions:
commits:
  - b7415a1805
  - b5b06ffb59
  - 2691cd3fcc
files:
  - e2e/tests/flows/lines-grid-narrow-viewport.mocked.spec.js
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.test.js
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.vitest.js
  - tools/app-shell/src/lib/linesColumnWidth.js
---

## Resumen
Se corrigió el comportamiento de encogimiento de columnas en la grilla de líneas. Se agregaron tests para validar la fix en viewports estrechos y se documentó un gap conocido en la lógica de `minWidth`.

## Decisiones
- Modificar `linesColumnWidth.js` para impedir que columnas se encojan por debajo de su ancho base — soluciona el problema observado
- Agregar test suite específico para viewports estrechos — valida el comportamiento en el escenario problemático
- Documentar branch de `minWidth` como gap no bloqueante — permite avanzar sin resolver esa rama ahora

## Deuda dejada
- Gap conocido en la lógica de `minWidth` dejado sin resolver — quedó documentado como no bloqueante para la entrega actual
