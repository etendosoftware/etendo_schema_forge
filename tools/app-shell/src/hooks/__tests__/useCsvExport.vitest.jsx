import { renderHook } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'tok-123' }),
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
