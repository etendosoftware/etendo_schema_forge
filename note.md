---
task: ETP-5293
note: ETP-5293/fcc03653
kind: backfill
date: 2026-09-14T13:12:41.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - d6dc649507
  - ee4fa66686
files:
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx
---

## Resumen
Se implementó traducción de mensajes de error de validación en SendDocumentModal. Se agregaron traducciones para en_US, es_AR y es_ES, con tests para validar el mapeo correcto de errores a textos localizados.

## Decisiones
- Integrar el mapeo de errores directamente en SendDocumentModal.jsx usando el sistema de localización existente
- Agregar cobertura exhaustiva de tests (92 líneas) para validar el comportamiento i18n

## Deuda dejada
- Cobertura limitada a 3 idiomas inicialmente; otros idiomas requerirían agregar traducciones adicionales
- Desconocido si se cubre la totalidad de códigos de error de validación posibles o solo un subconjunto

## Pendiente
- Agregar traducciones para otros idiomas según roadmap de soportes lingüísticos
