import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  STATUSES,
  STATUS_COLOR,
  STATUS_ICON,
  STATUS_ORDER,
  formatPeriod,
  formatAmount,
  formatPercent,
  fmtDecl,
  deriveBoxes303,
  computeUpcomingDeadlines,
  generate303File,
} from '../fiscalModelsUtils.js';

// ── STATUSES ──────────────────────────────────────────────────────────────────

describe('STATUSES', () => {
  it('is an array with 7 entries', () => {
    expect(Array.isArray(STATUSES)).toBe(true);
    expect(STATUSES).toHaveLength(7);
  });

  it('contains all expected status values', () => {
    expect(STATUSES).toContain('skipped');
    expect(STATUSES).toContain('pending');
    expect(STATUSES).toContain('draft');
    expect(STATUSES).toContain('ready');
    expect(STATUSES).toContain('submitted');
    expect(STATUSES).toContain('submitted_ext');
    expect(STATUSES).toContain('submitted_ack');
  });
});

// ── STATUS_COLOR ───────────────────────────────────────────────────────────────

describe('STATUS_COLOR', () => {
  it('is an object', () => {
    expect(typeof STATUS_COLOR).toBe('object');
    expect(STATUS_COLOR).not.toBeNull();
  });

  it('has a string color for every status', () => {
    for (const s of STATUSES) {
      expect(typeof STATUS_COLOR[s]).toBe('string');
    }
  });

  it('maps specific statuses to expected color names', () => {
    expect(STATUS_COLOR.skipped).toBe('grey');
    expect(STATUS_COLOR.pending).toBe('orange');
    expect(STATUS_COLOR.draft).toBe('blue');
    expect(STATUS_COLOR.ready).toBe('green');
    expect(STATUS_COLOR.submitted).toBe('teal');
    expect(STATUS_COLOR.submitted_ext).toBe('violet');
    expect(STATUS_COLOR.submitted_ack).toBe('emerald');
  });
});

// ── STATUS_ICON ────────────────────────────────────────────────────────────────

describe('STATUS_ICON', () => {
  it('is an object', () => {
    expect(typeof STATUS_ICON).toBe('object');
    expect(STATUS_ICON).not.toBeNull();
  });

  it('has a string icon for every status', () => {
    for (const s of STATUSES) {
      expect(typeof STATUS_ICON[s]).toBe('string');
    }
  });
});

// ── STATUS_ORDER ───────────────────────────────────────────────────────────────

describe('STATUS_ORDER', () => {
  it('is an array', () => {
    expect(Array.isArray(STATUS_ORDER)).toBe(true);
  });

  it('contains all 7 statuses', () => {
    expect(STATUS_ORDER).toHaveLength(7);
    for (const s of STATUSES) {
      expect(STATUS_ORDER).toContain(s);
    }
  });
});

// ── formatPeriod ──────────────────────────────────────────────────────────────

describe('formatPeriod', () => {
  it('returns em-dash for null', () => {
    expect(formatPeriod(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatPeriod(undefined)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(formatPeriod('')).toBe('—');
  });

  it('passes T1 through as-is', () => {
    expect(formatPeriod('T1')).toBe('T1');
  });

  it('passes T2 through as-is', () => {
    expect(formatPeriod('T2')).toBe('T2');
  });

  it('passes T3 through as-is', () => {
    expect(formatPeriod('T3')).toBe('T3');
  });

  it('passes T4 through as-is', () => {
    expect(formatPeriod('T4')).toBe('T4');
  });

  it('formats "01" as "1M"', () => {
    expect(formatPeriod('01')).toBe('1M');
  });

  it('formats "06" as "6M"', () => {
    expect(formatPeriod('06')).toBe('6M');
  });

  it('formats "12" as "12M"', () => {
    expect(formatPeriod('12')).toBe('12M');
  });

  it('passes through an arbitrary string', () => {
    expect(formatPeriod('anual')).toBe('anual');
  });
});

// ── formatAmount ──────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('returns em-dash for null', () => {
    expect(formatAmount(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatAmount(undefined)).toBe('—');
  });

  it('formats a positive number with a EUR currency indicator', () => {
    const result = formatAmount(1000);
    expect(result).toMatch(/€|EUR/);
    expect(result).toMatch(/1[.,\s]?000/); // thousands separator varies by ICU build
  });

  it('formats zero', () => {
    const result = formatAmount(0);
    expect(result).toMatch(/€|EUR/);
  });

  it('formats a negative number containing a minus sign', () => {
    const result = formatAmount(-100);
    expect(result).toMatch(/-/);
    expect(result).toMatch(/€|EUR/);
  });

  it('formats a decimal amount', () => {
    const result = formatAmount(1234.56);
    // es-ES uses comma as decimal separator; thousands separator varies by ICU build
    expect(result).toMatch(/1[.,\s]?234[,.]56/);
    expect(result).toMatch(/€|EUR/);
  });
});

