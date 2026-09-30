---
task: ETP-5411
note: ETP-5411/c76c5337
kind: backfill
date: 2026-09-18T17:58:12.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 5002340099
files:
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se agregó internacionalización al mensaje de error `rejectNonOwnerEditingOwner` que estaba hardcodeado en inglés, alineándolo con el patrón de localización de errores similares.

## Decisiones
- Introducir clave de localización para el error en lugar de mantenerlo hardcodeado, para que se traduzca según la sesión locale del usuario
- Agregar traducciones en en_US.json y es_ES.json siguiendo la convención existente
- Incluir tests unitarios que verifiquen la correcta asociación del error con su clave de localización

## Descartado
No hay alternativas descartadas en la evidencia del commit.

## Deuda dejada
No se evidencia deuda técnica. El cambio es acotado y completo: normaliza el comportamiento de un error excepcional haciéndolo consistente con sus pares (`cannotDeactivateOwnAccount`, `cannotDeleteOwner`).

## Pendiente
No hay trabajo pendiente explícito en el commit.
