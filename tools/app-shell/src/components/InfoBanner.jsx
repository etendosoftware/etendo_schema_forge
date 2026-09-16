import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Generic, reusable notice banner.
 *
 * A left-accented, dismissible strip used to explain context to the user (e.g. "rules are
 * evaluated by ascending priority"). Tone-driven colors keep it consistent across windows; pass a
 * different `tone` to recolor.
 *
 * DISMISSAL — two modes, picked by whether `onDismiss` is supplied:
 *
 *  - UNCONTROLLED (no `onDismiss`, the default): the banner owns its own "closed" state and hides
 *    itself when the X is clicked. This is what makes `dismissible` safe to default to `true`
 *    (ETP-5245): before, the flag only rendered a button and left the hiding to the caller, so
 *    flipping the default would have given every existing banner an X that did nothing.
 *  - CONTROLLED (`onDismiss` supplied): unchanged behaviour — the click is forwarded and the
 *    caller decides whether to keep rendering the banner. `ListModalWindow` relies on this.
 *
 * REOPENING (`reopenSignal`) — a banner that explains why an action is refused must not stay
 * closed while the user keeps hitting that refusal. Pass any value that CHANGES on each fresh
 * refusal (see `hooks/useSaveBlockSignal.js`, which returns a counter keyed by the save gate's
 * stable toast id) and an uncontrolled banner re-opens itself. Dismissal is remembered as "closed
 * at THIS signal value", so a new value un-dismisses without any effect or extra render pass.
 * Controlled banners ignore it — their caller already owns visibility.
 *
 * Props:
 *  - children:      banner content (already-resolved text or nodes)
 *  - tone:          'info' (default) | 'warning' | 'success' | 'danger'
 *  - icon:          lucide icon component (defaults to Info; pass null to hide)
 *  - dismissible:   renders the close button (default true; pass false for a banner that must
 *                   never be closed, e.g. one that IS the whole body of its container)
 *  - onDismiss:     click handler; supplying it switches the banner to controlled mode
 *  - reopenSignal:  changing value that un-dismisses an uncontrolled banner
 *  - dismissTestId: data-testid for the close button (default 'info-banner-dismiss')
 *  - className:     extra classes merged onto the container (e.g. margins)
 */

/**
 * "Never dismissed" marker. A plain `null`/`undefined` would be ambiguous, because those are
 * legitimate `reopenSignal` values that a dismissal must be able to record.
 */
const NOT_DISMISSED = Symbol('info-banner-not-dismissed');
const TONES = {
  info: { container: 'border-status-info-border bg-status-info', icon: 'text-status-info-foreground', text: 'text-status-info-foreground', dismiss: 'text-status-info-foreground hover:bg-status-info-border/20' },
  warning: { container: 'border-status-warning-border bg-status-warning', icon: 'text-status-warning-foreground', text: 'text-status-warning-foreground', dismiss: 'text-status-warning-foreground hover:bg-status-warning-border/20' },
  success: { container: 'border-status-success-border bg-status-success', icon: 'text-status-success-foreground', text: 'text-status-success-foreground', dismiss: 'text-status-success-foreground hover:bg-status-success-border/20' },
  danger: { container: 'border-destructive bg-destructive/10', icon: 'text-destructive', text: 'text-destructive', dismiss: 'text-destructive hover:bg-destructive/10' },
};

export function InfoBanner({
  children,
  tone = 'info',
  icon: Icon = Info,
  dismissible = true,
  onDismiss,
  reopenSignal,
  dismissTestId = 'info-banner-dismiss',
  className = '',
  ...rest
}) {
  const ui = useUI();
  const [dismissedAt, setDismissedAt] = useState(NOT_DISMISSED);
  const isControlled = typeof onDismiss === 'function';
  const t = TONES[tone] ?? TONES.info;
  // Uncontrolled only: still closed while the signal is the one it was closed at.
  if (!isControlled && dismissedAt !== NOT_DISMISSED && Object.is(dismissedAt, reopenSignal)) return null;
  const handleDismiss = isControlled ? onDismiss : () => setDismissedAt(reopenSignal);
  return (
    <div
      className={`flex min-h-14 items-center gap-3 rounded-[0_8px_8px_0] border-l-2 px-4 py-2 ${t.container} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={`h-5 w-5 shrink-0 ${t.icon}`} data-testid="Icon__f7c55d" />}
      <p className={`flex-1 text-sm font-medium leading-6 ${t.text}`}>{children}</p>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={ui('dismiss')}
          data-testid={dismissTestId}
          className={`rounded-full p-1 transition-colors ${t.dismiss}`}
        >
          <X className="h-4 w-4" data-testid="X__f7c55d" />
        </button>
      )}
    </div>
  );
}

export default InfoBanner;
