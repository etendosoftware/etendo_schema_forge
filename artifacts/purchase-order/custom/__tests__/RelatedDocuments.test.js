import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RelatedDocuments.jsx'), 'utf8');

describe('purchase-order RelatedDocuments', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RelatedDocuments/);
  });

  it('fetches goods-receipt and purchase-invoice as related specs', () => {
    assert.match(src, /specName:\s*'goods-receipt'/);
    assert.match(src, /specName:\s*'purchase-invoice'/);
  });

  // ETP-4779 — QA regression: confirming a Purchase Order (or generating a
  // Goods Receipt / Purchase Invoice from the "Gestionar" flow) never updated
  // the "Documentos" section without a manual page refresh — even though
  // PurchaseOrderActions.jsx already dispatched a
  // purchase-order:document-created event (ConfirmModal.handleConfirm,
  // CreateDocsModal.handleCreate) right after each derived document was
  // created. Root cause: nothing in this component was listening for it — the
  // only refresh trigger was the manual 🔄 button (RelatedDocumentsShell
  // onRefresh bumping the local refreshKey). Fix: add the same
  // window.addEventListener('purchase-order:document-created', ...) pattern
  // sales-order/custom/RelatedDocuments.jsx already uses for
  // sales-order:document-created.
  describe('auto-refresh on purchase-order:document-created (ETP-4779)', () => {
    it('listens for the purchase-order:document-created custom event', () => {
      assert.match(src, /addEventListener\(\s*['"]purchase-order:document-created['"]/);
    });

    it('removes the listener on cleanup', () => {
      assert.match(src, /removeEventListener\(\s*['"]purchase-order:document-created['"]/);
    });

    it('bumps refreshKey (the same dependency that drives the fetch effect) when the event fires', () => {
      assert.match(
        src,
        /const handler = \(\) => setRefreshKey\(k => k \+ 1\);\s*window\.addEventListener\(\s*['"]purchase-order:document-created['"],\s*handler\)/,
      );
    });

    it('keeps refreshKey in the related-docs fetch effect dependency array', () => {
      // ETP-4576 dropped `token` from the dependency array with the credential
      // itself: the request helpers read the active session scheme instead.
      assert.match(src, /\[recordId, apiBaseUrl, refreshKey\]/);
    });
  });
});
