---
task: ETP-5395
note: ETP-5395/77cb9de2
kind: backfill
date: 2026-09-24T20:34:44.000Z
branches:
  - mergeblock/ETP-5395
  - feature/ETP-5395
authors:
  - Gremiger
  - sebastianbarrozo
agents:
  - claude-code
  - codex
sessions:
  - 3a2344a6-0cf4-422f-8054-a09267eae3c1
  - 4e783f7a-b8b3-40da-9614-c0c997d54f38
  - dedef937-5dc5-4fdf-8f4d-36a6986bcd1f
  - 01a0d38e-6d96-7250-bb68-5d2ba995ea7f
  - 01a0d3c0-1911-7722-abde-cb620ffb272d
  - 01a0d423-bd17-7600-a176-1072b57102e4
  - 01a0d4a4-fa23-7be3-8066-d56fb6b0e08e
  - 01a0d4a4-fb81-7e90-84b9-d28fc86a6e83
  - 01a0d4a4-fa23-7be3-8066-d56fb6b0e08e
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d4ba-10b7-7fd0-8ad1-1b5432526485
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d4bb-2dbe-7d03-bf3c-4dbdad7a2127
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d4bc-83cb-72e3-80fb-c365836fd1ca
  - 01a0d4a4-fa23-7be3-8066-d56fb6b0e08e
  - 01a0d4bf-fcc7-7bf1-85dd-dad121b201de
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d4ba-0f32-7462-890d-a1289ca1ca84
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-18e0-7a63-a55f-49fa19757d30
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d5a1-f1b1-7910-8f02-ea53ffc009db
  - 01a0d5ad-b68d-75d3-91ca-4e0be474ce98
  - 01a0d5be-1f9e-7b33-bc84-c26879a38470
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d5c5-fd11-7c23-823b-59a82c6218f5
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d5c9-40d6-7902-87a7-6a83db5c7459
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d5cc-4ea5-73f3-b3e6-aa57554d2509
  - 01a0d5d6-54af-7193-b293-10d6dead1c67
  - 01a0d5d8-c90b-71d3-9011-02398557d9cc
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d5de-51f9-79c0-a553-dbd02b0beb4e
  - 01a0d5de-aeaa-7f21-bbb6-04b511660177
  - 01a0d5ef-ab41-7d23-ac8f-6f28fb963d26
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d8d8-b264-7ab2-81ce-7f3c851852de
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
  - 01a0d8dc-02be-7811-a2cd-020c06bac3df
  - 01a0d901-44b2-7951-859c-794c22fa3744
  - 01a0d901-4629-7752-bdcd-1c902e90a0ee
  - 01a0d92c-279e-7453-a1cd-7f8adf2618fd
  - 01a0d594-1777-7060-a2f2-8fa61d5ad486
commits:
  - ff6a2e41e9
  - b9736e2f80
  - 0aca8068ce
  - ad6ab60782
  - d0a93e4efe
  - ed47df032f
files:
  - docs/generated-custom-windows/fiscal-config.md
  - tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx
  - docs/feedback.md
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/__tests__/App.vitest.jsx
  - tools/app-shell/src/hooks/useEnvironmentSwitch.js
  - tools/app-shell/src/pages/UpgradePage.jsx
  - e2e/tests/flows/onboarding-logout-resume.mocked.spec.js
  - e2e/tests/flows/tenant-upgrade-cookie.mocked.spec.js
  - docs/functionalidad/02-capacidades-y-flujos.md
  - tools/app-shell/src/runtime-routes.jsx
---

## Resumen
ETP-5395 resolvió dos problemas en la app-shell: complejidad cognitiva elevada en FiscalConfigPage (refactorización con wrapper) y race condition al cargar el menú de roles con timeout insuficiente (ajuste de 1s a 10s, más cacheo de fallos).

## Decisiones
- **Guard de acceso en wrapper:** reduce complejidad cognitiva de 16 a <15. El acceso se valida antes de renderizar el contenido, evitando fetches innecesarios cuando el usuario no tiene permisos.
- **Timeout de listmenu a 10s:** la respuesta de producción llega en 2.1s; el timeout anterior de 1s era demasiado agresivo y provocaba que la sidebar mostrara todos los items por incapacidad de cargar el árbol correcto.
- **Cachear fallos con TTL de fallo:** las requests que nunca responden quedan en flight indefinidamente. Ahora un timeout crea una entrada en caché que luego puede ser reemplazada por una respuesta tardía.

## Deuda dejada
- ETP-5463 (Upgrade Page Review Findings) aparece como commit separado sin evidencia de consolidación en la rama principal; posible trabajo pendiente de integración.
- Las sesiones muestran investigación extensa sobre onboarding/pool que no se refleja completamente en estos commits.

## Pendiente
- Validar que la caché de fallos en listmenu no retiene estados obsoletos en recarga.
- Revisar si los ajustes de timing aplican a todos los entornos o solo producción.
