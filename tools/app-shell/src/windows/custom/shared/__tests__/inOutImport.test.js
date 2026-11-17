// @covers tools/app-shell/src/windows/custom/shared/inOutImport.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchInOutDocuments, fetchInOutLines, pendingDocumentTotal } from '../inOutImport.js';

const json = (ok, response) => ({ ok, json: async () => ({ response }) });

/**
 * A backend stub: the list action answers `listed`, the target header GET `header`
 * (`{ ok, currency }`), the source list GET `sources`. Records every URL.
 */
function backend({ listed = [], header = { ok: true, currency: 'EUR' }, sources = [], sourcesOk = true, throwOn } = {}) {
  const urls = [];
  const apiFetch = async (url) => {
    urls.push(url);
    if (throwOn && url === throwOn) throw new Error('boom');
    if (url.includes('/action/')) return json(true, { data: listed, hasMore: false });
    if (url.includes('/sales-invoice/header?')) return json(sourcesOk, { data: sources });
    return json(header.ok, { data: [{ etgoCurrency: header.currency }] });
  };
  return { apiFetch, urls };
}

const PROBE = { sourceHeader: 'sales-invoice/header' };
const ARGS = {
  base: '/b', spec: 'goods-shipment', entity: 'goodsShipment', targetId: 'gs1', bpId: 'bp1',
  action: 'availableInvoices', dateKey: 'invoiceDate', currencyProbe: PROBE,
};
const src = (id, currency, extra = {}) => ({ id, currency, documentStatus: 'CO', businessPartner: 'bp1', ...extra });

describe('inOutImport — the target entity in the NEO path', () => {
  for (const entity of ['goodsShipment', 'goodsReceipt']) {
    it(`${entity}: the list action, the currency-probe header GET and the line action use it`, async () => {
      const { apiFetch, urls } = backend();
      await fetchInOutDocuments({ apiFetch, ...ARGS, entity });
      await fetchInOutLines({ apiFetch, ...ARGS, entity, action: 'availableInvoiceLines', params: { invoiceId: 'i1' } });
      assert.deepEqual(urls.filter(u => !u.includes('/sales-invoice/header?')), [
        `/b/goods-shipment/${entity}/gs1/action/availableInvoices`,
        `/b/goods-shipment/${entity}/gs1`,
        `/b/goods-shipment/${entity}/gs1/action/availableInvoiceLines`,
      ]);
    });
  }

  it('maps each listed row: date under dateKey, status CO; no probe on a non-empty list', async () => {
    const { apiFetch, urls } = backend({ listed: [{ id: 'i1', date: '2026-10-01' }] });
    const out = await fetchInOutDocuments({ apiFetch, ...ARGS });
    assert.deepEqual(out, {
      documents: [{ id: 'i1', date: '2026-10-01', invoiceDate: '2026-10-01', documentStatus: 'CO' }],
      sharedContext: { targetId: 'gs1' },
      excludedByCurrency: false,
    });
    assert.equal(urls.length, 1);
  });

  it('fetchInOutLines resolves to [] without a target and makes no request', async () => {
    const { apiFetch, urls } = backend();
    assert.deepEqual(await fetchInOutLines({ apiFetch, ...ARGS, targetId: undefined, params: {} }), []);
    assert.equal(urls.length, 0);
  });
});

describe('inOutImport — empty list: excluded only by currency?', () => {
  for (const [name, setup, args, expected] of [
    ['every candidate in another currency', { sources: [src('i1', 'USD'), src('i2', 'GBP')] }, {}, true],
    ['mixed currencies, one matching the target', { sources: [src('i1', 'USD'), src('i2', 'EUR')] }, {}, false],
    ['no candidate at all', { sources: [] }, {}, false],
    ['the target header has no currency', { header: { ok: true, currency: null }, sources: [src('i1', 'USD')] }, {}, false],
    ['the target header GET fails', { header: { ok: false }, sources: [src('i1', 'USD')] }, {}, false],
    ['the source list GET fails', { sourcesOk: false, sources: [src('i1', 'USD')] }, {}, false],
    ['a request throws', { throwOn: '/b/goods-shipment/goodsShipment/gs1', sources: [src('i1', 'USD')] }, {}, false],
    ['rows of another partner or status are not candidates',
      { sources: [src('i1', 'USD', { businessPartner: 'bp2' }), src('i2', 'USD', { documentStatus: 'DR' })] }, {}, false],
    ['the probe isCandidate rule filters the candidates',
      { sources: [src('i1', 'USD', { rect: true })] },
      { currencyProbe: { ...PROBE, isCandidate: d => !d.rect } }, false],
  ]) {
    it(name, async () => {
      const { apiFetch } = backend(setup);
      const out = await fetchInOutDocuments({ apiFetch, ...ARGS, ...args });
      assert.deepEqual(out.documents, []);
      assert.equal(out.excludedByCurrency, expected);
    });
  }

  for (const [name, args] of [['without a probe', { currencyProbe: undefined }], ['without a partner', { bpId: null }]]) {
    it(`${name}: no probe request, not by currency`, async () => {
      const { apiFetch, urls } = backend({ sources: [src('i1', 'USD')] });
      const out = await fetchInOutDocuments({ apiFetch, ...ARGS, ...args });
      assert.equal(out.excludedByCurrency, false);
      assert.equal(urls.length, 1);
    });
  }

  it('the source GET asks partner + completed status plus the probe criteria', async () => {
    const { apiFetch, urls } = backend();
    const extra = { fieldName: 'documentType', operator: 'equals', value: 'ARI' };
    await fetchInOutDocuments({ apiFetch, ...ARGS, currencyProbe: { ...PROBE, criteria: [extra] } });
    const sourceUrl = urls.find(u => u.includes('/sales-invoice/header?'));
    const criteria = JSON.parse(new URLSearchParams(sourceUrl.split('?')[1]).get('criteria'));
    assert.deepEqual(criteria, [
      { fieldName: 'businessPartner', operator: 'equals', value: 'bp1' },
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
      extra,
    ]);
  });
});

describe('inOutImport — pendingDocumentTotal', () => {
  for (const [name, doc, expected] of [
    ['a numeric amount', { amount: 45.5 }, 45.5],
    ['a numeric string', { amount: '12' }, 12],
    ['zero is a total, not missing', { amount: 0 }, 0],
    ['missing amount', {}, null],
    ['null amount', { amount: null }, null],
    ['non-numeric amount', { amount: 'abc' }, null],
    ['no document', undefined, null],
  ]) {
    it(name, () => {
      assert.equal(pendingDocumentTotal(doc), expected);
    });
  }
});
