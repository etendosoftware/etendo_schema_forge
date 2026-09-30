---
task: ETP-5474
note: ETP-5474/0e5a4914
kind: backfill
date: 2026-09-28T12:40:15.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 961ed05bb4
files:
  - docs/generated-custom-windows/financial-account.md
---

## Resumen
Se documentó el comportamiento de eliminación de cuentas en el endpoint `neo_delete` del módulo MCP: respuestas 204 con `{"deleted": true, "id"}` en éxito y 404 para cuentas desconocidas (antes devolvía 400).

## Decisiones
- Cambiar código de error 400 → 404 para cuentas no encontradas — alineación con semántica HTTP estándar (404 indica recurso inexistente)

## Deuda dejada
- REST y SPA no fueron actualizados tras el cambio de comportamiento del backend; requieren verificación de compatibilidad o actualización
