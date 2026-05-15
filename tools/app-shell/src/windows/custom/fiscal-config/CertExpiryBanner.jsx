import { useState } from 'react';
import { useUI } from '@/i18n';
import { OctagonAlert, TriangleAlert, X } from 'lucide-react';

const WARN_DAYS     = 60;
const CRITICAL_DAYS = 30;

export default function CertExpiryBanner({ daysLeft, variant = 'prominent' }) {
  const ui = useUI();
  const [dismissed, setDismissed] = useState(false);

  if (daysLeft === null || daysLeft > WARN_DAYS) return null;

  const isCritical = daysLeft <= CRITICAL_DAYS;
  const canDismiss = !isCritical;

  if (dismissed) return null;

  const amber = { bg: '#fffbeb', border: '#fde68a', fg: '#92400e', dot: '#d97706' };
  const red   = { bg: '#fef2f2', border: '#fca5a5', fg: '#991b1b', dot: '#dc2626' };
  const c = isCritical ? red : amber;

  if (variant === 'subtle') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '7px 14px', borderRadius: 8, marginBottom: 10,
        background: c.bg, border: `1px solid ${c.border}`, color: c.fg,
        fontSize: 12, fontWeight: 500,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
          {isCritical
            ? ui('fiscal.cert.expiry.critical.title', { days: daysLeft })
            : ui('fiscal.cert.expiry.warn.title', { days: daysLeft })}
          <span style={{ opacity: 0.7, fontWeight: 400 }}>·</span>
          <span style={{ opacity: 0.7, fontWeight: 400 }}>{ui('fiscal.cert.expiry.body')}</span>
        </span>
        {canDismiss && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={ui('fiscal.cert.expiry.dismiss')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, opacity: 0.5, padding: '0 2px', display: 'flex' }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 18px', borderRadius: 10, marginBottom: 20,
      background: c.bg, border: `1px solid ${c.border}`, color: c.fg,
    }}>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {isCritical
          ? <OctagonAlert size={18} strokeWidth={1.75} />
          : <TriangleAlert size={18} strokeWidth={1.75} />}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {isCritical
            ? ui('fiscal.cert.expiry.critical.title', { days: daysLeft })
            : ui('fiscal.cert.expiry.warn.title', { days: daysLeft })}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
          {ui('fiscal.cert.expiry.body')}
        </div>
      </div>
      {canDismiss && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={ui('fiscal.cert.expiry.dismiss')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, opacity: 0.45, flexShrink: 0, display: 'flex' }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
