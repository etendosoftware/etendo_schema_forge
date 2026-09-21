import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkInvoiceFromReceipt.jsx'), 'utf8');

// Mirrors artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js — same
// shared modal, same slot contract, same guards. isSOTrx={false} and the purchase-side
// endpoint/route are the only differences.
describe('BulkInvoiceFromReceipt', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function BulkInvoiceFromReceipt/);
  });

  it('accepts selectedRows, clearSelection, token, apiBaseUrl and refresh props', () => {
    assert.match(
      src,
      /export default function BulkInvoiceFromReceipt\(\{\s*selectedRows,\s*clearSelection,\s*token,\s*apiBaseUrl,\s*refresh\s*\}\)/,
    );
  });

  it('returns null when no rows are selected', () => {
    assert.match(src, /selectedRows\.length\s*<\s*1.*return null/s);
  });

  describe('invoiceable-row guard uses invoiceStatus, same field the single-record button uses', () => {
    it('filters by documentStatus CO', () => {
      assert.match(src, /documentStatus\s*===\s*'CO'/);
    });

    it('filters by invoiceStatus below 100', () => {
      assert.match(src, /parseFloat\(r\.invoiceStatus\s*\?\?\s*0\)\s*<\s*100/);
    });

    it('never reads the backend-only completelyInvoiced field', () => {
      assert.doesNotMatch(src, /r\.completelyInvoiced/);
    });
  });

  it('checks all selected receipts belong to the same business partner', () => {
    assert.match(src, /invoiceableRows\.every\(r\s*=>\s*r\.businessPartner\s*===\s*firstBp\)/);
  });

  describe('ETP-4028 — currencyCheck (mixed-currency selections block bulk invoicing)', () => {
    it('computes currencyCheck as a useMemo mirroring the bpCheck shape', () => {
      assert.match(src, /const currencyCheck = useMemo\(\(\) => \{/);
    });

    it('derives allSame by comparing every row.etgoCurrency to the first row', () => {
      assert.match(src, /const firstCurrency = invoiceableRows\[0\]\.etgoCurrency;/);
      assert.match(
        src,
        /const allSame = invoiceableRows\.every\(r => r\.etgoCurrency === firstCurrency\);/,
      );
    });

    it('requires currencyCheck.same (in addition to bpCheck.same) for canCreate', () => {
      assert.match(
        src,
        /const canCreate = invoiceableCount > 0 && bpCheck\.same && currencyCheck\.same;/,
      );
    });
  });

  // ── uses the shared modal, isSOTrx={false} ──────────────────────────────────
  describe('opens the shared CreateInvoiceConfirmModal for purchases', () => {
    it('imports CreateInvoiceConfirmModal', () => {
      assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
    });

    it('renders it with the price-list picker enabled for PURCHASE price lists (isSOTrx={false})', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?showPriceListPicker[\s\S]*?isSOTrx=\{false\}/);
    });

    it('passes a computed cardAmountLabel (real quote when resolvable, "N receipts" fallback otherwise)', () => {
      assert.match(src, /cardAmountLabel=\{cardAmountLabel\}/);
      assert.match(src, /\$\{invoiceableCount\} \$\{ui\('receipt'\)\}/);
      assert.doesNotMatch(src, /ui\('shipment'\)/);
    });

    it('passes the pre-summed pendingQtyTotal instead of a single-document pendingQtyUrl', () => {
      assert.match(src, /pendingQtyTotal=\{pendingQtyTotal\}/);
      assert.doesNotMatch(src, /pendingQtyUrl=/);
    });

    it('observes the picker selection via onPriceListChange (the modal owns priceListId internally)', () => {
      assert.match(src, /onPriceListChange=\{setSelectedPriceListId\}/);
    });
  });

  // ── the quote: real per-line price, order price when linked, Tarifa price otherwise ─
  // Mirrors goods-shipment's own quote logic, verified against Core's UpdatePricesAndAmounts.java:
  // a line related to a purchase order line is priced at THAT order line's own unitPrice,
  // ignoring the invoice's price list; only an unlinked line is priced from the chosen Tarifa.
  describe('quote — real price per line, not an estimate', () => {
    it('fetches receipt lines (product + salesOrderLine) to know each line\'s price source', () => {
      assert.match(src, /goodsReceiptLine\?parentId=/);
    });

    it('fetches pendingInvoiceLines per receipt from the goods-receipt spec', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{r\.id\}\/action\/pendingInvoiceLines/);
    });

    it('fetches the PURCHASE ORDER line\'s own price for lines that have one, independent of the chosen Tarifa', () => {
      assert.match(src, /purchase-order\/lines\/\$\{id\}/);
      assert.match(
        src,
        /\}, \[showModal, canCreate, invoiceableRows, base, apiFetch, token\]\);/,
      );
    });

    it('fetches the Tarifa price only for lines with NO linked order line, from purchase price lists (isSOTrx=false)', () => {
      assert.match(src, /purchase-invoice\/lines\/selectors\/M_Product_ID\?limit=500&offset=0&priceList=/);
      assert.match(src, /\.filter\(d => !d\.salesOrderLine\)/);
    });

    it('computes quoteAmount as pendingQty × (order price ?? tariff price), skipping unresolved lines', () => {
      assert.match(
        src,
        /const price = detail\.salesOrderLine\s*\n\s*\?\s*orderLinePrices\[detail\.salesOrderLine\]\s*\n\s*:\s*tariffPrices\[detail\.product\];/,
      );
      assert.match(src, /sum \+= qty \* price;/);
    });

    it('formats the resolved quote with the real receipt currency, never a bare number', () => {
      assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js'/);
      assert.match(src, /formatCurrency\(currencyCode, quoteAmount\)/);
    });
  });

  // ── auto-preselected Tarifa for a single receipt ────────────────────────────
  describe('auto-preselects the Tarifa when exactly one receipt is selected', () => {
    it('fetches the single-record header (only for N===1) to read resolvedPriceListId', () => {
      assert.match(src, /if \(!showModal \|\| invoiceableRows\.length !== 1\) \{ setResolvedPriceListId\(undefined\); return; \}/);
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{invoiceableRows\[0\]\.id\}`, \{ baseUrl: '', token \}/);
    });

    it('feeds it to the shared modal via data.resolvedPriceListId — the same field the single-record flow already uses', () => {
      assert.match(src, /data=\{\{ 'businessPartner\$_identifier': bpCheck\.name, resolvedPriceListId \}\}/);
    });
  });

  // ── request policy ──────────────────────────────────────────────────────────
  describe('uses the authenticated request helper, not a bare fetch', () => {
    it('imports useApiFetch', () => {
      assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js'/);
    });

    it('never calls the bare global fetch', () => {
      assert.doesNotMatch(src, /(?<![\w.])fetch\s*\(/);
    });
  });

  // ── creating the invoice — receiptIds, not shipmentIds ──────────────────────
  describe('creates the invoice via createPurchaseInvoice with receiptIds + priceListId', () => {
    it('posts to the goods-receipt createPurchaseInvoice action', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{invoiceableRows\[0\]\.id\}\/action\/createPurchaseInvoice/);
    });

    it('sends receiptIds and the chosen priceListId', () => {
      assert.match(src, /receiptIds:\s*invoiceableRows\.map\(r => r\.id\)/);
      assert.match(src, /priceListId/);
    });

    it('translates the backend error before toasting it', () => {
      assert.match(src, /import \{ translateBackendError \} from '@\/lib\/backendErrors\.js'/);
      assert.match(src, /toast\.error\(translateBackendError\(err\.message, ui\)/);
    });
  });

  // ── showing the result — purchase-invoice route ─────────────────────────────
  describe('shows the result through the shared ConfirmResultModal, portalled', () => {
    it('imports ConfirmResultModal from the contract-ui barrel', () => {
      assert.match(src, /import \{ ConfirmResultModal \} from '@\/components\/contract-ui'/);
    });

    it('portals the result modal (ConfirmResultModal does not self-portal)', () => {
      assert.match(src, /import \{ createPortal \} from 'react-dom'/);
      assert.match(src, /invoiceResult\?\.invoice\?\.id && createPortal\(/);
    });

    it('passes the created invoice id, documentNo and documentStatus into a facturaCompra doc', () => {
      assert.match(src, /type:\s*'facturaCompra'/);
      assert.match(src, /route:\s*`\/purchase-invoice\/\$\{invoiceResult\.invoice\.id\}`/);
      assert.match(src, /documentStatus:\s*invoiceResult\.invoice\.documentStatus/);
    });
  });

  // ETP-5302 — same rule as the sales sibling.
  describe('ETP-5302 — refetches the list after the result modal is dismissed', () => {
    it('calls clearSelection and refresh from the result modal onClose', () => {
      assert.match(
        src,
        /onClose=\{\(\)\s*=>\s*\{[\s\S]*?clearSelection\(\);[\s\S]*?refresh\?\.\(\);[\s\S]*?\}\}/,
      );
    });

    it('calls refresh optionally so a host that supplies no refresh cannot crash', () => {
      assert.match(src, /refresh\?\.\(\)/);
      assert.doesNotMatch(src, /[^?.]\brefresh\(\)/);
    });

    it('does not refetch on a plain cancel/close of the confirm modal', () => {
      assert.match(src, /onClose=\{\(\)\s*=>\s*setShowModal\(false\)\}/);
    });
  });
});
