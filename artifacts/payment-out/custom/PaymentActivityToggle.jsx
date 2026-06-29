import { useState, useCallback, useEffect } from 'react';
import { useUI } from '@/i18n';

function fmtDate(raw) {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
}

const DEPOSITED = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);

function ActivityPanel({ data }) {
  const ui = useUI();
  const status = data?.status || '';
  const isDeposited = DEPOSITED.has(status);
  const isDraft = !isDeposited;

  const items = [
    { label: ui('pagoCreado'), date: data?.creationDate || data?.created || data?.paymentDate, dot: isDraft ? '#C28800' : '#17663A' },
    ...(!isDraft ? [{ label: ui('pagoConfirmado'), date: data?.paymentDate, dot: '#2DCA72' }] : []),
    ...(!isDraft && data?.posted === 'Y' ? [{ label: ui('asientoContabilizado'), date: data?.updated, dot: '#D0D5DD' }] : []),
  ];

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%' }}>
      <div style={{ font: '600 14px/20px Inter', color: '#19191D', marginBottom: 14 }}>{ui('activity')}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot, marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ font: '500 13px/17px Inter', color: '#55556D' }}>{item.label}</div>
            {item.date && <div style={{ font: '400 11px/15px Inter', color: '#A9A9BC', marginTop: 2 }}>{fmtDate(item.date)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PaymentActivityToggle({ data, recordId, token, apiBaseUrl, api }) {
  const [open, setOpen] = useState(false);
  const ui = useUI();

  const toggle = useCallback(() => setOpen(prev => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={ui('activity')}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 50 }} />
      )}

      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, maxWidth: '90vw', backgroundColor: '#f9fafb', borderLeft: '1px solid #e5e7eb', boxShadow: open ? '-4px 0 24px rgba(0,0,0,0.08)' : 'none', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 250ms ease', zIndex: 51, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 16px 0', flexShrink: 0 }}>
          <button type="button" onClick={close} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>&#x2715;</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ActivityPanel data={data} />
        </div>
      </div>
    </>
  );
}
