import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js (ETP-5381).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromShipmentModal.jsx'),
  // The prelude calls `moduleApiFetch` (imported from '@/auth/api.js', a
  // binding the loader strips); the stub forwards to `globalThis.fetch`,
  // which is what the mocks below install.
  { moduleApiFetch: apiFetchToGlobalFetch },
);
const { fetchDocuments, buildLineBody } = helpers;

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID).
const ORDER_LINE_FK = orderLineApiKey('sales-invoice');

describe('ImportFromShipmentModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromShipmentModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromShipmentModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches shipments and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /goods-shipment\/goodsShipment/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('wires the shipment-specific i18n keys for search and empty states', () => {
    assert.match(src, /searchPlaceholderKey="searchShipment"/);
    assert.match(src, /emptyMessageKey="noPendingShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noShipmentsMatchYourSearch"/);
  });

  it('fetches shipment lines on expand with callout price enrichment', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /goods-shipment\/goodsShipmentLine\?parentId=/);
    assert.match(src, /resolveLinePrice/);
  });

  it('wires the success message key so the shared modal can toast on success', () => {
    assert.match(src, /successMessageKey="linesImportedFromShipment"/);
    assert.match(src, /titleKey="importFromShipment"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noShipmentsMatchCurrency"/);
  });

  // ETP-5381: `cOrderlineId` is not a key of the sales-invoice NEO spec, and
  // NeoFieldFilter.filterRecord drops unknown body keys silently.
  it('never mentions the non-existent cOrderlineId key', () => {
    assert.doesNotMatch(src, /cOrderlineId/);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ shipments = [], invLines = [], invoiceHeader = {}, orders = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/goods-shipment/goodsShipment?')) return mockRes(true, shipments);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/lines?criteria=')) return mockRes(true, []);
    if (url.includes('/sales-invoice/lines/selectors/')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.includes('/sales-invoice/lines/callout')) return { ok: false, json: async () => ({}) };
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/sales-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromShipmentModal — fetchDocuments filtering', () => {
  afterEach(() => {
    mock.reset();
  });

  it('filters shipments by CO status, matching business partner, and not-yet-invoiced', async () => {
    installFetch({
      shipments: [
        { id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false },
        { id: 'sDraft', documentStatus: 'DR', businessPartner: 'bp1', invoiced: false },
        { id: 'sOtherBp', documentStatus: 'CO', businessPartner: 'other-bp', invoiced: false },
        { id: 'sInvoiced', documentStatus: 'CO', businessPartner: 'bp1', invoiced: true },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['s1']);
  });

  it('keeps a shipment whose linked order currency matches the invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 's1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a shipment whose linked order currency does not match the invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('never excludes a shipment with no linked order, regardless of invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null }],
      invoiceHeader: { currency: 'USD' },
      orders: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 's1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      shipments: [
        { id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' },
        { id: 's2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so2' },
      ],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'DR', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: {},
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('keeps the mix of matching and no-order shipments, excludes only the mismatched one', async () => {
    installFetch({
      shipments: [
        { id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' },
        { id: 's2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so2' },
        { id: 's3', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null },
      ],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'USD' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const ids = result.documents.map(d => d.id).sort();
    assert.deepEqual(ids, ['s1', 's3']);
    assert.equal(result.excludedByCurrency, false);
  });
});

describe('ImportFromShipmentModal — duplicate detection via the order line FK', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported order line set from the spec API key', async () => {
    installFetch({
      invLines: [{ id: 'il1', goodsShipmentLine: 'sl1', [ORDER_LINE_FK]: 'ol1' }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedOrderLines.has('ol1'));
  });

  it('ignores the legacy cOrderlineId key, which NEO never returns', async () => {
    installFetch({
      invLines: [{ id: 'il1', goodsShipmentLine: 'sl1', cOrderlineId: 'ol9' }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.alreadyImportedOrderLines.has('ol9'), false);
  });
});

describe('ImportFromShipmentModal — buildLineBody order line FK (ETP-5381)', () => {
  afterEach(() => {
    mock.reset();
  });

  const buildArgs = (line) => ({
    line,
    qty: 2,
    invoiceId: 'inv1',
    lineNo: 10,
    sharedContext: { invoiceHeader: {}, productAuxMap: {} },
    base: '/b',
    headers: {},
  });

  // ETP-5381 REGRESSION GUARD — the FK must travel under the spec's key.
  // Under the old `cOrderlineId`, NeoFieldFilter dropped it silently (HTTP 200,
  // line created, C_OrderLine_ID NULL), which kept M_MATCHSO empty and skipped
  // `UPDATE C_ORDERLINE SET QtyInvoiced`, leaving the order invoiceable forever.
  it('sends the shipment line source order line under the spec API key for C_OrderLine_ID', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'sl1', product: 'p1', salesOrderLine: 'ol1', _unitPrice: 10,
    }));
    assert.equal(body[ORDER_LINE_FK], 'ol1');
    assert.equal(body.goodsShipmentLine, 'sl1');
  });

  it('does not send the order line under a key the NEO spec would silently drop', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'sl1', product: 'p1', salesOrderLine: 'ol1', _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, 'cOrderlineId'), false);
  });

  it('sends an explicit null when the shipment line has no linked order line', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'sl1', product: 'p1', salesOrderLine: null, _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, ORDER_LINE_FK), true);
    assert.equal(body[ORDER_LINE_FK], null);
  });
});
