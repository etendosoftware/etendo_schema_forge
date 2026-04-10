import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  RPAP: 'Awaiting Payment', RPPC: 'Payment Cleared', RPR: 'Payment Received',
  RDNC: 'Deposited not Cleared', RPVOID: 'Voided', PPM: 'Payment Made',
};

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  if (curr) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(n);
    } catch { /* fallback if currency code is invalid */ }
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BADGE_STYLES = {
  paid:    { bg: '#d1fae5', color: '#065f46', dot: '#10b981', accent: '#10b981' },
  partial: { bg: '#dbeafe', color: '#1e3a5f', dot: '#3b82f6', accent: '#3b82f6' },
  overdue: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', accent: '#ef4444' },
  pending: { bg: '#fef3c7', color: '#78350f', dot: '#f59e0b', accent: '#f59e0b' },
};

/**
 * Returns the payment direction prefix for a given specName.
 * sales-invoice -> payment-in
 * purchase-invoice -> payment-out
 */
function paymentPrefix(specName) {
  return specName === 'purchase-invoice' ? 'payment-out' : 'payment-in';
}

// ─── PAYMENT REGISTER FORM ──────────────────────────────────────────────────

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
 *   base         — string, API root URL (without spec name, e.g. http://host/sws/neo)
 *   headers      — object, HTTP headers including Authorization
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
  base,
  headers,
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

  useEffect(() => {
    (async () => {
      try {
        let mapped = [];

        const res = await fetch(
          `${base}/${specName}/header/${invoiceId}/action/invoiceAccounts`,
          { method: 'POST', headers, body: '{}' },
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
  }, [base, headers, invoiceId, specName]);

  const amountExceeded = amount > outstanding;

  const handleSubmit = async () => {
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return; }
    if (amountExceeded) return;
    if (!accountId) { setError('Select an account'); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `${base}/${specName}/header/${invoiceId}/action/registerPayment`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            scheduleId,
            actual_payment: String(amount),
            payment_date: date,
            fin_financial_account_id: accountId,
          }),
        },
      );
      const resJson = await res.json().catch(() => null);
      if (!res.ok) throw new Error(resJson?.response?.message || resJson?.message || `Failed (${res.status})`);
      if (resJson?.response?.error || resJson?.response?.status === -1) {
        throw new Error(resJson?.response?.error?.message || resJson?.response?.message?.text || 'Payment failed');
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
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm tabular-nums"
            style={{ width: '100%', border: '0.5px solid #E5E7EB', borderRadius: 4, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Amount ({currency})</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} className="text-sm tabular-nums"
            style={{ width: '100%', border: '0.5px solid #E5E7EB', borderRadius: 4, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#92400e', marginTop: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
        Outstanding: {fmt(outstanding, currency)}
      </div>
      {amountExceeded && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>Amount exceeds outstanding</div>}
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Account</label>
        {loadingAccounts ? (
          <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>Loading...</div>
        ) : (
          <Select value={accountId} onValueChange={setAccountId} required>
            <SelectTrigger className="focus:ring-2 focus:ring-primary" style={{ height: 32, fontSize: 13 }}>
              <SelectValue placeholder="Select account..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (<SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || amountExceeded}
          style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (saving || amountExceeded) ? 'not-allowed' : 'pointer', opacity: (saving || amountExceeded) ? 0.4 : 1 }}>
          {saving ? 'Processing...' : 'Confirm payment'}
        </button>
      </div>
    </div>
  );
}

// ─── INVOICE PAYMENT MODAL ──────────────────────────────────────────────────

/**
 * InvoicePaymentModal — installment-aware payment modal, shared across invoice types.
 *
 * Shows per-installment breakdown, existing payment history, and payment registration form.
 * Parameterized by specName so it works for both sales-invoice and purchase-invoice.
 *
 * Props:
 *   invoiceId   — string, the invoice record ID
 *   invoiceData — object, full invoice record (amounts, currency, bp, etc.)
 *   specName    — "sales-invoice" | "purchase-invoice"
 *   token       — string, auth token
 *   apiBaseUrl  — string, full base URL including spec, e.g. http://host/sws/neo/sales-invoice
 *   onClose     — callback
 */
export default function InvoicePaymentModal({
  invoiceId,
  invoiceData,
  specName,
  token,
  apiBaseUrl,
  onClose,
}) {
  // Strip the spec name suffix to get the API root (e.g. http://host/sws/neo)
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const currency = invoiceData?.['currency$_identifier'] || '';
  const grandTotal = invoiceData?.grandTotalAmount ?? 0;
  const isCompleted = invoiceData?.documentStatus === 'CO';
  const paymentMethodName = invoiceData?.['paymentMethod$_identifier'] || '';
  const docNo = invoiceData?.documentNo || '';

  const [localInstallments, setLocalInstallments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [activeFormScheduleId, setActiveFormScheduleId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  const localPaid = useMemo(
    () => localInstallments.reduce((s, i) => s + (parseFloat(i.paidAmount) || 0), 0),
    [localInstallments],
  );
  const localOutstanding = useMemo(
    () => localInstallments.reduce((s, i) => s + (parseFloat(i.outstandingAmount) || 0), 0),
    [localInstallments],
  );
  const localTotal = useMemo(
    () => localInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [localInstallments],
  );

  const fetchPayments = useCallback(async () => {
    if (!invoiceId || !base) return;
    try {
      const res = await fetch(
        `${base}/${specName}/header/${invoiceId}/action/invoicePayments`,
        { method: 'POST', headers, body: '{}' },
      );
      if (res.ok) setPayments((await res.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoadingPayments(false); }
  }, [base, headers, invoiceId, specName]);

  const fetchInstallments = useCallback(async () => {
    if (!invoiceId || !base) { setLoadingInstallments(false); return; }
    try {
      const res = await fetch(
        `${base}/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=50`,
        { headers },
      );
      if (res.ok) setLocalInstallments((await res.json())?.response?.data || []);
    } catch { /* silent */ }
    finally { setLoadingInstallments(false); }
  }, [base, headers, invoiceId, specName]);

  useEffect(() => {
    fetchInstallments();
    fetchPayments();
  }, [fetchInstallments, fetchPayments]);

  const fullyPaid = localOutstanding <= 0;

  const navToPayment = (id) => {
    const prefix = paymentPrefix(specName);
    const bp = window.location.pathname.replace(new RegExp(`\\/${specName}\\/.*$`), '');
    window.location.href = `${bp}/${prefix}/${id}`;
  };

  const handlePaymentSuccess = (paymentData, accountName, scheduleId) => {
    setActiveFormScheduleId(null);
    setHighlightId(paymentData?.id);
    setConfirmation({
      id: paymentData?.id,
      documentNo: paymentData?.documentNo,
      amount: parseFloat(paymentData?.amount || 0),
      accountName: accountName || '',
    });
    setLoadingPayments(true);
    fetchPayments();
    fetchInstallments();
  };

  const sorted = useMemo(
    () => [...localInstallments].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
      const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
      return da - db;
    }),
    [localInstallments],
  );

  const isLoading = loadingInstallments || loadingPayments;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg max-h-[80vh] flex flex-col overflow-hidden"
        style={{ width: 440, border: '0.5px solid #E5E7EB' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Invoice #{docNo}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>Payments</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '0.5px solid #E5E7EB', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Summary */}
        <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #d1d5db', background: '#F8F9FA' }}>
          <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 500, color: '#111827' }}>
            {fmt(localTotal || grandTotal, currency)}
          </div>
          <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#10b981' }}>Paid {fmt(localPaid, currency)}</span>
            <span style={{ color: '#9ca3af' }}>&middot;</span>
            <span style={{ color: localOutstanding > 0 ? '#f59e0b' : '#9ca3af' }}>
              Outstanding {fmt(localOutstanding, currency)}
            </span>
          </div>
        </div>

        {/* Scrollable content — per installment */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 12px 16px' }}>
          {isLoading ? (
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map((inst, idx) => {
                const scheduleId = inst.finPaymentScheduleID || inst.id;
                const instOutstanding = parseFloat(inst.outstandingAmount) || 0;
                const instPaid = parseFloat(inst.paidAmount) || 0;
                const instAmount = parseFloat(inst.amount) || 0;
                const status = instOutstanding <= 0 ? 'paid' : (instPaid > 0 ? 'partial' : 'pending');
                const badgeStyle = BADGE_STYLES[status];
                const isFormOpen = activeFormScheduleId === scheduleId;
                // Only first installment shows payments (same behavior as source)
                const instPayments = idx === 0 ? payments : [];

                return (
                  <div key={scheduleId} style={{ border: '0.5px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#F8F9FA', flexWrap: 'wrap', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Installment {idx + 1}</span>
                        <span style={{ color: '#d1d5db' }}>&middot;</span>
                        <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{fmt(instAmount, currency)}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {Math.round(instAmount / (localTotal || grandTotal || 1) * 100)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="tabular-nums" style={{ fontSize: 11, color: '#6B7280' }}>{fmtDate(inst.dueDate)}</span>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 9999, backgroundColor: badgeStyle.bg, color: badgeStyle.color }}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ borderTop: '0.5px solid #d1d5db', background: '#fff' }}>
                      {/* Payments for this installment */}
                      {instPayments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {instPayments.map(p => {
                            const pStatus = p.status || '';
                            const isPaid = ['RPR', 'RPPC', 'RDNC', 'PPM'].includes(pStatus);
                            const pBadge = isPaid ? BADGE_STYLES.paid : BADGE_STYLES.pending;
                            const isNew = p.id === highlightId;
                            const rawAcctName = p.accountName || p['account$_identifier'] || '';
                            const acctCurrency = p.accountCurrency || '';
                            const acctLabel = rawAcctName ? (acctCurrency ? `${rawAcctName} \u00b7 ${acctCurrency}` : rawAcctName) : '';
                            return (
                              <div key={p.id} style={{ padding: '8px 14px', borderBottom: '0.5px solid #f3f4f6', background: isNew ? '#f0fdf4' : '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 500 }}>{fmt(p.amount, currency)}</span>
                                    <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 9999, backgroundColor: pBadge.bg, color: pBadge.color }}>
                                      {isPaid ? 'Paid' : 'Pending'}
                                    </span>
                                    <span className="tabular-nums" style={{ fontSize: 11, color: '#6B7280' }}>{fmtDate(p.paymentDate)}</span>
                                  </div>
                                  <button type="button" onClick={() => navToPayment(p.id)}
                                    style={{ fontSize: 11, fontWeight: 500, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    View &rarr;
                                  </button>
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  #{p.documentNo || p.id}{acctLabel ? ` \u00b7 ${acctLabel}` : ''}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Register button */}
                      {instOutstanding > 0 && isCompleted && !isFormOpen && !confirmation && (
                        <div style={{ padding: '10px 14px' }}>
                          <button
                            type="button"
                            onClick={() => setActiveFormScheduleId(scheduleId)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '0.5px dashed #d1d5db', background: 'transparent', fontSize: 12, color: '#6B7280', cursor: 'pointer', textAlign: 'center' }}
                          >
                            + Register payment &middot; {fmt(instOutstanding, currency)} outstanding
                          </button>
                        </div>
                      )}

                      {/* Register form */}
                      {isFormOpen && (
                        <div style={{ padding: '10px 14px' }}>
                          <PaymentRegisterForm
                            invoiceId={invoiceId}
                            invoiceData={invoiceData}
                            scheduleId={scheduleId}
                            outstanding={instOutstanding}
                            currency={currency}
                            specName={specName}
                            base={base}
                            headers={headers}
                            onCancel={() => setActiveFormScheduleId(null)}
                            onSuccess={(pd, an) => handlePaymentSuccess(pd, an, scheduleId)}
                          />
                        </div>
                      )}

                      {/* Empty state for paid installments with no payment data */}
                      {instPayments.length === 0 && instOutstanding <= 0 && (
                        <div style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>Fully paid</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirmation block */}
          {confirmation && (
            <div style={{ marginTop: 12, textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d1fae5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                {fullyPaid ? 'Invoice fully paid' : 'Payment registered'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#f3f4f6', color: '#374151' }}>
                  {fmt(confirmation.amount, currency)}
                </span>
                {paymentMethodName && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#f3f4f6', color: '#374151' }}>
                    {paymentMethodName}
                  </span>
                )}
                {confirmation.accountName && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#f3f4f6', color: '#374151' }}>
                    {confirmation.accountName}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: confirmation ? 'space-between' : 'flex-end', background: '#fff', borderTop: '0.5px solid #d1d5db', padding: '10px 14px' }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '0.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
            Close
          </button>
          {confirmation && (
            <button type="button" onClick={() => navToPayment(confirmation.id)}
              style={{ fontSize: 13, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: 'pointer' }}>
              View payment &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
