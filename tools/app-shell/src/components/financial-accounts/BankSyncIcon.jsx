import { FileDown } from 'lucide-react';

/** The bob, as an arbitrary Tailwind animation so the `motion-reduce:` variant applies to it. */
const BOB_CLASS = 'animate-[bank-sync-bob_1s_ease-in-out_infinite] motion-reduce:animate-none';

/**
 * ETP-6154 — the icon of every PSD2 "traer extractos" entry point (list row button, row kebab
 * item, Imported statements toolbar, Edit account modal button) and of the in-progress pill and
 * banner: lucide `FileDown`, a document with a down arrow — "bring the statements in from the bank".
 *
 * Deliberately NOT circular arrows (every window's refresh button) nor up/down arrows (the list's
 * sort control): the first version, a bank with an `ArrowDownUp` badge, read as "sort".
 *
 * `spinning` keeps its name so callers stay as they were, but the motion is a gentle vertical
 * bob (±2px, 1 s, ease-in-out, looping), not a rotation. The keyframes (`bank-sync-bob`) live in
 * `src/index.css`; `motion-reduce:animate-none` stops it for users who ask for reduced motion.
 *
 * Purely decorative (`aria-hidden`): the button that hosts it carries the accessible label.
 *
 * @param {{
 *   spinning?: boolean,
 *   className?: string,
 *   'data-testid'?: string,
 * }} props `spinning` = a fetch is in progress (the icon bobs); `className` sizes the icon (rows
 *   use `h-5 w-5`, the modal `h-4 w-4`, the pill `h-3 w-3`) and may set its color; `data-spinning`
 *   on the root mirrors `spinning` for tests
 */
export function BankSyncIcon({
  spinning = false,
  className = 'h-5 w-5',
  'data-testid': testId = 'bank-sync-icon',
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      data-spinning={spinning ? 'true' : 'false'}
      className={`inline-flex shrink-0 ${className}`}
    >
      <FileDown
        className={`h-full w-full ${spinning ? BOB_CLASS : ''}`}
        aria-hidden="true"
        data-testid="FileDown__banksync" />
    </span>
  );
}
