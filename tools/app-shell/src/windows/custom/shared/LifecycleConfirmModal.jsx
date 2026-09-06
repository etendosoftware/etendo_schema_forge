import { useState } from 'react';
import { createPortal } from 'react-dom';

/* eslint-disable react/prop-types */

/**
 * Generic confirmation dialog for destructive record-lifecycle actions
 * (Reactivar / Eliminar of a reconciled/posted record). Shared by Movimientos
 * (financial-account) and Cobros/Pagos (payment-in/out) so both surfaces show
 * the exact same cartel.
 *
 * The component is intentionally "dumb": every label is pre-resolved by the
 * caller via its own `ui()` (so each domain keeps its own i18n keys/wording),
 * and only the item list is computed here from `reconciled`/`hasTransaction`/`posted`.
 * `hasTransaction` (Conciliación/Transacción/Asiento all being independent
 * effects) is optional — Movimientos omits it (the transaction IS the record
 * being confirmed, so reverting "a" transaction is redundant there), while
 * Cobros/Pagos passes it (reactivating/deleting a deposited payment reverts
 * its own separate, associated financial-account movement).
 *
 * <p>Callers whose effects don't map onto the Conciliación/Transacción/Asiento triad (e.g. the
 * bank-reconciliation Desconciliar / Reactivar dialog) can pass the ready-made {@code items} list
 * instead and skip the flags entirely; it takes precedence when provided.
 *
 * @param {{
 *   reconciled?: boolean,
 *   posted?: boolean,
 *   hasTransaction?: boolean,
 *   title: string,
 *   sub: string,
 *   confirmLabel: string,
 *   cancelLabel: string,
 *   warning: string,
 *   itemConciliacion?: [string, string],
 *   itemAsiento?: [string, string],
 *   itemTransaccion?: [string, string],
 *   items?: Array<[string, string]>,
 *   confirmIcon?: import('react').ReactNode,
 *   onConfirm: () => Promise<void> | void,
 *   onClose: () => void,
 *   testIdPrefix?: string,
 * }} props
 */
export default function LifecycleConfirmModal({
  reconciled, posted, hasTransaction, title, sub, confirmLabel, cancelLabel, warning,
  itemConciliacion, itemAsiento, itemTransaccion, items: explicitItems, confirmIcon = null,
  onConfirm, onClose, testIdPrefix = 'lifecycle-confirm', tone = 'destructive', children = null,
  confirmDisabled = false,
}) {
  // `destructive` is the default because every original caller undoes something. `warning` is for a
  // blocking prompt whose confirm BUILDS something (configure and continue): the heading still
  // signals "stop and read", but a red confirm button would tell the user the save is dangerous.
  const accent = tone === 'warning' ? 'var(--status-warning-fg)' : 'var(--status-destructive-fg)';
  const confirmBg = tone === 'warning' ? 'hsl(var(--text-primary))' : 'var(--status-destructive-fg)';
  // The heading stays plain text in the `warning` tone. Colouring it amber put a third warning
  // signal on a dialog that already has the amber strip and the amber consequence icons, and the
  // heading is a plain statement of fact ("no accounting account configured"), not the alarm. The
  // destructive tone keeps its red heading: there the title IS the alarm.
  const titleColor = tone === 'warning' ? 'hsl(var(--text-primary))' : accent;
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  let items = explicitItems;
  if (!items) {
    items = [];
    if (reconciled && itemConciliacion) items.push(itemConciliacion);
    if (hasTransaction && itemTransaccion) items.push(itemTransaccion);
    if (posted && itemAsiento) items.push(itemAsiento);
  }

  // Portal to <body> so the overlay covers the whole viewport (incl. the left sidebar), escaping
  // any transformed/overflow ancestor that would otherwise clip a `position: fixed` layer.
  //
  // The scrim deliberately sits ABOVE any dialog already on screen (z-index 500 vs the shadcn
  // dialog layer's 50), so a parent modal is dimmed behind this cartel — matching what a nested
  // shadcn dialog does. It uses `--scrim`, the same neutral black the shadcn `DialogOverlay` uses,
  // at the same 30% opacity: the app's other overlay token (`--foreground`) is navy, and against a
  // plain confirm dialog opened from the same flow that difference reads as a colour shift.
  //
  // `pointerEvents: 'auto'` is required when this cartel is opened from inside a Radix dialog
  // (e.g. the financial-account edit modal): Radix locks the page by setting
  // `pointer-events: none` on <body> while its own dialog is open, which this portal would
  // otherwise inherit — leaving the cartel visible but unclickable. It is a no-op everywhere else.
  return createPortal((
    <div
      style={{ position: 'fixed', inset: 0, background: 'hsl(var(--scrim) / 0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24, pointerEvents: 'auto' }}
      data-testid={`${testIdPrefix}-modal`}
    >
      <div style={{ width: 520, maxWidth: '100%', background: 'hsl(var(--card))', borderRadius: 14, boxShadow: '0 24px 60px hsl(var(--foreground) / 0.28)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '22px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <h3 style={{ margin: 0, font: '700 18px/24px Inter', color: titleColor }}>{title}</h3>
            <div style={{ font: '400 13px/19px Inter', color: 'hsl(var(--text-disabled))', marginTop: 6 }}>{sub}</div>
          </div>
          <button
            onClick={onClose}
            data-testid={`${testIdPrefix}-close`}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid hsl(var(--border-control))', background: 'hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-secondary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '4px 24px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {items.map(([t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Anchored to the FIRST text line's 18px line box rather than to an eyeballed
                    margin, plus a 4px optical nudge down. Geometric centring alone still reads high:
                    the line box includes the ascender space above the caps, so its midpoint sits
                    above where the eye puts the text's centre of mass. The box keeps it stable if
                    the line height changes; the nudge is the deliberate optical correction. */}
                <span style={{ display: 'flex', alignItems: 'center', height: 18, marginTop: 4, flexShrink: 0 }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </span>
                <div>
                  <span style={{ font: '600 13px/18px Inter', color: 'hsl(var(--text-primary))' }}>{t}.</span>
                  <span style={{ font: '400 13px/18px Inter', color: 'hsl(var(--text-disabled))' }}> {d}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Caller-supplied content (a picker, a field) between the consequences and the warning.
              Absent for every confirm-only caller, so their layout is unchanged. */}
          {children && <div style={{ marginBottom: 16 }}>{children}</div>}

          {/* Yellow warning box */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--status-warning-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ font: '400 13px/18px Inter', color: 'var(--status-warning-fg)' }}>{warning}</span>
          </div>
        </div>

        {/* Footer. Kept on the card surface rather than `--muted`: that token is blue-tinted
            (hue 210), which read as an unintended colour shift next to the plain ConfirmDialog
            used for the lighter half of the same flows. The top border already separates the
            action bar from the body. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))' }}>
          <button
            onClick={onClose}
            data-testid={`${testIdPrefix}-cancel`}
            style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: '1px solid hsl(var(--border-control))', background: 'hsl(var(--card))', font: '500 14px/1 Inter', color: 'hsl(var(--text-primary))', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            disabled={loading || confirmDisabled}
            onClick={handleConfirm}
            data-testid={`${testIdPrefix}-accept`}
            style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: 0, background: (loading || confirmDisabled) ? 'hsl(var(--muted))' : confirmBg, font: '500 14px/1 Inter', color: (loading || confirmDisabled) ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))', cursor: (loading || confirmDisabled) ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {confirmIcon}
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
