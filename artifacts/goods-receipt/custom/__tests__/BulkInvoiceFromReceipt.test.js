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

/**
 * The source with comments removed, for the `doesNotMatch` assertions only.
 *
 * Same rationale as the goods-shipment sibling: the ETP-5378 notes in these components name
 * the very patterns the negative assertions forbid (the old `? 's' : ''` plural, the bare
 * `ui('shipment')` call). A negative regex over raw text would then fail on an ACCURATE
 * comment and push the next reader to delete the explanation rather than keep the code right.
 * Positive assertions still run against `src`.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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

    it('passes a computed cardAmountLabel (real quote when resolvable, receipt-count fallback otherwise)', () => {
      assert.match(src, /cardAmountLabel=\{cardAmountLabel\}/);
    });

    // The ETP-5410 anti-flash guard lives in the ORDER of this ternary: quoteLoading wins
    // first (-> undefined, so the modal shows its skeleton placeholder), only then a resolved
    // quote, and the count label last. Checked with two narrow assertions rather than one
    // multiline regex because ETP-5378 inserted an explanatory comment between the
    // formatCurrency arm and the fallback arm, and a prose edit must not read as a regression.
    it('gates the label behind quoteLoading first, then a resolved quote, then the count fallback', () => {
      assert.match(
        src,
        /const cardAmountLabel = quoteLoading\s*\n\s*\?\s*undefined\s*\n\s*:\s*\(quoteAmount != null\s*\n\s*\?\s*formatCurrency\(currencyCode, quoteAmount\)/,
      );
      // Both indices are asserted present BEFORE they are compared. `indexOf` returns -1 for a
      // missing needle, so a bare `a < b` would pass vacuously the moment the quote arm is
      // renamed away (-1 < anything) — i.e. the guard would go green exactly when the thing it
      // guards disappeared.
      const quoteArm = src.indexOf('formatCurrency(currencyCode, quoteAmount)');
      const countArm = src.indexOf("ui(invoiceableCount === 1 ? 'receiptCount_one' : 'receiptCount_plural'");
      assert.ok(quoteArm >= 0, 'the resolved-quote arm must exist for the ordering check to mean anything');
      assert.ok(countArm >= 0, 'the count-label arm must exist for the ordering check to mean anything');
      assert.ok(quoteArm < countArm, 'the count label must be the LAST arm, after the resolved-quote arm');
    });

    it('falls back to the receipt count label once loading has settled and no quote could be resolved', () => {
      assert.match(
        src,
        /:\s*ui\(invoiceableCount === 1 \? 'receiptCount_one' : 'receiptCount_plural',\s*\n\s*\{ count: invoiceableCount \}\)\);/,
      );
    });

    // ETP-5410 follow-up: the fallback used to render on EVERY open (quoteAmount starts null)
    // and then get silently replaced the instant the quote resolved — a "1 recibo" flash on
    // every click, reported by QA. Two earlier attempts were also rejected: suppressing
    // cardAmountLabel to undefined with no visual replacement just swapped the flash for a
    // blank-then-pop-in; wiring quoteLoading straight into a SPINNER made it flicker on/off
    // almost as fast as the text flash, since quoteLoading itself resolves in ~100-250ms
    // locally. The fix: cardAmountLoading now shows a static skeleton placeholder (see
    // CreateInvoiceConfirmModal's own doc — same primitive NewPaymentEntryModal already uses
    // for its own async fields), which doesn't have the spinner's flicker problem even for a
    // very brief show — ONLY for N===1, the one case where a value always resolves on its own
    // (pending lines + order price + the auto-selected Tarifa).
    describe('quoteLoading — drives the shared modal\'s skeleton placeholder, and gates cardAmountLabel so the two can never disagree', () => {
      it('is scoped to exactly one selected receipt — N>=2 has no auto-selected Tarifa, so "N receipts" is a correct steady state, not a loading placeholder', () => {
        assert.match(src, /const quoteLoading = invoiceableRows\.length === 1 && \(/);
        assert.match(src, /cardAmountLoading=\{quoteLoading\}/);
      });

      it('tracks whether the main fetch (lines + pending + order price) is still in flight', () => {
        assert.match(src, /const \[mainFetchPending, setMainFetchPending\] = useState\(false\);/);
        assert.match(src, /setMainFetchPending\(true\);/);
        assert.match(src, /setOrderLinePrices\(prices\);\s*\n\s*setMainFetchPending\(false\);/);
      });

      it('also waits for the Tarifa-priced tariff fetch when at least one pending line has no linked order', () => {
        assert.match(src, /const \[tariffFetchPending, setTariffFetchPending\] = useState\(false\);/);
        assert.match(src, /setTariffFetchPending\(true\);/);
        assert.match(
          src,
          /needsTariffPricing && \(!selectedPriceListId \|\| tariffFetchPending\)/,
        );
      });
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
    it('gets product + salesOrderLine from pendingInvoiceLines per receipt, not a separate lines request', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{r\.id\}\/action\/pendingInvoiceLines/);
      assert.doesNotMatch(src, /goodsReceiptLine\?parentId=/);
      assert.match(src, /details\[item\.lineId\] = \{ product: item\.product, salesOrderLine: item\.salesOrderLine \|\| null \};/);
    });

    it('fetches the PURCHASE ORDER line\'s own price for lines that have one, independent of the chosen Tarifa', () => {
      assert.match(src, /purchase-order\/lines\/\$\{id\}/);
      assert.match(
        src,
        /\}, \[showModal, canCreate, invoiceableRows, base, apiFetch, token\]\);/,
      );
    });

    it('fetches the Tarifa price only for lines with NO linked order line, from purchase price lists (isSOTrx=false)', () => {
      assert.match(src, /action\/productPrices/);
      assert.doesNotMatch(src, /selectors\/M_Product_ID/);
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
    it('derives resolvedPriceListId from the pendingInvoiceLines response, not a separate full-record GET', () => {
      assert.match(src, /results\.length === 1 && results\[0\]\.resolvedPriceListId \? results\[0\]\.resolvedPriceListId : undefined/);
      assert.match(src, /resolvedPriceListId: json\?\.response\?\.resolvedPriceListId \|\| null/);
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

  // ETP-5378 QA follow-up — mirrors the matching block in the goods-shipment sibling spec.
  // Two defects in one small label: this window read `ui('receipt')` ("albaran") while sales
  // read `ui('shipment')` ("envio") for the SAME kind of document, and the count was
  // pluralised by appending a literal 's' to the noun — English grammar on a Spanish word,
  // which rendered "2 albarans" here. The count and the noun now both live in the locale.
  //
  // WHY THIS WINDOW HAS ITS OWN KEY PAIR, AND WHY THAT IS NOT DUPLICATION:
  // `receiptCount_*` and `shipmentCount_*` exist as two pairs ONLY because ENGLISH needs two
  // nouns (receipt / shipment). In Spanish both windows deliberately render the SAME word,
  // "albaran" — that identity is the actual QA requirement, since the reported defect was the
  // two windows naming one document differently. So the pairs are not interchangeable here
  // (this file must read the receipt pair) and they are not collapsible either; the locale
  // spec asserts the Spanish string equality that makes the split safe.
  describe('ETP-5378 — the count label is a locale-owned plural, on this window\'s own key pair', () => {
    it('selects receiptCount_one for exactly one document and receiptCount_plural otherwise', () => {
      assert.match(
        src,
        /ui\(invoiceableCount === 1 \? 'receiptCount_one' : 'receiptCount_plural'/,
      );
    });

    it('passes { count: invoiceableCount } so the locale string owns where the number goes', () => {
      assert.match(src, /'receiptCount_plural',\s*\n\s*\{ count: invoiceableCount \}\)/);
    });

    it('reads the receipt pair, never the sibling window\'s shipment pair', () => {
      assert.doesNotMatch(code, /shipmentCount_(one|plural)/);
    });

    // Run against `code` (comments stripped), not `src`: these components' ETP-5378 notes quote
    // the defect verbatim, so a raw-text negative regex would fail on ACCURATE prose and teach
    // the next reader to delete the explanation.
    it('never pluralises by appending a literal "s" to the noun (the "2 albarans" defect)', () => {
      assert.doesNotMatch(code, /\?\s*'s'\s*:/);
    });

    it('no longer reads the single-use bare-noun shipment / receipt labels', () => {
      // Anchored on the closing quote+paren so the guard cannot fire on the LEGITIMATE
      // `ui('receiptCount_one')` call — a guard that rejects correct code is worse than none.
      // Proven against a literal sample rather than trusted by inspection.
      const bareShipment = /ui\('shipment'\)/;
      const bareReceipt = /ui\('receipt'\)/;
      assert.doesNotMatch(
        "ui('receiptCount_one') ui('shipmentCount_plural')",
        bareReceipt,
        'the bare-noun guard must not match the count keys',
      );
      assert.doesNotMatch(
        "ui('receiptCount_one') ui('shipmentCount_plural')",
        bareShipment,
        'the bare-noun guard must not match the count keys',
      );
      // ...and it still catches the real thing it was written for.
      assert.match("ui('receipt')", bareReceipt, 'the guard must still detect the bare noun');

      assert.doesNotMatch(code, bareShipment);
      assert.doesNotMatch(code, bareReceipt);
    });
  });
});
