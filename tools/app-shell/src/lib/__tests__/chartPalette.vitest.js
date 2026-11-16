// @covers tools/app-shell/src/lib/chartPalette.js
import { chartSeriesColor, CHART_SERIES_COUNT } from '../chartPalette.js';

describe('chartSeriesColor', () => {
  it('references the CSS variables of the series (0-based)', () => {
    expect(chartSeriesColor(0)).toEqual({ fill: 'var(--chart-series-1-fill)', line: 'var(--chart-series-1-line)' });
    expect(chartSeriesColor(7).line).toBe('var(--chart-series-8-line)');
  });
  it('wraps after the last series and tolerates bad input', () => {
    expect(CHART_SERIES_COUNT).toBe(8);
    expect(chartSeriesColor(8)).toEqual(chartSeriesColor(0));
    expect(chartSeriesColor(-1)).toEqual(chartSeriesColor(7));
    expect(chartSeriesColor(undefined)).toEqual(chartSeriesColor(0));
  });
});
