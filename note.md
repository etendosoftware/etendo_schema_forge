---
task: ETP-5223
note: ETP-5223/9b8b1d12
kind: backfill
date: 2026-09-15T13:54:03.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 65cb571469
  - 7ee3901154
  - b1604b5283
files:
  - docs/i18n-guide.md
  - tools/app-shell/src/locales/__tests__/etp5223-import-message-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - e2e/tests/flows/contacts-import-category-resolution.integration.spec.js
  - e2e/tests/flows/contacts-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/product-import-category-resolution.integration.spec.js
  - e2e/tests/flows/product-import-category-resolution.mocked.spec.js
---

## Resumen
Se agregaron claves de localización para mensajes de importación en tres idiomas (en_US, es_AR, es_ES) y se actualizaron los tests de importación de categorías para validar el mapeo localizado. Se fijó también una versión específica de una dependencia core.

## Decisiones
- Crear archivo de prueba específico para validar las claves de localización (etp5223-import-message-keys.vitest.js) — separar la validación de i18n de otros tests
- Documentar la adición de claves en i18n-guide.md — facilitar futuras contribuciones de localización
- Actualizar ambos test mocked e integration de importación — garantizar que el mapeo funciona en distintos contextos

## Deuda dejada
- El archivo de test lleva el identificador de tarea en su nombre (etp5223) — podría dificultar refactorización futura si se necesita renombrar

## Pendiente
- Potencialmente, agregar traducciones para idiomas adicionales más allá de los tres existentes
