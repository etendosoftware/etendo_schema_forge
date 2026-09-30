---
task: ETP-5294
note: ETP-5294/48a75551
kind: backfill
date: 2026-09-16T16:06:14.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - c121b05e0d
  - 9ee491bec0
files:
  - docs/decisions-reference.md
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se implementó validación requerida para el campo Subject en SendDocumentModal, mostrando errores solo tras la interacción del usuario (on-touch gating). Se refactorizó para reducir complejidad cognitiva de Sonar S3776.

## Decisiones
- Gating de errores de campos requeridos al primer toque: evita flasheos visuales al abrir el modal
- Extracción de `resolveNoSubject` como función pura auxiliar: mantiene complejidad cognitiva bajo el límite máximo (15) al separar la lógica booleana del cuerpo del componente
- Subject marcado con `*` siguiendo convención EntityForm: consistencia de UX para campos requeridos

## Deuda dejada
- Documentación agregada en `docs/decisions-reference.md` sin visibilidad del contenido actual: puede haber contexto de decisión no cubierto por el cambio
- `resolveNoSubject` es función auxiliar nueva en componente; consolidación futura de helpers `resolve*` podría ser oportunidad de refactor
