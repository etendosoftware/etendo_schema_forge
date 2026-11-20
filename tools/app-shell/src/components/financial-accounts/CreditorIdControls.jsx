import { InfoTooltipButton } from '@/components/currency-summary/InfoTooltipButton.jsx';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** «Identificador del acreedor» with its short help tooltip (what it is, and that the bank assigns it). */
export function CreditorIdLabel({ ui, htmlFor, className, testId = 'creditor-id' }) {
  const tip = ui('sepaCreditorIdInfo');
  return (
    <Label htmlFor={htmlFor} className={cn('inline-flex items-center gap-1', className)} data-testid={`${testId}-label`}>
      {ui('sepaCreditorId')}
      <InfoTooltipButton label={tip} testId={`${testId}-info`} contentTestId={`${testId}-info-tooltip`} data-testid="InfoTooltipButton__creditor-id" />
    </Label>
  );
}

// Same class string as the Edit-account modal's FIELD_INPUT (name, IBAN, BIC): the shared Input defaults to a grey fill.
const ACCOUNT_FORM_INPUT = 'bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]';

/**
 * The creditor id as a plain form field (Edit-account modal): an input with the same neutral placeholder
 * style as BIC/SWIFT and, when `errorKey` is set, the translated inline error below it. It owns neither
 * the value nor a save button: the form that hosts it validates (`creditorIdErrorKey`) and persists
 * with its own «Guardar cambios».
 */
export function CreditorIdField({ ui, value, onChange, errorKey = null, disabled = false, testId = 'creditor-id' }) {
  return (
    <div className="min-w-0 flex-1" data-testid={`${testId}-field`}>
      <Input
        id={`${testId}-input`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ui('sepaCreditorIdPlaceholder')}
        maxLength={50}
        aria-invalid={errorKey ? 'true' : undefined}
        aria-describedby={errorKey ? `${testId}-error` : undefined}
        disabled={disabled}
        className={cn(ACCOUNT_FORM_INPUT, 'tabular-nums', errorKey && 'border-destructive')}
        data-testid={`${testId}-input`} />
      {errorKey && (
        <p id={`${testId}-error`} className="pt-1 text-xs text-destructive" data-testid={`${testId}-error`}>{ui(errorKey)}</p>
      )}
    </div>
  );
}
