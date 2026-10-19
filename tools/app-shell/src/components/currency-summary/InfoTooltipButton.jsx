import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Round (i) button whose hover tooltip explains a summary figure. Shared by the Cuentas
 * "Saldo" header and the Receipts / Payments sidebar header (ETP-5778).
 *
 * @param {object} props
 * @param {string} props.label - already-translated text: the aria-label and, unless `content` is given, the tooltip body
 * @param {string} [props.content] - tooltip body when it differs from the aria-label
 * @param {string} [props.testId='balance-info-button']
 * @param {string} [props.contentTestId='balance-info-tooltip']
 */
export function InfoTooltipButton({
  label,
  content,
  testId = 'balance-info-button',
  contentTestId = 'balance-info-tooltip',
}) {
  return (
    <TooltipProvider data-testid="TooltipProvider__5d6a4a">
      <Tooltip delayDuration={150} data-testid="Tooltip__5d6a4a">
        <TooltipTrigger asChild data-testid="TooltipTrigger__5d6a4a">
          <button
            type="button"
            aria-label={label}
            data-testid={testId}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))]"
          >
            <Info className="h-4 w-4" data-testid="Info__5d6a4a" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]" data-testid={contentTestId}>
          {content ?? label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
