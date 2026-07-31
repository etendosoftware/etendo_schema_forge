import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import SendToSifButton from './SendToSifButton';
import { useInvoicePdf } from '@/windows/custom/shared/useInvoicePdf.js';
import { getArSubtype } from './invoiceSubtype';
import { formatCurrency } from '@/lib/formatCurrency.js';

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
  overdue: { bg: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))', dot: 'hsl(var(--destructive))', accent: 'hsl(var(--destructive))' },
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
export default function InvoiceTopbarExtra({ data, recordId, token, apiBaseUrl, api }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [shipmentCreating, setShipmentCreating] = useState(false);
  const [installments, setInstallments] = useState([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(true);

  // Keep a ref to the latest data so the event listener (with [] deps) can
  // check arInvoiceSubtype without a stale closure.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ETP-4372 — source the same client-rendered PDF the InvoicePreview panel uses
  // so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally at top level
  // (before the early returns below) to respect the rules of hooks. Keyed on the
  // same id the modal passes as documentId (data?.id).
  const { pdfUrl, loading: pdfLoading } = useInvoicePdf(data?.id ?? null, apiBaseUrl, token);

  const currency = data?.['currency$_identifier'] || '';
  const grandTotal = data?.grandTotalAmount ?? 0;
  const isDraft = data?.documentStatus === 'DR';
  const isCompleted = data?.documentStatus === 'CO';

  // Fetch installments once on mount (for badge calculation)
  const fetchInstallments = useCallback(async () => {
    if (!recordId || !base) { setInstallmentsLoading(false); return; }
    try {
      const res = await fetch(
        `${base}/sales-invoice/paymentPlan?parentId=${recordId}&_startRow=0&_endRow=50`,
        { headers },
      );
      if (res.ok) {
        const json = await res.json();
        setInstallments(json?.response?.data || []);
      }
    } catch { /* silent */ }
    finally { setInstallmentsLoading(false); }
  }, [recordId, base, headers]);

  useEffect(() => { fetchInstallments(); }, [fetchInstallments]);

  // Listen for DocAction process completion — set flags for send modal and
  // (for standard FAC invoices only) shipment creation prompt.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.entity === 'header' && e.detail?.process?.columnName === 'DocAction' && e.detail?.recordId) {
        sessionStorage.setItem(`invoice:sendAfterConfirm:${e.detail.recordId}`, '1');
        const subtype = getArSubtype(dataRef.current);
        if (subtype === 'FAC') {
          sessionStorage.setItem(`invoice:createShipment:${e.detail.recordId}`, '1');
        }
      }
    };
    window.addEventListener('neo:processSuccess', handler);
    return () => window.removeEventListener('neo:processSuccess', handler);
  }, []);

  // After the record re-fetches as CO, open queued modals in order.
  useEffect(() => {
    if (isCompleted && recordId) {
      const sendKey = `invoice:sendAfterConfirm:${recordId}`;
      if (sessionStorage.getItem(sendKey)) {
        sessionStorage.removeItem(sendKey);
        setShowSendModal(true);
      }
      const shipKey = `invoice:createShipment:${recordId}`;
      if (sessionStorage.getItem(shipKey)) {
        sessionStorage.removeItem(shipKey);
        setShowShipmentDialog(true);
      }
    }
  }, [isCompleted, recordId]);

  const handleCreateShipment = async () => {
    setShipmentCreating(true);
    try {
      const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${base}/sales-invoice/header/${recordId}/action/createShipment`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      const json = await res.json();
      const shipmentData = json?.response?.data;
      if (res.ok && shipmentData?.documentNo) {
        setShowShipmentDialog(false);
        // Soft feedback — no hard toast dependency in topbar
        window.dispatchEvent(new CustomEvent('neo:toast', {
          detail: { type: 'success', message: `${ui('shipmentCreated')}: ${shipmentData.documentNo}` },
        }));
      } else {
        const msg = json?.response?.error || ui('failedToImportLines');
        window.dispatchEvent(new CustomEvent('neo:toast', { detail: { type: 'error', message: msg } }));
        setShowShipmentDialog(false);
      }
    } catch {
      setShowShipmentDialog(false);
    } finally {
      setShipmentCreating(false);
    }
  };

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

  // Draft — only show Send button
  if (isDraft) {
    return (
      <>
        <SendDocumentButton onClick={() => setShowSendModal(true)} />
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
          />
        )}
      </>
    );
  }

  // Credit instruments (ETP-4737: unified RECTIFICATIVA subtype, formerly separate
  // NC / DEV) — mirror the grid's "Pendiente de pago" cell: green "Aplicada" once
  // the note is fully consumed, else a purple "Saldo a favor · remaining" badge
  // that opens the same payment history modal the grid opens (listing the
  // payments that consumed the note).
  const arSubtype = getArSubtype(data);
  const isCreditInstrument = arSubtype === 'RECTIFICATIVA';
  if (isCompleted && isCreditInstrument) {
    // Credit notes carry negative amounts end to end — installments (when loaded) are the
    // fresh source, data.outstandingAmount the fallback snapshot; either way the remaining
    // unused balance is the absolute value.
    const outstandingAbs = Math.abs(installments.length > 0
      ? installments.reduce((s, i) => s + (parseFloat(i.outstandingAmount) || 0), 0)
      : parseFloat(data?.outstandingAmount ?? 0));
    if (installmentsLoading) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground" style={{ padding: '4px 12px' }}>
          {ui('loading')}
        </span>
      );
    }
    if (outstandingAbs < 0.001) {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[13px] font-medium h-9"
          style={{ padding: '0 12px', borderRadius: '8px', backgroundColor: 'hsl(var(--card))', color: 'var(--status-success-bg)' }}
        >
          {ui('cpCreditFullyApplied')}
        </span>
      );
    }
    return (
      <>
        <button
          type="button"
          data-testid="payment-status-badge"
          onClick={() => setShowPaymentsModal(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-80 cursor-pointer h-9"
          style={{ padding: '0 12px', borderRadius: '8px', backgroundColor: 'hsl(var(--card))', border: '1px solid var(--status-info-bg)', color: 'hsl(var(--primary))', fontVariantNumeric: 'tabular-nums' }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'hsl(var(--primary))' }} />
          {ui('cpFavorBadge')} · {fmt(outstandingAbs, currency)}
        </button>
        {showPaymentsModal && (
          <InvoicePaymentHistoryModal
            invoiceId={recordId}
            invoiceData={data}
            specName="sales-invoice"
            apiBaseUrl={apiBaseUrl}
            onClose={() => setShowPaymentsModal(false)}
            onPaymentAdded={fetchInstallments}
          />
        )}
      </>
    );
  }

  // While loading, show a subtle placeholder
  if (installmentsLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground" style={{ padding: '4px 12px' }}>
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
        className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer h-9"
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
        className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer h-9"
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
      />

      <SendDocumentButton onClick={() => setShowSendModal(true)} />

      {/* View payments modal — installment breakdown */}
      {showPaymentsModal && (
        <InvoicePaymentHistoryModal
          invoiceId={recordId}
          invoiceData={data}
          specName="sales-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowPaymentsModal(false)}
          onPaymentAdded={fetchInstallments}
        />
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
        />
      )}

      {/* "¿Gestionar envío?" dialog — offered after confirming a standard invoice */}
      {showShipmentDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / 0.3)' }}
          onClick={() => !shipmentCreating && setShowShipmentDialog(false)}
        >
          <div
            style={{ background: 'hsl(var(--card))', borderRadius: 12, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 8px 32px hsl(var(--foreground) / 0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 8 }}>{ui('manageShipment')}</p>
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 24 }}>{ui('createShipmentDraftHint')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={shipmentCreating}
                onClick={() => setShowShipmentDialog(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '0.5px solid hsl(var(--card))', background: 'transparent', fontSize: 13, fontWeight: 500, color: 'var(--status-info-bg)', cursor: 'pointer' }}
              >
                {ui('skipShipment')}
              </button>
              <button
                type="button"
                disabled={shipmentCreating}
                onClick={handleCreateShipment}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'hsl(var(--foreground))', fontSize: 13, fontWeight: 500, color: 'hsl(var(--card))', cursor: shipmentCreating ? 'not-allowed' : 'pointer', opacity: shipmentCreating ? 0.7 : 1 }}
              >
                {shipmentCreating ? ui('creating') : ui('createShipmentDraft')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
