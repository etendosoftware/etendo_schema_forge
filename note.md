---
task: ETP-5206
note: ETP-5206/f38af79d
kind: backfill
date: 2026-09-11T12:39:22.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - a0e42cee21
files:
  - tools/app-shell/src/windows/custom/user/InviteUserDialog.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/InviteUserDialog.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/user/index.jsx
---

## Resumen
Se implementó validación en frontend para prevenir que usuarios remuevan su propio rol Admin (duplicando rechazo del backend) y se reemplazaron errores crudos de backend/red por mensajes catalogados en cinco flujos de roles e invitaciones.

## Decisiones
- Ocultar la acción de auto-democión en el frontend — mejora UX al evitar fallos predecibles y proporciona retroalimentación clara al usuario
- Reemplazar errores crudos por mensajes catalogados — reduce exposición de detalles técnicos y asegura UX consistente en flujos de error

## Deuda dejada
- La cobertura de mensajes catalogados se limita a cinco flujos; otros flujos de gestión de usuarios pueden mantener errores sin catalogar
- No se evidencia si los mensajes catalogados cubren todos los códigos de error posibles del backend
