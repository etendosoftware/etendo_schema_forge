import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import SendToSifButton from './SendToSifButton';
import { getArSubtype } from './invoiceSubtype';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  if (curr) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(n);
    } catch { /* fallback if currency code is invalid */ }
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  paid:    { bg: '#d1fae5', color: '#065f46', dot: '#10b981', accent: '#10b981' },
  partial: { bg: '#dbeafe', color: '#1e3a5f', dot: '#3b82f6', accent: '#3b82f6' },
  overdue: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', accent: '#ef4444' },
  pending: { bg: '#fef3c7', color: '#78350f', dot: '#f59e0b', accent: '#f59e0b' },
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
            onClose={() => setShowSendModal(false)}
          />
        )}
      </>
    );
  }

  // Credit instruments (NC / DEV) — no payment lifecycle, just show applied amount
  const arSubtype = getArSubtype(data);
  const isCreditInstrument = arSubtype === 'NC' || arSubtype === 'DEV';
  if (isCompleted && isCreditInstrument) {
    const amount = Math.abs(typeof grandTotal === 'string' ? parseFloat(grandTotal) : (grandTotal ?? 0));
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[13px] font-medium h-9"
        style={{ padding: '0 12px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1e40af' }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#3b82f6' }} />
        {ui('creditApplied')} · {fmt(amount, currency)}
      </span>
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
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* "¿Gestionar envío?" dialog — offered after confirming a standard invoice */}
      {showShipmentDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
          onClick={() => !shipmentCreating && setShowShipmentDialog(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{ui('manageShipment')}</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>{ui('createShipmentDraftHint')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={shipmentCreating}
                onClick={() => setShowShipmentDialog(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '0.5px solid #d1d5db', background: 'transparent', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer' }}
              >
                {ui('skipShipment')}
              </button>
              <button
                type="button"
                disabled={shipmentCreating}
                onClick={handleCreateShipment}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#18181b', fontSize: 13, fontWeight: 500, color: '#fff', cursor: shipmentCreating ? 'not-allowed' : 'pointer', opacity: shipmentCreating ? 0.7 : 1 }}
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
