import { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { jsonHeaders } from '@/lib/sessionHeaders.js';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr, n);
}

function fmtDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const BADGE = {
  paid:    { bg: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  pending: { bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
  partial: { bg: 'var(--status-info-bg)', color: 'var(--status-info-fg)' },
};

export default function PaymentPlanBlock({ recordId, data, token, apiBaseUrl }) {
  const ui = useUI();
  const [installments, setInstallments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => (jsonHeaders()), []);
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
      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>
        {ui('paymentPlan')}
      </span>
      <div style={{ border: '0.5px solid hsl(var(--foreground))', borderRadius: 10, overflow: 'hidden' }}>
        {sorted.map((inst, idx) => {
          const amount = parseFloat(inst.amount) || 0;
          const outstanding = parseFloat(inst.outstandingAmount) || 0;
          const paid = parseFloat(inst.paidAmount) || 0;
          const status = outstanding <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
          const badge = BADGE[status];

          return (
            <div
              key={inst.finPaymentScheduleID || inst.id || idx}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: idx < sorted.length - 1 ? '0.5px solid hsl(var(--card))' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ui('installment')} {idx + 1}</span>
                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>{fmt(amount, currency)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tabular-nums" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{ui('dueShort')} {fmtDate(inst.dueDate)}</span>
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
