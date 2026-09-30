---
task: ETP-5235
note: ETP-5235/71308475
kind: backfill
date: 2026-09-09T12:02:27.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - a632e7d216
files:
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.tz-bug.vitest.jsx
---

## Resumen
Se corrigió un test de regresión (ETP-4850) que fallaba porque su fixture de fecha estaba hardcodeada y ya no coincidía con la ventana de filtro por defecto. La fecha ahora se deriva dinámicamente de hoy para mantenerse siempre válida.

## Decisiones
- Derivar `importDate` de `todayCalendarISO()` en el cuerpo del test — la fecha hardcodeada ('2026-08-10') quedó fuera de la ventana "últimos 30 días" y el test fallaba en la pre-filter sanity assertion sin llegar a validar ETP-4850
- Construir los limites de filtro de un solo día con el constructor `Date` local — evita usar `parseCalendarDate`, que es el helper bajo validación y está siendo probado por el fixture
- Mantener el valor como string yyyy-MM-dd — es el formato que dispara el bug que se valida en el test

## Deuda dejada
- El test depende de ejecutarse con una zona horaria fijada específicamente; si se modifica la configuración de TZ del ambiente, necesitará revalidación
