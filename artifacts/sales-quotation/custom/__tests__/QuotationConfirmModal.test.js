import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationConfirmModal.jsx'), 'utf8');

describe('QuotationConfirmModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function QuotationConfirmModal/);
  });

  it('accepts quotationId, data, token, apiBaseUrl and onClose props', () => {
    assert.match(src, /quotationId/);
    assert.match(src, /apiBaseUrl/);
    assert.match(src, /onClose/);
  });

  describe('success state — created document label', () => {
    it('renders Invoice #X when an invoice was created (regression: was always Order #X)', () => {
      assert.match(
        src,
        /createdDoc\.type\s*===\s*'invoice'\s*\?\s*'invoiceDoc'\s*:\s*'orderDoc'/,
      );
    });

    it('still resolves the doc-label header from createdDoc.type', () => {
      assert.match(src, /createdDoc\.type\s*===\s*'order'\s*\?\s*ui\('sqOrderCreated'\)\s*:\s*ui\('soInvoiceCreated'\)/);
    });

    it('uses the View Invoice / View Order primary button label by createdDoc.type', () => {
      assert.match(src, /createdDoc\.type\s*===\s*'order'\s*\?\s*ui\('sqViewOrder'\)\s*:\s*ui\('soViewInvoice'\)/);
    });

    it('only renders the document-number span when documentNo is present', () => {
      assert.match(src, /createdDoc\.documentNo\s*&&\s*\(/);
    });

    it('appends the currency to the invoice total (regression: invoice branch used to drop the currency suffix)', () => {
      // Both order and invoice setCreatedDoc({ ... total: `${fmtNum(...)} ${currency}` ... }) shapes.
      const matches = src.match(/total:\s*`\$\{fmtNum\([^)]+\)\}\s+\$\{currency\}`/g) || [];
      assert.ok(
        matches.length >= 2,
        `Expected at least 2 currency-suffixed totals (order + invoice); found ${matches.length}`,
      );
    });
  });

  describe('UE totals (ETP-4006)', () => {
    it('trusts the server grand total as-is in Under Evaluation', () => {
      assert.match(src, /const grandTotal\s*=\s*Number\(d\.grandTotalAmount \?\? d\.grandTotal \?\? 0\) \|\| 0;/);
    });

    it('trusts the server subtotal as-is in Under Evaluation', () => {
      assert.match(src, /const totalLines\s*=\s*Number\(d\.summedLineAmount \?\? d\.totalLines \?\? d\.grandTotalAmount \?\? 0\) \|\| 0;/);
    });
  });

  describe('i18n', () => {
    it('uses the useUI() hook for translations', () => {
      assert.match(src, /from\s+['"]@\/i18n['"]/);
      assert.match(src, /useUI\(\)/);
    });

    it('does not hardcode the English strings "Order #" or "Invoice #"', () => {
      assert.doesNotMatch(src, /['"`]\s*Order\s+#/);
      assert.doesNotMatch(src, /['"`]\s*Invoice\s+#/);
    });
  });

  // ETP-4312: the arrow on the "go to document" button comes from code (a literal
  // " →" glyph after the label in JSX), never baked into the translatable label.
  describe('go-to-document button arrow (ETP-4312)', () => {
    it('renders the derived label followed by a literal " →" glyph in JSX', () => {
      assert.match(src, /\{goLabel\}\s*→/);
    });

    it('derives goLabel from createdDoc.type (sqViewOrder / soViewInvoice)', () => {
      assert.match(src, /createdDoc\.type\s*===\s*'order'\s*\?\s*ui\('sqViewOrder'\)\s*:\s*ui\('soViewInvoice'\)/);
    });
  });

  // ETP-4468: "Confirmar" must not discard an unsaved header edit — force-save
  // first (both order and invoice conversion paths), and the in-memory data
  // prop must win over the stale server fetch.
  describe('force-save before confirm (ETP-4468)', () => {
    it('accepts an onSave prop', () => {
      assert.match(src, /export default function QuotationConfirmModal\(\{[\s\S]*?onSave,?[\s\S]*?\}\)/);
    });

    it('in-memory data wins over the stale freshData fetch', () => {
      assert.match(src, /const d\s*=\s*data \|\| freshData \|\| \{\}/);
      assert.doesNotMatch(src, /const d\s*=\s*freshData \|\| data \|\| \{\}/);
    });

    it('calls onSave before either conversion POST and aborts on failure', () => {
      assert.match(
        src,
        /if\s*\(onSave\)\s*\{\s*const saved\s*=\s*await onSave\(\);\s*if\s*\(!saved\?\.id\)\s*\{[\s\S]*?setError\([\s\S]*?setLoading\(false\);\s*return;\s*\}\s*\}/,
      );
      // The onSave guard runs before both the order-conversion and the
      // invoice-conversion POST (single guard placed before the branch).
      const saveGuardIdx = src.indexOf('if (onSave) {');
      const orderPostIdx = src.indexOf('Convertquotation');
      const invoicePostIdx = src.indexOf('createDraftInvoice');
      assert.ok(saveGuardIdx >= 0 && orderPostIdx >= 0 && invoicePostIdx >= 0);
      assert.ok(saveGuardIdx < orderPostIdx);
      assert.ok(saveGuardIdx < invoicePostIdx);
    });

    it('shows the dedicated sqSaveBeforeConfirmError message on save-guard failure (not the generic soErrorOccurred)', () => {
      assert.match(src, /if\s*\(!saved\?\.id\)\s*\{\s*setError\(ui\('sqSaveBeforeConfirmError'\)\);/);
    });
  });
});
