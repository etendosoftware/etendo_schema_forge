import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getStatusDotColor } from '@/lib/statusBadge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_LABELS = {
  RPAP: 'Awaiting Payment', RPPC: 'Payment Cleared', RPR: 'Payment Received',
  RDNC: 'Deposited not Cleared', RPVOID: 'Voided', PPM: 'Payment Made',
};

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * InvoiceTopbarExtra — payment status pill for the detail view topbar.
 *
 * PAID:    [✓ Paid | 1.108.087,75 EUR | View →]  green segmented pill
 * PENDING: [⚠ Pending | 1.108.087,75 EUR]  amber pill  +  [Register Payment] outline button
 * DRAFT:   nothing (Complete button handles it)
 */
export default function InvoiceTopbarExtra({ data, recordId, token, apiBaseUrl, api }) {
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const currency = data?.['currency$_identifier'] || '';
  const grandTotal = data?.grandTotalAmount ?? 0;
  const outstanding = data?.outstandingAmount ?? grandTotal;
  const totalPaid = grandTotal - outstanding;
  const isFullyPaid = data?.paymentComplete === true || data?.paymentComplete === 'Y' || outstanding <= 0;
  const isDraft = data?.documentStatus === 'DR';
  const isCompleted = data?.documentStatus === 'CO';

  if (!data?.documentStatus || isDraft) return null;

  const hasPaid = totalPaid > 0;
  const hasOutstanding = outstanding > 0;
  const isPaid = hasPaid && !hasOutstanding;
  const isPartial = hasPaid && hasOutstanding;
  const isPending = hasOutstanding && !hasPaid;

  return (
    <>
      {/* Paid / Partial — green pill badge */}
      {(isPaid || isPartial) && (
        <button
          type="button"
          onClick={() => setShowPaymentsModal(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer"
          style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#d1fae5', color: '#065f46' }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
          {isPaid ? 'Paid' : 'Partial'}
          <span style={{ opacity: 0.4 }}>&middot;</span>
          <span className="font-semibold tabular-nums">{fmt(totalPaid, currency)}</span>
          {isPartial && <span className="text-xs tabular-nums ml-0.5" style={{ color: '#92400e' }}>({fmt(outstanding, currency)} pending)</span>}
          <span style={{ opacity: 0.6, marginLeft: '2px' }}>View &rarr;</span>
        </button>
      )}

      {/* Pending — amber pill badge + Register Payment button */}
      {isPending && isCompleted && (
        <>
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#78350f' }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
            Pending
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{fmt(outstanding, currency)}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            style={{ padding: '4px 12px', borderRadius: '6px', borderWidth: '1px' }}
          >
            + Register Payment
          </button>
        </>
      )}

      {/* View payments modal — lazy fetch */}
      {showPaymentsModal && (
        <ViewPaymentsModal
          recordId={recordId}
          bpId={data?.businessPartner}
          grandTotal={grandTotal}
          totalPaid={totalPaid}
          outstanding={outstanding}
          currency={currency}
          base={base}
          headers={headers}
          onClose={() => setShowPaymentsModal(false)}
        />
      )}

      {/* Add payment modal */}
      {showAddModal && (
        <AddPaymentModal
          invoiceId={recordId}
          invoiceData={data}
          outstanding={outstanding}
          currency={currency}
          base={base}
          headers={headers}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            toast.success('Payment registered');
          }}
        />
      )}
    </>
  );
}

// ─── VIEW PAYMENTS MODAL (lazy fetch) ────────────────────────────

