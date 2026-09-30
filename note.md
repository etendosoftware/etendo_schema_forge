---
task: ETP-5349
note: ETP-5349/ae320ae3
kind: backfill
date: 2026-09-18T01:18:30.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 7eebcfaf16
files:
  - docs/generated-custom-windows/financial-account.md
  - docs/generated-custom-windows/product.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/locales/__tests__/etp5349-skipped-by-user-key.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/financial-account/ImportStatementModal.jsx
---

## Resumen
Se fijó una versión actualizada del core que corrige errores en la descarga de datos. Se agregó lógica para permitir que usuarios salteen la importación y se documentó la funcionalidad en las ventanas de diálogo.

## Decisiones
- Actualizar dependencias principales — el core contenía correcciones necesarias para el flujo de descarga de errores
- Agregar test específico para el caso "skipped-by-user-key" — validar que el usuario puede omitir pasos de importación
- Generar documentación de las ventanas personalizadas (financial-account, product) — probablemente como output de un proceso de compilación/regeneración

## Deuda dejada
- El commit incluye 46 líneas de test pero no se especifica qué escenarios de error previos no se cubren
- Las nuevas strings de localización ("etp5349-skipped-by-user-key") en tres idiomas sugieren flujos de usuario que requieren validación completa en cada idioma
- Los cambios en ImportStatementModal no especifican si hay casos edge cuando el usuario elige saltar
