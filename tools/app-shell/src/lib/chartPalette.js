/**
 * Stock-chart series palette (ETP-5889). Colours live in index.css as
 * --chart-series-N-fill / --chart-series-N-line (theme-aware); this module only
 * references them so no colour literal is needed in components.
 */
export const CHART_SERIES_COUNT = 8;
export const CHART_AREA_OPACITY_VAR = 'var(--chart-area-opacity)';

/** Returns {fill, line} CSS colour references for series `index` (0-based, wraps after 8). */
export function chartSeriesColor(index) {
  const n = (((Number(index) || 0) % CHART_SERIES_COUNT) + CHART_SERIES_COUNT) % CHART_SERIES_COUNT + 1;
  return { fill: `var(--chart-series-${n}-fill)`, line: `var(--chart-series-${n}-line)` };
}
