---
task: ETP-5189
note: ETP-5189/d2eb7378
kind: backfill
date: 2026-09-15T21:57:16.000Z
authors:
  - Gremiger
  - sebastianbarrozo
agents:
  - claude-code
sessions:
  - 09ab4aa8-764d-40ea-ae02-50b82fb49699
  - 130ad00f-6155-4f99-aecb-18ce0f791cc4
commits:
  - 959e0a637e
  - c553404a3c
  - acaa26fe7b
  - 294fda35c4
  - 8f1af4ff0c
files:
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - package-lock.json
  - package.json
  - tools/app-shell/package.json
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/__tests__/App.vitest.jsx
  - tools/app-shell/src/components/RoleChangedBanner.jsx
  - tools/app-shell/src/components/__tests__/RoleChangedBanner.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useRoleChangeNotice.vitest.jsx
  - tools/app-shell/src/hooks/useRoleChangeNotice.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/hooks/__tests__/useRoleMenu.vitest.jsx
  - tools/app-shell/src/hooks/useRoleMenu.js
---

## Resumen
Se agregó notificación al usuario cuando cambian sus roles/permisos, junto con auto-healing en la carga del menú. Se optimizó el fetch de acceso a menú mediante caché de 60s y parallelización de peticiones.

## Decisiones
- **Notificación visible de cambio de rol** — el usuario se entera inmediatamente cuando cambian sus permisos (componente `RoleChangedBanner`, hook `useRoleChangeNotice`).
- **Caché de 60s en menuAccess** — reduce llamadas repetidas al backend dentro de una sesión sin recargar la página.
- **Parallelización de fetches** — menuAccess se obtiene en paralelo en lugar de secuencial, mejorando latencia.
- **Desacoplamiento de fallos** — si el fetch de menu falla, no bloquea el acceso a windowAccess; permite degradación parcial en lugar de bloqueo total.
- **Fallback compatible** — se preserva compatibilidad con menús legacy mediante verificación defensiva en `useRoleMenu`.

## Deuda dejada
- El mecanismo de auto-healing no tiene límite explícito de reintentos — podría caer en loop de reintentos.
- TTL de caché (60s) está hardcodeado; no es configurable por entorno.
- No hay telemetría de cuántas notificaciones se disparan o cuántos auto-healing fallan en producción.
- El componente `RoleChangedBanner` asume que el cambio de rol es siempre un evento que debe notificarse visiblemente — podría haber roles donde sea ruido.

## Pendiente
- Integración con telemetría/observabilidad para monitorear frecuencia de cambios de rol detectados.
