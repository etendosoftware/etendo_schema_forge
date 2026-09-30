---
task: ETP-5227
note: ETP-5227/8258a771
kind: backfill
date: 2026-09-15T14:46:24.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - b9d8436186
  - 0a1c2534cb
  - 7b12b6348e
files:
  - tools/app-shell/src/locales/__tests__/etp5227-category-lookup-key.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
  - tools/app-shell/src/windows/custom/product/__tests__/productImportDescriptor.vitest.js
  - tools/app-shell/src/windows/custom/product/productImportDescriptor.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/lib/importCategoryResolution.js
---

## Resumen
Se refactorizó la resolución de categorías en importadores de datos (contactos y productos), extrayendo la lógica compartida a un módulo común. El comportamiento cambió: ahora reporta un error cuando no encuentra una categoría válida, en lugar de inventar una.

## Decisiones
- Extraer helpers de resolución de categoría a `importCategoryResolution.js` — elimina duplicación entre `contactsImportDescriptor.js` y `productImportDescriptor.js`
- Reportar fallo en lugar de crear categoría ficticia — mejora integridad de datos y evita datos inválidos en el sistema
- Agregar mensajes localizados — claridad para el usuario en la UI (en_US, es_AR, es_ES)
- Fijar versión de core preview — asegurar compatibilidad con cambios en esta rama

## Deuda dejada
- El pin de dependencias en package.json puede indicar una versión específica requerida de core que podría quedar desactualizada
- Los tests cubren los nuevos comportamientos, pero no está claro si hay cobertura completa de casos edge en la resolución de categorías

## Pendiente
Ninguno aparente; los cambios incluyen tests nuevos (vitest) y todos los checks pasaron (npm, testid, tests, regen, xml, pw-mocked, pw-integration).
