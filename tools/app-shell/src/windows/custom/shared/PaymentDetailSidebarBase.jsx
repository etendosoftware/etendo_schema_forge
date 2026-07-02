import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';

const AMOUNT_FMT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAmt(val) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return (n < 0 ? '-' : '') + AMOUNT_FMT.format(Math.abs(n)) + ' €';
}

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']);

function fmtDate(raw) {
  if (!raw) return '';
  const str = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(str);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) +
    (m[4] ? ` · ${m[4]}` : '');
}

function Separator() {
  return <div style={{ height: 0, border: '1px solid rgba(18,18,23,0.05)', alignSelf: 'stretch' }} />;
}

function BreakdownRow({ label, value, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: '400 12px/16px Inter', color: '#555B6D' }}>{label}</span>
      <span className="tabular-nums" style={{ font: '500 14px/20px Inter', color: muted ? '#6C6C89' : '#121217', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

function fmtNow(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ` · ${h}:${m}`;
}

export default function PaymentDetailSidebarBase({ dir, specName, data, token, apiBaseUrl }) {
  const ui = useUI();
  const [lines, setLines] = useState(null);
  const [confirmedAt, setConfirmedAt] = useState(null);
  const [reactivatedAt, setReactivatedAt] = useState(null);

  const isIn = dir === 'in';
  const status = data?.status || '';
  const isDraft = !PAID_STATUSES.has(status);
  const totalAmount = parseFloat(data?.amount ?? 0);

  useEffect(() => {
    if (!data?.id) return;
    const handler = (e) => {
      if (e.detail?.recordId !== data.id) return;
      const isReactivate = e.detail?.process?.columnName === 'etprReactivatePayment';
      if (isReactivate) setReactivatedAt(new Date());
      else setConfirmedAt(new Date());
    };
    window.addEventListener('neo:processSuccess', handler);
    return () => window.removeEventListener('neo:processSuccess', handler);
  }, [data?.id]);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const linesEntity = isIn ? 'finPaymentScheduleDetail' : 'lines';
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${base}/${specName}/${linesEntity}?parentId=${data.id}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setLines([]);
          return;
        }
        const rows = (await res.json())?.response?.data || [];
        if (!cancelled) setLines(rows.filter(d => d.invoicePaymentSchedule || d.amount));
      } catch { if (!cancelled) setLines([]); }
    })();
    return () => { cancelled = true; };
  }, [data?.id, token, apiBaseUrl, isIn, specName]);

  const appliedLines = lines ?? [];
  const applied = appliedLines.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const unapplied = Math.max(0, totalAmount - applied);

  const paymentDate = data?.paymentDate;
  const createdDate = data?.creationDate || data?.created || paymentDate;

  const sign = isIn ? '+ ' : '− ';
  const titleKey = isIn ? 'amountLabelIn' : 'amountLabelOut';

  const activityItems = [
    {
      label: ui(isIn ? 'cobroCreado' : 'pagoCreado'),
      date: createdDate,
      dot: isDraft ? '#FAAF00' : '#17663A',
    },
    ...(isDraft && reactivatedAt ? [{
      label: ui(isIn ? 'cobroReactivado' : 'pagoReactivado'),
      confirmedAt: reactivatedAt,
      date: null,
      dot: '#6C6C89',
    }] : []),
    ...(!isDraft ? [{
      label: ui(isIn ? 'cobroConfirmado' : 'pagoConfirmado'),
      confirmedAt,
      date: paymentDate,
      dot: '#2DCA72',
    }] : []),
    ...(!isDraft && data?.posted === 'Y' ? [{
      label: ui('asientoContabilizado'),
      date: data?.updated,
      dot: '#D0D5DD',
    }] : []),
  ];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}
      data-testid="PaymentDetailSidebar__panel"
    >
      {/* Cabecera: padding 8px 12px 4px */}
      <div style={{ padding: '8px 12px 4px' }}>
        <h2 style={{ margin: 0, font: '600 20px/28px Inter', color: '#121217' }}>
          {ui(titleKey)}
        </h2>
      </div>
      {/* Datos: amount, padding 4px 12px 8px */}
      <div style={{ padding: '4px 12px 8px' }}>
        {(() => {
          const formatted = sign + fmtAmt(Math.abs(totalAmount));
          const len = formatted.length;
          const fs = len <= 13 ? 30 : 26;
          const lh = fs === 30 ? '32px' : '30px';
          return (
            <span className="tabular-nums" style={{ font: `500 ${fs}px/${lh} Inter`, color: '#121217' }}>
              {formatted}
            </span>
          );
        })()}
      </div>
      {/* Breakdown outer: padding 12px, gap 10px */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Detalle moneda card: padding 12px, gap 12px — Info sub-section has gap 8px */}
        <div style={{ background: '#F5F7F9', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Info: rows + separators with gap 8px */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BreakdownRow
              label={ui('totalAmount')}
              value={fmtAmt(totalAmount)}
              data-testid="BreakdownRow__624cef" />
            <Separator data-testid="Separator__624cef" />
            <BreakdownRow
              label={ui('appliedToInvoices')}
              value={lines === null ? '...' : fmtAmt(applied)}
              data-testid="BreakdownRow__624cef" />
            <Separator data-testid="Separator__624cef" />
            <BreakdownRow
              label={ui('unallocated')}
              value={lines === null ? '...' : fmtAmt(unapplied)}
              muted={unapplied === 0}
              data-testid="BreakdownRow__624cef" />
          </div>
        </div>
      </div>
      {/* Actividad: padding 8px 12px 0, column gap 10px */}
      <div style={{ padding: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Title with 4px bottom padding */}
        <div style={{ font: '400 14px/20px Inter', color: '#3F3F50', paddingBottom: 4 }}>
          {ui('activity')}
        </div>
        {activityItems.map((item) => (
          <div key={item.label} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Row: dot 24×24 + name */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot }} />
              </div>
              <span style={{ font: '500 14px/20px Inter', color: '#121217' }}>{item.label}</span>
            </div>
            {/* Date: 24px left indent, 12px font */}
            {(item.confirmedAt || item.date) && (
              <div style={{ paddingLeft: 24, font: '400 12px/16px Inter', color: '#6C6C89' }}>
                {item.confirmedAt ? fmtNow(item.confirmedAt) : fmtDate(item.date)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
