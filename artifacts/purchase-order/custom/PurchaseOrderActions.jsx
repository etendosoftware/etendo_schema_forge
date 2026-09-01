import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { incrementSurveyCounter } from '@/lib/surveys/survey-state.js';
import { emitSurveyTrigger } from '@/lib/surveys/survey-engine.js';
import { usePurchaseOrderPdf } from '@/windows/custom/shared/usePurchaseOrderPdf.js';
import { trackTransactionPosted, trackDocumentCreated } from '@/lib/observability/health-events.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

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

export default function PurchaseOrderActions({ data, recordId, token, apiBaseUrl, onProcess, onRefresh, onSave }) {
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

  // ETP-4372 — source the same client-rendered PDF the OrderPreview panel uses
  // so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally (rules of hooks).
  const { pdfUrl, loading: pdfLoading } = usePurchaseOrderPdf(recordId, apiBaseUrl, token);

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
          onClose={() => { setConfirmedDocs(null); setConfirmedTitle(null); emitSurveyTrigger(); onRefresh?.(); }}
          data-testid="ConfirmResultModal__8b5323" />,
        document.body,
      )
    : null;

  const cloneButton = (
    <button type="button" onClick={() => setShowClone(true)} style={{...btnCloneStyle, background: isCloneHovered ? 'hsl(var(--card))' : 'hsl(var(--card))'}} title={ui('cloneOrderBtn')} onMouseEnter={() => setIsCloneHovered(true)} onMouseLeave={() => setIsCloneHovered(false)}>
      <CopyIcon data-testid="CopyIcon__8b5323" />
    </button>
  );

  const clonePortal = showClone ? createPortal(
    <CloneOrderModal
      recordId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      headers={headers}
      onClose={() => setShowClone(false)}
      onCloned={(newId) => {
        setShowClone(false);
        navigate(`/purchase-order/${newId}`);
      }}
      data-testid="CloneOrderModal__8b5323" />,
    document.body,
  ) : null;

  // ── COMPLETED (loading) ────────────────────────────────────────────────────
  if (isCompleted && !fetched) {
    return <>{confirmedPanel}<CopyRecordLinkButton recordId={recordId} windowName="purchase-order" /><span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 8px' }}>…</span></>;
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
    const qtyPending   = qtyOrdered - qtyDelivered;

    const totalOrder    = Number(data?.grandTotalAmount) || 0;
    const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
    const totalPending  = totalOrder - totalInvoiced;

    currency = data?.['currency$_identifier'] || '';

    const needsReceipt = qtyPending !== 0 && receiptsDraft.length === 0;
    const needsInvoice = totalPending !== 0 && !invoiceDraft;

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
      {/* ETP-4717 — Send is only available once the order is Confirmed (CO),
          matching the grid row quick-action's status gate. */}
      {isCompleted && <SendDocumentButton
        onClick={() => setShowSend(true)}
        data-testid="SendDocumentButton__8b5323" />}
      <CopyRecordLinkButton recordId={recordId} windowName="purchase-order" />
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
          data-testid="ConfirmModal__8b5323" />,
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
          data-testid="CreateDocsModal__8b5323" />,
        document.body,
      )}
      {isCompleted && showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Purchase Order')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="purchase-order"
          token={token}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={pdfLoading}
          onClose={() => setShowSend(false)}
          data-testid="SendDocumentModal__8b5323" />,
        document.body,
      )}
      {confirmedPanel}
    </>
  );
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

