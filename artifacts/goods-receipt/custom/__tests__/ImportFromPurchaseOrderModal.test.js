import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromPurchaseOrderModal.jsx'), 'utf8');

describe('ImportFromPurchaseOrderModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromPurchaseOrderModal/);
  });

  it('delegates to the shared ImportLinesModal', () => {
    assert.match(src, /import ImportLinesModal from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /<ImportLinesModal/);
  });

  describe('ETP-4028 — currency-aware fetchDocuments', () => {
    it('fetches the current receipt header to read its currency', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{receiptId\}/);
      assert.match(src, /receiptCurrency\s*=\s*\(await headerRes\.json\(\)\)\?\.response\?\.data\?\.\[0\]\?\.etgoCurrency/);
    });

    it('computes status/BP/pending-delivery candidates before applying the currency filter', () => {
      assert.match(
        src,
        /const candidates = all\.filter\(o =>\s*\n\s*o\.documentStatus === 'CO'\s*\n\s*&& o\.businessPartner === bpId\s*\n\s*&& Number\(o\.deliveryStatusPurchase \?\? 0\) < 100\s*\n\s*\);/,
      );
    });

    it('filters candidates by matching currency only when a receipt currency was resolved', () => {
      assert.match(
        src,
        /documents = receiptCurrency \? candidates\.filter\(o => o\.currency === receiptCurrency\) : candidates;/,
      );
    });

    it('flags excludedByCurrency only when eligible candidates exist but none match currency', () => {
      assert.match(
        src,
        /excludedByCurrency = !!receiptCurrency && documents\.length === 0 && candidates\.length > 0;/,
      );
    });

    it('returns documents, sharedContext, and excludedByCurrency from fetchDocuments', () => {
      assert.match(src, /return \{ documents, sharedContext: \{ draftInfo \}, excludedByCurrency \};/);
    });
  });

  it('passes noPurchaseOrdersMatchReceiptCurrency as the noCurrencyMatchMessageKey', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noPurchaseOrdersMatchReceiptCurrency"/);
  });
});
