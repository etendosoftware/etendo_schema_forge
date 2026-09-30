---
task: ETP-5541
note: ETP-5541/3419ed6f
kind: backfill
date: 2026-09-29T17:10:39.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 8a44543245
  - a4d83f426a
  - e366fd453d
  - bac7a73934
files:
  - .claude/skills/document-printables/SKILL.md
  - docs/architecture/07-auth-and-security.md
  - docs/document-printables.md
  - tools/app-shell/src/components/copilot/ocr/listAttachments.js
  - tools/app-shell/src/lib/attachmentFreshness.js
  - tools/app-shell/src/windows/custom/shared/pdfUtils.js
  - tools/app-shell/src/windows/custom/shared/useMainAttachment.js
  - tools/app-shell/src/components/copilot/ocr/__tests__/listAttachments.test.js
  - tools/app-shell/src/lib/__tests__/attachmentFreshness.test.js
  - tools/app-shell/src/lib/__tests__/rendererBuildEpoch.vitest.js
  - tools/app-shell/src/windows/custom/shared/__tests__/pdfUtils.cleanup.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/pdfUtils.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useMainAttachment.vitest.jsx
---

## Resumen
Se implementó la invalidación automática del caché de PDFs cuando cambia el branding de la empresa. Los cambios afectan el sistema de validación de attachments, cálculo de freshness y utilidades de PDF, con cobertura de tests para la nueva funcionalidad.

## Decisiones
- Centralizar la lógica de invalidación en `attachmentFreshness.js` como punto de decisión único
- Considerar cambios de branding como factor que invalida PDFs en caché, junto con otras condiciones existentes
- Documentar explícitamente los "opt-out windows" en el JSDoc para claridad sobre cuándo opera la invalidación

## Deuda dejada
- La documentación del JSDoc requirió corrección en el último commit (opt-out windows), sugiriendo que la especificación inicial no era lo suficientemente clara
- Los cambios en `pdfUtils.js` incluyen lógica condicional para el manejo de branding que merece validación adicional en casos edge

## Pendiente
- Validar comportamiento en flujos de cambio de branding simultáneo con otras operaciones de caché
- Monitorear impacto en rendimiento del cálculo adicional de freshness
