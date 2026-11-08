// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxApi.js
import { describe, it, expect, vi } from 'vitest';
import { fetchRowsByIdChunked, IDS_PER_REQUEST, fetchNextPage, fetchCount, fetchCounts, fetchRowsById, uploadInboxFile, fetchStreamPage, discardInboxDocument, DISCARD_ACTION } from '../invoiceInboxApi.js';
import { INBOX_FILTERS } from '../invoiceInboxFilters.js';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const listBody = (data, totalRows = data.length) => ({ response: { data, totalRows } });
const rowsOf = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const queryOf = (url) => new URLSearchParams(url.split('?')[1]);

/** apiFetch fake over two disjoint streams keyed by the criteria's first value, honoring _startRow/_endRow (inclusive). */
function streamBackend(streamRows) {
  return vi.fn(async (url) => {
    const q = queryOf(url);
    const criteria = JSON.parse(q.get('criteria'));
    const key = criteria[0].value === 'ERROR' ? 'A' : 'B';
    const start = Number(q.get('_startRow'));
    const end = Number(q.get('_endRow'));
    return json(listBody(streamRows[key].slice(start, end + 1)));
  });
}

const ALL_STREAMS = INBOX_FILTERS.find((f) => f.key === 'all').streams;

describe('fetchNextPage over the two streams of Todas', () => {
  it('walks stream A then B across pages with no overlap and no gap', async () => {
    const A = rowsOf('a', 3);
    const B = rowsOf('b', 4);
    const apiFetch = streamBackend({ A, B });
    const seen = [];
    let cursor = { index: 0, offset: 0 };
    let more = true;
    let guard = 0;
    while (more && guard++ < 10) {
      const page = await fetchNextPage(apiFetch, ALL_STREAMS, cursor, 2);
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.cursor;
      more = page.more;
    }
    expect(seen).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2', 'b3']);
    expect(more).toBe(false);
  });

  it('crosses from stream A into B inside one page when A runs out', async () => {
    const apiFetch = streamBackend({ A: rowsOf('a', 1), B: rowsOf('b', 5) });
    const page = await fetchNextPage(apiFetch, ALL_STREAMS, { index: 0, offset: 0 }, 3);
    expect(page.rows.map((r) => r.id)).toEqual(['a0', 'b0', 'b1']);
    expect(page.more).toBe(true);
  });

  it('the extra row decides "has more": exactly size rows left means no more', async () => {
    const apiFetch = streamBackend({ A: [], B: rowsOf('b', 2) });
    const page = await fetchNextPage(apiFetch, ALL_STREAMS, { index: 0, offset: 0 }, 2);
    expect(page.rows).toHaveLength(2);
    expect(page.more).toBe(false);
  });

  it('asks for one extra row (_endRow = startRow + size, inclusive)', async () => {
    const apiFetch = vi.fn(async () => json(listBody([])));
    await fetchStreamPage(apiFetch, [{ fieldName: 'status', operator: 'equals', value: 'ERROR' }], 50, 50);
    const q = queryOf(apiFetch.mock.calls[0][0]);
    expect(q.get('_startRow')).toBe('50');
    expect(q.get('_endRow')).toBe('100');
    expect(q.get('_sortBy')).toBe('-created');
  });

  it('keeps only `size` rows when the extra one comes back', async () => {
    const apiFetch = vi.fn(async () => json(listBody(rowsOf('x', 4))));
    const page = await fetchStreamPage(apiFetch, [], 0, 3);
    expect(page.rows).toHaveLength(3);
    expect(page.more).toBe(true);
  });

  it('rejects when the list answers non-2xx', async () => {
    const apiFetch = vi.fn(async () => json({}, { ok: false, status: 500 }));
    await expect(fetchNextPage(apiFetch, ALL_STREAMS, { index: 0, offset: 0 }, 5)).rejects.toThrow('HTTP 500');
  });

  it('treats a body without data as an empty stream', async () => {
    const apiFetch = vi.fn(async () => json({}));
    const page = await fetchNextPage(apiFetch, [[]], { index: 0, offset: 0 }, 5);
    expect(page).toEqual({ rows: [], cursor: { index: 1, offset: 0 }, more: false });
  });
});

describe('counters', () => {
  it('fetchCount reads one row with _noCount=false and returns totalRows', async () => {
    const apiFetch = vi.fn(async () => json(listBody([{ id: 'x' }], 42)));
    expect(await fetchCount(apiFetch, [])).toBe(42);
    const q = queryOf(apiFetch.mock.calls[0][0]);
    expect(q.get('_noCount')).toBe('false');
    expect(q.get('_endRow')).toBe('1');
  });

  it('fetchCount falls back to 0 for a missing total', async () => {
    const apiFetch = vi.fn(async () => json({ response: { data: [] } }));
    expect(await fetchCount(apiFetch, [])).toBe(0);
  });

  it('fetchCounts returns pending, error, confirmed and discarded (no all)', async () => {
    const totals = { PROCESSING: 5, ERROR: 2, CONFIRMED: 7, DISCARDED: 1 };
    const apiFetch = vi.fn(async (url) => {
      const c = JSON.parse(queryOf(url).get('criteria'))[0];
      const key = Array.isArray(c.value) ? 'PROCESSING' : c.value;
      return json(listBody([], totals[key]));
    });
    expect(await fetchCounts(apiFetch)).toEqual({ pending: 5, error: 2, confirmed: 7, discarded: 1 });
  });

  it('fetchRowsById sends an id inSet criterion and returns the rows', async () => {
    const apiFetch = vi.fn(async () => json(listBody([{ id: 'a' }])));
    expect(await fetchRowsById(apiFetch, ['a', 'b'])).toEqual([{ id: 'a' }]);
    const q = queryOf(apiFetch.mock.calls[0][0]);
    expect(JSON.parse(q.get('criteria'))).toEqual([{ fieldName: 'id', operator: 'inSet', value: ['a', 'b'] }]);
    expect(q.get('_endRow')).toBe('2');
  });
});

