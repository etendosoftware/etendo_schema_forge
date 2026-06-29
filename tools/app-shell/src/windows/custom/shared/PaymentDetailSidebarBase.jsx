import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';

function fmtAmt(val) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + abs[0] + ',' + abs[1] + ' €';
}

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

const DocIcon = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

/**
 * Shared detail sidebar for payment-in and payment-out.
 * Shows: hero amount + status, amount breakdown, applied lines, activity timeline.
 * Consumed by the sidePanel customComponent slot in each window's decisions.json.
 * Props come from DetailView.renderSidePanel: { recordId, data, token, apiBaseUrl, api, isNew }
 */
export default function PaymentDetailSidebarBase({ dir, specName, data, token, apiBaseUrl }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [lines, setLines] = useState(null);

  const isIn = dir === 'in';
  const status = data?.status || '';
  const isDeposited = PAID_STATUSES.has(status);
  const isDraft = !isDeposited;
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
        if (!res.ok) { setLines([]); return; }
        const rows = (await res.json())?.response?.data || [];
        setLines(rows.filter(d => d.invoicePaymentSchedule || d.amount));
      } catch { setLines([]); }
    })();
  }, [data?.id, token, apiBaseUrl, isIn, specName]);

  const appliedLines = lines ?? [];
  const applied = appliedLines.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const unapplied = Math.max(0, totalAmount - applied);

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

  const invoiceWindow = isIn ? 'sales-invoice' : 'purchase-invoice';

  const handleLineClick = (row) => {
    const invoiceId = row['invoicePaymentSchedule$invoice'] || row['invoice'];
    if (invoiceId) navigate(`/${invoiceWindow}/${invoiceId}`);
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 22px', height: '100%', overflowY: 'auto' }}
      data-testid="PaymentDetailSidebar__panel"
    >
      {/* Hero amount */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#828FA3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          {ui(isIn ? 'amountLabelIn' : 'amountLabelOut')}
        </div>
        <div className="tabular-nums" style={{ font: '700 32px/38px Inter', color: heroColor, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {heroSign}{fmtAmt(totalAmount)}
        </div>
        <div style={{ marginTop: 8 }}>
          <StateTag status={status} dir={dir} ui={ui} data-testid="StateTag__624cef" />
        </div>
      </div>
      {/* Amount breakdown */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {[
          { label: ui('totalAmount'), value: fmtAmt(totalAmount), muted: false },
          { label: ui('appliedToInvoices'), value: lines === null ? '...' : fmtAmt(applied), muted: false },
          { label: ui('unallocated'), value: lines === null ? '...' : fmtAmt(unapplied), muted: true },
        ].map(({ label, value, muted }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: '400 13px/18px Inter', color: '#828FA3' }}>{label}</span>
            <span className="tabular-nums" style={{ font: '600 13px/18px Inter', color: muted ? '#828FA3' : '#19191D' }}>
              {value}
            </span>
          </div>
        ))}
      </div>
      {/* Applied lines */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#19191D', marginBottom: 10 }}>
          {isIn ? 'Facturas cobradas' : 'Facturas pagadas'}
        </div>
        {lines === null ? (
          <div style={{ fontSize: 13, color: '#A9A9BC' }}>...</div>
        ) : appliedLines.length === 0 ? (
          <div style={{ fontSize: 13, color: '#A9A9BC' }}>
            {isIn ? 'Sin facturas aplicadas' : 'Sin facturas aplicadas'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {appliedLines.map((row, i) => {
              const identifier = row['invoicePaymentSchedule$_identifier'] || row['invoice$_identifier'] || fmtDate(row.dueDate) || `Línea ${i + 1}`;
              const amount = parseFloat(row.amount) || 0;
              const hasNav = !!(row['invoicePaymentSchedule$invoice'] || row['invoice']);
              return (
                <div
                  key={row.id || i}
                  onClick={() => hasNav && handleLineClick(row)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8,
                    background: '#F9FAFB', border: '0.5px solid #E3E7EC',
                    cursor: hasNav ? 'pointer' : 'default',
                  }}
                  data-testid={`PaymentDetailSidebar__line-${i}`}
                >
                  <DocIcon data-testid="DocIcon__624cef" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 12px/16px JetBrains Mono, monospace', color: '#19191D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {identifier}
                    </div>
                    {row.dueDate && (
                      <div style={{ font: '400 11px/15px Inter', color: '#828FA3', marginTop: 1 }}>
                        {fmtDate(row.dueDate)}
                      </div>
                    )}
                  </div>
                  <div className="tabular-nums" style={{ font: '600 13px/18px Inter', color: isIn ? '#17663A' : '#19191D', flexShrink: 0 }}>
                    {fmtAmt(amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
