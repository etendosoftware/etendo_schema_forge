import { useLocaleSwitch, useUI } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { formatRelativeTime } from '@/lib/relativeTime.js';
import { formatDateTime } from '@/lib/formatDateTime.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * "<prefix> hace X" label for the last successful bank statement sync (ETP-5582).
 *
 * `prefixKey` is an i18n key whose text contains `{time}` (e.g. `financeAccountsSyncedAgo`).
 * The tooltip shows the absolute `dd/mm/aaaa hh:mm`. Without a date it renders "Nunca sincronizada".
 * Every instance shares one 30 s tick (see useNow), so the relative text advances by itself.
 */
export function LastSyncLabel({ date, prefixKey, className, 'data-testid': testId = 'last-sync-label' }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const now = useNow();

  const relative = formatRelativeTime(date, locale, now);
  if (!relative) {
    return <span className={className} data-testid={testId}>{ui('financeAccountsNeverSynced')}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200} data-testid="Tooltip__e09e5a">
        <TooltipTrigger asChild data-testid="TooltipTrigger__e09e5a">
          <span className={className} data-testid={testId}>{ui(prefixKey, { time: relative })}</span>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__e09e5a">
          {formatDateTime(date, locale)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
