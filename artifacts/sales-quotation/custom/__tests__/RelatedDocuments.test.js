import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RelatedDocuments.jsx'), 'utf8');

describe('sales-quotation RelatedDocuments', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RelatedDocuments/);
  });

  // ETP-4779 — QA regression: converting a Sales Quotation into a Sales Order
  // or Invoice (QuotationConfirmModal) showed the newly generated document,
  // but only via a full window.location.reload(), not a partial refresh.
  // Fix: QuotationConfirmModal now dispatches a
  // sales-quotation:document-created event right after each conversion
  // succeeds (mirroring sales-order:document-created /
  // purchase-order:document-created), and this component listens for it to
  // bump its local refreshKey instead of requiring the manual 🔄 button.
  describe('auto-refresh on sales-quotation:document-created (ETP-4779)', () => {
    it('listens for the sales-quotation:document-created custom event', () => {
      assert.match(src, /addEventListener\(\s*['"]sales-quotation:document-created['"]/);
    });

    it('removes the listener on cleanup', () => {
      assert.match(src, /removeEventListener\(\s*['"]sales-quotation:document-created['"]/);
    });

    it('bumps refreshKey (the same dependency that drives the fetch effect) when the event fires', () => {
      assert.match(
        src,
        /const handler = \(\) => setRefreshKey\(k => k \+ 1\);\s*window\.addEventListener\(\s*['"]sales-quotation:document-created['"],\s*handler\)/,
      );
    });

    it('keeps refreshKey in the related-docs fetch effect dependency array', () => {
      // ETP-4576 dropped `token` from the dependency array with the credential
      // itself: the request helpers read the active session scheme instead.
      assert.match(src, /\[recordId, apiBaseUrl, refreshKey\]/);
    });
  });
});
