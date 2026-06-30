import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';
import { DirBadge } from './paymentModalUi.jsx';
import { trackDocumentCreated } from '@/lib/observability/health-events.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────

// APRM payment statuses considered "deposited" (processed against an account).
const DEPOSITED_STATUSES = ['RPR', 'RPPC', 'RDNC', 'PPM'];

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'USD', n);
}

function fmtDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns the payment direction prefix for a given specName.
 * sales-invoice -> payment-in
 * purchase-invoice -> payment-out
 */
function paymentPrefix(specName) {
  return specName === 'purchase-invoice' ? 'payment-out' : 'payment-in';
}

/** True when a listed payment has been processed/deposited. */
function isDeposited(p) {
  if (typeof p.processed === 'boolean') return p.processed;
  return DEPOSITED_STATUSES.includes(p.status || '');
}

/** Toast message after a save: draft saved, or deposited (by direction). */
function savedToastMessage(state, isReceipt, ui) {
  if (state !== 'deposited') return ui('cpDraftSaved');
  return isReceipt ? ui('cpCollectionDeposited') : ui('cpPaymentDeposited');
}

// ─── PAYMENT REGISTER FORM ──────────────────────────────────────────────────
// Retained for backward compatibility and standalone use (and its validation
// test). The two-step Cobros/Pagos flow uses NewPaymentEntryModal instead.

/**
 * PaymentRegisterForm — form to register a single payment against an installment.
 *
 * Props:
 *   invoiceId    — string, the invoice record ID
 *   invoiceData  — object, full invoice record
 *   scheduleId   — string, the payment schedule ID for this installment
 *   outstanding  — number, outstanding amount for this installment
 *   currency     — string, ISO currency code
 *   specName     — "sales-invoice" | "purchase-invoice"
 *   apiFetch     — function, authenticated API request helper
 *   onCancel     — callback
 *   onSuccess    — callback(paymentData, accountName)
 */
