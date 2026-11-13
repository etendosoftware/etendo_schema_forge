// @covers artifacts/remittance/custom/remittanceDueItemsApi.js
//
// The remittance «Seleccionar desde factura» client and the lines total. Vitest rather than the
// Node runner: the module imports `@/lib/backendErrors.js`, which plain `node --test` cannot
// resolve. `apiFetch` is the injected boundary (docs/request-policy.md), so it is a plain mock.
import {
  DUE_ITEMS_PAGE_SIZE,
  FIRST_PAGE,
  dueItemsErrorMessage,
  fetchDueItemsPage,
  fetchLinesTotal,
  syncDueItems,
} from '@generated/remittance/custom/remittanceDueItemsApi.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function brokenJsonResponse({ ok = false, status = 500 } = {}) {
  return { ok, status, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } };
}

const bodyOf = (apiFetch, call = 0) => JSON.parse(apiFetch.mock.calls[call][1].body);

describe('fetchDueItemsPage', () => {
  it('posts to availableDueItems with a 1-based first page and the page size of 20', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { items: [], total: 0 } } }));
    await fetchDueItemsPage(apiFetch, 'rem/1');
    expect(FIRST_PAGE).toBe(1);
    expect(DUE_ITEMS_PAGE_SIZE).toBe(20);
    expect(apiFetch).toHaveBeenCalledWith('/remittance/rem%2F1/action/availableDueItems', expect.objectContaining({ method: 'POST' }));
    expect(bodyOf(apiFetch)).toEqual({ search: '', page: 1, pageSize: 20 });
  });

  it('forwards the search text, page and page size it is given', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { items: [], total: 0 } } }));
    await fetchDueItemsPage(apiFetch, 'rem-1', { search: 'acme', page: 3, pageSize: 5 });
    expect(bodyOf(apiFetch)).toEqual({ search: 'acme', page: 3, pageSize: 5 });
  });

  it('reads the items and total out of the NEO `response.data` envelope', async () => {
    const items = [{ id: 'psd-1', documentNo: 'FAC-1' }];
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { items, total: 7 } } }));
    expect(await fetchDueItemsPage(apiFetch, 'rem-1')).toEqual({ items, total: 7 });
  });

  it('reads an envelope with no `response` wrapper (plain `data`)', async () => {
    const items = [{ id: 'psd-2' }];
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ data: { items, total: '3' } }));
    expect(await fetchDueItemsPage(apiFetch, 'rem-1')).toEqual({ items, total: 3 });
  });

  it('accepts a bare payload with no envelope at all', async () => {
    const items = [{ id: 'psd-3' }];
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ items, total: 1 }));
    expect(await fetchDueItemsPage(apiFetch, 'rem-1')).toEqual({ items, total: 1 });
  });

  it('treats an array payload as the items, with an unknown total', async () => {
    const items = [{ id: 'psd-4' }];
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: items } }));
    expect(await fetchDueItemsPage(apiFetch, 'rem-1')).toEqual({ items, total: null });
  });

  it('reports an unknown total (null) when the payload has none or a non-numeric one', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: { data: { items: [] } } }))
      .mockResolvedValueOnce(jsonResponse({ response: { data: { items: [], total: 'many' } } }));
    expect((await fetchDueItemsPage(apiFetch, 'rem-1')).total).toBeNull();
    expect((await fetchDueItemsPage(apiFetch, 'rem-1')).total).toBeNull();
  });

  it('rejects with the status and the parsed body when the backend refuses', async () => {
    const body = { error: { message: 'nope', messageKeys: ['ETGO_RemittanceTypeOrAccountMissing'] } };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(body, { ok: false, status: 422 }));
    await expect(fetchDueItemsPage(apiFetch, 'rem-1')).rejects.toMatchObject({ status: 422, body });
  });

  it('rejects with a null body when the refusal carries no JSON', async () => {
    const apiFetch = vi.fn().mockResolvedValue(brokenJsonResponse({ status: 502 }));
    await expect(fetchDueItemsPage(apiFetch, 'rem-1')).rejects.toMatchObject({ status: 502, body: null });
  });
});

