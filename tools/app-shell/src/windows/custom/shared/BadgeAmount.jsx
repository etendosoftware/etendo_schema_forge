import { TruncatedText } from '@/components/ui/truncated-text';
import { cn } from '@/lib/utils';

/**
 * Width policy for an amount shown inside a topbar status chip (e.g. "A favor 1.452,00 €" next to
 * Save on the sales and purchase invoice headers).
 *
 * ETP-5729 (CP-14): the amount used to sit in a FIXED `w-[72px]` box, which clipped a 4-digit
 * balance in the Spanish format ("1.452,0…"). The box is now content-sized up to a MAX width:
 * short amounts take only the room they need, and up to 7 integer digits plus decimals and the
 * currency symbol ("1.234.567,00 €") fit in full at the chip's text-sm tabular figures. Anything
 * longer still ellipsises, and TruncatedText reveals the full value in a tooltip.
 *
 * Topbar chips only. List-column badges keep their fixed width on purpose: there the box keeps
 * the amounts aligned row to row.
 */
export const BADGE_AMOUNT_CLASS = 'w-auto max-w-[8.5rem] shrink-0 text-left tabular-nums';

export default function BadgeAmount({ text, className, 'data-testid': testId }) {
  return (
    <TruncatedText
      text={text}
      className={cn(BADGE_AMOUNT_CLASS, className)}
      data-testid={testId} />
  );
}
