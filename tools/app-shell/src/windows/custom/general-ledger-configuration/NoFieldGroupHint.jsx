import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';

/**
 * NoFieldGroupHint — placeholder marker for Valores por defecto fields that
 * have NO `AD_FieldGroup` assigned on `AD_Field` (window 125 / tab 252). These
 * fields ARE backed by a real column and DO persist — unlike `UnbackedHint`,
 * which flags non-functional placeholders — they are simply grouped here
 * pragmatically next to their closest sibling section for lack of an AD
 * signal. This is a temporary marker asking the product owner to confirm
 * where each of these accounts should live; it is not a bug indicator.
 */
export default function NoFieldGroupHint() {
  const ui = useUI();
  return (
    <span className="inline-flex items-center text-[#6C6C89]" data-testid="glc-no-fieldgroup-hint">
      <TooltipProvider data-testid="TooltipProvider__9a1c4e">
        <Tooltip data-testid="Tooltip__9a1c4e">
          <TooltipTrigger asChild data-testid="TooltipTrigger__9a1c4e">
            <span className="inline-flex items-center" tabIndex={0} aria-label={ui('glc.noFieldGroup.tooltip')}>
              <HelpCircle size={13} className="text-[#6C6C89]" data-testid="HelpCircle__9a1c4e" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs" data-testid="TooltipContent__9a1c4e">{ui('glc.noFieldGroup.tooltip')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
