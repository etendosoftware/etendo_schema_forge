// ETP-5527 — the two fetchers the shared sales definition added to helpers.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const responses = vi.hoisted(() => ({ map: {} }));

vi.mock('@etendosoftware/app-shell-core/auth/api', () => ({
  apiFetch: vi.fn(async (url) => {
    const entry = responses.map[url];
    if (entry instanceof Error) throw entry;
    if (entry === undefined) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ response: { data: entry } }) };
  }),
}));

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { fetchListInvoices } from '../helpers.js';

const BASE = '/sws/neo/sales-order';

beforeEach(() => {
  vi.clearAllMocks();
  responses.map = {};
});

describe('fetchListInvoices', () => {
  it('calls the listInvoices action of the given spec/entity (cross-spec, id encoded)', async () => {
    responses.map['/sws/neo/sales-quotation/quotation/q%2F1/action/listInvoices'] = [{ id: 'i1' }];
    await expect(fetchListInvoices('sales-quotation', 'quotation', 'q/1', 'tok', BASE)).resolves.toEqual([{ id: 'i1' }]);
    expect(apiFetch).toHaveBeenCalledWith(expect.any(String), { baseUrl: '', token: 'tok' });
  });

  it.each([
    ['a non-ok response', undefined],
    ['a network error', new Error('down')],
  ])('resolves [] on %s', async (_label, entry) => {
    responses.map['/sws/neo/sales-order/header/o1/action/listInvoices'] = entry;
    await expect(fetchListInvoices('sales-order', 'header', 'o1', 'tok', BASE)).resolves.toEqual([]);
  });
});
