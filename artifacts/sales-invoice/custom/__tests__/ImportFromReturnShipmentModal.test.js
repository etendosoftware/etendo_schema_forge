// @covers artifacts/sales-invoice/custom/ImportFromReturnShipmentModal.jsx
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
import { listAll, listLines, newestCreatedFirst, ImportLoadError } from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { pricingContextOf } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceImportPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { helpers: realHelpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromReturnShipmentModal.jsx'),
  { moduleApiFetch: apiFetchToGlobalFetch, listAll, listLines, pricingContextOf, newestCreatedFirst },
);

const ORDER_LINE_FK = orderLineApiKey('sales-invoice');

describe('ImportFromReturnShipmentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromReturnShipmentModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromReturnShipmentModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('lists return receipts through the invoice availableReturns action, covered ones included', () => {
    assert.match(src, /action: 'availableReturns', params: \{ includeCovered: true, detail: true \}/);
    assert.match(src, /eagerLoadLines=\{false\}/);
    assert.match(src, /isDocumentCovered=\{isReturnCovered\}/);
  });

  it('does NOT reference the removed mInoutlineId or the dead return-from-customer backend', () => {
    assert.doesNotMatch(src, /mInoutlineId/);
    assert.doesNotMatch(src, /return-from-customer/);
  });

  it('wires the return-shipment-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromReturnShipment"/);
    assert.match(src, /searchPlaceholderKey="searchReturnShipment"/);
    assert.match(src, /emptyMessageKey="noReturnShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noReturnShipmentsMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromReturnShipment"/);
  });

  it('reads return lines on expand through availableReturnLines and prices on expand and at import', () => {
    assert.match(src, /const fetchLines[\s\S]*resolveLinePrice/);
    assert.match(src, /action: 'availableReturnLines', params: \{ returnId: docId, includeCovered: true, detail: true \}/);
    assert.match(src, /const buildLineBody[\s\S]*resolveLinePrice/);
  });

  it('creates invoice lines via POST to sales-invoice/lines', () => {
    assert.match(src, /sales-invoice\/lines/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('negates quantity for ARI_RM return invoice lines', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
    assert.match(src, /lineNetAmount\s*=\s*negQty\s*\*\s*unitPrice/);
  });

  it('carries goodsShipmentLine and salesOrderLine forward on the created line', () => {
    assert.match(src, /goodsShipmentLine:\s*line\.id/);
    assert.match(src, /salesOrderLine:\s*line\.salesOrderLine\s*\|\|\s*null/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{handlers\.fetchDocuments\}/);
    assert.match(src, /fetchLines=\{handlers\.fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noReturnShipmentsMatchCurrency"/);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

/** The server's answer to `availableReturns` / `availableReturnLines` (null = refused). */
function installActions({ returns = [], returnLines = [] }) {
  globalThis.fetch = mock.fn(async (url, options) => {
    if (url.endsWith('/sales-invoice/header/inv1/action/availableReturns')) {
      if (returns === null) return { ok: false, json: async () => ({ error: { code: 'importInvalidParameter' } }) };
      assert.equal(JSON.parse(options.body).includeCovered, true);
      return { ok: true, json: async () => ({ response: { hasMore: false, data: returns } }) };
    }
    if (url.endsWith('/sales-invoice/header/inv1/action/availableReturnLines')) {
      if (returnLines === null) return { ok: false, json: async () => ({}) };
      const body = JSON.parse(options.body);
      assert.equal(body.includeCovered, true);
      assert.equal(body.returnId, 'r1');
      return mockRes(true, returnLines);
    }
    // The pricing the lines get on expand: header + product selector once, then the callout.
    if (url.includes('/sales-invoice/header/inv1')) return mockRes(true, [{ id: 'inv1', priceList: 'pl1' }]);
    if (url.includes('/sales-invoice/lines/selectors/')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.includes('/sales-invoice/lines/callout')) {
      const { field } = JSON.parse(options.body);
      const updates = field === 'product' ? { unitPrice: { value: 7 } } : { lineNetAmount: { value: 70 } };
      return { ok: true, json: async () => ({ updates }) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromReturnShipmentModal — documents listed (ETP-6099)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('lists what availableReturns answers, in its order, with the source shipments as secondary text', async () => {
    installActions({
      returns: [
        { id: 'r2', documentNo: 'RMR-2', date: '2026-02-01', pendingLines: 1, sourceDocumentNo: 'GS-1, GS-2' },
        { id: 'r1', documentNo: 'RMR-1', date: '2026-01-01', pendingLines: 0, sourceDocumentNo: null },
      ],
    });
    const out = await realHelpers.fetchDocuments({ base: '/b', bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(out.documents.map(d => d.id), ['r2', 'r1']);
    assert.equal(out.excludedByCurrency, false);
    assert.deepEqual(out.sharedContext, { invoiceId: 'inv1' });
    assert.deepEqual(realHelpers.getDocDisplay(out.documents[0]), { docNo: 'RMR-2', date: '2026-02-01', secondary: '#GS-1, GS-2' });
    assert.deepEqual(realHelpers.getDocDisplay(out.documents[1]), { docNo: 'RMR-1', date: '2026-01-01', secondary: '' });
  });

  it('hides a return with nothing left to credit (pendingLines 0) from its own row', () => {
    assert.equal(realHelpers.isReturnCovered({ pendingLines: 0 }), true);
    assert.equal(realHelpers.isReturnCovered({ pendingLines: 1 }), false);
  });

  it('rejects with ImportLoadError when the server refuses the read', async () => {
    installActions({ returns: null });
    await assert.rejects(realHelpers.fetchDocuments({ base: '/b', bpId: 'bp1', invoiceId: 'inv1' }), ImportLoadError);
  });
});

function calloutRes(ok, body) {
  return { ok, json: async () => body };
}

describe('ImportFromReturnShipmentModal — resolveLinePrice pricing cascade', () => {
  afterEach(() => {
    mock.reset();
  });

  it('resolves unitPrice and triggers the PriceActual cascade, merging tax/uOM from the second callout', async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.equal(url, '/b/sales-invoice/lines/callout');
      const body = JSON.parse(opts.body);
      calls += 1;
      if (calls === 1) {
        assert.equal(body.field, 'product');
        assert.equal(body.value, 'prod1');
        return calloutRes(true, { updates: { unitPrice: { value: 100 }, listPrice: { value: 100 } } });
      }
      assert.equal(body.field, 'PriceActual');
      assert.equal(body.value, '100');
      return calloutRes(true, { updates: { tax: { value: 'tax1' }, uOM: { value: 'Unit' }, lineNetAmount: { value: 100 } } });
    });
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, { currency: 'EUR' });
    assert.equal(calls, 2);
    assert.equal(result.unitPrice, 100);
    assert.equal(result.tax, 'tax1');
    assert.equal(result.uOM, 'Unit');
    assert.equal(result.lineNetAmount, 100);
  });

  it('falls back to grossUnitPrice as unitPrice when the product callout does not return a plain unitPrice', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.field === 'product') {
        return calloutRes(true, { updates: { grossUnitPrice: { value: 121 } } });
      }
      return calloutRes(true, { updates: {} });
    });
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, {});
    assert.equal(result.unitPrice, 121);
  });

  it('applies the standardPrice -> listPrice fallback when listPrice comes back zeroed', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.field === 'product') {
        return calloutRes(true, { updates: { standardPrice: { value: 50 }, listPrice: { value: 0 }, unitPrice: { value: 50 } } });
      }
      return calloutRes(true, { updates: {} });
    });
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, {});
    assert.equal(result.listPrice, 50);
  });

  it('does not trigger the PriceActual cascade when no unit price could be resolved', async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      return calloutRes(true, { updates: {} });
    });
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, {});
    assert.equal(calls, 1);
    assert.deepEqual(result, {});
  });

  it('returns an empty object when the product callout request fails', async () => {
    globalThis.fetch = mock.fn(async () => calloutRes(false, {}));
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, {});
    assert.deepEqual(result, {});
  });

  it('returns an empty object when fetch throws', async () => {
    globalThis.fetch = mock.fn(async () => { throw new Error('network down'); });
    const result = await realHelpers.resolveLinePrice('/b', 'prod1', 1, {});
    assert.deepEqual(result, {});
  });
});

