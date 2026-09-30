---
task: ETP-5234
note: ETP-5234/f8910f73
kind: backfill
date: 2026-09-09T16:40:39.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 3a4599cdde
  - 744b53bebb
  - d13eaa662e
  - bdc831f19f
  - 7b6189c338
files:
  - tools/ai-bff/src/server.js
  - tools/app-shell/src/components/copilot/windowRoutes.js
  - docs/copilot-markdown-rendering.md
  - docs/feedback.md
  - docs/index.md
  - tools/app-shell/src/components/copilot/MarkdownContent.jsx
  - tools/app-shell/src/components/copilot/__tests__/MarkdownContent.vitest.jsx
  - tools/app-shell/src/components/copilot/__tests__/windowRoutes.vitest.js
  - tools/app-shell/src/components/copilot/useAiCopilotChat.js
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.tz-bug.vitest.jsx
---

## Resumen
Extensión del presupuesto de pasos del agente BFF de 8 a 20 y mejoras en renderizado de chat: soporte para tablas GFM e links internos en MarkdownContent, corrección de validación de paths internos y pruebas de zona horaria.

## Decisiones
- Aumentar budget a 20 steps — tareas de crear contacto con dirección requieren ~6 steps solo para exploración, dejando margen insuficiente para 3 creaciones subsecuentes
- Renderizar tablas GFM e links internos vía react-router — mejora UX del copilot sobre markdown literal
- Normalizar paths antes de validarlos — cierre de agujero que rechazaba doble slash pero aceptaba `/\host` y caracteres control (TAB/LF/CR)

## Descartado
- Esperar solución del provider — el HTTP 400 es del servidor del modelo; mayor budget solo pospone la falla

## Deuda dejada
- Hang original no resuelto: falla movida de step 6 a ~8. Causa probable: contexto excesivo, pero no verificada
- BFF nunca capped tool output: neo_discover (~77 KB) y neo_schema dumps se acumulan íntegros en la conversación
- Validación de paths internos: agujero preexistente afectaba también navigate_to y open_form; corregida parcialmente

## Pendiente
- Implementar capping de tool output en BFF para limitar contexto acumulativo
- Investigar root cause del HTTP 400 del provider