export function PaymentRegisterForm({
  invoiceId,
  invoiceData,
  scheduleId,
  outstanding,
  currency,
  specName,
  apiFetch,
  onCancel,
  onSuccess,
}) {
  const [amount, setAmount] = useState(outstanding);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [invalidField, setInvalidField] = useState(null);
  const ui = useUI();

  useEffect(() => {
    (async () => {
      try {
        let mapped = [];

        const res = await apiFetch(
          `/${specName}/header/${invoiceId}/action/invoiceAccounts`,
          { method: 'POST', body: '{}' },
        );
        if (res.ok) {
          const json = await res.json();
          const items = json.items || [];
          mapped = items.map(a => ({ id: a.id, name: a.label || a.name, currency: a.currency }));
        }

        setAccounts(mapped);
        if (mapped.length > 0) {
          setAccountId(mapped[0].id);
        }
      } catch { /* silent */ }
      finally { setLoadingAccounts(false); }
    })();
  }, [apiFetch, invoiceId, specName]);

  const amountExceeded = amount > outstanding;

  const handleSubmit = async () => {
    if (!date) { setInvalidField('date'); setError(ui('paymentDateRequired')); return; }
    if (!amount || amount <= 0) { setInvalidField('amount'); setError(ui('paymentAmountInvalid')); return; }
    if (amountExceeded) return;
    if (!accountId) { setInvalidField('account'); setError(ui('paymentAccountRequired')); return; }
    setInvalidField(null);
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch(
        `/${specName}/header/${invoiceId}/action/registerPayment`,
        {
          method: 'POST',
          body: JSON.stringify({
            scheduleId,
            actual_payment: String(amount),
            payment_date: date,
            fin_financial_account_id: accountId,
          }),
        },
      );
      const resJson = await res.json().catch(() => null);
      if (!res.ok) throw new Error(resJson?.response?.message || resJson?.message || ui('paymentRequestFailed'));
      if (resJson?.response?.error || resJson?.response?.status === -1) {
        throw new Error(resJson?.response?.error?.message || resJson?.response?.message?.text || ui('paymentRequestFailed'));
      }
      const paymentData = resJson?.response?.data || {};
      const selectedAccount = accounts.find(a => a.id === accountId);
      onSuccess(paymentData, selectedAccount?.name || '');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 4, marginBottom: 4, border: '0.5px solid #E5E7EB', borderRadius: 8, padding: 12, background: '#FAFBFC' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>
            {ui('paymentDate')} <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <DateField
            value={date}
            onChange={(v) => { setDate(v); if (invalidField === 'date') setInvalidField(null); }}
            className={invalidField === 'date' ? 'border-red-500 focus-within:ring-red-500' : ''}
            data-testid="DateField__284351" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('paymentAmount')} ({currency})</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} className="text-sm tabular-nums"
            style={{ width: '100%', border: '0.5px solid #E5E7EB', borderRadius: 4, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#92400e', marginTop: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
        {ui('outstandingLabel')}: {fmt(outstanding, currency)}
      </div>
      {amountExceeded && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>{ui('amountExceedsOutstanding')}</div>}
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('paymentAccount')}</label>
        {loadingAccounts ? (
          <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>{ui('loading')}</div>
        ) : (
          <Select
            value={accountId}
            onValueChange={setAccountId}
            required
            data-testid="Select__284351">
            <SelectTrigger
              className="focus:ring-2 focus:ring-primary"
              style={{ height: 32, fontSize: 13 }}
              data-testid="SelectTrigger__284351">
              <SelectValue placeholder={ui('selectAccount')} data-testid="SelectValue__284351" />
            </SelectTrigger>
            <SelectContent data-testid="SelectContent__284351">
              {accounts.map(acc => (<SelectItem key={acc.id} value={acc.id} data-testid="SelectItem__284351">{acc.name}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
          {ui('cancel')}
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || amountExceeded || !date}
          style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (saving || amountExceeded || !date) ? 'not-allowed' : 'pointer', opacity: (saving || amountExceeded || !date) ? 0.4 : 1 }}>
          {saving ? ui('processing') : ui('confirmPayment')}
        </button>
      </div>
    </div>
  );
}

// ─── INVOICE PAYMENT MODAL (Paso 1 — Cobros/Pagos de la factura) ─────────────

const INK = '#121217';
const GREEN_FG = '#17663A';
const GREEN_BG = '#E2F7EA';
const AMBER = '#A37700';

/** Renders the history body: loading, empty state, or the movements list. */
function MovementsBody({ isLoading, payments, emptyLabel, currency, ui, onView }) {
  if (isLoading) {
    return (
      <div style={{ font: '400 13px/18px Inter', color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>{ui('loading')}</div>
    );
  }
  if (payments.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '36px 0' }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F1F2F4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></svg>
        </div>
        <div style={{ font: '400 13px/18px Inter', color: '#6C6C89', textAlign: 'center' }}>{emptyLabel}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {payments.map(p => {
        const deposited = isDeposited(p);
        const badge = deposited
          ? { bg: GREEN_BG, fg: GREEN_FG, label: ui('cpStatusDeposited') }
          : { bg: '#F1F2F4', fg: '#55556D', label: ui('cpStatusDraft') };
        const method = p.paymentMethod || p['paymentMethod$_identifier'] || '';
        return (
          <div key={p.id} data-testid={`cp-movement-${p.id}`} style={{ border: '1px solid #E8E8ED', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="tabular-nums" style={{ font: '600 14px/18px Inter', color: INK }}>{fmt(p.amount, currency)}</span>
                <span style={{ font: '500 10px/14px Inter', padding: '1px 8px', borderRadius: 9999, background: badge.bg, color: badge.fg }}>{badge.label}</span>
              </div>
              <button type="button" onClick={() => onView(p.id)}
                style={{ font: '500 11px/1 Inter', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {ui('viewArrow')}
              </button>
            </div>
            <div style={{ font: '400 11px/15px Inter', color: '#9ca3af', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              #{p.documentNo || p.id}{method ? ` · ${method}` : ''} · {fmtDate(p.paymentDate)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * InvoicePaymentModal — step 1 of the two-step Cobros/Pagos flow.
 *
 * Shows the invoice's collection/payment history ("Cobros/Pagos de la factura")
 * with total + pending stats, and a "+ Añadir cobro/pago" button that opens
 * NewPaymentEntryModal (step 2). Parameterized by specName so it works for both
 * sales-invoice (cobro / dir 'in') and purchase-invoice (pago / dir 'out').
 *
 * Props:
 *   invoiceId   — string, the invoice record ID
 *   invoiceData — object, full invoice record (amounts, currency, bp, etc.)
 *   specName    — "sales-invoice" | "purchase-invoice"
 *   apiBaseUrl  — string, full base URL including spec
 *   onClose     — callback
 *   onPaymentAdded — callback after a payment is saved/confirmed
 */
export default function InvoicePaymentModal({
  invoiceId,
  invoiceData,
  specName,
  apiBaseUrl,
  onClose,
  onPaymentAdded,
}) {
  const ui = useUI();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const isReceipt = specName !== 'purchase-invoice';
  const dir = isReceipt ? 'in' : 'out';

  const currency = invoiceData?.['currency$_identifier'] || '';
  const grandTotal = parseFloat(invoiceData?.grandTotalAmount) || 0;
  const isCompleted = invoiceData?.documentStatus === 'CO';
  const party = invoiceData?.['businessPartner$_identifier'] || '';
  const docNo = invoiceData?.documentNo || '';

  const [payments, setPayments] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const outstanding = useMemo(
    () => installments.reduce((s, i) => s + (parseFloat(i.outstandingAmount) || 0), 0),
    [installments],
  );
  const totalAmount = useMemo(() => {
    const t = installments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return t || grandTotal;
  }, [installments, grandTotal]);

  const fetchPayments = useCallback(async () => {
    if (!invoiceId || !base) { setLoadingPayments(false); return; }
    try {
      const res = await apiFetch(
        `/${specName}/header/${invoiceId}/action/invoicePayments`,
        { method: 'POST', body: '{}' },
      );
      if (res.ok) setPayments((await res.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoadingPayments(false); }
  }, [apiFetch, base, invoiceId, specName]);

  const fetchInstallments = useCallback(async () => {
    if (!invoiceId || !base) { setLoadingInstallments(false); return; }
    try {
      const res = await apiFetch(`/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=50`);
      if (res.ok) setInstallments((await res.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoadingInstallments(false); }
  }, [apiFetch, base, invoiceId, specName]);

  useEffect(() => {
    fetchPayments();
    fetchInstallments();
  }, [fetchPayments, fetchInstallments]);

  const pendingScheduleId = useMemo(() => {
    const sorted = [...installments].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
      const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
      return da - db;
    });
    const p = sorted.find(i => parseFloat(i.outstandingAmount) > 0) || sorted[0];
    return p ? (p.finPaymentScheduleID || p.id) : '';
  }, [installments]);

  const navToPayment = (id) => {
    window.location.href = `/${paymentPrefix(specName)}/${id}`;
  };

  const handleSaved = (result, state) => {
    setShowNew(false);
    trackDocumentCreated(specName === 'purchase-invoice' ? 'payment-out' : 'payment-in');
    setLoadingPayments(true);
    fetchPayments();
    fetchInstallments();
    onPaymentAdded?.();
    const msg = savedToastMessage(state, isReceipt, ui);
    window.dispatchEvent(new CustomEvent('neo:toast', { detail: { type: 'success', message: msg } }));
  };

  const isLoading = loadingPayments || loadingInstallments;
  const canAdd = isCompleted && outstanding > 0;
  const count = payments.length;
  const countLabel = isReceipt
    ? ui('cpCollectionsRegisteredCount', { count })
    : ui('cpPaymentsRegisteredCount', { count });
  const addLabel = isReceipt ? ui('cpAddCollection') : ui('cpAddPayment');
  const title = isReceipt ? ui('cpCollectionsOfInvoice') : ui('cpPaymentsOfInvoice');
  const emptyLabel = isReceipt ? ui('cpNoCollectionsYet') : ui('cpNoPaymentsYet');

  return (
    <>
      {!showNew && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(16,20,28,.46)', padding: 24 }} onClick={onClose}>
        <div
          className="bg-white flex flex-col overflow-hidden"
          style={{ width: 520, maxWidth: '100%', maxHeight: '85vh', borderRadius: 14, boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)' }}
          data-testid="cp-history-modal"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 16px', borderBottom: '1px solid #E8E8ED' }}>
            <DirBadge dir={dir} size={36} data-testid="DirBadge__284351" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, font: '700 17px/22px Inter', color: INK, letterSpacing: '-0.01em' }}>{title}</h2>
              <div style={{ font: '400 12px/16px Inter', color: '#6C6C89', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {party}{party && docNo ? ' · ' : ''}<span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#3F3F50' }}>{docNo}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label={ui('close')}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 32, padding: '14px 22px', borderBottom: '1px solid #E8E8ED', background: '#FCFCFD' }}>
            <div>
              <div style={{ font: '400 11px/14px Inter', color: '#6C6C89' }}>{ui('cpTotalAmount')}</div>
              <div className="tabular-nums" style={{ font: '700 19px/24px Inter', color: INK }}>{fmt(totalAmount, currency)}</div>
            </div>
            <div style={{ paddingLeft: 32, borderLeft: '1px solid #E8E8ED' }}>
              <div style={{ font: '400 11px/14px Inter', color: '#6C6C89' }}>{ui('pendingBalanceLabel')}</div>
              <div className="tabular-nums" style={{ font: '700 19px/24px Inter', color: outstanding > 0 ? AMBER : GREEN_FG }}>{fmt(outstanding, currency)}</div>
            </div>
          </div>

          {/* Body — movements list / empty state */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '14px 22px' }}>
            <MovementsBody
              isLoading={isLoading}
              payments={payments}
              emptyLabel={emptyLabel}
              currency={currency}
              ui={ui}
              onView={navToPayment}
              data-testid="MovementsBody__284351" />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 22px', borderTop: '1px solid #E8E8ED', background: '#fff' }}>
            <span style={{ font: '400 12px/16px Inter', color: '#9ca3af' }}>{countLabel}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={onClose}
                style={{ font: '500 13px/1 Inter', padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D1DB', background: '#fff', color: '#3F3F50', cursor: 'pointer' }}>
                {ui('close')}
              </button>
              {canAdd && (
                <button type="button" data-testid="cp-add-payment" onClick={() => setShowNew(true)}
                  style={{ font: '600 13px/1 Inter', padding: '8px 16px', borderRadius: 8, border: 'none', background: INK, color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>{addLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
      {showNew && (
        <NewPaymentEntryModal
          dir={dir}
          specName={specName}
          invoiceId={invoiceId}
          invoiceData={invoiceData}
          scheduleId={pendingScheduleId}
          outstanding={outstanding}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowNew(false)}
          onSaved={handleSaved}
          data-testid="NewPaymentEntryModal__284351" />
      )}
    </>
  );
}
