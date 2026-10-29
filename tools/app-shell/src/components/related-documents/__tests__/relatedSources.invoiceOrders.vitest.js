// @covers tools/app-shell/src/components/related-documents/relatedSources.js
// ETP-5828: the ORDER source of an invoice reads every order its lines come from
// (`linkedOrders`, injected by AbstractInvoiceHeaderHandler#enrichLinkedOrders) and only
// asks the header-origin fetch for `salesOrder` when that order is not already among them.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../helpers.js', () => ({
  fetchByCriteria: vi.fn(),
  fetchListInvoices: vi.fn(),
  fetchOriginInvoicesOf: vi.fn(() => vi.fn()),
}));

import { invoiceOrdersFetch, invoiceOrdersDepsKey } from '../relatedSources.js';

const A = { id: 'ord-a', documentNo: 'SO-A' };
const B = { id: 'ord-b', documentNo: 'SO-B' };
const C = { id: 'ord-c', documentNo: 'SO-C' };

function setup(headerResult = [C]) {
  const fetchHeaderOrigin = vi.fn(async () => headerResult);
  return { fetchHeaderOrigin, fetch: invoiceOrdersFetch(fetchHeaderOrigin) };
}

const ctxFor = (record) => ({ id: record.id, record, token: 'tok', apiBaseUrl: '/sws/neo/x' });

describe('invoiceOrdersFetch', () => {
  it('returns every linked order and never fetches the header when salesOrder is empty', async () => {
    const { fetch, fetchHeaderOrigin } = setup();
    const docs = await fetch(ctxFor({ id: 'inv', linkedOrders: [A, B], salesOrder: null }));
    expect(docs).toEqual([A, B]);
    expect(fetchHeaderOrigin).not.toHaveBeenCalled();
  });

  it('does not fetch nor duplicate the header order when it is one of the linked orders', async () => {
    const { fetch, fetchHeaderOrigin } = setup([A]);
    const docs = await fetch(ctxFor({ id: 'inv', linkedOrders: [A, B], salesOrder: 'ord-a' }));
    expect(docs).toEqual([A, B]);
    expect(fetchHeaderOrigin).not.toHaveBeenCalled();
  });

  it('appends the header order, fetched once, when it is not among the linked orders', async () => {
    const { fetch, fetchHeaderOrigin } = setup([C]);
    const record = { id: 'inv', linkedOrders: [A, B], salesOrder: 'ord-c' };
    const ctx = ctxFor(record);
    const docs = await fetch(ctx);
    expect(docs).toEqual([A, B, C]);
    expect(fetchHeaderOrigin).toHaveBeenCalledTimes(1);
    expect(fetchHeaderOrigin).toHaveBeenCalledWith(ctx);
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['not an array', 'ord-a'],
  ])('falls back to the header origin alone when linkedOrders is %s', async (_label, linkedOrders) => {
    const { fetch, fetchHeaderOrigin } = setup([C]);
    const docs = await fetch(ctxFor({ id: 'inv', linkedOrders, salesOrder: 'ord-c' }));
    expect(docs).toEqual([C]);
    expect(fetchHeaderOrigin).toHaveBeenCalledTimes(1);
  });

  it('returns nothing without linked orders and without a header order', async () => {
    const { fetch, fetchHeaderOrigin } = setup();
    expect(await fetch(ctxFor({ id: 'inv' }))).toEqual([]);
    expect(fetchHeaderOrigin).not.toHaveBeenCalled();
  });

  it('drops linked entries without an id (null, empty object, blank id)', async () => {
    const { fetch } = setup();
    const docs = await fetch(ctxFor({
      id: 'inv',
      linkedOrders: [null, {}, { id: '' }, { documentNo: 'NO-ID' }, A, undefined, B],
    }));
    expect(docs).toEqual([A, B]);
  });

  it('tolerates a header origin that resolves to a non-array', async () => {
    const { fetch } = setup(null);
    expect(await fetch(ctxFor({ id: 'inv', linkedOrders: [A], salesOrder: 'ord-c' }))).toEqual([A]);
  });
});

describe('invoiceOrdersDepsKey', () => {
  it.each([
    [{ linkedOrders: [A] }, { linkedOrders: [A, B] }],
    [{ linkedOrders: [A, B] }, { linkedOrders: [A, C] }],
    [{ linkedOrders: [] }, { linkedOrders: [A] }],
    [{ salesOrder: 'ord-a' }, { salesOrder: 'ord-b' }],
  ])('%j → %j changes the key', (before, after) => {
    expect(invoiceOrdersDepsKey(before)).not.toBe(invoiceOrdersDepsKey(after));
  });

  it('ignores fields other than the order ids', () => {
    expect(invoiceOrdersDepsKey({ salesOrder: 'o', linkedOrders: [{ id: 'ord-a', documentStatus: 'DR' }] }))
      .toBe(invoiceOrdersDepsKey({ salesOrder: 'o', linkedOrders: [{ id: 'ord-a', documentStatus: 'CO' }] }));
  });

  it('accepts an undefined record', () => {
    expect(typeof invoiceOrdersDepsKey(undefined)).toBe('string');
  });
});
