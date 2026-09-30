---
task: ETP-5228
note: ETP-5228/9b301415
kind: backfill
date: 2026-09-14T23:47:35.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - ebcb765598
  - 57b21f0981
files:
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se mejoró el mensaje de error para precios inválidos indicando los formatos numéricos aceptados (commit 1) y se actualizaron las dependencias mediante pinning de la versión core preview (commit 2).

## Decisiones
- Agregar información de formatos válidos en el mensaje de error de precio para mejorar claridad al usuario, con actualizaciones sincronizadas en los tres idiomas soportados (EN, ES-AR, ES-ES)
- Pinear la versión de core preview para asegurar consistencia de build en la rama
