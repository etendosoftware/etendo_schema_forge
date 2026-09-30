---
task: ETP-5543
note: ETP-5543/b457ae89
kind: backfill
date: 2026-09-29T16:14:16.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 4a1aeea300
  - 0bba23ebc8
files:
  - tools/ai-bff/README.md
  - tools/ai-bff/src/historyCache.js
  - tools/ai-bff/src/server.js
  - tools/ai-bff/src/systemPrompt.js
  - tools/ai-bff/src/usage.js
  - tools/ai-bff/test/historyCache.test.js
  - tools/ai-bff/test/server.test.js
  - tools/ai-bff/test/systemPrompt.test.js
  - tools/ai-bff/test/usage.test.js
  - tools/app-shell/src/components/CopilotContext.jsx
  - tools/app-shell/src/components/__tests__/CopilotContext.vitest.jsx
  - tools/app-shell/src/components/copilot/__tests__/agentChatApi.vitest.jsx
  - tools/app-shell/src/components/copilot/__tests__/agentHistory.vitest.js
  - tools/app-shell/src/components/copilot/__tests__/copilotApi.vitest.jsx
  - tools/app-shell/src/components/copilot/__tests__/useAgentConversations.vitest.jsx
  - tools/app-shell/src/components/copilot/__tests__/useAiCopilotChatHistory.vitest.jsx
  - tools/app-shell/src/components/copilot/agentChatApi.js
  - tools/app-shell/src/components/copilot/agentHistory.js
  - tools/app-shell/src/components/copilot/copilotApi.js
  - tools/app-shell/src/components/copilot/useAgentConversations.js
  - tools/app-shell/src/components/copilot/useAiCopilotChat.js
  - tools/app-shell/src/locales/__tests__/agent-chat-naming.test.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se implementó persistencia del historial de chat del agente con caché en el BFF y APIs de cliente para gestionar conversaciones de copiloto, reemplazando la lógica anterior sin estado.

## Decisiones
- Arquitectura en capas: módulo independiente de caché (`historyCache.js`), prompt del sistema separado (`systemPrompt.js`), y API dedicada (`agentChatApi.js`)
- Uso de hooks personalizados (`useAgentConversations`, `useAiCopilotChat`) para gestionar estado de conversaciones en React
- Cobertura de tests exhaustiva con vitest para cada módulo nuevo
- Extracción de lógica condicional anidada en segundo commit para mejorar legibilidad

## Descartado
No hay evidencia de alternativas consideradas y descartadas.

## Deuda dejada
No se identifican TODOs explícitos. Se agregó 1808 líneas de código nuevo en un solo commit, lo que puede dificultar análisis de cambios por historia. El contexto del cache y estrategia de invalidación podrían requerir documentación adicional más allá del README añadido.

## Pendiente
No hay indicios de trabajo incompleto; el commit pasó todos los checks (npm, testid, tests, regen, xml, pw-mocked, pw-integration).
