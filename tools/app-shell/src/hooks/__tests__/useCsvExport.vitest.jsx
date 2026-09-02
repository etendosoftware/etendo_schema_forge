import { renderHook } from '@testing-library/react';

// useApiFetch resolves its token from the ambient session, not from a mocked
// AuthContext (see its own doc comment) — mirror it here so migrated call
// sites keep sending the token this suite asserts on. `mockApiFetch` stays a
// single stable reference (not rebuilt per render), matching the real hook's
// own memoization. Pattern copied from useMovementLookups.vitest.jsx.
//
// The per-call `baseUrl` override wins over the configured base, exactly as
// `createApiFetch` resolves it — otherwise this mock would report a passing
// export for a URL the real helper builds differently.
const mockApiFetch = (path, options = {}) => globalThis.fetch(`${options.baseUrl ?? 'https://base'}${path}`, {
  headers: { Authorization: 'Bearer tok-123', 'Accept-Language': 'es_ES', ...options.headers },
  credentials: 'include',
});

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { useCsvExport } from '../useCsvExport';

describe('useCsvExport', () => {
  let fetchMock;
  let clickMock;
  let lastAnchor;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['csv'])) }),
    );
    global.fetch = fetchMock;
    global.URL.createObjectURL = vi.fn(() => 'blob:url');
    global.URL.revokeObjectURL = vi.fn();
    clickMock = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = clickMock;
        lastAnchor = el;
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an authenticated GET with export=csv and the given params, then downloads the blob', async () => {
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      path: '/sws/neo/bank-statements',
      params: { action: 'lines', statementIds: 's1,s2', columns: 'lineNo:Line No.' },
      filename: 'lines',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/sws/neo/bank-statements?');
    expect(url).toContain('export=csv');
    expect(url).toContain('action=lines');
    expect(url).toContain('statementIds=s1%2Cs2');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
    expect(lastAnchor.download).toBe('lines.csv');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  // ETP-4997 — a window-scoped caller holds an apiBaseUrl that already includes the window
  // segment (`/sws/neo/contacts`); resolving its entity against the page-derived base instead
  // would silently request the wrong URL.
  it('resolves the path against an explicit baseUrl when one is given', async () => {
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      baseUrl: '/sws/neo/contacts',
      path: '/businessPartner?_sortBy=name',
      filename: 'contacts-export.csv',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/sws/neo/contacts/businessPartner?');
    expect(url).toContain('export=csv');
  });

  // ETP-4997 — when the backend declines to export it answers 200 with its normal JSON envelope,
  // which used to be saved verbatim under the .csv name; the user only found out when the import
  // rejected the file.
  it('refuses to download a response that is not a CSV', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json;charset=UTF-8' }),
      blob: () => Promise.resolve(new Blob(['{"response":{"data":[]}}'])),
    });
    const { result } = renderHook(() => useCsvExport());

    await expect(result.current({ path: '/sws/neo/contacts/businessPartner' })).rejects.toThrow(/CSV/);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('downloads when the response really is a CSV', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'Content-Type': 'text/csv; charset=UTF-8' }),
      blob: () => Promise.resolve(new Blob(['a,b'])),
    });
    const { result } = renderHook(() => useCsvExport());

    await result.current({ path: '/sws/neo/contacts/businessPartner', filename: 'contacts-export.csv' });

    expect(lastAnchor.download).toBe('contacts-export.csv');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  // ── format: xlsx (ETP-4997) ───────────────────────────────────────────────

  it('asks the server for xlsx and names the download .xlsx', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      blob: () => Promise.resolve(new Blob(['PK'])),
    });
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      path: '/sws/neo/contacts/businessPartner',
      filename: 'contacts-export.csv',
      format: 'xlsx',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('export=xlsx');
    // The caller passes ONE filename for both formats because the format is picked at click
    // time; a `.csv` name on a workbook gives the user a file Excel refuses to open.
    expect(lastAnchor.download).toBe('contacts-export.xlsx');
  });

  it('rejects a CSV response when xlsx was requested', async () => {
    // The backend declines an export it cannot serialize and writes JSON with a 200. The guard
    // has to be per-format, or an xlsx request that silently fell back would download as .xlsx.
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      blob: () => Promise.resolve(new Blob(['{}'])),
    });
    const { result } = renderHook(() => useCsvExport());

    await expect(result.current({ path: '/x', format: 'xlsx' })).rejects.toThrow(/expected a XLSX response/);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('rejects an xlsx response when csv was requested', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      blob: () => Promise.resolve(new Blob(['PK'])),
    });
    const { result } = renderHook(() => useCsvExport());

    await expect(result.current({ path: '/x' })).rejects.toThrow(/expected a CSV response/);
  });

  it('refuses a format it has no wire contract for', async () => {
    const { result } = renderHook(() => useCsvExport());
    await expect(result.current({ path: '/x', format: 'ods' })).rejects.toThrow(/unsupported export format: ods/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips empty params and keeps a .csv filename as-is', async () => {
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      path: '/sws/neo/bank-statements',
      params: { FIN_Financial_Account_ID: 'acc-1', ids: '', columns: undefined },
      filename: 'statements.csv',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('FIN_Financial_Account_ID=acc-1');
    expect(url).not.toContain('ids=');
    expect(url).not.toContain('columns=');
    expect(lastAnchor.download).toBe('statements.csv');
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(() => useCsvExport());

    await expect(result.current({ path: '/x' })).rejects.toThrow('HTTP 500');
  });
});
