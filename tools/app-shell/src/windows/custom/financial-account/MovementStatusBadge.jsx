import { useUI } from '@/i18n';
import { MOVEMENT_STATUS_TONE } from '@/components/financial-accounts/tokens';
import { cn } from '@/lib/utils';
import { MOVEMENT_STATUS_CONFIG, DRAFT } from './movementStatusConfig';

/**
 * Renders a colored badge for a movement.
 *
 * When `processed === false` the movement is a **Draft** (Borrador) regardless of
 * its raw status code — a reactivated transaction keeps RPR/PPM but is a Draft
 * again — so that takes precedence over the status-code mapping.
 *
 * @param {{ status: string; processed?: boolean; className?: string }} props
 */
export function MovementStatusBadge({ status, processed, className }) {
  const ui = useUI();
  const config = processed === false ? DRAFT : MOVEMENT_STATUS_CONFIG[status];
  if (!config) return null;

  const tone = MOVEMENT_STATUS_TONE[config.family];
  if (!tone) return null;

  const label = ui(config.labelKey);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: tone.bg, color: tone.text }}
    >
      {label}
    </span>
  );
}
