---
task: ETP-5483
note: ETP-5483/5a7666ba
kind: backfill
date: 2026-09-28T14:13:32.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - ce381fc78d
  - b072b4a3ba
  - d3465d5eea
  - f6a4888e2a
  - 1d6a37174f
  - ff269dab12
files:
  - artifacts/aging-payable/report-contract.json
  - artifacts/report-general-ledger/report-contract.json
  - tools/app-shell/src/pages/ReportViewerPage.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - artifacts/chart-of-accounts/contract.json
  - artifacts/chart-of-accounts/contract.mcp.json
  - cli/cache/ad-snapshot/1528ad402e4172a499e4774b58e0454d81f9585eaac77e3e7eec11ca438fc9a6.json
  - cli/cache/ad-snapshot/4b9dcbaf3ba32fedaf88211848edfc48cf2b79afdc45c40e2eda29013b8cf3db.json
  - cli/cache/ad-snapshot/8f0fec656617c7258be4a117b300dba1f4791d820c2451c13cf14af614e377a7.json
  - cli/cache/ad-snapshot/917023ab920b7fd27a61f785a879fe7ec79a80db07b3af559d3dbbd8aec48187.json
  - cli/cache/ad-snapshot/a248d5b3f106809b799190d64666655fdce8f762d117224a86bdd1b03c42d051.json
  - cli/cache/ad-snapshot/bd2081e9eb5e4813c7c8734f21ab9a34e55b4851d8ea1aec628f519ac21ebf3f.json
  - cli/cache/ad-snapshot/d68e740d5005cee2334dc9682c1619cc10b18258b4a6825eb50d6445005b732b.json
  - cli/cache/ad-snapshot/e2ccbb82e2ce334319f25b27817ec61012a823f5ad5dea50e188a74a2eecb3a7.json
---

## Resumen
Se reorganizaron contratos de reporte separando aging-payable a endpoint dedicado, se normalizó el orden de líneas en General Ledger para hacerlo determinístico, se clarificaron los defaults de moneda según ambiente en ReportViewerPage, y se actualizaron dependencias core a 0.3.61 preview, regenerando artifacts como consecuencia.

## Decisiones
- Endpoint dedicado para aging-payable contract — separación de responsabilidades
- Orden determinístico en General Ledger — reproducibilidad en reportes
- Defaults de moneda explícitos por ambiente — claridad en UI de reportes
- Bump de core packages a 0.3.61 preview — incorporar cambios necesarios upstream

## Deuda dejada
- Versión bumpeada es preview, no release — requiere estabilización posterior
- Regeneración de artifacts (chart-of-accounts) sugiere proceso automatizado, pero no está claro si es completamente determinístico o requiere supervisión manual

## Pendiente
- Estabilizar dependencias core a versión release
- Validar impacto de cambios de orden en flujos downstream que dependan del orden anterior
