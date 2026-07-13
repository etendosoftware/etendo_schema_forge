import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { MoneyAmount } from '@/components/ui/money-amount';
import { Skeleton } from '@/components/ui/skeleton';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';

function fmtDate(raw) {
  if (!raw) return '—';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Plain-text es-ES amount for the delete-confirm message (no JSX, unlike <MoneyAmount>). */
function fmtAmount(val, currency) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(n);
}

// Processed APRM statuses. PWNC ("Withdrawn not Cleared") and RPAE ("Awaiting
// Execution") are the processed states for payments-out / deferred accounts —
// without them a confirmed purchase payment was mislabeled as "Borrador".
const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE']);

/** True when a listed payment is processed/deposited (backend flag is source of truth). */
function isProcessed(p) {
  return p?.processed === true || PAID_STATUSES.has(p?.status || '');
}

function PaymentStateTag({ status, processed, isSales, ui }) {
  // The `processed` flag from the backend is the source of truth; the status
  // whitelist is a fallback for rows that don't carry it.
  const isDeposited = processed === true || PAID_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span
        data-testid="PaymentStateTag__deposited"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '2px 10px', borderRadius: 6,
          background: '#E2F7EA', color: '#17663A',
          fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {isSales ? ui('cobroDepositado') : ui('pagoDepositado')}
      </span>
    );
  }
  return (
    <span
      data-testid="PaymentStateTag__draft"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 10px', borderRadius: 6,
        background: '#F1F2F4', color: '#55556D',
        fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('draft')}
    </span>
  );
}

const METHOD_ICONS = {
  transfer: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/></svg>,
  card:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  cash:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>,
  direct:   <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/></svg>,
};

function MethodIcon({ method }) {
  const key = (method || '').toLowerCase();
  const icon = METHOD_ICONS[key] || METHOD_ICONS.transfer;
  return <span style={{ display: 'inline-flex', color: '#9CA3AF' }}>{icon}</span>;
}

/** Trash icon button — only rendered for draft rows, stops propagation so it doesn't open edit. */
function DeleteDraftButton({ onClick, ui }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ui('cpDeleteDraft')}
      title={ui('cpDeleteDraft')}
      data-testid="InvoicePaymentHistoryModal__delete-btn"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: '#C5234A', cursor: 'pointer', flexShrink: 0 }}
    >
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}

