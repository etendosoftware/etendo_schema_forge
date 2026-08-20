import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compute349Operators,
  generate349File,
  checkModified349,
} from '../../../fiscalModelsUtils.js';
import {
  TEST_BEARER_TOKEN,
  declareBearerSession,
} from '@/test/sessionContract.js';

// ETP-4576: the credential is not a caller argument any more — it comes from the
// active session scheme. The gate that remains is `apiBaseUrl`.
beforeEach(() => { declareBearerSession(); });

describe('compute349Operators', () => {
  it('returns mock data when no apiBaseUrl is given', async () => {
    const decl = { year: 2026, period: 'T1' };
    const result = await compute349Operators(decl);
    expect(result).not.toBeNull();
    expect(result.operators).toBeInstanceOf(Array);
    expect(result.operators.length).toBeGreaterThan(0);
    expect(result.summary).toBeDefined();
  });

  it('each mock operator has required fields', async () => {
    const decl = { year: 2026, period: 'T2' };
    const result = await compute349Operators(decl);
    expect(result).not.toBeNull();
    for (const op of result.operators) {
      expect(op).toHaveProperty('nif');
      expect(op).toHaveProperty('name');
      expect(op).toHaveProperty('key');
      expect(op).toHaveProperty('base');
      expect(['E', 'S', 'A', 'I']).toContain(op.key);
    }
  });

  it('returns null for unknown mock period', async () => {
    const decl = { year: 2099, period: 'T4' };
    const result = await compute349Operators(decl);
    expect(result).toBeNull();
  });

  it('calls the correct endpoint when apiBaseUrl is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ operators: [], summary: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const decl = { year: 2026, period: 'T1' };
    const result = await compute349Operators(decl, {
      apiBaseUrl: 'https://host/sws/neo/fiscal-models',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/fiscal349/operators?'),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER_TOKEN}` },
        credentials: 'include',
      }),
    );
    expect(result.operators).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('returns null (not mock) when a base URL is given but fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const decl = { year: 2026, period: 'T1' };
    const result = await compute349Operators(decl, {
      apiBaseUrl: 'https://host/sws/neo/fiscal-models',
    });
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('generate349File', () => {
  // Contract changed from a raw boolean to { ok, error, serverMessage? } — same
  // shape as generate303File — so QA-flagged backend validation errors (e.g.
  // AEAT3492010Report rejecting Substitutive/Navarra/Guipuzcoa combinations) can
  // be surfaced to the user instead of just logged.
  it('returns { ok: false, error: "no_base_url" } when no apiBaseUrl', async () => {
    const result = await generate349File({ year: 2026, period: 'T1' });
    expect(result).toEqual({ ok: false, error: 'no_base_url' });
  });

  it('returns { ok: false } with the http error code when fetch returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }));
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_500');
    vi.unstubAllGlobals();
  });

  it('surfaces the backend serverMessage (e.g. AEAT3492010Report validation error) on non-ok response', async () => {
    const raw = JSON.stringify({ error: { message: 'com.foo.SomeException: @AEAT349_FormerStatement_Required@' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => raw }));
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models', substitutive: true },
    );
    expect(result).toEqual({ ok: false, error: 'http_400', serverMessage: 'AEAT349_FormerStatement_Required' });
    vi.unstubAllGlobals();
  });

  it('calls correct endpoint with year and period', async () => {
    const mockBlob = new Blob(['test'], { type: 'text/plain' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => mockBlob }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: clickSpy });

    await generate349File(
      { year: 2026, period: 'T1' },
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/fiscal349/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` }),
        body: expect.stringContaining('year=2026'),
      }),
    );
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── AEAT-parity params (ETP-4755): fileName, substitutive, formerStatement,
  // representativeTaxId, navarra, guipuzcoa mirror the classic OBTL_Tax_Report_Parameter
  // rows for Modelo 349. substitutive/navarra/guipuzcoa are checkbox params the backend
  // requires unconditionally (AEAT3492010Report.generateLine1 NPEs on a missing key), so
  // they must ALWAYS be sent as 'Y'/'N' — unlike the free-text fields, which are only sent
  // when non-empty.
  describe('AEAT-parity params', () => {
    function setupFetchSpy() {
      const mockBlob = new Blob(['test'], { type: 'text/plain' });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => mockBlob });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
      vi.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: vi.fn() });
      return fetchMock;
    }

    function teardownFetchSpy() {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }

    it('old call signature (only phone/contact, new params omitted): omits fileName/formerStatement/representativeTaxId but still sends substitutive=N, navarra=N, guipuzcoa=N', async () => {
      const fetchMock = setupFetchSpy();

      await generate349File(
        { year: 2026, period: 'T1' },
        { apiBaseUrl: 'https://host/sws/neo/fiscal-models', phone: '600111222', contact: 'Ana' },
      );

      const body = fetchMock.mock.calls[0][1].body;
      expect(body).toContain('phone=600111222');
      expect(body).toContain('contact=Ana');
      expect(body).toContain('substitutive=N');
      expect(body).toContain('navarra=N');
      expect(body).toContain('guipuzcoa=N');
      expect(body).not.toContain('fileName=');
      expect(body).not.toContain('formerStatement=');
      expect(body).not.toContain('representativeTaxId=');

      teardownFetchSpy();
    });

    it('full payload: every field lands in the body with the right key names and Y/N encoding', async () => {
      const fetchMock = setupFetchSpy();

      await generate349File(
        { year: 2026, period: 'T2' },
        {
          apiBaseUrl: 'https://host/sws/neo/fiscal-models',
          phone: '600111222', contact: 'Ana Garcia',
          fileName: 'my_349_file', substitutive: true,
          formerStatement: '1234567890123', representativeTaxId: 'X1234567L',
          navarra: true, guipuzcoa: true,
        },
      );

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(body.get('year')).toBe('2026');
      expect(body.get('period')).toBe('T2');
      expect(body.get('phone')).toBe('600111222');
      expect(body.get('contact')).toBe('Ana Garcia');
      expect(body.get('fileName')).toBe('my_349_file');
      expect(body.get('substitutive')).toBe('Y');
      expect(body.get('formerStatement')).toBe('1234567890123');
      expect(body.get('representativeTaxId')).toBe('X1234567L');
      expect(body.get('navarra')).toBe('Y');
      expect(body.get('guipuzcoa')).toBe('Y');

      teardownFetchSpy();
    });

    it('substitutive/navarra/guipuzcoa all false still send explicit N values (never omitted)', async () => {
      const fetchMock = setupFetchSpy();

      await generate349File(
        { year: 2026, period: 'T1' },
        {
          apiBaseUrl: 'https://host/sws/neo/fiscal-models',
          substitutive: false, navarra: false, guipuzcoa: false,
        },
      );

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(body.get('substitutive')).toBe('N');
      expect(body.get('navarra')).toBe('N');
      expect(body.get('guipuzcoa')).toBe('N');

      teardownFetchSpy();
    });

    it('empty-string fileName/formerStatement/representativeTaxId are omitted, not sent as empty', async () => {
      const fetchMock = setupFetchSpy();

      await generate349File(
        { year: 2026, period: 'T1' },
        {
          apiBaseUrl: 'https://host/sws/neo/fiscal-models',
          fileName: '', formerStatement: '', representativeTaxId: '',
        },
      );

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(body.has('fileName')).toBe(false);
      expect(body.has('formerStatement')).toBe(false);
      expect(body.has('representativeTaxId')).toBe(false);
      // Checkbox params remain unconditional even with an otherwise-empty payload.
      expect(body.get('substitutive')).toBe('N');
      expect(body.get('navarra')).toBe('N');
      expect(body.get('guipuzcoa')).toBe('N');

      teardownFetchSpy();
    });
  });
});

describe('checkModified349', () => {
  it('returns false when no apiBaseUrl', async () => {
    const result = await checkModified349({ year: 2026, period: 'T1' }, Date.now());
    expect(result).toBe(false);
  });

  it('returns true when backend says modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ modified: true, count: 3 }),
    }));
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0,
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns false when backend says not modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ modified: false, count: 0 }),
    }));
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0,
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0,
      { apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });
});
