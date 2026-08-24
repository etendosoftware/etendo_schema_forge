import {
  deriveBoxes303,
  generate303File,
  generate349File,
  checkModified303,
  checkModified349,
  compute349Operators,
  computeBoxes303,
  computeUpcomingDeadlines,
  countUpcomingDeadlines,
  isUpcomingDeadline,
  formatPeriod,
  STATUS_ICON,
} from '../fiscalModelsUtils.js';

// ---------------------------------------------------------------------------
// STATUS_ICON coverage
// ---------------------------------------------------------------------------

describe('STATUS_ICON', () => {
  it('has an icon for every status', () => {
    for (const s of ['draft', 'ready', 'submitted', 'submitted_ext', 'submitted_ack']) {
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
// countUpcomingDeadlines — "Por vencer" KPI count (real fix under test)
// ---------------------------------------------------------------------------

describe('countUpcomingDeadlines', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  it('counts a declaration whose deadline is exactly the reference date (boundary: deadline >= today)', () => {
    // period '03' (March) 2026 → deadline is April 20, 2026 (day-20-of-following-month rule).
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    const decls = [D('349', 2026, '03', 'draft')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(1);
  });

  it('excludes a declaration whose deadline was the day before the reference date', () => {
    // Same declaration as above (deadline April 20, 2026), but "today" is April 21, 2026.
    const referenceDate = new Date(2026, 3, 21); // April 21, 2026
    const decls = [D('349', 2026, '03', 'draft')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(0);
  });

  it('excludes a declaration whose deadline falls beyond the 7-day window', () => {
    // period '04' (April) 2026 → deadline is May 20, 2026, 30 days after the reference date —
    // outside the [today, today+7] window, so it no longer counts as "upcoming".
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    const decls = [D('349', 2026, '04', 'draft')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(0);
  });

  it('counts a declaration with a genuine future deadline within the 7-day window', () => {
    // period '03' (March) 2026 → deadline is April 20, 2026, 5 days after the reference date —
    // inside the [today, today+7] window, and not the boundary (today itself).
    const referenceDate = new Date(2026, 3, 15); // April 15, 2026
    const decls = [D('349', 2026, '03', 'draft')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(1);
  });

  it('excludes a submitted declaration even with a still-future deadline', () => {
    // period 'T2' 2026 → deadline July 20, 2026, clearly future relative to April 20 — but
    // completed-status exclusion must win regardless of the date comparison.
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    const decls = [D('303', 2026, 'T2', 'submitted')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(0);
  });

  it('excludes a submitted_ack declaration even with a still-future deadline', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    const decls = [D('303', 2026, 'T2', 'submitted_ack')];
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(0);
  });

  it('is uncapped: more than 5 genuinely-upcoming declarations all count, unlike computeUpcomingDeadlines\'s default limit=5', () => {
    // period '03' (March) 2026 → deadline April 20, 2026, the boundary of the 7-day window
    // when referenceDate is April 20, 2026 — all 7 declarations share this one deadline (only
    // the id differs), still genuinely proving "uncapped" since computeUpcomingDeadlines's
    // hard slice(0,5) truncates identical-deadline entries just the same as distinct ones.
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    const decls = Array.from({ length: 7 }, (_, i) => ({
      id: `dup-${i}`, model: '349', year: 2026, period: '03', status: 'draft',
    }));
    expect(decls).toHaveLength(7);
    // Old bug this fix addresses: computeUpcomingDeadlines(decls).length silently caps at 5.
    expect(computeUpcomingDeadlines(decls).length).toBe(5);
    // countUpcomingDeadlines has no artificial cap — it's a count, not a truncated preview.
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(7);
  });

  it('returns 0 for an empty declarations array without throwing', () => {
    expect(() => countUpcomingDeadlines([], new Date(2026, 3, 20))).not.toThrow();
    expect(countUpcomingDeadlines([], new Date(2026, 3, 20))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isUpcomingDeadline — per-declaration predicate extracted out of
// countUpcomingDeadlines (ETP-4755, KPI-cards-as-filters). Mirrors the exact
// boundary/exclusion cases above, since countUpcomingDeadlines is defined as
// `decls.filter(d => isUpcomingDeadline(d, referenceDate)).length` — the two
// must never disagree on any of these fixtures.
// ---------------------------------------------------------------------------

describe('isUpcomingDeadline', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  it('is true when the deadline is exactly the reference date (boundary: deadline >= today)', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    expect(isUpcomingDeadline(D('349', 2026, '03', 'draft'), referenceDate)).toBe(true);
  });

  it('is false when the deadline was the day before the reference date', () => {
    const referenceDate = new Date(2026, 3, 21); // April 21, 2026
    expect(isUpcomingDeadline(D('349', 2026, '03', 'draft'), referenceDate)).toBe(false);
  });

  it('is true for a genuine future deadline within the 7-day window', () => {
    // period '03' (March) 2026 → deadline April 20, 2026, 5 days after the reference date —
    // inside the window, and not the boundary (today itself).
    const referenceDate = new Date(2026, 3, 15); // April 15, 2026
    expect(isUpcomingDeadline(D('349', 2026, '03', 'draft'), referenceDate)).toBe(true);
  });

  it('is false for a submitted declaration even with a still-future deadline', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    expect(isUpcomingDeadline(D('303', 2026, 'T2', 'submitted'), referenceDate)).toBe(false);
  });

  it('is false for a submitted_ack declaration even with a still-future deadline', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    expect(isUpcomingDeadline(D('303', 2026, 'T2', 'submitted_ack'), referenceDate)).toBe(false);
  });

  it('is false for a submitted_ext declaration even with a still-future deadline', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    expect(isUpcomingDeadline(D('303', 2026, 'T2', 'submitted_ext'), referenceDate)).toBe(false);
  });

  it('is false for a skipped declaration even with a still-future deadline', () => {
    const referenceDate = new Date(2026, 3, 20); // April 20, 2026
    expect(isUpcomingDeadline(D('303', 2026, 'T2', 'skipped'), referenceDate)).toBe(false);
  });

  it('defaults referenceDate to the real current date when omitted', () => {
    // Pin "now" to a fixed date, then use a declaration whose real getDeadlineDate-derived
    // deadline falls within 7 days of that fixed date — calling isUpcomingDeadline with NO
    // referenceDate arg still exercises the "defaults to new Date()" property.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 15)); // October 15, 2026
      // model 349, period '09' (September) → deadline October 20, 2026 (day-20-of-following-
      // month rule) — 5 days after the pinned "now", inside the window.
      expect(isUpcomingDeadline(D('349', 2026, '09', 'draft'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('countUpcomingDeadlines genuinely delegates to isUpcomingDeadline — consistent results across a shared fixture set', () => {
    const referenceDate = new Date(2026, 3, 25); // April 25, 2026
    const decls = [
      D('349', 2026, '03', 'draft'),        // excluded (deadline April 20 — already past)
      D('303', 2026, '03', 'draft'),        // upcoming (future, in-window: deadline April 30)
      D('303', 2026, 'T2', 'submitted'),    // excluded (completed)
      D('303', 2026, 'T2', 'submitted_ack'),// excluded (completed)
      D('349', 2026, '02', 'draft'),        // excluded (deadline already past)
    ];
    const expectedCount = decls.filter(d => isUpcomingDeadline(d, referenceDate)).length;
    expect(countUpcomingDeadlines(decls, referenceDate)).toBe(expectedCount);
    // Sanity: the shared fixture set actually exercises both true and false branches.
    expect(expectedCount).toBe(1);
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

  it('returns { ok: false } when no token', async () => {
    expect((await generate303File({ year: 2026, period: 'T1' })).ok).toBe(false);
  });

  it('returns { ok: false } when no apiBaseUrl', async () => {
    expect((await generate303File({ year: 2026, period: 'T1' }, { token: 'tok' })).ok).toBe(false);
  });

  it('returns { ok: false } on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('err') });
    const result = await generate303File(
      { year: 2026, period: 'T1', result: { kind: 'N' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result.ok).toBe(false);
  });

  it('returns { ok: true } and triggers download on success', async () => {
    const mockBlob = new Blob(['content']);
    globalThis.fetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
    const mockA = { click: vi.fn(), href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockA);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    // tipo=D requires IBAN — pass via identChecks (form state)
    const result = await generate303File(
      { year: 2026, period: 'T1', result: { kind: 'D' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec', identChecks: { bank_iban: 'ES9121000418450200051332' } },
    );
    expect(result.ok).toBe(true);
    expect(mockA.click).toHaveBeenCalled();
  });

  it('returns { ok: false } on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result.ok).toBe(false);
  });

  it('uses N as default tipo when result.kind is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('') });
    await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('tipo=N');
  });

  it('returns { ok: false, error: iban_required } when tipo=U and no IBAN', async () => {
    const result = await generate303File(
      { year: 2026, period: 'T2', result: { kind: 'U' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toEqual({ ok: false, error: 'iban_required' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not gate tipo=I on IBAN (EDID065 fix — I is no longer IBAN-required)', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('') });
    const result = await generate303File(
      { year: 2026, period: 'T2', result: { kind: 'I' } },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result.error).not.toBe('iban_required');
    expect(globalThis.fetch).toHaveBeenCalled();
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

  it('returns { ok: false, error: "no_token" } when no token', async () => {
    const result = await generate349File({ year: 2026, period: 'T1' });
    expect(result).toEqual({ ok: false, error: 'no_token' });
  });

  it('returns { ok: false } on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_500');
  });

  it('returns { ok: true } and triggers download on success', async () => {
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
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, error: "network" } on fetch error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('fail'));
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'http://test/neo/spec' },
    );
    expect(result).toEqual({ ok: false, error: 'network' });
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
