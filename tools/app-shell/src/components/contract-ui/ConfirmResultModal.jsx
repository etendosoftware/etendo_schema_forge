import { useState } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  facturaCompra: { iconBg: 'var(--status-info-bg)', iconColor: 'var(--status-info-fg)', labelKey: 'confirmResultModal.docType.facturaCompra', viewKey: 'poViewInvoice',   Icon: InvoiceIcon },
  facturaVenta:  { iconBg: 'var(--status-info-bg)', iconColor: 'var(--status-info-fg)', labelKey: 'confirmResultModal.docType.facturaVenta',  viewKey: 'soViewInvoice',   Icon: InvoiceIcon },
  salida:        { iconBg: 'var(--status-info-bg)', iconColor: 'var(--status-info-fg)', labelKey: 'confirmResultModal.docType.salida',        viewKey: 'soViewShipment',  Icon: SalidaIcon  },
  entrada:       { iconBg: 'var(--status-success-bg)', iconColor: 'var(--status-success-fg)', labelKey: 'confirmResultModal.docType.entrada',       viewKey: 'poViewReceipt',   Icon: EntradaIcon },
};

const fmtAmount = (v, cur) => (cur
  ? formatCurrency(cur, v)
  : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }));

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
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--focus-ring) / 0.2)'; }}
      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${hovered ? 'var(--status-info-border)' : 'hsl(var(--border-subtle))'}`,
        background: hovered ? 'hsl(var(--muted))' : 'hsl(var(--card))',
        transition: 'border-color .15s, background .15s',
        outline: 'none',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 9, background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon color={cfg.iconColor} data-testid="Icon__a46cc0" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'hsl(var(--text-disabled))', textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1 }}>
          {ui(cfg.labelKey)}
        </div>
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{doc.num}</span>
          {doc.amount != null && (
            <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{fmtAmount(doc.amount, currency)}</span>
          )}
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 999, background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', border: '1px solid var(--status-warning-border)', whiteSpace: 'nowrap' }}>
            {doc.status || ui('statusDraft')}
          </span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hovered ? 'var(--status-info-fg)' : 'hsl(var(--text-disabled))'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke .15s' }}>
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
    // zIndex 50 = the app's modal tier. It was 9999, which put this notice above
    // EVERY global tool -- including the walkthrough overlay at z-70, whose step
    // card it covered completely while a tour pointed at this very modal.
    // Nothing needs to sit above a confirmation result except toasts, which are
    // already higher.
    <div data-testid="confirm-result-modal" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / 0.3)' }}>
      {/*
        ETP-5108: no `fontFamily` here on purpose. The design system declares the
        family in exactly one place — `body` in the core's styles.css — and every
        component inherits it. This shell used to override it with a system-font
        stack, which silently took the whole modal (title, subtitle, doc card and
        buttons) off Inter and onto whatever sans the OS ships. It showed up worst
        on the document number, whose digit widths differ from Inter's.
      */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 444, borderRadius: 16, background: 'hsl(var(--card))', boxShadow: '0 8px 32px hsl(var(--foreground) / .18), 0 2px 8px hsl(var(--foreground) / .08)', overflow: 'hidden', color: 'hsl(var(--foreground))' }}
      >
        {/* Header */}
        <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--status-success-bg)', border: '1.5px solid var(--status-success-border)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="var(--status-success-fg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 11 9.5 19.5 25 2" />
            </svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1.25 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>{subtitle}</div>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', background: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border-subtle))' }}>
          <button
            type="button"
            onClick={onClose}
            // Targeted by the create-sales-order walkthrough's final step
            // (`confirmed-ack`). Renaming it breaks a shipped tour -- see
            // docs/walkthrough-flows.md.
            data-testid="action-confirm-result-close"
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid hsl(var(--border-subtle))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--muted))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {ui('soClose')}
          </button>

          {singleDoc && primaryLabel && (
            <button
              type="button"
              onClick={() => { (onNavigate ?? onClose)(); navigate(singleDoc.route); }}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--status-info-fg)', color: 'hsl(var(--card))', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
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
