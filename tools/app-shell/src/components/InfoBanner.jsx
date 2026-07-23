import { Info, X } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Generic, reusable notice banner.
 *
 * A left-accented, optionally dismissible strip used to explain context to the
 * user (e.g. "rules are evaluated by ascending priority"). Tone-driven colors
 * keep it consistent across windows; pass a different `tone` to recolor.
 *
 * Used by ListModalWindow (and any other window that needs an inline notice).
 *
 * Props:
 *  - children:      banner content (already-resolved text or nodes)
 *  - tone:          'info' (default) | 'warning' | 'success' | 'danger'
 *  - icon:          lucide icon component (defaults to Info; pass null to hide)
 *  - dismissible:   when true, renders a close button (controlled via onDismiss)
 *  - onDismiss:     click handler for the close button
 *  - dismissTestId: data-testid for the close button (default 'info-banner-dismiss')
 *  - className:     extra classes merged onto the container (e.g. margins)
 */
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
  dismissible = false,
  onDismiss,
  dismissTestId = 'info-banner-dismiss',
  className = '',
  ...rest
}) {
  const ui = useUI();
  const t = TONES[tone] ?? TONES.info;
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
          onClick={onDismiss}
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
