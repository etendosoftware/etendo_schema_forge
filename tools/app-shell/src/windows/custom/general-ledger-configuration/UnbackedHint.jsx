import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';

/**
 * UnbackedHint — the consistent "non-functional placeholder" marker used across
 * the General Ledger Configuration window for fields that have NO AD column and
 * therefore do not persist (Tipo de conversión, Precisión de costes, Conciliación
 * automática, Numeración de asientos — see figma-spec.md "Field data-binding
 * treatment"). It must make the non-persistence obvious to a developer/QA without
 * alarming an end user, so it is a subtle amber info-icon + short helper text.
 *
 * Window-specific on purpose: it encodes THIS window's design decision for unbacked
 * placeholders. If a second window ever needs the same affordance, promote it then.
 *
 * @param {object} props
 * @param {boolean} [props.withText] — also render the inline helper text (used on
 *   the placeholder selects, where there is room). Toggles are tighter, so they
 *   pass only the icon.
 */
export default function UnbackedHint({ withText = false }) {
  const ui = useUI();
  return (
    <span className="inline-flex items-center gap-1 text-[#B7791F]" data-testid="glc-unbacked-hint">
      <TooltipProvider data-testid="TooltipProvider__4308b0">
        <Tooltip data-testid="Tooltip__4308b0">
          <TooltipTrigger asChild data-testid="TooltipTrigger__4308b0">
            <span className="inline-flex items-center" tabIndex={0} aria-label={ui('glc.unbacked.tooltip')}>
              <Info size={13} className="text-[#B7791F]" data-testid="Info__4308b0" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] text-xs" data-testid="TooltipContent__4308b0">{ui('glc.unbacked.tooltip')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {withText && <span className="text-[11px] font-normal">{ui('glc.unbacked.label')}</span>}
    </span>
  );
}