function ViewPaymentsModal({ recordId, bpId, grandTotal, totalPaid, outstanding, currency, base, headers, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const navigate = useNavigate();

  const isFullyPaid = outstanding <= 0;

  const fetchPayments = useCallback(async () => {
    if (!recordId || !bpId || !base) { setLoading(false); return; }
    try {
      const schedRes = await fetch(
        `${base}/sales-invoice/paymentPlan?parentId=${recordId}&_startRow=0&_endRow=10`,
        { headers },
      );
      const scheduleIds = new Set();
      if (schedRes.ok) {
        const schedData = (await schedRes.json())?.response?.data || [];
        for (const sched of schedData) {
          if (sched.id) scheduleIds.add(sched.id);
        }
      }

      if (scheduleIds.size === 0) { setPayments([]); setLoading(false); return; }

      const criteria = JSON.stringify([{ fieldName: 'businessPartner', operator: 'equals', value: bpId }]);
      const res = await fetch(
        `${base}/payment-in/finPayment?criteria=${encodeURIComponent(criteria)}&_startRow=0&_endRow=50&_sortBy=creationDate desc`,
        { headers },
      );
      if (!res.ok) { setLoading(false); return; }
      const allPmts = (await res.json())?.response?.data || [];
      if (allPmts.length === 0) { setPayments([]); setLoading(false); return; }

      const detailResults = await Promise.all(
        allPmts.map(pmt =>
          fetch(`${base}/payment-in/finPaymentScheduleDetail?parentId=${pmt.id}&_startRow=0&_endRow=20`, { headers })
            .then(r => r.ok ? r.json() : null)
            .then(j => ({ pmtId: pmt.id, details: j?.response?.data || [] }))
            .catch(() => ({ pmtId: pmt.id, details: [] }))
        )
      );

      const linked = [];
      for (const { pmtId, details } of detailResults) {
        const match = details.some(d =>
          scheduleIds.has(d.invoicePaymentSchedule) || scheduleIds.has(d.invoiceId)
        );
        if (match) {
          const pmt = allPmts.find(p => p.id === pmtId);
          if (pmt) linked.push({
            id: pmt.id, amount: pmt.amount, date: pmt.paymentDate,
            status: pmt.status, method: pmt['paymentMethod$_identifier'] || '',
          });
        }
      }

      setPayments(linked);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [recordId, bpId, base, headers]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const STATUS_BADGE = {
    RPPC: { label: 'Payment Cleared', bg: '#d1fae5', color: '#065f46', accent: '#86efac' },
    RPR:  { label: 'Payment Received', bg: '#d1fae5', color: '#065f46', accent: '#86efac' },
    PPM:  { label: 'Payment Made', bg: '#d1fae5', color: '#065f46', accent: '#86efac' },
    RDNC: { label: 'Deposited not Cleared', bg: '#fef3c7', color: '#78350f', accent: '#fcd34d' },
    RPAP: { label: 'Awaiting Payment', bg: '#fef3c7', color: '#78350f', accent: '#fcd34d' },
    RPVOID: { label: 'Voided', bg: '#fee2e2', color: '#991b1b', accent: '#fca5a5' },
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-lg w-[440px] max-h-[80vh] flex flex-col overflow-hidden"
          style={{ border: '0.5px solid hsl(var(--border))' }} onClick={e => e.stopPropagation()}>
          {/* Header + Summary — shared background */}
          <div style={{ background: 'hsl(var(--muted))', borderBottom: '0.5px solid hsl(var(--border))' }}>
            <h3 className="text-sm font-semibold" style={{ padding: '16px 16px 12px' }}>Payments</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div style={{ padding: '12px 16px', borderRight: '0.5px solid hsl(var(--border))', borderTop: '0.5px solid hsl(var(--border))' }}>
                <div className="text-[11px] text-muted-foreground">Invoice total</div>
                <div className="text-[13px] font-semibold tabular-nums mt-1">{fmt(grandTotal, currency)}</div>
              </div>
              <div style={{ padding: '12px 16px', borderRight: '0.5px solid hsl(var(--border))', borderTop: '0.5px solid hsl(var(--border))' }}>
                <div className="text-[11px] text-muted-foreground">Paid</div>
                <div className="text-[13px] font-semibold tabular-nums text-emerald-600 mt-1">{fmt(totalPaid, currency)}</div>
              </div>
              <div style={{ padding: '12px 16px', borderTop: '0.5px solid hsl(var(--border))' }}>
                <div className="text-[11px] text-muted-foreground">Outstanding</div>
                <div className={`text-[13px] font-semibold tabular-nums mt-1 ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(outstanding, currency)}</div>
              </div>
            </div>
          </div>

          {/* Payment list */}
          <div className="flex-1 overflow-y-auto space-y-3" style={{ padding: '16px 16px' }}>
            {loading && <p className="text-xs text-muted-foreground py-2">Loading payments...</p>}
            {!loading && payments.length === 0 && <p className="text-xs text-muted-foreground/60 py-2">No linked payments found.</p>}
            {payments.map(pmt => {
              const badge = STATUS_BADGE[pmt.status] || { label: pmt.status, bg: '#f3f4f6', color: '#374151', accent: '#d1d5db' };
              return (
                <div
                  key={pmt.id}
                  className="rounded-lg border border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                  style={{ borderWidth: '0.5px', padding: '16px', borderLeft: `3px solid ${badge.accent}` }}
                  onClick={() => { onClose(); navigate(`/payment-in/${pmt.id}`); }}
                >
                  <div className="flex items-center justify-between">
                    <span className="tabular-nums" style={{ fontSize: '18px', fontWeight: 500 }}>{fmt(pmt.amount, currency)}</span>
                    <span
                      className="text-[11px] px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: badge.bg, color: badge.color, fontWeight: 500 }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {fmtDate(pmt.date)}{pmt.method && <> &middot; {pmt.method}</>}
                  </div>
                </div>
              );
            })}

            {/* Add payment button */}
            <button
              type="button"
              disabled={isFullyPaid}
              onClick={() => setShowAddModal(true)}
              className={`w-full flex items-center justify-center gap-1 text-sm font-medium transition-colors ${
                isFullyPaid
                  ? 'cursor-not-allowed'
                  : 'hover:bg-blue-50/50 cursor-pointer'
              }`}
              style={{
                padding: '8px',
                borderRadius: '6px',
                marginTop: '4px',
                border: '1px dashed hsl(var(--border))',
                color: isFullyPaid ? 'hsl(var(--muted-foreground) / 0.3)' : '#2563eb',
                borderColor: isFullyPaid ? 'hsl(var(--border) / 0.3)' : 'hsl(var(--border))',
              }}
            >
              + Add payment
            </button>
          </div>

          {/* Close */}
          <div className="flex justify-end border-t border-border/40" style={{ borderTopWidth: '0.5px', padding: '12px 16px' }}>
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Close</button>
          </div>
        </div>
      </div>

      {/* Add payment modal */}
      {showAddModal && (
        <AddPaymentModal
          invoiceId={recordId}
          invoiceData={data}
          outstanding={outstanding}
          currency={currency}
          base={base}
          headers={headers}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            toast.success('Payment registered');
            fetchPayments();
          }}
        />
      )}
    </>
  );
}

// ─── ADD PAYMENT MODAL ───────────────────────────────────────────

function AddPaymentModal({ invoiceId, invoiceData, outstanding, currency, base, headers, onClose, onSuccess }) {
  const [amount, setAmount] = useState(outstanding);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);

  const docNo = invoiceData?.documentNo || '';
  const bpName = invoiceData?.['businessPartner$_identifier'] || '';
  const grandTotal = invoiceData?.grandTotalAmount ?? 0;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}/payment-in/finPayment/selectors/Fin_Financial_Account_ID?_startRow=0&_endRow=50`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.items || json?.response?.data || [];
          const mapped = items.map(a => ({ id: a.id, name: a.label || a._identifier || a.name }));
          setAccounts(mapped);
          if (mapped.length > 0) setAccountId(mapped[0].id);
        }
      } catch { /* silent */ }
      finally { setLoadingAccounts(false); }
    })();
  }, [base, headers]);

  const handleSubmit = async () => {
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!accountId) { toast.error('Select an account'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${base}/sales-invoice/header/${invoiceId}/action/aPRMAddpayment`, {
        method: 'POST', headers,
        body: JSON.stringify({ fieldValues: {
          amount: String(amount),
          paymentDate: date,
          fin_financial_account_id: accountId,
        } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      onSuccess();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-[380px] overflow-hidden flex flex-col"
        style={{ border: '0.5px solid hsl(var(--border))' }} onClick={e => e.stopPropagation()}>

        {/* Header — gray */}
        <div className="rounded-t-xl" style={{ background: 'hsl(var(--muted))', borderBottom: '0.5px solid hsl(var(--border))', padding: '14px 16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 500 }}>Register Payment</h3>
          {(docNo || bpName) && (
            <p className="text-muted-foreground mt-0.5" style={{ fontSize: '12px' }}>
              {docNo && <>Invoice #{docNo}</>}
              {docNo && bpName && <> &middot; </>}
              {bpName}
              {grandTotal > 0 && <> &middot; {fmt(grandTotal, currency)}</>}
            </p>
          )}
        </div>

        {/* Body — white */}
        <div className="space-y-3" style={{ padding: '16px' }}>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full mt-1 text-sm border border-border rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30" style={{ borderWidth: '0.5px' }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Amount ({currency})</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="w-full mt-1 text-sm border border-border rounded px-2.5 py-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/30" style={{ borderWidth: '0.5px' }} />
            <p className="mt-1 flex items-center gap-1" style={{ fontSize: '11px', color: '#92400e' }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f59e0b' }} />
              Outstanding: {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Account</label>
            {loadingAccounts ? (
              <div className="w-full mt-1 text-sm text-muted-foreground px-2.5 py-1.5">Loading...</div>
            ) : (
              <Select value={accountId} onValueChange={setAccountId} disabled={accounts.length <= 1} required>
                <SelectTrigger className="mt-1 focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Footer — gray */}
        <div className="flex justify-between items-center" style={{ background: 'hsl(var(--muted))', borderTop: '0.5px solid hsl(var(--border))', padding: '12px 16px' }}>
          <button type="button" onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            style={{ padding: '4px 14px', borderRadius: '6px', border: '0.5px solid hsl(var(--border))', background: 'transparent' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 transition-colors"
            style={{ padding: '4px 14px', borderRadius: '6px' }}>
            {saving ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
