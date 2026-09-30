---
task: ETP-5103
note: ETP-5103/92b4b15f
kind: backfill
date: 2026-09-10T18:56:01.000Z
authors:
  - Luciano Palacio
agents:
sessions:
commits:
  - 22e986885b
  - 98b6537ad6
  - 32cb1eee2f
  - 1674f6e8e8
  - 762e8f6ed1
  - fd9d51e48b
  - 6584fa0688
  - 32d715c5a5
  - 548d4c5a85
  - 2bc1a1537c
  - 8113cc66d2
  - e275a0726f
  - 0c5601b816
  - 78e5ba6fe2
files:
  - tools/app-shell/src/components/contract-ui/AddressSection.jsx
  - tools/app-shell/src/components/ui/required-mark.jsx
  - tools/app-shell/src/windows/custom/shared/LocationEditorModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/LocationEditorModal.vitest.jsx
  - e2e/tests/flows/contacts-integration.spec.js
  - e2e/tests/helpers/purchase-helpers.js
  - tools/app-shell/src/components/ui/__tests__/required-mark.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AddressSection.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateContactModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityCreationModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/CreateContactModal.jsx
  - tools/app-shell/src/components/contract-ui/EntityCreationModal.jsx
  - tools/app-shell/src/lib/__tests__/defaultCountry.test.js
  - tools/app-shell/src/lib/defaultCountry.js
---

## Resumen
Se precargó España en modales de dirección (ubicados en contactos, almacenes, organizaciones) y se bloqueó el guardar hasta rellenar los campos obligatorios País y primera línea, eliminando entregas de direcciones vacías.

## Decisiones
- **Prefill de País con query**: El catálogo NEO pagina 120 registros por nombre base, por lo que España nunca aparece en la primera página. Se resuelve con una consulta adicional `q=Spain` y se valida contra la etiqueta retornada.
- **Ref para proteger prefill**: Una ref evita que el default sobrescriba un país elegido por el usuario mientras carga el catálogo.
- **Componente RequiredMark compartido**: Se extrajo de AddressSection para reutilizar en lugar de duplicar el asterisco de validación en tres lugares.
- **Extracción de lógica**: `isSaveBlocked()` a nivel módulo y `useDefaultCountryPrefill()` como hook para mantener LocationEditorModal dentro del presupuesto de complejidad cognitiva de SonarQube.

## Descartado
- **Cursor: not-allowed en botón**: Se revertió a constante. Un botón disabled no responde de todos modos y la opacidad ya señala el estado.

## Deuda dejada
- Los guards en `handleSave` se mantienen como defensa en profundidad, aunque el Save ya se bloquea en UI.
- La consulta de prefill solo ocurre al crear, no al editar (comportamiento esperado pero vale documentar).

## Pendiente
- 7 specs e2e de integración requirieron ajustes en locadores de Playwright para tolerar el asterisco. Todas pasan tras scoping correcto a overlay.
