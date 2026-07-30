import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromPurchaseInvoiceModal.jsx'), 'utf8');

describe('ImportFromPurchaseInvoiceModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromPurchaseInvoiceModal/);
  });

  it('delegates to the shared ImportLinesModal', () => {
    assert.match(src, /import ImportLinesModal from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /<ImportLinesModal/);
  });

  describe('ETP-4028 — currency-aware fetchDocuments (status/BP first, THEN currency)', () => {
    it('fetches the current receipt header to read its currency', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{receiptId\}/);
      assert.match(src, /receiptCurrency\s*=\s*\(await headerRes\.json\(\)\)\?\.response\?\.data\?\.\[0\]\?\.etgoCurrency/);
    });

    it('computes statusAndBpCandidates (status=CO + businessPartner match) BEFORE any currency filtering', () => {
      const statusIdx = src.indexOf('const statusAndBpCandidates');
      const currencyIdx = src.indexOf('const candidates = receiptCurrency');
      assert.ok(statusIdx !== -1, 'statusAndBpCandidates computation not found');
      assert.ok(currencyIdx !== -1, 'currency-filtered candidates computation not found');
      assert.ok(statusIdx < currencyIdx, 'statusAndBpCandidates must be computed before the currency filter');
    });

    it('applies the currency filter on top of statusAndBpCandidates, not on the raw list', () => {
      assert.match(
        src,
        /const candidates = receiptCurrency\s*\n\s*\? statusAndBpCandidates\.filter\(o => o\.currency === receiptCurrency\)\s*\n\s*: statusAndBpCandidates;/,
      );
    });

    it('flags excludedByCurrency only when status/BP-eligible docs exist but zero survive the currency filter', () => {
      assert.match(
        src,
        /excludedByCurrency = !!receiptCurrency\s*\n\s*&& candidates\.length === 0\s*\n\s*&& statusAndBpCandidates\.length > 0;/,
      );
    });

    it('does not conflate "zero statusAndBpCandidates to begin with" with excludedByCurrency', () => {
      // The excludedByCurrency formula must require statusAndBpCandidates.length > 0 —
      // i.e. it is false when there was nothing eligible to exclude in the first place.
      assert.match(src, /statusAndBpCandidates\.length > 0/);
    });

    it('further narrows documents by line-level goodsShipmentLine/invoicedQuantity AFTER the currency filter, without touching excludedByCurrency', () => {
      assert.match(
        src,
        /const documents = candidates\.filter\(inv => \{/,
      );
      // excludedByCurrency must already be computed (const, not reassigned) before this line-level filter
      const excludedIdx = src.indexOf('const excludedByCurrency');
      const documentsIdx = src.indexOf('const documents = candidates.filter');
      assert.ok(excludedIdx !== -1 && documentsIdx !== -1);
      assert.ok(excludedIdx < documentsIdx, 'excludedByCurrency must be finalized before the line-level documents filter runs');
    });

    it('returns sharedContext.linesCache and excludedByCurrency from fetchDocuments', () => {
      assert.match(src, /return \{ documents, sharedContext: \{ linesCache \}, excludedByCurrency \};/);
    });
  });

  it('passes noPurchaseInvoicesMatchReceiptCurrency as the noCurrencyMatchMessageKey', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noPurchaseInvoicesMatchReceiptCurrency"/);
  });
});