// ── formatPercent ─────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('returns em-dash for null', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatPercent(undefined)).toBe('—');
  });

  it('formats an integer rate as "21,00" (no % sign, always 2 decimal places)', () => {
    expect(formatPercent(21)).toBe('21,00');
  });

  it('formats a decimal rate with comma separator (no % sign)', () => {
    expect(formatPercent(1.75)).toBe('1,75');
  });

  it('formats zero as "0,00"', () => {
    expect(formatPercent(0)).toBe('0,00');
  });

  it('formats 10 as "10,00" (always 2 decimal places)', () => {
    expect(formatPercent(10)).toBe('10,00');
  });
});

// ── fmtDecl ───────────────────────────────────────────────────────────────────

describe('fmtDecl', () => {
  it('concatenates model, year, and formatted period', () => {
    const result = fmtDecl({ model: '303', year: 2026, period: 'T1' });
    expect(result).toContain('303');
    expect(result).toContain('2026');
    expect(result).toContain('T1');
  });

  it('converts a two-digit monthly period via formatPeriod', () => {
    const result = fmtDecl({ model: '349', year: 2026, period: '03' });
    expect(result).toContain('349');
    expect(result).toContain('2026');
    expect(result).toContain('3M');
  });

  it('handles period "12" correctly', () => {
    const result = fmtDecl({ model: '303', year: 2025, period: '12' });
    expect(result).toContain('12M');
  });
});

// ── deriveBoxes303 ─────────────────────────────────────────────────────────────

