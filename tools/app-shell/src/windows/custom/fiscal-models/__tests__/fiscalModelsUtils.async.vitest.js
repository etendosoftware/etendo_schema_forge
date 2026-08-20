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
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
} from '@/test/sessionContract.js';

// ETP-4576: the credential is no longer a caller argument — it comes from the
// active session scheme, published by AuthProvider and read at request time.
// Every test below therefore declares a scheme instead of passing a token.
beforeEach(() => { declareBearerSession(); });

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
    const result = await computeBoxes303(DECL, { apiBaseUrl: API_BASE });
    expect(result).toEqual(expected);
  });

  it('sends correct URL params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await computeBoxes303(DECL, { apiBaseUrl: API_BASE });
    const url = vi.mocked(fetch).mock.calls[0][0];
    expect(url).toContain('year=2026');
    expect(url).toContain('period=T2');
  });

  it('sends the bearer token under the bearer scheme', async () => {
    declareBearerSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await computeBoxes303(DECL, { apiBaseUrl: API_BASE });
    const headers = vi.mocked(fetch).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(`Bearer ${TEST_BEARER_TOKEN}`);
  });

  // The cookie scheme's whole point: the credential travels in the `__Host-`
  // cookie, so no Authorization header at all. This is a GET, so it also carries
  // no CSRF proof — a proof on a safe method would be a bug in the other
  // direction. `credentials: 'include'` is what makes the cookie reach a
  // cross-origin backend (dev :3100 -> :8080), so it must be set.
  it('sends no Authorization header under the cookie scheme, and no CSRF proof on a GET', async () => {
    declareCookieSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await computeBoxes303(DECL, { apiBaseUrl: API_BASE });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers).not.toHaveProperty('X-Go-CSRF');
    expect(init.credentials).toBe('include');
  });

  it('falls back to mock when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await computeBoxes303(DECL, { apiBaseUrl: API_BASE });
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
    const result = await compute349Operators(DECL, { apiBaseUrl: API_BASE });
    expect(result).toEqual(expected);
  });

  it('returns null when API fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await compute349Operators(DECL, { apiBaseUrl: API_BASE });
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await compute349Operators(DECL, { apiBaseUrl: API_BASE });
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

  // Contract changed from a raw boolean to { ok, error, serverMessage? } — same
  // shape as generate303File — see ETP-4755 QA fix (banner surfacing AEAT349
  // backend validation errors, e.g. Substitutive/Navarra/Guipuzcoa combinations).
  // ETP-4576: a missing credential is no longer a caller-side error. There is
  // nothing for the caller to omit — the scheme supplies it — so the only
  // remaining precondition is the base URL, and the error code says so.
  it('returns { ok: false, error: "no_base_url" } when apiBaseUrl is missing', async () => {
    const result = await generate349File(DECL, {});
    expect(result).toEqual({ ok: false, error: 'no_base_url' });
  });

  // The trap this endpoint sets for the migration: it posts
  // `application/x-www-form-urlencoded`, so the CSRF proof has to be merged INTO
  // the existing headers, not replace them. A call site that spread the builder
  // over the Content-Type instead of under it would silently send JSON and the
  // backend would reject the body — with the bearer scheme still green, because
  // the bearer builder sets no Content-Type of its own.
  it('adds the CSRF proof to the POST without clobbering the form-urlencoded Content-Type', async () => {
    declareCookieSession();
    mockFetchOk();
    const result = await generate349File(DECL, { apiBaseUrl: API_BASE });

    expect(result).toEqual({ ok: true });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.headers['X-Go-CSRF']).toBe(TEST_CSRF_TOKEN);
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.credentials).toBe('include');
  });

  it('proceeds with the request when only apiBaseUrl is given, taking the credential from the scheme', async () => {
    const anchor = mockFetchOk();
    const result = await generate349File(DECL, { apiBaseUrl: API_BASE });
    expect(result).toEqual({ ok: true });
    expect(anchor.download).toBe('349_T2_2026.txt');
    expect(vi.mocked(fetch).mock.calls[0][1].headers.Authorization)
      .toBe(`Bearer ${TEST_BEARER_TOKEN}`);
  });

  it('returns { ok: true } and triggers download on success', async () => {
    const anchor = mockFetchOk();
    const result = await generate349File(DECL, { apiBaseUrl: API_BASE });
    expect(result).toEqual({ ok: true });
    expect(anchor.download).toBe('349_T2_2026.txt');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('sends phone and contact params when provided', async () => {
    mockFetchOk();
    await generate349File(DECL, { apiBaseUrl: API_BASE, phone: '123', contact: 'John' });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.body).toContain('phone=123');
    expect(opts.body).toContain('contact=John');
  });

  it('returns { ok: false, error: "http_<status>" } when fetch responds not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }));
    const result = await generate349File(DECL, { apiBaseUrl: API_BASE });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_500');
  });

  it('returns { ok: false, error: "network" } when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await generate349File(DECL, { apiBaseUrl: API_BASE });
    expect(result).toEqual({ ok: false, error: 'network' });
  });
});

// ── checkModified303 ────────────────────────────────────────────────────────

describe('checkModified303', () => {
  it('returns false when apiBaseUrl is missing, without issuing a request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await checkModified303(DECL, 0, {})).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns true when API says modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: true }),
    }));
    expect(await checkModified303(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(true);
  });

  it('returns false when API says not modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: false }),
    }));
    expect(await checkModified303(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await checkModified303(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await checkModified303(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(false);
  });
});

// ── checkModified349 ────────────────────────────────────────────────────────

describe('checkModified349', () => {
  it('returns false when apiBaseUrl is missing, without issuing a request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await checkModified349(DECL, 0, {})).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns true when API says modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modified: true }),
    }));
    expect(await checkModified349(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(true);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await checkModified349(DECL, 1000, { apiBaseUrl: API_BASE })).toBe(false);
  });
});
