---
task: ETP-5500
note: ETP-5500/4328403c
kind: backfill
date: 2026-09-24T20:34:44.000Z
branches:
  - feature/ETP-5500
authors:
  - sebastianbarrozo
agents:
  - claude-code
sessions:
  - f2a3acc8-13b1-432f-a59f-26aeff3c17e2
commits:
  - ad6ab60782
  - d0a93e4efe
  - ed47df032f
files:
  - tools/app-shell/src/hooks/useEnvironmentSwitch.js
  - tools/app-shell/src/pages/UpgradePage.jsx
  - e2e/tests/flows/onboarding-logout-resume.mocked.spec.js
  - e2e/tests/flows/tenant-upgrade-cookie.mocked.spec.js
  - docs/functionalidad/02-capacidades-y-flujos.md
  - tools/app-shell/src/runtime-routes.jsx
---

Es solo telemetría para debugging: agrega 13 líneas que miden en millisegundos cada fase del `personalize()` dentro del claim. El commit anterior (`9091652e4`) ya registra si el claim encontró el pool vacío o reclamó uno; este cambio desglosa los tiempos internos de `personalize()` si el claim ocurre.

Para tu corrida del servidor, ese código sin commitear no importa. El commit desplegado ya loguea el outcome; buscá en `catalina.out`:
```bash
grep 'ONBOARDING-PERF.*phase=pool_claim' catalina.out
```
- `outcome=empty`: pool vacío, creación completa (es lo que muestra tu stream).
- `outcome=claimed`: reclamó del pool (el stream sería distinto).

La decisión es tuya: no está completo para commitear (es solo media fase de debugging), así que yo lo dejaría en un stash para si después necesitás medir qué parte de `personalize()` es lenta.
