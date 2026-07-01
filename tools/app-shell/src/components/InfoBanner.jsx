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
  info: { container: 'border-[#00ACFF] bg-[#F0FAFF]', icon: 'text-[#00ACFF]', text: 'text-[#0075AD]', dismiss: 'text-[#0075AD] hover:bg-[#00ACFF]/10' },
  warning: { container: 'border-[#F5A623] bg-[#FFF8EC]', icon: 'text-[#F5A623]', text: 'text-[#9A6700]', dismiss: 'text-[#9A6700] hover:bg-[#F5A623]/10' },
  success: { container: 'border-[#2BB673] bg-[#EEFBF4]', icon: 'text-[#2BB673]', text: 'text-[#1A7F4B]', dismiss: 'text-[#1A7F4B] hover:bg-[#2BB673]/10' },
  danger: { container: 'border-[#E5484D] bg-[#FFF0F0]', icon: 'text-[#E5484D]', text: 'text-[#C62828]', dismiss: 'text-[#C62828] hover:bg-[#E5484D]/10' },
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
