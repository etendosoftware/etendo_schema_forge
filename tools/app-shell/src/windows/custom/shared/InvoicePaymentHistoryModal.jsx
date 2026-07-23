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
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: currency || 'EUR', currencyDisplay: 'narrowSymbol',
  }).format(n);
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
          background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
          fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-success-fg)', flexShrink: 0 }} />
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
        background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
        fontSize: 12, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--text-disabled))', flexShrink: 0 }} />
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
  return <span style={{ display: 'inline-flex', color: 'hsl(var(--text-disabled))' }}>{icon}</span>;
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
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', color: 'hsl(var(--destructive))', cursor: 'pointer', flexShrink: 0 }}
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30"
      onClick={onCancel}
      data-testid="InvoicePaymentHistoryModal__delete-confirm-backdrop"
    >
      <div
        className="bg-card flex flex-col"
        style={{ width: 380, maxWidth: '100%', borderRadius: 12, boxShadow: '0 20px 50px hsl(var(--foreground) / 0.18), 0 0 0 1px hsl(var(--foreground) / 0.06)', padding: 20, gap: 12, display: 'flex' }}
        onClick={e => e.stopPropagation()}
        data-testid="InvoicePaymentHistoryModal__delete-confirm-panel"
      >
        <div style={{ fontSize: 16, lineHeight: '22px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {isSales ? ui('cpDeleteCollectionTitle') : ui('cpDeletePaymentTitle')}
        </div>
        <div style={{ fontSize: 13, lineHeight: '19px', color: 'hsl(var(--muted-foreground))' }}>
          {ui('cpDeleteDraftConfirm', { doc: payment.documentNo || payment.id, amount: fmtAmount(payment.amount, currency) })}
        </div>
        {error && <div style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            data-testid="InvoicePaymentHistoryModal__delete-cancel-btn"
            style={{ fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', background: 'none', color: 'hsl(var(--foreground))', cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            data-testid="InvoicePaymentHistoryModal__delete-confirm-btn"
            style={{ fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 360, border: 'none', background: 'hsl(var(--destructive))', color: 'hsl(var(--card))', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
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

function getOutstandingAmount({ isCreditInstrument, installments, fallbackOutstanding }) {
  const installmentTotal = installments.reduce((sum, installment) => {
    const rawAmount = Number(installment.outstandingAmount ?? 0);
    return sum + (isCreditInstrument ? rawAmount : Math.max(0, rawAmount));
  }, 0);

  if (installments.length === 0) {
    return parseFloat(fallbackOutstanding ?? 0);
  }

  return isCreditInstrument ? Math.abs(installmentTotal) : installmentTotal;
}

function getRowAmountMeta({ isCreditInstrument, payment, isSales }) {
  const isConsumption = isCreditInstrument && payment.appliedToInvoice != null;
  if (isConsumption) {
    return {
      rowValue: Math.abs(Number(payment.appliedToInvoice)),
      amountSign: '− ',
      amountColor: 'hsl(var(--destructive))',
      amountClassName: 'text-[hsl(var(--destructive))]',
    };
  }

  if (isSales) {
    return {
      rowValue: payment.amount,
      amountSign: '+ ',
      amountColor: 'var(--status-success-fg)',
      amountClassName: 'text-[var(--status-success-fg)]',
    };
  }

  return {
    rowValue: payment.amount,
    amountSign: '− ',
    amountColor: 'hsl(var(--destructive))',
    amountClassName: 'text-[hsl(var(--destructive))]',
  };
}

function getOutstandingClassName(isCreditInstrument, outstandingAmt) {
  if (isCreditInstrument) {
    return 'text-[hsl(var(--primary))]';
  }
  return outstandingAmt > 0 ? 'text-[var(--status-warning-fg)]' : 'text-[var(--status-success-fg)]';
}

function PaymentHistoryBody({
  loading,
  payments,
  grid,
  headerCellStyle,
  ui,
  isSales,
  handleRowClick,
  handleDeleteClick,
  isCreditInstrument,
  currency,
}) {
  if (loading) {
    return (
      <div data-testid="InvoicePaymentHistoryModal__skeleton">
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '8px 24px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
          <div style={headerCellStyle}>{ui('documentNo')}</div>
          <div style={headerCellStyle}>{ui('date')}</div>
          <div style={headerCellStyle}>{ui('paymentMethodCol')}</div>
          <div style={headerCellStyle}>{ui('statusLabel')}</div>
          <div style={{ ...headerCellStyle, textAlign: 'right' }}>{ui('amount')}</div>
          <div />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '11px 24px', borderBottom: '1px solid hsl(var(--muted))', alignItems: 'center', opacity: 1 - i * 0.2 }}
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
  }

  if (payments.length === 0) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10 }}
        data-testid="InvoicePaymentHistoryModal__empty"
      >
        <div style={{ width: 48, height: 48, borderRadius: 8, background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', flexShrink: 0 }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        </div>
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', margin: 0 }}>
          {isSales ? ui('noCobroYet') : ui('noPagoYet')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '8px 24px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
        <div style={headerCellStyle}>{ui('documentNo')}</div>
        <div style={headerCellStyle}>{ui('date')}</div>
        <div style={headerCellStyle}>{ui('paymentMethodCol')}</div>
        <div style={headerCellStyle}>{ui('statusLabel')}</div>
        <div style={{ ...headerCellStyle, textAlign: 'right' }}>{ui('amount')}</div>
        <div />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="InvoicePaymentHistoryModal__list">
        {payments.map((payment) => {
          const methodRaw = payment['paymentMethod$_identifier'] || payment.paymentMethod || '';
          const methodKey = methodRaw.toLowerCase().replace(/transferencia|transfer/,'transfer').replace(/tarjeta|card/,'card').replace(/efectivo|cash/,'cash').replace(/domiciliaci[oó]n|direct/,'direct');
          const { rowValue, amountSign, amountColor, amountClassName } = getRowAmountMeta({
            isCreditInstrument,
            payment,
            isSales,
          });

          return (
            <div
              key={payment.id}
              onClick={() => handleRowClick(payment)}
              className="hover-row"
              style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '11px 24px', borderBottom: '1px solid hsl(var(--muted))', alignItems: 'center', cursor: 'pointer' }}
              data-testid="InvoicePaymentHistoryModal__row"
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {payment.documentNo || payment.id}
              </div>
              <div className="tabular-nums" style={{ fontSize: 14, color: 'hsl(var(--foreground))' }}>
                {fmtDate(payment.paymentDate)}
              </div>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', padding: '2px 8px', borderRadius: 360, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', fontSize: 12, lineHeight: '16px' }}>
                  <MethodIcon method={methodKey} data-testid="MethodIcon__b82d4f" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{methodRaw || '—'}</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <PaymentStateTag
                  status={payment.status || ''}
                  processed={payment.processed}
                  isSales={isSales}
                  ui={ui}
                  data-testid="PaymentStateTag__b82d4f" />
              </div>
              <div className="tabular-nums" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: amountColor, whiteSpace: 'nowrap' }}>
                {amountSign}<MoneyAmount value={rowValue} currency={currency} tone="neutral" className={amountClassName} currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-history-row" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {!isProcessed(payment) && (
                  <DeleteDraftButton onClick={(e) => handleDeleteClick(e, payment)} ui={ui} data-testid="DeleteDraftButton__b82d4f" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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

  // Credit instruments (credit notes / returns) carry negative totals end to end. Their
  // history lists the payments that CONSUMED the note (showing how much each one used),
  // the pending widget becomes the remaining "saldo a favor", and no new payment can be
  // registered against them.
  const isCreditInstrument = grandTotal < 0;

  const [payments, setPayments] = useState([]);
  // Payment plan installments — the source of truth for the outstanding amount once
  // loaded, since `invoiceData.outstandingAmount` is a snapshot from when the modal
  // opened and never updates after a payment is registered in this same session.
  const [installments, setInstallments] = useState([]);
  const outstandingAmt = getOutstandingAmount({
    isCreditInstrument,
    installments,
    fallbackOutstanding: invoiceData?.outstandingAmount,
  });
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
  // A credit note's remaining balance is consumed FROM other payments, never paid into.
  const canAddPayment = !isCreditInstrument && outstandingAmt > 0 && isCompleted;

  // Table layout: Nº documento · Fecha · Método · Estado · Importe (right) · trash (draft-only).
  // 760px modal − 48px side padding − 60px column gaps (5 gaps) = 652px to distribute.
  // Fixed columns: Fecha 110 + Método 170 + Estado 150 + Importe 110 + trash 28 = 568px.
  // 1fr (Nº documento) = 652 − 568 = 84px — enough for typical doc numbers.
  const GRID = '1fr 110px 170px 150px 110px 28px';
  const HCELL = { fontSize: 12, lineHeight: '16px', fontWeight: 600, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30"
      style={{ padding: 24 }}
      onClick={handleClose}
      data-testid="InvoicePaymentHistoryModal__backdrop"
    >
      <div
        className="bg-card flex flex-col"
        style={{ width: 760, maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 0 0 1px hsl(var(--foreground) / 0.1), 0 24px 48px hsl(var(--foreground) / 0.03), 0 10px 18px hsl(var(--foreground) / 0.03), 0 5px 8px hsl(var(--foreground) / 0.04), 0 2px 4px hsl(var(--foreground) / 0.04)', overflow: 'hidden' }}
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
            style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 360, border: 'none', outline: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--text-disabled))', fontSize: 20, lineHeight: 1 }}
          >
            &times;
          </button>
          <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</div>
          {docNo && (
            <span style={{ fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--muted))', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
              {docNo}
            </span>
          )}
        </div>

        {/* Summary widget — Cliente/Proveedor · Importe total · Saldo pendiente */}
        <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid hsl(var(--border-subtle))', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>{partyLabel}</div>
              <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName || '—'}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>{ui('importeTotal')}</div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500 }}>
                <MoneyAmount value={grandTotal} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-history-total" />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>
                {isCreditInstrument ? ui('cpFavorBadge') : ui('saldoPendiente')}
              </div>
              <div className="tabular-nums" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500 }}>
                <MoneyAmount
                  value={outstandingAmt}
                  currency={currency}
                  tone="neutral"
                  className={getOutstandingClassName(isCreditInstrument, outstandingAmt)}
                  currencyDisplay="narrowSymbol"
                  data-testid="MoneyAmount__cp-history-pending" />
              </div>
            </div>
          </div>
        </div>

        {/* Payment history table */}
        <div className="flex-1 overflow-y-auto">
          <PaymentHistoryBody
            loading={loading}
            payments={payments}
            grid={GRID}
            headerCellStyle={HCELL}
            ui={ui}
            isSales={isSales}
            handleRowClick={handleRowClick}
            handleDeleteClick={handleDeleteClick}
            isCreditInstrument={isCreditInstrument}
            currency={currency}
            data-testid="PaymentHistoryBody__b82d4f" />
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-disabled))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M18 9v6"/></svg>
            {payments.length} {getCountLabel(isSales, payments.length, ui)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              data-testid="InvoicePaymentHistoryModal__cerrar-btn"
              style={{ fontSize: 14, lineHeight: '24px', fontWeight: 500, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', background: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer' }}
            >
              {ui('cancel')}
            </button>
            {canAddPayment && (
              <button
                type="button"
                onClick={() => { setEditingPayment(null); setShowPaymentModal(true); }}
                data-testid="InvoicePaymentHistoryModal__add-btn"
                className="bg-[hsl(var(--foreground))] text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] transition-colors"
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
