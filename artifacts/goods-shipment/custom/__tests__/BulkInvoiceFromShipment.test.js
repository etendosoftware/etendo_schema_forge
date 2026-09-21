import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkInvoiceFromShipment.jsx'), 'utf8');

// This bulk toolbar action used to open its own line-selection modal with editable
// quantities. It now opens the SAME "Gestionar documentos" modal (CreateInvoiceConfirmModal)
// the form-view "Crear Factura" button uses — the one with the Tarifa picker the bespoke
// modal never had. See the file's own header comment for the trade-off this implies (no
// per-line selection from the grid anymore).
describe('BulkInvoiceFromShipment', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function BulkInvoiceFromShipment/);
  });

  it('accepts selectedRows, clearSelection, token, apiBaseUrl and refresh props', () => {
    assert.match(
      src,
      /export default function BulkInvoiceFromShipment\(\{\s*selectedRows,\s*clearSelection,\s*token,\s*apiBaseUrl,\s*refresh\s*\}\)/,
    );
  });

  it('returns null when no rows are selected', () => {
    assert.match(src, /selectedRows\.length\s*<\s*1.*return null/s);
  });

  // ── invoiceable-row guard: invoiceStatus, not the always-true completelyInvoiced ───
  // `completelyInvoiced` is renamed to `invoiced` with grid:false/form:false in
  // decisions.json, so it never reaches a grid row — the old `r.completelyInvoiced !== true`
  // guard was a silent no-op. `invoiceStatus` (0-100 %) is the field the single-record
  // "Crear factura" button already uses for the same "already invoiced" gate.
  describe('invoiceable-row guard uses invoiceStatus, not completelyInvoiced', () => {
    it('filters by documentStatus CO', () => {
      assert.match(src, /documentStatus\s*===\s*'CO'/);
    });

    it('filters by invoiceStatus below 100, not the dead completelyInvoiced field', () => {
      assert.match(src, /parseFloat\(r\.invoiceStatus\s*\?\?\s*0\)\s*<\s*100/);
      assert.doesNotMatch(src, /r\.completelyInvoiced/);
    });
  });

  it('checks all selected shipments belong to the same business partner', () => {
    assert.match(src, /invoiceableRows\.every\(r\s*=>\s*r\.businessPartner\s*===\s*firstBp\)/);
  });

  describe('ETP-4028 — currencyCheck (mixed-currency selections block bulk invoicing)', () => {
    it('computes currencyCheck as a useMemo mirroring the bpCheck shape', () => {
      assert.match(src, /const currencyCheck = useMemo\(\(\) => \{/);
    });

    it('returns { same: false } when there are no invoiceable rows', () => {
      assert.match(
        src,
        /const currencyCheck = useMemo\(\(\) => \{\s*\n\s*if \(invoiceableRows\.length === 0\) return \{ same: false \};/,
      );
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

    it('shows the selectShipmentsSameCurrency tooltip only when the BP check passes but currency differs', () => {
      assert.match(
        src,
        /!bpCheck\.same\s*\n\s*\?\s*ui\('selectShipmentsSameCustomer'\)\s*\n\s*:\s*!currencyCheck\.same\s*\n\s*\?\s*ui\('selectShipmentsSameCurrency'\)/,
      );
    });
  });

  // ── the shared modal, not the bespoke one ──────────────────────────────────────
  describe('opens the shared CreateInvoiceConfirmModal', () => {
    it('imports CreateInvoiceConfirmModal', () => {
      assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
    });

    it('renders it with the price-list picker enabled for sales', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?showPriceListPicker[\s\S]*?isSOTrx/);
    });

    it('passes a computed cardAmountLabel (real quote when resolvable, "N shipments" fallback otherwise)', () => {
      assert.match(src, /cardAmountLabel=\{cardAmountLabel\}/);
    });

    it('passes the pre-summed pendingQtyTotal instead of a single-document pendingQtyUrl', () => {
      assert.match(src, /pendingQtyTotal=\{pendingQtyTotal\}/);
      assert.doesNotMatch(src, /pendingQtyUrl=/);
    });

    it('observes the picker selection via onPriceListChange (the modal owns priceListId internally)', () => {
      assert.match(src, /onPriceListChange=\{setSelectedPriceListId\}/);
    });

    it('no longer renders the bespoke BulkInvoiceModal', () => {
      assert.doesNotMatch(src, /BulkInvoiceModal/);
    });
  });

  // ── the quote: real per-line price, order price when linked, Tarifa price otherwise ─
  // Verified against Core's own UpdatePricesAndAmounts.java (createlinesfromprocess package):
  // a line copied from — or related to — an order line is priced at THAT order line's own
  // unitPrice, ignoring the invoice's price list entirely; only an unrelated line is priced
  // from the invoice's price list. The quote mirrors that rule exactly so it never disagrees
  // with what the created invoice actually contains.
  describe('quote — real price per line, not an estimate', () => {
    it('fetches shipment lines (product + salesOrderLine) to know each line\'s price source', () => {
      assert.match(src, /goodsShipmentLine\?parentId=/);
    });

    it('fetches pendingInvoiceLines per shipment (still needed for both the subtitle and the quote quantities)', () => {
      assert.match(src, /action\/pendingInvoiceLines/);
    });

    it('fetches the ORDER line\'s own price for lines that have one, independent of the chosen Tarifa', () => {
      assert.match(src, /sales-order\/lines\/\$\{id\}/);
      // The order-price effect's dependency array must not include selectedPriceListId — it
      // runs once per selection, not on every Tarifa change.
      assert.match(
        src,
        /\}, \[showModal, canCreate, invoiceableRows, base, apiFetch, token\]\);/,
      );
    });

    it('fetches the Tarifa price only for lines with NO linked order line, reactive to selectedPriceListId', () => {
      assert.match(src, /lines\/selectors\/M_Product_ID\?limit=500&offset=0&priceList=/);
      assert.match(src, /\.filter\(d => !d\.salesOrderLine\)/);
      assert.match(
        src,
        /useEffect\(\(\) => \{\s*\n\s*if \(!lineDetails \|\| !selectedPriceListId\)/,
      );
    });

    it('computes quoteAmount as pendingQty × (order price ?? tariff price), skipping unresolved lines', () => {
      assert.match(
        src,
        /const price = detail\.salesOrderLine\s*\n\s*\?\s*orderLinePrices\[detail\.salesOrderLine\]\s*\n\s*:\s*tariffPrices\[detail\.product\];/,
      );
      assert.match(src, /sum \+= qty \* price;/);
    });

    it('formats the resolved quote with the real shipment currency, never a bare number', () => {
      assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js'/);
      assert.match(src, /formatCurrency\(currencyCode, quoteAmount\)/);
      assert.match(src, /invoiceableRows\[0\]\?\.\['etgoCurrency\$_identifier'\]/);
    });

    it('falls back to the "N shipments" label when no quote could be resolved yet', () => {
      assert.match(
        src,
        /const cardAmountLabel = quoteAmount != null\s*\n\s*\?\s*formatCurrency\(currencyCode, quoteAmount\)\s*\n\s*:\s*`\$\{invoiceableCount\} \$\{ui\('shipment'\)\}/,
      );
    });

    it('no longer pre-checks for an existing draft invoice (the shared modal has no such banner)', () => {
      assert.doesNotMatch(src, /action\/checkDraftInvoice/);
    });
  });

  // ── auto-preselected Tarifa for a single shipment ───────────────────────────
  describe('auto-preselects the Tarifa when exactly one shipment is selected', () => {
    it('fetches the single-record header (only for N===1) to read resolvedPriceListId', () => {
      assert.match(src, /if \(!showModal \|\| invoiceableRows\.length !== 1\) \{ setResolvedPriceListId\(undefined\); return; \}/);
      assert.match(src, /goods-shipment\/goodsShipment\/\$\{invoiceableRows\[0\]\.id\}`, \{ baseUrl: '', token \}/);
    });

    it('feeds it to the shared modal via data.resolvedPriceListId — the same field the single-record flow already uses', () => {
      assert.match(src, /data=\{\{ 'businessPartner\$_identifier': bpCheck\.name, resolvedPriceListId \}\}/);
    });
  });

  // ── request policy: the shared apiFetch helper, never a bare fetch ─────────────
  describe('uses the authenticated request helper, not a bare fetch', () => {
    it('imports useApiFetch', () => {
      assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js'/);
    });

    it('never calls the bare global fetch', () => {
      assert.doesNotMatch(src, /(?<![\w.])fetch\s*\(/);
    });
  });

  // ── creating the invoice ────────────────────────────────────────────────────────
  describe('creates the invoice via createDraftInvoice with shipmentIds + priceListId', () => {
    it('posts to the createDraftInvoice action', () => {
      assert.match(src, /action\/createDraftInvoice/);
    });

    it('sends shipmentIds and the chosen priceListId, no per-line quantities', () => {
      assert.match(src, /shipmentIds:\s*invoiceableRows\.map\(r => r\.id\)/);
      assert.match(src, /priceListId/);
      assert.doesNotMatch(src, /lines:\s*linesPayload/);
    });

    it('translates the backend error before toasting it', () => {
      assert.match(src, /import \{ translateBackendError \} from '@\/lib\/backendErrors\.js'/);
      assert.match(src, /toast\.error\(translateBackendError\(err\.message, ui\)/);
    });
  });

  // ── showing the result ──────────────────────────────────────────────────────────
  // The hand-rolled toast.custom card is gone — the result is now shown through the same
  // ConfirmResultModal the form-view "Crear factura" flow uses, which already badges
  // confirmed-vs-draft off `documentStatus` (ETP-5381) and offers "Ver factura".
  describe('shows the result through the shared ConfirmResultModal', () => {
    it('imports ConfirmResultModal from the contract-ui barrel', () => {
      assert.match(src, /import \{ ConfirmResultModal \} from '@\/components\/contract-ui'/);
    });

    it('passes the created invoice id, documentNo and documentStatus into a facturaVenta doc', () => {
      assert.match(src, /type:\s*'facturaVenta'/);
      assert.match(src, /route:\s*`\/sales-invoice\/\$\{invoiceResult\.invoice\.id\}`/);
      assert.match(src, /documentStatus:\s*invoiceResult\.invoice\.documentStatus/);
    });

    it('no longer hand-rolls a toast.custom success card', () => {
      assert.doesNotMatch(src, /toast\.custom/);
    });
  });

  // ETP-5302 — this action must close the modal, clear the selection and refetch (never
  // reload) once the user is done with the result, so the shipments it just invoiced never
  // keep showing a stale invoicing status.
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

    it('does not refetch on a plain cancel/close of the confirm modal (nothing changed server-side)', () => {
      assert.match(src, /onClose=\{\(\)\s*=>\s*setShowModal\(false\)\}/);
    });
  });
});
