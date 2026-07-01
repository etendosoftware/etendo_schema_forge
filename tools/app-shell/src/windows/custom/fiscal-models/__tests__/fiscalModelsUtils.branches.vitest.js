import {
  deriveBoxes303,
  generate303File,
  generate349File,
  checkModified303,
  checkModified349,
  compute349Operators,
  computeBoxes303,
  computeUpcomingDeadlines,
  formatPeriod,
  STATUS_ICON,
} from '../fiscalModelsUtils.js';

// ---------------------------------------------------------------------------
// STATUS_ICON coverage
// ---------------------------------------------------------------------------

describe('STATUS_ICON', () => {
  it('has an icon for every status', () => {
    for (const s of ['skipped', 'pending', 'draft', 'ready', 'submitted', 'submitted_ext', 'submitted_ack']) {
      expect(typeof STATUS_ICON[s]).toBe('string');
      expect(STATUS_ICON[s].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// formatPeriod — empty string branch
// ---------------------------------------------------------------------------

describe('formatPeriod — branch coverage', () => {
  it('returns em-dash for empty string (falsy)', () => {
    expect(formatPeriod('')).toBe('—');
  });

  it('returns em-dash for 0 (falsy)', () => {
    expect(formatPeriod(0)).toBe('—');
  });

  it('passes through T2, T3, T4', () => {
    expect(formatPeriod('T2')).toBe('T2');
    expect(formatPeriod('T3')).toBe('T3');
    expect(formatPeriod('T4')).toBe('T4');
  });

  it('converts 12 to 12M', () => {
    expect(formatPeriod('12')).toBe('12M');
  });

  it('passes through multi-char unknown', () => {
    expect(formatPeriod('yearly')).toBe('yearly');
  });
});

// ---------------------------------------------------------------------------
// deriveBoxes303 — comprehensive branch coverage
// ---------------------------------------------------------------------------

describe('deriveBoxes303', () => {
  it('returns empty boxes and zero summary for empty data', () => {
    const { boxes, summary } = deriveBoxes303({});
    expect(summary.accrued).toBe(0);
    expect(summary.deductible).toBe(0);
    expect(summary.result).toBe(0);
  });

  it('fills sales boxes for 21% rate', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '21': { base: 1000, tax: 210 } },
    });
    expect(boxes[7]).toBe(1000);
    expect(boxes[9]).toBe(210);
    expect(boxes[27]).toBe(210); // accrued = sum of tax boxes
  });

  it('fills sales boxes for 10% rate (merged with 7% and 8%)', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: {
        '10': { base: 500, tax: 50 },
        '7': { base: 300, tax: 21 },
        '8': { base: 200, tax: 16 },
      },
    });
    expect(boxes[4]).toBe(1000); // base 500+300+200
    expect(boxes[6]).toBe(87);   // tax 50+21+16
  });

  it('fills sales boxes for 4% and 5% rate (merged)', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '4': { base: 400, tax: 16 }, '5': { base: 100, tax: 5 } },
    });
    expect(boxes[1]).toBe(500);
    expect(boxes[3]).toBe(21);
  });

  it('fills sales boxes for 0% rate', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '0': { base: 1000, tax: 0 } },
    });
    expect(boxes[150]).toBe(1000);
  });

  it('fills sales boxes for 2% rate', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '2': { base: 800, tax: 16 } },
    });
    expect(boxes[165]).toBe(800);
    expect(boxes[167]).toBe(16);
  });

  it('fills EU purchase boxes (10, 11)', () => {
    const { boxes } = deriveBoxes303({
      euPurch: { base: 5000, tax: 1050 },
    });
    expect(boxes[10]).toBe(5000);
    expect(boxes[11]).toBe(1050);
  });

  it('fills ISP purchase boxes (12, 13)', () => {
    const { boxes } = deriveBoxes303({
      ispPurch: { base: 3000, tax: 630 },
    });
    expect(boxes[12]).toBe(3000);
    expect(boxes[13]).toBe(630);
  });

  it('fills EC (recargo equivalencia) boxes', () => {
    const { boxes } = deriveBoxes303({
      ecByRate: {
        '1.4': { base: 100, tax: 1.4 },
        '5.2': { base: 200, tax: 10.4 },
        '0.5': { base: 300, tax: 1.5 },
        '1.75': { base: 400, tax: 7 },
      },
    });
    expect(boxes[19]).toBe(100);
    expect(boxes[21]).toBe(1.4);
    expect(boxes[22]).toBe(200);
    expect(boxes[24]).toBe(10.4);
    expect(boxes[16]).toBe(300);
    expect(boxes[18]).toBe(1.5);
    expect(boxes[156]).toBe(400);
    expect(boxes[158]).toBe(7);
  });

  it('fills purchase boxes via PURCH_MAP', () => {
    const { boxes } = deriveBoxes303({
      purchNormal: { base: 1000, tax: 210 },
      purchInvGoods: { base: 500, tax: 105 },
      purchImport: { base: 200, tax: 42 },
      purchImportInv: { base: 100, tax: 21 },
      purchIntraCorr: { base: 300, tax: 63 },
      purchIntraInv: { base: 150, tax: 31.5 },
      purchRectif: { base: 50, tax: 10.5 },
    });
    expect(boxes[28]).toBe(1000);
    expect(boxes[29]).toBe(210);
    expect(boxes[30]).toBe(500);
    expect(boxes[31]).toBe(105);
    expect(boxes[32]).toBe(200);
    expect(boxes[33]).toBe(42);
    expect(boxes[34]).toBe(100);
    expect(boxes[35]).toBe(21);
    expect(boxes[36]).toBe(300);
    expect(boxes[37]).toBe(63);
    expect(boxes[38]).toBe(150);
    expect(boxes[39]).toBe(31.5);
    expect(boxes[40]).toBe(50);
    expect(boxes[41]).toBe(10.5);
  });

  it('fills special compensation, inv adjust, pro rata boxes', () => {
    const { boxes } = deriveBoxes303({
      specialComp: 100,
      invAdjust: -50,
      proRataFinal: 25,
    });
    expect(boxes[42]).toBe(100);
    expect(boxes[43]).toBe(-50);
    expect(boxes[44]).toBe(25);
  });

  it('fills info boxes (59, 60)', () => {
    const { boxes } = deriveBoxes303({
      intracommSales: 15000,
      exports: 8000,
    });
    expect(boxes[59]).toBe(15000);
    expect(boxes[60]).toBe(8000);
  });

  it('includes previousCompensation in summary when present', () => {
    const { summary } = deriveBoxes303({
      previousCompensation: 500,
    });
    expect(summary.previousCompensation).toBe(500);
  });

  it('does not include previousCompensation in summary when absent', () => {
    const { summary } = deriveBoxes303({});
    expect(summary).not.toHaveProperty('previousCompensation');
  });

  it('computes accrued (box 27) correctly from multiple tax boxes', () => {
    const { boxes, summary } = deriveBoxes303({
      salesByRate: { '21': { base: 1000, tax: 210 } },
      euPurch: { base: 500, tax: 105 },
    });
    // accrued = sum of boxes 3,6,9,11,13,15,18,21,24,26,152,155,158,167,170
    // boxes[9]=210, boxes[11]=105 → 315
    expect(boxes[27]).toBe(315);
    expect(summary.accrued).toBe(315);
  });

  it('computes deductible (box 45) correctly', () => {
    const { boxes, summary } = deriveBoxes303({
      purchNormal: { base: 1000, tax: 210 },
      specialComp: 50,
    });
    // deductible = sum of boxes 29,31,33,35,37,39,41,42,43,44
    // boxes[29]=210, boxes[42]=50 → 260
    expect(boxes[45]).toBe(260);
    expect(summary.deductible).toBe(260);
  });

  it('computes result (box 46) = accrued - deductible', () => {
    const { boxes, summary } = deriveBoxes303({
      salesByRate: { '21': { base: 1000, tax: 210 } },
      purchNormal: { base: 500, tax: 105 },
    });
    // accrued (box27) = 210, deductible (box45) = 105
    expect(boxes[46]).toBe(105);
    expect(summary.result).toBe(105);
  });

  it('skips zero-valued sales rates', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '21': { base: 0, tax: 0 } },
    });
    expect(boxes[7]).toBeUndefined();
    expect(boxes[9]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeUpcomingDeadlines — period type edge cases
// ---------------------------------------------------------------------------

describe('computeUpcomingDeadlines — branch coverage', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  it('filters out declarations with unknown period format (returns null deadline)', () => {
    const decls = [D('303', 2026, 'annual', 'draft')];
    const result = computeUpcomingDeadlines(decls);
    expect(result).toHaveLength(0);
  });

  it('includes ready status', () => {
    const decls = [D('303', 2026, 'T1', 'ready')];
    expect(computeUpcomingDeadlines(decls)).toHaveLength(1);
  });

  it('uses default limit of 5', () => {
    const decls = Array.from({ length: 8 }, (_, i) =>
      D('303', 2026 + Math.floor(i / 4), `T${(i % 4) + 1}`, 'draft'),
    );
    expect(computeUpcomingDeadlines(decls).length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Async functions — generate303File
// ---------------------------------------------------------------------------

describe('generate303File', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no token', async () => {
    expect(await generate303File({ year: 2026, period: 'T1' })).toBe(false);
  });

  it('returns false when no apiBaseUrl', async () => {
    expect(await generate303File({ year: 2026, period: 'T1' }, { token: 'tok' })).toBe(false);
  });

  it('returns false on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    const result = await generate303File(
      { year: 2026, period: 'T1', result: { kind: 'N' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toBe(false);
  });

  it('returns true and triggers download on success', async () => {
    const mockBlob = new Blob(['content']);
    globalThis.fetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
    const mockA = { click: vi.fn(), href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockA);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    const result = await generate303File(
      { year: 2026, period: 'T1', result: { kind: 'D' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toBe(true);
    expect(mockA.click).toHaveBeenCalled();
  });

  it('returns false on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toBe(false);
  });

  it('uses N as default tipo when result.kind is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('tipo=N');
  });
});

// ---------------------------------------------------------------------------
// generate349File
// ---------------------------------------------------------------------------

describe('generate349File', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no token', async () => {
    expect(await generate349File({ year: 2026, period: 'T1' })).toBe(false);
  });

  it('returns false on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toBe(false);
  });

  it('returns true and triggers download on success', async () => {
    const mockBlob = new Blob(['content']);
    globalThis.fetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
    const mockA = { click: vi.fn(), href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockA);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec', phone: '555', contact: 'Juan' },
    );
    expect(result).toBe(true);
  });

  it('returns false on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('fail'));
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkModified303
// ---------------------------------------------------------------------------

describe('checkModified303', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no token', async () => {
    expect(await checkModified303({ year: 2026, period: 'T1' }, 1000)).toBe(false);
  });

  it('returns false on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    expect(await checkModified303(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(false);
  });

  it('returns true when modified=true', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modified: true }) });
    expect(await checkModified303(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(true);
  });

  it('returns false when modified=false', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modified: false }) });
    expect(await checkModified303(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(false);
  });

  it('returns false on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    expect(await checkModified303(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkModified349
// ---------------------------------------------------------------------------

describe('checkModified349', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no token', async () => {
    expect(await checkModified349({ year: 2026, period: 'T1' }, 1000)).toBe(false);
  });

  it('returns false on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    expect(await checkModified349(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(false);
  });

  it('returns true when modified=true', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ modified: true }) });
    expect(await checkModified349(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(true);
  });

  it('returns false on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    expect(await checkModified349(
      { year: 2026, period: 'T1' }, 1000,
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compute349Operators
// ---------------------------------------------------------------------------

describe('compute349Operators', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    expect(await compute349Operators(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBeNull();
  });

  it('returns data on success', async () => {
    const mockData = { operators: [{ bpId: '1' }], summary: {} };
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });
    const result = await compute349Operators(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toEqual(mockData);
  });

  it('returns null on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    expect(await compute349Operators(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    )).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeBoxes303 — with token (API path)
// ---------------------------------------------------------------------------

describe('computeBoxes303 — API path', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns API response when token and apiBaseUrl are present and fetch succeeds', async () => {
    const mockData = { boxes: { 27: 100 }, summary: { accrued: 100 } };
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) });
    const result = await computeBoxes303(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toEqual(mockData);
  });

  it('falls through to mock on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false });
    const result = await computeBoxes303(
      { year: 2026, period: 'T2' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    // Falls through to mock — T2 2026 returns data
    expect(result).not.toBeNull();
    expect(result.boxes[27]).toBe(1309.98);
  }, 5000);

  it('falls through to mock on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('net'));
    const result = await computeBoxes303(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).not.toBeNull();
  }, 5000);
});