describe('ImportFromReturnShipmentModal — lines shown on expand', () => {
  afterEach(() => {
    mock.reset();
  });

  const row = (over) => ({
    id: 'l1', lineNo: 10, product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1',
    movementQuantity: 10, pendingQuantity: 10, orderLine: 'o1', orderLineDiscount: 0, blockedReason: null, ...over,
  });
  const linesOf = async (rows) => {
    installActions({ returnLines: rows });
    return realHelpers.fetchLines({ base: '/b', docId: 'r1', sharedContext: { invoiceId: 'inv1' } });
  };

  const cases = [
    { name: 'offers the full returned quantity when nothing has been credited yet', over: {}, max: 10, imported: false },
    { name: 'offers the remaining 5 units when 5 of 10 were already credited (the reported bug)', over: { pendingQuantity: 5 }, max: 5, imported: false },
    { name: 'blocks the line at 0 once it is credited in full', over: { pendingQuantity: 0, blockedReason: 'creditedInFull' }, max: 0, imported: true },
    { name: 'blocks the line at 0 when its order line is already invoiced (conservative path)', over: { pendingQuantity: 0, blockedReason: 'orderLineInvoiced' }, max: 0, imported: true },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const [line] = await linesOf([row(c.over)]);
      assert.equal(line._maxQty, c.max);
      assert.equal(line._alreadyImported, c.imported);
    });
  }

  it('carries the order line under the spec key and its discount, priced by the callout on expand', async () => {
    const [line] = await linesOf([row({ orderLineDiscount: 15 })]);
    assert.equal(line[ORDER_LINE_FK], 'o1');
    assert.equal(line._orderDiscount, 15);
    assert.equal(line._productName, 'Widget');
    assert.equal(line._unitPrice, 7);
    assert.equal(line._lineNetAmount, 70);
    assert.equal(line._uOM, 'u1');
  });

  it('returns no lines for a return with no lines', async () => {
    assert.deepEqual(await linesOf([]), []);
  });

  it('rejects with ImportLoadError when the lines read is refused', async () => {
    installActions({ returnLines: null });
    await assert.rejects(realHelpers.fetchLines({ base: '/b', docId: 'r1', sharedContext: { invoiceId: 'inv1' } }), ImportLoadError);
  });
});

