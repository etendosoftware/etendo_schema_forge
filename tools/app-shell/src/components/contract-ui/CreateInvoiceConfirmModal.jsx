import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { Skeleton } from '@/components/ui/skeleton';
import { overlayStyle, cardStyle, btnPrimaryStyle, btnSecondaryStyle, closeBtnStyle, Spinner } from './ConfirmDocumentModal';
import { usePriceListPicker, PriceListSelectField } from './PriceListPicker';
import { useRectifiableInvoices, RectifiableInvoiceField } from './RectifiableInvoicePicker';

import { authHeaders } from '@/auth/api.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
/**
 * Generic "Create Invoice" confirmation modal — used by both goods-shipment and
 * goods-receipt. Shows a summary card and a checkbox before executing the action.
 *
 * Props:
 *   data             — header record data (documentNo, businessPartner$_identifier, etc.)
 *                      ETP-4942: also reads `resolvedPriceListId` when present (currently
 *                      populated only for goods-shipment, see
 *                      GoodsShipmentHeaderHandler#enrichResolvedPriceList) to preselect the
 *                      correct tariff in the picker below. This field is always mandatory
 *                      here (there is no "linked order makes it optional" variant like in
 *                      ConfirmInOutModal), so the generic system-default/first-entry
 *                      fallback is disabled (`allowGenericFallback: false`): with no
 *                      resolved default, the picker starts empty and the user must choose
 *                      a tariff explicitly instead of one being silently autofilled.
 *   loading          — external loading state (parent sets while API call is in flight)
 *   pendingQtyUrl    — optional URL to fetch { response: { data: [{ pendingQty }] } }
 *                      to display the pending units subtitle. Omit for a generic subtitle.
 *   onConfirm        — called with (priceListId, originInvoiceIds) when the user clicks Confirm
 *                      (when showPriceListPicker is true a price list must be selected; when
 *                      rectifiableInvoicesUrl is set at least one invoice to rectify must be)
 *   onClose          — called to dismiss without confirming
 *   rectifiableInvoicesUrl — ETP-5381: when set, shows the required "invoice to rectify" picker.
 *                      Rectificative invoices are now created AND confirmed in one step, and the
 *                      completion is rejected outright unless the C_Invoice_Reverse link exists,
 *                      so the choice has to be made here rather than afterwards.
 *   showPriceListPicker — ETP-4028: shipments/receipts carry no price list of their own —
 *                      when true, shows a required Tarifa selector so the user explicitly
 *                      picks the price list applied to every line of the generated invoice.
 *                      Currency is always inherited from the shipment/receipt (read-only,
 *                      shown in the summary card above) — never chosen here.
 *   isSOTrx          — sales (true) vs purchase (false) price lists offered by the picker
 *   apiBaseUrl       — required when showPriceListPicker is true, to fetch price lists
 *   token            — auth bearer token, required for the pendingQtyUrl and price-list fetches
 *   cardAmountLabel  — overrides the summary card's amount line. The card's own total (see
 *                      `grandTotal` below) only exists for a single open record — a bulk caller
 *                      driving this modal from a grid selection has no such figure, so it passes
 *                      a label instead (e.g. "3 albaranes"). Omit to keep the single-record total.
 *   cardAmountLoading — ETP-5410 follow-up: shows a skeleton placeholder (same primitive as
 *                      NewPaymentEntryModal's own async fields — `@/components/ui/skeleton`, a
 *                      static pulsing shape, deliberately NOT a spinning icon) in the amount
 *                      line instead of `cardAmountLabel`/the computed total. A caller that
 *                      resolves its own quote asynchronously (the bulk toolbar actions) passes
 *                      this true while the quote is still in flight, so the card reads as
 *                      "loading" rather than flashing an empty amount and popping in the real
 *                      one a beat later. A spinner was tried first and rejected: at the
 *                      ~100-250ms this resolves in locally, a spinning icon appearing and
 *                      vanishing read as a glitch, not a loading state — the static skeleton
 *                      shape doesn't have that problem even for a very brief show.
 *   pendingQtyTotal  — pre-summed pending-units count. A bulk caller already fetches
 *                      `pendingInvoiceLines` per selected document to sum them for its own guard,
 *                      so this skips the modal's own `pendingQtyUrl` fetch (which only ever
 *                      targets one document) instead of duplicating N requests. Omit to keep the
 *                      `pendingQtyUrl` fetch.
 *   onPriceListChange — optional. Called with the picker's current `priceListId` every time it
 *                      changes (including the initial preselect/resolve). The picker's selection
 *                      is internal state this modal owns; a bulk caller that needs to react to it
 *                      (e.g. to recompute a per-line quote once a Tarifa is chosen) has no other
 *                      way to observe it. A no-op when omitted.
 */
