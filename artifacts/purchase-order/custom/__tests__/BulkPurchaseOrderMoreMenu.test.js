import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  // ETP-5302 — same split as the sales-order twin (BulkOrderMoreMenu): the runner
  // RETURNS `{ ok, failed }` and the component decides what to do with it. The raw
  // `sessionStorage.setItem` write and the local STORAGE_KEY const are gone —
  // persistence lives in useBulkActionToast's `persistBulkActionResult`.
  it('runner returns the aggregate result instead of persisting it', () => {
    assert.match(src, /return \{ ok, failed \};/);
    assert.doesNotMatch(src, /sessionStorage\.setItem/);
    assert.doesNotMatch(src, /STORAGE_KEY/);
  });

  it('accepts the refresh callback handed down by the bulkActions slot', () => {
    assert.match(src, /export default function BulkPurchaseOrderMoreMenu\(\{[^}]*\brefresh\b[^}]*\}\)/);
  });

  // PRIMARY path — refetch the rows in place instead of reloading the whole tab.
  it('primary path: clears the selection, shows the toast and refetches the list in place', () => {
    assert.match(src, /import \{[^}]*showBulkActionToast[^}]*\} from '@\/hooks\/useBulkActionToast'/);
    assert.match(
      src,
      /if \(refresh\) \{[\s\S]*?clearSelection\(\);[\s\S]*?showBulkActionToast\(ui, result\);[\s\S]*?refresh\(\);[\s\S]*?return;[\s\S]*?\}/,
    );
    const refreshBranch = src.indexOf('if (refresh)');
    const persist = src.indexOf('persistBulkActionResult(result)');
    assert.ok(refreshBranch > -1 && refreshBranch < persist, 'the refresh branch must short-circuit first');
    const branch = src.slice(refreshBranch, persist);
    assert.doesNotMatch(branch, /setTimeout/);
    assert.doesNotMatch(branch, /location\.reload/);
  });

  // FALLBACK path only — kept for a host mounted outside ListView's `bulkActions`
  // slot, which has no in-place refetch to offer.
  it('fallback path (no refresh): persists the result, then clears selection and reloads', () => {
    assert.match(src, /persistBulkActionResult\(result\)/);
    assert.match(
      src,
      /setTimeout\([\s\S]*?clearSelection\(\);[\s\S]*?window\.location\.reload\(\);[\s\S]*?\}, 600\)/,
    );
  });

  it('keeps exactly one reload call site (the fallback)', () => {
    const reloads = src.match(/window\.location\.reload\(\)/g) || [];
    assert.equal(reloads.length, 1);
  });

  // Mounting `useBulkActionToast()` here to reach `showResult` would also install the
  // hook's sessionStorage-DRAINING effect and eat this component's own persisted
  // result before the fallback reload could hand it over — use the pure helper.
  it('imports the pure showBulkActionToast helper and never mounts the hook itself', () => {
    assert.doesNotMatch(src, /useBulkActionToast\(\)/);
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

  it('through apiFetch, never a hand-built credential header', () => {
    // module-level helpers cannot hold a hook, so they use the module apiFetch under an alias
    assert.match(src, /\b(?:module)?[aA]piFetch\(/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer/);
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

  it('accepts windowReadOnly in its props', () => {
    assert.match(src, /export default function BulkPurchaseOrderMoreMenu\(\{[^}]*\bwindowReadOnly\b[^}]*\}\)/);
  });

  it('the early-return guard checks windowReadOnly (ETP-5205)', () => {
    // Two loose, independent checks — same style this file's own pre-existing
    // "returns null when no rows selected" coverage above already uses, not one
    // brittle exact-line regex a harmless reformat could break.
    assert.match(src, /\bwindowReadOnly\b/);
    const guardLine = src.split('\n').find((line) => line.includes('selectedRows.length === 0'));
    assert.ok(guardLine, 'expected to locate the early-return guard line');
    assert.match(guardLine, /windowReadOnly/);
  });
});
