import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';
import { postedStatusTone } from '@/lib/postedStatus.js';
import { postedCode, postingStatusLabel } from './postingStatusLabel.js';

/**
 * Small dot + label indicating the accounting posting status of a movement. Reads the `posted`
 * field (as returned by the backend FinancialAccountTransactionsHandler and updated by the
 * /action/post endpoint) — NOT `paymentStatus` (a reconciliation-related search key like RPPC),
 * which never changes when a document is posted.
 *
 * The dot colour comes from the shared posting-status registry (`postedStatusTone`), the one
 * colour source for posting statuses everywhere (ETP-5647).
 *
 * @param {{ posted?: string; className?: string }} props
 */
export function PostingStatusDot({ posted, className }) {
  const ui = useUI();
  const code = postedCode(posted);
  const tone = postedStatusTone(code);

  return (
    <span
      data-tone={tone}
      className={cn('inline-flex items-center gap-1 text-xs leading-4 text-[hsl(var(--foreground))]', className)}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: TONE_STYLES[tone].color }}
      />
      {postingStatusLabel(code, ui)}
    </span>
  );
}
