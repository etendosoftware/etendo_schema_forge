import { useState } from 'react';
import { useUI } from '@/i18n';

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  facturaCompra: { iconBg: '#f3f0ff', iconColor: '#7c5cff', labelKey: 'confirmResultModal.docType.facturaCompra', viewKey: 'poViewInvoice',   Icon: InvoiceIcon },
  facturaVenta:  { iconBg: '#f3f0ff', iconColor: '#7c5cff', labelKey: 'confirmResultModal.docType.facturaVenta',  viewKey: 'soViewInvoice',   Icon: InvoiceIcon },
  salida:        { iconBg: '#eef5fe', iconColor: '#2f73d6', labelKey: 'confirmResultModal.docType.salida',        viewKey: 'soViewShipment',  Icon: SalidaIcon  },
  entrada:       { iconBg: '#e9f7ee', iconColor: '#157a43', labelKey: 'confirmResultModal.docType.entrada',       viewKey: 'poViewReceipt',   Icon: EntradaIcon },
};

const fmtAmount = (v, cur) => {
  const formatted = Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur ? `${formatted} ${cur}` : formatted;
};

// ── Doc card ──────────────────────────────────────────────────────────────────

function DocCard({ doc, currency, ui, navigate, onClose, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  const cfg = TYPE_CONFIG[doc.type] || TYPE_CONFIG.facturaCompra;
  const { Icon } = cfg;

  const handleActivate = () => { (onNavigate ?? onClose)(); navigate(doc.route); };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(47,115,214,.2)'; }}
      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${hovered ? '#cfe1fb' : '#e6e8ec'}`,
        background: hovered ? '#fbfcfd' : '#fff',
        transition: 'border-color .15s, background .15s',
        outline: 'none',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 9, background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon color={cfg.iconColor} data-testid="Icon__a46cc0" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#9aa1aa', textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1 }}>
          {ui(cfg.labelKey)}
        </div>
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1d2530' }}>{doc.num}</span>
          {doc.amount != null && (
            <span style={{ fontSize: 12, color: '#697079' }}>{fmtAmount(doc.amount, currency)}</span>
          )}
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 999, background: '#fdf2dd', color: '#9a6a1f', border: '1px solid #f1d9a6', whiteSpace: 'nowrap' }}>
            {doc.status || ui('statusDraft')}
          </span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hovered ? '#2f73d6' : '#d0d4da'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke .15s' }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ConfirmResultModal({ title, docs = [], primary, navigate, currency = '', onClose, onNavigate }) {
  const ui = useUI();

  // Single-doc action label: use the explicit `primary` override if given,
  // otherwise derive it from the doc type so it matches the actual document
  // (e.g. "Ver albarán" for a shipment, not a hardcoded "Ver factura").
  const singleDoc = docs.length === 1 ? docs[0] : null;
  const singleViewKey = singleDoc ? TYPE_CONFIG[singleDoc.type]?.viewKey : null;
  const primaryLabel = primary ?? (singleViewKey ? ui(singleViewKey) : null);

  let subtitle = null;
  if (docs.length === 1) subtitle = ui('confirmResultModal.subtitleOne');
  else if (docs.length > 1) subtitle = ui('confirmResultModal.subtitleMany', { count: docs.length });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 444, borderRadius: 16, background: '#fff', boxShadow: '0 8px 32px rgba(20,26,38,.18), 0 2px 8px rgba(20,26,38,.08)', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1d2530' }}
      >
        {/* Header */}
        <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e9f7ee', border: '1.5px solid #bfe8cd', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#157a43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 11 9.5 19.5 25 2" />
            </svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#1d2530', lineHeight: 1.25 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 13, color: '#697079', marginTop: 6 }}>{subtitle}</div>
          )}
        </div>

        {/* Doc cards */}
        {docs.length > 0 && (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((doc) => (
              <DocCard
                key={doc.type + '-' + doc.num}
                doc={doc}
                currency={currency}
                ui={ui}
                navigate={navigate}
                onClose={onClose}
                onNavigate={onNavigate}
                data-testid="DocCard__a46cc0" />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', background: '#fbfcfd', borderTop: '1px solid #eef0f2' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid #e6e8ec', background: 'transparent', color: '#697079', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f8'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {ui('soClose')}
          </button>

          {singleDoc && primaryLabel && (
            <button
              type="button"
              onClick={() => { (onNavigate ?? onClose)(); navigate(singleDoc.route); }}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2f73d6', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a67c2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#2f73d6'; }}
            >
              {primaryLabel}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function InvoiceIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SalidaIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="6" height="10" rx="1" />
      <path d="M8 12h10M13 7l5 5-5 5" />
    </svg>
  );
}

function EntradaIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="16" y="7" width="6" height="10" rx="1" />
      <path d="M16 12H6M11 7l-5 5 5 5" />
    </svg>
  );
}
