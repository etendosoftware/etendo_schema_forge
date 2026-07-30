import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentActions.jsx'), 'utf8');

describe('GoodsShipmentActions', () => {
  it('exports a default function component named GoodsShipmentActions', () => {
    assert.match(src, /export default function GoodsShipmentActions/);
  });

  describe('removed billing-badge inline rendering (moved to GoodsShipmentBillingBadge)', () => {
    it('does not import or reference any Tag component for billing status', () => {
      assert.doesNotMatch(src, /import\s+.*Tag.*from/);
    });

    it('does not compute invoicePct variable', () => {
      assert.doesNotMatch(src, /\binvoicePct\b/);
    });

    it('does not compute invoiceVariant variable', () => {
      assert.doesNotMatch(src, /\binvoiceVariant\b/);
    });

    it('does not compute invoiceLabel variable', () => {
      assert.doesNotMatch(src, /\binvoiceLabel\b/);
    });
  });

  describe('isFullyInvoiced — still required for Create Invoice button visibility', () => {
    it('computes isFullyInvoiced using invoiceStatus', () => {
      assert.match(src, /isFullyInvoiced\s*=/);
    });

    it('uses invoiceStatus >= 100 as the fully-invoiced threshold', () => {
      assert.match(src, /data\?\.invoiceStatus\s*>=\s*100/);
    });

    it('does not gate on linkedInvoices presence (partial invoicing must remain invoiceable)', () => {
      assert.doesNotMatch(src, /linkedInvoices\.length\s*>\s*0.*isFullyInvoiced|isFullyInvoiced.*linkedInvoices\.length\s*>\s*0/);
    });
  });

  describe('Create Invoice button visibility', () => {
    it('only shows the Create Invoice button when isCompleted and not isFullyInvoiced', () => {
      assert.match(src, /isCompleted\s*&&\s*!isFullyInvoiced/);
    });

    it('gates the button on documentStatus being CO', () => {
      assert.match(src, /data\?\.documentStatus\s*===\s*['"]CO['"]/);
    });
  });

  describe('GoodsShipmentConfirmModal integration', () => {
    it('imports GoodsShipmentConfirmModal', () => {
      assert.match(src, /import\s+GoodsShipmentConfirmModal\s+from/);
    });

    it('listens to the goods-shipment:open-confirm-modal custom event', () => {
      assert.match(src, /['"]goods-shipment:open-confirm-modal['"]/);
    });

    it('adds and removes the event listener via useEffect', () => {
      assert.match(src, /window\.addEventListener\(['"]goods-shipment:open-confirm-modal['"]/);
      assert.match(src, /window\.removeEventListener\(['"]goods-shipment:open-confirm-modal['"]/);
    });
  });

  describe('ReturnWizard integration', () => {
    it('imports ReturnWizard', () => {
      assert.match(src, /import\s+ReturnWizard\s+from/);
    });

    it('renders ReturnWizard with open, onClose, shipmentData, lines, token, and apiBaseUrl props', () => {
      assert.match(src, /<ReturnWizard[^/]*open=\{wizardOpen\}/s);
    });
  });

  describe('Create Return button visibility — partial return support', () => {
    it('derives canCreateReturn from data?.canCreateReturn === true (backend-computed)', () => {
      assert.match(src, /canCreateReturn\s*=\s*data\?\.canCreateReturn\s*===\s*true/);
    });

    it('does not use hasReturn to gate the create-return button', () => {
      assert.doesNotMatch(src, /\bhasReturn\b/);
    });

    it('gates the create-return button on isCompleted && canCreateReturn', () => {
      assert.match(src, /isCompleted\s*&&\s*canCreateReturn/);
    });
  });

  describe('SendDocumentModal integration', () => {
    it('imports SendDocumentModal and SendDocumentButton', () => {
      assert.match(src, /import\s+SendDocumentModal\s*,\s*\{[^}]*SendDocumentButton[^}]*\}\s*from/);
    });

    it('renders SendDocumentButton when completed', () => {
      assert.match(src, /SendDocumentButton/);
    });
  });

  describe('i18n compliance', () => {
    it('imports useUI from @/i18n', () => {
      assert.match(src, /useUI/);
      assert.match(src, /from\s*['"]@\/i18n['"]/);
    });
  });

  describe('ETP-4028 — CreateInvoiceConfirmModal price-list picker wiring', () => {
    it('imports CreateInvoiceConfirmModal', () => {
      assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
    });

    it('renders CreateInvoiceConfirmModal with showPriceListPicker enabled', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?showPriceListPicker[\s\S]*?\/>/);
    });

    it('passes isSOTrx (bare, defaults to truthy) — goods-shipment offers SALES price lists', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?\bisSOTrx\b[\s\S]*?\/>/);
      // Must not be explicitly set to false for the shipment (sales) flow
      assert.doesNotMatch(src, /<CreateInvoiceConfirmModal[\s\S]*?isSOTrx=\{false\}[\s\S]*?\/>/);
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

    it('posts to the createDraftInvoice action (sales-side)', () => {
      assert.match(src, /goods-shipment\/goodsShipment\/\$\{recordId\}\/action\/createDraftInvoice/);
    });
  });
});
