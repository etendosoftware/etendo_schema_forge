import { localeFromUi, formatDashboardNumber, formatDashboardAmount, formatDashboardCompact, formatDashboardAxisTick, niceScale, toBezierPath, toBezierFillPath } from '../dashboardNumberFormat';

describe('dashboardNumberFormat', () => {
  describe('localeFromUi', () => {
    it('maps es_ES → es-ES', () => { expect(localeFromUi('es_ES')).toBe('es-ES'); });
    it('defaults to en-US', () => { expect(localeFromUi('en_US')).toBe('en-US'); });
  });

  describe('formatDashboardNumber', () => {
    it('formats integers', () => { expect(formatDashboardNumber(1234)).toBe('1,234'); });
    it('handles fraction options', () => {
      expect(formatDashboardNumber(1.5, 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('1.50');
    });
    it('returns string for NaN', () => { expect(formatDashboardNumber(NaN)).toBe('NaN'); });
    it('treats null as 0 (Number(null)=0 is finite)', () => { expect(formatDashboardNumber(null)).toBe('0'); });
    it('returns — for undefined', () => { expect(formatDashboardNumber(undefined)).toBe('—'); });
  });

  describe('formatDashboardAmount', () => {
    it('formats with currency code', () => {
      expect(formatDashboardAmount(1234.56, 'EUR')).toBe('EUR 1,234.56');
    });
    it('handles negative amounts', () => {
      expect(formatDashboardAmount(-500, 'USD')).toBe('-USD 500.00');
    });
    it('formats without currency', () => {
      expect(formatDashboardAmount(100)).toBe('100.00');
    });
    it('handles null as zero (Number(null)=0)', () => {
      // Number(null) === 0, which is finite, so it formats as currency
      expect(formatDashboardAmount(null, 'EUR')).toBe('EUR 0.00');
    });
    it('handles non-finite input', () => {
      expect(formatDashboardAmount(undefined, 'EUR')).toBe('—');
    });
  });

  describe('formatDashboardCompact', () => {
    it('formats billions', () => { expect(formatDashboardCompact(2_500_000_000)).toContain('B'); });
    it('formats millions', () => { expect(formatDashboardCompact(1_500_000)).toContain('M'); });
    it('formats thousands', () => { expect(formatDashboardCompact(5_000)).toContain('K'); });
    it('formats small numbers directly', () => { expect(formatDashboardCompact(42)).toBe('42'); });
    it('handles currency label', () => {
      const result = formatDashboardCompact(1_500_000, { currencyLabel: 'EUR' });
      expect(result).toContain('EUR');
      expect(result).toContain('M');
    });
  });

  describe('formatDashboardAxisTick', () => {
    it('delegates to formatDashboardCompact', () => {
      expect(formatDashboardAxisTick(1_000_000)).toContain('M');
    });
  });

  describe('niceScale', () => {
    it('returns nice ticks for typical data', () => {
      const { niceMax, ticks } = niceScale(85);
      expect(niceMax).toBeGreaterThanOrEqual(85);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks[0]).toBe(0);
    });

    it('handles zero max', () => {
      const { niceMax, ticks } = niceScale(0);
      expect(niceMax).toBe(100);
      expect(ticks).toEqual([0, 25, 50, 75, 100]);
    });

    it('handles large values', () => {
      const { niceMax } = niceScale(1_000_000);
      expect(niceMax).toBeGreaterThanOrEqual(1_000_000);
    });
  });

  describe('toBezierPath', () => {
    it('returns empty string for no points', () => { expect(toBezierPath([])).toBe(''); });
    it('returns M for single point', () => { expect(toBezierPath([{ x: 10, y: 20 }])).toBe('M 10,20'); });
    it('returns path with C segments for multiple points', () => {
      const path = toBezierPath([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
      expect(path).toContain('M 0,0');
      expect(path).toContain('C ');
    });
  });

  describe('toBezierFillPath', () => {
    it('returns empty for no points', () => { expect(toBezierFillPath([], 100)).toBe(''); });
    it('closes the path to baseY', () => {
      const path = toBezierFillPath([{ x: 0, y: 10 }, { x: 50, y: 30 }], 100);
      expect(path).toContain('L 50,100');
      expect(path).toContain('L 0,100');
      expect(path).toContain('Z');
    });
  });

  describe('formatDashboardCompact (extended)', () => {
    it('formats negative millions', () => {
      const result = formatDashboardCompact(-2_500_000);
      expect(result).toContain('M');
      expect(result).toContain('-');
    });

    it('formats negative thousands', () => {
      const result = formatDashboardCompact(-5_000);
      expect(result).toContain('K');
      expect(result).toContain('-');
    });

    it('formats millions with currencyLabel', () => {
      const result = formatDashboardCompact(3_500_000, { currencyLabel: 'EUR' });
      expect(result).toContain('EUR');
      expect(result).toContain('M');
    });

    it('formats thousands with currencyLabel', () => {
      const result = formatDashboardCompact(7_500, { currencyLabel: 'USD' });
      expect(result).toContain('USD');
      expect(result).toContain('K');
    });

    it('formats small numbers with currencyLabel', () => {
      const result = formatDashboardCompact(42, { currencyLabel: 'EUR' });
      expect(result).toContain('EUR');
      expect(result).toContain('42');
    });

    it('formats billions with currencyLabel', () => {
      const result = formatDashboardCompact(2_000_000_000, { currencyLabel: 'GBP' });
      expect(result).toContain('GBP');
      expect(result).toContain('B');
    });

    it('handles zero', () => {
      expect(formatDashboardCompact(0)).toBe('0');
    });

    it('handles negative small numbers', () => {
      const result = formatDashboardCompact(-42);
      expect(result).toContain('-42');
    });
  });

  describe('niceScale (extended)', () => {
    it('handles value of 1', () => {
      const { niceMax, ticks } = niceScale(1);
      expect(niceMax).toBeGreaterThanOrEqual(1);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
    });

    it('handles value of 10', () => {
      const { niceMax, ticks } = niceScale(10);
      expect(niceMax).toBeGreaterThanOrEqual(10);
      expect(ticks[0]).toBe(0);
    });

    it('handles value of 50', () => {
      const { niceMax, ticks } = niceScale(50);
      expect(niceMax).toBeGreaterThanOrEqual(50);
    });

    it('handles value of 500', () => {
      const { niceMax, ticks } = niceScale(500);
      expect(niceMax).toBeGreaterThanOrEqual(500);
    });

    it('handles value of 10000', () => {
      const { niceMax, ticks } = niceScale(10000);
      expect(niceMax).toBeGreaterThanOrEqual(10000);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
    });

    it('handles value of 7', () => {
      const { niceMax } = niceScale(7);
      expect(niceMax).toBeGreaterThanOrEqual(7);
    });

    it('handles value of 250', () => {
      const { niceMax } = niceScale(250);
      expect(niceMax).toBeGreaterThanOrEqual(250);
    });
  });

  describe('toBezierPath (extended)', () => {
    it('handles 3 points with cubic segments', () => {
      const path = toBezierPath([{ x: 0, y: 0 }, { x: 50, y: 25 }, { x: 100, y: 50 }]);
      expect(path).toContain('M 0,0');
      // Should have two C segments
      const cCount = (path.match(/C /g) || []).length;
      expect(cCount).toBe(2);
    });

    it('handles 4 points', () => {
      const path = toBezierPath([
        { x: 0, y: 0 }, { x: 30, y: 10 }, { x: 60, y: 40 }, { x: 100, y: 50 }
      ]);
      const cCount = (path.match(/C /g) || []).length;
      expect(cCount).toBe(3);
    });
  });

  describe('toBezierFillPath (extended)', () => {
    it('handles 3 points with closed path', () => {
      const path = toBezierFillPath([
        { x: 0, y: 0 }, { x: 50, y: 25 }, { x: 100, y: 50 }
      ], 200);
      expect(path).toContain('M 0,0');
      expect(path).toContain('L 100,200');
      expect(path).toContain('L 0,200');
      expect(path).toContain('Z');
    });

    it('handles single point fill path', () => {
      const path = toBezierFillPath([{ x: 10, y: 20 }], 100);
      expect(path).toContain('M 10,20');
      expect(path).toContain('L 10,100');
      expect(path).toContain('Z');
    });
  });

  describe('localeFromUi (extended)', () => {
    it('returns en-US for fr_FR (non-Spanish)', () => {
      expect(localeFromUi('fr_FR')).toBe('en-US');
    });

    it('returns en-US for undefined', () => {
      expect(localeFromUi(undefined)).toBe('en-US');
    });

    it('returns en-US for null', () => {
      expect(localeFromUi(null)).toBe('en-US');
    });
  });

  describe('formatDashboardAmount (extended)', () => {
    it('formats without currency and positive', () => {
      expect(formatDashboardAmount(1234.5)).toBe('1,234.50');
    });

    it('formats without currency and negative', () => {
      expect(formatDashboardAmount(-1234.5)).toBe('-1,234.50');
    });

    it('handles currency label with extra spaces', () => {
      const result = formatDashboardAmount(100, ' eur ');
      expect(result).toContain('EUR');
    });
  });
});
