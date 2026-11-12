// @covers artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/importActionClient.js
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';
import { listAll, listLines, newestCreatedFirst } from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { pricingContextOf } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceImportPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromShipmentModal.jsx'),
  { moduleApiFetch: apiFetchToGlobalFetch, listAll, listLines, pricingContextOf, newestCreatedFirst },
);
const { fetchDocuments, fetchLines, buildLineBody, getDocDisplay } = helpers;

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

  it('lists shipments through the invoice availableShipments action, covered ones included', () => {
    assert.match(src, /action: 'availableShipments', params: \{ includeCovered: true, detail: true \}/);
    assert.match(src, /eagerLoadLines=\{false\}/);
    assert.match(src, /isDocumentCovered=\{isShipmentCovered\}/);
  });

  it('wires the shipment-specific i18n keys for search and empty states', () => {
    assert.match(src, /searchPlaceholderKey="searchShipment"/);
    assert.match(src, /emptyMessageKey="noPendingShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noShipmentsMatchYourSearch"/);
  });

  it('reads shipment lines on expand through availableShipmentLines and prices on expand and at import', () => {
    assert.match(src, /action: 'availableShipmentLines', params: \{ shipmentId: docId, includeCovered: true, detail: true \}/);
    assert.match(src, /const fetchLines[\s\S]*resolveLinePrice/);
    assert.match(src, /const buildLineBody[\s\S]*resolveLinePrice/);
  });

  it('wires the success message key so the shared modal can toast on success', () => {
    assert.match(src, /successMessageKey="linesImportedFromShipment"/);
    assert.match(src, /titleKey="importFromShipment"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{handlers\.fetchDocuments\}/);
    assert.match(src, /fetchLines=\{handlers\.fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noShipmentsMatchCurrency"/);
  });

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

/**
 * ETP-6099 — the fixtures are the shipments and orders as stored; this mock plays the server's
 * `availableShipments` (completed, the invoice partner's, not invoiced, in the invoice's currency —
 * a shipment's currency being its order's here) and the shipment read the popup makes only to tell
 * a currency-emptied list apart. com.etendoerp.go covers the real rule.
 */
function installFetch({ shipments = [], shipmentLines = [], invoiceHeader = {}, orders = {}, bpId = 'bp1' }) {
  const currencyOf = (s) => (s.salesOrder ? orders[s.salesOrder]?.currency : invoiceHeader.currency) || null;
  const candidates = shipments.filter(s => s.documentStatus === 'CO' && s.businessPartner === bpId && s.invoiced !== true);
  globalThis.fetch = mock.fn(async (url, options) => {
    if (url.endsWith('/action/availableShipments')) {
      const listed = candidates.filter(s => !invoiceHeader.currency || currencyOf(s) === invoiceHeader.currency);
      return { ok: true, json: async () => ({ response: { hasMore: false, data: listed.map(s => ({ ...s, date: s.movementDate, pendingLines: 1 })) } }) };
    }
    if (url.endsWith('/action/availableShipmentLines')) {
      assert.equal(JSON.parse(options.body).includeCovered, true);
      return mockRes(true, shipmentLines);
    }
    if (url.includes('/goods-shipment/goodsShipment?criteria=')) {
      return mockRes(true, candidates.filter(s => currencyOf(s) && currencyOf(s) !== invoiceHeader.currency));
    }
    if (url.includes('/sales-invoice/lines/selectors/')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.includes('/sales-invoice/lines/callout')) return { ok: false, json: async () => ({}) };
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
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

describe('ImportFromShipmentModal — lines shown on expand', () => {
  afterEach(() => {
    mock.reset();
  });

  const row = (over) => ({
    id: 'sl1', lineNo: 10, product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1',
    movementQuantity: 5, pendingQuantity: 5, orderLine: 'ol1', orderLineDiscount: 10,
    importedHere: false, invoicedElsewhere: false, ...over,
  });
  const linesOf = async (rows) => {
    installFetch({ shipmentLines: rows });
    return fetchLines({ base: '/b', headers: {}, docId: 's1', sharedContext: { invoiceId: 'inv1' } });
  };

  it('offers the pending quantity and carries the order line under the spec key and its discount', async () => {
    const [line] = await linesOf([row({ pendingQuantity: 3 })]);
    assert.equal(line._maxQty, 3);
    assert.equal(line._alreadyImported, false);
    assert.equal(line[ORDER_LINE_FK], 'ol1');
    assert.equal(line._orderDiscount, 10);
    assert.equal(line._productName, 'Widget');
  });

  const cases = [
    { name: 'a line this invoice already holds is greyed at its shipped quantity', over: { importedHere: true, pendingQuantity: 0 }, imported: true, max: 5 },
    { name: 'a line another invoice holds is greyed', over: { invoicedElsewhere: true, pendingQuantity: 2 }, imported: true, max: 5 },
    { name: 'a line with nothing left is greyed', over: { pendingQuantity: 0 }, imported: true, max: 5 },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const [line] = await linesOf([row(c.over)]);
      assert.equal(line._alreadyImported, c.imported);
      assert.equal(line._maxQty, c.max);
    });
  }

  it('shows the order number of the shipment as its secondary text', () => {
    assert.deepEqual(getDocDisplay({ id: 's1', documentNo: 'GS-1', movementDate: '2026-01-02', orderDocumentNo: 'SO-7' }),
      { docNo: 'GS-1', date: '2026-01-02', secondary: '#SO-7' });
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
