---
task: ETP-5177
note: ETP-5177/67b260e0
kind: backfill
date: 2026-09-14T11:45:55.000Z
authors:
  - Luciano Palacio
agents:
sessions:
commits:
  - ba77d1a9da
  - 6b88b3ed2e
  - 0b5e4a1679
files:
  - docs/generated-custom-windows/purchase-invoice.md
  - tools/app-shell/src/components/contract-ui/__tests__/CreatableSearchSelect-chip.vitest.jsx
  - tools/app-shell/src/locales/__tests__/etp5177-pis-iban-placeholder.test.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.test.js
---

## Resumen
Clarifica el placeholder del selector de IBAN destino en PIS para indicar que acepta entrada manual, no solo búsqueda. Descubre y corrige un defecto latente donde el modal de pago saltaba al pantalla al montarse mensajes de validación inline.

## Decisiones
- Agregar `cpPisIbanPlaceholder` específico en 3 idiomas — aislar cambio a un campo sin afectar ~110 selectores que comparten plantilla
- Usar `placeholderOverride` existente — reutilizar mecanismo disponible en CreatableSearchSelect
- Crear wrapper `ControlWithError` — evitar resize del modal al montar/desmontar validaciones inline
- Aplicar wrapper a 3 campos (IBAN + conversión) — los campos de conversión tenían el mismo defecto latente

## Descartado
- Modificar plantilla compartida de selectores — riesgo de efectos secundarios innecesarios

## Deuda dejada
- Modal con altura automática y ancho fijo (940px) centrado: patrón frágil ante cambios de contenido, solo mitigado con línea reservada
- Defectos latentes en campos de conversión solo se detectaron durante revisión QA de otro cambio
