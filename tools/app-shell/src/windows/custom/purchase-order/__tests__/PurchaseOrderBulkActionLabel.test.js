import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

// ETP-5302 — source-reading guard (same shape as the return-material-receipt /
// return-to-vendor-shipment window guards): this window's ListView is mocked in
// index.vitest.jsx, so the bulkActions slot is never actually invoked there and
// the labelKey it hands to BulkDocumentAction cannot be asserted through a render.
describe('PurchaseOrderWindow — bulk action button label (ETP-5302)', () => {
  it('wires BulkDocumentAction to labelKey="process"', () => {
    assert.match(
      src,
      /<BulkDocumentAction[\s\S]{0,200}labelKey="process"/,
    );
  });

  it('no longer uses the deleted confirmBulk label key', () => {
    assert.doesNotMatch(src, /confirmBulk/);
  });

  it('still builds its actions from the shared buildInOutActions helper', () => {
    assert.match(
      src,
      /<BulkDocumentAction[\s\S]{0,200}buildActions=\{buildInOutActions\}/,
    );
  });
});
