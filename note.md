---
task: ETP-5236
note: ETP-5236/2d430515
kind: backfill
date: 2026-09-10T14:44:49.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - b4e3700e87
  - ed03073d74
  - 0b0aca5d12
  - 3a715b4085
  - aba4f66a0d
files:
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-config/SiiSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - docs/generated-custom-windows/fiscal-config.md
  - docs/generated-custom-windows/fiscal-models.md
---

## Resumen
Se corrigieron tres bugs en la configuración fiscal (autofill no deseado, filtro inactivo en primer click) y se mejora la visualización con color-coding de resultados en Modelos 303/349, refactorizando el color mapping a un utility compartido para evitar duplicación.

## Decisiones
- `autoComplete=off` en authorization registration number para evitar que el navegador lo complete con email guardado
- `maxLength={15}` + `validate()` para forzar consistencia con la columna DB VARCHAR(15)
- Extraer `resolveResultColors()` a `fiscalModelsUtils.js` para compartir la lógica de color-coding entre FmModel303Page y FmListPage (aplica a filas 303 y 349)

## Descartado
- No se descartaron alternativas explícitamente documentadas

## Deuda dejada
- El fix en `parseApiError()` asume la forma `{"error": "<string>"}` específica de NEO; si existen otros formatos inesperados del API podrían no ser capturados correctamente
- El mapInitialFilter() en TbaiMonitorSection ahora mapea claves locales, pero el comentario de cambio no documenta los valores raw de AD que sigue reconociendo

## Pendiente
- (ninguno identificado)
