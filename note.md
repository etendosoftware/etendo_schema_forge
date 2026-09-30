---
task: ETP-5183
note: ETP-5183/c00ff659
kind: backfill
date: 2026-09-09T11:46:50.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 21f4b7f6db
  - 7b6a153f42
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx
  - tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreatableSearchSelect-dependsOnContext.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/BillingPreferencesForm.jsx
---

## Resumen
Se implementó una dependencia condicional: el selector de Cuenta se deshabilita hasta elegir un Método de Pago. Además, se corrigió un bug en CreatableSearchSelect que impedía re-traer opciones cuando el contexto cambiaba después del mount.

## Decisiones
- Agregar `dependsOn` en contract.json y BillingPreferencesForm (no solo en decisions.json) para que la dependencia sea visible durante la construcción de campos.
- Implementar el filtering de Método de Pago server-side en el handler de businessPartner, sin calificar javaQualifier en decisions.json para customer/vendorCreditor.
- Corregir el effect en CreatableSearchSelect para observar cambios en selectorContext, permitiendo que formularios dinámicos (como BillingPreferencesForm) re-traigan datos correctamente.

## Descartado
- No hay evidencia de alternativas evaluadas y descartadas en los commits.

## Deuda dejada
- El segundo commit fue un fix correctivo por regeneración con node_modules desactualizado. No hay indicios de que se haya documentado cómo evitar este tipo de conflictos en futuras fusiones.