describe('deriveBoxes303', () => {
  describe('empty data', () => {
    it('produces box 27 = 0 when no data is provided', () => {
      const { boxes } = deriveBoxes303({});
      expect(boxes[27]).toBe(0);
    });

    it('produces box 45 = 0 when no data is provided', () => {
      const { boxes } = deriveBoxes303({});
      expect(boxes[45]).toBe(0);
    });

    it('produces box 46 = 0 when no data is provided', () => {
      const { boxes } = deriveBoxes303({});
      expect(boxes[46]).toBe(0);
    });

    it('returns a summary with all zeros', () => {
      const { summary } = deriveBoxes303({});
      expect(summary.accrued).toBe(0);
      expect(summary.deductible).toBe(0);
      expect(summary.result).toBe(0);
    });

    it('does not include previousCompensation in summary when not provided', () => {
      const { summary } = deriveBoxes303({});
      expect(summary).not.toHaveProperty('previousCompensation');
    });
  });

  describe('salesByRate — 21%', () => {
    const data = { salesByRate: { '21': { base: 1000, tax: 210 } } };

    it('maps 21% base to box 7', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[7]).toBe(1000);
    });

    it('maps 21% tax to box 9', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[9]).toBe(210);
    });

    it('box 27 equals tax amount from 21% sales', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(210);
    });

    it('summary.accrued equals box 27', () => {
      const { boxes, summary } = deriveBoxes303(data);
      expect(summary.accrued).toBe(boxes[27]);
    });
  });

  describe('salesByRate — 10% and 7% merged into boxes 4/6', () => {
    it('merges 10% and 7% bases into box 4', () => {
      const data = {
        salesByRate: {
          '10': { base: 300, tax: 30 },
          '7':  { base: 200, tax: 14 },
        },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[4]).toBe(500);
    });

    it('merges 10% and 7% taxes into box 6', () => {
      const data = {
        salesByRate: {
          '10': { base: 300, tax: 30 },
          '7':  { base: 200, tax: 14 },
        },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[6]).toBe(44);
    });

    it('handles 8% merged into 4/6 group', () => {
      const data = { salesByRate: { '8': { base: 100, tax: 8 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[4]).toBe(100);
      expect(boxes[6]).toBe(8);
    });

    it('does not set box 4 when merged base is zero', () => {
      const data = { salesByRate: { '10': { base: 0, tax: 0 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[4]).toBeUndefined();
    });
  });

  describe('salesByRate — 4% and 5% merged into boxes 1/3', () => {
    it('maps 4% base to box 1', () => {
      const data = { salesByRate: { '4': { base: 400, tax: 16 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[1]).toBe(400);
      expect(boxes[3]).toBe(16);
    });

    it('merges 5% into 4% group (boxes 1/3)', () => {
      const data = {
        salesByRate: {
          '4': { base: 100, tax: 4 },
          '5': { base: 200, tax: 10 },
        },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[1]).toBe(300);
      expect(boxes[3]).toBe(14);
    });
  });

  describe('salesByRate — 0% (boxes 150/152)', () => {
    it('maps 0% base to box 150', () => {
      const data = { salesByRate: { '0': { base: 500, tax: 0 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[150]).toBe(500);
    });

    it('does not set box 152 when 0% tax is zero', () => {
      const data = { salesByRate: { '0': { base: 500, tax: 0 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[152]).toBeUndefined();
    });
  });

  describe('salesByRate — 2% (boxes 165/167)', () => {
    it('maps 2% base to box 165 and tax to box 167', () => {
      const data = { salesByRate: { '2': { base: 250, tax: 5 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[165]).toBe(250);
      expect(boxes[167]).toBe(5);
    });
  });

  describe('ecByRate — recargo equivalencia', () => {
    it('maps 1.4% EC rate to boxes 19 (base) and 21 (tax)', () => {
      const data = { ecByRate: { '1.4': { base: 500, tax: 7 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[19]).toBe(500);
      expect(boxes[21]).toBe(7);
    });

    it('box 27 includes EC tax (box 21)', () => {
      const data = { ecByRate: { '1.4': { base: 500, tax: 7 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(7); // only tax boxes feed into 27
    });

    it('maps 5.2% EC rate to boxes 22/24', () => {
      const data = { ecByRate: { '5.2': { base: 300, tax: 15.6 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[22]).toBe(300);
      expect(boxes[24]).toBe(15.6);
    });

    it('maps 0.5% EC rate to boxes 16/18', () => {
      const data = { ecByRate: { '0.5': { base: 200, tax: 1 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[16]).toBe(200);
      expect(boxes[18]).toBe(1);
    });

    it('maps 1.75% EC rate to boxes 156/158', () => {
      const data = { ecByRate: { '1.75': { base: 400, tax: 7 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[156]).toBe(400);
      expect(boxes[158]).toBe(7);
    });

    it('does not set base box when EC base is falsy', () => {
      const data = { ecByRate: { '1.4': { base: 0, tax: 5 } } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[19]).toBeUndefined();
    });
  });

  describe('euPurch — EU acquisitions (boxes 10/11)', () => {
    it('maps EU purchase base to box 10', () => {
      const data = { euPurch: { base: 800, tax: 168 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[10]).toBe(800);
    });

    it('maps EU purchase tax to box 11', () => {
      const data = { euPurch: { base: 800, tax: 168 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[11]).toBe(168);
    });

    it('box 27 includes box 11 (EU tax)', () => {
      const data = { euPurch: { base: 800, tax: 168 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(168);
    });

    it('does not set box 10 when EU base is falsy', () => {
      const data = { euPurch: { base: 0, tax: 0 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[10]).toBeUndefined();
    });
  });

  describe('ispPurch — inversión sujeto pasivo (boxes 12/13)', () => {
    it('maps ISP purchase base to box 12', () => {
      const data = { ispPurch: { base: 600, tax: 126 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[12]).toBe(600);
    });

    it('maps ISP purchase tax to box 13', () => {
      const data = { ispPurch: { base: 600, tax: 126 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[13]).toBe(126);
    });

    it('box 27 includes box 13 (ISP tax)', () => {
      const data = { ispPurch: { base: 600, tax: 126 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(126);
    });
  });

  describe('purchNormal — operaciones interiores corrientes (boxes 28/29)', () => {
    it('maps purchNormal base to box 28 and tax to box 29', () => {
      const data = { purchNormal: { base: 5000, tax: 1050 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[28]).toBe(5000);
      expect(boxes[29]).toBe(1050);
    });

    it('box 45 includes box 29', () => {
      const data = { purchNormal: { base: 5000, tax: 1050 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[45]).toBe(1050);
    });
  });

  describe('purchIntraCorr — intracom. corrientes (boxes 36/37)', () => {
    it('maps purchIntraCorr base to box 36 and tax to box 37', () => {
      const data = { purchIntraCorr: { base: 2000, tax: 420 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[36]).toBe(2000);
      expect(boxes[37]).toBe(420);
    });

    it('box 45 includes box 37', () => {
      const data = { purchIntraCorr: { base: 2000, tax: 420 } };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[45]).toBe(420);
    });
  });

  describe('all purchase PURCH_MAP entries', () => {
    it('purchInvGoods maps to boxes 30/31', () => {
      const { boxes } = deriveBoxes303({ purchInvGoods: { base: 100, tax: 21 } });
      expect(boxes[30]).toBe(100);
      expect(boxes[31]).toBe(21);
    });

    it('purchImport maps to boxes 32/33', () => {
      const { boxes } = deriveBoxes303({ purchImport: { base: 100, tax: 21 } });
      expect(boxes[32]).toBe(100);
      expect(boxes[33]).toBe(21);
    });

    it('purchImportInv maps to boxes 34/35', () => {
      const { boxes } = deriveBoxes303({ purchImportInv: { base: 100, tax: 21 } });
      expect(boxes[34]).toBe(100);
      expect(boxes[35]).toBe(21);
    });

    it('purchIntraInv maps to boxes 38/39', () => {
      const { boxes } = deriveBoxes303({ purchIntraInv: { base: 100, tax: 21 } });
      expect(boxes[38]).toBe(100);
      expect(boxes[39]).toBe(21);
    });

    it('purchRectif maps to boxes 40/41', () => {
      const { boxes } = deriveBoxes303({ purchRectif: { base: 100, tax: 21 } });
      expect(boxes[40]).toBe(100);
      expect(boxes[41]).toBe(21);
    });
  });

  describe('special fields — boxes 42/43/44', () => {
    it('specialComp maps to box 42', () => {
      const { boxes } = deriveBoxes303({ specialComp: 300 });
      expect(boxes[42]).toBe(300);
    });

    it('invAdjust maps to box 43', () => {
      const { boxes } = deriveBoxes303({ invAdjust: 150 });
      expect(boxes[43]).toBe(150);
    });

    it('proRataFinal maps to box 44', () => {
      const { boxes } = deriveBoxes303({ proRataFinal: 75 });
      expect(boxes[44]).toBe(75);
    });

    it('special fields of value 0 are still set (not null)', () => {
      const { boxes } = deriveBoxes303({ specialComp: 0 });
      expect(boxes[42]).toBe(0);
    });

    it('box 45 includes specialComp, invAdjust, proRataFinal', () => {
      const { boxes } = deriveBoxes303({
        specialComp: 100,
        invAdjust: 50,
        proRataFinal: 25,
      });
      expect(boxes[45]).toBe(175);
    });
  });

  describe('info fields — boxes 59/60', () => {
    it('intracommSales maps to box 59', () => {
      const { boxes } = deriveBoxes303({ intracommSales: 1200 });
      expect(boxes[59]).toBe(1200);
    });

    it('exports maps to box 60', () => {
      const { boxes } = deriveBoxes303({ exports: 800 });
      expect(boxes[60]).toBe(800);
    });

    it('box 59 not set when intracommSales is absent', () => {
      const { boxes } = deriveBoxes303({});
      expect(boxes[59]).toBeUndefined();
    });

    it('box 60 not set when exports is absent', () => {
      const { boxes } = deriveBoxes303({});
      expect(boxes[60]).toBeUndefined();
    });
  });

  describe('summary.previousCompensation', () => {
    it('appears in summary when provided', () => {
      const { summary } = deriveBoxes303({ previousCompensation: 500 });
      expect(summary.previousCompensation).toBe(500);
    });

    it('appears when value is 0', () => {
      const { summary } = deriveBoxes303({ previousCompensation: 0 });
      expect(summary.previousCompensation).toBe(0);
    });

    it('absent from summary when not provided', () => {
      const { summary } = deriveBoxes303({});
      expect(summary).not.toHaveProperty('previousCompensation');
    });
  });

  describe('box 46 = box 27 minus box 45', () => {
    it('box 46 is positive when accrued > deductible', () => {
      const data = {
        salesByRate: { '21': { base: 10000, tax: 2100 } },
        purchNormal: { base: 1000, tax: 210 },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[46]).toBe(boxes[27] - boxes[45]);
    });

    it('box 46 is negative when deductible > accrued', () => {
      const data = {
        salesByRate: { '21': { base: 100, tax: 21 } },
        purchNormal: { base: 10000, tax: 2100 },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[46]).toBeLessThan(0);
      expect(boxes[46]).toBe(boxes[27] - boxes[45]);
    });

    it('box 46 is zero when accrued equals deductible', () => {
      const data = {
        salesByRate: { '21': { base: 1000, tax: 210 } },
        purchNormal: { base: 1000, tax: 210 },
      };
      const { boxes } = deriveBoxes303(data);
      expect(boxes[46]).toBe(0);
    });

    it('summary.result equals box 46', () => {
      const data = {
        salesByRate: { '21': { base: 5000, tax: 1050 } },
        purchNormal: { base: 2000, tax: 420 },
      };
      const { boxes, summary } = deriveBoxes303(data);
      expect(summary.result).toBe(boxes[46]);
    });
  });

  describe('snapshot — 2026 T2 screenshot values', () => {
    const data = {
      salesByRate: {
        '4':  { base: 44,     tax: 1.76   },
        '10': { base: 201,    tax: 20.10  },
        '21': { base: 982.60, tax: 206.35 },
      },
      purchNormal:    { base: 99, tax: 20.79 },
      intracommSales: 23,
      exports:        36,
    };

    it('box 1 = 44, box 3 = 1.76', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[1]).toBe(44);
      expect(boxes[3]).toBe(1.76);
    });

    it('box 4 = 201, box 6 = 20.10', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[4]).toBe(201);
      expect(boxes[6]).toBe(20.10);
    });

    it('box 7 = 982.60, box 9 = 206.35', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[7]).toBe(982.60);
      expect(boxes[9]).toBe(206.35);
    });

    it('box 27 = 228.21 (sum of tax boxes 3 + 6 + 9)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(228.21);
    });

    it('box 28 = 99, box 29 = 20.79', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[28]).toBe(99);
      expect(boxes[29]).toBe(20.79);
    });

    it('box 45 = 20.79', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[45]).toBe(20.79);
    });

    it('box 46 = 207.42 (228.21 - 20.79)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[46]).toBe(207.42);
    });

    it('box 59 = 23, box 60 = 36', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[59]).toBe(23);
      expect(boxes[60]).toBe(36);
    });

    it('summary matches box 27/45/46', () => {
      const { summary } = deriveBoxes303(data);
      expect(summary.accrued).toBe(228.21);
      expect(summary.deductible).toBe(20.79);
      expect(summary.result).toBe(207.42);
    });
  });

  describe('all accrued boxes feed into box 27', () => {
    it('box 27 equals the exact sum of every contributing tax input', () => {
      const data = {
        salesByRate: {
          '21': { base: 100, tax: 10 },
          '10': { base: 100, tax: 10 },
          '4':  { base: 100, tax: 10 },
          '5':  { base: 100, tax: 10 },
          '0':  { base: 100, tax: 10 },
          '2':  { base: 100, tax: 10 },
        },
        ecByRate: {
          '1.4':  { base: 100, tax: 10 },
          '5.2':  { base: 100, tax: 10 },
          '0.5':  { base: 100, tax: 10 },
          '1.75': { base: 100, tax: 10 },
        },
        euPurch:  { base: 100, tax: 10 },
        ispPurch: { base: 100, tax: 10 },
      };
      const { boxes } = deriveBoxes303(data);
      // accruedBoxes in source: [3,6,9,11,13,15,18,21,24,26,152,155,158,167,170]
      // inputs above map to boxes: 3(4%+5%), 6(10%+7%+8%), 9(21%), 11(euPurch),
      //   13(ispPurch), 18(EC 0.5%), 21(EC 1.4%), 24(EC 5.2%), 152(0%), 158(EC 1.75%), 167(2%)
      const accruedBoxes = [3, 6, 9, 11, 13, 15, 18, 21, 24, 26, 152, 155, 158, 167, 170];
      const expectedSum = Math.round(accruedBoxes.reduce((s, box) => s + (boxes[box] ?? 0), 0) * 100) / 100;
      expect(boxes[27]).toBe(expectedSum);
    });

    it('no tax input is silently dropped — 4% and 5% merge into box 3 (20), ten others each 10 → 27 = 120', () => {
      const data = {
        salesByRate: {
          '21': { base: 100, tax: 10 },
          '10': { base: 100, tax: 10 },
          '4':  { base: 100, tax: 10 },
          '5':  { base: 100, tax: 10 },
          '0':  { base: 100, tax: 10 },
          '2':  { base: 100, tax: 10 },
        },
        ecByRate: {
          '1.4':  { base: 100, tax: 10 },
          '5.2':  { base: 100, tax: 10 },
          '0.5':  { base: 100, tax: 10 },
          '1.75': { base: 100, tax: 10 },
        },
        euPurch:  { base: 100, tax: 10 },
        ispPurch: { base: 100, tax: 10 },
      };
      const { boxes } = deriveBoxes303(data);
      // box 3 = 4%+5% merged = 20; boxes 6,9,11,13,18,21,24,152,158,167 = 10 each
      expect(boxes[27]).toBe(120);
    });
  });

  describe('RE + IVA combined — same invoice data', () => {
    const data = {
      salesByRate: { '21': { base: 1000, tax: 210 } },
      ecByRate:    { '5.2': { base: 1000, tax: 52 } },
    };

    it('box 7 = 1000 (IVA base at 21%)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[7]).toBe(1000);
    });

    it('box 9 = 210 (IVA cuota at 21%)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[9]).toBe(210);
    });

    it('box 22 = 1000 (RE base at 5.2%)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[22]).toBe(1000);
    });

    it('box 24 = 52 (RE cuota at 5.2%)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[24]).toBe(52);
    });

    it('box 27 = 262 (both IVA and RE tax contribute)', () => {
      const { boxes } = deriveBoxes303(data);
      expect(boxes[27]).toBe(262);
    });
  });

  describe('rounding', () => {
    it('rounds to 2 decimal places', () => {
      const data = { salesByRate: { '21': { base: 100.005, tax: 21.005 } } };
      const { boxes } = deriveBoxes303(data);
      // roundEur: Math.round(n*100)/100
      expect(boxes[9]).toBe(Math.round(21.005 * 100) / 100);
    });
  });

  describe('combined scenario', () => {
    it('correctly totals accrued across multiple rates', () => {
      const data = {
        salesByRate: {
          '21': { base: 1000, tax: 210 },
          '10': { base: 500, tax: 50 },
        },
        euPurch: { base: 800, tax: 168 },
        ispPurch: { base: 600, tax: 126 },
      };
      const { boxes } = deriveBoxes303(data);
      // Accrued boxes: 3,6,9,11,13,15,18,21,24,26,152,155,158,167,170
      // box 6=50, box 9=210, box 11=168, box 13=126  → 27 = 554
      expect(boxes[27]).toBe(554);
    });

    it('box 45 sums all purchase tax boxes', () => {
      const data = {
        purchNormal:    { base: 1000, tax: 210 },
        purchIntraCorr: { base: 500,  tax: 105 },
        specialComp: 50,
      };
      const { boxes } = deriveBoxes303(data);
      // deductBoxes [29,31,33,35,37,39,41,42,43,44]
      // box 29=210, box 37=105, box 42=50 → 365
      expect(boxes[45]).toBe(365);
    });
  });
});

// ── computeUpcomingDeadlines ──────────────────────────────────────────────────

describe('computeUpcomingDeadlines', () => {
  const D = (model, year, period, status) => ({
    id: `${model}-${year}-${period}`,
    model,
    year,
    period,
    status,
  });

  describe('filtering completed statuses', () => {
    it('excludes submitted', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'submitted')])).toHaveLength(0);
    });

    it('excludes submitted_ext', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'submitted_ext')])).toHaveLength(0);
    });

    it('excludes submitted_ack', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'submitted_ack')])).toHaveLength(0);
    });

    it('excludes skipped', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'skipped')])).toHaveLength(0);
    });

    it('includes draft', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'draft')])).toHaveLength(1);
    });

    it('includes ready', () => {
      expect(computeUpcomingDeadlines([D('303', 2026, 'T1', 'ready')])).toHaveLength(1);
    });

    it('returns empty array when all declarations are completed', () => {
      const decls = [
        D('303', 2026, 'T1', 'submitted'),
        D('303', 2026, 'T2', 'skipped'),
        D('303', 2026, 'T3', 'submitted_ack'),
      ];
      expect(computeUpcomingDeadlines(decls)).toHaveLength(0);
    });
  });

  describe('quarter period deadlines', () => {
    it('T1 → deadline April 20 (month index 3)', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('303', 2026, 'T1', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(3);
      expect(deadline.getDate()).toBe(20);
    });

    it('T2 → deadline July 20 (month index 6)', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('303', 2026, 'T2', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(6);
      expect(deadline.getDate()).toBe(20);
    });

    it('T3 → deadline October 20 (month index 9)', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('303', 2026, 'T3', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(9);
      expect(deadline.getDate()).toBe(20);
    });

    it('T4 → deadline January 20 of next year', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('303', 2025, 'T4', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(0);
      expect(deadline.getDate()).toBe(20);
    });
  });

  describe('monthly period deadlines', () => {
    it('"03" → deadline April 20 (month index 3)', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('349', 2026, '03', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(3);
      expect(deadline.getDate()).toBe(20);
    });

    it('"12" → deadline January 20 of next year', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('349', 2025, '12', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(0);
      expect(deadline.getDate()).toBe(20);
    });

    it('"01" → deadline February 20', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('349', 2026, '01', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(1);
      expect(deadline.getDate()).toBe(20);
    });

    it('"06" → deadline July 20 (month index 6)', () => {
      const [{ deadline }] = computeUpcomingDeadlines([D('349', 2026, '06', 'draft')]);
      expect(deadline.getFullYear()).toBe(2026);
      expect(deadline.getMonth()).toBe(6);
      expect(deadline.getDate()).toBe(20);
    });
  });

  describe('sorting', () => {
    it('sorts by deadline ascending (earlier first)', () => {
      const decls = [
        D('303', 2026, 'T3', 'draft'),
        D('303', 2026, 'T1', 'draft'),
        D('303', 2026, 'T2', 'draft'),
      ];
      const result = computeUpcomingDeadlines(decls);
      expect(result[0].deadline <= result[1].deadline).toBe(true);
      expect(result[1].deadline <= result[2].deadline).toBe(true);
    });

    it('first result has the earliest deadline', () => {
      const decls = [
        D('303', 2026, 'T4', 'draft'),
        D('303', 2026, 'T1', 'draft'),
      ];
      const result = computeUpcomingDeadlines(decls);
      expect(result[0].decl.period).toBe('T1');
    });
  });

  describe('limit parameter', () => {
    it('respects the default limit of 5', () => {
      const decls = ['T1', 'T2', 'T3', 'T4'].map(p => D('303', 2026, p, 'draft'))
        .concat(['01', '02'].map(p => D('349', 2026, p, 'draft')));
      const result = computeUpcomingDeadlines(decls);
      expect(result).toHaveLength(5);
    });

    it('respects a custom limit of 2', () => {
      const decls = ['T1', 'T2', 'T3', 'T4'].map(p => D('303', 2026, p, 'draft'));
      expect(computeUpcomingDeadlines(decls, 2)).toHaveLength(2);
    });

    it('returns fewer items than limit when not enough declarations', () => {
      const decls = [D('303', 2026, 'T1', 'draft')];
      expect(computeUpcomingDeadlines(decls, 5)).toHaveLength(1);
    });

    it('returns empty array with limit=0', () => {
      const decls = [D('303', 2026, 'T1', 'draft')];
      expect(computeUpcomingDeadlines(decls, 0)).toHaveLength(0);
    });
  });

  describe('result shape', () => {
    it('each result item has a decl property', () => {
      const [item] = computeUpcomingDeadlines([D('303', 2026, 'T1', 'draft')]);
      expect(item).toHaveProperty('decl');
    });

    it('each result item has a deadline Date instance', () => {
      const [item] = computeUpcomingDeadlines([D('303', 2026, 'T1', 'draft')]);
      expect(item.deadline).toBeInstanceOf(Date);
    });

    it('decl on result item equals the original declaration', () => {
      const decl = D('303', 2026, 'T1', 'draft');
      const [item] = computeUpcomingDeadlines([decl]);
      expect(item.decl).toBe(decl);
    });
  });
});

