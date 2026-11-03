import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

function ariaCheckedValue(dash, checked) {
  if (dash) return 'mixed';
  return checked ? 'true' : 'false';
}

/**
 * The automatch modal's checkbox control, shared by its header select-all, the per-group
 * checkboxes and the bounce-pair rows (ETP-5581), so they all look identical: a 16px box with
 * `rounded-[4px]`, dark when active, showing a check (rows) or a dash (header).
 *
 * `disabled` (ETP-5581) is for a row that cannot be checked here — an ambiguous bounce pair, whose
 * original has to be chosen in the reconciliation panel first. It renders the box greyed out and
 * ignores clicks; `ariaLabel` should then say why.
 *
 * @param {{ checked?: boolean, dash?: boolean, disabled?: boolean, onClick?: () => void,
 *   testId?: string, ariaLabel?: string }} props
 */
export function SelectBox({
  checked = false, dash = false, disabled = false, onClick, testId, ariaLabel,
}) {
  const active = !disabled && (checked || dash);
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={testId}
      aria-label={ariaLabel}
      title={disabled ? ariaLabel : undefined}
      aria-checked={ariaCheckedValue(dash, checked)}
      className={cn(
        'flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        active ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))]' : 'border-[hsl(var(--border-control))] bg-card',
      )}
    >
      {dash && <span className="h-[2px] w-2 rounded-full bg-card" />}
      {checked && !dash && <Check
        className="h-3 w-3 text-primary-foreground"
        strokeWidth={3}
        data-testid="Check__a89979" />}
    </button>
  );
}

export default SelectBox;