describe('syncDueItems', () => {
  it('posts the new/changed dues and the removals in one call', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { created: 1, updated: 1, removed: 1 } } }));
    await syncDueItems(apiFetch, 'rem/1', { items: [{ id: 'psd-1', amount: 50 }, { id: 'psd-2', amount: 12.5 }], remove: ['psd-3'] });
    expect(apiFetch).toHaveBeenCalledWith('/remittance/rem%2F1/action/syncDueItems', expect.objectContaining({ method: 'POST' }));
    expect(bodyOf(apiFetch)).toEqual({ items: [{ id: 'psd-1', amount: 50 }, { id: 'psd-2', amount: 12.5 }], remove: ['psd-3'] });
  });

  it('always sends both arrays, empty when not given', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: {} } }));
    await syncDueItems(apiFetch, 'rem-1');
    expect(bodyOf(apiFetch)).toEqual({ items: [], remove: [] });
    await syncDueItems(apiFetch, 'rem-1', { remove: ['x'] });
    expect(bodyOf(apiFetch, 1)).toEqual({ items: [], remove: ['x'] });
  });

  it('parses the three counts and the message from the `response.data` envelope', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { created: 2, updated: '1', removed: 3, message: 'ok' } } }));
    expect(await syncDueItems(apiFetch, 'rem-1', { items: [] })).toEqual({ created: 2, updated: 1, removed: 3, message: 'ok' });
  });

  it('reads a plain `data` envelope too', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ data: { created: 1 } }));
    expect(await syncDueItems(apiFetch, 'rem-1', { items: [] })).toEqual({ created: 1, updated: 0, removed: 0, message: null });
  });

  it('counts a missing or non-numeric count as 0', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: { created: 'n/a', updated: null } } }));
    expect(await syncDueItems(apiFetch, 'rem-1', { items: [{ id: 'a', amount: 1 }] })).toEqual({ created: 0, updated: 0, removed: 0, message: null });
  });

  it('rejects with the status and the parsed body on a 422', async () => {
    const body = { error: { message: 'x', messageKeys: ['ETGO_RemittanceLineAmountInvalid'], invalidIds: ['psd-1'] } };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(body, { ok: false, status: 422 }));
    await expect(syncDueItems(apiFetch, 'rem-1', { items: [{ id: 'psd-1', amount: 999 }] })).rejects.toMatchObject({ status: 422, body });
  });

  it('rejects with a null body when the refusal carries no JSON', async () => {
    const apiFetch = vi.fn().mockResolvedValue(brokenJsonResponse({ status: 500 }));
    await expect(syncDueItems(apiFetch, 'rem-1', {})).rejects.toMatchObject({ status: 500, body: null });
  });
});

describe('dueItemsErrorMessage', () => {
  const dictionary = {
    'backendError.remittanceDueItemNotAvailable': 'T:notAvailable',
    remittanceDueItemsSyncError: 'T:addError',
  };
  const ui = (key) => dictionary[key] ?? key;

  it('translates a refusal by its messageKeys, whatever language the prose is in', () => {
    const body = { error: { message: 'Uno o más vencimientos ya no están disponibles.', messageKeys: ['ETGO_RemittanceDueItemNotAvailable'] } };
    expect(dueItemsErrorMessage(body, ui, 'remittanceDueItemsSyncError')).toBe('T:notAvailable');
  });

  it('falls back to the given key when there is no body', () => {
    expect(dueItemsErrorMessage(null, ui, 'remittanceDueItemsSyncError')).toBe('T:addError');
  });

  it('shows the backend text when it carries no key the SPA knows', () => {
    const body = { error: { message: 'Server said something specific.' } };
    expect(dueItemsErrorMessage(body, ui, 'remittanceDueItemsSyncError')).toBe('Server said something specific.');
  });
});

describe('fetchLinesTotal', () => {
  const LOADED = [{ amount: 100 }, { amount: '50.25' }, { amount: null }];

  it('asks the lines list for the grid summary of every line of the remittance', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ amount: 1202.3, id: 4, isGridSummary: true }] } }));
    await fetchLinesTotal(apiFetch, 'rem 1', LOADED);
    const [url] = apiFetch.mock.calls[0];
    expect(url.startsWith('/lines?parentId=rem%201&_summary=')).toBe(true);
    expect(JSON.parse(decodeURIComponent(url.split('_summary=')[1]))).toEqual({ amount: 'sum', id: 'count' });
  });

  it('reads the total and the count from the summary row `response.data[0]`', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ amount: 1202.3, id: 4, isGridSummary: true }] } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 1202.3, count: 4 });
  });

  it('reads numeric strings in the summary row', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ amount: '10.5', id: '2', isGridSummary: true }] } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 10.5, count: 2 });
  });

  it('accepts a summary row served as an object instead of a one-row array', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ data: { amount: 7, id: 1 } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 7, count: 1 });
  });

  it('sums the loaded lines when the answer is not OK', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 150.25, count: 3 });
  });

  it('sums the loaded lines when the summary row is missing', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [] } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 150.25, count: 3 });
  });

  it('sums the loaded lines when the summary row is not numeric', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ amount: 'abc', id: 4 }] } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 150.25, count: 3 });
  });

  it('sums the loaded lines when the count is not numeric either', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: [{ amount: 5, id: undefined }] } }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 150.25, count: 3 });
  });

  it('sums the loaded lines when the request itself fails', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchLinesTotal(apiFetch, 'rem-1', LOADED)).toEqual({ total: 150.25, count: 3 });
  });

  it('falls back to zero lines when none are loaded', async () => {
    const apiFetch = vi.fn().mockResolvedValue(brokenJsonResponse({ ok: true, status: 200 }));
    expect(await fetchLinesTotal(apiFetch, 'rem-1')).toEqual({ total: 0, count: 0 });
  });
});
