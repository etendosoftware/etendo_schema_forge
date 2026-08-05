import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    it('onConfirm closes the confirm dialog and forwards the chosen priceListId to handleCreateInvoice', () => {
      assert.match(
        src,
        /onConfirm=\{\(priceListId\) => \{ setShowInvoiceConfirm\(false\); handleCreateInvoice\(priceListId\); \}\}/,
      );
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
});
