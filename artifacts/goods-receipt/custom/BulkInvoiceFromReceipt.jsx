import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FilePlus } from 'lucide-react';
import { useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { ConfirmResultModal } from '@/components/contract-ui';

// Mirrors artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx (Albarán de Venta) —
// same shared "Gestionar documentos" modal (CreateInvoiceConfirmModal), same slot contract,
// same guards, same real-price-per-line quote. isSOTrx={false} and the purchase-side
// endpoint/route/entities are the only differences; see that file's own header comment for
// the trade-off of using the shared modal (no per-line selection from the grid; the backend's
// own pending-quantity cap still prevents double-invoicing — see
// CreatePurchaseInvoiceHandler#createFromReceipts).
export default function BulkInvoiceFromReceipt({ selectedRows, clearSelection, token, apiBaseUrl, refresh }) {
  const ui = useUI();
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState(null);

  // Quote inputs — see the useMemo below for how they combine into an amount.
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [lineDetails, setLineDetails] = useState(null); // null = not fetched yet
  const [pendingByLine, setPendingByLine] = useState(null); // null = not fetched yet
  const [orderLinePrices, setOrderLinePrices] = useState({});
  const [tariffPrices, setTariffPrices] = useState({});
  const [mainFetchPending, setMainFetchPending] = useState(false);
  const [tariffFetchPending, setTariffFetchPending] = useState(false);
  const [resolvedPriceListId, setResolvedPriceListId] = useState(undefined);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);

  // invoiceStatus (0-100, %) is the "already invoiced" signal on this window, same field the
  // single-record "Crear factura" button already uses (GoodsReceiptActions.jsx). completelyInvoiced
  // has visibility:"system" in the contract — backend-only, never reaches a grid row.
  const invoiceableRows = useMemo(
    () => selectedRows.filter(r => r.documentStatus === 'CO' && parseFloat(r.invoiceStatus ?? 0) < 100),
    [selectedRows],
  );

  const bpCheck = useMemo(() => {
    if (invoiceableRows.length === 0) return { same: false, name: '' };
    const firstBp = invoiceableRows[0].businessPartner;
    const allSame = invoiceableRows.every(r => r.businessPartner === firstBp);
    const name = invoiceableRows[0]['businessPartner$_identifier'] || '';
    return { same: allSame, name };
  }, [invoiceableRows]);

  // ETP-4028: receipts carry their own currency — a single invoice cannot mix lines from
  // documents in different currencies, so block the batch the same way an inconsistent
  // business partner already blocks it.
  const currencyCheck = useMemo(() => {
    if (invoiceableRows.length === 0) return { same: false };
    const firstCurrency = invoiceableRows[0].etgoCurrency;
    const allSame = invoiceableRows.every(r => r.etgoCurrency === firstCurrency);
    return { same: allSame };
  }, [invoiceableRows]);

  const invoiceableCount = invoiceableRows.length;
  const allInvoiced = invoiceableCount === 0;
  const canCreate = invoiceableCount > 0 && bpCheck.same && currencyCheck.same;

  // Fetches, per invoiceable receipt, the pending-quantity map (the same one that caps what
  // the backend will actually invoice) — which now ALSO carries each pending line's product and
  // salesOrderLine (ETP-5410 follow-up: CreateDraftInvoiceHandler#handlePendingLines merges them
  // server-side), so this used to be two requests per receipt and is now one.
  useEffect(() => {
    if (!showModal || !canCreate) {
      setLineDetails(null);
      setPendingByLine(null);
      setOrderLinePrices({});
      setResolvedPriceListId(undefined);
      setMainFetchPending(false);
      return;
    }
    let cancelled = false;
    setMainFetchPending(true);
    (async () => {
      const results = await Promise.all(invoiceableRows.map(async (r) => {
        try {
          const res = await apiFetch(
            `${base}/goods-receipt/goodsReceipt/${r.id}/action/pendingInvoiceLines`,
            { baseUrl: '', token },
          );
          if (!res.ok) return { items: [], resolvedPriceListId: null };
          const json = await res.json();
          return {
            items: json?.response?.data || [],
            resolvedPriceListId: json?.response?.resolvedPriceListId || null,
          };
        } catch {
          return { items: [], resolvedPriceListId: null };
        }
      }));
      if (cancelled) return;

      const details = {};
      const pendingMap = {};
      results.forEach(r => {
        r.items.forEach(item => {
          details[item.lineId] = { product: item.product, salesOrderLine: item.salesOrderLine || null };
          pendingMap[item.lineId] = Number(item.pendingQty) || 0;
        });
      });
      setLineDetails(details);
      setPendingByLine(pendingMap);

      // Auto-preselects the Tarifa for exactly ONE selected receipt — the same server-resolved
      // tariff (linked order's price list, else the Business Partner's own, else the client's
      // default) the single-receipt "Crear Factura" flow already preselects. For N>=2 there is
      // no single well-defined resolved tariff (different orders could resolve to different
      // ones), so the picker stays empty and the choice stays explicit.
      // ETP-5410 follow-up: this used to be a SEPARATE full single-record GET (the single
      // heaviest request in this modal's opening waterfall); now it's the same field
      // pendingInvoiceLines already resolved server-side above, at no extra cost.
      setResolvedPriceListId(
        results.length === 1 && results[0].resolvedPriceListId ? results[0].resolvedPriceListId : undefined,
      );

      // Order-linked lines are priced at the PURCHASE ORDER's price, not the chosen Tarifa
      // (Core's UpdatePricesAndAmounts copies orderLine.getUnitPrice() whenever the line has a
      // related order line, ignoring the invoice's price list entirely) — so this fetch does
      // not depend on selectedPriceListId and runs once per receipt selection.
      const orderLineIds = [...new Set(Object.values(details).map(d => d.salesOrderLine).filter(Boolean))];
      const prices = {};
      await Promise.all(orderLineIds.map(async (id) => {
        try {
          const res = await apiFetch(`${base}/purchase-order/lines/${id}`, { baseUrl: '', token });
          if (res.ok) {
            const ol = (await res.json())?.response?.data?.[0];
            if (ol) prices[id] = Number(ol.unitPrice) || 0;
          }
        } catch { /* a line whose order-line price can't be resolved just contributes nothing */ }
      }));
      if (!cancelled) {
        setOrderLinePrices(prices);
        setMainFetchPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showModal, canCreate, invoiceableRows, base, apiFetch, token]);

  // Tariff prices for lines with NO linked purchase order line — these are the only ones Core
  // actually prices from the invoice's price list (setPricesBasedOnBOM), so this is the only
  // part of the quote that reacts to the Tarifa selection. Reuses the same product-price
  // selector the manual line-entry callout cascade uses (ProductPriceSelectorPolicy, gated on
  // a `priceList` context param) — see artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx
  // for the same pattern.
  useEffect(() => {
    if (!lineDetails || !selectedPriceListId) { setTariffPrices({}); return; }
    const products = [...new Set(
      Object.values(lineDetails).filter(d => !d.salesOrderLine).map(d => d.product).filter(Boolean),
    )];
    if (products.length === 0) { setTariffPrices({}); return; }
    let cancelled = false;
    setTariffFetchPending(true);
    (async () => {
      try {
        // ETP-5410 follow-up: a dedicated POST action that prices exactly these product ids,
        // instead of the generic product-browse selector (up to 500 rows, filtered client-side)
        // — see MultiDocumentInvoiceSupport#resolveProductPrices in com.etendoerp.go. Any
        // invoiceable receipt id works as the URL anchor — the action ignores it.
        const res = await apiFetch(
          `${base}/goods-receipt/goodsReceipt/${invoiceableRows[0].id}/action/productPrices`,
          {
            method: 'POST',
            baseUrl: '',
            token,
            body: JSON.stringify({ productIds: products, priceListId: selectedPriceListId }),
          },
        );
        if (!res.ok || cancelled) return;
        const items = (await res.json())?.response?.data || [];
        const prices = {};
        items.forEach(item => {
          if (item.productId) prices[item.productId] = Number(item.price) || 0;
        });
        if (!cancelled) setTariffPrices(prices);
      } catch { /* products left unpriced just don't contribute to the quote */
      } finally {
        if (!cancelled) setTariffFetchPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lineDetails, selectedPriceListId, invoiceableRows, base, apiFetch, token]);

  // The quote: pendingQty × real unit price per line — the purchase order's price when the
  // line has one (always correct, since that's what Core actually bills), the selected
  // Tarifa's price otherwise. Never an estimate by design: a line whose price cannot be
  // resolved from either source simply doesn't contribute, the same "left blank for the user
  // to fill in" gap the single-receipt flow already has for a priceless product.
  const quoteAmount = useMemo(() => {
    if (!lineDetails || !pendingByLine) return null;
    let sum = 0;
    let resolvedAny = false;
    for (const [lineId, qty] of Object.entries(pendingByLine)) {
      if (!qty) continue;
      const detail = lineDetails[lineId];
      if (!detail) continue;
      const price = detail.salesOrderLine
        ? orderLinePrices[detail.salesOrderLine]
        : tariffPrices[detail.product];
      if (price != null) {
        sum += qty * price;
        resolvedAny = true;
      }
    }
    return resolvedAny ? sum : null;
  }, [lineDetails, pendingByLine, orderLinePrices, tariffPrices]);

  const pendingQtyTotal = pendingByLine
    ? Object.values(pendingByLine).reduce((a, b) => a + b, 0)
    : undefined;

  // Whether any pending line still needs a Tarifa-sourced price we haven't fetched yet.
  const needsTariffPricing = !!(lineDetails && pendingByLine
    && Object.entries(pendingByLine).some(([lineId, qty]) => {
      if (!qty) return false;
      const detail = lineDetails[lineId];
      return !!(detail && !detail.salesOrderLine);
    }));
  // Drives CreateInvoiceConfirmModal's `cardAmountLoading` (a skeleton placeholder in the
  // amount line — see that prop's own doc for why a skeleton and not a spinner), ONLY for a
  // single selected receipt — that is the one case where everything resolves on its own
  // (pending lines, order price, AND the auto-selected Tarifa) with no user action required, so
  // a value is always about to load and a loading placeholder reads correctly. For N>=2 there
  // is no auto-selected Tarifa — the user must pick one — so "N recibos" is the correct
  // persistent label while waiting on them, not a symptom of loading, and must show
  // immediately rather than sit behind a placeholder that would never resolve on its own.
  const quoteLoading = invoiceableRows.length === 1 && (
    mainFetchPending || (needsTariffPricing && (!selectedPriceListId || tariffFetchPending))
  );

  const currencyCode = invoiceableRows[0]?.['etgoCurrency$_identifier'] || '';
  // Gated on quoteLoading, not just computed unconditionally: cardAmountLoading already hides
  // this behind a skeleton while true, but a caller must never hand the modal a label that
  // still says "1 recibo" underneath — the label and the loading flag must agree, or a future
  // change to either one (e.g. rendering the label as a tooltip too) could resurface the exact
  // flash this whole feature exists to prevent.
  const cardAmountLabel = quoteLoading
    ? undefined
    : (quoteAmount != null
      ? formatCurrency(currencyCode, quoteAmount)
      // ETP-5378 QA follow-up — see the matching note in BulkInvoiceFromShipment.jsx. The
      // Spanish value here is identical to the shipment side ("albarán"); the separate key
      // exists for English, which calls this window's document a receipt.
      : ui(invoiceableCount === 1 ? 'receiptCount_one' : 'receiptCount_plural',
        { count: invoiceableCount }));

  if (selectedRows.length < 1) return null;

  const tooltip = allInvoiced
    ? ui('allReceiptsAlreadyInvoiced')
    : !bpCheck.same
      ? ui('selectReceiptsSameVendor')
      : !currencyCheck.same
        ? ui('selectReceiptsSameCurrency')
        : undefined;

  const handleCreate = async (priceListId) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await apiFetch(
        `${base}/goods-receipt/goodsReceipt/${invoiceableRows[0].id}/action/createPurchaseInvoice`,
        {
          method: 'POST',
          baseUrl: '',
          token,
          body: JSON.stringify({ receiptIds: invoiceableRows.map(r => r.id), priceListId }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      const json = await res.json();
      setShowModal(false);
      setInvoiceResult({
        invoice: {
          id: json?.response?.data?.id || null,
          documentNo: json?.response?.data?.documentNo || '',
          // ETP-5381: the invoice is confirmed in the same request — ConfirmResultModal
          // badges the result off this instead of assuming a draft.
          documentStatus: json?.response?.data?.documentStatus ?? null,
        },
      });
    } catch (err) {
      toast.error(translateBackendError(err.message, ui) || ui('failedToCreateInvoice'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => setShowModal(true)}
        title={tooltip}
        data-testid="BulkInvoiceFromReceipt__button"
        className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
        style={{
          color: canCreate ? 'hsl(var(--floating-toolbar-fg))' : 'hsl(var(--floating-toolbar-muted))',
          cursor: canCreate ? 'pointer' : 'not-allowed',
          opacity: canCreate ? 1 : 0.5,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" data-testid="FilePlus__bulkInvoiceReceipt" />
        {ui('createInvoiceBtn')}
      </button>

      {showModal && (
        <CreateInvoiceConfirmModal
          data={{ 'businessPartner$_identifier': bpCheck.name, resolvedPriceListId }}
          loading={creating}
          cardAmountLabel={cardAmountLabel}
          cardAmountLoading={quoteLoading}
          pendingQtyTotal={pendingQtyTotal}
          showPriceListPicker
          isSOTrx={false}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
          onPriceListChange={setSelectedPriceListId}
          data-testid="BulkInvoiceFromReceipt__confirmModal"
        />
      )}

      {invoiceResult?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui('poInvoiceCreated')}
          docs={[{
            type: 'facturaCompra',
            num: invoiceResult.invoice.documentNo,
            documentStatus: invoiceResult.invoice.documentStatus,
            route: `/purchase-invoice/${invoiceResult.invoice.id}`,
          }]}
          primary={ui('poViewInvoice')}
          navigate={(route) => navigate(route)}
          onClose={() => {
            setInvoiceResult(null);
            // ETP-5302 rule: a bulk action ends with clearSelection, then the result, then a
            // refetch — never a full page reload.
            clearSelection();
            refresh?.();
          }}
        />,
        document.body,
      )}
    </>
  );
}
