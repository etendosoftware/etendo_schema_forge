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

  // ETP-5302 — the runner no longer owns what happens to the result: it RETURNS
  // `{ ok, failed }` and the component decides (refetch in place, or the legacy
  // persist + full reload when no `refresh` is available). The raw
  // `sessionStorage.setItem` write and the local STORAGE_KEY const are gone —
  // persistence now lives in useBulkActionToast's `persistBulkActionResult`, so the
  // storage key and payload shape exist in exactly one place.
  it('runner returns the aggregate result instead of persisting it', () => {
    assert.match(src, /return \{ ok, failed \};/);
    assert.doesNotMatch(src, /sessionStorage\.setItem/);
    assert.doesNotMatch(src, /STORAGE_KEY/);
  });

  it('accepts the refresh callback handed down by the bulkActions slot', () => {
    assert.match(src, /export default function BulkOrderMoreMenu\(\{[^}]*\brefresh\b[^}]*\}\)/);
  });

  // PRIMARY path. The old full-page reload was never about the data — it was how the
  // result toast survived, since it was parked in sessionStorage for the next mount
  // of useBulkActionToast to read. Showing the toast directly removes the only reason
  // to reload, so scroll position, active filters and the SPA boot all survive.
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

  // FALLBACK path only — a host that mounts this menu outside ListView's
  // `bulkActions` slot has no in-place refetch to offer, so the result must still be
  // handed across a reload rather than dropped on the floor.
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

  // Regression guard: reaching `showResult` by mounting `useBulkActionToast()` here
  // would also install the hook's sessionStorage-DRAINING effect, which re-runs on
  // every `ui` identity change and eats this component's own persisted result before
  // the fallback reload can hand it to the next mount. The exported pure function
  // has no effect and is the only safe way in.
  it('imports the pure showBulkActionToast helper and never mounts the hook itself', () => {
    assert.doesNotMatch(src, /useBulkActionToast\(\)/);
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
    // module-level helpers cannot hold a hook, so they use the module apiFetch under an alias
    assert.match(src, /\b(?:module)?[aA]piFetch\(/);
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
