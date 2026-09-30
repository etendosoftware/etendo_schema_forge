---
task: ETP-5479
note: ETP-5479/1be9e394
kind: backfill
date: 2026-09-29T15:27:14.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - a9102cf550
  - 6e9f197b21
  - 2482e790f6
  - 2408e8c3b2
  - 17827a7146
  - b2e2e2ddc0
files:
  - tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
  - tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/EntityForm.jsx
  - tools/app-shell/src/components/contract-ui/LocationModalField.jsx
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/SelectorChip.jsx
  - tools/app-shell/src/components/contract-ui/SelectorInput.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreatableSearchSelect-etp4600.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/SelectorChip.test.js
  - tools/app-shell/src/components/financial-accounts/AccountRowActions.jsx
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/windows/custom/contacts/contacts.css
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - tools/app-shell/src/components/contract-ui/__tests__/CreatableSearchSelect-chip.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CurrencyRatePicker.fieldStyles.vitest.jsx
  - tools/app-shell/src/components/forms/__tests__/fields.vitest.jsx
  - tools/app-shell/src/components/forms/fields.jsx
  - tools/app-shell/src/windows/custom/financial-account/FundsTransferModal.jsx
---

## Resumen
Unificación de estilos de hover, disabled y focus en campos de formulario mediante tokens de diseño compartidos (--field-hover, --field-disabled-border). Alineó CurrencyRatePicker con CreatableSearchSelect y mejoras menores en visibilidad.

## Decisiones
- Usar tokens compartidos en selectores, textareas, location fields e inputs de contacto para consistencia visual
- Focus ring de 2px con geometría siempre pintada (paint property)
- Labels de selector adoptan text-primary como inputs de texto
- CurrencyRatePicker obtiene shell unificado (altura, bordes redondeados, espaciado)
- Acciones rápidas de filas permanecen visibles mientras menú kebab está abierto

## Descartado
- Estilos previos de hover en campos (--muted o cambios de borde) reemplazados por --field-hover
- Opacidad-70 en ChipSelect disabled reemplazada por fill/border compartido

## Deuta dejada
- Focus ring geometry "always painted" parece ser un ajuste de renderizado que requiere validación visual en diferentes estados
- CurrencyRatePicker no tenía focus style en algunos contextos previos; la unificación asume consistencia ahora

## Pendiente
- Validación del comportamiento del focus ring en dropdown abierto/cerrado
- Testing visual del spinner en CurrencyRatePicker en estados de carga real
