// ETP-5424 — a server-side export streams the whole filtered list and can legitimately outlive
// apiFetch's default timeout, so the export GET opts out with `timeout: 0`, with or without an
// explicit `baseUrl`. The real client performs the request; only its options are recorded
// (see `@/test/recordApiFetch.js`).
import { renderHook } from '@testing-library/react';

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCalls, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import { useCsvExport } from '../useCsvExport';

describe('useCsvExport — timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['csv'])) }));
    URL.createObjectURL = vi.fn(() => 'blob:url');
    URL.revokeObjectURL = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = vi.fn();
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes timeout: 0 on the export request', async () => {
    const { result } = renderHook(() => useCsvExport());
    await result.current({ path: '/sws/neo/bank-statements', params: { action: 'lines' }, filename: 'lines' });

    expect(apiFetchCalls).toHaveLength(1);
    expect(apiFetchCalls[0].options.timeout).toBe(0);
  });

  it('keeps timeout: 0 alongside an explicit baseUrl (and still forwards the baseUrl)', async () => {
    const { result } = renderHook(() => useCsvExport());
    await result.current({ baseUrl: '/sws/neo/contacts', path: '/businessPartner', filename: 'contacts', format: 'xlsx' });

    expect(apiFetchCalls).toHaveLength(1);
    expect(apiFetchCalls[0].options.baseUrl).toBe('/sws/neo/contacts');
    expect(apiFetchCalls[0].options.timeout).toBe(0);
  });
});
