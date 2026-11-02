// @covers tools/app-shell/src/components/related-documents/useRelatedDocuments.js
// @covers tools/app-shell/src/components/related-documents/salesRelatedDocs.js
// @covers tools/app-shell/src/components/related-documents/purchaseRelatedDocs.js
// ETP-5828: the hook, driven by the REAL invoice definitions in record mode (the form path),
// shows every order of a multi-order invoice and refetches when `linkedOrders` changes.
// New file (not an extension of useRelatedDocuments.vitest.jsx): that file mocks helpers.js
// with fetchById only and exercises the hook against synthetic definitions.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend = vi.hoisted(() => ({ byCriteria: {}, byId: {}, originFetch: null }));

vi.mock('../helpers.js', () => ({
  fetchByCriteria: vi.fn(async (spec, entity, field, value) => backend.byCriteria[`${spec}/${entity}?${field}=${value}`] ?? []),
  fetchById: vi.fn(async (spec, entity, id) => backend.byId[`${spec}/${entity}/${id}`] ?? null),
  fetchListInvoices: vi.fn(async () => []),
  fetchOriginInvoicesOf: vi.fn(() => (...args) => backend.originFetch(...args)),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { fetchById, fetchByCriteria } from '../helpers.js';
import { SALES_RELATED_DOCS } from '../salesRelatedDocs.js';
import { PURCHASE_RELATED_DOCS } from '../purchaseRelatedDocs.js';
import { useRelatedDocuments } from '../useRelatedDocuments.js';

const chips = (items) => items.map(({ type, doc }) => `${type}:${doc.id}`);

function renderRelated(definition, initialRecord) {
  return renderHook(
    ({ record }) => useRelatedDocuments({
      definition,
      id: record.id,
      record,
      token: 'tok',
      apiBaseUrl: `/sws/neo/${definition.spec}`,
    }),
    { initialProps: { record: initialRecord } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.byCriteria = {};
  backend.byId = {};
  backend.originFetch = vi.fn(async () => []);
});

describe('useRelatedDocuments — sales-invoice from several orders (ETP-5828)', () => {
  const definition = SALES_RELATED_DOCS['sales-invoice'];

  it('renders one sales-order chip per linked order when the header order is blank', async () => {
    const record = {
      id: 'inv-1',
      salesOrder: null,
      linkedOrders: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }],
    };
    const { result } = renderRelated(definition, record);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual([
      'sales-order:o1', 'sales-order:o2', 'sales-order:o3', 'sales-order:o4',
    ]);
    expect(fetchById).not.toHaveBeenCalled();
    expect(fetchByCriteria).not.toHaveBeenCalled();
  });

  it('refetches when linkedOrders changes, and not when an unrelated field changes', async () => {
    const record = { id: 'inv-1', linkedOrders: [{ id: 'o1' }, { id: 'o2' }] };
    const { result, rerender } = renderRelated(definition, record);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual(['sales-order:o1', 'sales-order:o2']);
    expect(backend.originFetch).toHaveBeenCalledTimes(1);

    rerender({ record: { ...record, updated: 'later' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(backend.originFetch).toHaveBeenCalledTimes(1);

    rerender({ record: { id: 'inv-1', linkedOrders: [{ id: 'o1' }, { id: 'o2' }, { id: 'q9', isQuotation: true }] } });
    await waitFor(() => expect(chips(result.current.items)).toEqual([
      'sales-order:o1', 'sales-order:o2', 'sales-quotation:q9',
    ]));
    expect(result.current.loading).toBe(false);
    expect(backend.originFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useRelatedDocuments — purchase-invoice from several orders (ETP-5828)', () => {
  const definition = PURCHASE_RELATED_DOCS['purchase-invoice'];

  it('two linked orders are two order chips; the header order among them adds none', async () => {
    backend.byId = { 'purchase-order/header/po1': { id: 'po1' } };
    const record = { id: 'pinv-1', salesOrder: 'po1', linkedOrders: [{ id: 'po1' }, { id: 'po2' }] };
    const { result } = renderRelated(definition, record);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chips(result.current.items)).toEqual(['order:po1', 'order:po2']);
    expect(fetchById).not.toHaveBeenCalled();
  });
});
