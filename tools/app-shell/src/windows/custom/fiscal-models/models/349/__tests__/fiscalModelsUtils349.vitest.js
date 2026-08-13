import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compute349Operators,
  generate349File,
  checkModified349,
} from '../../../fiscalModelsUtils.js';

describe('compute349Operators', () => {
  it('returns mock data when no token', async () => {
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

  it('calls the correct endpoint when token is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ operators: [], summary: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const decl = { year: 2026, period: 'T1' };
    const result = await compute349Operators(decl, {
      token: 'tok',
      apiBaseUrl: 'https://host/sws/neo/fiscal-models',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/fiscal349/operators?'),
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    );
    expect(result.operators).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('returns null (not mock) when token is present but fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const decl = { year: 2026, period: 'T1' };
    const result = await compute349Operators(decl, {
      token: 'tok',
      apiBaseUrl: 'https://host/sws/neo/fiscal-models',
    });
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('generate349File', () => {
  it('returns false when no token', async () => {
    const result = await generate349File({ year: 2026, period: 'T1' });
    expect(result).toBe(false);
  });

  it('returns false when fetch returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(false);
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
      { token: 'tok', apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/fiscal349/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: expect.stringContaining('year=2026'),
      }),
    );
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe('checkModified349', () => {
  it('returns false when no token', async () => {
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
      { token: 'tok', apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
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
      { token: 'tok', apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0,
      { token: 'tok', apiBaseUrl: 'https://host/sws/neo/fiscal-models' },
    );
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });
});
