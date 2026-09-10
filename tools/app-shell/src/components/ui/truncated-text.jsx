import { useCallback, useRef, useState } from 'react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A single line of text that ellipsises when it does not fit, and reveals the full string in a
 * tooltip when — and only when — it was actually clipped.
 *
 * WHY THE MEASUREMENT. Rendering the tooltip unconditionally would fire on every short label too,
 * repeating text the reader can already see; that is noise, not help. So the trigger is
 * controlled: Radix asks to open on hover/focus and this component only honours the request when
 * `scrollWidth > clientWidth`, i.e. when there is hidden text to reveal. The 1px slack absorbs
 * sub-pixel rounding, which otherwise makes a text that fits exactly report as overflowing.
 *
 * WHY IT CARRIES ITS OWN PROVIDER. Same reasoning as CopyLinkButton: the component must work in
 * any tree, not only under a window that happens to mount a `TooltipProvider`. Nesting providers
 * is supported by Radix, so a caller that already has one costs nothing.
 *
 * NOTE ON LAYOUT. `truncate` only ellipsises when an ancestor bounds the width. Inside a table
 * that means the table needs `table-fixed` (an auto-layout table grows to fit its content
 * instead, and the row simply overflows the panel) — see `PanelTable` in
 * ReconciliationSplitPanel.jsx.
 *
 * @param {object} props
 * @param {React.ReactNode} props.text the string to render; also the tooltip body
 * @param {string} [props.className] classes merged onto the text span
 * @param {number} [props.delayDuration] Radix hover delay, ms
 */
export function TruncatedText({ text, className, delayDuration = 200, 'data-testid': testId }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback((next) => {
    if (!next) {
      setOpen(false);
      return;
    }
    const el = ref.current;
    setOpen(!!el && el.scrollWidth > el.clientWidth + 1);
  }, []);

  return (
    <TooltipProvider data-testid="TooltipProvider__TruncatedText">
      <Tooltip
        open={open}
        onOpenChange={handleOpenChange}
        delayDuration={delayDuration}
        data-testid="Tooltip__TruncatedText">
        <TooltipTrigger asChild data-testid="TooltipTrigger__TruncatedText">
          <span ref={ref} className={cn('block w-full truncate', className)} data-testid={testId}>
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-sm whitespace-normal break-words"
          data-testid={testId ? `${testId}-tooltip` : 'TruncatedText__tooltip'}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TruncatedText;
