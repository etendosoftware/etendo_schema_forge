---
task: ETP-5264
note: ETP-5264/b785429d
kind: backfill
date: 2026-09-10T15:12:40.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - d4b8bb1c1e
  - c476f2c776
  - 3652368177
files:
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - docs/generated-custom-windows/user.md
---

## Resumen
Se implementó el mapeo del error de email duplicado (400 del backend) a un mensaje de toast claro y traducido, reemplazando el texto confuso anterior que hacía referencia a campos que el usuario nunca escribió.

## Decisiones
- Mapear el error específico del `UserRoleAssignmentHandler` (duplicado de email) en `BACKEND_ERROR_MAP` en lugar de mostrar el mensaje crudo de la BD — proporciona UX clara y consistente.
- Agregar traducciones exactas en en_US e es_ES — cumple con el requisito del ticket de usar la redacción especificada.
- Cubrir el mapeo con tests que validan ambos idiomas — espeja el patrón de casos similares existentes.
- Documentar en el manual de QA el paso para validar rechazo pre-check de email duplicado — asegura cobertura en validación manual.
