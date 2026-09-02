import { useState, useEffect } from 'react';
import { useRecordRefreshSignal } from '@/windows/custom/shared/useRecordRefreshSignal';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

const STATUS_LABEL_KEYS = {
  RPPC: 'statusCleared', DR: 'statusDraft', RPAP: 'statusAwaiting',
  RPR: 'statusReceived', RDNC: 'statusNotCleared', RPVD: 'statusVoided',
};

function fmtAmount(amount, currencyId) {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : (amount ?? 0);
  return formatCurrency(currencyId, n);
}

export default function PaymentSummaryCard({ data, token, apiBaseUrl }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch(apiBaseUrl);
  const ui = useUI();
  if (!data) return null;

  const [appliedAmount, setAppliedAmount] = useState(null);

  const refreshSignal = useRecordRefreshSignal(data?.id);

  useEffect(() => {
    if (!data?.id || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');

    (async () => {
      try {
        const res = await apiFetch(
          `${base}/payment-in/finPaymentScheduleDetail?parentId=${data.id}&_startRow=0&_endRow=100`,
          {},
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
  // The refresh signal is in the deps on purpose: the record id never changes when the payment
  // is edited, and `Updated` is not a NEO field on this entity, so nothing in the payload
  // moves for this effect to react to. Without it the panel kept showing the amounts from
  // before the save until the whole window was reloaded.
  }, [data?.id, refreshSignal, token, apiBaseUrl]);

  const status = data.status || data.documentStatus;
  const badgeLabelKey = STATUS_LABEL_KEYS[status] || status || 'statusUnknown';
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
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--card))',
        borderRadius: 8,
      }}
    >
      {/* Status badge */}
      <div className="mb-4">
        <StatusTag status={status} label={ui(badgeLabelKey)} />
      </div>

      {/* 3-column metrics — equal width */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        {/* Total Amount */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em' }}>
            {ui('totalAmount')}
          </span>
          <span className="block text-2xl font-bold tabular-nums leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
            {fmtAmount(totalAmount, currency)}
          </span>
        </div>

        {/* Applied to Invoices */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em' }}>
            {ui('appliedToInvoices')}
          </span>
          {appliedAmount === null ? (
            <span className="block text-lg" style={{ color: 'hsl(var(--foreground))' }}>...</span>
          ) : applied > 0 ? (
            <span className="block text-lg font-semibold tabular-nums leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
              {fmtAmount(applied, currency)}
            </span>
          ) : (
            <span className="block text-lg tabular-nums leading-tight" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {fmtAmount(0, currency)}
                <span className="ml-1.5 text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{ui('unallocated')}</span>
            </span>
          )}
        </div>

        {/* Remaining Credit */}
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em' }}>
            {ui('remainingCredit')}
          </span>
          {remaining === 0 ? (
            <span className="block text-lg tabular-nums leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
              {fmtAmount(0, currency)}
            </span>
          ) : (
            <span className="block text-lg font-semibold tabular-nums leading-tight" style={{ color: 'var(--status-warning-fg)' }}>
              {fmtAmount(remaining, currency)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
