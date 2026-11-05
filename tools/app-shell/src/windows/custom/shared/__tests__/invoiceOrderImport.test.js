// @covers tools/app-shell/src/windows/custom/shared/invoiceOrderImport.js
// @covers artifacts/sales-invoice/custom/ImportFromOrderModal.jsx
// @covers artifacts/purchase-invoice/custom/ImportFromPurchaseOrderModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderLineApiKey } from '../../../../../../../artifacts/_test-support/contractApiKey.js';
import {
  INVOICE_ORDER_IMPORT,
  invoiceOrderImportConfig,
  fetchOrderDocuments,
  fetchOrderLines,
  submitOrderImport as submitWith,
  discountOutcome,
  buildOrderInvoiceLineBody,
  MAX_LISTED_ORDERS,
  OrderImportLoadError,
  describeLoadFailure,
  isOrderCovered,
  getOrderTotal,
  newestCreatedFirst,
} from '../invoiceOrderImport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts');

// The helpers take `apiFetch` injected; the stub forwards to `globalThis.fetch`, which is what
// the mocks below install (read at CALL time, so a test may install its mock after import).
const apiFetch = (url, options) => globalThis.fetch(url, options);
const SALES = invoiceOrderImportConfig('sales');
const fetchDocuments = (args) => fetchOrderDocuments({ apiFetch, config: SALES, ...args });
const fetchLines = (args) => fetchOrderLines({ apiFetch, config: SALES, ...args });
const submitOrderImport = (args) => submitWith({ apiFetch, config: SALES, ...args });

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID).
const ORDER_LINE_FK = orderLineApiKey('sales-invoice');

