import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);

function fmtDate(raw) {
  if (!raw) return '';
  const str = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StateTag({ status, dir, ui }) {
  const isDeposited = PAID_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, background: '#E2F7EA', color: '#17663A' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {ui(dir === 'in' ? 'cobroDepositado' : 'pagoDepositado')}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, background: '#F1F2F4', color: '#55556D' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('statusDraft')}
    </span>
  );
}

/**
 * Shared detail sidebar for payment-in and payment-out.
 * Shows: hero amount + status, amount breakdown, activity timeline.
 * Consumed by the sidePanel customComponent slot in each window's decisions.json.
 * Props come from DetailView.renderSidePanel: { recordId, data, token, apiBaseUrl, api, isNew }
 */
export default function PaymentDetailSidebarBase({ dir, specName, data, token, apiBaseUrl }) {
  const ui = useUI();
  const [appliedAmount, setAppliedAmount] = useState(null);

  const isIn = dir === 'in';
  const status = data?.status || '';
  const isDeposited = PAID_STATUSES.has(status);
  const isDraft = !isDeposited;
  const currency = data?.['currency$_identifier'] || 'EUR';
  const totalAmount = parseFloat(data?.amount ?? 0);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const linesEntity = isIn ? 'finPaymentScheduleDetail' : 'lines';
    (async () => {
      try {
        const res = await fetch(
          `${base}/${specName}/${linesEntity}?parentId=${data.id}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!res.ok) { setAppliedAmount(0); return; }
        const rows = (await res.json())?.response?.data || [];
        const total = rows
          .filter(d => d.invoicePaymentSchedule)
          .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
        setAppliedAmount(total);
      } catch { setAppliedAmount(0); }
    })();
  }, [data?.id, token, apiBaseUrl, isIn, specName]);

  const applied = appliedAmount ?? 0;
  const unapplied = totalAmount - applied;
  const paymentDate = data?.paymentDate;
  const createdDate = data?.creationDate || data?.created || paymentDate;
  const updatedDate = data?.updated;

  const heroColor = isDraft ? '#55556D' : (isIn ? '#17663A' : '#19191D');
  const heroSign = isIn ? '+ ' : '− ';

  const activityItems = [
    { label: ui(isIn ? 'cobroCreado' : 'pagoCreado'), date: createdDate, dot: isDraft ? '#C28800' : '#17663A' },
    ...(!isDraft ? [{ label: ui(isIn ? 'cobroConfirmado' : 'pagoConfirmado'), date: paymentDate, dot: '#2DCA72' }] : []),
    ...(!isDraft && data?.posted === 'Y' ? [{ label: ui('asientoContabilizado'), date: updatedDate, dot: '#D0D5DD' }] : []),
  ];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 22px', height: '100%', overflowY: 'auto' }}
      data-testid="PaymentDetailSidebar__panel"
    >
      {/* Hero amount */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#828FA3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          {ui('amountLabel')}
        </div>
        <div className="tabular-nums" style={{ fontSize: 32, fontWeight: 700, color: heroColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {heroSign}{formatCurrency(currency, totalAmount)}
        </div>
        <div style={{ marginTop: 8 }}>
          <StateTag status={status} dir={dir} ui={ui} />
        </div>
      </div>

      {/* Amount breakdown */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { label: ui('totalAmount'), value: formatCurrency(currency, totalAmount), green: false },
          { label: ui('appliedToInvoices'), value: appliedAmount === null ? '...' : formatCurrency(currency, applied), green: applied > 0 },
          { label: ui('unallocated'), value: appliedAmount === null ? '...' : formatCurrency(currency, Math.max(0, unapplied)), green: false },
        ].map(({ label, value, green }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, color: '#828FA3' }}>{label}</span>
            <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: green ? '#17663A' : unapplied <= 0 && label === ui('unallocated') ? '#D0D5DD' : '#19191D' }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Activity timeline */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#19191D', marginBottom: 10 }}>{ui('activity')}</div>
        {activityItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot, marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#55556D' }}>{item.label}</div>
              {item.date && (
                <div style={{ fontSize: 11, color: '#A9A9BC', marginTop: 2 }}>{fmtDate(item.date)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
