// @covers tools/app-shell/src/components/reports/dynamic/useReportQuery.js
import { act, renderHook } from '@testing-library/react';
import { NetworkError } from '@etendosoftware/app-shell-core/auth';

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

import { useReportQuery, isQueryReady, QUERY_DEBOUNCE_MS } from '../useReportQuery.js';

const READY = { orgId: 'O1', acctSchemaId: 'S1', dateFrom: '2026-01-01', dateTo: '2026-12-31' };
const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: () => Promise.resolve(body) });

/** A request that settles when the test says so, and rejects like fetch when its signal aborts. */
function deferredRequest() {
  let resolve;
  apiFetchMock.mockImplementationOnce((url, init) => new Promise((res, rej) => {
    resolve = res;
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  return (value) => act(async () => { resolve(value); });
}

const flushDebounce = () => act(async () => { vi.advanceTimersByTime(QUERY_DEBOUNCE_MS); });
const render = (params, opts) => renderHook(({ p }) => useReportQuery('profit-loss', p, { locale: 'es_ES', ...opts }), { initialProps: { p: params } });

beforeEach(() => {
  vi.useFakeTimers();
  apiFetchMock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('isQueryReady', () => {
  it('needs org, schema and both dates', () => {
    expect(isQueryReady(READY)).toBe(true);
    for (const name of Object.keys(READY)) {
      expect(isQueryReady({ ...READY, [name]: '' })).toBe(false);
      expect(isQueryReady({ ...READY, [name]: undefined })).toBe(false);
    }
    expect(isQueryReady(null)).toBe(false);
  });
});

describe('useReportQuery', () => {
  it('sends nothing until the required params have resolved', async () => {
    const { rerender } = render({ ...READY, acctSchemaId: '' });
    await flushDebounce();
    expect(apiFetchMock).not.toHaveBeenCalled();

    apiFetchMock.mockResolvedValue(json({ kind: 'tree', rows: [] }));
    rerender({ p: READY });
    await flushDebounce();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('POSTs the params and locale to the report query route, after the debounce', async () => {
    apiFetchMock.mockResolvedValue(json({ kind: 'tree', rows: [{ node_id: 'A' }] }));
    const { result } = render(READY);
    expect(result.current.loading).toBe(true);
    await act(async () => { vi.advanceTimersByTime(QUERY_DEBOUNCE_MS - 1); });
    expect(apiFetchMock).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });

    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/reports/profit-loss/query');
    expect(init).toMatchObject({ method: 'POST', baseUrl: '' });
    expect(JSON.parse(init.body)).toEqual({ params: READY, locale: 'es_ES' });
    expect(result.current).toMatchObject({ data: { rows: [{ node_id: 'A' }] }, loading: false, error: null });
  });

  it('debounceMs: 0 (a drill-down click) sends on the next tick, not after the filter wait', async () => {
    apiFetchMock.mockResolvedValue(json({ kind: 'rows', rows: [] }));
    render(READY, { debounceMs: 0 });
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('a burst of changes sends one request, with the last params', async () => {
    apiFetchMock.mockResolvedValue(json({ rows: [] }));
    const { rerender } = render(READY);
    rerender({ p: { ...READY, bPartnerId: 'B1' } });
    rerender({ p: { ...READY, bPartnerId: 'B2' } });
    await flushDebounce();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body).params.bPartnerId).toBe('B2');
  });

  it('a new object with the same values sends no new request', async () => {
    apiFetchMock.mockResolvedValue(json({ rows: [] }));
    const { rerender } = render(READY);
    await flushDebounce();
    rerender({ p: { ...READY } });
    await flushDebounce();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('an older answer never overwrites a newer one, and its abort is not an error', async () => {
    const settleOld = deferredRequest();
    const { result, rerender } = render(READY);
    await flushDebounce();

    apiFetchMock.mockResolvedValueOnce(json({ rows: [{ node_id: 'NEW' }] }));
    rerender({ p: { ...READY, productId: 'P1' } });
    await flushDebounce();
    await settleOld(json({ rows: [{ node_id: 'OLD' }] }));

    expect(apiFetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ data: { rows: [{ node_id: 'NEW' }] }, error: null, errorCode: null });
  });

  it('keeps the last good result while the next one loads', async () => {
    apiFetchMock.mockResolvedValueOnce(json({ rows: [{ node_id: 'FIRST' }] }));
    const { result, rerender } = render(READY);
    await flushDebounce();

    deferredRequest();
    rerender({ p: { ...READY, productId: 'P1' } });
    await flushDebounce();
    expect(result.current).toMatchObject({ loading: true, data: { rows: [{ node_id: 'FIRST' }] } });
  });

  it('an HTTP error keeps the data and reports the server code as the class', async () => {
    apiFetchMock.mockResolvedValueOnce(json({ rows: [{ node_id: 'FIRST' }] }));
    const { result, rerender } = render(READY);
    await flushDebounce();

    apiFetchMock.mockResolvedValueOnce(json({ error: 'ORG_ACCESS_DENIED', code: 'ORG_ACCESS_DENIED' }, { ok: false, status: 403 }));
    rerender({ p: { ...READY, orgId: 'O2' } });
    await flushDebounce();
    expect(result.current).toMatchObject({
      loading: false, errorCode: 'org_access_denied', error: 'ORG_ACCESS_DENIED', data: { rows: [{ node_id: 'FIRST' }] },
    });
  });

  it('an error body without a code is classed by status', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.reject(new Error('not json')) });
    const { result } = render(READY);
    await flushDebounce();
    expect(result.current).toMatchObject({ errorCode: 'http_502', error: 'HTTP 502' });
  });

  it('a network failure shows its own (translated) message, class network', async () => {
    const err = new NetworkError({ reason: 'offline' });
    apiFetchMock.mockRejectedValueOnce(err);
    const { result } = render(READY);
    await flushDebounce();
    expect(result.current).toMatchObject({ loading: false, errorCode: 'network', error: err.message });
  });

  it('becoming not ready (or disabled) cancels the pending request and stops loading', async () => {
    deferredRequest();
    const { result, rerender } = render(READY);
    await flushDebounce();
    rerender({ p: { ...READY, dateTo: '' } });
    expect(apiFetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('enabled: false sends nothing', async () => {
    renderHook(() => useReportQuery('profit-loss', READY, { enabled: false }));
    await flushDebounce();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