describe('ImportFromReturnShipmentModal — buildLineBody', () => {
  afterEach(() => {
    mock.reset();
  });

  const buildArgs = (line) => ({
    line,
    qty: 5,
    invoiceId: 'inv1',
    lineNo: 10,
    sharedContext: { invoiceHeader: {}, productAuxMap: {} },
    base: '/b',
    headers: {},
  });

  function stubCallout() {
    globalThis.fetch = mock.fn(async () => ({ ok: false, json: async () => ({}) }));
  }

  it('negates the imported quantity and derives a matching negative lineNetAmount', async () => {
    stubCallout();
    const body = await realHelpers.buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', _unitPrice: 10,
    }));
    assert.equal(body.invoicedQuantity, -5);
    assert.equal(body.lineNetAmount, -50);
  });

  it('always negates even if a caller mistakenly passes an already-negative qty', async () => {
    stubCallout();
    const body = await realHelpers.buildLineBody({
      ...buildArgs({ id: 'rl1', product: 'p1', _unitPrice: 10 }),
      qty: -3,
    });
    assert.equal(body.invoicedQuantity, -3);
  });

  it('sends the return line source order line under the spec API key for C_OrderLine_ID', async () => {
    stubCallout();
    const body = await realHelpers.buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: 'ol1', _unitPrice: 10,
    }));
    assert.equal(body[ORDER_LINE_FK], 'ol1');
    assert.equal(body.goodsShipmentLine, 'rl1');
  });

  it('does not send the order line under a key the NEO spec would silently drop', async () => {
    stubCallout();
    const body = await realHelpers.buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: 'ol1', _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, 'cOrderlineId'), false);
  });

  it('sends an explicit null when the return line has no linked order line', async () => {
    stubCallout();
    const body = await realHelpers.buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: null, _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, ORDER_LINE_FK), true);
    assert.equal(body[ORDER_LINE_FK], null);
  });
});

describe('ImportFromReturnShipmentModal — source shape (ETP-5381)', () => {
  it('never mentions the non-existent cOrderlineId key', () => {
    assert.doesNotMatch(src, /cOrderlineId/);
  });
});