export function ConfirmModal({ orderId, data, apiBaseUrl, headers, onClose, onConfirmed, onSave }) {
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

    // ETP-4468 — force-save any unsaved header edit before confirming. Without
    // this, an edit made right before clicking Confirm (without hitting Save
    // first) would be silently discarded — the order gets confirmed with the
    // OLD header values. Abort the whole confirm flow if the save fails.
    //
    // ETP-4940 — the same guard now also runs centrally in DetailView's Confirm
    // button (maybeSaveBeforeConfirm, detailViewHelpers.jsx) BEFORE the
    // `draftMode.onConfirm` event that opens this modal even fires, so in the
    // normal flow this call is a no-op (isDirtyHeader is already false) and this
    // branch is effectively unreachable (a failed central save aborts before the
    // modal opens at all). Kept as defense-in-depth for this modal's own submit
    // action, and because PurchaseOrderActions.test.js pins this exact
    // poSaveBeforeConfirmError behavior — removing it would require updating
    // that test too, for no behavioral gain.
    if (onSave) {
      const saved = await onSave();
      if (!saved?.id) {
        setError(ui('poSaveBeforeConfirmError'));
        setLoading(false);
        return;
      }
    }

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
        incrementSurveyCounter('order');
        trackTransactionPosted();
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
    // ETP-4779 — dispatch AFTER the receipt/invoice POSTs above have actually
    // resolved (not right after Step 1's docAction=CO, as before). Dispatching
    // immediately after Step 1 fired the event before createGoodsReceipt /
    // createPurchaseInvoice even ran, so RelatedDocuments.jsx's refetch raced
    // ahead of document creation, found nothing, and — since no later event
    // fired to catch up — the "Documentos" panel stayed empty until some
    // unrelated action (e.g. a later "Gestionar factura" call) happened to
    // dispatch the event again. Only fire when a document actually exists to
    // show, mirroring CreateDocsModal.handleCreate below.
    if (finalReceipt || finalInvoice) {
      window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
    }
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
      // ETP-4779 — covers the partial-failure path: e.g. the receipt POST
      // succeeded (receiptResult set) but the invoice POST then failed, and
      // the user closes instead of retrying. handleConfirm's own dispatch
      // (above) never runs in that case since it errors out first, so the
      // successfully-created receipt would otherwise never notify
      // RelatedDocuments.jsx.
      if (receiptResult || invoiceResult) {
        window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
      }
      onConfirmed(result);
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
            {ui('poConfirmTitle', { number: documentNo })}
          </div>
          <button type="button" onClick={handleClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {formatCurrency(currency, grandTotal)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)', marginBottom: 10 }}>
              {lineCount != null ? (lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount })) : '…'}
              {' '}<span style={{ color: 'var(--status-info-fg)' }}>·</span>{' '}
              {ui('soSubtotal')}{' '}
              <span style={{ fontWeight: 500, color: 'var(--status-info-fg)' }}>
                {formatCurrency(currency, totalLines)}
              </span>
            </div>
            <div style={{ borderRadius: 6, background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>🔒</span>
              <span style={{ fontSize: 12, color: 'var(--status-warning-fg)', lineHeight: 1.4 }}>
                {ui('poConfirmWarning')}
              </span>
            </div>
          </div>
        </div>

        {/* Checkboxes — both optional, both can be selected simultaneously */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <PoCheckboxCard
            checked={createReceipt || Boolean(receiptResult)}
            onChange={() => !receiptResult && setCreateReceipt(v => !v)}
            icon="📦"
            title={ui('poCreateReceiptTitle')}
            subtitle={receiptResult ? ui('soAlreadyCreated') : ui('poCreateReceiptCheckDesc')}
            disabled={Boolean(receiptResult)}
            data-testid="PoCheckboxCard__8b5323" />
          <PoCheckboxCard
            checked={createInvoice || Boolean(invoiceResult)}
            onChange={() => !invoiceResult && setCreateInvoice(v => !v)}
            icon="🧾"
            title={ui('soCreateInvoiceTitle')}
            subtitle={invoiceResult ? ui('soAlreadyCreated') : ui('poCreateInvoiceCheckDesc')}
            disabled={Boolean(invoiceResult)}
            data-testid="PoCheckboxCard__8b5323" />
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid hsl(var(--card))' }}>
          <button type="button" onClick={handleClose} disabled={loading}
            style={{ ...btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading}
            data-testid="action-confirm-modal"
            style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner data-testid="Spinner__8b5323" />}
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
        border: disabled ? '2px solid var(--status-success-border)' : (checked ? '2px solid var(--status-info-border)' : '1px solid hsl(var(--border-subtle))'),
        background: disabled ? 'var(--status-success-bg)' : (checked ? 'var(--status-info-bg)' : 'hsl(var(--card))'),
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
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: (checked || disabled) ? 'none' : '1.5px solid hsl(var(--border-subtle))',
        background: disabled ? 'var(--status-success-fg)' : (checked ? 'var(--status-info-fg)' : 'hsl(var(--card))'),
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
  const receiptSubtitle = qtyOrdered !== 0
    ? (qtyDelivered > 0
        ? ui('poQtyReceivedOf', { received: fmtNum(qtyDelivered, 0), total: fmtNum(qtyOrdered, 0), pending: fmtNum(qtyPending, 0) })
        : `${fmtNum(qtyPending, 0)} ${ui('poPendingReceipt')}`)
    : ui('poCreateReceiptCheckDesc');

  const invoiceSubtitle = totalOrder !== 0
    ? (totalInvoiced > 0
        ? ui('poAmountInvoicedOf', { invoiced: formatCurrency(currency, totalInvoiced), pending: formatCurrency(currency, totalPending) })
        : `${formatCurrency(currency, totalPending)} ${ui('poPendingInvoice')}`)
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
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>&times;</button>
        </div>

        {/* Blue summary card — no warning since order is already confirmed */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && (
              <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4 }}>
              {formatCurrency(currency, grandTotal)}
            </div>
          </div>
        </div>

        {/* Only show checkboxes for pending actions; subtitle shows outstanding qty/amount */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          {needsReceipt && (
            <PoCheckboxCard
              checked={createReceipt}
              onChange={() => setCreateReceipt(v => !v)}
              icon="📦"
              title={ui('poCreateReceiptTitle')}
              subtitle={receiptSubtitle}
              data-testid="PoCheckboxCard__8b5323" />
          )}
          {needsInvoice && (
            <PoCheckboxCard
              checked={createInvoice}
              onChange={() => setCreateInvoice(v => !v)}
              icon="🧾"
              title={ui('soCreateInvoiceTitle')}
              subtitle={invoiceSubtitle}
              data-testid="PoCheckboxCard__8b5323" />
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
            {loading && <Spinner data-testid="Spinner__8b5323" />}
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

// ── Shared styles ──────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border-subtle))',
};

const btnPrimaryStyle = {
  padding: '5px 14px', borderRadius: 6, border: 'none',
  background: 'var(--status-info-fg)', color: 'hsl(var(--card))', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid hsl(var(--border-subtle))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
};

const btnCloneStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '7px', borderRadius: 6,
  border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
  boxShadow: '0px 1px 2px 0px hsl(var(--foreground) / 0.05)',
};

const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 6,
  border: '1px solid var(--color-border, hsl(var(--foreground)))',
  background: 'transparent', color: 'var(--color-muted-foreground, hsl(var(--muted)))',
  cursor: 'pointer',
};

const closeBtn = {
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))',
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
        position: 'fixed', inset: 0, background: 'hsl(var(--foreground) / 0.2)', zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ background: 'hsl(var(--card))', padding: '16px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner data-testid="Spinner__8b5323" /><span style={{ fontSize: 13 }}>{ui('loading')}</span>
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
  const qtyPending   = qtyOrdered - qtyDelivered;

  const totalOrder    = Number(data?.grandTotalAmount) || 0;
  const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
  const totalPending  = totalOrder - totalInvoiced;

  const needsReceipt = qtyPending !== 0 && receiptsDraft.length === 0;
  const needsInvoice = totalPending !== 0 && !invoiceDraft;
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
      data-testid="CreateDocsModal__8b5323" />,
    document.body,
  );
}
