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

  // Fetches, per invoiceable receipt: the lines (product + salesOrderLine, to know each line's
  // real price source) and the pending-quantity map (the same one that caps what the backend
  // will actually invoice). Both are needed for the quote below, not just for the subtitle.
  useEffect(() => {
    if (!showModal || !canCreate) {
      setLineDetails(null);
      setPendingByLine(null);
      setOrderLinePrices({});
      return;
    }
    let cancelled = false;
    (async () => {
      const [lineResults, pendingResults] = await Promise.all([
        Promise.all(invoiceableRows.map(async (r) => {
          try {
            const res = await apiFetch(
              `${base}/goods-receipt/goodsReceiptLine?parentId=${r.id}&_startRow=0&_endRow=200`,
              { baseUrl: '', token },
            );
            if (!res.ok) return [];
            return (await res.json())?.response?.data || [];
          } catch {
            return [];
          }
        })),
        Promise.all(invoiceableRows.map(async (r) => {
          try {
            const res = await apiFetch(
              `${base}/goods-receipt/goodsReceipt/${r.id}/action/pendingInvoiceLines`,
              { baseUrl: '', token },
            );
            if (!res.ok) return {};
            const data = (await res.json())?.response?.data || [];
            const map = {};
            data.forEach(item => { map[item.lineId] = Number(item.pendingQty) || 0; });
            return map;
          } catch {
            return {};
          }
        })),
      ]);
      if (cancelled) return;

      const details = {};
      lineResults.flat().forEach(l => {
        details[l.id] = { product: l.product, salesOrderLine: l.salesOrderLine || null };
      });
      setLineDetails(details);
      setPendingByLine(Object.assign({}, ...pendingResults));

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
      if (!cancelled) setOrderLinePrices(prices);
    })();
    return () => { cancelled = true; };
  }, [showModal, canCreate, invoiceableRows, base, apiFetch, token]);

  // Auto-preselects the Tarifa for exactly ONE selected receipt — the same server-resolved
  // tariff the single-receipt "Crear Factura" flow already preselects (linked order's price
  // list, else the Business Partner's own), via the same single-record GET that enrichment
  // comes from. CreateInvoiceConfirmModal's own usePriceListPicker already knows how to consume
  // `data.resolvedPriceListId` (ETP-4942) — this just has to feed it the field, which a grid
  // row never carries. For N>=2 there is no single well-defined resolved tariff (different
  // orders could resolve to different ones), so the picker stays empty and the choice stays
  // explicit, same as before.
  useEffect(() => {
    if (!showModal || invoiceableRows.length !== 1) { setResolvedPriceListId(undefined); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${base}/goods-receipt/goodsReceipt/${invoiceableRows[0].id}`, { baseUrl: '', token });
        if (!res.ok || cancelled) return;
        const rec = (await res.json())?.response?.data?.[0];
        if (rec?.resolvedPriceListId) setResolvedPriceListId(rec.resolvedPriceListId);
      } catch { /* silent — the picker just stays empty, same as before this feature */ }
    })();
    return () => { cancelled = true; };
  }, [showModal, invoiceableRows, base, apiFetch, token]);

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
    (async () => {
      try {
        const res = await apiFetch(
          `${base}/purchase-invoice/lines/selectors/M_Product_ID?limit=500&offset=0&priceList=${encodeURIComponent(selectedPriceListId)}`,
          { baseUrl: '', token },
        );
        if (!res.ok || cancelled) return;
        const items = (await res.json())?.items || [];
        const prices = {};
        items.forEach(item => {
          if (!item.id || !products.includes(item.id)) return;
          const std = Number(item._aux?._PSTD);
          if (std) prices[item.id] = std;
        });
        if (!cancelled) setTariffPrices(prices);
      } catch { /* products left unpriced just don't contribute to the quote */ }
    })();
    return () => { cancelled = true; };
  }, [lineDetails, selectedPriceListId, base, apiFetch, token]);

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

  const currencyCode = invoiceableRows[0]?.['etgoCurrency$_identifier'] || '';
  const cardAmountLabel = quoteAmount != null
    ? formatCurrency(currencyCode, quoteAmount)
    : `${invoiceableCount} ${ui('receipt')}${invoiceableCount !== 1 ? 's' : ''}`;

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
