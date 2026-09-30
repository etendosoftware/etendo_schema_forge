---
task: ETP-5359
note: ETP-5359/a3e64904
kind: backfill
date: 2026-09-19T00:23:02.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - 40c1f706ef
files:
  - tools/app-shell/src/components/GuardedNavLink.jsx
  - tools/app-shell/src/components/__tests__/GuardedNavLink.refForwarding.vitest.jsx
---

## Resumen
Se corrigió la falta de tooltips en items del sidebar colapsado. El componente `GuardedNavLink` no forwardi refs a su elemento DOM, impidiendo que librerías como Radix (Tooltip, Popover) anclaran contenido flotante.

## Decisiones
- Envolver `GuardedNavLink` con `forwardRef` — permite que Radix acceda al nodo DOM para posicionar el tooltip correctamente
- Pasar el ref a través del componente `NavLink` — mantiene la ref en el elemento anclado

## Descartado
No hay alternativas documentadas.

## Deuda dejada
Ninguna identificable en el commit.

## Pendiente
Ningún trabajo pendiente explícito.
