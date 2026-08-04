import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import { trackTransactionPosted, trackDocumentCreated } from '@/lib/observability/health-events.js';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { incrementSurveyCounter } from '@/lib/surveys/survey-state.js';
import { emitSurveyTrigger } from '@/lib/surveys/survey-engine.js';
import { useOrderPdf } from '@/windows/custom/shared/useOrderPdf.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const CRITERIA = (field, value) =>
  encodeURIComponent(JSON.stringify([{ fieldName: field, operator: 'equals', value }]));

const fmtNum = (v, decimals = 2) =>
  v != null && v !== '' && !isNaN(Number(v))
    ? Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : '0';

function Spinner() {
  return (
    <>
      <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OrderCreateInvoice({ data, recordId, token, apiBaseUrl, onRefresh, onSave }) {
  const navigate = useNavigate();
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [showSend,      setShowSend]      = useState(false);
  const [showActions,   setShowActions]   = useState(false);
  const [actionsScroll, setActionsScroll] = useState(null); // 'shipment'|'invoice'|null
  const [fetched,       setFetched]       = useState(null);
  const [confirmedDocs,  setConfirmedDocs]  = useState(null); // set after confirm+reload when both docs created
  const [confirmedTitle, setConfirmedTitle] = useState(null); // null = "Order confirmed", string = custom title
  const [showClone,      setShowClone]      = useState(false);
  const [isCloneHovered, setIsCloneHovered] = useState(false);

  const status      = data?.documentStatus;
  const isDraft     = status === 'DR';
  const isCompleted = status === 'CO';

  const base    = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ETP-4372 — source the same client-rendered PDF the OrderPreview panel uses
  // so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally (rules of hooks).
  const { pdfUrl, loading: pdfLoading } = useOrderPdf(recordId, apiBaseUrl, token);


  // draftMode confirm button (DetailView) dispatches this event to open the confirm modal
  useEffect(() => {
    const handler = () => setShowConfirm(true);
    window.addEventListener('sales-order:open-confirm-modal', handler);
    return () => window.removeEventListener('sales-order:open-confirm-modal', handler);
  }, []);

  // OrderDraftChips (topbarExtra) dispatches this event when a grouped chip is clicked
  useEffect(() => {
    const handler = (e) => {
      setActionsScroll(e.detail?.scrollTo ?? null);
      setShowActions(true);
    };
    window.addEventListener('sales-order:open-actions-modal', handler);
    return () => window.removeEventListener('sales-order:open-actions-modal', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    (async () => {
      try {
        // listInvoices finds ALL invoices via line items (works even when C_Invoice.C_Order_ID is null)
        const [shipRes, linesRes, invRes] = await Promise.all([
          fetch(`${base}/goods-shipment/goodsShipment?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`, { headers }),
          fetch(`${apiBaseUrl}/header/${recordId}/action/listInvoices`, { headers }),
        ]);
        if (cancelled) return;

        const shipments  = shipRes.ok  ? ((await shipRes.json())?.response?.data  ?? []) : [];
        const orderLines = linesRes.ok ? ((await linesRes.json())?.response?.data ?? []) : [];
        const invoices   = invRes.ok   ? ((await invRes.json())?.response?.data   ?? []) : [];

        // deliveredQuantity and invoicedQuantity are system fields on order lines —
        // Etendo updates them when shipments/invoices are confirmed, so they are
        // the authoritative source. No need to fetch shipment lines separately.
        if (!cancelled) setFetched({ shipments, invoices, orderLines });
      } catch {
        if (!cancelled) setFetched({ shipments: [], invoices: [], orderLines: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [isCompleted, recordId, base, headers, apiBaseUrl]);

  // Modal shown after confirming — always, regardless of which docs were created
  const confirmedPanel = confirmedDocs
    ? createPortal(
        <ConfirmResultModal
          title={confirmedTitle || ui('soConfirmedTitle')}
          docs={[
            confirmedDocs?.shipment?.id && { type: 'salida', num: confirmedDocs.shipment.documentNo, amount: confirmedDocs.shipment.amount, route: `/goods-shipment/${confirmedDocs.shipment.id}` },
            confirmedDocs?.invoice?.id && { type: 'facturaVenta', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, route: `/sales-invoice/${confirmedDocs.invoice.id}` },
          ].filter(Boolean)}
          currency={data?.['currency$_identifier'] || ''}
          navigate={navigate}
          onClose={() => { setConfirmedDocs(null); setConfirmedTitle(null); emitSurveyTrigger(); onRefresh?.(); }}
          data-testid="ConfirmResultModal__18d1f0" />,
        document.body,
      )
    : null;

  const cloneButton = (
    <button type="button" onClick={() => setShowClone(true)} style={{...btnCloneStyle, background: isCloneHovered ? 'hsl(var(--card))' : 'hsl(var(--card))'}} title={ui('cloneOrderBtn')} onMouseEnter={() => setIsCloneHovered(true)} onMouseLeave={() => setIsCloneHovered(false)}>
      <CopyIcon data-testid="CopyIcon__18d1f0" />
    </button>
  );
  const clonePortal = showClone ? createPortal(
    <CloneModal
      orderId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      headers={headers}
      onClose={() => setShowClone(false)}
      onCloned={(newId) => navigate(`/sales-order/${newId}`)}
      data-testid="CloneModal__18d1f0" />,
    document.body,
  ) : null;

  // ── COMPLETED (loading) ────────────────────────────────────────────────────
  if (isCompleted && !fetched) {
    return <>{confirmedPanel}<span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 8px' }}>…</span></>;
  }

  // ── COMPLETED — compute derived values ─────────────────────────────────────
  const openModal = (scrollTo = null) => {
    setActionsScroll(scrollTo);
    setShowActions(true);
  };

  let buttonLabel = null;
  let derived = null;
  let currency = '';
  if (isCompleted) {
    const { shipments, invoices, orderLines } = fetched;

    const shipmentsDraft    = shipments.filter(s => s.documentStatus === 'DR');
    const shipmentsComplete = shipments.filter(s => s.documentStatus === 'CO');
    const invoiceDraft      = invoices.find(i => i.documentStatus === 'DR') ?? null;
    const invoicesComplete  = invoices.filter(i => i.documentStatus === 'CO');

    // deliveredQuantity is a system field on each order line — Etendo updates it
    // when shipments are confirmed. More reliable than summing shipment lines.
    const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
    const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
    const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

    const totalOrder    = Number(data?.grandTotalAmount) || 0;
    const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
    const totalPending  = Math.max(0, totalOrder - totalInvoiced);

    currency = data?.['currency$_identifier'] || '';

    // Acción pendiente = hay qty/importe pendiente Y no hay borrador cubriendo esa acción
    // (si hay borrador, el chip en topbar ya lo cubre — el botón Gestionar no la incluye)
    const needsShip    = qtyPending > 0 && shipmentsDraft.length === 0;
    const needsInvoice = totalPending > 0 && !invoiceDraft;

    if      (needsShip && needsInvoice) buttonLabel = ui('soManageShipmentAndInvoice');
    else if (needsShip)                 buttonLabel = ui('soManageShipment');
    else if (needsInvoice)              buttonLabel = ui('soManageInvoice');

    derived = {
      shipmentsComplete, invoicesComplete,
      qtyOrdered, qtyDelivered, qtyPending,
      totalOrder, totalInvoiced, totalPending,
      needsShip, needsInvoice,
    };
  }

  return (
    <>
      {/* Main action button — only shown when action is still pending */}
      {isCompleted && buttonLabel && (
        <button type="button" onClick={() => openModal(null)} style={btnPrimaryStyle}>
          {buttonLabel}
        </button>
      )}
      {cloneButton}
      {/* ETP-4717 — Send is only available once the order is Confirmed (CO),
          matching the grid row quick-action's status gate. Previously also
          shown on Draft (ETP-4372); that was inconsistent with the other
          document windows and has been corrected. */}
      {isCompleted && <SendDocumentButton
        onClick={() => setShowSend(true)}
        data-testid="SendDocumentButton__18d1f0" />}
      {clonePortal}
      {isDraft && showConfirm && createPortal(
        <ConfirmModal
          orderId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          onSave={onSave}
          onClose={() => setShowConfirm(false)}
          onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
          data-testid="ConfirmModal__18d1f0" />,
        document.body,
      )}
      {isCompleted && showActions && createPortal(
        <CreateDocsModal
          orderId={recordId}
          data={data}
          base={base}
          headers={headers}
          currency={currency}
          derived={derived}
          onClose={() => setShowActions(false)}
          onCreated={(docs) => { setShowActions(false); setConfirmedTitle(ui('soDocsCreatedTitle')); setConfirmedDocs(docs); }}
          data-testid="CreateDocsModal__18d1f0" />,
        document.body,
      )}
      {isCompleted && showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Sales Order')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="sales-order"
          token={token}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={pdfLoading}
          onClose={() => setShowSend(false)}
          data-testid="SendDocumentModal__18d1f0" />,
        document.body,
      )}
      {confirmedPanel}
    </>
  );
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

export function ConfirmModal({ orderId, data, apiBaseUrl, headers, onClose, onConfirmed, onSave }) {
  const ui       = useUI();
  const [createShipment,  setCreateShipment]  = useState(false);
  const [createInvoice,   setCreateInvoice]   = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [lineCount,       setLineCount]       = useState(null);
  const [freshData,       setFreshData]       = useState(null);
  const [orderConfirmed,  setOrderConfirmed]  = useState(false);
  const [shipmentResult,  setShipmentResult]  = useState(null);
  const [invoiceResult,   setInvoiceResult]   = useState(null);

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          fetch(`${apiBaseUrl}/header/${orderId}`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers }),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const json = await recRes.json();
          if (!cancelled) setFreshData(json?.response?.data?.[0] ?? json);
        }
        if (linesRes.ok) {
          const json = await linesRes.json();
          if (!cancelled) setLineCount(json?.response?.data?.length ?? 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orderId, apiBaseUrl, headers]);

  // ETP-4468 — the in-memory `data` prop (which already reflects any unsaved
  // header edit the user made before clicking Confirm) must win over the
  // server-fetched `freshData` (stale because nothing was saved yet). The
  // fresh fetch is only a fallback for the very first render before `data`
  // arrives, or if `data` is genuinely empty.
  const d              = data || freshData || {};
  const documentNo     = d.documentNo || '';
  const bpName         = d['businessPartner$_identifier'] || '';
  // Apply etgoTotalDiscount client-side only while the order is still in DR — at
  // that point TotalDiscountService has not yet materialized the ETGO_DTO line, so
  // the server totals are pre-discount and we show the user what the totals WILL be
  // once the order transitions to CO. After CO the totals already reflect the
  // discount and any extra factor would double-apply it.
  const discountPct    = Number(d.etgoTotalDiscount ?? 0);
  const isPreCompletion = d.documentStatus === 'DR';
  const discountFactor = (isPreCompletion && discountPct > 0) ? (1 - discountPct / 100) : 1;
  // Same accounting rule as DocumentTotalsPanel: the displayed total must equal
  // round(net × factor) + round(tax × factor), not round(gross × factor).
  // Avoids the 1-cent double-rounding drift versus the order's right panel and
  // the printed invoice (AEAT/Modelo 303 rule "base + IVA = total").
  const round2        = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const grossBase     = Number(d.grandTotalAmount) || 0;
  const netBase       = Number(d.summedLineAmount ?? d.totalLines ?? grossBase) || 0;
  const totalLines    = round2(netBase * discountFactor);
  const grandTotal    = totalLines + round2((grossBase - netBase) * discountFactor);
  const currency       = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    // ETP-4468 — force-save any unsaved header edit before confirming. Without
    // this, an edit made right before clicking Confirm (without hitting Save
    // first) would be silently discarded — the order gets confirmed with the
    // OLD header values. Abort the whole confirm flow if the save fails.
    if (onSave) {
      const saved = await onSave();
      if (!saved?.id) {
        setError(ui('soSaveBeforeConfirmError'));
        setLoading(false);
        return;
      }
    }

    // Step 1: Confirm the order — must succeed before anything else.
    // If this fails the order is still in DR, so the rest of the flow makes no sense.
    if (!orderConfirmed) {
      try {
        const processRes = await fetch(
          `${apiBaseUrl}/header/${orderId}/action/documentAction`,
          { method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }) },
        );
        if (!processRes.ok) {
          const e = await processRes.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${processRes.status})`);
        }
        setOrderConfirmed(true);
        incrementSurveyCounter('order');
        trackTransactionPosted();
        window.dispatchEvent(new CustomEvent('sales-order:document-created'));
      } catch (e) {
        setError(e.message || ui('soErrorOccurred'));
        setLoading(false);
        return;
      }
    }

    // Steps 2 and 3 are independent: the invoice uses order quantities, not
    // shipment quantities. A failure in one must NOT prevent the other from
    // running. Errors are accumulated and shown together at the end.
    const errors = [];

    // Step 2: Create shipment if checked and not already done
    let currentShipment = null;
    if (createShipment && !shipmentResult) {
      try {
        const res = await fetch(`${apiBaseUrl}/header/${orderId}/action/createShipment`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('soOrderConfirmedShipmentError') + (e?.error?.message || e?.response?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        currentShipment = { id: doc?.id ?? null, documentNo: doc?.documentNo ?? '', amount: doc?.grandTotalAmount ?? null };
        setShipmentResult(currentShipment);
        trackDocumentCreated('goods-shipment');
      } catch (e) {
        errors.push(e.message || ui('soErrorOccurred'));
      }
    }

    // Step 3: Create invoice if checked and not already done.
    let currentInvoice = null;
    if (createInvoice && !invoiceResult) {
      try {
        const res = await fetch(`${apiBaseUrl}/header/${orderId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('soOrderConfirmedInvoiceError') + (e?.error?.message || e?.response?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        currentInvoice = { id: doc?.id ?? null, documentNo: doc?.documentNo ?? '', amount: doc?.grandTotalAmount ?? null };
        setInvoiceResult(currentInvoice);
        trackDocumentCreated('sales-invoice');
      } catch (e) {
        errors.push(e.message || ui('soErrorOccurred'));
      }
    }

    // If any step failed, surface all errors and keep the modal open so the
    // user can retry. The successful steps are already locked via state, so
    // the next attempt will skip them.
    if (errors.length > 0) {
      setError(errors.join('\n'));
      setLoading(false);
      return;
    }

    // All requested steps succeeded — close the modal with whatever was created.
    // Use the current attempt's result first; fall back to persisted result from a prior attempt.
    onConfirmed({
      shipment: currentShipment ?? shipmentResult,
      invoice:  currentInvoice  ?? invoiceResult,
    });
  };

  const primaryLabel = (() => {
    if (createShipment && createInvoice) return ui('soConfirmActionBoth');
    if (createShipment)                  return ui('soConfirmActionShipment');
    if (createInvoice)                   return ui('soConfirmActionInvoice');
    return ui('soConfirmActionOnly');
  })();

  // If the user closes the modal AFTER step 1 succeeded (or any document was
  // already created), route the close through `onConfirmed` so the result
  // modal opens with whatever exists and the page reloads on its own close.
  // Otherwise the order is silently in CO state but the UI keeps showing DR,
  // and reopening the modal would re-attempt step 1 → @AlreadyPosted@.
  const handleClose = () => {
    if (orderConfirmed || shipmentResult || invoiceResult) {
      onConfirmed({
        shipment: shipmentResult,
        invoice:  invoiceResult,
      });
      return;
    }
    onClose();
  };

  return (
    <div onClick={handleClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        {/* Title row */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {ui('soConfirmTitle', { number: documentNo })}
          </div>
          <button type="button" onClick={handleClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'hsl(var(--card))', border: '0.5px solid var(--status-info-bg)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: 'var(--status-info-bg)' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {grandTotal > 0 ? formatCurrency(currency, grandTotal) : '0,00'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)', marginBottom: 10 }}>
              {lineCount != null ? (lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount })) : '…'}
              {' '}<span style={{ color: 'var(--status-info-bg)' }}>·</span>{' '}
              {ui('soSubtotal')}{' '}
              <span style={{ fontWeight: 500, color: 'var(--status-info-fg)' }}>
                {formatCurrency(currency, totalLines)}
              </span>
            </div>
            <div style={{ borderRadius: 6, background: 'hsl(var(--card))', border: '1px solid var(--status-warning-bg)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>🔒</span>
              <span style={{ fontSize: 12, color: 'var(--status-warning-fg)', lineHeight: 1.4 }}>
                {ui('soConfirmWarning')}
              </span>
            </div>
          </div>
        </div>

        {/* Checkboxes — both optional, both can be selected simultaneously */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <SoCheckboxCard
            checked={createShipment || Boolean(shipmentResult)}
            onChange={() => !shipmentResult && setCreateShipment(v => !v)}
            icon="🚚"
            title={ui('soCreateShipmentTitle')}
            subtitle={shipmentResult ? ui('soAlreadyCreated') : ui('soCreateShipmentCheckDesc')}
            disabled={Boolean(shipmentResult)}
            data-testid="SoCheckboxCard__18d1f0" />
          <SoCheckboxCard
            checked={createInvoice || Boolean(invoiceResult)}
            onChange={() => !invoiceResult && setCreateInvoice(v => !v)}
            icon="🧾"
            title={ui('soCreateInvoiceTitle')}
            subtitle={invoiceResult ? ui('soAlreadyCreated') : ui('soCreateInvoiceCheckDesc')}
            disabled={Boolean(invoiceResult)}
            data-testid="SoCheckboxCard__18d1f0" />
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid hsl(var(--card))' }}>
          <button type="button" onClick={handleClose} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading}
            style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner data-testid="Spinner__18d1f0" />}
            {loading ? ui('soProcessing') : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SoCheckboxCard ─────────────────────────────────────────────────────────────

function SoCheckboxCard({ checked, onChange, icon, title, subtitle, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: checked ? '11px 13px' : '12px 14px', borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: disabled ? '2px solid var(--status-success-border)' : (checked ? '2px solid var(--status-info-border)' : '1px solid hsl(var(--card))'),
        background: disabled ? 'hsl(var(--card))' : (checked ? 'hsl(var(--card))' : 'hsl(var(--card))'),
        opacity: disabled ? 0.85 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: disabled ? 'var(--status-success-fg)' : (checked ? 'var(--status-info-border)' : 'hsl(var(--foreground))') }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      {/* Checkbox indicator */}
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: (checked || disabled) ? 'none' : '1.5px solid hsl(var(--card))',
        background: disabled ? 'var(--status-success-bg)' : (checked ? 'var(--status-info-bg)' : 'hsl(var(--card))'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        {(checked || disabled) && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" stroke="hsl(var(--card))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 4 7.5 10 1" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ── CreateDocsModal (CO orders — create docs without re-confirming) ───────────

export function CreateDocsModal({ orderId, data, base, headers, currency, derived, onClose, onCreated }) {
  const ui = useUI();
  const {
    needsShip, needsInvoice,
    qtyOrdered, qtyDelivered, qtyPending,
    totalOrder, totalInvoiced, totalPending,
  } = derived;

  const [createShipment, setCreateShipment] = useState(false);
  const [createInvoice,  setCreateInvoice]  = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);

  const d          = data || {};
  const documentNo = d.documentNo || '';
  const bpName     = d['businessPartner$_identifier'] || '';
  const grandTotal = Number(d.grandTotalAmount) || 0;

  // Contextual subtitles: show pending qty/amount so the user knows what's outstanding
  const shipmentSubtitle = qtyOrdered > 0
    ? (qtyDelivered > 0
        ? ui('soQtyDeliveredOf', { delivered: fmtNum(qtyDelivered, 0), total: fmtNum(qtyOrdered, 0), pending: fmtNum(qtyPending, 0) })
        : ui('soQtyPendingDelivery', { pending: fmtNum(qtyPending, 0) }))
    : ui('soCreateShipmentCheckDesc');

  const invoiceSubtitle = totalOrder > 0
    ? (totalInvoiced > 0
        ? ui('soAmountInvoicedOf', { invoiced: formatCurrency(currency, totalInvoiced), total: formatCurrency(currency, totalOrder), pending: formatCurrency(currency, totalPending) })
        : ui('soAmountPendingInvoice', { pending: formatCurrency(currency, totalPending) }))
    : ui('soCreateInvoiceCheckDesc');

  const handleCreate = async () => {
    if (loading || (!createShipment && !createInvoice)) return;
    setLoading(true);
    setError(null);
    try {
      const result = {};

      if (createShipment) {
        const res = await fetch(`${base}/sales-order/header/${orderId}/action/createShipment`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${res.status})`);
        }
        const doc = (await res.json())?.response?.data;
        result.shipment = { id: doc?.id ?? null, documentNo: doc?.documentNo ?? '', amount: doc?.grandTotalAmount ?? null };
        trackDocumentCreated('goods-shipment');
      }

      if (createInvoice) {
        const res = await fetch(`${base}/sales-order/header/${orderId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${res.status})`);
        }
        const doc = (await res.json())?.response?.data;
        result.invoice = { id: doc?.id ?? null, documentNo: doc?.documentNo ?? '', amount: doc?.grandTotalAmount ?? null };
        trackDocumentCreated('sales-invoice');
      }

      window.dispatchEvent(new CustomEvent('sales-order:document-created'));
      onCreated(result);
    } catch (e) {
      setError(e.message || ui('soErrorOccurred'));
      setLoading(false);
    }
  };

  const canCreate = createShipment || createInvoice;

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        {/* Title row */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card — no warning since order is already confirmed */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'hsl(var(--card))', border: '0.5px solid var(--status-info-bg)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: 'var(--status-info-bg)' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4 }}>
              {grandTotal > 0 ? formatCurrency(currency, grandTotal) : '0,00'}
            </div>
          </div>
        </div>

        {/* Only show checkboxes for pending actions; subtitle shows outstanding qty/amount */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          {needsShip && (
            <SoCheckboxCard
              checked={createShipment}
              onChange={() => setCreateShipment(v => !v)}
              icon="🚚"
              title={ui('soCreateShipmentTitle')}
              subtitle={shipmentSubtitle}
              data-testid="SoCheckboxCard__18d1f0" />
          )}
          {needsInvoice && (
            <SoCheckboxCard
              checked={createInvoice}
              onChange={() => setCreateInvoice(v => !v)}
              icon="🧾"
              title={ui('soCreateInvoiceTitle')}
              subtitle={invoiceSubtitle}
              data-testid="SoCheckboxCard__18d1f0" />
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid hsl(var(--card))' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleCreate} disabled={loading || !canCreate}
            style={{ ...btnPrimaryStyle, opacity: (loading || !canCreate) ? 0.6 : 1, cursor: (loading || !canCreate) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner data-testid="Spinner__18d1f0" />}
            {loading ? ui('soProcessing') : ui('soCreateDocsBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CopyIcon ───────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ── CloneModal ─────────────────────────────────────────────────────────────────

function CloneModal({ orderId, data, apiBaseUrl, headers, onClose, onCloned }) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [lines,   setLines]   = useState(null); // null = loading

  const documentNo = data?.documentNo || '';
  const bpName     = data?.['businessPartner$_identifier'] || '';
  const status     = data?.documentStatus;
  const currency   = data?.['currency$_identifier'] || '';
  const total      = Number(data?.grandTotalAmount) || 0;

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled) setLines(json?.response?.data ?? []); })
      .catch(() => { if (!cancelled) setLines([]); });
    return () => { cancelled = true; };
  }, [orderId, apiBaseUrl, headers]);

  const statusMap = {
    DR: { label: ui('orderStatusDraft'),     bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
    CO: { label: ui('orderStatusCompleted'), bg: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
    CL: { label: ui('orderStatusClosed'),    bg: 'hsl(var(--foreground))', color: 'hsl(var(--muted-foreground))' },
    VO: { label: ui('orderStatusVoided'),    bg: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))' },
  };
  const badge = statusMap[status] || { label: status, bg: 'hsl(var(--foreground))', color: 'hsl(var(--muted-foreground))' };

  const lineCount   = lines?.length ?? null;
  const productLine = lineCount === null
    ? '…'
    : `${lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount })}  ·  ${formatCurrency(currency, total)}`;

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${apiBaseUrl}/header/${orderId}/action/cloneRecord`, { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.response?.error?.message || ui('cloneOrderError'));
        return;
      }
      const newId = json?.response?.data?.id;
      onClose();
      onCloned(newId);
    } catch {
      setError(ui('cloneOrderError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, width: 440 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' }}>{ui('cloneOrderConfirmTitle')}</span>
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Summary card */}
          <div style={{ border: '1px solid hsl(var(--card))', borderRadius: 8, overflow: 'hidden' }}>
            {/* Row 1: contact · docNo · badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--card))' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bpName}
              </span>
              {documentNo && (
                <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {documentNo}
                </span>
              )}
              {status && (
                <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
                  background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {badge.label}
                </span>
              )}
            </div>
            {/* Row 2: products + total */}
            <div style={{ padding: '6px 14px 9px', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))' }}>
              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{productLine}</span>
            </div>
          </div>

          {/* Explanatory text — same horizontal inset as card content */}
          <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: 0, padding: '0 2px' }}>{ui('cloneOrderConfirmBody')}</p>

          {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: 12 }}>{error}</div>}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={loading} style={btnSecondary}>
              {ui('cancel')}
            </button>
            <button type="button" onClick={handleClone} disabled={loading}
              style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading && <Spinner data-testid="Spinner__18d1f0" />}
              {loading ? ui('soProcessing') : ui('cloneOrderAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--card))',
};

const btnPrimaryStyle = {
  padding: '5px 14px', borderRadius: 6, border: 'none',
  background: 'var(--status-info-bg)', color: 'hsl(var(--card))', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer',
};

const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 6,
  border: '1px solid var(--color-border, hsl(var(--foreground)))',
  background: 'transparent', color: 'var(--color-muted-foreground, hsl(var(--muted)))',
  cursor: 'pointer',
};

const btnCloneStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '7px', borderRadius: 6,
  border: '1px solid hsl(var(--card))', background: 'hsl(var(--card))', color: 'var(--status-info-bg)', cursor: 'pointer',
  boxShadow: '0px 1px 2px 0px hsl(var(--foreground) / 0.05)',
};

const closeBtn = {
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))',
};

// ── ManageDocsLauncher ──────────────────────────────────────────────────────
// Self-contained mount point for the "Gestionar envío/factura" flow from the
// list-view row kebab. Replicates the fetch+derive logic that OrderCreateInvoice
// runs in the detail page (shipments / invoices / order lines → pending qty &
// amount) and opens CreateDocsModal once derived data is ready. If nothing is
// pending the launcher closes silently.
export function ManageDocsLauncher({ orderId, data, apiBaseUrl, token, onClose, onCreated }) {
  const ui = useUI();
  const [fetched, setFetched] = useState(null);

  const base    = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const [shipRes, linesRes, invRes] = await Promise.all([
          fetch(`${base}/goods-shipment/goodsShipment?criteria=${CRITERIA('salesOrder', orderId)}&_limit=50`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers }),
          fetch(`${apiBaseUrl}/header/${orderId}/action/listInvoices`, { headers }),
        ]);
        if (cancelled) return;
        const shipments  = shipRes.ok  ? ((await shipRes.json())?.response?.data  ?? []) : [];
        const orderLines = linesRes.ok ? ((await linesRes.json())?.response?.data ?? []) : [];
        const invoices   = invRes.ok   ? ((await invRes.json())?.response?.data   ?? []) : [];
        if (!cancelled) setFetched({ shipments, invoices, orderLines });
      } catch {
        if (!cancelled) setFetched({ shipments: [], invoices: [], orderLines: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, base, headers, apiBaseUrl]);

  if (!fetched) {
    // Lightweight overlay so the user gets feedback while the row's docs load.
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, background: 'hsl(var(--foreground) / 0.2)', zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ background: 'hsl(var(--card))', padding: '16px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner data-testid="Spinner__18d1f0" /><span style={{ fontSize: 13 }}>{ui('loading')}</span>
        </div>
      </div>,
      document.body,
    );
  }

  const { shipments, invoices, orderLines } = fetched;
  const shipmentsDraft   = shipments.filter(s => s.documentStatus === 'DR');
  const shipmentsComplete = shipments.filter(s => s.documentStatus === 'CO');
  const invoiceDraft     = invoices.find(i => i.documentStatus === 'DR') ?? null;
  const invoicesComplete = invoices.filter(i => i.documentStatus === 'CO');

  const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
  const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
  const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

  const totalOrder    = Number(data?.grandTotalAmount) || 0;
  const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
  const totalPending  = Math.max(0, totalOrder - totalInvoiced);

  const needsShip    = qtyPending > 0 && shipmentsDraft.length === 0;
  const needsInvoice = totalPending > 0 && !invoiceDraft;
  const nothingToManage = !needsShip && !needsInvoice;

  // Close asynchronously when there's nothing pending — avoids the
  // "Cannot update a component while rendering" warning that occurs when a
  // child triggers parent setState during its own render.
  useEffect(() => {
    if (nothingToManage) onClose?.();
  }, [nothingToManage, onClose]);

  if (nothingToManage) return null;

  const derived = {
    shipmentsComplete, invoicesComplete,
    qtyOrdered, qtyDelivered, qtyPending,
    totalOrder, totalInvoiced, totalPending,
    needsShip, needsInvoice,
  };

  return createPortal(
    <CreateDocsModal
      orderId={orderId}
      data={data}
      base={base}
      headers={headers}
      currency={data?.['currency$_identifier'] || ''}
      derived={derived}
      onClose={onClose}
      onCreated={onCreated}
      data-testid="CreateDocsModal__18d1f0" />,
    document.body,
  );
}
