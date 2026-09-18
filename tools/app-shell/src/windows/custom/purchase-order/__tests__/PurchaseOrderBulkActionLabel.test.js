import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
// The bar's one document-action button lives in the artifact custom dir; its own
// source-reading test asserts the full wrapper contract, but the LABEL is a fact
// about what this window's selection bar shows, so it is pinned from here too.
const wrapperSrc = readFileSync(
  join(__dirname, '../../../../../../..', 'artifacts/purchase-order/custom/PurchaseOrderReactivateBulkAction.jsx'),
  'utf8',
);

// ETP-5302 — source-reading guard (same shape as the return-material-receipt /
// return-to-vendor-shipment window guards): this window's ListView is mocked in
// index.vitest.jsx, so the bulkActions slot is never actually invoked there and
// the labelKey that reaches BulkDocumentAction cannot be asserted through a render.
//
// ETP-5302 also collapsed the bar's TWO document-action buttons into one. ETP-5315
// had added its bulk Reactivate as a second BulkDocumentAction beside the
// pre-existing CO-only one, which is what the user saw on screen: "Procesar" +
// "Reactivar" side by side for a mixed selection, and a lone "Reactivar" for a
// completed-only one. Now PurchaseOrderReactivateBulkAction is the only one mounted
// and its dropdown carries both actions, so the guards below are about the COUNT of
// mounts as much as the label.
describe('PurchaseOrderWindow — single bulk action button, labelled process (ETP-5302)', () => {
  it('mounts PurchaseOrderReactivateBulkAction exactly once in the bulk-action bar', () => {
    const mounts = src.match(/<PurchaseOrderReactivateBulkAction\b/g) ?? [];
    assert.equal(mounts.length, 1);
  });

  it('mounts no second BulkDocumentAction of its own', () => {
    assert.doesNotMatch(src, /<BulkDocumentAction\b/);
    assert.doesNotMatch(src, /buildActions=/);
  });

  it('no longer imports BulkDocumentAction or the buildInOutActions builder', () => {
    assert.doesNotMatch(src, /from '@\/components\/contract-ui\/BulkDocumentAction'/);
    // Matched on the import line, not the bare identifier: the comment above the
    // surviving mount names `buildInOutActions` while explaining its retirement.
    assert.doesNotMatch(src, /import[^\n]*\bbuildInOutActions\b[^\n]*from/);
  });

  it('wires the one button to labelKey="process"', () => {
    assert.match(wrapperSrc, /<BulkDocumentAction[\s\S]{0,200}labelKey="process"/);
  });

  it('no longer uses the deleted confirmBulk / reactivateBulk label keys', () => {
    // Matched on the JSX, not the whole file: index.jsx's comment explains why the
    // `reactivateBulk` key was retired and names it while doing so.
    const bulkActionsBlock = src.match(/function PurchaseOrderBulkActions[\s\S]*?\n\}/);
    assert.ok(bulkActionsBlock, 'could not locate the PurchaseOrderBulkActions component');
    assert.doesNotMatch(bulkActionsBlock[0], /labelKey="(confirmBulk|reactivateBulk)"/);
    assert.doesNotMatch(wrapperSrc, /labelKey="(confirmBulk|reactivateBulk)"/);
  });
});
