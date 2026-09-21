import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import ConfirmGoodsReceiptModal from './ConfirmGoodsReceiptModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { useMainAttachment } from '@/windows/custom/shared/useMainAttachment.js';
import PurchaseReturnWizard from './PurchaseReturnWizard';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { useDocumentAction } from '@/hooks/useDocumentAction';


// ── Main component ────────────────────────────────────────────────────────────

export default function GoodsReceiptActions({ data, recordId, token, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [returnLines, setReturnLines] = useState([]);
  const [returnedDoc, setReturnedDoc] = useState(null);
  const [confirmedDocs, setConfirmedDocs] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const resultNavigatedRef = useRef(false);

  // Quote inputs — mirrors BulkInvoiceFromReceipt.jsx's own quote (and GoodsShipmentActions'
  // identical single-record wiring) exactly; see either for the full rationale. Only
  // meaningful when the receipt has NO linked purchase order — createFromReceipt's linked-PO
  // branch prices from the order via OrderLine.class in Core, and this button sends no line
  // overrides, so a quote computed from just this receipt's own lines would risk disagreeing
  // with what actually gets billed. `hasLinkedOrder` is derived from the same single-record
  // enrichment `data` already carries.
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [lineDetails, setLineDetails] = useState(null);
  const [pendingByLine, setPendingByLine] = useState(null);
  const [orderLinePrices, setOrderLinePrices] = useState({});
  const [tariffPrices, setTariffPrices] = useState({});
  const hasLinkedOrder = Array.isArray(data?.linkedOrders) && data.linkedOrders.length > 0;

  const isCompleted = data?.documentStatus === 'CO';
  const isFullyInvoiced = (parseFloat(data?.invoiceStatus ?? 0)) >= 100;
  const isFullyReturned = (parseFloat(data?.returnStatus ?? 0)) >= 100;

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const downloadLinkRef = useRef(null);

  const previewAttachment = useMainAttachment({
    documentId: recordId,
    tableName: 'M_InOut',
    storeCondition: isCompleted,
    token,
    apiBaseUrl,
  });
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ETP-5265 — when the receipt is already fully invoiced, Confirm skips the
  // intermediate "already invoiced" popup entirely and calls the document-action
  // endpoint directly, like any other direct action in the app. The non-fully-invoiced
  // flow (ConfirmGoodsReceiptModal) is untouched.
  //
  // ETP-5265 QA follow-up (2) — in-flight feedback is the Confirm button's own spinner,
  // never a floating toast. The listener below hands this promise back through the
  // CustomEvent `detail` (see dispatchConfirmModalEvent in the window's index.jsx) and
  // runDraftModeConfirm in saveActions.jsx awaits it, so whatever this function awaits
  // is exactly how long the button stays busy. It therefore awaits the refetch too
  // (`onRefresh`, which is `hook.fetchById(id, { force: true })` and became awaitable in
  // useEntity.js): the first cut resolved on the POST alone (~150-300 ms locally) and the
  // spinner was imperceptible, because the record refresh happened afterwards, out of
  // band. Now the busy state runs unbroken from the click until the refreshed record is
  // on screen.
  //
  // Two failure domains, deliberately separate: a failed POST is a failed confirmation
  // (toast.error, no success toast, no refresh); a failed REFRESH is not — the document
  // is confirmed, the screen is merely stale, and reporting it as an error would be a
  // lie. Success-toast placement mirrors the native draftMode path exactly: useEntity's
  // handleSaveAndProcess fires `toast.success` as soon as the action POST succeeds and
  // only then refetches, so ours fires there too, not after the refresh.
  //
  // NOTE — this path no longer routes through `setConfirmedDocs({ invoice: null })`. That
  // setter's effect (ETP-5063) both toasts AND refreshes, and it cannot be awaited, so it
  // cannot hold the button busy. The effect is still live and still owns the
  // ConfirmGoodsReceiptModal path, which is why the two look different here: only this
  // branch needs a promise to hand back.
  const confirmDocAction = useDocumentAction({ apiBaseUrl, entity: 'goodsReceipt', token });
  const confirmingFullyInvoicedRef = useRef(false);
  const handleConfirmFullyInvoiced = useCallback(async () => {
    if (confirmingFullyInvoicedRef.current) return;
    confirmingFullyInvoicedRef.current = true;
    try {
      try {
        await confirmDocAction.execute(recordId, 'CO');
      } catch (err) {
        // Domain 1 — the confirmation itself failed. Nothing else must run.
        toast.error(err.message || ui('networkError'));
        return;
      }
      // The document IS confirmed from here on. Same moment the native path toasts.
      toast.success(ui('goodsReceipt.confirmModal.confirmedTitle'));
      // Domain 2 — a refetch failure must never read as a failed confirmation. Swallowed
      // on purpose; the button simply stops spinning on stale (but correct) data.
      await Promise.resolve(onRefresh?.()).catch(() => {});
    } finally {
      // Cleared only once BOTH the POST and the refresh have settled, so a second click
      // cannot start while the first operation is still in flight.
      confirmingFullyInvoicedRef.current = false;
    }
  }, [confirmDocAction.execute, recordId, ui, onRefresh]);

  useEffect(() => {
    // ETP-5265 QA follow-up — `e.detail.promise` is how the in-flight documentAction
    // call reaches the core's Confirm button (see dispatchConfirmModalEvent in the
    // window's index.jsx). The modal branch deliberately leaves it unset: opening a
    // modal is instantaneous, so the button must not spin for it.
    const handler = (e) => {
      if (isFullyInvoiced) {
        if (e?.detail) e.detail.promise = handleConfirmFullyInvoiced();
        else handleConfirmFullyInvoiced();
      } else {
        setShowConfirm(true);
      }
    };
    window.addEventListener('goods-receipt:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-receipt:open-confirm-modal', handler);
  }, [isFullyInvoiced, handleConfirmFullyInvoiced]);

  useEffect(() => {
    if (!wizardOpen || !recordId || !base) return;
    const bpId = data?.businessPartner;
    if (!bpId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${base}/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceiptLines`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ receiptId: recordId, businessPartner: bpId }),
          },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setReturnLines(json?.response?.data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, recordId, base, headers, data?.businessPartner]);

  // ETP-5063 — when confirming the receipt created no related invoice, skip
  // the result modal and communicate success via an auto-dismissing toast
  // instead, matching the UX used everywhere else success is communicated.
  useEffect(() => {
    if (confirmedDocs && !confirmedDocs.invoice?.id) {
      toast.success(ui('goodsReceipt.confirmModal.confirmedTitle'));
      onRefresh?.();
      setConfirmedDocs(null);
    }
  }, [confirmedDocs, onRefresh, ui]);

  // Fetches this receipt's own lines (product + salesOrderLine) and its pending-quantity map.
  // Skipped entirely when a linked order exists (see hasLinkedOrder above).
  useEffect(() => {
    if (!showInvoiceConfirm || hasLinkedOrder || !recordId) {
      setLineDetails(null);
      setPendingByLine(null);
      setOrderLinePrices({});
      return;
    }
    let cancelled = false;
    (async () => {
      const [lineRes, pendingRes] = await Promise.all([
        apiFetch(`${base}/goods-receipt/goodsReceiptLine?parentId=${recordId}&_startRow=0&_endRow=200`, { baseUrl: '', token })
          .catch(() => null),
        apiFetch(`${base}/goods-receipt/goodsReceipt/${recordId}/action/pendingInvoiceLines`, { baseUrl: '', token })
          .catch(() => null),
      ]);
      if (cancelled) return;

      const lines = lineRes?.ok ? (await lineRes.json())?.response?.data || [] : [];
      const details = {};
      lines.forEach(l => { details[l.id] = { product: l.product, salesOrderLine: l.salesOrderLine || null }; });
      setLineDetails(details);

      const pendingData = pendingRes?.ok ? (await pendingRes.json())?.response?.data || [] : [];
      const pendingMap = {};
      pendingData.forEach(item => { pendingMap[item.lineId] = Number(item.pendingQty) || 0; });
      setPendingByLine(pendingMap);

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
  }, [showInvoiceConfirm, hasLinkedOrder, recordId, base, apiFetch, token]);

  // Tariff prices for lines with no linked order line — reactive to the Tarifa selection.
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

  const cardAmountLabel = quoteAmount != null
    ? formatCurrency(data?.['etgoCurrency$_identifier'] || data?.['currency$_identifier'] || '', quoteAmount)
    : undefined;

  const handleCreateInvoice = async (priceListId) => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const res = await fetch(
        `${base}/goods-receipt/goodsReceipt/${recordId}/action/createPurchaseInvoice`,
        { method: 'POST', headers, body: JSON.stringify({ priceListId }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const invData = (await res.json())?.response?.data;
      setShowInvoiceConfirm(false);
      // ETP-5381: carry documentStatus so the result modal badges the invoice as Confirmada.
      setConfirmedDocs({ invoice: { id: invData?.id ?? null, documentNo: invData?.documentNo || '', documentStatus: invData?.documentStatus ?? null } });
    } catch (err) {
      // ETP-5381: the duplicate-invoice guard answers in English (the module's convention;
      // backendErrors.js localizes it), so without this the user reads the raw literal.
      toast.error(translateBackendError(err.message, ui) || ui('failedToCreateInvoice'));
    } finally {
      setCreatingInvoice(false);
    }
  };

  const sqBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 36, width: 36, borderRadius: 6, border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', cursor: 'pointer', boxShadow: '0px 1px 2px 0px hsl(var(--foreground) / 0.05)', flexShrink: 0 };
  const textBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 };

  return (
    <>
      {/* ETP-5260 — Clone/Copy-link moved to the topbarSecondary slot
          (GoodsReceiptSecondaryActions). This component now only renders the
          PRIMARY flow buttons below and their modals. */}

      {isCompleted && !isFullyReturned && (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{ ...textBtn, border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
            <path d="M12 15l-3 3 3 3" />
            <path d="M9 18h8" />
          </svg>
          {ui('createReturn')}
        </button>
      )}

      {isCompleted && !isFullyInvoiced && (
        <button
          type="button"
          onClick={() => setShowInvoiceConfirm(true)}
          // Fix (not part of ETP-5260): was `var(--status-info-fg)` — a badge-text token,
          // not a button-background token — which rendered a saturated blue instead of
          // the dark gray used by the real `Confirmar` button. Same pattern as ETP-4781.
          // The `1px solid var(--status-info-border)` ring was a leftover from that same
          // badge styling — the real `Confirmar` button (DraftModeConfirmButton) has no
          // border at all, just the dark fill.
          style={{ ...textBtn, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          // Hover to match the shared Confirm button's `hover:bg-primary/90` (90% opacity).
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--primary) / 0.9)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--primary))'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {ui('createInvoiceBtn')}
        </button>
      )}

      {/* ETP-5265 — the fully-invoiced case no longer opens a confirm popup here;
          see handleConfirmFullyInvoiced above. This modal only ever renders now
          for the normal (not-fully-invoiced) confirm flow. */}
      {!isFullyInvoiced && showConfirm && (
        <ConfirmGoodsReceiptModal
          data={data}
          base={base}
          headers={headers}
          recordId={recordId}
          onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {showInvoiceConfirm && (
        <CreateInvoiceConfirmModal
          data={data}
          loading={creatingInvoice}
          pendingQtyUrl={`${base}/goods-receipt/goodsReceipt/${recordId}/action/pendingInvoiceLines`}
          cardAmountLabel={cardAmountLabel}
          showPriceListPicker
          isSOTrx={false}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onConfirm={handleCreateInvoice}
          onClose={() => setShowInvoiceConfirm(false)}
          onPriceListChange={setSelectedPriceListId}
        />
      )}

      {confirmedDocs?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui('goodsReceipt.confirmModal.confirmedTitle')}
          docs={[{ type: 'facturaCompra', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, documentStatus: confirmedDocs.invoice.documentStatus, route: `/purchase-invoice/${confirmedDocs.invoice.id}` }]}
          primary={ui('soViewInvoice')}
          currency={data?.['currency$_identifier'] || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setConfirmedDocs(null);
            setTimeout(() => {
              // ETP-4779 — partial refresh instead of a full page reload: refetch
              // the header (badge/readonly state) via onRefresh; the "Documentos"
              // section (RelatedDocuments.jsx, derived from `data.linkedInvoices`)
              // picks up the newly created invoice automatically once `data`
              // updates. Skipped when the user navigated away instead of closing.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
        />,
        document.body,
      )}

      {returnedDoc && createPortal(
        <ConfirmResultModal
          title={ui('purchaseReturnCreatedTitle')}
          docs={[{ type: 'salida', num: returnedDoc.documentNo, route: `/return-to-vendor-shipment/${returnedDoc.id}` }]}
          primary={ui('soViewShipment')}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setReturnedDoc(null);
            setTimeout(() => {
              // ETP-4779 — same partial-refresh rationale as the invoice
              // confirmation panel above.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
        />,
        document.body,
      )}

      {isCompleted && previewAttachment.storedFile && (
        <a
          ref={downloadLinkRef}
          href={previewAttachment.storedFile.objectUrl}
          download={previewAttachment.storedFile.fileName}
          title={previewAttachment.storedFile.fileName}
          style={{ ...sqBtn, textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}

      <PurchaseReturnWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        receiptData={data}
        lines={returnLines}
        base={base}
        headers={headers}
        onSuccess={(result) => { setWizardOpen(false); setReturnedDoc(result); }}
        onError={(msg) => toast.error(msg)}
      />
    </>
  );
}

// ── CloneReceiptModal ─────────────────────────────────────────────────────────
// ETP-5260 — exported: the Clone button/modal now live in the topbarSecondary
// slot (GoodsReceiptSecondaryActions), which renders this modal via
// `DocumentSecondaryActions`' `children` extension point (this window's clone
// UX is bespoke — a self-contained fetch-lines-then-clone modal, not
// CloneOrderModal — so it stays a window-owned child instead of being folded
// into the shared component's generic `clone` config).

export function CloneReceiptModal({ receiptId, data, base, headers, onClose, onCloned }) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lines, setLines] = useState(null);

  const documentNo = data?.documentNo || '';
  const bpName = data?.['businessPartner$_identifier'] || '';
  const status = data?.documentStatus;

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/goods-receipt/goodsReceiptLine?parentId=${receiptId}&_startRow=0&_endRow=999`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled) setLines(json?.response?.data ?? []); })
      .catch(() => { if (!cancelled) setLines([]); });
    return () => { cancelled = true; };
  }, [receiptId, base, headers]);

  const statusMap = {
    DR: { label: ui('orderStatusDraft'), bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
    CO: { label: ui('orderStatusCompleted'), bg: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  };
  const badge = statusMap[status] || { label: status, bg: 'hsl(var(--foreground))', color: 'hsl(var(--muted-foreground))' };
  const lineCount = lines?.length ?? null;
  const lineLabel = lineCount === null ? '…' : lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount });

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/goods-receipt/goodsReceipt/${receiptId}/action/cloneRecord`, { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.response?.error?.message || ui('cloneReceiptError'));
        return;
      }
      onCloned(json?.response?.data?.id);
    } catch {
      setError(ui('cloneReceiptError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / 0.3)' }}>
      <div style={{ width: 440, borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--card))', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' }}>{ui('cloneReceiptConfirmTitle')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: '1px solid hsl(var(--card))', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--card))' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName}</span>
              {documentNo && <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>{documentNo}</span>}
              {status && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{badge.label}</span>}
            </div>
            <div style={{ padding: '6px 14px 9px', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))' }}>
              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{lineLabel}</span>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: 0, padding: '0 2px' }}>{ui('cloneReceiptConfirmBody')}</p>
          {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 6, border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer' }}>{ui('cancel')}</button>
            <button type="button" onClick={handleClone} disabled={loading} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--status-info-bg)', color: 'hsl(var(--card))', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {loading ? ui('creating') : ui('cloneReceiptAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
