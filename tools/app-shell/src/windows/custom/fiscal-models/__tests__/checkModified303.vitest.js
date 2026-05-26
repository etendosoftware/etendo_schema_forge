import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkModified303 } from '../fiscalModelsUtils.js';

const DECL = { id: '303-2026-T2', model: '303', year: 2026, period: 'T2' };
const OPTS  = { token: 'tok', apiBaseUrl: 'http://host/neo/fiscal-models' };

describe('checkModified303', () => {
  beforeEach(() => { vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns false when token is absent', async () => {
    const result = await checkModified303(DECL, 0, {});
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns false when fetch throws', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await checkModified303(DECL, 1000, OPTS);
    expect(result).toBe(false);
  });

  it('returns false when API returns modified: false', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ modified: false, count: 0 }),
    });
    const result = await checkModified303(DECL, 1000, OPTS);
    expect(result).toBe(false);
  });

  it('returns true when API returns modified: true', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ modified: true, count: 3 }),
    });
    const result = await checkModified303(DECL, 1000, OPTS);
    expect(result).toBe(true);
  });

  it('builds correct URL with since param', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ modified: false }) });
    await checkModified303(DECL, 1748000000000, OPTS);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('/fiscal303/modified');
    expect(url).toContain('year=2026');
    expect(url).toContain('period=T2');
    expect(url).toContain('since=1748000000000');
  });
});
