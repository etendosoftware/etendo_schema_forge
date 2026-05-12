import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const APP_SHELL_CUSTOM = join(ROOT, 'tools/app-shell/src/windows/custom');

function readArtifact(win, file) {
  return readFileSync(join(ARTIFACTS, win, 'custom', file), 'utf8');
}

function readAppShell(win, file) {
  return readFileSync(join(APP_SHELL_CUSTOM, win, file), 'utf8');
}

describe('BottomPanel rollout — all inline-editable windows', () => {
  describe('No-totals panels (goods / inventory / return-shipments)', () => {
    const CASES = [
      { win: 'goods-movements',          file: 'GoodsMovementsBottomPanel.jsx',        hasRelatedDocs: false },
      { win: 'goods-receipt',            file: 'GoodsReceiptBottomPanel.jsx',           hasRelatedDocs: true  },
      { win: 'goods-shipment',           file: 'GoodsShipmentBottomPanel.jsx',          hasRelatedDocs: true  },
      { win: 'internal-consumption',     file: 'InternalConsumptionBottomPanel.jsx',    hasRelatedDocs: false },
      { win: 'physical-inventory',       file: 'PhysicalInventoryBottomPanel.jsx',      hasRelatedDocs: false },
      { win: 'return-material-receipt',  file: 'ReturnMaterialReceiptBottomPanel.jsx',  hasRelatedDocs: true  },
      { win: 'return-to-vendor-shipment','file': 'ReturnToVendorShipmentBottomPanel.jsx', hasRelatedDocs: true },
    ];

    for (const { win, file, hasRelatedDocs } of CASES) {
      it(`${win}: wraps LinesBottomSection with showTotals={false}`, () => {
        const src = readArtifact(win, file);
        assert.match(src, /LinesBottomSection/, `${win}: missing LinesBottomSection`);
        assert.match(src, /showTotals=\{false\}/, `${win}: missing showTotals={false}`);
        assert.match(src, /export default function/, `${win}: missing default export`);
        if (hasRelatedDocs) {
          assert.match(src, /relatedDocuments=/, `${win}: missing relatedDocuments prop`);
        }
      });

      it(`${win}: attaches showLineTotals = false as static property`, () => {
        const src = readArtifact(win, file);
        const basename = file.replace('.jsx', '');
        assert.match(
          src,
          new RegExp(`${basename}\\.showLineTotals = false`),
          `${win}: missing .showLineTotals = false static property`,
        );
      });
    }
  });

  describe('With-totals panels (monetary documents)', () => {
    const CASES = [
      { win: 'payment-out',          file: 'PaymentOutBottomPanel.jsx'        },
      { win: 'purchase-order',       file: 'PurchaseOrderBottomPanel.jsx'     },
      { win: 'return-from-customer', file: 'ReturnFromCustomerBottomPanel.jsx'},
      { win: 'return-to-vendor',     file: 'ReturnToVendorBottomPanel.jsx'   },
      { win: 'sales-order',          file: 'OrderBottomPanel.jsx'             },
      { win: 'sales-quotation',      file: 'QuotationBottomPanel.jsx'         },
    ];

    for (const { win, file } of CASES) {
      it(`${win}: wraps LinesBottomSection with relatedDocuments, no showTotals override`, () => {
        const src = readArtifact(win, file);
        assert.match(src, /LinesBottomSection/, `${win}: missing LinesBottomSection`);
        assert.match(src, /relatedDocuments=/, `${win}: missing relatedDocuments prop`);
        assert.doesNotMatch(src, /showTotals=\{false\}/, `${win}: unexpected showTotals={false} — totals are expected`);
        assert.match(src, /export default function/, `${win}: missing default export`);
      });
    }
  });

  describe('sales-invoice InvoiceBottomPanel — rich static extension points', () => {
    const src = readArtifact('sales-invoice', 'InvoiceBottomPanel.jsx');

    it('wraps LinesBottomSection with relatedDocuments and notesExtra={SifDataTabs}', () => {
      assert.match(src, /LinesBottomSection/);
      assert.match(src, /relatedDocuments=\{RelatedDocuments\}/);
      assert.match(src, /notesExtra=\{SifDataTabs\}/);
    });

    it('imports SifDataTabs from the local module', () => {
      assert.match(src, /import SifDataTabs from '\.\/SifDataTabs'/);
    });

    it('imports ImportFromShipmentModal', () => {
      assert.match(src, /import ImportFromShipmentModal from '\.\/ImportFromShipmentModal'/);
    });

    it('declares InvoiceLinesEmptyState and attaches it as static linesEmptyState', () => {
      assert.match(src, /function InvoiceLinesEmptyState/);
      assert.match(src, /InvoiceBottomPanel\.linesEmptyState = InvoiceLinesEmptyState/);
    });

    it('InvoiceLinesEmptyState shows import-from-shipment button when businessPartner is set', () => {
      assert.match(src, /bpId/);
      assert.match(src, /handleImportClick/);
      assert.match(src, /ImportFromShipmentModal/);
    });

    it('declares InvoiceLineActions as a forwardRef component that exposes openImportModal', () => {
      assert.match(src, /InvoiceLineActions = forwardRef/);
      assert.match(src, /openImportModal/);
      assert.match(src, /useImperativeHandle/);
    });

    it('attaches InvoiceLineActions as static detailExtraActions', () => {
      assert.match(src, /InvoiceBottomPanel\.detailExtraActions = InvoiceLineActions/);
    });

    it('attaches lineMenuActions as a static function returning import-shipment menu item', () => {
      assert.match(src, /InvoiceBottomPanel\.lineMenuActions = function/);
      assert.match(src, /import-shipment/);
      assert.match(src, /importRef\.current\?\.openImportModal/);
    });
  });

  describe('payment-in PaymentBottomPanel — fully custom (no LinesBottomSection)', () => {
    const src = readArtifact('payment-in', 'PaymentBottomPanel.jsx');

    it('does NOT delegate to LinesBottomSection', () => {
      assert.doesNotMatch(src, /LinesBottomSection/);
    });

    it('exports a default function component', () => {
      assert.match(src, /export default function PaymentBottomPanel/);
    });

    it('renders the payment hero with fmtAmount and StatusTag', () => {
      assert.match(src, /function fmtAmount/);
      assert.match(src, /StatusTag/);
    });

    it('fetches linked invoices via finPaymentScheduleDetail and renders them', () => {
      assert.match(src, /finPaymentScheduleDetail/);
      assert.match(src, /linkedInvoices/);
      assert.match(src, /navigateToInvoice/);
    });

    it('renders an activity timeline fed from persistedNotes and system events', () => {
      assert.match(src, /activityEvents/);
      assert.match(src, /persistedNotes/);
      assert.match(src, /saveNote/);
    });

    it('uses useUI for all user-visible labels (no hardcoded English strings)', () => {
      assert.match(src, /useUI\(\)/);
      assert.match(src, /ui\('paymentCreated'\)/);
      assert.match(src, /ui\('unallocatedCredit'\)/);
      assert.match(src, /ui\('activity'\)/);
    });

    it('stores notes in the document description field with ISO timestamp prefix', () => {
      assert.match(src, /new Date\(\)\.toISOString\(\)/);
      assert.match(src, /description/);
    });
  });

  describe('purchase-invoice PurchaseInvoiceBottomPanel — delegated to LinesBottomSection (in artifacts)', () => {
    const src = readArtifact('purchase-invoice', 'PurchaseInvoiceBottomPanel.jsx');

    it('delegates to LinesBottomSection (standard shared layout)', () => {
      assert.match(src, /LinesBottomSection/);
    });

    it('passes RelatedDocuments as the relatedDocuments slot', () => {
      assert.match(src, /relatedDocuments=\{RelatedDocuments\}/);
    });

    it('passes SifDataTabs as the notesExtra slot', () => {
      assert.match(src, /notesExtra=\{SifDataTabs\}/);
    });

    it('declares PurchaseInvoiceLinesEmptyState and attaches as linesEmptyState', () => {
      assert.match(src, /function PurchaseInvoiceLinesEmptyState/);
      assert.match(src, /PurchaseInvoiceBottomPanel\.linesEmptyState/);
    });

    it('PurchaseInvoiceLinesEmptyState returns null when document is not in draft', () => {
      assert.match(src, /if \(!isDraft\) return null/);
    });

    it('uses useUI for all labels in the empty state', () => {
      assert.match(src, /useUI\(\)/);
      assert.match(src, /ui\('noLinesYet'\)/);
    });
  });
});
