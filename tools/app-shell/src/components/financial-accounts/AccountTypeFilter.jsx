import { ChevronDown, Check, Landmark, Wallet, CreditCard, Building2, Archive } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE } from './tokens';

const ALL = 'ALL';
// Cross-type view that lists every archived (inactive) account regardless of type.
const INACTIVE = 'INACTIVE';

function useTypeOptions() {
  const ui = useUI();
  return [
    { value: ALL, label: ui('financeAccountsFilterAll'), Icon: Building2 },
    { value: ACCOUNT_TYPE.BANK, label: ui('financeAccountsTypeBank'), Icon: Landmark },
    { value: ACCOUNT_TYPE.CASH, label: ui('financeAccountsTypeCash'), Icon: Wallet },
    { value: ACCOUNT_TYPE.CARD, label: ui('financeAccountsTypeCard'), Icon: CreditCard },
    { value: INACTIVE, label: ui('financeAccountsFilterInactive'), Icon: Archive, divider: true },
  ];
}

export function AccountTypeFilter({ value, onChange }) {
  const ui = useUI();
  const options = useTypeOptions();
  const current = value ?? ALL;
  const active = options.find((opt) => opt.value === current) ?? options[0];

  return (
    <Popover data-testid="Popover__f795e3">
      <PopoverTrigger asChild data-testid="PopoverTrigger__f795e3">
        <button
          type="button"
          data-testid="account-type-filter-trigger"
          className="inline-flex h-9 w-[181px] items-center justify-between gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-normal leading-6 text-muted-foreground transition-colors hover:bg-[#F5F7F9]"
        >
          <span className="truncate text-left">{active.label}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            data-testid="ChevronDown__f795e3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" data-testid="PopoverContent__f795e3">
        <div role="listbox" aria-label={ui('financeAccountsFilterAll')}>
          {options.map((opt) => {
            const selected = opt.value === current;
            return (
              <div key={opt.value}>
                {opt.divider ? <div className="my-1 h-px bg-[#E8EAEF]" aria-hidden="true" /> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange?.(opt.value === ALL ? null : opt.value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    'hover:bg-[#f5f7f9]',
                    selected ? 'font-semibold text-[#121217]' : 'text-[#3f3f50]',
                  )}
                  data-testid={`account-type-filter-option-${opt.value.toLowerCase()}`}
                >
                  <opt.Icon className="h-4 w-4 text-[#6c6c89]" />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {selected ? <Check className="h-4 w-4 text-[#121217]" data-testid="Check__f795e3" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

AccountTypeFilter.ALL = ALL;
AccountTypeFilter.INACTIVE = INACTIVE;
