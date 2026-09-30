---
task: ETP-5225
note: ETP-5225/07669cc5
kind: backfill
date: 2026-09-15T14:12:54.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 5ff243e060
  - 02bd3f14f3
files:
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/locales/__tests__/etp5225-sending-close-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se añadieron etiquetas para un diálogo de cierre en mitad del envío e internacionalización en tres idiomas. Se ancló una versión específica del core preview.

## Decisiones
- Agregar labels en useWindowImportDialog y actualizar localizaciones (EN_US, ES_AR, ES_ES) — implementar nuevas etiquetas del diálogo mid-send close
- Anclar versión de core preview — asegurar compatibilidad o resolver conflicto de dependencia

## Deuda dejada
- Actualización de localizaciones limitada a tres idiomas — posible inconsistencia si existen más locales configurados
- Pin de dependencia sin documentación explícita del motivo — podría ser temporal o relacionado a incompatibilidad no resuelta