export default function CreateInvoiceConfirmModal({
  data,
  loading,
  pendingQtyUrl,
  onConfirm,
  onClose,
  showPriceListPicker = false,
  isSOTrx = true,
  apiBaseUrl,
  token,
  rectifiableInvoicesUrl,
  cardAmountLabel,
  cardAmountLoading,
  pendingQtyTotal,
  onPriceListChange,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch();
  const [pendingQty, setPendingQty] = useState(null);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const priceListHeaders = useMemo(() => (authHeaders(token)), [token]);
  const { priceLists, priceListId, setPriceListId, loading: loadingPriceLists } = usePriceListPicker({
    enabled: showPriceListPicker,
    isSOTrx,
    base,
    headers: priceListHeaders,
    // ETP-4942 — preselect the price list the backend already resolved (linked order,
    // else the Business Partner's own tariff) instead of always falling back to the
    // system-default price list. Same fix as the pre-completion popup (ConfirmInOutModal),
    // applied here to the post-completion "Crear factura" button, which shares this hook.
    defaultPriceListId: data?.resolvedPriceListId,
    // ETP-4942 — this selector is always mandatory in this modal (no optional/prefilled
    // variant), so the generic fallback (system `default` flag / first list entry) is
    // disabled: an arbitrary tariff must never silently satisfy a required field.
    allowGenericFallback: false,
  });

  const rectify = useRectifiableInvoices({
    enabled: !!rectifiableInvoicesUrl,
    url: rectifiableInvoicesUrl,
    token,
  });

  useEffect(() => {
    onPriceListChange?.(priceListId);
  }, [priceListId, onPriceListChange]);

  const documentNo  = data?.documentNo || '';
  const bpName      = data?.['businessPartner$_identifier'] || '';
  const linkedOrder = Array.isArray(data?.linkedOrders) ? data.linkedOrders[0] : null;
  // The document's own currency wins — it may have been edited in draft to diverge
  // from the linked order's currency (ETP-4028: currency is editable until confirmed).
  const currency    = data?.['etgoCurrency$_identifier'] || data?.['currency$_identifier']
    || linkedOrder?.['currency$_identifier'] || '';
  const currencyCode = currency;
  const grandTotal  = Number(linkedOrder?.grandTotalAmount ?? data?.grandTotalAmount ?? 0);

  const fmtNum = (v, dec = 2) =>
    v != null ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: true }) : '-';

  const formattedTotal = currencyCode ? formatCurrency(currencyCode, grandTotal) : fmtNum(grandTotal);
  // A bulk caller passes cardAmountLabel because it has no single trustworthy total to show
  // (see CreateInvoiceConfirmModal usage from the bulk toolbar actions) — it wins over both the
  // computed total and the documentNo fallback, neither of which mean anything for N documents.
  const displayAmount = cardAmountLabel ?? (grandTotal !== 0 ? formattedTotal : documentNo);

  useEffect(() => {
    // A bulk caller supplies pendingQtyTotal already summed across its selection — pendingQtyUrl
    // only ever targets one document, so it would be the wrong fetch (and the wrong number) here.
    if (pendingQtyTotal !== undefined || !pendingQtyUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(pendingQtyUrl, { baseUrl: '', token });
        if (!res.ok || cancelled) return;
        const lines = (await res.json())?.response?.data || [];
        const total = lines.reduce((sum, l) => sum + Number(l.pendingQty || 0), 0);
        if (!cancelled) setPendingQty(total);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [pendingQtyUrl, pendingQtyTotal, token, apiFetch]);

  const effectivePendingQty = pendingQtyTotal !== undefined ? pendingQtyTotal : pendingQty;
  const subtitle = effectivePendingQty != null
    ? ui('soAmountPendingInvoice', { pending: `${fmtNum(effectivePendingQty, 0)} ${ui('units')}` })
    : ui('soCreateInvoiceCheckDesc');

  const canConfirm = (!showPriceListPicker || !!priceListId) && rectify.isSatisfied;
  // Sonar S3776 — the primary button below reused `loading || !canConfirm`
  // three times (disabled, opacity, cursor); computing it once removes two
  // redundant evaluations from the function's cognitive complexity.
  const confirmDisabled = loading || !canConfirm;
  // ETP-5333 — while the invoice is being created, the modal must stay mounted
  // (see the primary button below): a backdrop click or the × must not close it
  // out from under the in-flight request, which would reproduce the same
  // "closes with no feedback" symptom the loading state exists to prevent.
  const dismiss = loading ? undefined : onClose;
  return createPortal(
    <div data-testid="create-invoice-confirm-modal" onClick={dismiss} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={dismiss} disabled={loading} style={closeBtnStyle}>&times;</button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>{bpName}</div>}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, display: 'flex', alignItems: 'center', minHeight: 28 }}>
              {cardAmountLoading
                ? <Skeleton className="h-6 w-28 rounded" data-testid="Skeleton__cardAmount" />
                : displayAmount}
            </div>
          </div>
        </div>

        {showPriceListPicker && (
          <div style={{ padding: '0 20px 14px' }}>
            <PriceListSelectField
              priceLists={priceLists}
              priceListId={priceListId}
              onChange={setPriceListId}
              loading={loadingPriceLists}
              idPrefix="invoice-confirm-price-list"
              data-testid="invoice-confirm-price-list-field" />
          </div>
        )}

        {rectifiableInvoicesUrl && (
          <div style={{ padding: '0 20px 14px' }}>
            <RectifiableInvoiceField
              invoices={rectify.invoices}
              selectedIds={rectify.selectedIds}
              onToggle={rectify.toggle}
              onApply={rectify.setSelectedIds}
              loading={rectify.loading}
              isEmpty={rectify.isEmpty}
              selectedInvoices={rectify.selectedInvoices}
              search={rectify.search}
              onSearchChange={rectify.setSearch}
              onReachBottom={rectify.loadMore}
              loadingMore={rectify.loadingMore}
              loadError={rectify.loadError}
              onRetry={rectify.retry}
              idPrefix="invoice-confirm-rectify"
              data-testid="RectifiableInvoiceField__e6fb8b" />
          </div>
        )}

        {/*
          ETP-5381: no "create invoice" checkbox here. Every button that opens this modal already
          says "Crear factura" / "Crear factura rectificativa", so asking again was a confirmation
          of a confirmation — and unticking it left a dialog whose only action did nothing.
          The pending-units subtitle it used to carry is shown above instead.

          This is NOT the same as the toggle in ConfirmInOutModal: there the button says
          "Confirmar", and generating the invoice really is an optional extra.
        */}
        <div style={{ padding: '0 20px 16px', fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
          {subtitle}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid hsl(var(--border-subtle))' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondaryStyle, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(priceListId, rectify.selectedIds)}
            disabled={confirmDisabled}
            style={{ ...btnPrimaryStyle, opacity: confirmDisabled ? 0.6 : 1, cursor: confirmDisabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {loading && <Spinner data-testid="Spinner__e6fb8b" />}
            {loading ? ui('soProcessing') : ui('soCreateDocsBtn')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