describe('invoice order import — one popup, two directions', () => {
  it('rejects an unknown direction', () => {
    assert.throws(() => invoiceOrderImportConfig('rental'), /unknown direction "rental"/);
  });

  for (const [window, file, direction] of [
    ['sales-invoice', 'ImportFromOrderModal.jsx', 'sales'],
    ['purchase-invoice', 'ImportFromPurchaseOrderModal.jsx', 'purchase'],
  ]) {
    it(`${window}: its entry point is the shared popup in the ${direction} direction, with no logic of its own`, () => {
      const src = readFileSync(join(ARTIFACTS, window, 'custom', file), 'utf8');
      assert.match(src, /from '@\/windows\/custom\/shared\/InvoiceOrderImportModal\.jsx'/);
      assert.match(src, new RegExp(`<InvoiceOrderImportModal \\{\\.\\.\\.props\\} direction="${direction}" />`));
      assert.doesNotMatch(src, /apiFetch|buildLineBody|linesEndpoint/);
    });
  }

  // Both directions list and read pending through the invoice's actions (ETP-5828 for sales,
  // ETP-6099 for purchases: availableOrders for the orders, ONE availableOrderLines per order);
  // `importVia` (MCP-2) only switches the import.
  for (const direction of ['sales', 'purchase']) {
    const config = INVOICE_ORDER_IMPORT[direction];
    const invoice = config.invoiceSpec;
    const order = config.orderSpec;

    it(`${direction}: lists through availableOrders and availableOrderLines, never the order GETs`, async () => {
      const urls = [];
      const bodies = [];
      const stub = async (url, opts) => {
        urls.push(url);
        if (opts?.body) bodies.push([url, JSON.parse(opts.body)]);
        if (url.endsWith('/availableOrders')) return mockRes(true, [{ id: 'o1', documentNo: 'SO-1', date: '2026-11-01' }]);
        if (url.endsWith('/availableOrderLines')) return mockRes(true, [{ id: 'ol1', pendingQuantity: 1 }]);
        if (url.includes(`/${order}/lines`)) return mockRes(true, [{ id: 'ol1', orderedQuantity: 5, invoicedQuantity: 2, unitPrice: 10 }]);
        return mockRes(true, []);
      };
      await fetchOrderDocuments({ apiFetch: stub, config, base: '/b', bpId: 'bp1', invoiceId: 'inv1' });
      const lines = await fetchOrderLines({ apiFetch: stub, config, base: '/b', docId: 'o1', sharedContext: { invoiceId: 'inv1' } });
      assert.deepEqual(urls.map(u => u.split('?')[0]),
        [`/b/${invoice}/header/inv1/action/availableOrders`, `/b/${invoice}/lines`, `/b/${invoice}/header/inv1`,
          `/b/${invoice}/header/inv1/action/availableOrderLines`]);
      assert.equal(lines[0]._maxQty, 1);
      // Only the client import builds its line body from the row, so only it asks for `detail`.
      // Purchases also ask `detail` on the list, for the creationDate their popup sorted by.
      assert.deepEqual(bodies.find(([u]) => u.endsWith('/availableOrders'))[1], direction === 'purchase'
        ? { limit: MAX_LISTED_ORDERS, includeCovered: true, detail: true }
        : { limit: MAX_LISTED_ORDERS, includeCovered: true });
      const linesBody = bodies.find(([u]) => u.endsWith('/availableOrderLines'))[1];
      assert.deepEqual(linesBody, direction === 'purchase'
        ? { orderId: 'o1', includeCovered: true, detail: true }
        : { orderId: 'o1', includeCovered: true });
    });
  }

  it('sales: imports through the sales-invoice importOrderLines action', async () => {
    const calls = [];
    const stub = async (url, opts) => { calls.push([url, opts]); return mockRes(true, { importedCount: 1 }); };
    const result = await submitWith({
      apiFetch: stub, config: SALES, base: '/b', invoiceId: 'inv1', selection: {},
      lines: [{ line: { id: 'ol1' }, qty: 1, docId: 'o1' }],
      serverCarry: () => ({ carryGlobalDiscount: false, afterImportResult: { carried: false } }),
      ui: k => k,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/b/sales-invoice/header/inv1/action/importOrderLines');
    assert.equal(calls[0][1].method, 'POST');
    assert.equal(result.ok, true);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

// `available` is what the invoice's availableOrders action lists (ETP-5828); empty, the popup reads
// the partner's order list to tell "no orders" from "none in this currency", as `orders` here.
function installFetch({ orders, available = [], invLines = [], invoiceHeader, linesOk = true, headerOk = true }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/action/availableOrders')) return mockRes(true, available);
    if (url.includes('/sales-order/header?')) return mockRes(true, orders);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(linesOk, invLines);
    if (url.includes('/sales-invoice/header/')) return mockRes(headerOk, [invoiceHeader]);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('invoice order import — the toast follows the server answer, not the prediction', () => {
  const predicted = { afterImportResult: { carried: true, pct: 10 } };
  for (const [name, data, expected] of [
    ['server applied the % (as the MCP sees it)', { globalDiscount: { applied: true, percent: 12.5, reason: null } }, { carried: true, pct: 12.5 }],
    ['server applied it, percent as a string', { globalDiscount: { applied: true, percent: '10', reason: null } }, { carried: true, pct: 10 }],
    ['server did not apply it, although the popup predicted it', { globalDiscount: { applied: false, percent: null, reason: 'ordersWithoutDiscount' } }, { carried: false }],
    ['older backend without the field: the prediction', { importedCount: 1 }, { carried: true, pct: 10 }],
    ['malformed field: the prediction', { globalDiscount: {} }, { carried: true, pct: 10 }],
  ]) {
    it(name, () => {
      assert.deepEqual(discountOutcome(data, predicted), expected);
    });
  }

  it('submitOrderImport hands the server outcome to the toast', async () => {
    const stub = async () => mockRes(true, { importedCount: 2, globalDiscount: { applied: false, percent: null, reason: 'carryGlobalDiscountFalse' } });
    const result = await submitWith({
      apiFetch: stub, config: SALES, base: '/b', invoiceId: 'inv1', selection: {},
      lines: [{ line: { id: 'ol1' }, qty: 1, docId: 'o1' }],
      serverCarry: () => ({ carryGlobalDiscount: true, afterImportResult: { carried: true, pct: 5 } }),
      ui: k => k,
    });
    assert.deepEqual(result, { ok: true, count: 2, afterImportResult: { carried: false } });
  });
});

// ETP-5828 — the sales popup lists the invoice's availableOrders: the customer's own pending
// orders (no 500-order company cut), read without re-reading the invoice.
describe('invoice order import (sales) — fetchDocuments lists through availableOrders', () => {
  afterEach(() => {
    mock.reset();
  });

  it('asks for the whole list as a read and maps each row to what the popup shows', async () => {
    installFetch({
      orders: [{ id: 'never-read', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      available: [
        { id: 'o2', documentNo: 'SO-2', date: '2026-11-02', businessPartner: 'bp1', globalDiscount: 10 },
        { id: 'o1', documentNo: 'SO-1', date: '2026-10-01', businessPartner: 'bp1', globalDiscount: 0 },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });

    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/b/sales-invoice/header/inv1/action/availableOrders');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.refreshVersion, false);
    assert.deepEqual(JSON.parse(opts.body), { limit: MAX_LISTED_ORDERS, includeCovered: true });
    assert.equal(globalThis.fetch.mock.calls.some(c => String(c.arguments[0]).includes('/sales-order/header')), false,
      'a non-empty list never reads the order GET');
    assert.deepEqual(result.documents.map(d => [d.id, d.orderDate, d.documentNo]),
      [['o2', '2026-11-02', 'SO-2'], ['o1', '2026-10-01', 'SO-1']]);
    assert.deepEqual(result.sharedContext.orderDiscountMap, { o2: 10 });
    assert.equal(result.excludedByCurrency, false);
  });

  // ETP-6099 — the actions answer newest by document date; the popups listed newest created.
  it('newestCreatedFirst re-sorts by creationDate and keeps the server order without it', () => {
    const rows = [{ id: 'a', creationDate: '2026-01-01T10:00:00' }, { id: 'b', creationDate: '2026-03-01T10:00:00' },
      { id: 'c', creationDate: '2026-02-01T10:00:00' }];
    assert.deepEqual(newestCreatedFirst(rows).map(r => r.id), ['b', 'c', 'a']);
    const plain = [{ id: 'x' }, { id: 'y' }];
    assert.equal(newestCreatedFirst(plain), plain);
  });

  // ETP-6099 — lines are read on expand, so the row decides from the availableOrders row.
  it('the row hides an order with pendingLines 0 and totals it from amount', () => {
    assert.equal(isOrderCovered({ pendingLines: 0 }), true);
    assert.equal(isOrderCovered({ pendingLines: 2 }), false);
    assert.equal(isOrderCovered({}), false);
    assert.equal(getOrderTotal({ amount: '45.5' }), 45.5);
    assert.equal(getOrderTotal({}), null);
  });
});

// ETP-5828 — a failed availableOrders / availableOrderLines read is not "nothing to import": it
// rejects with OrderImportLoadError carrying the body. ETP-6099: purchases too (they list through
// the same actions), so the popup toasts it instead of showing an empty list in silence.
describe('invoice order import — a failed list read', () => {
  afterEach(() => {
    mock.reset();
  });

  const REFUSAL = { error: { code: 'importTargetNotDraft', message: 'The invoice is not a draft' } };
  const failingFetch = () => mock.fn(async (url) => (
    /\/action\/|\/purchase-order\/header\?/.test(url)
      ? { ok: false, status: 400, json: async () => REFUSAL }
      : mockRes(true, [{ currency: 'EUR' }])));

  for (const [name, read, rejects] of [
    ['sales availableOrders', () => fetchDocuments({ base: '/b', bpId: 'bp1', invoiceId: 'inv1' }), true],
    ['sales availableOrderLines', () => fetchLines({ base: '/b', docId: 'o1', sharedContext: { invoiceId: 'inv1' } }), true],
    ['purchase availableOrders', () => fetchOrderDocuments({
      apiFetch, config: invoiceOrderImportConfig('purchase'), base: '/b', bpId: 'bp1', invoiceId: 'inv1',
    }), true],
  ]) {
    it(`${name}: ${rejects ? 'rejects with OrderImportLoadError carrying the body' : 'resolves to no documents, as before'}`, async () => {
      globalThis.fetch = failingFetch();
      if (rejects) {
        await assert.rejects(read(), (err) => err instanceof OrderImportLoadError && err.body === REFUSAL);
      } else {
        assert.deepEqual((await read()).documents, []);
      }
    });
  }

  const es = (key) => `ES ${key}`;
  for (const [name, err, expected] of [
    ['a server refusal renders its code, never the English text',
      new OrderImportLoadError(REFUSAL), 'ES backendError.importTargetNotDraft'],
    ['a network failure shows its already translated message',
      Object.assign(new Error('Sin conexión. Reintentá.'), { name: 'NetworkError' }), 'Sin conexión. Reintentá.'],
    ['an unreadable refusal body falls back to documentsLoadError',
      new OrderImportLoadError(null), 'ES documentsLoadError'],
  ]) {
    it(`describeLoadFailure: ${name}`, () => {
      assert.equal(describeLoadFailure(err, es), expected);
    });
  }
});

// With availableOrders empty, the partner's order list still tells "none in this currency" apart.
describe('invoice order import (sales) — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a candidate order whose currency matches the invoice currency', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'o1');
    // Not offered by the action even with includeCovered: nothing to import, the row hides it.
    assert.equal(result.documents[0].pendingLines, 0);
    assert.equal(isOrderCovered(result.documents[0]), true);
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a candidate order whose currency does not match the invoice currency', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
      ],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'DR', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' }],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('keeps some documents and reports excludedByCurrency=false when only part of the candidates match', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'o1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes orders for another business partner and fully invoiced orders', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'other-bp', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 100, currency: 'EUR' },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });
});

// ETP-6002 — "Importar desde pedido" is ONE call to the invoice's importOrderLines action, so the
// window and the MCP share one rule (oldest pending shipment line first, one invoice line per
// shipment line). Prices, discount, tax, UoM and the order-line link are set server-side.
describe('invoice order import (sales) — submitOrderImport (importOrderLines action)', () => {
  afterEach(() => {
    mock.reset();
  });

  const carrying = () => ({ carryGlobalDiscount: true, afterImportResult: { carried: true, pct: 5 } });

  it('sends every selected line in ONE call, grouped by order, with the carry decision', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, { importedCount: 3 }));
    const result = await submitOrderImport({
      lines: [
        { line: { id: 'ol1' }, qty: 2, docId: 'o1' },
        { line: { id: 'ol2' }, qty: 1, docId: 'o2' },
        { line: { id: 'ol3' }, qty: 4, docId: 'o1' },
      ],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying,
    });

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/b/sales-invoice/header/inv1/action/importOrderLines');
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), {
      orders: [
        { orderId: 'o1', lines: [{ sourceLineId: 'ol1', quantity: 2 }, { sourceLineId: 'ol3', quantity: 4 }] },
        { orderId: 'o2', lines: [{ sourceLineId: 'ol2', quantity: 1 }] },
      ],
      carryGlobalDiscount: true,
    });
    assert.deepEqual(result, { ok: true, count: 3, afterImportResult: { carried: true, pct: 5 } });
  });

  // The `ui` stub renders `key:params`, so the assertions prove the CODE was translated (with its
  // details), never the server's English prose.
  const ui = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

  it('renders a refusal by its code and details, never the English server text', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      json: async () => ({ error: {
        code: 'importQuantityExceedsPending', message: 'Cannot import 9 of Fernet: only 2 …',
        product: 'Fernet', requested: 9, pending: 2,
      } }),
    }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 9, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.deepEqual(result, {
      ok: false,
      error: 'backendError.importQuantityExceedsPending:{"product":"Fernet","requested":9,"pending":2}',
    });
  });

  it('sends nothing when every selected quantity is 0, and asks for a positive quantity', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, { importedCount: 0 }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 0, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.equal(globalThis.fetch.mock.calls.length, 0);
    assert.deepEqual(result, { ok: false, error: 'qtyMustBePositive' });
  });

  it('falls back to the generic import failure for an unknown import code', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false, json: async () => ({ error: { code: 'importSomethingNew', message: 'English text' } }),
    }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 1, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.deepEqual(result, { ok: false, error: 'failedToImportLines' });
  });

  // ETP-5828 — ONE availableOrderLines per order, covered lines included at 0, as a read.
  it('caps the selectable quantity with the action pending (drafts included), in one read', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [
      { id: 'ol2', lineNo: 20, 'product$_identifier': 'Pan', pendingQuantity: 0, unitPrice: 10 },
      { id: 'ol1', lineNo: 10, 'product$_identifier': 'Agua', pendingQuantity: 2, unitPrice: 10 },
    ]));
    const lines = await fetchLines({
      base: '/b', docId: 'o1', sharedContext: { invoiceId: 'inv1', alreadyImportedOrderLines: new Set() },
    });
    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/b/sales-invoice/header/inv1/action/availableOrderLines');
    assert.equal(opts.refreshVersion, false);
    assert.deepEqual(JSON.parse(opts.body), { orderId: 'o1', includeCovered: true });
    assert.deepEqual(lines.map(l => [l.id, l._productName, l._maxQty, l._lineNetAmount, l._alreadyImported]),
      [['ol1', 'Agua', 2, 20, false], ['ol2', 'Pan', 0, 0, true]]);
  });
});

