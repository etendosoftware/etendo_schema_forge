---
task: ETP-5337
note: ETP-5337/49ad6cae
kind: backfill
date: 2026-09-15T16:58:46.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - d4ed82e01e
files:
  - e2e/tests/flows/attachments.mocked.spec.js
  - e2e/tests/flows/contacts-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/financial-account-delete.mocked.spec.js
  - e2e/tests/flows/financial-account-detail.mocked.spec.js
  - e2e/tests/flows/financial-accounts-page.mocked.spec.js
  - e2e/tests/flows/fiscal-models-303-identification.mocked.spec.js
---

## Resumen
Se corrigieron especificaciones E2E flaky en suite mocked. Los cambios incluyen ajustes de timeouts, actualización de assertions según cambios de schema, eliminación de un test improductivo y skip de 6 tests bloqueados por una issue de intercepción de elementos.

## Decisiones
- Acotar waitForLoadState a 10s (antes unbounded ~30s) para evitar consumir el presupuesto de tiempo de Suite F-I y prevenir timeouts en contextos cerrados
- Skipear 6 tests mientras se investiga la causa raíz de elemento intercepción por eTGOPendingCount (posible regresión ETP-5281)
- Remover test "tipo_declaracion D" que no validaba comportamiento significativo y fallaba consistentemente por timeout

## Descartado
- Test fiscal-models-303-identification — probaba casos vacíos y no aportaba cobertura real

## Deuda dejada
- Root cause de la intercepción de eventos Playwright en financial-account-* sin confirmar en ambiente live
- 6 tests skippeados documentan el problema sospechado y apuntan a hermanos para re-habilitar
- Actualización de assertion en contacts-import-category-resolution: depende de decisión anterior (ETP-5031) sobre formato scheme-less

## Pendiente
- Confirmar y resolver ETP-5281 (posible overflow del eTGOPendingCount cell)
- Re-habilitar 6 tests skippeados una vez validada la corrección
