import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkOrderMoreMenu.jsx'), 'utf8');

describe('BulkOrderMoreMenu source', () => {
  it('exports BulkOrderMoreMenu as default component', () => {
    assert.match(src, /export default function BulkOrderMoreMenu/);
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

  it('skips orders not in CO with the soBulkOrderNotCompleted i18n key', () => {
    assert.match(src, /COMPLETED\s*=\s*'CO'/);
    assert.match(src, /status\s*!==\s*COMPLETED/);
    assert.match(src, /ui\(\s*'soBulkOrderNotCompleted'\s*\)/);
  });

  it('checks for existing draft invoice via the checkDraftInvoice action', () => {
    assert.match(src, /action\/checkDraftInvoice/);
    assert.match(src, /hasDraftInvoice/);
    assert.match(src, /ui\(\s*messageKey\s*\)/);
    assert.match(src, /'soBulkOrderHasDraftInvoice'/);
  });

  it('checks for existing draft shipment via goods-shipment criteria query', () => {
    assert.match(src, /goods-shipment\/goodsShipment\?criteria=/);
    assert.match(src, /salesOrder/);
    assert.match(src, /hasDraftShipment/);
    assert.match(src, /'soBulkOrderHasDraftShipment'/);
    assert.match(src, /DRAFT\s*=\s*'DR'/);
  });

  it('fail-open: pre-check helpers return false on error', () => {
    // Both helpers wrap the fetch in try/catch and `return false` to let the
    // create call proceed instead of blocking the row when the network is flaky.
    assert.match(src, /catch\s*\{\s*return false;?\s*\}/);
  });

  it('creates documents via createDraftInvoice and createShipment endpoints', () => {
    assert.match(src, /action\s*===\s*'createDraftInvoice'/);
    assert.match(src, /\$\{action\}/);
    // Both action names are present in the source so the menu items wire them.
    assert.match(src, /'createDraftInvoice'/);
    assert.match(src, /'createShipment'/);
  });

  it('posts an empty JSON body to the create endpoints', () => {
    assert.match(src, /method:\s*'POST'/);
    assert.match(src, /body:\s*JSON\.stringify\(\{\}\)/);
  });

  it('through apiFetch, never a hand-built credential header', () => {
    assert.match(src, /apiFetch\(/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer/);
  });

  it('renders i18n labels for each menu item via useUI', () => {
    assert.match(src, /import\s+\{\s*useUI\s*\}\s+from\s+'@\/i18n'/);
    assert.match(src, /ui\(\s*'soBulkCreateInvoices'\s*\)/);
    assert.match(src, /ui\(\s*'soBulkCreateShipments'\s*\)/);
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
