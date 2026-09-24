import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { incrementSurveyCounter } from '@/lib/surveys/survey-state.js';
import { emitSurveyTrigger } from '@/lib/surveys/survey-engine.js';
import { usePurchaseOrderPdf } from '@/windows/custom/shared/usePurchaseOrderPdf.js';
import { readOrderPendingDocs } from '@/windows/custom/shared/orderPendingDocs.js';
import { trackTransactionPosted, trackDocumentCreated } from '@/lib/observability/health-events.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { translateBackendError } from '@/lib/backendErrors.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [confirmedDocs,  setConfirmedDocs]  = useState(null);
  const [confirmedTitle, setConfirmedTitle] = useState(null); // null = "PO confirmed", string = custom title

  const status      = data?.documentStatus;
  const isDraft     = status === 'DR';
  const isCompleted = status === 'CO';

  const base    = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  // ETP-4372 — source the same client-rendered PDF the OrderPreview panel uses
  // so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally (rules of hooks).
  const { pdfUrl, loading: pdfLoading } = usePurchaseOrderPdf(recordId, apiBaseUrl, token);

  // draftMode confirm button (DetailView) dispatches this event to open the confirm modal
  useEffect(() => {
    // ETP-5255 — `isDraft` gates OPENING the modal, never keeping it mounted. Confirming the
    // order flips the record to CO, and the modal has to outlive that: it is where the result of
    // the receipt/invoice steps is reported.
    const handler = () => { if (isDraft) setShowConfirm(true); };
    window.addEventListener('purchase-order:open-confirm-modal', handler);
    return () => window.removeEventListener('purchase-order:open-confirm-modal', handler);
    // `isDraft` is read inside the handler, so an empty dep array would pin the value this effect
    // first saw and the modal would stop opening after any status change.
  }, [isDraft]);

  // PurchaseOrderDraftChips (topbarExtra) dispatches this event when a grouped chip is clicked
  useEffect(() => {
    const handler = (e) => {
      setActionsScroll(e.detail?.scrollTo ?? null);
      setShowActions(true);
    };
    window.addEventListener('purchase-order:open-actions-modal', handler);
    return () => window.removeEventListener('purchase-order:open-actions-modal', handler);
  }, []);

  // ETP-5315 — the confirm/create-docs flows below dispatch this same event on success
  // (ConfirmModal.handleConfirm, ConfirmModal.handleClose, CreateDocsModal.handleCreate), but
  // this component never listened for it itself. `fetched` (receipts/invoices/orderLines) was
  // therefore only ever loaded once on mount, so `buttonLabel` kept showing "Gestionar
  // recepción y factura" after the user had just created the receipt/invoice through it —
  // letting them reopen the modal and create duplicates. Mirrors the `refreshKey` pattern
  // already used by the sibling topbarExtra component (PurchaseOrderDraftChips.jsx) for the
  // same event: bump a counter and include it in the fetch effect's deps below to force a
  // refetch without touching that effect's cancellation/early-return guards.
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener('purchase-order:document-created', handler);
    return () => window.removeEventListener('purchase-order:document-created', handler);
  }, []);

  // ETP-5260 — the Send button now lives in the topbarSecondary slot
  // (PurchaseOrderSecondaryActions), while this modal (with its pdf/documentType
  // context) stays here in topbarRight; the button dispatches this event to open it.
  useEffect(() => {
    const handler = () => setShowSend(true);
    window.addEventListener('purchase-order:open-send-modal', handler);
    return () => window.removeEventListener('purchase-order:open-send-modal', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    (async () => {
      try {
        const [receiptRes, linesRes, invoiceRes] = await Promise.all([
          apiFetch(`${base}/goods-receipt/goodsReceipt?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`),
          apiFetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`),
          apiFetch(`${base}/purchase-invoice/header?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`),
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
  }, [isCompleted, recordId, base, apiFetch, apiBaseUrl, refreshKey]);

  // ETP-5063 — a confirm that created neither a receipt nor an invoice has
  // nothing worth a blocking modal for; only render it when at least one
  // related document actually exists.
  const hasConfirmedDoc = Boolean(confirmedDocs?.receipt?.id || confirmedDocs?.invoice?.id);

  const confirmedPanel = confirmedDocs && hasConfirmedDoc
    ? createPortal(
        <ConfirmResultModal
          title={confirmedTitle || ui('poConfirmedTitle')}
          docs={[
            confirmedDocs?.receipt?.id && { type: 'entrada', num: confirmedDocs.receipt.documentNo, amount: confirmedDocs.receipt.amount, route: `/goods-receipt/${confirmedDocs.receipt.id}` },
            confirmedDocs?.invoice?.id && { type: 'facturaCompra', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, documentStatus: confirmedDocs.invoice.documentStatus, route: `/purchase-invoice/${confirmedDocs.invoice.id}` },
          ].filter(Boolean)}
          currency={data?.['currency$_identifier'] || ''}
          navigate={navigate}
          onClose={() => { setConfirmedDocs(null); setConfirmedTitle(null); emitSurveyTrigger(); onRefresh?.(); }}
          data-testid="ConfirmResultModal__8b5323" />,
        document.body,
      )
    : null;

  // ETP-5063 — when confirming created no related document, skip the modal
  // and communicate success via an auto-dismissing toast instead, matching
  // the UX used everywhere else success is communicated.
  useEffect(() => {
    if (confirmedDocs && !hasConfirmedDoc) {
      toast.success(confirmedTitle || ui('poConfirmedTitle'));
      emitSurveyTrigger();
      onRefresh?.();
      setConfirmedDocs(null);
      setConfirmedTitle(null);
    }
  }, [confirmedDocs, hasConfirmedDoc, confirmedTitle, onRefresh, ui]);

  // ETP-5255 — gated on `showConfirm` ALONE, and hoisted above the early return below, because
  // both of those unmounted it at the exact moment it had something to say. Confirming the order
  // moves it DR→CO, so `isDraft` goes false and `fetched` resets to null while the CO effect
  // reloads; the modal then vanished mid-flow and the failure of a receipt/invoice step was
  // reported nowhere at all — no error, no toast, and no way to retry, since the draft Confirm
  // button is not rendered in CO either. That is strictly worse than the 409 it replaced: a
  // recoverable conflict traded for a silent failure. `onClose` is the only thing that may close
  // it.
  const confirmPortal = showConfirm ? createPortal(
    <ConfirmModal
      orderId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      onSave={onSave}
      onRefresh={onRefresh}
      onClose={() => setShowConfirm(false)}
      onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
      data-testid="ConfirmModal__8b5323" />,
    document.body,
  ) : null;

  // ── COMPLETED (loading) ────────────────────────────────────────────────────
  // `!showConfirm` (ETP-5255) — an open modal must never cross between this return and the main
  // one. Rendering it from BOTH is not enough and was the second wrong fix: the portal sits at a
  // different child index in each fragment, so React reconciles it as a new element and REMOUNTS
  // `ConfirmModal`, wiping `error`, `orderConfirmed`, `receiptResult` and `invoiceResult`. The
  // modal then came back blank with both checkboxes cleared, and pressing Confirm re-ran
  // `documentAction` on an order already in CO (`@AlreadyPosted@`) while the receipt — the step
  // that actually failed — was never retried. Staying on ONE return path keeps the element's
  // position, and therefore its state, stable. Safe because everything below that needs `fetched`
  // is guarded on it.
  // ETP-5260 — Copy link now renders unconditionally via the sibling topbarSecondary slot, so this
  // loading state no longer needs to render it here.
  if (isCompleted && !fetched && !showConfirm) {
    return <>{confirmedPanel}{confirmPortal}<span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 8px' }}>…</span></>;
  }

  // ── COMPLETED — compute derived values ─────────────────────────────────────
  let buttonLabel = null;
  let derived = null;
  let currency = '';
  // `fetched` can be null here now that the loading return above yields to an open modal.
  if (isCompleted && fetched) {
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

    // Pending action = there is pending qty/amount AND no draft document already covering it
    // (when a draft exists the topbar chip already covers it — the Manage button leaves it out).
    //
    // ETP-5295 — that rule now has ONE owner: the backend annotations `needsPrimaryDoc` (the
    // receipt, for this window) / `needsInvoiceDoc` on the order GET record, computed server-side
    // with exactly the formula written out below. The list row kebab (`useOrderWindow.jsx`) reads
    // the same two flags, so the kebab can no longer offer work this button considers done, nor
    // hide work it offers. The local derivation is kept as the fallback for a record that carries
    // no annotation (legacy backend / unannotated spec): unlike the kebab, this component has
    // already fetched the real receipts, invoices and lines, so falling back costs nothing and
    // keeps both the label AND the modal's sections (`derived.needsReceipt` /
    // `derived.needsInvoice` below) working.
    const { needsPrimaryDoc, needsInvoiceDoc } = readOrderPendingDocs(data);
    const needsReceipt = needsPrimaryDoc ?? (qtyPending !== 0 && receiptsDraft.length === 0);
    const needsInvoice = needsInvoiceDoc ?? (totalPending !== 0 && !invoiceDraft);

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
        <button
          type="button"
          onClick={() => setShowActions(true)}
          style={btnPrimaryStyle}
          // Hover to match the shared Confirm button's `hover:bg-primary/90` (90% opacity).
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--primary) / 0.9)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--primary))'; }}
        >
          {buttonLabel}
        </button>
      )}
      {/* ETP-5260 — Clone/Copy-link/Send moved to the topbarSecondary slot
          (PurchaseOrderSecondaryActions). This component now only renders the
          PRIMARY flow button above and the modals below. `confirmPortal` is
          hoisted above (ETP-5255) so the same portal instance is reused across
          this return and the loading-state early return — see the comment there. */}
      {confirmPortal}
      {isCompleted && showActions && createPortal(
        <CreateDocsModal
          orderId={recordId}
          data={data}
          base={base}
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

export function ConfirmModal({ orderId, data, apiBaseUrl, onClose, onConfirmed, onSave, onRefresh }) {
  const apiFetch = useApiFetch('');
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
          apiFetch(`${orderUrl}/${orderId}`),
          apiFetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`),
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
  }, [orderId, orderUrl, apiBaseUrl, apiFetch]);

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
  // ETP-5132 (confirm-modal regression) — grandTotal must be grossBase as-is, NOT
  // totalLines + a client-recomputed tax delta. grossBase (grandTotalAmount) is
  // ALREADY GET-time-compensated for the pending total discount by
  // AbstractOrderHeaderHandler.applyTotalDiscountToRecord() (ETP-4029) whenever
  // isPreCompletion is true, so re-applying discountFactor here double-discounts
  // it. Only netBase (summedLineAmount) is never backend-compensated, which is
  // why totalLines above still needs the client-side discountFactor.
  const grandTotal    = grossBase;
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
        const processRes = await apiFetch(
          `${orderUrl}/${orderId}/action/documentAction`,
          { method: 'POST', body: JSON.stringify({ docAction: 'CO' }) },
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
        const res = await apiFetch(`${orderUrl}/${orderId}/action/createGoodsReceipt`,
          { method: 'POST', body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('poOrderConfirmedReceiptError') + ' ' + translateBackendError(e?.error?.message || e?.response?.message || e?.message || `Error (${res.status})`, ui));
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
        const res = await apiFetch(`${orderUrl}/${orderId}/action/createPurchaseInvoice`,
          { method: 'POST', body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          // ETP-5381: mirrors the sales twin — this was the only branch here not translating the
          // backend message, so the new duplicate-invoice and completion messages would have
          // surfaced in English.
          throw new Error(ui('poOrderConfirmedInvoiceError') + ' ' + translateBackendError(e?.error?.message || e?.response?.message || e?.message || `Error (${res.status})`, ui));
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        currentInvoice = {
          id:         docObj?.id ?? null,
          documentNo: docObj?.documentNo ?? '',
          amount:     docObj?.grandTotalAmount ?? null,
          // ETP-5381: carry documentStatus so the result modal badges the invoice as Confirmada
          // instead of defaulting to Borrador — it is confirmed on creation now.
          documentStatus: docObj?.documentStatus ?? null,
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
      // ETP-5255 — reload the record before letting the user retry. Reaching here means the order
      // was confirmed (step 1 returned, or had already succeeded in an earlier attempt) and only a
      // document step failed, so the row on the server is NOT what this window is showing any
      // more: `documentAction=CO` moved it out of draft and recalculated its totals.
      //
      // Two things were broken by not doing this, and the second is why the retry could never
      // work. The window kept displaying the pre-confirmation order — a screen that lies. And the
      // `updated` token cached for the record was the pre-action one, so `onSave()` at the top of
      // the retry PATCHed with a superseded token and the server refused it 409 `stale_record`,
      // surfaced to the user as "somebody else edited this record" — about a change they had just
      // made themselves, on a retry that would fail identically forever.
      //
      // Awaited on purpose: the retry's very first act is `onSave()`, so the reload has to have
      // landed before the user can press the button again.
      // Errors are shown FIRST: the reload is best-effort, and the user must not be left staring
      // at a spinner while it happens, nor lose the message if it throws.
      setError(errors.join('\n'));
      setLoading(false);
      try {
        await onRefresh?.();
      } catch {
        // A failed reload must not replace the process errors with its own. The user still needs
        // to read which document step failed; a stale screen is the lesser problem.
      }
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
            testId="purchase-order-confirm-receipt-card" />
          <PoCheckboxCard
            checked={createInvoice || Boolean(invoiceResult)}
            onChange={() => !invoiceResult && setCreateInvoice(v => !v)}
            icon="🧾"
            title={ui('soCreateInvoiceTitle')}
            subtitle={invoiceResult ? ui('soAlreadyCreated') : ui('poCreateInvoiceCheckDesc')}
            disabled={Boolean(invoiceResult)}
            testId="purchase-order-confirm-invoice-card" />
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

// `testId` is a named prop, not `data-testid`, and it is APPLIED to the div (ETP-5255). Every
// instance used to pass `data-testid`, which this component neither destructured nor spread, so
// the cards reached the DOM with no test id at all — and the value passed was one shared generated
// hash, so it could not have told the two cards apart even if it had been applied. The mocked
// confirm spec had to locate them by their translated label in both locales as a result. Mirrors
// `SoCheckboxCard` in sales-order, which already did this correctly.
/**
 * @param implied the only action available, so there is nothing to choose: the card states what
 *     will happen instead of asking. Keeps the selected styling, drops the tick box and the
 *     click handler — a control that cannot change anything invites a click that does nothing.
 */
function PoCheckboxCard({ checked, onChange, icon, title, subtitle, disabled, implied, testId }) {
  const interactive = !disabled && !implied;
  return (
    <div
      data-testid={testId}
      data-implied={implied ? 'true' : 'false'}
      onClick={interactive ? onChange : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: checked ? '11px 13px' : '12px 14px', borderRadius: 8,
        cursor: interactive ? 'pointer' : 'default',
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
      {/* Omitted entirely when the action is implied (see `implied`). */}
      {!implied && (
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
      )}
    </div>
  );
}

// ── CreateDocsModal (CO orders — create docs without re-confirming) ────────────

export function CreateDocsModal({ orderId, data, base, currency, derived, onClose, onCreated }) {
  const apiFetch = useApiFetch('');
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

  // ETP-5381: with only ONE action left the tick confirms a confirmation — the dialog's only
  // button already says it. The sole pending action is implied, its card drops the checkbox, and
  // the button is live on open. With BOTH pending it is a real choice, so the checkboxes stay.
  // Mirrors CreateDocsModal in sales-order's OrderCreateInvoice.jsx — same modal, other side.
  const soleAction = needsReceipt !== needsInvoice;
  const receiptWanted = soleAction ? needsReceipt : createReceipt;
  const invoiceWanted = soleAction ? needsInvoice : createInvoice;

  const handleCreate = async () => {
    if (loading || (!receiptWanted && !invoiceWanted)) return;
    setLoading(true);
    setError(null);
    try {
      const result = {};

      if (receiptWanted) {
        const res = await apiFetch(`${base}/purchase-order/header/${orderId}/action/createGoodsReceipt`,
          { method: 'POST', body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(translateBackendError(e?.error?.message || e?.response?.message || `Error (${res.status})`, ui));
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        result.receipt = { id: docObj?.id ?? null, documentNo: docObj?.documentNo ?? '', amount: docObj?.grandTotalAmount ?? null };
        trackDocumentCreated('goods-receipt');
      }

      if (invoiceWanted) {
        const res = await apiFetch(`${base}/purchase-order/header/${orderId}/action/createPurchaseInvoice`,
          { method: 'POST', body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.error?.message || e?.response?.message || `Error (${res.status})`);
        }
        const doc = (await res.json())?.response?.data;
        const docObj = Array.isArray(doc) ? doc[0] : doc;
        // ETP-5381: carry documentStatus so the result modal badges the invoice as Confirmada
        // instead of defaulting to Borrador — it is confirmed on creation now.
        result.invoice = { id: docObj?.id ?? null, documentNo: docObj?.documentNo ?? '', amount: docObj?.grandTotalAmount ?? null, documentStatus: docObj?.documentStatus ?? null };
        trackDocumentCreated('purchase-invoice');
      }

      window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
      onCreated(result);
    } catch (e) {
      setError(e.message || ui('poErrorOccurred'));
      setLoading(false);
    }
  };

  const canCreate = receiptWanted || invoiceWanted;

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
            {/* "(optional)" only holds while there is something to opt out of. */}
            {soleAction ? ui('soGenerateDocsImplied') : ui('soGenerateDocs')}
          </div>
          {needsReceipt && (
            <PoCheckboxCard
              implied={soleAction}
              checked={receiptWanted}
              onChange={() => setCreateReceipt(v => !v)}
              icon="📦"
              title={ui('poCreateReceiptTitle')}
              subtitle={receiptSubtitle}
              testId="purchase-order-docs-receipt-card" />
          )}
          {needsInvoice && (
            <PoCheckboxCard
              implied={soleAction}
              checked={invoiceWanted}
              onChange={() => setCreateInvoice(v => !v)}
              icon="🧾"
              title={ui('soCreateInvoiceTitle')}
              subtitle={invoiceSubtitle}
              testId="purchase-order-docs-invoice-card" />
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
  // Fix (not part of ETP-5260): was `var(--status-info-fg)` — a badge-text token,
  // not a button-background token — which rendered a saturated blue instead of
  // the dark gray used by the real `Confirmar` button. Same pattern as ETP-4781.
  background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid hsl(var(--border-subtle))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
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
// amount) and opens CreateDocsModal once derived data is ready.
//
// ETP-5295 — "if nothing is pending it closes silently" is no longer a state a user can reach by
// clicking the kebab item: the kebab only offers the item when the backend annotated this record
// as still pending, and this launcher reads those same annotations. The silent close survives
// only as the defence for the no-annotation fallback path and for a record that changed between
// the list load and the click.
export function ManageDocsLauncher({ orderId, data, apiBaseUrl, token, onClose, onCreated }) {
  const ui = useUI();
  const [fetched, setFetched] = useState(null);

  const base    = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const [receiptRes, linesRes, invoiceRes] = await Promise.all([
          apiFetch(`${base}/goods-receipt/goodsReceipt?criteria=${CRITERIA('salesOrder', orderId)}&_limit=50`),
          apiFetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`),
          apiFetch(`${base}/purchase-invoice/header?criteria=${CRITERIA('salesOrder', orderId)}&_limit=50`),
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
  }, [orderId, base, apiFetch, apiBaseUrl]);

  // ETP-5295 — every hook below (including the close-effect) must run unconditionally, in the same
  // order, on every render. The derivation is guarded against `fetched` being null (loading state)
  // instead of being placed after the `if (!fetched) return spinner` early return: this component
  // used to compute `nothingToManage` and its close-effect AFTER that return, which meant the effect
  // was skipped on the first (loading) render and only registered once `fetched` arrived — React
  // then saw a different number of hooks between renders ("Rendered more hooks than during the
  // previous render") and unmounted the entire app (no ErrorBoundary anywhere catches it).
  const { receipts, invoices, orderLines } = fetched ?? { receipts: [], invoices: [], orderLines: [] };
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

  // ETP-5295 — same single source as the detail-page button above: the `needsPrimaryDoc` /
  // `needsInvoiceDoc` annotations the backend put on this very row, with the local derivation as
  // the no-annotation fallback. Reading the same flags the kebab used to decide to SHOW this
  // launcher is what makes "the option opens an empty flow and closes itself" impossible: both
  // ends now read one value off one record instead of two independent computations.
  // `fetched != null` still gates both: while loading, neither "needs" flag may read true off the
  // placeholder empty arrays above, or the close-effect below could fire before data ever loads.
  const { needsPrimaryDoc, needsInvoiceDoc } = readOrderPendingDocs(data);
  const needsReceipt = fetched != null && (needsPrimaryDoc ?? (qtyPending !== 0 && receiptsDraft.length === 0));
  const needsInvoice = fetched != null && (needsInvoiceDoc ?? (totalPending !== 0 && !invoiceDraft));
  const nothingToManage = fetched != null && !needsReceipt && !needsInvoice;

  // Close asynchronously when there's nothing pending — avoids the
  // "Cannot update a component while rendering" warning that occurs when a
  // child triggers parent setState during its own render.
  useEffect(() => {
    if (nothingToManage) onClose?.();
  }, [nothingToManage, onClose]);

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
      currency={data?.['currency$_identifier'] || ''}
      derived={derived}
      onClose={onClose}
      onCreated={onCreated}
      data-testid="CreateDocsModal__8b5323" />,
    document.body,
  );
}
