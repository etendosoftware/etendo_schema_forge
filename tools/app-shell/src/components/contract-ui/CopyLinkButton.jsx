import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { useCopyLinkAction } from '@/hooks/useCopyLinkAction';

export default function CopyLinkButton({ selectedRows, windowName, selectionBarSize = 'sm' }) {
  const ui = useUI();
  const { visible, iconSizeClass, onCopyLink } = useCopyLinkAction({ selectedRows, windowName, selectionBarSize });

  if (!visible) return null;

  return (
    <TooltipProvider data-testid="TooltipProvider__CopyLinkButton">
      <Tooltip delayDuration={150} data-testid="Tooltip__CopyLinkButton">
        <TooltipTrigger asChild data-testid="TooltipTrigger__CopyLinkButton">
          <Button
            variant="outline"
            size={selectionBarSize}
            className="order-first gap-1.5"
            onClick={onCopyLink}
            aria-label={ui('copyLink')}
            data-testid="CopyLinkButton">
            <Link2 className={iconSizeClass} data-testid="CopyLinkButton__icon" />
          </Button>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__CopyLinkButton">{ui('copyLink')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
