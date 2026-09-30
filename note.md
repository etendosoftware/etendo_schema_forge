---
task: ETP-5286
note: ETP-5286/bb928762
kind: backfill
date: 2026-09-15T19:22:38.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - ffa27144a9
  - 4df44d0c92
  - 45dae01b97
files:
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx
  - artifacts/goods-shipment/custom/ReturnWizard.jsx
---

## Resumen
Se preparó la feature branch ETP-5286 actualizando dependencias core a versión preview, removiendo etiquetas "draft" de modales de confirmación y corrigiendo regresiones de color semántico en los wizards de retorno de compra y envío.

## Decisiones
- **Bump de packages core** — usar versiones preview de las dependencias en la feature branch para validar cambios antes de merge a principal
- **Remover "draft" del wording** — limpiar etiquetas de confirmación modal que ya no reflejan el estado real de la funcionalidad (cambios en en_US, es_AR, es_ES)
- **Reparar colores semánticos** — corregir regresiones visuales en componentes PurchaseReturnWizard y ReturnWizard con ajustes de estilos

## Deuda dejada
- Cambios de color en los wizards sugieren regresiones introducidas por el bump de packages, pero no hay comentarios que documenten por qué ocurrieron o si requieren revisión adicional de diseño
