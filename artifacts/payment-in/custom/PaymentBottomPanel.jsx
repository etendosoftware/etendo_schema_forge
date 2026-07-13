import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import PaymentDraftBanner from './PaymentDraftBanner';

/* eslint-disable react/prop-types */

function fmtAmt(val) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + abs[0] + ',' + abs[1] + ' €';
}

function fmtDate(raw) {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
}

const CalendarIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);

const TransferIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/>
  </svg>
);

function resolveMethodKey(name) {
  const s = (name || '').toLowerCase();
  if (s.includes('transferencia') || s.includes('transfer')) return 'transfer';
  if (s.includes('tarjeta') || s.includes('card')) return 'card';
  if (s.includes('efectivo') || s.includes('cash')) return 'cash';
  if (s.includes('domiciliac') || s.includes('direct')) return 'direct';
  return 'transfer';
}

const METHOD_ICONS = {
  transfer: <TransferIcon />,
  card: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  ),
  cash: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
    </svg>
  ),
  direct: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/>
    </svg>
  ),
};

function FieldItem({ label, children, icon }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <span style={{ font: '400 12px/16px Inter', color: '#555B6D' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 0 }}>
        {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
        <span style={{ font: '600 16px/24px Inter', color: '#121217', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {children || <span style={{ color: '#A9AEBC' }}>—</span>}
        </span>
      </div>
    </div>
  );
}

function DatosSection({ data, ui }) {
  const methodRaw = data?.['paymentMethod$_identifier'] || '';
  const methodKey = resolveMethodKey(methodRaw);
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '8px 20px 12px', gap: 44 }}>
      <div style={{ width: 148, flexShrink: 0 }}>
        <div style={{ font: '600 14px/20px Inter', color: '#121217' }}>{ui('paymentInDataTitle')}</div>
        <div style={{ font: '400 12px/16px Inter', color: '#282833', marginTop: 4 }}>{ui('paymentInDataSub')}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
          <FieldItem label={ui('docNo')}>{data?.documentNo}</FieldItem>
          <FieldItem label={ui('Customer')}>{data?.['businessPartner$_identifier']}</FieldItem>
          <FieldItem label={ui('date')} icon={<CalendarIcon />}>{fmtDate(data?.paymentDate)}</FieldItem>
          <FieldItem label={ui('method')} icon={METHOD_ICONS[methodKey]}>{methodRaw}</FieldItem>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
          <FieldItem label={ui('depositTo')}>{data?.['account$_identifier']}</FieldItem>
          <FieldItem label={ui('assetsCurrencyLabel')}>{data?.['currency$_identifier'] || 'EUR'}</FieldItem>
          <FieldItem label={ui('reference')}>{data?.referenceNo}</FieldItem>
          <div style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

const DET_COLS = '1.8fr 1fr 1fr 1fr';

function LineasSection({ data, token, apiBaseUrl, ui }) {
  const [lines, setLines] = useState(null);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}` };
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/payment-in/finPaymentScheduleDetail?parentId=${data.id}&_startRow=0&_endRow=200`, { headers });
        if (!res.ok || cancelled) { if (!cancelled) setLines([]); return; }
        const rows = (await res.json())?.response?.data || [];
        if (!cancelled) setLines(rows);
      } catch { if (!cancelled) setLines([]); }
    })();
    return () => { cancelled = true; };
  }, [data?.id, token, apiBaseUrl]);

  const thStyle = { font: '600 12px/16px Inter', color: '#121217' };
  const thRStyle = { ...thStyle, textAlign: 'right' };
  const noLines = !data?.id || (lines !== null && lines.length === 0);
  const totalImporte = (lines || []).reduce((s, r) => s + (parseFloat(r.expected) || 0), 0);
  const totalApplied = (lines || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalPendiente = (lines || []).reduce((s, r) => s + Math.max(0, (parseFloat(r.expected) || 0) - (parseFloat(r.amount) || 0)), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 20px 12px', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ font: '600 14px/20px Inter', color: '#121217' }}>{ui('paymentInLinesTitle')}</div>
        <div style={{ font: '400 12px/16px Inter', color: '#282833' }}>{ui('paymentInLinesSub')}</div>
      </div>

      {lines === null ? (
        <div style={{ font: '400 13px/18px Inter', color: '#828FA3' }}>{ui('loading')}</div>
      ) : noLines ? (
        <div style={{ font: '400 13px/18px Inter', color: '#828FA3' }}>{ui('paymentInNoLines')}</div>
      ) : (
        <div style={{ border: '1px solid #E8EAEF', borderRadius: 8, overflow: 'hidden', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: DET_COLS, alignItems: 'center', height: 40 }}>
            <div style={{ padding: '0 12px', ...thStyle }}>{ui('invoice')}</div>
            <div style={{ padding: '0 12px', ...thRStyle }}>{ui('amount')}</div>
            <div style={{ padding: '0 12px', ...thRStyle }}>{ui('applied')}</div>
            <div style={{ padding: '0 12px', ...thRStyle }}>{ui('pending')}</div>
          </div>
          <div style={{ borderTop: '1px solid #E8EAEF' }} />

          {lines.map((row, i) => {
            const applied = parseFloat(row.amount) || 0;
            const importe = parseFloat(row.expected) || 0;
            const pendiente = Math.max(0, importe - applied);
            const invoiceNo = row.invoiceDocumentNo || row['documentNo$_identifier'] || fmtDate(row.dueDate) || `${ui('invoice')} ${i + 1}`;
            const dueLabel = row.invoiceDocumentNo ? fmtDate(row.dueDate) : null;
            return (
              <div key={row.id || i}>
                <div style={{ display: 'grid', gridTemplateColumns: DET_COLS, alignItems: 'center', height: 56, background: '#FFFFFF' }}>
                  <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0 }}>
                    <div style={{ font: '600 14px/20px Inter', color: '#121217', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoiceNo}</div>
                    {dueLabel && <div style={{ font: '500 12px/16px Inter', color: '#6C6C89' }}>{dueLabel}</div>}
                  </div>
                  <div style={{ padding: '0 12px', textAlign: 'right', font: '400 14px/20px Inter', color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{importe > 0 ? fmtAmt(importe) : '—'}</div>
                  <div style={{ padding: '0 12px', textAlign: 'right', font: '600 14px/20px Inter', color: '#17663A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(applied)}</div>
                  <div style={{ padding: '0 12px', textAlign: 'right', font: '400 14px/20px Inter', color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(pendiente)}</div>
                </div>
                {i < lines.length - 1 && <div style={{ borderTop: '1px solid #E8EAEF' }} />}
              </div>
            );
          })}

          <div style={{ borderTop: '1px solid #E8EAEF' }} />
          <div style={{ display: 'grid', gridTemplateColumns: DET_COLS, alignItems: 'center', height: 40 }}>
            <div style={{ padding: '0 12px', font: '600 12px/16px Inter', color: '#121217' }}>{ui('totalApplied')}</div>
            <div style={{ padding: '0 12px', textAlign: 'right', font: '400 14px/20px Inter', color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(totalImporte)}</div>
            <div style={{ padding: '0 12px', textAlign: 'right', font: '600 14px/20px Inter', color: '#17663A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(totalApplied)}</div>
            <div style={{ padding: '0 12px', textAlign: 'right', font: '400 14px/20px Inter', color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(totalPendiente)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentBottomPanel({ data, token, apiBaseUrl }) {
  const ui = useUI();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PaymentDraftBanner data={data} />
      <DatosSection data={data} ui={ui} />
      <div style={{ margin: '0 20px', borderTop: '1px solid #E8EAEF' }} />
      <LineasSection data={data} token={token} apiBaseUrl={apiBaseUrl} ui={ui} />
    </div>
  );
}
