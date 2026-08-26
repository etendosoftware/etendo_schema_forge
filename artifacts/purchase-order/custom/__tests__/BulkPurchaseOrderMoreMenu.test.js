import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Comment text mentioning the old header would satisfy a doesNotMatch on the raw
// source, so the negative assertions below read the code only.
function stripComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkPurchaseOrderMoreMenu.jsx'), 'utf8');

describe('BulkPurchaseOrderMoreMenu source', () => {
  it('exports BulkPurchaseOrderMoreMenu as default component', () => {
    assert.match(src, /export default function BulkPurchaseOrderMoreMenu/);
  });

  it('returns null when no rows are selected', () => {
    assert.match(src, /selectedRows\.length === 0/);
    assert.match(src, /return null/);
  });

  it('renders the kebab trigger using MoreVertical', () => {
    assert.match(src, /import\s+\{[^}]*MoreVertical[^}]*\}\s+from\s+'lucide-react'/);
    assert.match(src, /<MoreVertical\b/);
  });

  it('renders two DropdownMenuItem entries with Receipt and Truck icons', () => {
    assert.match(src, /import\s+\{[^}]*Receipt[^}]*\}\s+from\s+'lucide-react'/);
    assert.match(src, /import\s+\{[^}]*Truck[^}]*\}\s+from\s+'lucide-react'/);
    const items = src.match(/<DropdownMenuItem\b/g) || [];
    assert.equal(items.length, 2, 'expected exactly two DropdownMenuItem entries');
    assert.match(src, /<Receipt\b/);
    assert.match(src, /<Truck\b/);
  });

  it('uses Promise.allSettled to process rows in parallel', () => {
    assert.match(src, /Promise\.allSettled/);
  });

  it('persists result to sessionStorage before reload', () => {
    assert.match(src, /sessionStorage\.setItem\(\s*STORAGE_KEY/);
    assert.match(src, /STORAGE_KEY\s*=\s*'bulkActionResult'/);
  });

  it('reloads the page and clears selection after run', () => {
    assert.match(src, /clearSelection\(\)/);
    assert.match(src, /window\.location\.reload\(\)/);
  });

  it('skips orders not in CO with the poBulkOrderNotCompleted i18n key', () => {
    assert.match(src, /COMPLETED\s*=\s*'CO'/);
    assert.match(src, /status\s*!==\s*COMPLETED/);
    assert.match(src, /ui\(\s*'poBulkOrderNotCompleted'\s*\)/);
  });

  it('checks for existing draft purchase invoice via the purchase-invoice header criteria query', () => {
    // No checkDraftPurchaseInvoice endpoint exists server-side; the helper
    // hits the entity directly filtered by the originating order.
    assert.match(src, /purchase-invoice\/header\?criteria=/);
    assert.match(src, /salesOrder/);
    assert.match(src, /hasDraftPurchaseInvoice/);
    assert.match(src, /'poBulkOrderHasDraftInvoice'/);
  });

  it('checks for existing draft goods receipt via goods-receipt criteria query', () => {
    assert.match(src, /goods-receipt\/goodsReceipt\?criteria=/);
    assert.match(src, /hasDraftGoodsReceipt/);
    assert.match(src, /'poBulkOrderHasDraftReceipt'/);
    assert.match(src, /DRAFT\s*=\s*'DR'/);
  });

  it('fail-open: pre-check helpers return false on error', () => {
    // Both helpers wrap the fetch in try/catch and `return false` so a flaky
    // network never blocks the create call — same pattern as the SO kebab.
    assert.match(src, /catch\s*\{\s*return false;?\s*\}/);
  });

  it('creates documents via createPurchaseInvoice and createGoodsReceipt endpoints', () => {
    assert.match(src, /action\s*===\s*'createPurchaseInvoice'/);
    assert.match(src, /\$\{action\}/);
    assert.match(src, /'createPurchaseInvoice'/);
    assert.match(src, /'createGoodsReceipt'/);
  });

  it('posts an empty JSON body to the create endpoints', () => {
    assert.match(src, /method:\s*'POST'/);
    assert.match(src, /body:\s*JSON\.stringify\(\{\}\)/);
  });

  it('proves its writes through the shared write builder, not a hand-built bearer', () => {
    // ETP-4576 — this asserted `Authorization: `Bearer ${token}``. The call site no
    // longer chooses a scheme: writeHeaders() resolves it and carries the CSRF proof
    // the cookie session requires. The negative matters as much as the positive —
    // a reintroduced bearer here is exactly the regression that answers 403.
    assert.match(src, /writeHeaders\(\)/);
    assert.doesNotMatch(stripComments(src), /Authorization:\s*`Bearer/);
  });

  it('renders i18n labels for each menu item via useUI', () => {
    assert.match(src, /import\s+\{\s*useUI\s*\}\s+from\s+'@\/i18n'/);
    assert.match(src, /ui\(\s*'poBulkCreateInvoices'\s*\)/);
    assert.match(src, /ui\(\s*'poBulkCreateReceipts'\s*\)/);
  });

  it('disables both menu items while the run is in flight', () => {
    assert.match(src, /useState\(false\)/);
    assert.match(src, /disabled=\{running\}/);
  });

  it('aggregates failed rows with documentNo and message fields', () => {
    assert.match(src, /failed\s*=/);
    assert.match(src, /documentNo:\s*row\.documentNo/);
    assert.match(src, /message:\s*o\.reason\?\.message/);
  });
});