/** Confirmation dialog for deleting a draft payment — a second, higher layer over the history popup. */
function DeleteDraftConfirm({ payment, isSales, currency, deleting, error, onCancel, onConfirm, ui }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={onCancel}
      data-testid="InvoicePaymentHistoryModal__delete-confirm-backdrop"
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 380, maxWidth: '100%', borderRadius: 12, boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)', padding: 20, gap: 12, display: 'flex' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__delete-confirm-panel"
      >
        <div style={{ fontSize: 16, lineHeight: '22px', fontWeight: 600, color: '#121217' }}>
          {isSales ? ui('cpDeleteCollectionTitle') : ui('cpDeletePaymentTitle')}
        </div>
        <div style={{ fontSize: 13, lineHeight: '19px', color: '#3F3F50' }}>
          {ui('cpDeleteDraftConfirm', { doc: payment.documentNo || payment.id, amount: fmtAmount(payment.amount, currency) })}
        </div>
        {error && <div style={{ fontSize: 12, color: '#C5234A' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            data-testid="InvoicePaymentHistoryModal__delete-cancel-btn"
            style={{ fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', background: 'none', color: '#121217', cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            data-testid="InvoicePaymentHistoryModal__delete-confirm-btn"
            style={{ fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', background: '#C5234A', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? ui('loading') : ui('cpDeleteDraft')}
          </button>
        </div>
      </div>
    </div>
  );
}

function getCountLabel(isSales, count, ui) {
  if (isSales) {
    return count === 1 ? ui('cobroRegistrado') : ui('cobrosRegistrados');
  }
  return count === 1 ? ui('pagoRegistrado') : ui('pagosRegistrados');
}

/**
 * InvoicePaymentHistoryModal — intermediate popup opened from the "Pendiente de pago" badge
 * in the invoice list (Step 1 of the two-step payment flow).
 *
 * Shows existing payment records for the invoice and offers an "Añadir cobro/pago" button
 * that opens NewPaymentModal (Step 2) for registration.
 *
 * Props:
 *   invoiceId      — string, invoice record ID
 *   invoiceData    — object, invoice row data (amounts, status, partner, etc.)
 *   specName       — "sales-invoice" | "purchase-invoice"
 *   apiBaseUrl     — full base URL including spec (e.g. http://host/sws/neo/sales-invoice)
 *   onClose        — callback when the popup is dismissed
 *   onPaymentAdded — optional callback after a payment is successfully registered
 */
export default function InvoicePaymentHistoryModal({
  invoiceId,
  invoiceData,
  specName,
  apiBaseUrl,
  onClose,
  onPaymentAdded,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const isSales = specName === 'sales-invoice';
  const paymentWindow = isSales ? 'payment-in' : 'payment-out';

  // Draft rows re-open the editable modal (the payment/collection windows are
  // read-only); processed rows navigate to that read-only window to view them.
  const handleRowClick = useCallback((p) => {
    if (!isProcessed(p)) {
      setEditingPayment(p);
      setShowPaymentModal(true);
      return;
    }
    onClose();
    navigate(`/${paymentWindow}/${p.id}`);
  }, [navigate, onClose, paymentWindow]);

  const currency = invoiceData?.['currency$_identifier'] || 'EUR';
  const grandTotal = parseFloat(invoiceData?.grandTotalAmount ?? 0);
  const bpName = invoiceData?.['businessPartner$_identifier'] || invoiceData?.businessPartner || '';
  const docNo = invoiceData?.documentNo || '';
  const isCompleted = invoiceData?.documentStatus === 'CO';

  const [payments, setPayments] = useState([]);
  // Payment plan installments — the source of truth for the outstanding amount once
  // loaded, since `invoiceData.outstandingAmount` is a snapshot from when the modal
  // opened and never updates after a payment is registered in this same session.
  const [installments, setInstallments] = useState([]);
  const outstandingAmt = installments.length > 0
    ? installments.reduce((s, i) => s + Math.max(0, Number(i.outstandingAmount ?? 0)), 0)
    : parseFloat(invoiceData?.outstandingAmount ?? 0);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // The draft being edited (null = "add new"); drives the modal's edit mode.
  const [editingPayment, setEditingPayment] = useState(null);
  // Draft pending delete confirmation (null = no confirm dialog open).
  const [deletingPayment, setDeletingPayment] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // Track whether a payment was added so we notify the parent on close
  const [paymentWasAdded, setPaymentWasAdded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!invoiceId || !base) { setLoading(false); return; }
    try {
      const [paymentsRes, planRes] = await Promise.all([
        apiFetch(`/${specName}/header/${invoiceId}/action/invoicePayments`,
          { method: 'POST', body: '{}' }),
        apiFetch(`/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=50`),
      ]);
      if (paymentsRes.ok) setPayments((await paymentsRes.json())?.response?.data || []);
      if (planRes.ok) setInstallments((await planRes.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiFetch, base, invoiceId, specName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close NewPaymentModal and refresh the list; keep history open.
  // onPaymentAdded is deferred to handleClose so the invoice table refreshes
  // only when the user dismisses the history popup, not immediately.
  const handlePaymentRegistered = useCallback(() => {
    setShowPaymentModal(false);
    setEditingPayment(null);
    setPaymentWasAdded(true);
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Draft-only deletion (row click already routes drafts to edit, never here for deposited rows).
  const handleDeleteClick = useCallback((e, p) => {
    e.stopPropagation();
    setDeleteError(null);
    setDeletingPayment(p);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    if (isDeleting) return;
    setDeletingPayment(null);
    setDeleteError(null);
  }, [isDeleting]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingPayment) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/${specName}/header/${invoiceId}/action/deletePayment`, {
        method: 'POST', body: JSON.stringify({ paymentId: deletingPayment.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.response?.error) {
        throw new Error(json?.response?.error?.message || ui('cpDeleteDraftFailed'));
      }
      setDeletingPayment(null);
      setPaymentWasAdded(true);
      setLoading(true);
      fetchData();
    } catch (err) {
      setDeleteError(err.message || ui('cpDeleteDraftFailed'));
    } finally {
      setIsDeleting(false);
    }
  }, [apiFetch, deletingPayment, fetchData, invoiceId, specName, ui]);

  const handleClose = useCallback(() => {
    if (paymentWasAdded) onPaymentAdded?.();
    onClose();
  }, [onClose, onPaymentAdded, paymentWasAdded]);

  const title = isSales ? ui('invoiceReceipts') : ui('invoicePaymentsTitle');
  const partyLabel = isSales ? ui('customer') : ui('vendor');
  const canAddPayment = outstandingAmt > 0 && isCompleted;

  // Table layout: Nº documento · Fecha · Método · Estado · Importe (right) · trash (draft-only).
  // 760px modal − 48px side padding − 60px column gaps (5 gaps) = 652px to distribute.
  // Fixed columns: Fecha 110 + Método 170 + Estado 150 + Importe 110 + trash 28 = 568px.
  // 1fr (Nº documento) = 652 − 568 = 84px — enough for typical doc numbers.
  const GRID = '1fr 110px 170px 150px 110px 28px';
  const HCELL = { fontSize: 12, lineHeight: '16px', fontWeight: 600, color: '#121217', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  let historyBody;
  if (loading) {
    historyBody = (
      <div data-testid="InvoicePaymentHistoryModal__skeleton">
        {/* Column headers (static labels — no need to skeleton them) */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 24px', borderBottom: '1px solid #E8EAEF' }}>
          <div style={HCELL}>{ui('documentNo')}</div>
          <div style={HCELL}>{ui('date')}</div>
          <div style={HCELL}>{ui('paymentMethodCol')}</div>
          <div style={HCELL}>{ui('statusLabel')}</div>
          <div style={{ ...HCELL, textAlign: 'right' }}>{ui('amount')}</div>
          <div />
        </div>
        {/* Ghost rows matching the real row's shape/columns */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '11px 24px', borderBottom: '1px solid #F1F2F4', alignItems: 'center', opacity: 1 - i * 0.2 }}
            >
              <Skeleton className="h-4 w-20" data-testid="Skeleton__b82d4f" />
              <Skeleton className="h-4 w-16" data-testid="Skeleton__b82d4f" />
              <Skeleton className="h-6 w-28 rounded-full" data-testid="Skeleton__b82d4f" />
              <Skeleton className="h-6 w-24 rounded-full" data-testid="Skeleton__b82d4f" />
              <Skeleton className="h-4 w-16 ml-auto" data-testid="Skeleton__b82d4f" />
              <div />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (payments.length === 0) {
    historyBody = (
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10 }}
        data-testid="InvoicePaymentHistoryModal__empty"
      >
        {/* Neutral document icon — the empty state has no direction, so no in/out arrow. */}
        <div style={{ width: 48, height: 48, borderRadius: 8, background: '#F1F2F4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#828FA3', flexShrink: 0 }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        </div>
        <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
          {isSales ? ui('noCobroYet') : ui('noPagoYet')}
        </p>
      </div>
    );
  } else {
    historyBody = (
      <div>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 24px', borderBottom: '1px solid #E8EAEF' }}>
          <div style={HCELL}>{ui('documentNo')}</div>
          <div style={HCELL}>{ui('date')}</div>
          <div style={HCELL}>{ui('paymentMethodCol')}</div>
          <div style={HCELL}>{ui('statusLabel')}</div>
          <div style={{ ...HCELL, textAlign: 'right' }}>{ui('amount')}</div>
          <div />
        </div>
        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="InvoicePaymentHistoryModal__list">
          {payments.map((p) => {
            const methodRaw = p['paymentMethod$_identifier'] || p.paymentMethod || '';
            const methodKey = methodRaw.toLowerCase().replace(/transferencia|transfer/,'transfer').replace(/tarjeta|card/,'card').replace(/efectivo|cash/,'cash').replace(/domiciliaci[oó]n|direct/,'direct');
            const amtSign = isSales ? '+ ' : '− ';
            return (
              <div
                key={p.id}
                onClick={() => handleRowClick(p)}
                className="hover-row"
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '11px 24px', borderBottom: '1px solid #F1F2F4', alignItems: 'center', cursor: 'pointer' }}
                data-testid="InvoicePaymentHistoryModal__row"
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#121217', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.documentNo || p.id}
                </div>
                <div className="tabular-nums" style={{ fontSize: 14, color: '#121217' }}>
                  {fmtDate(p.paymentDate)}
                </div>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', padding: '2px 8px', borderRadius: 360, background: '#F5F7F9', color: '#3F3F50', fontSize: 12, lineHeight: '16px' }}>
                    <MethodIcon method={methodKey} data-testid="MethodIcon__b82d4f" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{methodRaw || '—'}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <PaymentStateTag
                    status={p.status || ''}
                    processed={p.processed}
                    isSales={isSales}
                    ui={ui}
                    data-testid="PaymentStateTag__b82d4f" />
                </div>
                <div className="tabular-nums" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: isSales ? '#17663A' : '#C5234A', whiteSpace: 'nowrap' }}>
                  {amtSign}<MoneyAmount value={p.amount} currency={currency} tone="neutral" className={isSales ? 'text-[#17663A]' : 'text-[#C5234A]'} data-testid="MoneyAmount__cp-history-row" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {!isProcessed(p) && (
                    <DeleteDraftButton onClick={(e) => handleDeleteClick(e, p)} ui={ui} data-testid="DeleteDraftButton__b82d4f" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      style={{ padding: 24 }}
      onClick={handleClose}
      data-testid="InvoicePaymentHistoryModal__backdrop"
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 760, maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 0 0 1px rgba(18,18,23,0.1), 0 24px 48px rgba(18,18,23,0.03), 0 10px 18px rgba(18,18,23,0.03), 0 5px 8px rgba(18,18,23,0.04), 0 2px 4px rgba(18,18,23,0.04)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__panel"
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleClose}
            aria-label={ui('close')}
            data-testid="InvoicePaymentHistoryModal__close"
            style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 360, border: 'none', outline: 'none', background: 'none', cursor: 'pointer', color: '#828FA3', fontSize: 20, lineHeight: 1 }}
          >
            &times;
          </button>
          <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, color: '#121217' }}>{title}</div>
          {docNo && (
            <span style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50', background: '#F5F7F9', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
              {docNo}
            </span>
          )}
        </div>

        {/* Summary widget — Cliente/Proveedor · Importe total · Saldo pendiente */}
        <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid #E8EAEF', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{partyLabel}</div>
              <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: '#121217', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName || '—'}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{ui('importeTotal')}</div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500 }}>
                <MoneyAmount value={grandTotal} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-history-total" />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: '#3F3F50' }}>{ui('saldoPendiente')}</div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500 }}>
                <MoneyAmount
                  value={outstandingAmt}
                  currency={currency}
                  tone="neutral"
                  className={outstandingAmt > 0 ? 'text-[#C28800]' : 'text-[#17663A]'}
                  data-testid="MoneyAmount__cp-history-pending" />
              </div>
            </div>
          </div>
        </div>

        {/* Payment history table */}
        <div className="flex-1 overflow-y-auto">
          {historyBody}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E8EAEF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: '#3F3F50' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M18 9v6"/></svg>
            {payments.length} {getCountLabel(isSales, payments.length, ui)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              data-testid="InvoicePaymentHistoryModal__cerrar-btn"
              style={{ fontSize: 14, lineHeight: '24px', fontWeight: 500, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', background: 'none', color: '#121217', cursor: 'pointer' }}
            >
              {ui('cancel')}
            </button>
            {canAddPayment && (
              <button
                type="button"
                onClick={() => { setEditingPayment(null); setShowPaymentModal(true); }}
                data-testid="InvoicePaymentHistoryModal__add-btn"
                className="bg-[#121217] text-white hover:bg-[#FFD500] hover:text-[#121217] transition-colors"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '24px', fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', outline: 'none', cursor: 'pointer' }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                {isSales ? ui('addCobro') : ui('addPago')}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Step 2: new payment creation modal */}
      {showPaymentModal && createPortal(
        <NewPaymentEntryModal
          dir={isSales ? 'in' : 'out'}
          specName={specName}
          invoiceId={invoiceId}
          invoiceData={invoiceData}
          outstanding={outstandingAmt}
          apiBaseUrl={apiBaseUrl}
          payment={editingPayment}
          onClose={() => { setShowPaymentModal(false); setEditingPayment(null); }}
          onSaved={handlePaymentRegistered}
          data-testid="NewPaymentEntryModal__b82d4f" />,
        document.body,
      )}
      {/* Draft delete confirmation */}
      {deletingPayment && createPortal(
        <DeleteDraftConfirm
          payment={deletingPayment}
          isSales={isSales}
          currency={currency}
          deleting={isDeleting}
          error={deleteError}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          ui={ui}
          data-testid="DeleteDraftConfirm__b82d4f" />,
        document.body,
      )}
    </div>
  );
}
