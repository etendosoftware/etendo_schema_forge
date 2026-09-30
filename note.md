---
task: ETP-5348
note: ETP-5348/126981e0
kind: backfill
date: 2026-09-17T14:04:52.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 19a00e5f9f
  - 309ec0ce8a
  - cc19a9b24a
  - 32f3d3d02e
files:
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/product.md
  - tools/app-shell/src/locales/__tests__/etp5348-file-rejection-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportStatementModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/useStatementImportReview.js
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Implementación de ETP-5348: soporte para mensajes localizados en rechazos de archivos importados. Se agregaron claves de localización para tres idiomas (EN, ES_AR, ES_ES) y atributos de testeo en componentes afectados.

## Decisiones
- Localización multiidioma para rechazos: claves centralizadas en archivos de locale para garantizar consistencia en mensajes de error
- Pinning del core en dos commits: fijación de versión específica de dependencia principal durante el desarrollo
- Tests unitarios para localización: validación de claves mediante vitest para evitar regresiones en mensajes localizados
- Integración en flujo de revisión de importación: modificación de `useStatementImportReview.js` para capturar y mostrar rechazos con mensajes localizados

## Deuda dejada
- Versiones pinned de core (package.json): requieren monitoreo para actualización cuando esté estable
- Documentación generada (docs/generated-*): archivos autogenerados que pueden ser efímeros

## Pendiente
- Validación de cobertura de casos de rechazo en todos los idiomas soportados
