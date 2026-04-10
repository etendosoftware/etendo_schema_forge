import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';

const STATUS_MAP = {
  RPPC: { labelKey: 'statusCleared', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  DR:   { labelKey: 'statusDraft', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
  RPAP: { labelKey: 'statusAwaiting', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  RPR:  { labelKey: 'statusReceived', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  RDNC: { labelKey: 'statusNotCleared', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  RPVD: { labelKey: 'statusVoided', bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', dot: 'bg-gray-400' },
};

function fmtAmount(amount, currencyId) {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyId || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function PaymentSummaryCard({ data, token, apiBaseUrl }) {
  const ui = useUI();
  if (!data) return null;

  const [appliedAmount, setAppliedAmount] = useState(null);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    (async () => {
      try {
        const res = await fetch(
          `${base}/payment-in/finPaymentScheduleDetail?parentId=${data.id}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!res.ok) { setAppliedAmount(0); return; }
        const details = (await res.json())?.response?.data || [];
        const total = details
          .filter(d => d.invoicePaymentSchedule)
          .reduce((sum, d) => sum + (Number.parseFloat(d.amount) || 0), 0);
        setAppliedAmount(total);
      } catch {
        setAppliedAmount(0);
      }
    })();
  }, [data?.id, token, apiBaseUrl]);

  const status = data.status || data.documentStatus;
  const badge = STATUS_MAP[status] || { labelKey: status || 'statusUnknown', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
  const currency = data['currency$_identifier'] || 'EUR';
  const totalAmount = Number.parseFloat(data.amount) || 0;
  const applied = appliedAmount ?? 0;
  const remaining = totalAmount - applied;

  return (
    <div
      className="rounded-lg"
      style={{
        marginTop: 24,
        marginBottom: 24,
        padding: '20px 24px',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}
    >
      {/* Status badge */}
      <div className="mb-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.text} border ${badge.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {ui(badge.labelKey)}
        </span>
      </div>

      {/* 3-column metrics — equal width */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        {/* Total Amount */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: '#9ca3af', letterSpacing: '0.05em' }}>
            {ui('totalAmount')}
          </span>
          <span className="block text-2xl font-bold tabular-nums leading-tight" style={{ color: '#111827' }}>
            {fmtAmount(totalAmount, currency)}
          </span>
        </div>

        {/* Applied to Invoices */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: '#9ca3af', letterSpacing: '0.05em' }}>
            {ui('appliedToInvoices')}
          </span>
          {appliedAmount === null ? (
            <span className="block text-lg" style={{ color: '#d1d5db' }}>...</span>
          ) : applied > 0 ? (
            <span className="block text-lg font-semibold tabular-nums leading-tight" style={{ color: '#111827' }}>
              {fmtAmount(applied, currency)}
            </span>
          ) : (
            <span className="block text-lg tabular-nums leading-tight" style={{ color: '#9ca3af' }}>
              {fmtAmount(0, currency)}
                <span className="ml-1.5 text-xs font-medium" style={{ color: '#d1d5db' }}>{ui('unallocated')}</span>
            </span>
          )}
        </div>

        {/* Remaining Credit */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: '#9ca3af', letterSpacing: '0.05em' }}>
            {ui('remainingCredit')}
          </span>
          {remaining === 0 ? (
            <span className="block text-lg tabular-nums leading-tight" style={{ color: '#d1d5db' }}>
              {fmtAmount(0, currency)}
            </span>
          ) : (
            <span className="block text-lg font-semibold tabular-nums leading-tight" style={{ color: '#d97706' }}>
              {fmtAmount(remaining, currency)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
