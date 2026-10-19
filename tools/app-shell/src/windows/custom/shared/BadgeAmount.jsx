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
// Sizes to its content up to 8.5rem. min-w-0 + shrink let the amount give up width when the
// topbar runs out of room (TruncatedText then ellipsizes and shows the full value in a tooltip).
export const BADGE_AMOUNT_CLASS = 'w-auto max-w-[8.5rem] min-w-0 shrink text-left tabular-nums';

// Classes for the chip that wraps a BadgeAmount in a topbar (ETP-5729 CP-14). min-w-0 lets the
// chip shrink below its content; the high shrink weight makes it absorb the topbar's overflow
// before the neighbouring fixed-size buttons do; nowrap keeps the label on one line.
export const BADGE_CHIP_FIT_CLASS = 'min-w-0 shrink-[999] whitespace-nowrap';

export default function BadgeAmount({ text, className, 'data-testid': testId }) {
  return (
    <TruncatedText
      text={text}
      className={cn(BADGE_AMOUNT_CLASS, className)}
      data-testid={testId} />
  );
}
