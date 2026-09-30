---
task: ETP-5376
note: ETP-5376/97ca9c78
kind: backfill
date: 2026-09-29T13:11:28.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - fc490a0313
  - cbd24f38a8
  - 90c7f3a5bb
  - c317014ce8
  - 828c6343d6
files:
  - artifacts/report-journal-entries/template.hbs
  - tools/app-shell/test/report-journal-entries-doc-link.test.js
  - artifacts/report-general-ledger/report-contract.json
  - artifacts/report-journal-entries/report-contract.json
  - docs/generated-custom-windows/report-journal-entries.md
  - tools/app-shell/test/report-general-ledger-debit-credit-order.test.js
  - tools/app-shell/test/report-journal-entries-debit-credit-order.test.js
  - tools/app-shell/test/report-journal-entries-doc-window.test.js
  - tools/app-shell/test/report-journal-entries-doctype-i18n.test.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se mejoraron los reportes de diario y libro mayor: se fusionó el encabezado de entrada con la primera línea, se ordenaron las líneas con Debe antes de Haber, y se vincularon entradas de movimiento de bienes con consumo interno. Las dependencias se actualizaron a versión 0.3.64 preview.

## Decisiones
- Fusionar encabezado con primera línea en plantilla — mejora legibilidad del reporte
- Ordenar líneas Debe antes de Haber — claridad contable estándar
- Vincular movimientos de bienes y consumo interno — coherencia de datos relacionados
- Bump a 0.3.64 preview — acceso a funcionalidades nuevas de paquetes core

## Deuda dejada
- Tests de doc-link actualizado de forma mínima (6 líneas) en último commit — sugiere posible incompletud en cobertura inicial
