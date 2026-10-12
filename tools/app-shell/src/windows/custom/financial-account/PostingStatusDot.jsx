import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { postedStatusTone } from '@/lib/postedStatus.js';
import { postedCode, postingStatusLabel } from './postingStatusLabel.js';

/**
 * Dot colour per tone. CSS variables, not the `TONE_STYLES` hex: the theme redefines them
 * under `.dark` (a light shade on a dark background), which a fixed hex would not follow.
 * Same mapping `DocumentStatusPill` uses for its tone icons.
 */
const DOT_COLOR = {
  success: 'var(--status-success-fg)',
  warning: 'var(--status-warning-fg)',
  destructive: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
};

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
        style={{ background: DOT_COLOR[tone] }}
      />
      {postingStatusLabel(code, ui)}
    </span>
  );
}
