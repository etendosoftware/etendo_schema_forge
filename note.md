---
task: ETP-5345
note: ETP-5345/455d3c2d
kind: backfill
date: 2026-09-17T14:57:33.000Z
authors:
  - sebastianbarrozo
agents:
  - claude-code
  - codex
sessions:
  - 130ad00f-6155-4f99-aecb-18ce0f791cc4
  - 7dcaa81f-5c44-4f82-adec-3dad993dbb02
  - 01a0a62f-0ee8-7172-9cce-ec0d5be88885
  - 01a0a62f-0fdf-7631-888a-834151bc6d15
  - 01a0a9da-8062-7c92-b077-c8d5ce9eb1c8
  - 01a0aa5b-8f87-7220-825e-d35bb88a4f03
  - 01a0afa6-692e-78d3-9f31-e40dd95aadbe
commits:
  - ff7cc238a3
  - e51c35eb05
  - 6bac315d27
  - 71de8ef233
  - 05275f13cc
  - 279d607e35
  - 3bd934fd4a
  - 5dce2e221d
  - c57cade244
  - 4c4f175628
  - e49ee1cbab
  - 66f4afe085
  - 0497a7a05b
  - e2e58d10d1
  - 8ea9537076
  - 54e7da0b9e
  - f652675f12
  - f2815896d2
  - e69544a85e
  - 3f5da85f76
  - 47938d9a91
  - e25d40890e
  - d37aec9a54
  - ac32212385
  - a12fa457d2
  - b504e1974c
  - 88f299e580
  - 565491d88a
  - 37b63f14a2
  - cfb35e0e0b
  - 751a271cba
  - 7d7bba0f94
  - a891d21064
  - f12603ce00
  - 31d266c82a
  - 65d8ad72ec
  - 6e6a0782a8
  - bfa3881a52
  - b683f4711d
  - 7ab26c8437
files:
  - docs/plans/ETP-5345-public-api-gateway-design.md
  - docs/superpowers/plans/2026-09-15-etp-5345-public-api-gateway.md
  - Makefile
  - docs/repo-topology.md
  - package.json
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/decisions.json
  - artifacts/_public-api/allowlist.v1.json
  - .gitignore
  - gateway/.env.example
  - gateway/package.json
  - gateway/src/app.module.ts
  - gateway/src/main.ts
  - gateway/tsconfig.json
  - gateway/src/public-api/public-api.controller.ts
  - gateway/src/schema/schema.provider.ts
  - gateway/test/public-api.controller.test.ts
  - gateway/src/openapi/build-per-entity-paths.ts
  - gateway/test/openapi/build-per-entity-paths.test.ts
  - public-api/base.v1.json
  - scripts/generate-base-public-api-manifest.mjs
  - scripts/validate-base-public-api-manifest.mjs
  - gateway/Dockerfile
  - docs/ops/cloudfront-alb-routing.md
  - gateway/public/logo-etendo.png
  - gateway/test/public-api-manifest.test.ts
  - .agents/skills/testsprite-onboard/SKILL.md
  - .agents/skills/testsprite-verify/SKILL.md
  - .claude/skills/testsprite-onboard/SKILL.md
  - .claude/skills/testsprite-verify/SKILL.md
  - AGENTS.md
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - docs/superpowers/plans/2026-09-16-etp-5345-api-key-provisioning.md
  - tools/app-shell/src/components/OAuth2ClientDialog.jsx
  - tools/app-shell/src/lib/__tests__/apiKeysApi.test.js
  - tools/app-shell/src/lib/__tests__/apiKeysPage.test.js
  - tools/app-shell/src/lib/apiKeysApi.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/pages/ApiKeysPage.jsx
  - tools/app-shell/src/runtime-routes.jsx
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
  - .github/workflows/deploy-staging.yml
  - tools/app-shell/src/components/CommandPalette.jsx
  - tools/app-shell/src/components/__tests__/CommandPalette.test.js
  - tools/app-shell/src/components/__tests__/CommandPalette.vitest.jsx
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.vitest.jsx
  - tools/app-shell/src/lib/__tests__/apiDocsWorker.test.js
  - tools/app-shell/src/lib/flags/flag-keys.js
  - tools/app-shell/src/lib/flags/index.js
  - tools/app-shell/vite.config.js
  - package-lock.json
  - tools/app-shell/package-lock.json
---

## Resumen
Se implementó la puerta de enlace API pública (gateway NestJS en puerto 4300) con especificación JSON:API, documentación OpenAPI/Scalar en beta, provisión de claves API vía OAuth2 existente, y alineación de módulos CI-parity. Se identificaron tres deficiencias de fondo en NeoServlet que requieren correcciones de seguridad.

## Decisiones
- **Gateway local separado** — puerto 4300, nunca expone Core directo; reutiliza OAuth2 de Etendo Go como mecanismo de provisión.
- **JSON:API estricto** — relaciones separadas en bloques, no inline; `meta` para campos adicionales como `identifier`.
- **Campos `updated` obligatorios** — NeoServlet exige concurrencia optimista para PUT/PATCH; todo GET debe incluir este campo aunque no sea visible al usuario.
- **Normalización de errores delegada al gateway** — REST de NeoServlet devuelve leaks crudos de validación; el gateway será responsable de formatear errores estándar.

## Descartado
- Reemplazar Playwright con TestSprite — mantener Playwright en CI, usar TestSprite solo para smoke tests exploratorios contra ambientes reales.
- Formato REST simplificado — se mantiene JSON:API estricto pese a la complejidad inicial.

## Deuda dejada
- **ISREADONLY no se respeta en NeoServlet** — actualmente un PUT crudo puede escribir campos marcados readOnly; corrección de fondo pendiente.
- **Validación de conformidad JSON:API** — creada tarea ETP-5369 para verificar headers, envelopes, errores estándar y POST/PUT/PATCH.
- **Cierre de rondas Objective Guard bloqueado** — obligaciones administrativas heredadas de `behavior` y `compatibility` sin checks declarados.

## Pendiente
- Redeploy de imagen del gateway con fixes de logo/header (commits `cfb35e0e0`+).
- Implementación completa de API key provisioning en UI (plan escrito, backend aún en desarrollo).
- Cerrar ETP-5369 (validación contrato).
