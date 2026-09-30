---
task: ETP-5566
note: ETP-5566/5e715a6a
commit: 2aa0b661bbfd19c5383668240feba9273eb69cba
branch: feature/ETP-5566
date: 2026-09-30T23:22:38.000Z
author: sebastianbarrozo
agent: none
files:
  - docs/tasknotes.md
  - tools/tasknotes/bin/tasknotes.js
  - tools/tasknotes/src/commands.js
  - tools/tasknotes/src/sessions.js
---

## Resumen
Cambió la estrategia de backfill para generar notas retroactivas: ahora camina commits remotos del más nuevo al más viejo, agregando una nota por tarea hasta que sus commits toquen el 80% de los archivos rastreados (o se agoten 30 días), lo que permite ser más preciso sobre qué parte del código fue modificada.

## Decisiones
- **Cambiar búsqueda: de branches a cobertura de archivos** — Permite detener la recolección cuando se alcanza un umbral de cobertura real, en lugar de un límite de tiempo arbitrario. Esto es más exacto: sabe qué archivos se tocaron.
- **Integrar `taskCommits()` en `collectTasks()`** — Simplifica la lógica al eliminar una función intermediaria que hacía dos búsquedas separadas (commits únicos + menciones).
- **Cambiar búsqueda de sesiones: `sessionsForBranches()` → `sessionsForKey()`** — En lugar de pasar una lista de branches explícita, ahora busca sesiones que coincidan con la clave de tarea en el nombre del branch (usando regex). Más robusto ante variaciones en nombre.
- **Subir defaults: `--days` de 7 a 30** — Alinea mejor con el nuevo modelo que detiene por cobertura, no por días.

## Deuda dejada
- El coverage solo actúa como límite si no se especifica `--only`; si hay filtro explícito de tareas, se procesan todas sin parar por porcentaje.
- No hay validación si `tracked` (archivos) está vacío; la división por cero estaría blindada solo por los datos reales del repositorio.
