import { Link2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { useCopyRecordLinkAction } from '@/hooks/useCopyLinkAction';

export default function CopyRecordLinkButton({ recordId, windowName }) {
  const ui = useUI();
  const { visible, onCopyLink } = useCopyRecordLinkAction({ recordId, windowName });

  if (!visible) return null;

  return (
    <TooltipProvider data-testid="TooltipProvider__CopyRecordLinkButton">
      <Tooltip delayDuration={150} data-testid="Tooltip__CopyRecordLinkButton">
        <TooltipTrigger asChild data-testid="TooltipTrigger__CopyRecordLinkButton">
          <button
            type="button"
            onClick={onCopyLink}
            aria-label={ui('copyLink')}
            data-testid="CopyRecordLinkButton"
            className="flex items-center justify-center p-[7px] rounded-md bg-card border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_0px_hsl(var(--foreground))0D] text-muted-foreground hover:bg-[hsl(var(--muted))] hover:text-foreground transition-colors">
            <Link2 className="h-[15px] w-[15px]" data-testid="CopyRecordLinkButton__icon" />
          </button>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__CopyRecordLinkButton">{ui('copyLink')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
