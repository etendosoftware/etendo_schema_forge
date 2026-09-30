---
task: ETP-4210
note: ETP-4210/3cfcd345
kind: backfill
date: 2026-09-24T14:58:08.000Z
authors:
  - Juan Funes
agents:
sessions:
commits:
  - bad296e638
  - 636673eafe
  - 8bd06bebe9
  - 9f19f96c52
  - caba65f0ea
  - 51c972c241
  - e0a5c29b5c
files:
  - tools/app-shell/src/lib/observability/providers/__tests__/mixpanel.vitest.js
  - tools/app-shell/src/lib/observability/providers/mixpanel.js
  - tools/app-shell/src/auth/useLogout.js
  - tools/app-shell/src/lib/observability.js
  - tools/app-shell/src/lib/observability/core.js
  - cli/src/health-score/.env.example
  - cli/src/health-score/mixpanel_health_score.py
  - cli/src/health-score/requirements.txt
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/layout/__tests__/AppLayout.vitest.jsx
  - tools/app-shell/src/lib/observability/__tests__/useSessionStartTracking.vitest.js
  - tools/app-shell/src/lib/observability/useSessionStartTracking.js
---

## Resumen
Se corrigen fugas de datos en Mixpanel (`account_id` en logout, PII post-GDPR) y se mejora el tracking de sesiones para que el Health Score capture todos los logins regulares, no solo onboarding.

## Decisiones
- Reset de identidad Mixpanel en logout — evitar que `account_id` obsoleto persista entre usuarios
- Trackear `session_started` en cada mount de AppLayout — capturar logins regulares que antes no se contabilizaban (dimensión Login estaba en ~0% para ~98% de cuentas)
- Remover script de health score de git — mantenerlo como herramienta temporal fuera del versionado hasta que se defina la automatización real

## Descartado
- Mantener enriquecimiento de usuarios en health score — código inoperante tras remover PII (email/name) en remediación GDPR anterior; verificado en dry-run: 0/116 cuentas enriquecidas

## Deuda dejada
- Script de health score: sin automatización definida, se ejecuta manualmente
- Supresiones Sonar S3735 necesarias para fire-and-forget intencionales (patrón ya usado en código no flagueado, Sonar solo detecta en líneas nuevas)

## Pendiente
- Diseñar e implementar automatización para health score script
