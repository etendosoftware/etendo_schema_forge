---
task: ETP-5486
note: ETP-5486/6d468650
kind: backfill
date: 2026-09-24T13:15:02.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - b5f85ac1e1
files:
  - tools/ai-bff/README.md
  - tools/ai-bff/src/server.js
  - tools/ai-bff/test/server.test.js
  - tools/app-shell/src/components/CopilotContext.jsx
  - tools/app-shell/src/components/copilot/useAiCopilotChat.js
---

## Resumen
Adaptó el BFF de IA para aceptar la cookie de sesión bajo el esquema cookie (ETP-4576), complementando el cambio en MCP. Hasta ahora rechazaba todo por esperar `Authorization: Bearer`; ahora acepta ambos esquemas manteniendo compatibilidad hacia atrás.

## Decisiones
- `sessionCredentials()` dual: acepta Bearer y cookie, null solo si falta ambos. Preserva comportamiento anterior para Bearer.
- Forwarding selectivo de cookies: solo la de sesión, nunca el jar completo. Previene exponer cookies no relacionadas al endpoint configurado.
- Forwarding de Origin y Referer: verbatim, requerido por `isOriginAllowed()` del backend. Es un proxy, no autoridad sobre credenciales.
- Validación CSRF en backend: no rechaza aquí, delega falla cerrada al destino.
- `buildWriteHeaders()` para POST: envía CSRF proof junto a credencial, resuelto por request (no capturado en boot).
- Eliminó `token` prop de useAiCopilotChat: ya no utilizada.

## Deuda dejada
- Requiere ETGO_ALLOWED_ORIGINS configurado en producción (localhost:3100 allowlisted para dev local).