describe('invoice order import (sales) — duplicate detection via the order line FK', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported set from the spec API key on existing invoice lines', async () => {
    installFetch({
      orders: [],
      invLines: [{ id: 'il1', [ORDER_LINE_FK]: 'ol1' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedOrderLines.has('ol1'));
  });

  it('ignores the legacy cOrderlineId key, which NEO never returns', async () => {
    installFetch({
      orders: [],
      invLines: [{ id: 'il1', cOrderlineId: 'ol9' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.alreadyImportedOrderLines.has('ol9'), false);
  });
});

describe('invoice order import (sales) — fetchDocuments invoice global-discount context', () => {
  afterEach(() => {
    mock.reset();
  });

  for (const { name, invLines, invoiceHeader, linesOk = true, headerOk = true, expected } of [
    {
      name: 'invoice with a % and lines',
      invLines: [{ id: 'il1' }],
      invoiceHeader: { etgoTotalDiscount: '5.00' },
      expected: { invoiceGlobalDiscount: 5, invoiceHasLines: true, invoiceStateKnown: true },
    },
    {
      name: 'invoice without % nor lines',
      invLines: [],
      invoiceHeader: { etgoTotalDiscount: 0 },
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: true },
    },
    {
      name: 'header GET non-OK',
      invLines: [],
      invoiceHeader: { etgoTotalDiscount: '5.00' },
      headerOk: false,
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: false },
    },
    {
      name: 'lines GET non-OK',
      invLines: [{ id: 'il1' }],
      invoiceHeader: { etgoTotalDiscount: 0 },
      linesOk: false,
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: false },
    },
  ]) {
    it(`exposes the invoice % and whether it has lines: ${name}`, async () => {
      installFetch({ orders: [], invLines, invoiceHeader, linesOk, headerOk });
      const { sharedContext } = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
      assert.equal(sharedContext.invoiceGlobalDiscount, expected.invoiceGlobalDiscount);
      assert.equal(sharedContext.invoiceHasLines, expected.invoiceHasLines);
      assert.equal(sharedContext.invoiceStateKnown, expected.invoiceStateKnown);
    });
  }
});

