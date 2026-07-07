import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Small dot + label indicating whether a movement has been posted to
 * accounting. Reads the `posted` field ('Y'/'N', as returned by the backend
 * FinancialAccountTransactionsHandler and updated by the /action/post
 * endpoint) — NOT `paymentStatus` (a reconciliation-related search key like
 * RPPC), which never changes when a document is posted.
 *
 * @param {{ posted: string; className?: string }} props
 */
export function PostingStatusDot({ posted, className }) {
  const ui = useUI();
  const isPosted = posted === 'Y';

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs leading-4 text-[#121217]', className)}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          isPosted ? 'bg-[#26a95f]' : 'bg-[#E68A00]',
        )}
      />
      {isPosted ? ui('financeAccountMovementsPosted') : ui('financeAccountMovementsNotPosted')}
    </span>
  );
}
