---
task: ETP-5493
note: ETP-5493/d52cf737
kind: backfill
date: 2026-09-29T17:20:10.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - e7d30388b8
  - 08fc62bccf
  - c76c38790a
files:
  - docs/widget-endpoints.md
  - tools/app-shell/src/components/dashboard/FinancialSummaryCard.jsx
  - tools/app-shell/src/components/dashboard/__tests__/FinancialSummaryCard.period.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useDashboardData.kpisRange.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useDashboardData.vitest.jsx
  - tools/app-shell/src/hooks/useDashboardData.js
  - tools/app-shell/src/locales/__tests__/dashboard-genericLabels.test.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/DashboardPage.jsx
  - tools/app-shell/src/components/dashboard/FinancialTrendChart.jsx
  - tools/app-shell/src/components/dashboard/__tests__/FinancialTrendChart.period.vitest.jsx
  - tools/app-shell/src/components/dashboard/__tests__/FinancialTrendChart.vitest.jsx
  - tools/app-shell/src/components/dashboard/__tests__/dashboardTrendPct.consistency.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useDashboardData.trendsRange.vitest.jsx
  - tools/app-shell/src/lib/__tests__/dashboardRangeCopy.test.js
  - tools/app-shell/src/lib/__tests__/dashboardTrendPct.test.js
  - tools/app-shell/src/lib/dashboardRangeCopy.js
  - tools/app-shell/src/lib/dashboardTrendPct.js
  - tools/app-shell/src/pages/__tests__/DashboardPage.trendProps.vitest.jsx
---

## Resumen
Se implementó filtro de período para componentes financieros del dashboard (Summary y Trends) con capacidad de copiar datos, con soporte multiidioma y documentación actualizada.

## Decisiones
- Extraer lógica de rango en utilidades reutilizables (`dashboardRangeCopy.js`, `dashboardTrendPct.js`) para evitar duplicación entre componentes
- Cobertura extensa de tests antes de estabilización (>800 líneas de tests nuevos)
- Normalizar etiquetas del eje con claves estables tras iteración inicial

## Deuda dejada
- Primer despliegue del chart de trends requirió corrección en estabilidad de etiquetas del eje (el tercer commit fue exclusivamente para esto), indicando falta de validación en ese aspecto antes de merge
