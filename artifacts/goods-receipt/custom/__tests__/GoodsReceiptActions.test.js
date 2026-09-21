import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAdjacentStatements } from '../../../_test-support/sourceAdjacency.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsReceiptActions.jsx'), 'utf8');

describe('GoodsReceiptActions', () => {
  it('exports a default function component named GoodsReceiptActions', () => {
    assert.match(src, /export default function GoodsReceiptActions/);
  });

  describe('Create Invoice button visibility', () => {
    it('only shows the Create Invoice button when isCompleted and not isFullyInvoiced', () => {
      assert.match(src, /isCompleted\s*&&\s*!isFullyInvoiced/);
    });

    it('gates isCompleted on documentStatus being CO', () => {
      assert.match(src, /data\?\.documentStatus\s*===\s*['"]CO['"]/);
    });

    it('computes isFullyInvoiced from invoiceStatus >= 100', () => {
      assert.match(src, /isFullyInvoiced\s*=\s*\(parseFloat\(data\?\.invoiceStatus\s*\?\?\s*0\)\)\s*>=\s*100/);
    });
  });

  describe('ETP-4028 — CreateInvoiceConfirmModal price-list picker wiring', () => {
    it('imports CreateInvoiceConfirmModal', () => {
      assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
    });

    it('renders CreateInvoiceConfirmModal with showPriceListPicker enabled', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?showPriceListPicker[\s\S]*?\/>/);
    });

    it('passes isSOTrx={false} — goods-receipt offers PURCHASE price lists, not sales', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?isSOTrx=\{false\}[\s\S]*?\/>/);
    });

    it('passes apiBaseUrl through to the modal (required for the price-list fetch)', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?apiBaseUrl=\{apiBaseUrl\}[\s\S]*?\/>/);
    });

    // ETP-5333 — onConfirm used to be an inline arrow that closed the modal
    // SYNCHRONOUSLY on click, before the request even started (no loading
    // feedback). It is now wired directly to handleCreateInvoice, which closes
    // the modal itself only once the request succeeds (see the assertions
    // below and the ETP-5333 describe block further down).
    it('onConfirm is wired directly to handleCreateInvoice (no inline synchronous close)', () => {
      assert.match(src, /onConfirm=\{handleCreateInvoice\}/);
    });

    it('handleCreateInvoice accepts priceListId and threads it into the POST body', () => {
      assert.match(src, /const handleCreateInvoice = async \(priceListId\) => \{/);
      assert.match(
        src,
        /body: JSON\.stringify\(\{ priceListId \}\)/,
      );
    });

    it('posts to the createPurchaseInvoice action (not the sales-side createDraftInvoice)', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{recordId\}\/action\/createPurchaseInvoice/);
    });
  });

  describe('i18n compliance', () => {
    it('imports useUI from @/i18n', () => {
      assert.match(src, /useUI/);
      assert.match(src, /from\s*['"]@\/i18n['"]/);
    });
  });

  // ETP-4779 — QA regression: the "Documentos" related-docs section on
  // Purchase Goods Receipt required a manual page reload to show a newly
  // generated Purchase Invoice / return-to-vendor shipment. Root cause: this
  // component discarded the `onRefresh` prop DetailView's topbarRight slot
  // already passes (see DetailView.jsx TopbarRightComponent), calling a full
  // `window.location.reload()` instead — which is also visibly slower and
  // loses in-memory client state (scroll position, other open modals).
  describe('partial refresh instead of full page reload (ETP-4779)', () => {
    it('accepts an onRefresh prop', () => {
      assert.match(src, /export default function GoodsReceiptActions\(\{[^}]*onRefresh[^}]*\}\)/);
    });

    it('never calls window.location.reload', () => {
      assert.doesNotMatch(src, /window\.location\.reload/);
    });

    it('calls onRefresh (not a reload) when closing the invoice-confirmation result modal, unless the user navigated away', () => {
      assert.match(
        src,
        /setConfirmedDocs\(null\);\s*setTimeout\(\(\) => \{\s*[\s\S]*?if\s*\(!resultNavigatedRef\.current\)\s*onRefresh\?\.\(\);/,
      );
    });

    it('calls onRefresh (not a reload) when closing the purchase-return result modal, unless the user navigated away', () => {
      assert.match(
        src,
        /setReturnedDoc\(null\);\s*setTimeout\(\(\) => \{\s*[\s\S]*?if\s*\(!resultNavigatedRef\.current\)\s*onRefresh\?\.\(\);/,
      );
    });
  });

  // ETP-5333 — regression guard. handleCreateInvoice used to be called from an
  // inline onConfirm that closed the modal (setShowInvoiceConfirm(false))
  // SYNCHRONOUSLY on click, before the request even started — no loading
  // feedback, then a second (result) modal popped up once the request
  // resolved. The fix moves setShowInvoiceConfirm(false) inside
  // handleCreateInvoice's own SUCCESS branch, right before setConfirmedDocs,
  // and passes `loading={creatingInvoice}` straight through to
  // CreateInvoiceConfirmModal so it can show its own spinner/label while the
  // modal stays mounted.
  describe('handleCreateInvoice — modal closes only on success, right before setConfirmedDocs (ETP-5333)', () => {
    // Adjacency is asserted through assertAdjacentStatements, which strips
    // comments first: the property under test is "no intervening STATEMENT",
    // not "no intervening CHARACTERS". The raw `\s*` version of this regex
    // broke when ETP-5381 added an explanatory comment above setConfirmedDocs —
    // a change with no behavioural effect. A real statement inserted between
    // the two calls still fails, which is the regression this guards against.
    it('calls setShowInvoiceConfirm(false) immediately before setConfirmedDocs inside the success path', () => {
      assertAdjacentStatements(
        src,
        [
          /const invData = \(await res\.json\(\)\)\?\.response\?\.data;/,
          /setShowInvoiceConfirm\(false\);/,
          /setConfirmedDocs\(\{/,
        ],
        'expected setShowInvoiceConfirm(false) to run right before setConfirmedDocs({...}) on success',
      );
    });

    it('does NOT close the modal inside the catch (error) branch — it must stay open on failure so the user can retry', () => {
      const handlerBlock = src.match(/const handleCreateInvoice = async[\s\S]*?\n  \};/);
      assert.ok(handlerBlock, 'expected the handleCreateInvoice function body');
      const catchBlock = handlerBlock[0].match(/\} catch \(err\) \{[\s\S]*?\} finally \{/);
      assert.ok(catchBlock, 'expected a catch block inside handleCreateInvoice');
      assert.doesNotMatch(catchBlock[0], /setShowInvoiceConfirm\(false\)/);
      assert.match(catchBlock[0], /toast\.error\(/);
    });

    it('guards re-entrant calls with the creatingInvoice flag before doing anything else', () => {
      assert.match(
        src,
        /const handleCreateInvoice = async \(priceListId\) => \{\s*if \(creatingInvoice\) return;\s*setCreatingInvoice\(true\);/,
      );
    });

    it('passes loading={creatingInvoice} to CreateInvoiceConfirmModal', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?loading=\{creatingInvoice\}[\s\S]*?\/>/);
    });

    it('always resets creatingInvoice in a finally block, regardless of success or failure', () => {
      const handlerBlock = src.match(/const handleCreateInvoice = async[\s\S]*?\n  \};/);
      assert.ok(handlerBlock, 'expected the handleCreateInvoice function body');
      assert.match(handlerBlock[0], /\} finally \{\s*setCreatingInvoice\(false\);\s*\}/);
    });
  });
});
