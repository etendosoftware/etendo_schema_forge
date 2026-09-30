---
task: ETP-5490
note: ETP-5490/f3c94152
kind: backfill
date: 2026-09-28T14:41:37.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - dc3a37814c
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx
  - docs/generated-custom-windows/contacts.md
---

## Resumen
Se removieron los filtros de customer/vendor flags para mostrar todos los contactos sin restricciones. Cambios en la configuración, decisiones registradas y la página web generada.

## Decisiones
- Eliminar condicionales de flags — simplifica la lógica de negocio al mostrar todos los contactos independientemente de su tipo

## Descartado
- Mantener los flags como filtros — aparentemente no alineaban con los requerimientos de la feature

## Deuta dejada
- Las referencias a customer/vendor flags fueron removidas de `decisions.json`, pero no queda claro si se eliminó documentación sobre por qué existían originalmente
- El cambio afecta la página `BusinessPartnerPage.jsx`, que es generada; la regeneración fue verificada en los checks, pero no hay evidencia de testing manual de la UI

## Pendiente
- Verificar que el cambio no rompe filtros o búsquedas que dependían de estos flags en otras partes del sistema
- Revisar si hay lógica backend que aún espera estos campos
