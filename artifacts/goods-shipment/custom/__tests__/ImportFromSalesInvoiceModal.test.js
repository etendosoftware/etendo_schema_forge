// @covers artifacts/goods-shipment/custom/ImportFromSalesInvoiceModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { helpers } = loadCustomModule(
  join(__dirname, '..', 'ImportFromSalesInvoiceModal.jsx'),
  { moduleApiFetch: apiFetchToGlobalFetch },
);
const { fetchDocuments } = helpers;

const empty = { ok: true, json: async () => ({ response: { data: [] } }) };

describe('ImportFromSalesInvoiceModal — fetchDocuments (ETP-6002 IMP-3)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('asks the server for plain invoices only: ARI category, not rectificative', async () => {
    globalThis.fetch = mock.fn(async () => empty);
    await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'ship1' });
    const invoiceUrl = globalThis.fetch.mock.calls
      .map(c => decodeURIComponent(c.arguments[0]))
      .find(url => url.includes('/sales-invoice/header?'));
    assert.ok(invoiceUrl, 'the invoice list is requested');
    assert.match(invoiceUrl, /"fieldName":"transactionDocument\$documentCategory","operator":"equals","value":"ARI"/);
    assert.match(invoiceUrl, /"fieldName":"transactionDocument\$etsgIsRectificative","operator":"notEqual","value":true/);
  });
});
