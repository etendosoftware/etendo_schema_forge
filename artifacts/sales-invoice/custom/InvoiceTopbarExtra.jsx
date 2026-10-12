import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import SendToSifButton from './SendToSifButton';
import { useInvoicePdf } from '@/windows/custom/shared/useInvoicePdf.js';
import { resolveInvoicePaymentBadge } from '@/windows/custom/shared/invoicePaymentBadge.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { TruncatedText } from '@/components/ui/truncated-text';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr, n);
}

/** Classify an installment into a status category */
function classifyInstallment(inst) {
  const outstanding = parseFloat(inst.outstandingAmount) || 0;
  const paid = parseFloat(inst.paidAmount) || 0;
  const overdue = parseInt(inst.daysOverdue, 10) || 0;

  if (outstanding <= 0) return 'paid';
  if (overdue > 0 && outstanding > 0) return 'overdue';
  if (paid > 0 && outstanding > 0) return 'partial';
  return 'pending';
}

const BADGE_STYLES = {
  paid:    { bg: 'var(--status-success-bg)', color: 'var(--status-success-fg)', dot: 'var(--status-success-fg)', accent: 'var(--status-success-fg)' },
  partial: { bg: 'var(--status-info-bg)', color: 'var(--status-info-fg)', dot: 'var(--status-info-border)', accent: 'var(--status-info-border)' },
  overdue: { bg: 'var(--status-destructive-bg)', color: 'var(--status-destructive-fg)', dot: 'var(--status-destructive-fg)', accent: 'var(--status-destructive-fg)' },
  pending: { bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', dot: 'var(--status-warning-border)', accent: 'var(--status-warning-border)' },
};

/**
 * InvoiceTopbarExtra — installment-aware payment status for the detail view topbar.
 *
 * Fetches paymentPlan installments on mount and derives badge status:
 * - All paid -> Green "Paid . total"
 * - Some partial, none overdue -> Blue "Partial . paid of total"
 * - Any overdue -> Red "Overdue . outstanding"
 * - None paid, none overdue -> Amber "Pending . outstanding"
 * - Draft -> nothing
 *
 * The badge is the ONLY entry point. Clicking it opens the payments modal.
 */
export default function InvoiceTopbarExtra({ data, recordId, token, apiBaseUrl, api, onSave, isDirty, isDocumentReadOnly }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [installments, setInstallments] = useState([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(true);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  // ETP-4372 — source the same client-rendered PDF the InvoicePreview panel uses
  // so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally at top level
  // (before the early returns below) to respect the rules of hooks. Keyed on the
  // same id the modal passes as documentId (data?.id).
  // ETP-4912 — generate on demand, not on mount. This hook used to run with the
  // invoice id unconditionally, so merely opening a completed invoice in edit mode
  // rendered a full PDF through jsreport that nobody had asked for (ETP-4315's design
  // doc calls the same shape on the preview side "pure wasted compute"). Passing a
  // null id keeps the hook call itself unconditional — rules of hooks — while the
  // generator idles until one of the two consumers is actually opened.
  const wantsPdf = showSendModal;
  const { pdfUrl, loading: pdfLoading } = useInvoicePdf(
    wantsPdf ? (data?.id ?? null) : null, apiBaseUrl, token,
  );

  const currency = data?.['currency$_identifier'] || '';
  const grandTotal = data?.grandTotalAmount ?? 0;
  const isDraft = data?.documentStatus === 'DR';
  const isCompleted = data?.documentStatus === 'CO';

  // Fetch installments once on mount (for badge calculation)
  const fetchInstallments = useCallback(async () => {
    if (!recordId || !base) { setInstallmentsLoading(false); return; }
    try {
      const res = await apiFetch(
        `${base}/sales-invoice/paymentPlan?parentId=${recordId}&_startRow=0&_endRow=50`,
        {},
      );
      if (res.ok) {
        const json = await res.json();
        setInstallments(json?.response?.data || []);
      }
    } catch { /* silent */ }
    finally { setInstallmentsLoading(false); }
  }, [recordId, base, apiFetch]);

  useEffect(() => { fetchInstallments(); }, [fetchInstallments]);

  // Listen for DocAction process completion — set the flag for the send modal.
  // ETP-5576: the shipment prompt that used to ride on this listener is gone — it now lives
  // in the generic follow-up flow (FollowUpDocumentButton in SalesInvoiceTopbar, opened by
  // draftMode.afterProcess after Confirm). Note this listener only reacts to a `DocAction`
  // process run through hook.handleProcess; the invoice's draftMode Confirm goes through
  // handleSaveAndProcess, which does not emit `neo:processSuccess`, so the send-after-confirm
  // flag below is kept exactly as it was (behaviour unchanged).
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.entity === 'header' && e.detail?.process?.columnName === 'DocAction' && e.detail?.recordId) {
        sessionStorage.setItem(`invoice:sendAfterConfirm:${e.detail.recordId}`, '1');
      }
    };
    window.addEventListener('neo:processSuccess', handler);
    return () => window.removeEventListener('neo:processSuccess', handler);
  }, []);

  // ETP-5260 defect fix — the Send button used to render inline here (topbarRight),
  // landing to the RIGHT of Save/Confirm against the DF. It now lives in
  // SalesInvoiceSecondaryActions (topbarSecondary, left of Save/Confirm) and
  // reaches this component's existing SendDocumentModal/PDF context via this
  // event bridge, the same pattern purchase-order uses for
  // 'purchase-order:open-send-modal'.
  useEffect(() => {
    const openSendModal = () => setShowSendModal(true);
    window.addEventListener('sales-invoice:open-send-modal', openSendModal);
    return () => window.removeEventListener('sales-invoice:open-send-modal', openSendModal);
  }, []);

  // After the record re-fetches as CO, open the queued send modal.
  useEffect(() => {
    if (isCompleted && recordId) {
      const sendKey = `invoice:sendAfterConfirm:${recordId}`;
      if (sessionStorage.getItem(sendKey)) {
        sessionStorage.removeItem(sendKey);
        setShowSendModal(true);
      }
    }
  }, [isCompleted, recordId]);

  // Derive badge status from installments (must be before any early return)
  const badgeInfo = useMemo(() => {
    if (installmentsLoading || installments.length === 0) return null;

    const classified = installments.map(inst => ({
      ...inst,
      _status: classifyInstallment(inst),
    }));

    const allPaid = classified.every(i => i._status === 'paid');
    const anyOverdue = classified.some(i => i._status === 'overdue');
    const hasSomePaid = classified.some(i => i._status === 'paid') || classified.some(i => i._status === 'partial');

    const sumPaid = classified.reduce((s, i) => s + (parseFloat(i.paidAmount) || 0), 0);
    const sumOutstanding = classified.reduce((s, i) => s + (parseFloat(i.outstandingAmount) || 0), 0);
    const sumTotal = classified.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    if (allPaid) {
      return { type: 'paid', label: `${ui('statusPaid')} · ${fmt(sumTotal, currency)}`, style: BADGE_STYLES.paid };
    }
    if (anyOverdue) {
      return {
        type: 'overdue',
        label: `${ui('statusOverdue')} · ${fmt(sumOutstanding, currency)}`,
        style: BADGE_STYLES.overdue,
      };
    }
    if (hasSomePaid) {
      return {
        type: 'partial',
        label: `${ui('statusPartial')} · ${fmt(sumPaid, currency)} ${ui('of')} ${fmt(sumTotal, currency)}`,
        style: BADGE_STYLES.partial,
      };
    }
    return { type: 'pending', label: `${ui('statusPending')} · ${fmt(sumOutstanding, currency)}`, style: BADGE_STYLES.pending };
  }, [installments, installmentsLoading, currency]);

  // Summary amounts from installments
  const totalPaid = useMemo(() =>
    installments.reduce((sum, i) => sum + (parseFloat(i.paidAmount) || 0), 0),
    [installments],
  );
  const totalOutstanding = useMemo(() =>
    installments.reduce((sum, i) => sum + (parseFloat(i.outstandingAmount) || 0), 0),
    [installments],
  );

  if (!data?.documentStatus) return null;

  // ETP-4717 — Draft: nothing to show. Send is only available once the
  // invoice is Completed (CO), matching the grid row quick-action's status
  // gate; it used to render unconditionally here, which was the bug.
  if (isDraft) {
    return (
      <></>
    );
  }

  // Credit instruments — mirror the grid's "Saldo pendiente" cell: green "Aplicada"
  // once fully consumed, else a "Saldo a favor · remaining" badge that opens the same
  // payment history modal the grid opens (listing the payments that consumed it).
  //
  // ETP-4841: identified by the SIGN of the total, not by the document type — a POSITIVE
  // Factura Rectificativa is payable and falls through to the normal branches below,
  // while a NEGATIVE ordinary Factura is a credit and enters here.
  const isCreditInstrument = resolveInvoicePaymentBadge(data).isCredit;
  if (isCompleted && isCreditInstrument) {
    // Credit instruments carry negative amounts end to end — installments (when loaded) are
    // the fresh source, data.outstandingAmount the fallback snapshot; either way the
    // remaining unused balance is the absolute value.
    const outstandingAbs = Math.abs(installments.length > 0
      ? installments.reduce((s, i) => s + (parseFloat(i.outstandingAmount) || 0), 0)
      : parseFloat(data?.outstandingAmount ?? 0));
    if (installmentsLoading) {
      return (
        <span className="inline-flex items-center gap-2 text-sm leading-6 text-muted-foreground h-10" style={{ padding: '0 12px' }}>
          {ui('loading')}
        </span>
      );
    }
    if (outstandingAbs < 0.001) {
      return (
        <span
          className="inline-flex items-center gap-2 text-sm leading-6 font-medium h-10"
          style={{ padding: '0 12px', borderRadius: '8px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-fg)' }}
        >
          {ui('cpCreditFullyApplied')}
        </span>
      );
    }
    // ETP-5268 follow-up — amount shown again, capped to ~6 digits via
    // TruncatedText (tooltip only opens when it genuinely truncates).
    return (
      <>
        <button
          type="button"
          data-testid="payment-status-badge"
          onClick={() => setShowPaymentsModal(true)}
          className="inline-flex items-center gap-2 text-sm leading-6 font-medium hover:opacity-80 cursor-pointer h-10"
          style={{ padding: '0 12px', borderRadius: '8px', backgroundColor: 'var(--status-info-bg)', border: '1px solid var(--status-info-border)', color: 'hsl(var(--primary))', fontVariantNumeric: 'tabular-nums' }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'hsl(var(--primary))' }} />
          {ui('cpFavorBadge')}
          <TruncatedText
            text={fmt(outstandingAbs, currency)}
            className="w-[72px] shrink-0 text-left"
            data-testid="TruncatedText__329004" />
        </button>
        {showPaymentsModal && (
          <InvoicePaymentHistoryModal
            invoiceId={recordId}
            invoiceData={data}
            specName="sales-invoice"
            apiBaseUrl={apiBaseUrl}
            onClose={() => setShowPaymentsModal(false)}
            onPaymentAdded={fetchInstallments}
            data-testid="InvoicePaymentHistoryModal__329004" />
        )}
      </>
    );
  }

  // While loading, show a subtle placeholder
  if (installmentsLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm leading-6 text-muted-foreground h-10" style={{ padding: '0 12px' }}>
        {ui('loading')}
      </span>
    );
  }

  // No installments found — fallback badge from header-level data
  if (!badgeInfo) {
    const outstanding = data?.outstandingAmount ?? grandTotal;
    const paid = grandTotal - outstanding;
    const isPaid = paid > 0 && outstanding <= 0;
    const isPending = outstanding > 0 && paid <= 0;
    const isPartial = paid > 0 && outstanding > 0;

    let fallbackStyle = null;
    let fallbackLabel = null;
    if (isPaid) {
      fallbackStyle = BADGE_STYLES.paid;
      fallbackLabel = `${ui('statusPaid')} · ${fmt(grandTotal, currency)}`;
    } else if (isPartial) {
      fallbackStyle = BADGE_STYLES.partial;
      fallbackLabel = `${ui('statusPartial')} · ${fmt(paid, currency)} ${ui('of')} ${fmt(grandTotal, currency)}`;
    } else if (isPending && isCompleted) {
      fallbackStyle = BADGE_STYLES.pending;
      fallbackLabel = `${ui('statusPending')} · ${fmt(outstanding, currency)}`;
    }

    if (!fallbackStyle) return null;

    return (
      <button
        type="button"
        data-testid="payment-status-badge"
        onClick={() => setShowPaymentsModal(true)}
        className="inline-flex items-center gap-2 text-sm leading-6 font-medium hover:opacity-80 cursor-pointer h-10"
        style={{
          padding: '0 12px',
          borderRadius: '8px',
          backgroundColor: fallbackStyle.bg,
          color: fallbackStyle.color,
        }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: fallbackStyle.dot }} />
        {fallbackLabel}
        <span style={{ opacity: 0.6, marginLeft: 4 }}>{ui('view')} &rarr;</span>
      </button>
    );
  }

  return (
    <>
      {/* Badge pill — sole entry point to payments modal */}
      <button
        type="button"
        data-testid="payment-status-badge"
        onClick={() => setShowPaymentsModal(true)}
        className="inline-flex items-center gap-2 text-sm leading-6 font-medium hover:opacity-80 cursor-pointer h-10"
        style={{
          padding: '0 12px',
          borderRadius: '8px',
          backgroundColor: badgeInfo.style.bg,
          color: badgeInfo.style.color,
        }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: badgeInfo.style.dot }} />
        {badgeInfo.label}
        <span style={{ opacity: 0.6, marginLeft: 4 }}>{ui('view')} &rarr;</span>
      </button>

      <SendToSifButton
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        status={data?.documentStatus}
        onSave={onSave}
        isDirty={isDirty}
        isDocumentReadOnly={isDocumentReadOnly}
        data-testid="SendToSifButton__329004" />

      {/* View payments modal — installment breakdown */}
      {showPaymentsModal && (
        <InvoicePaymentHistoryModal
          invoiceId={recordId}
          invoiceData={data}
          specName="sales-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowPaymentsModal(false)}
          onPaymentAdded={fetchInstallments}
          data-testid="InvoicePaymentHistoryModal__329004" />
      )}

      {/* Send Invoice modal */}
      {showSendModal && (
        <SendDocumentModal
          documentType={tMenu('Sales Invoice')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={data?.id}
          windowName="sales-invoice"
          token={token}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={pdfLoading}
          onClose={() => setShowSendModal(false)}
          data-testid="SendDocumentModal__329004" />
      )}
    </>
  );
}