describe('uploadInboxFile', () => {
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });

  it('POSTs one multipart `files` part with timeout 0', async () => {
    const apiFetch = vi.fn(async () => json({ results: [{ status: 'accepted', incomingDocumentId: 'D1' }] }));
    await uploadInboxFile(apiFetch, file);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/upload');
    expect(opts.method).toBe('POST');
    expect(opts.timeout).toBe(0);
    expect(opts.body.getAll('files')).toHaveLength(1);
    expect(opts.body.get('files').name).toBe('a.pdf');
  });

  it('maps a 200 accepted result to its document id', async () => {
    const apiFetch = vi.fn(async () => json({ results: [{ status: 'accepted', incomingDocumentId: 'D1' }] }));
    expect(await uploadInboxFile(apiFetch, file)).toEqual({ status: 'accepted', id: 'D1' });
  });

  it('maps a 200 rejected result to its code', async () => {
    const apiFetch = vi.fn(async () => json({ results: [{ status: 'rejected', code: 'unsupported_type' }] }));
    expect(await uploadInboxFile(apiFetch, file)).toEqual({ status: 'rejected', code: 'unsupported_type' });
  });

  it.each(['feature_disabled', 'access_denied', 'org_not_allowed', 'too_many_files', 'request_too_large'])(
    'maps a non-2xx %s to a failed outcome with that code', async (code) => {
      const apiFetch = vi.fn(async () => json({ error: { code } }, { ok: false, status: 403 }));
      expect(await uploadInboxFile(apiFetch, file)).toEqual({ status: 'failed', code });
    });

  it('maps a non-2xx with a non-JSON body to failed with no code', async () => {
    const apiFetch = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('bad json'); } }));
    expect(await uploadInboxFile(apiFetch, file)).toEqual({ status: 'failed', code: null });
  });

  it('propagates a NetworkError rejection', async () => {
    const err = Object.assign(new Error('offline'), { name: 'NetworkError' });
    const apiFetch = vi.fn(async () => { throw err; });
    await expect(uploadInboxFile(apiFetch, file)).rejects.toBe(err);
  });
});

describe('discardInboxDocument', () => {
  it('POSTs /header/{id}/action/discard with no body and timeout 0', async () => {
    const apiFetch = vi.fn(async () => json({ id: 'D1', status: 'DISCARDED', alreadyDiscarded: false }));
    expect(await discardInboxDocument(apiFetch, 'D1')).toEqual({ status: 'discarded' });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(DISCARD_ACTION).toBe('discard');
    expect(path).toBe('/header/D1/action/discard');
    expect(opts.method).toBe('POST');
    expect(opts.timeout).toBe(0);
    expect(opts.body).toBeUndefined();
  });

  it('URL-encodes the id', async () => {
    const apiFetch = vi.fn(async () => json({}));
    await discardInboxDocument(apiFetch, 'a/b c?d');
    expect(apiFetch.mock.calls[0][0]).toBe('/header/a%2Fb%20c%3Fd/action/discard');
  });

  it('an already discarded document (200 alreadyDiscarded) is a success', async () => {
    const apiFetch = vi.fn(async () => json({ id: 'D1', status: 'DISCARDED', alreadyDiscarded: true }));
    expect(await discardInboxDocument(apiFetch, 'D1')).toEqual({ status: 'discarded' });
  });

  it.each([
    ['409 not_discardable', 409, { error: { code: 'not_discardable' } }, 'not_discardable'],
    ['403 org_not_allowed', 403, { error: { code: 'org_not_allowed' } }, 'org_not_allowed'],
    ['403 feature_disabled', 403, { error: { code: 'feature_disabled' } }, 'feature_disabled'],
    ['403 without code (router)', 403, { error: { message: 'Access denied to spec for current role' } }, null],
    ['404 without body code', 404, {}, null],
  ])('%s maps to a failed outcome', async (_n, httpStatus, body, code) => {
    const apiFetch = vi.fn(async () => json(body, { ok: false, status: httpStatus }));
    expect(await discardInboxDocument(apiFetch, 'D1')).toEqual({ status: 'failed', code, httpStatus });
  });

  it('a non-JSON error body still yields failed with no code', async () => {
    const apiFetch = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('x'); } }));
    expect(await discardInboxDocument(apiFetch, 'D1')).toEqual({ status: 'failed', code: null, httpStatus: 502 });
  });

  it('propagates a NetworkError rejection', async () => {
    const err = Object.assign(new Error('offline'), { name: 'NetworkError' });
    const apiFetch = vi.fn(async () => { throw err; });
    await expect(discardInboxDocument(apiFetch, 'D1')).rejects.toBe(err);
  });
});

describe('fetchRowsByIdChunked', () => {
  const idsOf = (url) => JSON.parse(queryOf(url).get('criteria'))[0].value;

  it('reads 120 ids in 3 requests of at most 50 and returns every row found', async () => {
    expect(IDS_PER_REQUEST).toBe(50);
    const ids = Array.from({ length: 120 }, (_, i) => `d${i}`);
    const apiFetch = vi.fn(async (url) => json(listBody(idsOf(url).map((id) => ({ id })))));
    const rows = await fetchRowsByIdChunked(apiFetch, ids);
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls.map(([url]) => idsOf(url).length)).toEqual([50, 50, 20]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it('makes no request for no ids', async () => {
    const apiFetch = vi.fn();
    expect(await fetchRowsByIdChunked(apiFetch, [])).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
