---
task: ETP-5007
note: ETP-5007/0341ffdd
kind: backfill
date: 2026-09-09T13:35:24.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 4abb17ea2f
  - fcaaf67654
  - 589acf6959
files:
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/ListFilterBar.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - e2e/tests/flows/advanced-filter-presets.mocked.spec.js
---

## Resumen
Se corrigió cómo se persisten los borradores de filtros avanzados al guardar presets. El problema era que `saveCurrentAsPreset` guardaba el valor último aplicado en lugar del borrador actual, dejando cambios sin guardar o con datos obsoletos.

## Decisiones
- Pasar el draft del builder como parámetro principal, con fallback al valor aplicado solo cuando no hay draft — captura el estado actual sin requerer Apply previo
- Bloquear el guardado cuando hay una condición a medio escribir, con mensajes localizados en tres idiomas
- El endpoint de presets requiere su propio mock en tests porque el catch-all del login retorna un envelope que el hook interpreta como dos presets

## Deuda dejada
- El mock del endpoint presets es específico para esta feature: solo cubre el patrón "GET retorna envelope con array data y totalRows"
- Cobertura test limitada a flujos principales; casos edge del manejo de presets no están documentados
