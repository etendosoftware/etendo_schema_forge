---
task: ETP-5396
note: ETP-5396/48ddc82d
kind: backfill
date: 2026-09-18T18:41:38.000Z
authors:
  - sebastianbarrozo
agents:
  - codex
sessions:
  - 01a0b081-1b8d-7830-8c21-530d6bde4125
  - 01a0b441-9856-78c2-a648-81cb2eda4e9e
  - 01a0b441-99be-7ab3-9c86-27911e1d7868
  - 01a0b466-f311-7112-94b5-d1ef56f6ea4e
  - 01a0b46b-ae75-7e32-8e9f-a2c6b81ef037
  - 01a0b46b-af40-75f1-a952-cc49d6926fc5
  - 01a0b575-6b2c-77f1-a69d-aca21fab156d
  - 01a0b575-6d17-7be2-bed9-8718289aa9f2
  - 01a0b5e6-ad58-76a2-a18e-050117a89d13
  - 01a0b6cf-d1ed-7db1-bd18-030cd06c4783
  - 01a0b6cf-d41a-7611-a1e3-bca5acbfbc57
commits:
  - 51c03b2344
  - 63cecb25a1
  - 8bee0c2f5d
  - afdf4bc7e6
  - 7d3ff7c448
  - 48475b2ad2
  - ae10272897
  - 9f58e556f2
  - ff3e13506c
  - f2fa499afd
  - de46c8cee5
  - ff981037c5
  - e5ff1950ad
  - e1385c8fd2
  - a65b67416e
  - 76c702d88b
  - 566d926692
  - e089995589
  - f06cc54fc4
  - 1fc7481c87
  - 181eb1e21d
  - b2b11d6170
files:
  - docs/index.md
  - docs/plans/etp-5396-demo-to-pro-prd.md
  - docs/plans/etp-5396-demo-to-pro-technical-design.md
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/lib/__tests__/environmentPresentation.test.js
  - tools/app-shell/src/lib/environmentPresentation.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/UpgradePage.jsx
  - tools/app-shell/src/pages/__tests__/UpgradePage.vitest.jsx
  - tools/app-shell/src/lib/__tests__/upgrade-api.test.js
  - tools/app-shell/src/lib/upgrade/api.js
  - docs/plans/etp-5396-functional-test-plan.md
  - docs/etp-5396-local-lifecycle-tool.md
  - tools/app-shell/src/components/layout/TopBar/TopBar.jsx
  - tools/app-shell/src/components/layout/TopBar/__tests__/TopBar.vitest.jsx
  - tools/app-shell/src/pages/DevLifecyclePage.jsx
  - tools/app-shell/src/runtime-routes.jsx
  - docs/stripe-local-testing.md
  - tools/app-shell/src/pages/__tests__/DevLifecyclePage.vitest.jsx
---

## Resumen
Se implementó el flujo completo demo-a-PRO con provisioning pagado, gestión de compras y ciclo de vida de entornos. Cambios en APIs de facturación, UI de upgrade, tests y documentación técnica.

## Decisiones
- Exposición del estado del entorno en SideMenu y TopBar, con indicadores de demo/productivo
- Enrutamiento de compras a través de API de facturación con polling de estado
- Recuperación de inputs de compra desde la cuenta para evitar re-ingreso
- Banner de prueba mejorado con contadores y estado de provisioning
- Herramienta de ciclo de vida local para testing del desarrollo

## Descartado
- Transferencia de datos (productos, contactos) en el checkout — movido a scope futuro
- Opciones de planes/paquetes — dejadas como skeleton con etiquetas para completar después

## Deuda dejada
- Feature flag `bp-portal-link` sin validación de targeting en ConfigCat; la regla de configuración no se verificó contra la cuenta correcta
- Configuración de Stripe en producción incompleta: faltan `ETGO_CHECKOUT_SECRET_KEY` y `ETGO_CHECKOUT_WEBHOOK_SECRET` en AWS Secrets Manager
- Tests de integración de transferencia de datos dejados a medias; requieren correcciones de API que chocaban con esquema

## Pendiente
- Completar ETP-5443: suscripción, Customer Portal, grace period y bloqueo
- Validar y corregir targeting de `bp-portal-link` en ConfigCat
- Provisionar secretos de Stripe en producción e integración del webhook
