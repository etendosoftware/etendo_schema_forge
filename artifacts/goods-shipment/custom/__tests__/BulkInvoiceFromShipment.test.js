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
/**
 * The source with comments removed, for the `doesNotMatch` assertions only.
 *
 * This file's own prose names the things it forbids — "the credential belongs to apiFetch"
 * mentions the credential, and any future note about the old `Bearer` header would too. A
 * negative regex over the raw text would then fail on an ACCURATE comment and push the next
 * reader to delete the explanation rather than keep the code right. Positive assertions still
 * run against `src`: matching a pattern that only exists in a comment is a mistake this
 * component's shape (every fetch is a real call site) does not make.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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

  // ETP-4576 — the other half of this file's post-merge state. Develop contributed the
  // `refresh` prop asserted above; this branch contributed the credential change, and it had
  // no coverage here at all while both sibling bulk components (BulkOrderMoreMenu,
  // BulkPurchaseOrderMoreMenu) assert theirs. A union resolution needs both halves pinned, or
  // the next merge can quietly drop the unasserted one.
  describe('ETP-4576 — every request goes through apiFetch', () => {
    it('imports useApiFetch rather than holding a credential', () => {
      assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js'/);
    });

    // The empty base is load-bearing, not a default someone forgot to fill in: the URLs here
    // are already absolute and several address a DIFFERENT spec than this window's
    // (`sales-order/lines`, `goods-shipment/...`). `resolveApiUrl` only skips the prefix when
    // the path already starts with that same base, so passing this window's base would build
    // /sws/neo/<this>/sws/neo/<other>/... and 404. Asserted so a later "tidy-up" that threads
    // `apiBaseUrl` in here fails loudly instead of at runtime.
    it('resolves apiFetch with an EMPTY base, because the URLs are cross-spec', () => {
      assert.match(src, /const apiFetch = useApiFetch\(''\);/);
      assert.doesNotMatch(code, /useApiFetch\(\s*apiBaseUrl\s*\)/);
    });

    it('issues every backend call through apiFetch, never a bare fetch', () => {
      const apiFetchCalls = code.match(/\bapiFetch\(/g) || [];
      // ETP-5410 removed the bespoke BulkInvoiceModal (and its own ~5 call sites) in favor of
      // the shared CreateInvoiceConfirmModal; the surviving component has 4.
      assert.ok(apiFetchCalls.length >= 4, `expected the call sites to use apiFetch, found ${apiFetchCalls.length}`);
      assert.doesNotMatch(code, /[^.\w$]fetch\(/);
    });

    it('never hand-builds a credential header', () => {
      assert.doesNotMatch(code, /\bAuthorization\b/);
      assert.doesNotMatch(code, /\bBearer\b/);
    });

    // Required by docs/request-policy.md: `apiFetch` is a hook result, so an effect that calls
    // it and omits it from the dep array can keep a stale binding across a credential change.
    // The pending-lines effect has its own dedicated assertion below (ETP-5410's "quote"
    // describe block); this one pins the OTHER apiFetch-calling effect — the Tarifa-prices
    // fetch — so neither can silently drop apiFetch from its deps.
    it('lists apiFetch in the dependency array of the tariff-prices effect', () => {
      assert.match(src, /\}, \[lineDetails, selectedPriceListId, invoiceableRows, base, apiFetch, token\]\);/);
    });
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

    it('passes a computed cardAmountLabel (real quote when resolvable, shipment-count fallback otherwise)', () => {
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
    it('gets product + salesOrderLine from pendingInvoiceLines, not a separate lines request', () => {
      assert.match(src, /action\/pendingInvoiceLines/);
      assert.doesNotMatch(src, /goodsShipmentLine\?parentId=/);
      assert.match(src, /details\[item\.lineId\] = \{ product: item\.product, salesOrderLine: item\.salesOrderLine \|\| null \};/);
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
      assert.match(src, /action\/productPrices/);
      assert.match(src, /\.filter\(d => !d\.salesOrderLine\)/);
      assert.match(
        src,
        /useEffect\(\(\) => \{\s*\n\s*if \(!lineDetails \|\| !selectedPriceListId\)/,
      );
    });

    it('prices the tariff request via a dedicated POST action, not the generic product selector', () => {
      assert.doesNotMatch(src, /selectors\/M_Product_ID/);
      assert.match(src, /productIds: products, priceListId: selectedPriceListId/);
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

    // The ETP-5410 anti-flash guard lives in the ORDER of this ternary: quoteLoading wins
    // first (-> undefined, so the modal shows its skeleton placeholder), only then a resolved
    // quote, and the count label last. That ordering stays pinned here. It is checked with two
    // narrow assertions instead of one multiline regex because ETP-5378 inserted an
    // explanatory comment between the formatCurrency arm and the fallback arm — a regex that
    // assumes those two lines are adjacent breaks whenever someone edits the prose, which is
    // not a behavioural regression and trains readers to delete comments.
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
      const countArm = src.indexOf("ui(invoiceableCount === 1 ? 'shipmentCount_one' : 'shipmentCount_plural'");
      assert.ok(quoteArm >= 0, 'the resolved-quote arm must exist for the ordering check to mean anything');
      assert.ok(countArm >= 0, 'the count-label arm must exist for the ordering check to mean anything');
      assert.ok(quoteArm < countArm, 'the count label must be the LAST arm, after the resolved-quote arm');
    });

    it('falls back to the shipment count label once loading has settled and no quote could be resolved', () => {
      assert.match(
        src,
        /:\s*ui\(invoiceableCount === 1 \? 'shipmentCount_one' : 'shipmentCount_plural',\s*\n\s*\{ count: invoiceableCount \}\)\);/,
      );
    });

    // ETP-5410 follow-up: the fallback used to render on EVERY open (quoteAmount starts null)
    // and then get silently replaced the instant the quote resolved — a "1 envío" flash on every
    // click, reported by QA. Two earlier attempts were also rejected: suppressing
    // cardAmountLabel to undefined with no visual replacement just swapped the flash for a
    // blank-then-pop-in; wiring quoteLoading straight into a SPINNER made it flicker on/off
    // almost as fast as the text flash, since quoteLoading itself resolves in ~100-250ms
    // locally. The fix: cardAmountLoading now shows a static skeleton placeholder (see
    // CreateInvoiceConfirmModal's own doc — same primitive NewPaymentEntryModal already uses
    // for its own async fields), which doesn't have the spinner's flicker problem even for a
    // very brief show — ONLY for N===1, the one case where a value always resolves on its own
    // (pending lines + order price + the auto-selected Tarifa, no user action required).
    describe('quoteLoading — drives the shared modal\'s skeleton placeholder, and gates cardAmountLabel so the two can never disagree', () => {
      it('is scoped to exactly one selected shipment — N>=2 has no auto-selected Tarifa, so "N shipments" is a correct steady state, not a loading placeholder', () => {
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

    it('no longer pre-checks for an existing draft invoice (the shared modal has no such banner)', () => {
      assert.doesNotMatch(src, /action\/checkDraftInvoice/);
    });
  });

  // ── auto-preselected Tarifa for a single shipment ───────────────────────────
  describe('auto-preselects the Tarifa when exactly one shipment is selected', () => {
    it('derives resolvedPriceListId from the pendingInvoiceLines response, not a separate full-record GET', () => {
      assert.match(src, /results\.length === 1 && results\[0\]\.resolvedPriceListId \? results\[0\]\.resolvedPriceListId : undefined/);
      assert.match(src, /resolvedPriceListId: json\?\.response\?\.resolvedPriceListId \|\| null/);
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

  // ETP-5378 QA follow-up — two defects in one small label. Sales read `ui('shipment')`
  // ("envio") while Purchases read `ui('receipt')` ("albaran") for the SAME kind of document,
  // so the two windows disagreed on what to call it; and the count was pluralised by
  // appending a literal 's' to the noun, i.e. English grammar on a Spanish word, which
  // rendered "2 albarans". The count and the noun now both live in the locale.
  //
  // WHY THIS WINDOW HAS ITS OWN KEY PAIR, AND WHY THAT IS NOT DUPLICATION:
  // `shipmentCount_*` and `receiptCount_*` exist as two pairs ONLY because ENGLISH needs two
  // nouns (shipment / receipt). In Spanish both windows deliberately render the SAME word,
  // "albaran" — that identity is the actual QA requirement, since the reported defect was the
  // two windows naming one document differently. So the pairs are not interchangeable here
  // (this file must read the shipment pair) and they are not collapsible either; the locale
  // spec asserts the Spanish string equality that makes the split safe.
  describe('ETP-5378 — the count label is a locale-owned plural, on this window\'s own key pair', () => {
    it('selects shipmentCount_one for exactly one document and shipmentCount_plural otherwise', () => {
      assert.match(
        src,
        /ui\(invoiceableCount === 1 \? 'shipmentCount_one' : 'shipmentCount_plural'/,
      );
    });

    it('passes { count: invoiceableCount } so the locale string owns where the number goes', () => {
      assert.match(src, /'shipmentCount_plural',\s*\n\s*\{ count: invoiceableCount \}\)/);
    });

    it('reads the shipment pair, never the sibling window\'s receipt pair', () => {
      assert.doesNotMatch(code, /receiptCount_(one|plural)/);
    });

    // Run against `code` (comments stripped), not `src`: the source's own explanatory note
    // quotes the defect verbatim — `${count !== 1 ? 's' : ''}` — so a raw-text negative regex
    // would fail on ACCURATE prose and teach the next reader to delete the explanation.
    it('never pluralises by appending a literal "s" to the noun (the "2 albarans" defect)', () => {
      assert.doesNotMatch(code, /\?\s*'s'\s*:/);
    });

    it('no longer reads the single-use bare-noun shipment / receipt labels', () => {
      // Anchored on the closing quote+paren so the guard cannot fire on the LEGITIMATE
      // `ui('shipmentCount_one')` call — a guard that rejects correct code is worse than none.
      // Proven against a literal sample rather than trusted by inspection.
      const bareShipment = /ui\('shipment'\)/;
      const bareReceipt = /ui\('receipt'\)/;
      assert.doesNotMatch(
        "ui('shipmentCount_one') ui('receiptCount_plural')",
        bareShipment,
        'the bare-noun guard must not match the count keys',
      );
      assert.doesNotMatch(
        "ui('shipmentCount_one') ui('receiptCount_plural')",
        bareReceipt,
        'the bare-noun guard must not match the count keys',
      );
      // ...and it still catches the real thing it was written for.
      assert.match("ui('shipment')", bareShipment, 'the guard must still detect the bare noun');

      assert.doesNotMatch(code, bareShipment);
      assert.doesNotMatch(code, bareReceipt);
    });
  });
});
