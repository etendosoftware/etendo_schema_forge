import { ArrowDownUp, Landmark } from 'lucide-react';

/**
 * ETP-6154 — the icon of every PSD2 bank-sync entry point (list row button, row kebab item,
 * Imported statements toolbar, Edit account modal): a bank (`Landmark`, the glyph this window
 * already uses for the bank connection) with a small up/down-arrows badge in its bottom-right
 * corner. It replaces the generic `RefreshCw`, which read as "reload the screen" and looked the
 * same as the toolbar refresh button sitting next to it.
 *
 * While a sync runs (`spinning`) only the badge turns, so the bank stays legible.
 *
 * Purely decorative (`aria-hidden`): the button that hosts it carries the accessible label.
 *
 * @param {{
 *   spinning?: boolean,
 *   className?: string,
 *   badgeClassName?: string,
 *   'data-testid'?: string,
 * }} props `className` sizes the whole icon (rows use `h-5 w-5`, the modal `h-4 w-4`) and may set
 *   its color; `badgeClassName` is the badge's backdrop, which has to match the surface it sits
 *   on so the badge reads as cut out of the bank (`bg-card` by default; a primary button passes
 *   `bg-primary`)
 */
export function BankSyncIcon({
  spinning = false,
  className = 'h-5 w-5',
  badgeClassName = 'bg-card',
  'data-testid': testId = 'bank-sync-icon',
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      data-spinning={spinning ? 'true' : 'false'}
      className={`relative inline-flex shrink-0 ${className}`}
    >
      <Landmark className="h-full w-full" aria-hidden="true" data-testid="Landmark__banksync" />
      <span
        className={`absolute -bottom-[2px] -right-[3px] inline-flex h-[60%] w-[60%] items-center justify-center rounded-full p-[1px] ${badgeClassName}`}
      >
        <ArrowDownUp
          className={`h-full w-full ${spinning ? 'animate-spin' : ''}`}
          strokeWidth={2.5}
          aria-hidden="true"
          data-testid="ArrowDownUp__banksync" />
      </span>
    </span>
  );
}
