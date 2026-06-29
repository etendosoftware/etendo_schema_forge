import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { trackTransactionPosted, trackDocumentCreated } from '@/lib/observability/health-events.js';

export { ConfirmResultModal as PoConfirmResultModal };

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

export default function PurchaseOrderActions({ data, recordId, token, apiBaseUrl, onProcess, onRefresh }) {
  const navigate = useNavigate();
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [showSend,      setShowSend]      = useState(false);
  const [showActions,   setShowActions]   = useState(false);
  const [actionsScroll, setActionsScroll] = useState(null); // 'receipt'|'invoice'|null
  const [fetched,       setFetched]       = useState(null);
  const [confirmedDocs,  setConfirmedDocs]  = useState(null);
  const [confirmedTitle, setConfirmedTitle] = useState(null); // null = "PO confirmed", string = custom title
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

  // draftMode confirm button (DetailView) dispatches this event to open the confirm modal
  useEffect(() => {
    const handler = () => setShowConfirm(true);
    window.addEventListener('purchase-order:open-confirm-modal', handler);
    return () => window.removeEventListener('purchase-order:open-confirm-modal', handler);
  }, []);

  // PurchaseOrderDraftChips (topbarExtra) dispatches this event when a grouped chip is clicked
  useEffect(() => {
    const handler = (e) => {
      setActionsScroll(e.detail?.scrollTo ?? null);
      setShowActions(true);
    };
    window.addEventListener('purchase-order:open-actions-modal', handler);
    return () => window.removeEventListener('purchase-order:open-actions-modal', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    (async () => {
      try {
        const [receiptRes, linesRes, invoiceRes] = await Promise.all([
          fetch(`${base}/goods-receipt/goodsReceipt?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`, { headers }),
          fetch(`${base}/purchase-invoice/header?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`, { headers }),
        ]);
        if (cancelled) return;

        const receipts   = receiptRes.ok ? ((await receiptRes.json())?.response?.data ?? []) : [];
        const orderLines = linesRes.ok   ? ((await linesRes.json())?.response?.data  ?? []) : [];
        const invoices   = invoiceRes.ok ? ((await invoiceRes.json())?.response?.data ?? []) : [];

        if (!cancelled) setFetched({ receipts, invoices, orderLines });
      } catch {
        if (!cancelled) setFetched({ receipts: [], invoices: [], orderLines: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [isCompleted, recordId, base, headers, apiBaseUrl]);

  const confirmedPanel = confirmedDocs
    ? createPortal(
        <ConfirmResultModal
          title={confirmedTitle || ui('poConfirmedTitle')}
          docs={[
            confirmedDocs?.receipt?.id && { type: 'entrada', num: confirmedDocs.receipt.documentNo, amount: confirmedDocs.receipt.amount, route: `/goods-receipt/${confirmedDocs.receipt.id}` },
            confirmedDocs?.invoice?.id && { type: 'facturaCompra', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, route: `/purchase-invoice/${confirmedDocs.invoice.id}` },
          ].filter(Boolean)}
          currency={data?.['currency$_identifier'] || ''}
          navigate={navigate}
          onClose={() => { setConfirmedDocs(null); setConfirmedTitle(null); onRefresh?.(); }}
        />,
        document.body,
      )
    : null;

  const cloneButton = (
    <button type="button" onClick={() => setShowClone(true)} style={{...btnCloneStyle, background: isCloneHovered ? '#F1F5F9' : '#FFFFFF'}} title={ui('cloneOrderBtn')} onMouseEnter={() => setIsCloneHovered(true)} onMouseLeave={() => setIsCloneHovered(false)}>
      <CopyIcon />
    </button>
  );

  const clonePortal = showClone ? createPortal(
    <CloneModal
      orderId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      headers={headers}
      onClose={() => setShowClone(false)}
      onCloned={(newId) => navigate(`/purchase-order/${newId}`)}
    />,
    document.body,
  ) : null;

  // ── COMPLETED (loading) ────────────────────────────────────────────────────
  if (isCompleted && !fetched) {
    return <>{confirmedPanel}<span style={{ fontSize: 12, color: '#9CA3AF', padding: '4px 8px' }}>…</span></>;
  }

  // ── COMPLETED — compute derived values ─────────────────────────────────────
  let buttonLabel = null;
  let derived = null;
  let currency = '';
  if (isCompleted) {
    const { receipts, invoices, orderLines } = fetched;

    const receiptsDraft    = receipts.filter(r => r.documentStatus === 'DR');
    const receiptsComplete = receipts.filter(r => r.documentStatus === 'CO');
    const invoiceDraft     = invoices.find(i => i.documentStatus === 'DR') ?? null;
    const invoicesComplete = invoices.filter(i => i.documentStatus === 'CO');

    const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
    const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
    const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

    const totalOrder    = Number(data?.grandTotalAmount) || 0;
    const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
    const totalPending  = Math.max(0, totalOrder - totalInvoiced);

    currency = data?.['currency$_identifier'] || '';

    const needsReceipt = qtyPending > 0 && receiptsDraft.length === 0;
    const needsInvoice = totalPending > 0 && !invoiceDraft;

    if      (needsReceipt && needsInvoice) buttonLabel = ui('poManageReceiptAndInvoice');
    else if (needsReceipt)                 buttonLabel = ui('poManageReceipt');
    else if (needsInvoice)                 buttonLabel = ui('poManageInvoice');

    derived = {
      receiptsComplete, invoicesComplete,
      qtyOrdered, qtyDelivered, qtyPending,
      totalOrder, totalInvoiced, totalPending,
      needsReceipt, needsInvoice,
    };
  }

  return (
    <>
      {isCompleted && buttonLabel && (
        <button type="button" onClick={() => setShowActions(true)} style={btnPrimaryStyle}>
          {buttonLabel}
        </button>
      )}
      {cloneButton}
      {(isDraft || isCompleted) && <SendDocumentButton onClick={() => setShowSend(true)} />}
      {clonePortal}
      {isDraft && showConfirm && createPortal(
        <ConfirmModal
          orderId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          onClose={() => setShowConfirm(false)}
          onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
        />,
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
        />,
        document.body,
      )}
      {(isDraft || isCompleted) && showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Purchase Order')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="purchase-order"
          token={token}
          onClose={() => setShowSend(false)}
        />,
        document.body,
      )}
      {confirmedPanel}
    </>
  );
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

export function ConfirmModal({ orderId, data, apiBaseUrl, headers, onClose, onConfirmed }) {
  const ui      = useUI();
  const [createReceipt,  setCreateReceipt]  = useState(false);
  const [createInvoice,  setCreateInvoice]  = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [freshData,      setFreshData]      = useState(null);
  const [lineCount,      setLineCount]      = useState(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [receiptResult,  setReceiptResult]  = useState(null);
  const [invoiceResult,  setInvoiceResult]  = useState(null);

  const orderUrl = `${apiBaseUrl}/header`;

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          fetch(`${orderUrl}/${orderId}`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers }),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const json = await recRes.json();
          const rec = json?.response?.data?.[0] ?? json;
          if (!cancelled) setFreshData(rec);
        }
        if (linesRes.ok) {
          const json = await linesRes.json();
          if (!cancelled) setLineCount(json?.response?.data?.length ?? 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orderId, orderUrl, apiBaseUrl, headers]);

  const d              = freshData || data || {};
  const documentNo     = d.documentNo || '';
  const bpName         = d['businessPartner$_identifier'] || '';
  // Apply etgoTotalDiscount client-side only while the order is still in DR — at
  // that point TotalDiscountService has not yet materialized the ETGO_DTO line, so
  // the server totals are pre-discount and we show the user what the totals WILL be
  // once the order is completed. After CO the totals already reflect the discount.
  const discountPct    = Number(d.etgoTotalDiscount ?? 0);
  const isPreCompletion = d.documentStatus === 'DR';
  const discountFactor = (isPreCompletion && discountPct > 0) ? (1 - discountPct / 100) : 1;
  // Same accounting rule as DocumentTotalsPanel: the displayed total must equal
  // round(net × factor) + round(tax × factor), not round(gross × factor).
  // Avoids the 1-cent double-rounding drift versus the order's right panel and
  // the printed invoice (AEAT/Modelo 303 rule "base + IVA = total").
  const round2        = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const grossBase     = Number(d.grandTotalAmount ?? d.grandTotal ?? 0) || 0;
  const netBase       = Number(d.summedLineAmount ?? d.totalLines ?? grossBase) || 0;
  const totalLines    = round2(netBase * discountFactor);
  const grandTotal    = totalLines + round2((grossBase - netBase) * discountFactor);
  const currency       = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    // Step 1: Confirm the order — must succeed before anything else.
    // If this fails the order is still in DR, so the rest of the flow makes no sense.
    if (!orderConfirmed) {
      try {
        const processRes = await fetch(
          `${orderUrl}/${orderId}/action/documentAction`,
          { method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }) },
        );
        if (!processRes.ok) {
          const e = await processRes.json().catch(() => null);
          const rawMsg = e?.response?.message || e?.message || `Error (${processRes.status})`;
          throw new Error(rawMsg.includes('@OrderWithoutLines@') ? ui('soNoLinesError') : rawMsg);
        }
        setOrderConfirmed(true);
        trackTransactionPosted();
        window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
      } catch (e) {
        setError(e.message || ui('poErrorOccurred'));
        setLoading(false);
        return;
      }
    }

    // Steps 2 and 3 are independent: the invoice uses order quantities, not
    // receipt quantities. A failure in one must NOT prevent the other from
    // running. Errors are accumulated and shown together at the end.
    const errors = [];

    // Step 2: Create goods receipt if checked and not already done
    let currentReceipt = null;
    if (createReceipt && !receiptResult) {
      try {
        const res = await fetch(`${orderUrl}/${orderId}/action/createGoodsReceipt`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('poOrderConfirmedReceiptError') + ' ' + (e?.error?.message || e?.response?.message || e?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        currentReceipt = {
          id:         docObj?.id ?? null,
          documentNo: docObj?.documentNo ?? '',
          amount:     docObj?.grandTotalAmount ?? null,
        };
        setReceiptResult(currentReceipt);
        trackDocumentCreated('goods-receipt');
      } catch (e) {
        errors.push(e.message || ui('poErrorOccurred'));
      }
    }

    // Step 3: Create purchase invoice if checked and not already done
    let currentInvoice = null;
    if (createInvoice && !invoiceResult) {
      try {
        const res = await fetch(`${orderUrl}/${orderId}/action/createPurchaseInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('poOrderConfirmedInvoiceError') + ' ' + (e?.error?.message || e?.response?.message || e?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        currentInvoice = {
          id:         docObj?.id ?? null,
          documentNo: docObj?.documentNo ?? '',
          amount:     docObj?.grandTotalAmount ?? null,
        };
        setInvoiceResult(currentInvoice);
        trackDocumentCreated('purchase-invoice');
      } catch (e) {
        errors.push(e.message || ui('poErrorOccurred'));
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
    const result = {};
    const finalReceipt = currentReceipt ?? receiptResult;
    const finalInvoice = currentInvoice ?? invoiceResult;
    if (finalReceipt) result.receipt = finalReceipt;
    if (finalInvoice) result.invoice = finalInvoice;
    onConfirmed(result);
  };

  const primaryLabel = (() => {
    if (createReceipt && createInvoice) return ui('poConfirmActionBoth');
    if (createReceipt)                  return ui('poConfirmActionReceipt');
    if (createInvoice)                  return ui('poConfirmActionInvoice');
    return ui('soConfirmActionOnly');
  })();

  // If the user closes the modal AFTER step 1 succeeded (or any document was
  // already created), route the close through `onConfirmed` so the result
  // modal opens with whatever exists and the page reloads on its own close.
  // Otherwise the order is silently in CO state but the UI keeps showing DR,
  // and reopening the modal would re-attempt step 1 → @AlreadyPosted@.
  const handleClose = () => {
    if (orderConfirmed || receiptResult || invoiceResult) {
      const result = {};
      if (receiptResult) result.receipt = receiptResult;
      if (invoiceResult) result.invoice = invoiceResult;
      onConfirmed(result);
      return;
    }
    onClose();
  };

  return (
    <div onClick={handleClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        {/* Title row */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
            {ui('poConfirmTitle', { number: documentNo })}
          </div>
          <button type="button" onClick={handleClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: '#185FA5' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {grandTotal > 0 ? `${fmtNum(grandTotal)}${currency ? ` ${currency}` : ''}` : '0,00'}
            </div>
            <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 10 }}>
              {lineCount != null ? (lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount })) : '…'}
              {' '}<span style={{ color: '#85B7EB' }}>·</span>{' '}
              {ui('soSubtotal')}{' '}
              <span style={{ fontWeight: 500, color: '#042C53' }}>
                {fmtNum(totalLines)}{currency ? ` ${currency}` : ''}
              </span>
            </div>
            <div style={{ borderRadius: 6, background: '#FFFBEB', border: '1px solid #FDE68A', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>🔒</span>
              <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>
                {ui('poConfirmWarning')}
              </span>
            </div>
          </div>
        </div>

        {/* Checkboxes — both optional, both can be selected simultaneously */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <PoCheckboxCard
            checked={createReceipt || Boolean(receiptResult)}
            onChange={() => !receiptResult && setCreateReceipt(v => !v)}
            icon="📦"
            title={ui('poCreateReceiptTitle')}
            subtitle={receiptResult ? ui('soAlreadyCreated') : ui('poCreateReceiptCheckDesc')}
            disabled={Boolean(receiptResult)}
          />
          <PoCheckboxCard
            checked={createInvoice || Boolean(invoiceResult)}
            onChange={() => !invoiceResult && setCreateInvoice(v => !v)}
            icon="🧾"
            title={ui('soCreateInvoiceTitle')}
            subtitle={invoiceResult ? ui('soAlreadyCreated') : ui('poCreateInvoiceCheckDesc')}
            disabled={Boolean(invoiceResult)}
          />
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid #E5E7EB' }}>
          <button type="button" onClick={handleClose} disabled={loading}
            style={{ ...btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading}
            data-testid="action-confirm-modal"
            style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner />}
            {loading ? ui('poProcessing') : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PoCheckboxCard ─────────────────────────────────────────────────────────────

function PoCheckboxCard({ checked, onChange, icon, title, subtitle, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: checked ? '11px 13px' : '12px 14px', borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: disabled ? '2px solid #10B981' : (checked ? '2px solid #3B82F6' : '1px solid #E5E7EB'),
        background: disabled ? '#ECFDF5' : (checked ? '#EFF6FF' : '#fff'),
        opacity: disabled ? 0.85 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: disabled ? '#059669' : (checked ? '#2563EB' : '#111827') }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: (checked || disabled) ? 'none' : '1.5px solid #D1D5DB',
        background: disabled ? '#10B981' : (checked ? '#3B82F6' : '#fff'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        {(checked || disabled) && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 4 7.5 10 1" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ── CreateDocsModal (CO orders — create docs without re-confirming) ────────────

export function CreateDocsModal({ orderId, data, base, headers, currency, derived, onClose, onCreated }) {
  const ui = useUI();
  const {
    needsReceipt, needsInvoice,
    qtyOrdered, qtyDelivered, qtyPending,
    totalOrder, totalInvoiced, totalPending,
  } = derived;

  const [createReceipt, setCreateReceipt] = useState(false);
  const [createInvoice, setCreateInvoice] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  const d          = data || {};
  const documentNo = d.documentNo || '';
  const bpName     = d['businessPartner$_identifier'] || '';
  const grandTotal = Number(d.grandTotalAmount) || 0;

  // Contextual subtitles: show pending qty/amount so the user knows what's outstanding
  const receiptSubtitle = qtyOrdered > 0
    ? (qtyDelivered > 0
        ? ui('poQtyReceivedOf', { received: fmtNum(qtyDelivered, 0), total: fmtNum(qtyOrdered, 0), pending: fmtNum(qtyPending, 0) })
        : `${fmtNum(qtyPending, 0)} ${ui('poPendingReceipt')}`)
    : ui('poCreateReceiptCheckDesc');

  const invoiceSubtitle = totalOrder > 0
    ? (totalInvoiced > 0
        ? ui('poAmountInvoicedOf', { invoiced: `${fmtNum(totalInvoiced)}${currency ? ` ${currency}` : ''}`, pending: `${fmtNum(totalPending)}${currency ? ` ${currency}` : ''}` })
        : `${fmtNum(totalPending)}${currency ? ` ${currency}` : ''} ${ui('poPendingInvoice')}`)
    : ui('poCreateInvoiceCheckDesc');

  const handleCreate = async () => {
    if (loading || (!createReceipt && !createInvoice)) return;
    setLoading(true);
    setError(null);
    try {
      const result = {};

      if (createReceipt) {
        const res = await fetch(`${base}/purchase-order/header/${orderId}/action/createGoodsReceipt`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${res.status})`);
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        result.receipt = { id: docObj?.id ?? null, documentNo: docObj?.documentNo ?? '', amount: docObj?.grandTotalAmount ?? null };
        trackDocumentCreated('goods-receipt');
      }

      if (createInvoice) {
        const res = await fetch(`${base}/purchase-order/header/${orderId}/action/createPurchaseInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${res.status})`);
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        result.invoice = { id: docObj?.id ?? null, documentNo: docObj?.documentNo ?? '', amount: docObj?.grandTotalAmount ?? null };
        trackDocumentCreated('purchase-invoice');
      }

      window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
      onCreated(result);
    } catch (e) {
      setError(e.message || ui('poErrorOccurred'));
      setLoading(false);
    }
  };

  const canCreate = createReceipt || createInvoice;

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        {/* Title row */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card — no warning since order is already confirmed */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: '#185FA5' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4 }}>
              {grandTotal > 0 ? `${fmtNum(grandTotal)}${currency ? ` ${currency}` : ''}` : '0,00'}
            </div>
          </div>
        </div>

        {/* Only show checkboxes for pending actions; subtitle shows outstanding qty/amount */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          {needsReceipt && (
            <PoCheckboxCard
              checked={createReceipt}
              onChange={() => setCreateReceipt(v => !v)}
              icon="📦"
              title={ui('poCreateReceiptTitle')}
              subtitle={receiptSubtitle}
            />
          )}
          {needsInvoice && (
            <PoCheckboxCard
              checked={createInvoice}
              onChange={() => setCreateInvoice(v => !v)}
              icon="🧾"
              title={ui('soCreateInvoiceTitle')}
              subtitle={invoiceSubtitle}
            />
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid #E5E7EB' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleCreate} disabled={loading || !canCreate}
            style={{ ...btnPrimaryStyle, opacity: (loading || !canCreate) ? 0.6 : 1, cursor: (loading || !canCreate) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner />}
            {loading ? ui('poProcessing') : ui('soCreateDocsBtn')}
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
    DR: { label: ui('orderStatusDraft'),     bg: '#FEF3C7', color: '#D97706' },
    CO: { label: ui('orderStatusCompleted'), bg: '#DCFCE7', color: '#16A34A' },
    CL: { label: ui('orderStatusClosed'),    bg: '#F3F4F6', color: '#6B7280' },
    VO: { label: ui('orderStatusVoided'),    bg: '#FEE2E2', color: '#DC2626' },
  };
  const badge = statusMap[status] || { label: status, bg: '#F3F4F6', color: '#6B7280' };

  const lineCount   = lines?.length ?? null;
  const productLine = lineCount === null
    ? '…'
    : `${lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount })}  ·  ${currency} ${fmtNum(total)}`;

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
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{ui('cloneOrderConfirmTitle')}</span>
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Summary card */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
            {/* Row 1: contact · docNo · badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F9FAFB' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bpName}
              </span>
              {documentNo && (
                <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
            <div style={{ padding: '6px 14px 9px', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{productLine}</span>
            </div>
          </div>

          {/* Explanatory text — same horizontal inset as card content */}
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0, padding: '0 2px' }}>{ui('cloneOrderConfirmBody')}</p>

          {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={loading} style={btnSecondary}>
              {ui('cancel')}
            </button>
            <button type="button" onClick={handleClone} disabled={loading}
              style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading && <Spinner />}
              {loading ? ui('poProcessing') : ui('cloneOrderAction')}
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
  backgroundColor: 'rgba(0,0,0,0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB',
};

const btnPrimaryStyle = {
  padding: '5px 14px', borderRadius: 6, border: 'none',
  background: '#185FA5', color: '#fff', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer',
};

const btnCloneStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '7px', borderRadius: 6,
  border: '1px solid #D1D4DB', background: '#FFFFFF', color: '#64748B', cursor: 'pointer',
  boxShadow: '0px 1px 2px 0px #1212170D',
};

const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 6,
  border: '1px solid var(--color-border, #e5e7eb)',
  background: 'transparent', color: 'var(--color-muted-foreground, #6b7280)',
  cursor: 'pointer',
};

const closeBtn = {
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
};

// ── ManageDocsLauncher ──────────────────────────────────────────────────────
// Self-contained mount point for the "Gestionar recepción/factura" flow from
// the list-view row kebab. Mirrors the fetch+derive logic in
// PurchaseOrderActions (receipts / invoices / order lines → pending qty &
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
        const [receiptRes, linesRes, invoiceRes] = await Promise.all([
          fetch(`${base}/goods-receipt/goodsReceipt?criteria=${CRITERIA('salesOrder', orderId)}&_limit=50`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers }),
          fetch(`${base}/purchase-invoice/header?criteria=${CRITERIA('salesOrder', orderId)}&_limit=50`, { headers }),
        ]);
        if (cancelled) return;
        const receipts   = receiptRes.ok ? ((await receiptRes.json())?.response?.data ?? []) : [];
        const orderLines = linesRes.ok   ? ((await linesRes.json())?.response?.data  ?? []) : [];
        const invoices   = invoiceRes.ok ? ((await invoiceRes.json())?.response?.data ?? []) : [];
        if (!cancelled) setFetched({ receipts, invoices, orderLines });
      } catch {
        if (!cancelled) setFetched({ receipts: [], invoices: [], orderLines: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, base, headers, apiBaseUrl]);

  if (!fetched) {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ background: '#fff', padding: '16px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner /><span style={{ fontSize: 13 }}>{ui('loading')}</span>
        </div>
      </div>,
      document.body,
    );
  }

  const { receipts, invoices, orderLines } = fetched;
  const receiptsDraft    = receipts.filter(r => r.documentStatus === 'DR');
  const receiptsComplete = receipts.filter(r => r.documentStatus === 'CO');
  const invoiceDraft     = invoices.find(i => i.documentStatus === 'DR') ?? null;
  const invoicesComplete = invoices.filter(i => i.documentStatus === 'CO');

  const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
  const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
  const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

  const totalOrder    = Number(data?.grandTotalAmount) || 0;
  const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
  const totalPending  = Math.max(0, totalOrder - totalInvoiced);

  const needsReceipt = qtyPending > 0 && receiptsDraft.length === 0;
  const needsInvoice = totalPending > 0 && !invoiceDraft;
  const nothingToManage = !needsReceipt && !needsInvoice;

  // Close asynchronously when there's nothing pending — avoids the
  // "Cannot update a component while rendering" warning that occurs when a
  // child triggers parent setState during its own render.
  useEffect(() => {
    if (nothingToManage) onClose?.();
  }, [nothingToManage, onClose]);

  if (nothingToManage) return null;

  const derived = {
    receiptsComplete, invoicesComplete,
    qtyOrdered, qtyDelivered, qtyPending,
    totalOrder, totalInvoiced, totalPending,
    needsReceipt, needsInvoice,
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
    />,
    document.body,
  );
}