// Restored from the pre-unification purchase popup tests (ImportFromPurchaseOrderModal.test.js):
// the CLIENT path (purchases, importVia 'client') still builds and POSTs each invoice line.
describe('invoice order import (purchase, client path) — buildOrderInvoiceLineBody', () => {
  const buildLineBody = (args) => buildOrderInvoiceLineBody(args);
  const PURCHASE_ORDER_LINE_FK = orderLineApiKey('purchase-invoice');
  const line = {
    id: 'ol1',
    product: 'p1',
    description: 'Entrega especial',
    unitPrice: 10,
    listPrice: 10,
    tax: 't1',
    uOM: 'u1',
  };

  it('carries the order line description into the built invoice line body', () => {
    const result = buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result.description, 'Entrega especial');
  });

  it('computes the line net amount from the unit price and the imported quantity', () => {
    const result = buildLineBody({ line, qty: 3, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result.invoicedQuantity, 3);
    assert.equal(result.lineNetAmount, 30);
  });

  // ETP-5381 REGRESSION GUARD: posting the FK under a key the spec does not declare makes
  // NeoFieldFilter drop it silently (HTTP 200, line created, C_OrderLine_ID NULL).
  it('sends the source order line under the spec API key for C_OrderLine_ID', () => {
    const result = buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result[PURCHASE_ORDER_LINE_FK], 'ol1');
    assert.equal(Object.hasOwn(result, 'cOrderlineId'), false);
  });

  // ETP-5710: an order line without a list price but with a discount used to post U == L +
  // etgoDiscount, which the server reads as "not yet discounted" and discounts a second time.
  for (const [name, input, listPrice] of [
    ['reconstructs the list price when the order line has none and a discount', { unitPrice: 90, listPrice: 0, discount: 10 }, 100],
    ['keeps the order line list price when it has one', { unitPrice: 90, listPrice: 100, discount: 10 }, 100],
    ['falls back to the unit price without a discount', { unitPrice: 10, listPrice: 0 }, 10],
    ['falls back to the unit price with a 100 percent discount', { unitPrice: 0, listPrice: 0, discount: 100 }, 0],
    ['rounds the reconstructed list price to 6 decimals', { unitPrice: 10, listPrice: 0, discount: 3 }, 10.309278],
  ]) {
    it(name, () => {
      const result = buildLineBody({ line: { ...line, ...input }, qty: 1, invoiceId: 'inv1', lineNo: 10 });
      assert.equal(result.listPrice, listPrice);
      if (input.discount && input.discount < 100) assert.equal(result.etgoDiscount, input.discount);
    });
  }
});
