import React from 'react';
import { Clock } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';

/**
 * Small, generic freshness indicator for stored-computed columns (EPL-1807).
 *
 * These columns are materialized on the record and refreshed out-of-band by the
 * background queue drain, so the displayed value can lag reality by a few minutes.
 * A muted clock icon + tooltip tells the user this unobtrusively.
 *
 * Renders nothing unless `computed?.mode === 'stored'`, so it is safe to drop
 * next to any label — non-computed columns cost nothing. The tooltip wording is
 * picked from `computed.refresh`: `manual` → refreshed manually; everything else
 * (`queued` / `synchronous`) → the "background, a few minutes" wording.
 *
 * Accessibility: the trigger is a keyboard-focusable span with an aria-label so
 * the hint is reachable by keyboard and screen readers, not mouse-only.
 */
export function ComputedFreshnessHint({ computed }) {
  const ui = useUI();
  if (computed?.mode !== 'stored') return null;
  // Synchronous stored columns are recomputed in the same transaction that
  // writes their dependencies -> never stale -> no freshness indicator. Only
  // deferred refreshes (queued drain, manual) can lag, so only those get a clock.
  if (computed.refresh === 'synchronous') return null;
  const key = computed.refresh === 'manual'
    ? 'computedFreshnessManual'
    : 'computedFreshnessQueued';
  return (
    <TooltipProvider data-testid="TooltipProvider__2a800a">
      <Tooltip delayDuration={150} data-testid="Tooltip__2a800a">
        <TooltipTrigger asChild data-testid="TooltipTrigger__2a800a">
          <span
            tabIndex={0}
            aria-label={ui('computedFreshnessAria')}
            className="inline-flex items-center cursor-help text-muted-foreground"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" data-testid="Clock__2a800a" />
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__2a800a">{ui(key)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ComputedFreshnessHint;
