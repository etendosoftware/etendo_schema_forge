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

// ETP-5302 — `refresh` comes from ListView's `bulkActions` slot context. Without it this
// action used to close the modal and clear the selection but never refetch, so the rows
// it had just invoiced kept showing a stale invoicing status with nothing on screen
// hinting they were out of date.
//
// This component used to open a bespoke modal with its own line-level selection, editable
// quantities and totals. It now opens the SAME "Gestionar documentos" modal the form view
// uses (CreateInvoiceConfirmModal) — the one that offers the Tarifa (price list) picker the
// bespoke modal never had. That trade-off is deliberate: the shared modal has no per-line
// selection, so a bulk invoice now always takes the full pending quantity of every selected
// shipment's lines (the backend's own pending-quantity cap still prevents double-invoicing —
// see CreateDraftInvoiceHandler#createFromShipments). Partial-quantity bulk invoicing is no
// longer available from the grid; it remains available from a single shipment's own
// "Crear Factura" flow in the form view.
export default function BulkInvoiceFromShipment({ selectedRows, clearSelection, token, apiBaseUrl, refresh }) {
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

  // invoiceStatus (0-100, %) is the real "already invoiced" signal on this window — the AD
  // column `Iscompletelyinvoiced` this used to read is renamed to `invoiced` with
  // grid:false/form:false in decisions.json, so it never reaches a grid row and the old
  // `completelyInvoiced` check here was silently always-true (a no-op guard).
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

  // ETP-4028: shipments carry their own currency — a single invoice cannot mix lines from
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

  // Fetches, per invoiceable shipment: the lines (product + salesOrderLine, to know each
  // line's real price source) and the pending-quantity map (the same one that caps what the
  // backend will actually invoice). Both are needed for the quote below, not just for the
  // subtitle — unlike the pre-cotización version of this component, which only needed the sum.
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
              `${base}/goods-shipment/goodsShipmentLine?parentId=${r.id}&_startRow=0&_endRow=200`,
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
              `${base}/goods-shipment/goodsShipment/${r.id}/action/pendingInvoiceLines`,
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

      // Order-linked lines are priced at the ORDER's price, not the chosen Tarifa (Core's
      // UpdatePricesAndAmounts copies orderLine.getUnitPrice() whenever the line has a related
      // order line, ignoring the invoice's price list entirely) — so this fetch does not depend
      // on selectedPriceListId and runs once per shipment selection, not on every Tarifa change.
      const orderLineIds = [...new Set(Object.values(details).map(d => d.salesOrderLine).filter(Boolean))];
      const prices = {};
      await Promise.all(orderLineIds.map(async (id) => {
        try {
          const res = await apiFetch(`${base}/sales-order/lines/${id}`, { baseUrl: '', token });
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

  // Auto-preselects the Tarifa for exactly ONE selected shipment — the same server-resolved
  // tariff the single-shipment "Crear Factura" flow already preselects (linked order's price
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
        const res = await apiFetch(`${base}/goods-shipment/goodsShipment/${invoiceableRows[0].id}`, { baseUrl: '', token });
        if (!res.ok || cancelled) return;
        const rec = (await res.json())?.response?.data?.[0];
        if (rec?.resolvedPriceListId) setResolvedPriceListId(rec.resolvedPriceListId);
      } catch { /* silent — the picker just stays empty, same as before this feature */ }
    })();
    return () => { cancelled = true; };
  }, [showModal, invoiceableRows, base, apiFetch, token]);

  // Tariff prices for lines with NO linked order line — these are the only ones Core actually
  // prices from the invoice's price list (setPricesBasedOnBOM), so this is the only part of the
  // quote that reacts to the Tarifa selection. Reuses the same product-price selector the manual
  // line-entry callout cascade uses (ProductPriceSelectorPolicy, gated on a `priceList` context
  // param) — see artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx for the same pattern.
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
          `${base}/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0&priceList=${encodeURIComponent(selectedPriceListId)}`,
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

  // The quote: pendingQty × real unit price per line — the order's price when the line has one
  // (always correct, since that's what Core actually bills), the selected Tarifa's price
  // otherwise. Never an estimate by design (per the decision behind this feature): a line whose
  // price cannot be resolved from either source simply doesn't contribute, the same "left blank
  // for the user to fill in" gap the single-shipment flow already has for a priceless product.
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
    : `${invoiceableCount} ${ui('shipment')}${invoiceableCount !== 1 ? 's' : ''}`;

  if (selectedRows.length < 1) return null;

  const tooltip = allInvoiced
    ? ui('allShipmentsAlreadyInvoiced')
    : !bpCheck.same
      ? ui('selectShipmentsSameCustomer')
      : !currencyCheck.same
        ? ui('selectShipmentsSameCurrency')
        : undefined;

  const handleCreate = async (priceListId) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await apiFetch(
        `${base}/goods-shipment/goodsShipment/${invoiceableRows[0].id}/action/createDraftInvoice`,
        {
          method: 'POST',
          baseUrl: '',
          token,
          body: JSON.stringify({ shipmentIds: invoiceableRows.map(r => r.id), priceListId }),
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
      // ETP-5381: the duplicate-invoice guard now answers in English (Core's own
      // pending-quantity rejection), so without this the user reads the raw literal.
      toast.error(translateBackendError(err.message, ui) || ui('failedToCreateInvoice'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* ETP-4972 — the surrounding `borderLeft` wrapper was this component's
          own hand-rolled divider, predating SelectionToolbar's automatic
          per-segment divider; kept, it doubled up into two lines. The button
          itself was styled for the old light selection bar (`hsl(var(--card))`
          background) — on the new dark pill that rendered as a solid white
          box. Restyled to the ghost pattern shared with Print/Clone/kebab
          (transparent, hover highlight), but KEEPS its text label — Ale
          (design) confirmed icon-only is fine for universally-recognized
          actions (print, clone, delete) but this one needs the label since a
          generic document icon alone doesn't say "create an invoice from the
          selected shipments". No "(count)" suffix — the pill's own counter
          segment already shows the selection count. Figma "Crear factura"
          button (Button 6, verified in Dev Mode): icon file-plus → lucide
          FilePlus, padding 7px/12px, gap 4px, Hug(149px)×38px. */}
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => setShowModal(true)}
        title={tooltip}
        data-testid="BulkInvoiceFromShipment__button"
        className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
        style={{
          color: canCreate ? 'hsl(var(--floating-toolbar-fg))' : 'hsl(var(--floating-toolbar-muted))',
          cursor: canCreate ? 'pointer' : 'not-allowed',
          opacity: canCreate ? 1 : 0.5,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" data-testid="FilePlus__bulkInvoice" />
        {ui('createInvoiceBtn')}
      </button>

      {showModal && (
        <CreateInvoiceConfirmModal
          data={{ 'businessPartner$_identifier': bpCheck.name, resolvedPriceListId }}
          loading={creating}
          cardAmountLabel={cardAmountLabel}
          pendingQtyTotal={pendingQtyTotal}
          showPriceListPicker
          isSOTrx
          apiBaseUrl={apiBaseUrl}
          token={token}
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
          onPriceListChange={setSelectedPriceListId}
          data-testid="BulkInvoiceFromShipment__confirmModal"
        />
      )}

      {invoiceResult?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui('soInvoiceCreated')}
          docs={[{
            type: 'facturaVenta',
            num: invoiceResult.invoice.documentNo,
            documentStatus: invoiceResult.invoice.documentStatus,
            route: `/sales-invoice/${invoiceResult.invoice.id}`,
          }]}
          primary={ui('soViewInvoice')}
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
