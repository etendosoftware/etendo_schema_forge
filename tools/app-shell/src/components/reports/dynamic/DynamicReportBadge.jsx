import { Sparkles } from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';

/** Card ring + glow for a report that opens the interactive view (ETP-6080). */
export const DYNAMIC_REPORT_CARD_CLASS = 'border-primary/40 ring-1 ring-primary/20 shadow-md shadow-primary/20';

/**
 * Sparkle mark on the catalog card (top-right corner) and list row of a report with an interactive
 * view; the tooltip names it. Carries its own provider so it works in any tree (as TruncatedText).
 */
export default function DynamicReportBadge({ className }) {
  const ui = useUI();
  const label = `${ui('dynamicReportBadge')}: ${ui('dynamicReportBadgeHint')}`;
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span
            className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary shrink-0', className)}
            aria-label={label}
            data-testid="DynamicReportBadge"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
