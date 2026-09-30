---
task: ETP-5330
note: ETP-5330/4e81492c
kind: backfill
date: 2026-09-22T18:07:37.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 1a8c9b8563
  - 3ed31d6109
  - 09288c1327
files:
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementRowKebab.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/MovementRowKebab.lifecycle.vitest.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/__tests__/NotPostedDocumentsPage.vitest.jsx
---

## Resumen
Se mejoró la experiencia de error cuando el costo no se calcula, agregando un hint sobre configuración y traduciendo mensajes del backend en dos ventanas. Incluye atributos de testing y cobertura de pruebas unitarias e integración.

## Decisiones
- Traducir errores del backend en lugar de exponerlos crudos — mejora la experiencia del usuario
- Agregar hint de configuración al mensaje de error — guía al usuario sobre próximos pasos
- Agregar data-testid en tabla de datos — habilita testing automatizado confiable

## Deuda dejada
- La traducción se implementa en dos ventanas específicas (MovementRowKebab, NotPostedDocumentsPage) — podrían existir otros lugares con el mismo error sin traducción
- Los tests unitarios para la traducción están localizados en los componentes — no hay cobertura centralizada de la lógica de traducción de errores

## Pendiente
- Revisar si existen otros puntos donde se expongan errores crudos del backend
- Considerar una estrategia centralizada para traducción de errores del backend
