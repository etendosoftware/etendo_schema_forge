---
task: ETP-5356
note: ETP-5356/9ecdcd62
kind: backfill
date: 2026-09-18T12:52:40.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - fff58691f3
  - cc8e9332b9
  - 5800f24c3d
files:
  - templates/reports/helpers/report-html-helpers.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/test/report-journal-entries-doctype-i18n.test.js
---

## Resumen
Se corrigió la precedencia de la anulación de tipo de documento sobre las etiquetas de devolución en los helpers de reportes HTML. Se actualizaron dependencias a versión preview y se ajustaron los tests de internacionalización para alinearse con el nuevo comportamiento.

## Decisiones
- Modificar la lógica de precedencia en `report-html-helpers.js` — el tipo de documento anulado debe tomar prioridad
- Actualizar a versiones preview de las dependencias core — probablemente necesario para que el cambio funcione
- Regenerar tests de i18n — la nueva precedencia requiere casos de prueba diferentes

## Deuda dejada
- El bump a versión preview sugiere que estas dependencias aún no son estables; será necesario evaluar cuándo promover a versión estable
- La lógica de precedencia en el helper probablemente requiere documentación clara sobre el orden de resolución (tipo anulado → etiquetas → default)
