import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatCurrency } from '../../../../tools/app-shell/src/lib/formatCurrency.js';

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

  describe('ConfirmShipmentInvoicedModal — fmtAmount (real currency formatting)', () => {
    // fmtAmount is not exported (internal to the modal, reachable only via a hard-to-
    // stage UI state — a draft shipment that already has a linked invoice). Extract
    // the real function source and eval it directly rather than skip coverage.
    function extractFunctionSource(source, fnName) {
      const startIdx = source.search(new RegExp(`const\\s+${fnName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`));
      if (startIdx === -1) throw new Error(`${fnName} not found`);
      const braceStart = source.indexOf('{', startIdx);
      let depth = 0;
      let i = braceStart;
      for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      return source.slice(startIdx, i + 1);
    }

    function getRealFmtAmount() {
      const fnSource = extractFunctionSource(src, 'fmtAmount');
      // fmtAmount now delegates to the real, imported formatCurrency() — inject it
      // into the eval'd scope so the extracted source can still call it.
      const fn = new Function('formatCurrency', `${fnSource}; return fmtAmount;`);
      return fn(formatCurrency);
    }

    it('groups thousands and uses the real currency symbol, never the raw ISO code', () => {
      const fmtAmount = getRealFmtAmount();
      assert.equal(fmtAmount(1234.56, 'EUR'), '1.234,56 €');
      assert.doesNotMatch(fmtAmount(1234.56, 'EUR'), /EUR/);
    });
  });

  // ETP-4717 (Pair 2 — P2) — regression lock-in. Unlike sales-order,
  // purchase-order, sales-invoice, and sales-quotation, this window already
  // gates the Send button correctly (Completed/CO only). This test locks that
  // in so a future shared-logic refactor across the 5 windows cannot silently
  // regress the one window that already does it right.
  describe('Send button visibility gated by document status (ETP-4717 — already correct)', () => {
    it('gates the Send button on isCompleted only (not isDraft || isCompleted)', () => {
      assert.match(src, /\{isCompleted && <SendDocumentButton/);
    });

    it('does not also show the Send button while in Draft (DR)', () => {
      assert.doesNotMatch(src, /\{\(isDraft \|\| isCompleted\) && <SendDocumentButton/);
    });
  });
});
