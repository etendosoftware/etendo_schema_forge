---
task: ETP-5199
note: ETP-5199/ebecba9b
kind: backfill
date: 2026-09-12T02:50:10.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 45603932d1
  - c7a0dce127
files:
  - docs/generated-custom-windows/user.md
  - docs/generated-custom-windows/warehouse.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveActions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.unsavedChangesSaver.test.js
  - tools/app-shell/src/components/contract-ui/saveActions.jsx
  - tools/app-shell/src/lib/__tests__/unsavedChanges.navigation.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se corrigió el flujo "Guardar y salir" del modal de cambios sin guardar para ejecutar los hooks post-guardado (`onAfterExistingSave`, `onAfterCreate`), que no se invocaban previamente. Esto asegura que se persistan el rol asignado en Usuarios y el almacén por defecto en Almacenes.

## Decisiones
- Extraer `runAfterSaveHook` y crear `buildUnsavedChangesSaver` — permite reutilizar la lógica de hooks post-guardado en ambos flujos (guardar tradicional y guardar + salir)
- Manejar excepciones del hook con toast pero continuando la navegación — el registro ya se guardó exitosamente, el error en post-procesamiento no debe bloquear
- Colapsar dos `return saved` en `buildUnsavedChangesSaver` — satisfacer el análisis Sonar sin alterar el comportamiento funcional

## Deuda dejada
- Se registraron nuevos string de localización (toast de error) sin indicar si requieren traducción completa de otras lenguas
