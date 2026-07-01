// Vitest tests for async functions in fiscalModelsUtils.js
// Covers: computeBoxes303, compute349Operators, generate349File, checkModified303, checkModified349
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeBoxes303,
  compute349Operators,
  generate349File,
  checkModified303,
  checkModified349,
} from '../fiscalModelsUtils.js';

const TOKEN = 'test-token';
const API_BASE = 'http://host/neo/fiscal-models';
const DECL = { year: 2026, period: 'T2' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── computeBoxes303 ─────────────────────────────────────────────────────────

describe('computeBoxes303', () => {
  it('returns API response when token and apiBaseUrl are provided and fetch succeeds', async () => {
    const expected = { boxes: { 7: 100 }, summary: { accrued: 100, deductible: 0, result: 100 } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    }));
    const result = await computeBoxes303(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toEqual(expected);
  });

  it('sends correct URL params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await computeBoxes303(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    const url = vi.mocked(fetch).mock.calls[0][0];
    expect(url).toContain('year=2026');
    expect(url).toContain('period=T2');
  });

  it('sends Authorization header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await computeBoxes303(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(vi.mocked(fetch).mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('falls back to mock when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await computeBoxes303(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    // Mock data for 2026 T2 returns boxes with known values
    expect(result).toBeTruthy();
    expect(result.boxes).toBeTruthy();
  }, 10000);

  it('falls back to mock when no token provided', async () => {
    const result = await computeBoxes303({ year: 2026, period: 'T2' });
    expect(result).toBeTruthy();
    expect(result.boxes[7]).toBe(6162.60);
  }, 10000);

  it('returns null for unknown period in mock mode', async () => {
    const result = await computeBoxes303({ year: 2020, period: 'T1' });
    expect(result).toBeNull();
  }, 10000);

  it('returns mock data for 2026 T1', async () => {
    const result = await computeBoxes303({ year: 2026, period: 'T1' });
    expect(result.boxes[7]).toBe(3248);
    expect(result.summary.result).toBe(-2816.31);
  }, 10000);
});

// ── compute349Operators ─────────────────────────────────────────────────────

describe('compute349Operators', () => {
  it('returns API response when token and apiBaseUrl are provided', async () => {
    const expected = { operators: [{ nif: 'IT123' }], summary: {} };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    }));
    const result = await compute349Operators(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toEqual(expected);
  });

  it('returns null when API fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await compute349Operators(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await compute349Operators(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toBeNull();
  });

  it('returns mock data for 2026 T2 in demo mode', async () => {
    const result = await compute349Operators({ year: 2026, period: 'T2' });
    expect(result).toBeTruthy();
    expect(result.operators.length).toBeGreaterThan(0);
  }, 10000);

  it('returns null for unknown period in demo mode', async () => {
    const result = await compute349Operators({ year: 2020, period: 'T3' });
    expect(result).toBeNull();
  }, 10000);
});

// ── generate349File ─────────────────────────────────────────────────────────

describe('generate349File', () => {
  function mockFetchOk(blob = new Blob(['data'])) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    return anchor;
  }

  it('returns false when token is missing', async () => {
    expect(await generate349File(DECL, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when apiBaseUrl is missing', async () => {
    expect(await generate349File(DECL, { token: TOKEN })).toBe(false);
  });

  it('returns true and triggers download on success', async () => {
    const anchor = mockFetchOk();
    const result = await generate349File(DECL, { token: TOKEN, apiBaseUrl: API_BASE });
    expect(result).toBe(true);
    expect(anchor.download).toBe('349_T2_2026.349');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('sends phone and contact params when provided', async () => {
    mockFetchOk();
    await generate349File(DECL, { token: TOKEN, apiBaseUrl: API_BASE, phone: '123', contact: 'John' });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.body).toContain('phone=123');
    expect(opts.body).toContain('contact=John');
  });

  it('returns false when fetch responds not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await generate349File(DECL, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await generate349File(DECL, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });
});

// ── checkModified303 ────────────────────────────────────────────────────────

describe('checkModified303', () => {
  it('returns false when token is missing', async () => {
    expect(await checkModified303(DECL, 0, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when apiBaseUrl is missing', async () => {
    expect(await checkModified303(DECL, 0, { token: TOKEN })).toBe(false);
  });

  it('returns true when API says modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: true }),
    }));
    expect(await checkModified303(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(true);
  });

  it('returns false when API says not modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: false }),
    }));
    expect(await checkModified303(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await checkModified303(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await checkModified303(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });
});

// ── checkModified349 ────────────────────────────────────────────────────────

describe('checkModified349', () => {
  it('returns false when token is missing', async () => {
    expect(await checkModified349(DECL, 0, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns true when API says modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: true }),
    }));
    expect(await checkModified349(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(true);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await checkModified349(DECL, 1000, { token: TOKEN, apiBaseUrl: API_BASE })).toBe(false);
  });
});