// ── generate303File ───────────────────────────────────────────────────────────

describe('generate303File', () => {
  const DECL = { id: '303-2026-T2', model: '303', year: 2026, period: 'T2', result: { kind: 'I' } };
  const TOKEN = 'test-token';
  const API_BASE = 'http://host/neo/fiscal-models';

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function mockFetchOk(blob = new Blob(['data'])) {
    const objectUrl = 'blob:mock';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue(objectUrl),
      revokeObjectURL: vi.fn(),
    });
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    return { anchor, objectUrl };
  }

  it('returns false when token is missing', async () => {
    expect(await generate303File(DECL, { token: '', apiBaseUrl: API_BASE })).toBe(false);
    expect(await generate303File(DECL, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when apiBaseUrl is missing', async () => {
    expect(await generate303File(DECL, { token: TOKEN })).toBe(false);
  });

  it('builds the correct URL with URLSearchParams', async () => {
    mockFetchOk();
    await generate303File(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0];
    expect(calledUrl).toContain('/fiscal303/generate?');
    expect(calledUrl).toContain('year=2026');
    expect(calledUrl).toContain('period=T2');
    expect(calledUrl).toContain('tipo=I');
  });

  it('uses the result.kind from decl as tipo', async () => {
    mockFetchOk();
    await generate303File({ ...DECL, result: { kind: 'C' } }, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=C');
  });

  it('defaults tipo to N when result.kind is absent', async () => {
    mockFetchOk();
    await generate303File({ ...DECL, result: null }, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=N');
  });

  it('sends Authorization header', async () => {
    mockFetchOk();
    await generate303File(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(vi.mocked(fetch).mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('returns true and triggers download on success', async () => {
    const { anchor } = mockFetchOk();
    const result = await generate303File(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toBe(true);
    expect(anchor.download).toBe('303_T2_2026.txt');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('returns false when fetch responds not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await generate303File(DECL, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await generate303File(DECL, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });
});
