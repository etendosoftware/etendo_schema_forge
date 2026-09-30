---
task: ETP-5373
note: ETP-5373/80c017ed
kind: backfill
date: 2026-09-17T17:08:10.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - a949fdc4bd
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx
  - docs/generated-custom-windows/contacts.md
  - tools/app-shell/src/windows/custom/__tests__/importTemplateRoundTrip.vitest.js
  - tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
---

## Resumen
Se incorporaron ejemplos de templates de contactos al contrato del backend, con tests de validación y documentación generada. El cambio asegura que los ejemplos sean compatibles con lo que acepta el sistema.

## Decisiones
- Actualizar el contrato (`contract.json`) con ejemplos en lugar de mantenerlos solo en documentación — permite validación automática y sincronización con cambios del backend
- Expandir tests de `importTemplateRoundTrip` significativamente — garantiza que los ejemplos funcionan en ciclos completos de importación
- Generar documentación de referencia — facilita el descubrimiento de ejemplos válidos sin depender de conocimiento oral

## Deuda dejada
- Los tests no documentan qué hace exactamente con los ejemplos nuevos (la expansión de 174 líneas sugiere casos múltiples, pero sin detalles de cobertura)
- No hay evidencia de pruebas en entorno real con datos de producción más complejos
