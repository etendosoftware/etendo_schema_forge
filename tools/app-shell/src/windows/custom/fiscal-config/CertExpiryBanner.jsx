import { useState } from 'react';
import { useUI } from '@/i18n';
import { OctagonAlert, TriangleAlert, X } from 'lucide-react';

const WARN_DAYS     = 60;
const CRITICAL_DAYS = 30;

/**
 * Title and body of the banner for `daysLeft` (ETP-6053): an expired certificate (< 0) and one
 * that expires today (0) get their own copy instead of "vence en -12 / 0 días", and a single day
 * uses the singular `_one` key. Both are critical, so neither can be dismissed.
 */
export function certExpiryCopy(ui, daysLeft, isCritical) {
  if (daysLeft < 0) {
    return { title: ui('fiscal.cert.expiry.expired.title'), body: ui('fiscal.cert.expiry.expired.body') };
  }
  if (daysLeft === 0) {
    return { title: ui('fiscal.cert.expiry.today.title'), body: ui('fiscal.cert.expiry.body') };
  }
  const base = isCritical ? 'fiscal.cert.expiry.critical.title' : 'fiscal.cert.expiry.warn.title';
  const key = daysLeft === 1 ? `${base}_one` : base;
  return { title: ui(key, { days: daysLeft }), body: ui('fiscal.cert.expiry.body') };
}

export default function CertExpiryBanner({ daysLeft, variant = 'prominent' }) {
  const ui = useUI();
  const [dismissed, setDismissed] = useState(false);

  if (daysLeft === null || daysLeft > WARN_DAYS) return null;

  const isCritical = daysLeft <= CRITICAL_DAYS;
  const canDismiss = !isCritical;

  if (dismissed) return null;

  const amber = { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', fg: 'var(--status-warning-fg)', dot: 'var(--status-warning-fg)' };
  const red   = { bg: 'var(--status-destructive-bg)', border: 'hsl(var(--destructive) / 0.3)', fg: 'hsl(var(--destructive))', dot: 'hsl(var(--destructive))' };
  const c = isCritical ? red : amber;
  const copy = certExpiryCopy(ui, daysLeft, isCritical);

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
          {copy.title}
          <span style={{ opacity: 0.7, fontWeight: 400 }}>·</span>
          <span style={{ opacity: 0.7, fontWeight: 400 }}>{copy.body}</span>
        </span>
        {canDismiss && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={ui('fiscal.cert.expiry.dismiss')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, opacity: 0.5, padding: '0 2px', display: 'flex' }}
          >
            <X size={14} strokeWidth={2} data-testid="X__15abdc" />
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
          ? <OctagonAlert size={18} strokeWidth={1.75} data-testid="OctagonAlert__15abdc" />
          : <TriangleAlert size={18} strokeWidth={1.75} data-testid="TriangleAlert__15abdc" />}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
          {copy.body}
        </div>
      </div>
      {canDismiss && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={ui('fiscal.cert.expiry.dismiss')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.fg, opacity: 0.45, flexShrink: 0, display: 'flex' }}
        >
          <X size={16} strokeWidth={2} data-testid="X__15abdc" />
        </button>
      )}
    </div>
  );
}
