import { ChevronDown, Calendar, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { useContactsFinance } from './ContactsFinanceContext';

const PERIOD_OPTIONS = [
  { value: '3M', labelKey: 'bpLast3Months' },
  { value: '6M', labelKey: 'bpLast6Months' },
];

// Keyboard focus and the open state share the same dark ring (Figma).
const TRIGGER_CLS = [
  'h-8 shrink-0 flex items-center gap-1 px-2.5 bg-card border border-border-control rounded-lg',
  'shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium text-text-primary whitespace-nowrap',
  'transition-colors hover:bg-muted focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
  'data-[state=open]:ring-2 data-[state=open]:ring-focus-ring data-[state=open]:ring-offset-1 data-[state=open]:ring-offset-card',
].join(' ');

// The core RadioItem draws its indicator on the left (first child span); the Figma
// design puts a Check on the right instead, so that span is hidden and the padding reset.
const OPTION_CLS = [
  'w-full justify-between gap-3 rounded-none px-3 pl-3 py-2 text-sm whitespace-nowrap text-text-primary cursor-pointer',
  '[&>span:first-child]:hidden focus:bg-muted focus:text-text-primary',
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
  'data-[state=checked]:bg-muted data-[state=checked]:font-medium',
].join(' ');

export default function ContactsPeriodButton() {
  const ui = useUI();
  const { period, setPeriod } = useContactsFinance();
  const selected = PERIOD_OPTIONS.find((o) => o.value === period) ?? PERIOD_OPTIONS[0];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={TRIGGER_CLS} data-testid="ContactsPeriodButton__trigger">
        <Calendar
          className="h-4 w-4 text-icon-secondary shrink-0"
          data-testid="Calendar__28b84a" />
        <span className="flex-1 text-left mx-1">{ui(selected.labelKey)}</span>
        <ChevronDown
          className="h-4 w-4 text-icon-secondary shrink-0"
          data-testid="ChevronDown__28b84a" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-[var(--radix-dropdown-menu-trigger-width)] p-0 py-1 rounded-lg border-border-control"
      >
        <DropdownMenuRadioGroup value={selected.value} onValueChange={setPeriod}>
          {PERIOD_OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value} className={OPTION_CLS}>
              <span>{ui(opt.labelKey)}</span>
              {opt.value === selected.value && (
                <Check
                  className="h-4 w-4 text-text-primary shrink-0"
                  data-testid="Check__28b84a" />
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
