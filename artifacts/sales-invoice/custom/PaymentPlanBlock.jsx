import { useState, useEffect, useMemo } from 'react';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  if (curr) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(n); } catch { /* fallback */ }
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const BADGE = {
  paid:    { bg: '#d1fae5', color: '#065f46' },
  pending: { bg: '#fef3c7', color: '#78350f' },
  partial: { bg: '#dbeafe', color: '#1e3a5f' },
};

export default function PaymentPlanBlock({ recordId, data, token, apiBaseUrl }) {
  const [installments, setInstallments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);
  const currency = data?.['currency$_identifier'] || '';
  const grandTotal = parseFloat(data?.grandTotalAmount) || 1;

  useEffect(() => {
    if (!recordId || !base) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/sales-invoice/paymentPlan?parentId=${recordId}&_startRow=0&_endRow=50`, { headers });
        if (res.ok && !cancelled) {
          setInstallments((await res.json())?.response?.data || []);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [recordId, base, headers]);

  // Only show if 2+ installments
  if (!loaded || installments.length < 2) return null;

  const sorted = [...installments].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate) : new Date(0);
    const db = b.dueDate ? new Date(b.dueDate) : new Date(0);
    return da - db;
  });

  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>
        Payment Plan
      </span>
      <div style={{ border: '0.5px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
        {sorted.map((inst, idx) => {
          const amount = parseFloat(inst.amount) || 0;
          const outstanding = parseFloat(inst.outstandingAmount) || 0;
          const paid = parseFloat(inst.paidAmount) || 0;
          const pct = Math.round(amount / grandTotal * 100);
          const status = outstanding <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
          const badge = BADGE[status];

          return (
            <div
              key={inst.finPaymentScheduleID || inst.id || idx}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: idx < sorted.length - 1 ? '0.5px solid #d1d5db' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>Cuota {idx + 1}</span>
                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{fmt(amount, currency)}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{pct}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tabular-nums" style={{ fontSize: 12, color: '#6B7280' }}>Vence {fmtDate(inst.dueDate)}</span>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 9999, backgroundColor: badge.bg, color: badge.color }}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
